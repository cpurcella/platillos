var db = require('../connections');
var { getOpenAiClient, clampLimit } = require('./client');
var { formatDate, extractJsonResult } = require('./utils');

function fetchPendingRestaurants(limit) {
    var sql = "SELECT r.restaurantId, r.name, r.address, r.zip, r.submitted, r.submittedBy, r.status, r.statusUpdated, r.statusUpdatedBy, c.city as cityName " +
        "FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId " +
        "WHERE r.status = 'pending' ORDER BY r.submitted DESC, r.restaurantId DESC LIMIT ?";
    return db.query(sql, [limit]).then(function(rows) {
        rows = rows || [];
        return rows.map(function(row) {
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
    restaurants.forEach(function(restaurant, index) {
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
    return restaurants.map(function(restaurant) {
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
            required: ['decisions'],
            properties: {
                summary: {
                    type: 'string'
                },
                decisions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['restaurantId', 'verdict', 'confidence', 'reasoning'],
                        additionalProperties: false,
                        properties: {
                            restaurantId: {
                                type: 'integer'
                            },
                            verdict: {
                                type: 'string',
                                enum: ['approve', 'reject', 'manual_review']
                            },
                            confidence: {
                                type: 'number',
                                minimum: 0,
                                maximum: 1
                            },
                            reasoning: {
                                type: 'string'
                            },
                            evidence: {
                                type: 'array',
                                items: {
                                    type: 'string'
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
        evidence: Array.isArray(decision.evidence) ? decision.evidence : []
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
        response = await client.responses.create({
            model: 'gpt-4o-search-preview',
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'text',
                            text: 'You are a compliance reviewer that decides whether newly submitted restaurants are real and safe to list. Always base conclusions on up-to-date sources, cite the sources you used, and return JSON that matches the provided schema.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: userPrompt
                        }
                    ]
                }
            ],
            tools: [
                { type: 'web_search' }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: buildJsonSchema()
            }
        });
    } catch (err) {
        err.message = 'Failed to obtain AI moderation result: ' + err.message;
        throw err;
    }

    var parsed = extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;

    return {
        decision: decision,
        summary: parsed.summary || '',
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
