var db = require('../connections');
var { getOpenAiClient, clampLimit } = require('./client');
var { formatDate, extractJsonResult } = require('./utils');

function normalizeString(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

async function getOrCreateCityId(connection, cityName) {
    var name = normalizeString(cityName);
    if (!name) {
        return null;
    }

    var selectResult = await connection.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    var rows = Array.isArray(selectResult) ? selectResult[0] : selectResult;
    if (rows && rows.length) {
        var row = rows[0];
        if (row && Object.prototype.hasOwnProperty.call(row, 'cityId')) {
            return row.cityId;
        }
    }

    var insertResult = await connection.query('INSERT INTO cities (city) VALUES (?)', [name]);
    if (Array.isArray(insertResult)) {
        return insertResult[0] && insertResult[0].insertId;
    }
    return insertResult.insertId;
}

function fetchPendingRestaurants(limit) {
    var sql = "SELECT r.restaurantId, r.name, r.address, r.zip, r.submitted, r.submittedBy, r.status, r.statusUpdated, r.statusUpdatedBy, c.city as cityName " +
        "FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId " +
        "WHERE r.status = 'pending' ORDER BY r.submitted DESC, r.restaurantId DESC LIMIT ?";
    return db.query(sql, [limit]).then(function (rows) {
        rows = rows || [];
        return rows.map(function (row) {
            return {
                restaurantId: row.restaurantId,
                name: row.name,
                address: row.address,
                city: row.cityName,
                zip: row.zip,
                submitted: row.submitted,
                submittedBy: row.submittedBy
            };
        });
    });
}

function buildUserPrompt(restaurants) {
    var lines = ['Here are newly submitted restaurants that need verification:', ''];
    restaurants.forEach(function (restaurant, index) {
        lines.push((index + 1) + '. ' + restaurant.name);
        if (restaurant.address) {
            lines.push('   Address: ' + restaurant.address);
        }
        if (restaurant.city || restaurant.zip) {
            lines.push('   Location: ' + [restaurant.city, restaurant.zip].filter(Boolean).join(', '));
        }
        if (restaurant.submittedBy) {
            lines.push('   Submitted By: ' + restaurant.submittedBy);
        }
        var submittedIso = formatDate(restaurant.submitted);
        if (submittedIso) {
            lines.push('   Submitted: ' + submittedIso);
        }
        lines.push('');
    });
    lines.push('Use trusted sources to confirm the restaurant exists and is legitimate.');
    lines.push('Return a JSON object with a "decisions" array describing the verdict for each restaurant.');
    return lines.join('\n');
}

function toPromptPayload(restaurants) {
    return restaurants.map(function (restaurant) {
        return {
            restaurantId: restaurant.restaurantId,
            name: restaurant.name,
            address: restaurant.address,
            city: restaurant.city,
            zip: restaurant.zip,
            submitted: formatDate(restaurant.submitted) || restaurant.submitted,
            submittedBy: restaurant.submittedBy
        };
    });
}

function buildJsonSchema() {
    return {
        name: 'RestaurantModerationBatch',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'decisions'],
            properties: {
                summary: { type: 'string' },
                decisions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['restaurantId', 'verdict', 'confidence', 'reasoning', 'evidence', 'verifiedAddress'],
                        properties: {
                            restaurantId: { type: 'integer' },
                            verdict: { type: 'string', enum: ['approve', 'reject', 'manual_review'] },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                            reasoning: { type: 'string' },
                            evidence: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            verifiedAddress: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['street','city','state','postalCode'],
                                properties: {
                                    street: { type: 'string' },
                                    city: { type: 'string' },
                                    state: { type: 'string' },
                                    postalCode: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}


function normalizeDecision(decision) {
    if (!decision || typeof decision !== 'object') {
        return null;
    }

    var verdict = String(decision.verdict || '').toLowerCase();
    if (['approve', 'reject', 'manual_review'].indexOf(verdict) === -1) {
        verdict = 'manual_review';
    }

    return {
        restaurantId: decision.restaurantId,
        verdict: verdict,
        confidence: typeof decision.confidence === 'number' ? Math.max(0, Math.min(1, decision.confidence)) : null,
        reasoning: decision.reasoning || '',
        evidence: Array.isArray(decision.evidence) ? decision.evidence : [],
        verifiedAddress: decision.verifiedAddress && typeof decision.verifiedAddress === 'object' ? {
            street: normalizeString(decision.verifiedAddress.street) || null,
            city: normalizeString(decision.verifiedAddress.city) || null,
            state: normalizeString(decision.verifiedAddress.state) || null,
            postalCode: normalizeString(decision.verifiedAddress.postalCode) || null
        } : null
    };
}

async function evaluatePendingRestaurants(options) {
    options = options || {};
    var limit = clampLimit(options.limit);

    var restaurants = await fetchPendingRestaurants(limit);
    if (!restaurants.length) {
        return {
            restaurants: [],
            aiDecisions: [],
            rawResponse: null
        };
    }

    var client = getOpenAiClient();
    var decisions = [];
    var summaries = [];
    var rawResponses = [];

    for (var i = 0; i < restaurants.length; i++) {
        var restaurant = restaurants[i];
        var evaluation = await evaluateSingleRestaurant(client, restaurant);
        if (evaluation.decision) {
            decisions.push(evaluation.decision);
        }
        if (evaluation.summary) {
            summaries.push(evaluation.summary);
        }
        rawResponses.push(evaluation.rawResponse);
    }

    return {
        restaurants: restaurants,
        aiDecisions: decisions,
        summary: summaries.join('\n\n'),
        rawResponse: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
        rawResponses: rawResponses
    };
}

async function evaluateSingleRestaurant(client, restaurant) {
    var promptRestaurants = toPromptPayload([restaurant]);
    var userPrompt = buildUserPrompt([restaurant]) + '\n\nStructured payload:\n' + JSON.stringify(promptRestaurants, null, 2);

    var response;
    try {
        var schemaDef = buildJsonSchema();

        response = await client.responses.create({
            model: "gpt-4o",
            instructions:
                "You are a compliance reviewer that decides whether newly submitted restaurants are real and safe to list. Always base conclusions on up-to-date sources, cite the sources you used, return JSON that matches the provided schema, and when approving a restaurant include a verifiedAddress object describing the confirmed street, city, state, and postal code.",
            input: [
                {
                    role: "user",
                    content: [{ type: "input_text", text: userPrompt }]
                }
            ],
            tools: [{ type: "web_search" }], // built-in tool
            text: {
                format: {
                    type: "json_schema",
                    name: schemaDef.name,
                    schema: schemaDef.schema,
                    strict: true
                }
            }
        });
    } catch (err) {
        err.message = 'Failed to obtain AI moderation result: ' + err.message;
        throw err;
    }

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function (block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });

    var parsedContent = contentParts.find(function (part) { return part && Object.prototype.hasOwnProperty.call(part, 'parsed'); });

    var parsed = (parsedContent && parsedContent.parsed) || extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;

    var sources = contentParts.flatMap(function (part) {
        if (!part) return [];
        if (Array.isArray(part.citations)) return part.citations;
        if (Array.isArray(part.sources)) return part.sources;
        return [];
    });
    if (!sources.length && Array.isArray(response && response.sources)) {
        sources = response.sources;
    }

    return {
        decision: decision,
        summary: parsed.summary || '',
        sources: sources,
        rawResponse: response
    };
}

async function applyAiDecisions(decisions) {
    var reviewerUserId = 'openai';

    if (!Array.isArray(decisions) || !decisions.length) {
        return { updated: 0 };
    }

    var connection = await db.getConnection();
    var updates = 0;

    try {
        await connection.beginTransaction();

        for (var i = 0; i < decisions.length; i++) {
            var decision = decisions[i];
            if (!decision || !decision.restaurantId) {
                continue;
            }

            var verdict = String(decision.verdict || '').toLowerCase();
            var status;
            if (verdict === 'approve') {
                status = 'approved';
            } else if (verdict === 'reject') {
                status = 'rejected';
            } else {
                continue;
            }

            var result = await connection.query(
                "UPDATE restaurants SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE restaurantId = ? AND status = 'pending'",
                [status, Date.now(), reviewerUserId, decision.restaurantId]
            );

            var affectedRows = 0;
            if (Array.isArray(result)) {
                affectedRows = result[0] && typeof result[0].affectedRows === 'number' ? result[0].affectedRows : 0;
            } else if (result && typeof result.affectedRows === 'number') {
                affectedRows = result.affectedRows;
            }

            updates += affectedRows;

            if (status === 'approved' && affectedRows > 0 && decision.verifiedAddress) {
                var verified = decision.verifiedAddress;
                var street = normalizeString(verified.street);
                var city = normalizeString(verified.city);
                var state = normalizeString(verified.state);
                var postalCode = normalizeString(verified.postalCode);

                var shouldUpdateAddress = street || city || state || postalCode;
                if (shouldUpdateAddress) {
                    var cityDisplay = [city, state].filter(Boolean).join(', ');
                    var cityId = null;
                    if (cityDisplay) {
                        try {
                            cityId = await getOrCreateCityId(connection, cityDisplay);
                        } catch (cityErr) {
                            // do not abort address update if city lookup fails
                            cityId = null;
                        }
                    }

                    var addressUpdates = [];
                    var addressValues = [];

                    if (street) {
                        addressUpdates.push('address = ?');
                        addressValues.push(street);
                    }
                    if (postalCode) {
                        addressUpdates.push('zip = ?');
                        addressValues.push(postalCode);
                    }
                    if (cityId !== null && cityId !== undefined) {
                        addressUpdates.push('cityId = ?');
                        addressValues.push(cityId);
                    }

                    if (addressUpdates.length) {
                        addressValues.push(decision.restaurantId);
                        await connection.query(
                            'UPDATE restaurants SET ' + addressUpdates.join(', ') + ' WHERE restaurantId = ?',
                            addressValues
                        );
                    }
                }
            }
        }

        await connection.commit();
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            // ignore rollback errors
        }
        throw err;
    } finally {
        connection.release();
    }

    return { updated: updates };
}

module.exports = {
    evaluatePendingRestaurants: evaluatePendingRestaurants,
    applyAiDecisions: applyAiDecisions
};
//evaluatePendingRestaurants();