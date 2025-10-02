var db = require('../connections');
var config = require('../config');


async function getDishes(params) {
    var selectFields = params.fields;

    var selectClause = '';
    var vals = [];

    if (selectFields && selectFields.length) {
        selectClause = selectFields.map(function() { return 'd.??'; }).join(', ');
        vals = vals.concat(selectFields);
    } else {
        selectClause = 'd.*';
    }

    // Always include restaurant name
    selectClause += ', r.name as restaurantName';

    var sql = 'SELECT ' + selectClause + ' FROM dishes d JOIN restaurants r ON d.restaurantId = r.restaurantId WHERE 1=1';

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        sql += " AND d.status = 'pending'";
    } else if (!isAdmin) {
        sql += " AND d.status = 'approved' AND r.status = 'approved'";
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        sql += ' AND d.status = ?';
        vals.push(statusFilter);
    }

    if (params.restaurantId) {
        sql += ' AND d.restaurantId = ?';
        vals.push(params.restaurantId);
    }

    if (params.dishId) {
        sql += ' AND d.dishId = ?';
        vals.push(params.dishId);
    }

    if (params.prefix) {
        sql += ' AND d.name LIKE ?';
        vals.push(params.prefix + '%');
    }

    // Default: filter by 30 mile radius if lat/lng is provided or in user session
    var lat, lng;
    if (params.lat && params.lng) {
        lat = parseFloat(params.lat);
        lng = parseFloat(params.lng);
    } else if (params.auth?.user?.addressLat && params.auth?.user?.addressLng) {
        lat = parseFloat(params.auth.user.addressLat);
        lng = parseFloat(params.auth.user.addressLng);
    }

    if (lat && lng && !params.ignoreRadius) {
        sql += ` AND d.restaurantId IN (
            SELECT restaurantId FROM restaurants
            WHERE ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) <= 48280
        )`;
        vals.push('POINT(' + lat + ' ' + lng + ')');
    }

    var rows = await db.query(sql, vals);

    if (rows && rows.length) {
        rows = rows.map(function(row) {
            if (row.coverPhoto) {
                row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
            }
            return row;
        });
    }
    return rows;
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