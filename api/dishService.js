var db = require('../connections');
var config = require('../config');

function escapeLikePattern(value) {
    return value.replace(/[\\%_]/g, function(char) {
        return '\\' + char;
    });
}

async function getDishes(params) {
    params = params || {};
    var selectFields = params.fields;

    var selectClause = '';
    if (selectFields && selectFields.length) {
        selectClause = selectFields.map(function() { return 'd.??'; }).join(', ');
    } else {
        selectClause = 'd.*';
    }

    selectClause += ', r.name as restaurantName';

    var selectExtra = '';
    var selectExtraValues = [];

    var fromClause = ' FROM dishes d JOIN restaurants r ON d.restaurantId = r.restaurantId';
    var whereClauses = ['1=1'];
    var whereValues = [];

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("d.status = 'pending'");
    } else if (!isAdmin) {
        whereClauses.push("d.status = 'approved'");
        whereClauses.push("r.status = 'approved'");
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        whereClauses.push('d.status = ?');
        whereValues.push(statusFilter);
    }

    if (params.restaurantId) {
        whereClauses.push('d.restaurantId = ?');
        whereValues.push(params.restaurantId);
    }

    if (params.dishId) {
        whereClauses.push('d.dishId = ?');
        whereValues.push(params.dishId);
    }

    if (params.prefix) {
        whereClauses.push('d.name LIKE ?');
        whereValues.push(params.prefix + '%');
    }

    if (typeof params.search === 'string') {
        var searchTerm = params.search.trim();
        if (searchTerm) {
            var likeValue = '%' + escapeLikePattern(searchTerm) + '%';
            whereClauses.push('(d.name LIKE ? OR r.name LIKE ?)');
            whereValues.push(likeValue, likeValue);
        }
    }

    var lat, lng;
    if (params.lat && params.lng) {
        lat = parseFloat(params.lat);
        lng = parseFloat(params.lng);
    } else if (params.auth?.user?.addressLat && params.auth?.user?.addressLng) {
        lat = parseFloat(params.auth.user.addressLat);
        lng = parseFloat(params.auth.user.addressLng);
    }

    if (lat && lng && !params.ignoreRadius) {
        whereClauses.push(`d.restaurantId IN (
            SELECT restaurantId FROM restaurants
            WHERE ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) <= 48280
        )`);
        whereValues.push('POINT(' + lat + ' ' + lng + ')');
    }

    if (lat && lng && params.useLocation == '1') {
        selectExtra = ', ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) AS distance';
        selectExtraValues.push('POINT(' + lat + ' ' + lng + ')');
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = countRows.length ? countRows[0].total : 0;

    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) page = 1;
    var offset = (page - 1) * pageSize;

    var orderClause = '';
    if (lat && lng && params.useLocation == '1') {
        orderClause = ' ORDER BY distance ASC';
    }

    var dataSql = 'SELECT ' + selectClause + selectExtra + fromClause + whereSql + orderClause + ' LIMIT ? OFFSET ?';
    var dataValues = selectExtraValues.slice();
    if (selectFields && selectFields.length) {
        dataValues = selectFields.concat(dataValues);
    }
    dataValues = dataValues.concat(whereValues, [pageSize, offset]);

    var rows = await db.query(dataSql, dataValues) || [];

    if (rows.length) {
        rows = rows.map(function(row) {
            if (row.coverPhoto) {
                row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
            }
            return row;
        });
    }

    return {
        rows: rows,
        total: total
    };
}

async function getDish(params) {
    if (!params || !params.dishId) {
        return null;
    }

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var sql = `
        SELECT d.*, r.name AS restaurantName
        FROM dishes d
        JOIN restaurants r ON d.restaurantId = r.restaurantId
        WHERE d.dishId = ?
    `;
    var vals = [params.dishId];

    if (!isAdmin) {
        sql += " AND d.status = 'approved' AND r.status = 'approved'";
    }

    var rows = await db.query(sql, vals);
    if (!rows || !rows.length) {
        return null;
    }

    var dish = rows[0];
    if (dish.coverPhoto) {
        dish.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + dish.coverPhoto;
    }
    return dish;
}

async function setDishScores() {
    var connection = await db.getConnection();
    try {
        var [dishRows] = await connection.query('SELECT dishId FROM dishes');
        var chunkSize = 100;
        for (var i = 0; i < dishRows.length; i += chunkSize) {
            var dishIds = dishRows.slice(i, i + chunkSize).map(d => d.dishId);
            if (!dishIds.length) continue;

            var updateSql = `
                UPDATE dishes d
                JOIN (
                    SELECT
                        r.dishId,
                        SUM(r.rating * 
                            (CASE
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 DAY)) * 1000 THEN 4
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 6 MONTH)) * 1000 THEN 2
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 1 YEAR)) * 1000 THEN 1
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 2 YEAR)) * 1000 THEN 0.5
                                ELSE 0
                            END)
                        ) / NULLIF(SUM(
                            (CASE
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 DAY)) * 1000 THEN 4
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 6 MONTH)) * 1000 THEN 2
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 1 YEAR)) * 1000 THEN 1
                                WHEN r.submitted >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 2 YEAR)) * 1000 THEN 0.5
                                ELSE 0
                            END)
                        ),0) AS score,
                        COUNT(*) AS reviewCount
                    FROM reviews r
                    WHERE r.dishId IN (?)
                    GROUP BY r.dishId
                ) scores ON d.dishId = scores.dishId
                SET d.score = scores.score,
                    d.reviewCount = scores.reviewCount
                WHERE d.dishId IN (?)
            `;
            await connection.query(updateSql, [dishIds, dishIds]);
        }
    } finally {
        connection.release();
    }
}

module.exports = {
    getDishes: getDishes,
    getDish: getDish,
    setDishScores: setDishScores
};

setDishScores();