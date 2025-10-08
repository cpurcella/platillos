var env = process.env.env || 'dev';

var config = {
    recaptchaKey: "REMOVED_CREDENTIAL",
    googleMapsKey: "REMOVED_CREDENTIAL",
    dbPassword: "REMOVED_CREDENTIAL",
    dbUrl: "REMOVED_CONFIGURATION",
    dbUser: "REMOVED_CONFIGURATION",
    perplexityKey: "REMOVED_CREDENTIAL",
    openaiKey: process.env.OPENAI_API_KEY || process.env.openaiKey || '',
    cookieSecret: "REMOVED_CREDENTIAL",
    awsRegion: "us-east-1",
    env: env
};

var envConfig = {
    dev: {
        database: 'platillos_qa',
        websiteUrl: "http://localhost:3000",
        bucket: 'platillos-qa',
        awsAccessKey: "REMOVED_CREDENTIAL",
        awsSecretKey: "REMOVED_CREDENTIAL"
    },
    prod: {
        database: 'prod',
        bucket: 'platillos-prod',
        awsAccessKey: process.env.awsAccessKey,
        awsSecretKey: process.env.awsSecretKey,
        dbPassword: process.env.dbPassword,
        dbUrl: process.env.dbUrl,
        dbUser: process.env.dbUser,
        awsRegion: "us-west-2",
        cookieSecret: process.env.cookieSecret,
        openAiApiKey: process.env.openAiApiKey
    }
};

Object.assign(config, envConfig[env] || {});

module.exports = config;
