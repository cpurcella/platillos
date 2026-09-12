var mysql = require('mysql2');
var fs = require('fs');
var path = require('path');
var config = require('./config');

function castField(field, useDefaultTypeCasting) {
    if (field.type === 'DATE') {
        var val = field.string();
        return val === null ? null : val;
    }
    // Cast DECIMAL/NEWDECIMAL to float for numeric fields like score
    if (field.type === 'NEWDECIMAL' || field.type === 'DECIMAL') {
        var val = field.string();
        return val === null ? null : parseFloat(val);
    }
    return useDefaultTypeCasting();
}

function isEnabled(value) {
    return ['1', 'true', 'yes', 'required'].indexOf(String(value || '').toLowerCase()) !== -1;
}

function buildSslConfig() {
    if (!isEnabled(config.dbSsl)) {
        return undefined;
    }

    var ssl = {
        rejectUnauthorized: String(config.dbSslRejectUnauthorized || '').toLowerCase() !== 'false'
    };

    if (config.dbSslCaBase64) {
        ssl.ca = Buffer.from(config.dbSslCaBase64, 'base64').toString('utf8');
    } else if (config.dbSslCaFile) {
        var caPath = path.isAbsolute(config.dbSslCaFile)
            ? config.dbSslCaFile
            : path.join(__dirname, config.dbSslCaFile);
        ssl.ca = fs.readFileSync(caPath, 'utf8');
    } else if (config.dbSslCa) {
        ssl.ca = config.dbSslCa;
    }

    return ssl;
}

var poolConfig = {
    host: config.dbUrl,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    typeCast: castField
};

var sslConfig = buildSslConfig();
if (sslConfig) {
    poolConfig.ssl = sslConfig;
}

var _pool = mysql.createPool(poolConfig);

function getPool() {
    return _pool.promise();
}

async function getConnection() {
    return await getPool().getConnection();
}

async function queryWithBackoff(sql, params, maxRetries) {
    var retries = 0;
    maxRetries = maxRetries || 5;
    while (true) {
        try {
            var [rows] = await getPool().query(sql, params);
            return rows;
        } catch (err) {
            if (err && err.code === 'ER_LOCK_DEADLOCK' && retries < maxRetries) {
                retries++;
                var backoff = Math.pow(2, retries) * Math.random() * 100;
                await new Promise(function(resolve) { setTimeout(resolve, backoff); });
            } else {
                throw err;
            }
        }
    }
}

module.exports = {
    getPool: getPool,
    getConnection: getConnection,
    query: queryWithBackoff
};
