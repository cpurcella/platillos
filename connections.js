var mysql = require('mysql2');
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
