var config = require('./config');

function buildAwsClientConfig() {
    var clientConfig = {
        region: config.awsRegion
    };

    if (config.awsAccessKey && config.awsSecretKey) {
        clientConfig.credentials = {
            accessKeyId: config.awsAccessKey,
            secretAccessKey: config.awsSecretKey
        };
    }

    return clientConfig;
}

module.exports = buildAwsClientConfig;
