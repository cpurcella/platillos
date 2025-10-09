var db = require('../connections');
var { getOpenAiClient, clampLimit } = require('./client');
var { formatDate, extractJsonResult } = require('./utils');

var VALID_VERDICTS = ['approve', 'reject', 'manual_review'];

async function fetchPendingDishes(limit) {
    var sql = "SELECT d.dishId, d.name AS dishName, d.description, d.restaurantId, d.submitted, d.submittedBy, " +
        "d.status, r.name AS restaurantName, r.website, r.address, r.cityId, c.city AS cityName, c.state AS stateName " +
        "FROM dishes d " +
        "JOIN restaurants r ON d.restaurantId = r.restaurantId " +
        "LEFT JOIN cities c ON r.cityId = c.cityId " +
        "WHERE LOWER(COALESCE(d.status, 'pending')) = 'pending' " +
        "ORDER BY d.submitted DESC, d.dishId DESC LIMIT ?";

    var rows = await db.query(sql, [limit]) || [];
    return rows.map(function(row) {
        return {
            dishId: row.dishId,
            dishName: row.dishName,
            description: row.description || '',
            restaurantId: row.restaurantId,
            restaurantName: row.restaurantName || '',
            restaurantWebsite: row.website || '',
            restaurantAddress: row.address || '',
            restaurantCity: row.cityName || '',
            restaurantState: row.stateName || '',
            submitted: row.submitted,
            submittedBy: row.submittedBy
        };
    });
}

function buildDishPrompt(dish) {
    var lines = [
        'You are validating a restaurant menu submission. Confirm whether this dish is real or reasonable for the restaurant to have.',
        '',
        'Dish: ' + (dish.dishName || 'Unknown Dish'),
        'Description: ' + (dish.description || 'No description provided'),
        'Restaurant: ' + (dish.restaurantName || 'Unknown Restaurant')
    ];

    if (dish.restaurantWebsite) {
        lines.push('Restaurant Website: ' + dish.restaurantWebsite);
    }

    var locationParts = [dish.restaurantAddress, dish.restaurantCity, dish.restaurantState].filter(Boolean);
    if (locationParts.length) {
        lines.push('Restaurant Location: ' + locationParts.join(', '));
    }

    var submittedIso = formatDate(dish.submitted);
    if (submittedIso) {
        lines.push('Submitted: ' + submittedIso);
    }

    lines.push('');
    lines.push('Tasks:');
    lines.push('1. Search the web (especially the restaurant’s website or reputable sources) to see if the dish appears on their menu.');
    lines.push('2. If the dish is not mentioned, assess whether the dish reasonably fits the restaurant’s cuisine and style.');
    lines.push('3. Flag any concerns such as mismatched cuisine, implausible dishes, or known hoaxes.');
    lines.push('4. Return a verdict (approve, reject, or manual_review) and explain your reasoning.');
    lines.push('');
    lines.push('Provide your decision as JSON according to the given schema, citing sources when possible.');

    return lines.join('\n');
}

function buildDishJsonSchema() {
    return {
        name: 'DishModeration',
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
                        required: ['dishId', 'verdict', 'confidence', 'reasoning'],
                        additionalProperties: false,
                        properties: {
                            dishId: {
                                type: 'string'
                            },
                            verdict: {
                                type: 'string',
                                enum: VALID_VERDICTS
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
                            },
                            concerns: {
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

function normalizeDishDecision(decision) {
    if (!decision || typeof decision !== 'object') {
        return null;
    }

    var verdict = String(decision.verdict || '').toLowerCase();
    if (VALID_VERDICTS.indexOf(verdict) === -1) {
        verdict = 'manual_review';
    }

    return {
        dishId: decision.dishId,
        verdict: verdict,
        confidence: typeof decision.confidence === 'number' ? Math.max(0, Math.min(1, decision.confidence)) : null,
        reasoning: decision.reasoning || '',
        evidence: Array.isArray(decision.evidence) ? decision.evidence : [],
        concerns: Array.isArray(decision.concerns) ? decision.concerns : []
    };
}

async function evaluatePendingDishes(options) {
    options = options || {};
    var limit = clampLimit(options.limit);

    var dishes = await fetchPendingDishes(limit);
    if (!dishes.length) {
        return {
            dishes: [],
            aiDecisions: [],
            rawResponse: null
        };
    }

    var client = getOpenAiClient();
    var decisions = [];
    var summaries = [];
    var rawResponses = [];

    for (var i = 0; i < dishes.length; i++) {
        var dish = dishes[i];
        var evaluation = await evaluateSingleDish(client, dish);
        if (evaluation.decision) {
            decisions.push(evaluation.decision);
        }
        if (evaluation.summary) {
            summaries.push(evaluation.summary);
        }
        rawResponses.push(evaluation.rawResponse);
    }

    return {
        dishes: dishes,
        aiDecisions: decisions,
        summary: summaries.join('\n\n'),
        rawResponse: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
        rawResponses: rawResponses
    };
}

async function evaluateSingleDish(client, dish) {
    var userPrompt = buildDishPrompt(dish);

    var response;
    try {
        var schemaDef = buildDishJsonSchema();

        response = await client.responses.create({
            model: 'gpt-4o-mini',
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'text',
                            text: 'You are a culinary fact-checker verifying restaurant menu submissions. Use current web sources to confirm dishes.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: userPrompt
                        }
                    ]
                }
            ],
            tools: [
                { type: 'web_search' }
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: schemaDef.name,
                    schema: schemaDef.schema,
                    strict: true
                }
            }
        });
    } catch (err) {
        err.message = 'Failed to obtain AI dish moderation result: ' + err.message;
        throw err;
    }

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function(block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });

    var parsedContent = contentParts.find(function(part) { return part && Object.prototype.hasOwnProperty.call(part, 'parsed'); });

    var parsed = (parsedContent && parsedContent.parsed) || extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDishDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;

    var sources = contentParts.flatMap(function(part) {
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

async function applyDishDecisions(decisions) {
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
            if (!decision || !decision.dishId) {
                continue;
            }

            var selectResult = await connection.query(
                "SELECT dishId, status FROM dishes WHERE dishId = ? FOR UPDATE",
                [decision.dishId]
            );

            var selectRows = Array.isArray(selectResult) ? selectResult[0] : selectResult;
            if (!selectRows || !selectRows.length) {
                continue;
            }

            var row = selectRows[0];
            var currentStatus = String(row.status || 'pending').toLowerCase();
            var newStatus = null;

            if (decision.verdict === 'approve') {
                newStatus = 'approved';
            } else if (decision.verdict === 'reject') {
                newStatus = 'rejected';
            }

            if (newStatus && currentStatus === 'pending') {
                var updateResult = await connection.query(
                    "UPDATE dishes SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE dishId = ? AND LOWER(COALESCE(status, 'pending')) = 'pending'",
                    [newStatus, Date.now(), reviewerUserId, decision.dishId]
                );

                var affectedRows = 0;
                if (Array.isArray(updateResult)) {
                    affectedRows = updateResult[0] && typeof updateResult[0].affectedRows === 'number' ? updateResult[0].affectedRows : 0;
                } else if (updateResult && typeof updateResult.affectedRows === 'number') {
                    affectedRows = updateResult.affectedRows;
                }

                updates += affectedRows;
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
    evaluatePendingDishes: evaluatePendingDishes,
    applyDishDecisions: applyDishDecisions
};
