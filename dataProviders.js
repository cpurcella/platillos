// dataProviders.js
// Export an object mapping template names to data provider functions

module.exports = {
    'test': async function(req) {
        // Example: fetch dishes from DB or mock
        return {
            dishes: [
                { name: 'Tacos', description: 'Delicious Mexican tacos.' },
                { name: 'Paella', description: 'Classic Spanish rice dish.' }
            ]
        };
    }
    // Add more template data providers as needed
};
