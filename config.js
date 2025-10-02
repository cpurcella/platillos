var env = process.env.env || 'dev';

var config = {
    recaptchaKey: "REMOVED_CREDENTIAL",
    googleMapsKey: "REMOVED_CREDENTIAL",
    dbPassword: "REMOVED_CREDENTIAL",
    dbUrl: "REMOVED_CONFIGURATION",
    dbUser: "REMOVED_CONFIGURATION",
    perplexityKey: "REMOVED_CREDENTIAL",
    cookieSecret: "REMOVED_CREDENTIAL",
    awsRegion: "us-east-1" // Always use us-east-1
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
        database: 'platillos_prod',
        bucket: 'platillos-prod',
        awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
        awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

Object.assign(config, envConfig[env] || {});

module.exports = config;
