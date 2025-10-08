var config = require('../config');
var OpenAI = require('openai');

var DEFAULT_LIMIT = 3;
var openAiClient = null;

function getOpenAiClient() {
    if (!openAiClient) {
        var apiKey = config.openAiApiKey;
        if (!apiKey) {
            var missing = new Error('Missing OpenAI API key. Set OPENAI_API_KEY in the environment or config.');
            missing.status = 500;
            throw missing;
        }
        openAiClient = new OpenAI({ apiKey: apiKey });
    }
    return openAiClient;
}

function clampLimit(rawLimit) {
    var limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit <= 0) {
        limit = DEFAULT_LIMIT;
    }
    if (limit > 10) {
        limit = 10;
    }
    return limit;
}

module.exports = {
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    getOpenAiClient: getOpenAiClient,
    clampLimit: clampLimit
};
