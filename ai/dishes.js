var db = require('../connections');
var config = require('../config');
var { getOpenAiClient, clampLimit } = require('./client');
var { formatDate, extractJsonResult, resolveAiStatus } = require('./utils');

var VALID_VERDICTS = ['approve', 'reject', 'manual_review'];
var VALID_METADATA_SUGGESTION_TYPES = ['category', 'dishType', 'tag'];

async function fetchCategoriesAndDishTypes() {
    var results = await Promise.all([
        db.query('SELECT categoryId, category FROM categories ORDER BY category'),
        db.query('SELECT dishTypeId, dishType FROM dishTypes ORDER BY dishType'),
        db.query('SELECT tagId, tag FROM tags ORDER BY tag')
    ]);
    return {
        categories: results[0] || [],
        dishTypes: results[1] || [],
        tags: results[2] || []
    };
}

async function fetchPendingDishes(limit) {
    var sql = "SELECT d.dishId, d.name AS dishName, d.restaurantId, d.submitted, d.submittedBy, " +
        "d.status, r.name AS restaurantName, r.address, r.cityId, c.city AS cityName, c.state AS stateName " +
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
            restaurantId: row.restaurantId,
            restaurantName: row.restaurantName || '',
            restaurantAddress: row.address || '',
            restaurantCity: row.cityName || '',
            restaurantState: row.stateName || '',
            submitted: row.submitted,
            submittedBy: row.submittedBy
        };
    });
}

async function fetchExistingDishNames(restaurantId, excludeDishId) {
    var rows = await db.query(
        "SELECT name FROM dishes WHERE restaurantId = ? AND dishId != ? AND LOWER(COALESCE(status, 'pending')) != 'rejected'",
        [restaurantId, excludeDishId]
    ) || [];
    return rows.map(function(r) { return r.name; });
}

function buildDishPrompt(dish, lookups, existingDishes) {
    var lines = [
        'You are validating a restaurant menu submission. Confirm whether this dish is real and appears on the restaurant\'s actual menu.',
        '',
        'Dish ID: ' + (dish.dishId || ''),
        'Dish: ' + (dish.dishName || 'Unknown Dish'),
        'Restaurant: ' + (dish.restaurantName || 'Unknown Restaurant')
    ];

    var locationParts = [dish.restaurantAddress, dish.restaurantCity, dish.restaurantState].filter(Boolean);
    if (locationParts.length) {
        lines.push('Restaurant Location: ' + locationParts.join(', '));
    }

    var submittedIso = formatDate(dish.submitted);
    if (submittedIso) {
        lines.push('Submitted: ' + submittedIso);
    }

    if (existingDishes && existingDishes.length) {
        lines.push('');
        lines.push('OTHER DISHES ALREADY AT THIS RESTAURANT: ' + existingDishes.join(', '));
    }

    lines.push('');
    lines.push('Tasks:');
    lines.push("1. Search the web (especially the restaurant's website, online menu, or reputable review sites) to see if this dish appears on their actual menu.");
    lines.push('   - Many restaurants publish menus as PDF documents. Search for PDF menu links on the restaurant\'s website (look for paths like /uploads/, /menus/, /documents/, or links labeled "Menu").');
    lines.push('   - Try searching for the restaurant name plus "menu" and "pdf" to find downloadable menus that may not appear in standard web results.');
    lines.push('   - Seasonal or rotating menus are common at farm-to-table and fine dining restaurants. A dish may only appear on a recent PDF menu, not on a cached HTML page.');
    lines.push('2. If this dish is essentially a duplicate of another dish already at this restaurant (listed above), REJECT it. Near-duplicates count (e.g. "Chicken Wings" and "Fried Chicken Wings" are the same dish).');
    lines.push('   - Do not treat a broad canonical dish-family name as a duplicate just because the menu has named variants. For example, "Banh Mi" can be valid at a Vietnamese sandwich shop whose menu lists several banh mi varieties, unless another existing dish is already the same broad "Banh Mi" entry.');
    lines.push('3. If the dish is clearly implausible, a hoax, or has no connection to anything the restaurant serves, REJECT it. Do not reject merely because the exact submitted name is broader than the menu item names.');
    lines.push('4. If you find the EXACT dish name on the menu, APPROVE it.');
    lines.push('5. If the submitted dish is a canonical dish family or restaurant specialty and the restaurant/menu clearly supports that family (for example, a restaurant named for the dish, a menu category for it, or multiple menu items sharing that base name), APPROVE it even if the menu lists variants rather than one exact broad item. Keep correctedName null unless the submitted name is clearly wrong.');
    lines.push('6. If you find a very close match (e.g. "Pork Confit" on the menu vs "Local Pork Confit" submitted, or a past/seasonal menu variant), you may correct the dish name to match the menu and APPROVE it. Set correctedName to the correct name from the menu. Only use MANUAL_REVIEW if you are unsure which name is correct.');
    lines.push('7. If you cannot find the dish or anything close to it, but the restaurant is known for seasonal/rotating menus or the restaurant concept strongly suggests the dish could be legitimate, prefer MANUAL_REVIEW over REJECT.');
    lines.push('8. Only REJECT when you are confident the dish does not and has not existed at this restaurant.');
    lines.push('9. Tag the dish with ALL applicable categories, dish types, and tags from the lists below. Pick every relevant option -- a dish can have multiple categories, types, and tags.');
    lines.push('10. Use only exact names from the valid lists in categories, dishTypes, and tags. If an important food or drink category, dish type, or tag is missing from our lists, do not force a weak match and do not invent it in those arrays. Add it to suggestedMetadata with type, name, and a brief justification so an admin can decide whether to add it later.');
    lines.push('    - Good suggestions are specific and reusable, such as a missing cocktail style, beer style, flavor descriptor, preparation method, dietary tag, or menu category.');
    lines.push('');

    var categoryNames = lookups.categories.map(function(c) { return c.category; });
    lines.push('VALID CATEGORIES (pick all that apply): ' + categoryNames.join(', '));
    lines.push('');

    var dishTypeNames = lookups.dishTypes.map(function(t) { return t.dishType; });
    lines.push('VALID DISH TYPES (pick all that apply): ' + dishTypeNames.join(', '));
    lines.push('');

    var tagNames = lookups.tags.map(function(t) { return t.tag; });
    lines.push('VALID TAGS (pick all that apply): ' + tagNames.join(', '));
    lines.push('');

    lines.push('Return the category, dish type, and tag names exactly as listed above in the "categories", "dishTypes", and "tags" arrays of your response. If you corrected the dish name, include the corrected name in "correctedName" (otherwise null). If there are no metadata coverage gaps, return an empty suggestedMetadata array.');
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
            required: ['summary', 'decisions'],
            properties: {
                summary: {
                    type: 'string'
                },
                decisions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['dishId', 'verdict', 'confidence', 'reasoning', 'evidence', 'correctedName', 'concerns', 'categories', 'dishTypes', 'tags', 'suggestedMetadata'],
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
                            correctedName: {
                                type: ['string', 'null'],
                                description: 'If the dish name is a close match but not exact, provide the corrected name from the menu. Null if no correction needed.'
                            },
                            concerns: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            categories: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            dishTypes: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            tags: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            suggestedMetadata: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['type', 'name', 'justification'],
                                    properties: {
                                        type: {
                                            type: 'string',
                                            enum: VALID_METADATA_SUGGESTION_TYPES
                                        },
                                        name: {
                                            type: 'string'
                                        },
                                        justification: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}

function normalizeSuggestionText(value, maxLength) {
    var text = String(value || '').trim();
    return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function normalizeSuggestedMetadata(suggestions) {
    if (!Array.isArray(suggestions)) {
        return [];
    }

    return suggestions.map(function(suggestion) {
        var type = String(suggestion && suggestion.type || '').trim();
        if (VALID_METADATA_SUGGESTION_TYPES.indexOf(type) === -1) {
            return null;
        }

        var name = normalizeSuggestionText(suggestion.name, 80);
        var justification = normalizeSuggestionText(suggestion.justification, 500);
        if (!name || !justification) {
            return null;
        }

        return {
            type: type,
            name: name,
            justification: justification
        };
    }).filter(Boolean);
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
        concerns: Array.isArray(decision.concerns) ? decision.concerns : [],
        correctedName: decision.correctedName || null,
        categories: Array.isArray(decision.categories) ? decision.categories : [],
        dishTypes: Array.isArray(decision.dishTypes) ? decision.dishTypes : [],
        tags: Array.isArray(decision.tags) ? decision.tags : [],
        suggestedMetadata: normalizeSuggestedMetadata(decision.suggestedMetadata)
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
    var lookups = await fetchCategoriesAndDishTypes();
    var existingDishes = await fetchExistingDishNames(dish.restaurantId, dish.dishId);
    var userPrompt = buildDishPrompt(dish, lookups, existingDishes);

    var response;
    try {
        var schemaDef = buildDishJsonSchema();

        response = await client.responses.create({
            model: config.aiModel,
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'input_text',
                            text: 'You are a culinary fact-checker verifying restaurant menu submissions. Use current web sources to confirm dishes. Many restaurants -- especially farm-to-table, fine dining, and seasonal concepts -- rotate menus frequently and publish them as PDF documents on their websites. Always search for PDF menus in addition to HTML pages. When the exact dish name is not found but a close variant exists on a current or recent menu, correct the name to match the menu and approve it. When the submitted name is a canonical dish family or house specialty supported by the restaurant name, menu categories, or multiple menu variants, approve the broad dish name without correction. Set correctedName to the accurate name from the menu only when the submitted name is clearly wrong. Only flag for manual review if you are genuinely unsure which name is correct.'
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
    if (decision) {
        decision.dishId = dish.dishId;
    }

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
        rawResponse: response,
        lookups: lookups
    };
}

function resolveCategoryIds(categoryNames, allCategories) {
    if (!Array.isArray(categoryNames)) return [];
    var ids = [];
    for (var i = 0; i < categoryNames.length; i++) {
        var name = String(categoryNames[i]).toLowerCase().trim();
        var match = allCategories.find(function(c) { return c.category.toLowerCase() === name; });
        if (match) ids.push(match.categoryId);
    }
    return ids;
}

function resolveDishTypeIds(dishTypeNames, allDishTypes) {
    if (!Array.isArray(dishTypeNames)) return [];
    var ids = [];
    for (var i = 0; i < dishTypeNames.length; i++) {
        var name = String(dishTypeNames[i]).toLowerCase().trim();
        var match = allDishTypes.find(function(t) { return t.dishType.toLowerCase() === name; });
        if (match) ids.push(match.dishTypeId);
    }
    return ids;
}

function resolveTagIds(tagNames, allTags) {
    if (!Array.isArray(tagNames)) return [];
    var ids = [];
    for (var i = 0; i < tagNames.length; i++) {
        var name = String(tagNames[i]).toLowerCase().trim();
        var match = allTags.find(function(t) { return t.tag.toLowerCase() === name; });
        if (match) ids.push(match.tagId);
    }
    return ids;
}

async function applyDishDecisions(decisions, lookups) {
    var reviewerUserId = 'openai';

    if (!Array.isArray(decisions) || !decisions.length) {
        return { updated: 0 };
    }

    if (!lookups) {
        lookups = await fetchCategoriesAndDishTypes();
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
            var newStatus = resolveAiStatus(decision.verdict, decision.confidence);

            if (newStatus && currentStatus === 'pending') {
                var aiReasoning = newStatus === 'needs_review' ? (decision.reasoning || null) : null;
                var nameSql = decision.correctedName ? ', name = ?' : '';
                var nameParams = decision.correctedName ? [decision.correctedName] : [];
                var updateResult = await connection.query(
                    "UPDATE dishes SET status = ?, statusUpdated = ?, statusUpdatedBy = ?, aiReasoning = ?" + nameSql + " WHERE dishId = ? AND LOWER(COALESCE(status, 'pending')) = 'pending'",
                    [newStatus, Date.now(), reviewerUserId, aiReasoning].concat(nameParams).concat([decision.dishId])
                );

                var affectedRows = 0;
                if (Array.isArray(updateResult)) {
                    affectedRows = updateResult[0] && typeof updateResult[0].affectedRows === 'number' ? updateResult[0].affectedRows : 0;
                } else if (updateResult && typeof updateResult.affectedRows === 'number') {
                    affectedRows = updateResult.affectedRows;
                }

                updates += affectedRows;
            }

            // Insert category and dish type associations
            var categoryIds = resolveCategoryIds(decision.categories, lookups.categories);
            if (categoryIds.length) {
                var catValues = categoryIds.map(function(cid) { return [decision.dishId, cid]; });
                await connection.query(
                    'INSERT IGNORE INTO dishes_categories (dishId, categoryId) VALUES ?',
                    [catValues]
                );
            }

            var dishTypeIds = resolveDishTypeIds(decision.dishTypes, lookups.dishTypes);
            if (dishTypeIds.length) {
                var dtValues = dishTypeIds.map(function(dtid) { return [decision.dishId, dtid]; });
                await connection.query(
                    'INSERT IGNORE INTO dishes_dishTypes (dishId, dishTypeId) VALUES ?',
                    [dtValues]
                );
            }

            var tagIds = resolveTagIds(decision.tags, lookups.tags);
            if (tagIds.length) {
                var tagValues = tagIds.map(function(tid) { return [decision.dishId, tid]; });
                await connection.query(
                    'INSERT IGNORE INTO dishes_tags (dishId, tagId) VALUES ?',
                    [tagValues]
                );
            }

            if (decision.suggestedMetadata && decision.suggestedMetadata.length) {
                var now = Date.now();
                var suggestionValues = decision.suggestedMetadata.map(function(suggestion) {
                    return [decision.dishId, suggestion.type, suggestion.name, suggestion.justification, 'pending', now];
                });
                await connection.query(
                    'INSERT IGNORE INTO aiMetadataSuggestions (dishId, metadataType, name, justification, status, createdAt) VALUES ?',
                    [suggestionValues]
                );
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
    applyDishDecisions: applyDishDecisions,
    evaluateSingleDish: evaluateSingleDish,
    fetchPendingDishes: fetchPendingDishes,
    fetchCategoriesAndDishTypes: fetchCategoriesAndDishTypes,
    buildDishPrompt: buildDishPrompt,
    buildDishJsonSchema: buildDishJsonSchema,
    normalizeDishDecision: normalizeDishDecision,
    normalizeSuggestedMetadata: normalizeSuggestedMetadata
};
