require('dotenv').config({ quiet: true });

var env = process.env.env || 'dev';

var openAiKey = process.env.openAiApiKey || process.env.OPENAI_API_KEY || process.env.openaiKey || '';

var config = {
    recaptchaKey: process.env.recaptchaKey || '',
    recaptchaSiteKey: process.env.recaptchaSiteKey || '',
    googleMapsBrowserKey: process.env.googleMapsBrowserKey || '',
    googleMapsKey: process.env.googleMapsKey || '',
    dbPassword: process.env.dbPassword || '',
    dbUrl: process.env.dbUrl || '',
    dbUser: process.env.dbUser || '',
    dbSsl: process.env.dbSsl || process.env.DB_SSL || '',
    dbSslCa: process.env.dbSslCa || process.env.DB_SSL_CA || '',
    dbSslCaBase64: process.env.dbSslCaBase64 || process.env.DB_SSL_CA_BASE64 || '',
    dbSslCaFile: process.env.dbSslCaFile || process.env.DB_SSL_CA_FILE || '',
    dbSslRejectUnauthorized: process.env.dbSslRejectUnauthorized || process.env.DB_SSL_REJECT_UNAUTHORIZED || '',
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
    aiConfidenceThreshold: parseFloat(process.env.aiConfidenceThreshold) || 0.8,
    env: env
};

module.exports = config;
