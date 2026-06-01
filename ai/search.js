var db = require('../connections');
var config = require('../config');
var { getOpenAiClient } = require('./client');

async function getSearchMappings(searchTerm) {
    if (!searchTerm || !searchTerm.trim()) {
        return null;
    }
    var term = searchTerm.trim().toLowerCase();

    // 1. Check if the term directly matches a category, type, or tag
    var directMatches = await findDirectMatches(term);
    if (directMatches) {
        return directMatches;
    }

    // 2. Check cache
    var cached = await db.query(
        'SELECT mappings FROM search_terms WHERE term = ?',
        [term]
    );
    if (cached && cached.length) {
        var mappings = cached[0].mappings;
        if (typeof mappings === 'string') mappings = JSON.parse(mappings);
        return mappings;
    }

    // 3. Call OpenAI to generate mappings
    var aiMappings = await generateAiMappings(term);
    if (!aiMappings) {
        return null;
    }

    // 4. Cache the result
    await db.query(
        'INSERT INTO search_terms (term, mappings, createdAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mappings = VALUES(mappings)',
        [term, JSON.stringify(aiMappings), Date.now()]
    );

    return aiMappings;
}

async function findDirectMatches(term) {
    var categories = await db.query(
        'SELECT categoryId, category FROM categories WHERE LOWER(category) = ?',
        [term]
    );
    var dishTypes = await db.query(
        'SELECT dishTypeId, dishType FROM dishTypes WHERE LOWER(dishType) = ?',
        [term]
    );
    var tags = await db.query(
        'SELECT tagId, tag FROM tags WHERE LOWER(tag) = ?',
        [term]
    );

    if ((!categories || !categories.length) && (!dishTypes || !dishTypes.length) && (!tags || !tags.length)) {
        return null;
    }

    return {
        categories: (categories || []).map(function(c) { return { id: c.categoryId, weight: 1.0 }; }),
        dishTypes: (dishTypes || []).map(function(dt) { return { id: dt.dishTypeId, weight: 1.0 }; }),
        tags: (tags || []).map(function(t) { return { id: t.tagId, weight: 1.0 }; })
    };
}

async function generateAiMappings(term) {
    var allCategories = await db.query('SELECT categoryId, category FROM categories ORDER BY category');
    var allDishTypes = await db.query('SELECT dishTypeId, dishType FROM dishTypes ORDER BY dishType');
    var allTags = await db.query('SELECT tagId, tag FROM tags ORDER BY tag');

    var prompt = 'A user is searching for food with the term: "' + term + '"\n\n' +
        'Map this search term to the most relevant categories, dish types, and tags from the lists below. ' +
        'Assign a weight between 0.0 and 1.0 to each match based on how relevant it is to the search term. ' +
        'Only include items with meaningful relevance (weight >= 0.3). ' +
        'If the search term is not food-related at all, return empty arrays.\n\n' +
        'Categories: ' + allCategories.map(function(c) { return c.categoryId + ':' + c.category; }).join(', ') + '\n\n' +
        'Dish Types: ' + allDishTypes.map(function(dt) { return dt.dishTypeId + ':' + dt.dishType; }).join(', ') + '\n\n' +
        'Tags: ' + allTags.map(function(t) { return t.tagId + ':' + t.tag; }).join(', ');

    var client = getOpenAiClient();
    var response = await client.responses.create({
        model: config.aiModel,
        input: [
            {
                role: 'system',
                content: [{ type: 'input_text', text: 'You are a food search assistant. Map search terms to relevant food categories, dish types, and tags.' }]
            },
            {
                role: 'user',
                content: [{ type: 'input_text', text: prompt }]
            }
        ],
        text: {
            format: {
                type: 'json_schema',
                name: 'SearchTermMapping',
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['categories', 'dishTypes', 'tags'],
                    properties: {
                        categories: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'weight'],
                                properties: {
                                    id: { type: 'integer' },
                                    weight: { type: 'number' }
                                }
                            }
                        },
                        dishTypes: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'weight'],
                                properties: {
                                    id: { type: 'integer' },
                                    weight: { type: 'number' }
                                }
                            }
                        },
                        tags: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'weight'],
                                properties: {
                                    id: { type: 'integer' },
                                    weight: { type: 'number' }
                                }
                            }
                        }
                    }
                },
                strict: true
            }
        }
    });

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function(block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });
    var parsedContent = contentParts.find(function(part) {
        return part && Object.prototype.hasOwnProperty.call(part, 'parsed');
    });
    var parsed = parsedContent && parsedContent.parsed;

    if (!parsed && response && response.output_text) {
        try { parsed = JSON.parse(response.output_text); } catch (e) { /* ignore */ }
    }

    if (!parsed) {
        return null;
    }

    // Filter out low-weight and invalid entries
    var result = {
        categories: (parsed.categories || []).filter(function(m) { return m.id && m.weight >= 0.3; }),
        dishTypes: (parsed.dishTypes || []).filter(function(m) { return m.id && m.weight >= 0.3; }),
        tags: (parsed.tags || []).filter(function(m) { return m.id && m.weight >= 0.3; })
    };

    if (!result.categories.length && !result.dishTypes.length && !result.tags.length) {
        return null;
    }

    return result;
}

module.exports = {
    getSearchMappings: getSearchMappings
};
