var db = require('../connections');
var config = require('../config');
var { getOpenAiClient } = require('./client');

var VECTOR_STORE_NAME = 'platillos-restaurants';

// Get all restaurants with city info
async function getAllRestaurants() {
    var rows = await db.query(
        "SELECT r.name, r.address, c.city AS cityName, c.state FROM restaurants r " +
        "LEFT JOIN cities c ON r.cityId = c.cityId"
    );
    return rows || [];
}

// Build a text file of restaurants for a given city/metro
function buildRestaurantFile(restaurants, metro) {
    var lines = [
        'Restaurants already in the Platillos database for the ' + metro + ' area:',
        ''
    ];
    restaurants.forEach(function (r) {
        var parts = [r.name];
        if (r.address) parts.push(r.address);
        if (r.cityName) parts.push(r.cityName);
        if (r.state) parts.push(r.state);
        lines.push(parts.join(', '));
    });
    return lines.join('\n');
}

// Find or create the vector store
async function getOrCreateVectorStore(client) {
    var stores = await client.vectorStores.list({ limit: 100 });
    var existing = stores.data.find(function (s) {
        return s.name === VECTOR_STORE_NAME;
    });
    if (existing) return existing;

    return await client.vectorStores.create({ name: VECTOR_STORE_NAME });
}

// Upload a restaurant file for a metro area and attach to vector store
async function uploadMetroFile(client, vectorStore, restaurants, metro) {
    var content = buildRestaurantFile(restaurants, metro);
    var metroSlug = metro.toLowerCase().replace(/\s+/g, '-');
    var fileName = 'platillos-' + metroSlug + '.txt';
    var blob = new Blob([content], { type: 'text/plain' });
    var file = await client.files.create({
        file: new File([blob], fileName),
        purpose: 'assistants'
    });

    await client.vectorStores.files.create(vectorStore.id, {
        file_id: file.id,
        attributes: {
            metro: metroSlug,
            type: 'restaurant-list'
        }
    });

    return { fileId: file.id, metro: metro, restaurantCount: restaurants.length };
}

// Remove all existing restaurant-list files from the vector store
async function clearVectorStoreFiles(client, vectorStore) {
    var files = await client.vectorStores.files.list(vectorStore.id, { limit: 100 });
    var deleted = 0;
    for (var i = 0; i < files.data.length; i++) {
        var f = files.data[i];
        await client.vectorStores.files.del(vectorStore.id, f.id);
        await client.files.del(f.id);
        deleted++;
    }
    return deleted;
}

// Refresh the vector store with current restaurant data for given metros
async function refreshVectorStore(metros) {
    var client = getOpenAiClient();
    var vectorStore = await getOrCreateVectorStore(client);

    // Clear old files
    var deleted = await clearVectorStoreFiles(client, vectorStore);

    // Group restaurants by metro and upload
    var allRestaurants = await getAllRestaurants();
    var uploaded = [];

    for (var i = 0; i < metros.length; i++) {
        var metro = metros[i];
        // Include all restaurants for now — the metro metadata attribute
        // handles filtering at query time via file_search filters
        var result = await uploadMetroFile(client, vectorStore, allRestaurants, metro);
        uploaded.push(result);
    }

    // Wait for files to be indexed
    await waitForVectorStoreReady(client, vectorStore.id);

    return {
        vectorStoreId: vectorStore.id,
        deleted: deleted,
        uploaded: uploaded
    };
}

async function waitForVectorStoreReady(client, vectorStoreId) {
    var maxWait = 60000;
    var elapsed = 0;
    var interval = 2000;

    while (elapsed < maxWait) {
        var store = await client.vectorStores.retrieve(vectorStoreId);
        if (store.status === 'completed') return store;
        if (store.file_counts && store.file_counts.in_progress === 0) return store;
        await new Promise(function (resolve) { setTimeout(resolve, interval); });
        elapsed += interval;
    }
    return null;
}

// Get the vector store ID (or null if not created yet)
async function getVectorStoreId() {
    var client = getOpenAiClient();
    var stores = await client.vectorStores.list({ limit: 100 });
    var existing = stores.data.find(function (s) {
        return s.name === VECTOR_STORE_NAME;
    });
    return existing ? existing.id : null;
}

module.exports = {
    refreshVectorStore: refreshVectorStore,
    getVectorStoreId: getVectorStoreId,
    getOrCreateVectorStore: getOrCreateVectorStore
};
