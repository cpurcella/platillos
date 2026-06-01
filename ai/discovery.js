var crypto = require('crypto');
var db = require('../connections');
var config = require('../config');
var { getOpenAiClient } = require('./client');
var { extractJsonResult } = require('./utils');
var aiJobQueue = require('../aiJobQueue');
var vectorStore = require('./vectorStore');

function buildDiscoveryPrompt(metro, hasVectorStore) {
    var lines = [
        'Search the web for restaurants in the ' + metro + ' area that are NOT already in our database.',
        ''
    ];

    if (hasVectorStore) {
        lines.push('IMPORTANT: Before suggesting any restaurant, you MUST use the file_search tool to check whether it is already in our database. Search for the restaurant name. If it appears in the results, do NOT include it.');
        lines.push('');
    }

    lines.push('Focus on:');
    lines.push('- Recently opened restaurants (last 12 months)');
    lines.push('- Well-reviewed local spots that food enthusiasts talk about');
    lines.push('- Hidden gems and neighborhood favorites');
    lines.push('- Places known for standout individual dishes');
    lines.push('');
    lines.push('For each new restaurant you find, include:');
    lines.push('- The official business name');
    lines.push('- Street address, city, state, and zip code');
    lines.push('- 1-5 specific dishes from their menu (e.g. "Green Chile Cheeseburger", "Chicken Katsu Plate", "Carne Adovada Burrito")');
    lines.push('  Each dish MUST be a specific menu item that a customer could order by name.');
    lines.push('  Do NOT include vague categories like "small plates", "street food", "bar fare", "breakfast plates", or "seasonal entrees".');
    lines.push('  Do NOT list near-duplicate dishes for the same restaurant (e.g. "Chicken Wings" and "Fried Chicken Wings" are the same dish — pick one).');
    lines.push('  Only list a dish if you can verify it appears on the restaurant\'s actual menu. Do not guess or assume based on cuisine type.');
    lines.push('  Capitalize dish names in title case (e.g. "Green Chile Cheeseburger", not "green chile cheeseburger").');
    lines.push('- A short reason why this restaurant is worth listing');
    lines.push('');
    lines.push('Return between 3 and 10 restaurants. Only include restaurants you can verify actually exist and are currently open.');
    lines.push('Return your results as JSON matching the provided schema.');
    return lines.join('\n');
}

function buildDiscoverySchema() {
    return {
        name: 'RestaurantDiscovery',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'restaurants'],
            properties: {
                summary: { type: 'string' },
                restaurants: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['name', 'address', 'city', 'state', 'zip', 'lat', 'lng', 'reason', 'dishes'],
                        properties: {
                            name: { type: 'string' },
                            address: { type: 'string' },
                            city: { type: 'string' },
                            state: { type: 'string' },
                            zip: { type: 'string' },
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                            reason: { type: 'string' },
                            dishes: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        }
                    }
                }
            }
        }
    };
}

async function getOrCreateCityId(connection, cityName, state) {
    var name = (cityName || '').trim();
    if (!name) return null;

    var rows = await connection.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    var result = Array.isArray(rows[0]) ? rows[0] : rows;
    if (result && result.length) return result[0].cityId;

    var insertResult = await connection.query(
        'INSERT INTO cities (city, state, lat, lng) VALUES (?, ?, 0, 0)',
        [name, (state || 'NM').trim()]
    );
    var header = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    return header && header.insertId;
}

async function discoverRestaurants(options) {
    options = options || {};
    var metro = options.metro || 'Albuquerque, New Mexico';
    var metroSlug = metro.toLowerCase().replace(/,?\s+/g, '-').replace(/-+/g, '-');

    var client = getOpenAiClient();
    var schemaDef = buildDiscoverySchema();

    // Build tools — always include web_search, add file_search if vector store exists
    var tools = [{ type: 'web_search' }];
    var vectorStoreId = await vectorStore.getVectorStoreId();
    if (vectorStoreId) {
        tools.push({
            type: 'file_search',
            vector_store_ids: [vectorStoreId],
            filters: {
                type: 'eq',
                key: 'metro',
                value: metroSlug
            }
        });
    }

    var userPrompt = buildDiscoveryPrompt(metro, !!vectorStoreId);

    var response = await client.responses.create({
        model: config.aiModel,
        instructions:
            'You are a food discovery assistant that finds new and noteworthy restaurants. ' +
            'Use web search to find real, currently operating restaurants. ' +
            (vectorStoreId
                ? 'Use the file_search tool to check each restaurant name against our existing database before including it. If a restaurant name appears in the file search results, it is already in our database — do NOT include it. '
                : '') +
            'Only include restaurants you can verify with recent sources. ' +
            'Always include accurate street addresses and coordinates. ' +
            'Return JSON matching the provided schema.',
        input: [
            { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
        ],
        tools: tools,
        text: {
            format: {
                type: 'json_schema',
                name: schemaDef.name,
                schema: schemaDef.schema,
                strict: true
            }
        }
    });

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function (block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });
    var parsedContent = contentParts.find(function (part) {
        return part && Object.prototype.hasOwnProperty.call(part, 'parsed');
    });
    var parsed = (parsedContent && parsedContent.parsed) || extractJsonResult(response) || {};
    var discovered = Array.isArray(parsed.restaurants) ? parsed.restaurants : [];

    if (!discovered.length) {
        return { inserted: 0, restaurants: [], summary: parsed.summary || 'No new restaurants found.' };
    }

    // Insert discovered restaurants and dishes as pending
    var connection = await db.getConnection();
    var inserted = [];

    try {
        await connection.beginTransaction();

        for (var i = 0; i < discovered.length; i++) {
            var r = discovered[i];
            var name = (r.name || '').trim();
            var address = (r.address || '').trim();
            if (!name || !address) continue;

            // Skip if already exists (race condition guard)
            var existCheck = await connection.query(
                'SELECT restaurantId FROM restaurants WHERE name = ? AND address = ? LIMIT 1',
                [name, address]
            );
            var existRows = Array.isArray(existCheck[0]) ? existCheck[0] : existCheck;
            if (existRows && existRows.length) continue;

            var cityId = await getOrCreateCityId(connection, r.city, r.state);
            var restaurantId = crypto.randomUUID();
            var now = Date.now();

            await connection.query(
                'INSERT INTO restaurants (restaurantId, name, cityId, address, zip, lat, lng, submitted, submittedBy, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [restaurantId, name, cityId, address, (r.zip || '').trim(), r.lat || 0, r.lng || 0, now, 'ai-discovery', 'pending']
            );

            var dishIds = [];
            var dishes = Array.isArray(r.dishes) ? r.dishes : [];
            for (var j = 0; j < dishes.length; j++) {
                var dishName = (dishes[j] || '').trim();
                if (!dishName) continue;
                var dishId = crypto.randomUUID();
                await connection.query(
                    'INSERT INTO dishes (dishId, restaurantId, name, submitted, submittedBy, reviewCount, status) VALUES (?, ?, ?, ?, ?, 0, ?)',
                    [dishId, restaurantId, dishName, now, 'ai-discovery', 'pending']
                );
                dishIds.push(dishId);
            }

            inserted.push({
                restaurantId: restaurantId,
                name: name,
                address: address,
                city: r.city || '',
                reason: r.reason || '',
                dishes: dishes,
                dishIds: dishIds
            });
        }

        await connection.commit();
    } catch (err) {
        try { await connection.rollback(); } catch (e) { /* ignore */ }
        throw err;
    } finally {
        connection.release();
    }

    // Enqueue AI evaluation jobs for each new restaurant and dish
    for (var k = 0; k < inserted.length; k++) {
        var entry = inserted[k];
        await aiJobQueue.enqueueJob('evaluate_restaurant', entry.restaurantId);
        for (var m = 0; m < entry.dishIds.length; m++) {
            await aiJobQueue.enqueueJob('evaluate_dish', entry.dishIds[m]);
        }
    }

    return {
        inserted: inserted.length,
        restaurants: inserted,
        summary: parsed.summary || ''
    };
}

module.exports = {
    discoverRestaurants: discoverRestaurants
};
