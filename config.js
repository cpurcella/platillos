require('dotenv').config();

var env = process.env.env || 'dev';

var openAiKey = process.env.openAiApiKey || process.env.OPENAI_API_KEY || process.env.openaiKey || '';

var config = {
    recaptchaKey: process.env.recaptchaKey || '',
    googleMapsKey: process.env.googleMapsKey || '',
    dbPassword: process.env.dbPassword || '',
    dbUrl: process.env.dbUrl || '',
    dbUser: process.env.dbUser || '',
    database: process.env.database || (env === 'prod' ? 'prod' : 'platillos_qa'),
    perplexityKey: process.env.perplexityKey || '',
    openaiKey: openAiKey,
    openAiApiKey: openAiKey,
    cookieSecret: process.env.cookieSecret || '',
    awsRegion: process.env.awsRegion || 'us-east-1',
    awsAccessKey: process.env.awsAccessKey || '',
    awsSecretKey: process.env.awsSecretKey || '',
    websiteUrl: process.env.websiteUrl || 'http://localhost:3000',
    bucket: process.env.bucket || (env === 'prod' ? 'platillos-prod' : 'platillos-qa'),
    aiModel: process.env.aiModel || 'gpt-5.4-mini',
    env: env
};

module.exports = config;
