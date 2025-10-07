var db = require('../connections');
var config = require('../config');

function normalizeIdList(value) {
    if (value === undefined) {
        return undefined;
    }

    var list;
    if (Array.isArray(value)) {
        list = value;
    } else if (value === null || value === '') {
        list = [];
    } else if (typeof value === 'string') {
        list = value.split(',').map(function(part) {
            return part.trim();
        });
    } else {
        list = [value];
    }

    var normalized = [];
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (item === null || item === undefined || item === '') continue;
        var num = Number(item);
        if (!isNaN(num)) {
            var intVal = parseInt(num, 10);
            if (!isNaN(intVal) && intVal > 0) {
                normalized.push(intVal);
            }
        }
    }

    if (!normalized.length) {
        return [];
    }

    var seen = {};
    var unique = [];
    for (var j = 0; j < normalized.length; j++) {
        var val = normalized[j];
        if (!seen[val]) {
            seen[val] = true;
            unique.push(val);
        }
    }
    return unique;
}

async function replaceDishMappings(connection, dishId, ids, tableName, columnName) {
    await connection.query('DELETE FROM ' + tableName + ' WHERE dishId = ?', [dishId]);
    if (!ids || !ids.length) {
        return;
    }

    var placeholders = ids.map(function() { return '(?, ?)'; }).join(', ');
    var params = [];
    for (var i = 0; i < ids.length; i++) {
        params.push(dishId, ids[i]);
    }
    await connection.query('INSERT INTO ' + tableName + ' (dishId, ' + columnName + ') VALUES ' + placeholders, params);
}

function escapeLikePattern(value) {
    return value.replace(/[\\%_]/g, function(char) {
        return '\\' + char;
    });
}

async function getDishMetadata(dishId) {
    if (!dishId) {
        return {
            categories: [],
            dishTypes: [],
            tags: []
        };
    }

    var metadataQueries = await Promise.all([
        db.query(
            `SELECT c.categoryId, c.category
             FROM dishes_categories dc
             JOIN categories c ON dc.categoryId = c.categoryId
             WHERE dc.dishId = ?
             ORDER BY c.category`,
            [dishId]
        ),
        db.query(
            `SELECT dt.dishTypeId, dt.dishType
             FROM dishes_dishTypes dd
             JOIN dishTypes dt ON dd.dishTypeId = dt.dishTypeId
             WHERE dd.dishId = ?
             ORDER BY dt.dishType`,
            [dishId]
        ),
        db.query(
            `SELECT t.tagId, t.tag
             FROM dishes_tags dtag
             JOIN tags t ON dtag.tagId = t.tagId
             WHERE dtag.dishId = ?
             ORDER BY t.tag`,
            [dishId]
        )
    ]);

    return {
        categories: metadataQueries[0] || [],
        dishTypes: metadataQueries[1] || [],
        tags: metadataQueries[2] || []
    };
}

async function getDishMetadataOptions() {
    var metadataRows = await Promise.all([
        db.query('SELECT categoryId, category FROM categories ORDER BY category'),
        db.query('SELECT dishTypeId, dishType FROM dishTypes ORDER BY dishType'),
        db.query('SELECT tagId, tag FROM tags ORDER BY tag')
    ]);

    return {
        categories: metadataRows[0] || [],
        dishTypes: metadataRows[1] || [],
        tags: metadataRows[2] || []
    };
}

function normalizeFieldSelection(value) {
    if (value === undefined || value === null) {
        return [];
    }

    var list;
    if (typeof value === 'string') {
        try {
            var parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                list = parsed;
            }
        } catch (err) {
            list = undefined;
        }
    }

    if (!list) {
        list = Array.isArray(value) ? value : [value];
    }

    var normalized = [];
    for (var i = 0; i < list.length; i++) {
        var field = list[i];
        if (field === undefined || field === null) continue;
        var str = String(field).trim();
        if (!str) continue;
        if (!/^[a-zA-Z0-9_]+$/.test(str)) continue;
        if (normalized.indexOf(str) === -1) {
            normalized.push(str);
        }
    }
    return normalized;
}

async function getDishes(params) {
    params = params || {};
    var selectFields = normalizeFieldSelection(params.fields);
    var altFields = normalizeFieldSelection(params['fields[]']);
    if (altFields.length) {
        for (var i = 0; i < altFields.length; i++) {
            if (selectFields.indexOf(altFields[i]) === -1) {
                selectFields.push(altFields[i]);
            }
        }
    }

    var selectClause = '';
    if (selectFields && selectFields.length) {
        selectClause = selectFields.map(function(field) {
            return 'd.' + field;
        }).join(', ');
    } else {
        selectClause = 'd.*';
    }

    selectClause += ', r.name as restaurantName';

    var selectExtra = '';
    var selectExtraValues = [];

    var fromClause = ' FROM dishes d JOIN restaurants r ON d.restaurantId = r.restaurantId';
    var whereClauses = ['1=1'];
    var whereValues = [];

    var userAdminFlag = params && params.auth && params.auth.user ? params.auth.user.isAdmin : 0;
    var isAdmin = userAdminFlag === 1;
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldApplyLocationFilters = !(isAdmin && statusFilter);
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

    if (lat && lng && !params.ignoreRadius && shouldApplyLocationFilters) {
        whereClauses.push(`d.restaurantId IN (
            SELECT restaurantId FROM restaurants
            WHERE ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) <= 48280
        )`);
        whereValues.push('POINT(' + lat + ' ' + lng + ')');
    }

    if (lat && lng && params.useLocation == '1' && shouldApplyLocationFilters) {
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
    if (lat && lng && params.useLocation == '1' && shouldApplyLocationFilters) {
        orderClause = ' ORDER BY distance ASC';
    }

    var dataSql = 'SELECT ' + selectClause + selectExtra + fromClause + whereSql + orderClause + ' LIMIT ? OFFSET ?';
    var dataValues = selectExtraValues.slice();
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

    var metadata = await getDishMetadata(dish.dishId);
    dish.categories = metadata.categories;
    dish.dishTypes = metadata.dishTypes;
    dish.tags = metadata.tags;

    return dish;
}

async function setDishScores(dishId) {
    var connection = await db.getConnection();
    try {
        var chunkSize = 100;
        var batches = [];

        if (dishId !== undefined && dishId !== null) {
            var normalizedId = dishId;
            if (typeof normalizedId === 'string') {
                normalizedId = normalizedId.trim();
            }

            if (normalizedId !== '' && normalizedId !== null) {
                batches.push([normalizedId]);
            } else {
                return;
            }
        } else {
            var [dishRows] = await connection.query('SELECT dishId FROM dishes');
            for (var i = 0; i < dishRows.length; i += chunkSize) {
                var dishIds = dishRows.slice(i, i + chunkSize).map(function(d) { return d.dishId; });
                if (dishIds.length) {
                    batches.push(dishIds);
                }
            }
        }

        if (!batches.length) {
            return;
        }

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

        for (var b = 0; b < batches.length; b++) {
            await connection.query(updateSql, [batches[b], batches[b]]);
        }
    } finally {
        connection.release();
    }
}

async function updateDish(params) {
    params = params || {};

    var err;
    var dishId = params.dishId;
    if (!dishId) {
        err = new Error('Missing dishId');
        err.status = 400;
        throw err;
    }

    var shouldUpdateStatus = Object.prototype.hasOwnProperty.call(params, 'status');
    var statusValue = shouldUpdateStatus ? String(params.status || '').toLowerCase() : undefined;
    if (shouldUpdateStatus && ['approved', 'rejected', 'pending'].indexOf(statusValue) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var categories = normalizeIdList(params.categories);
    var dishTypes = normalizeIdList(params.dishTypes);
    var tags = normalizeIdList(params.tags);
    var shouldUpdateMetadata = categories !== undefined || dishTypes !== undefined || tags !== undefined;

    if (!shouldUpdateStatus && !shouldUpdateMetadata) {
        return { updated: false };
    }

    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        var dishRowsResult = await connection.query('SELECT dishId FROM dishes WHERE dishId = ? FOR UPDATE', [dishId]);
        var dishRows = Array.isArray(dishRowsResult) ? dishRowsResult[0] : dishRowsResult;
        if (!dishRows || !dishRows.length) {
            err = new Error('Dish not found');
            err.status = 404;
            throw err;
        }

        if (shouldUpdateStatus) {
            var approverUserId = params?.auth?.user?.userId || null;
            var nowMs = Date.now();
            var statusUpdated = statusValue === 'pending' ? null : nowMs;
            var statusUpdatedBy = statusValue === 'pending' ? null : approverUserId;
            var statusSql = 'UPDATE dishes SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE dishId = ?';
            var statusResult = await connection.query(statusSql, [statusValue, statusUpdated, statusUpdatedBy, dishId]);
            var statusAffected = Array.isArray(statusResult) ? statusResult[0] && statusResult[0].affectedRows : statusResult && statusResult.affectedRows;
            if (!statusAffected) {
                err = new Error('Dish not found');
                err.status = 404;
                throw err;
            }
        }

        if (shouldUpdateMetadata) {
            if (categories !== undefined) {
                await replaceDishMappings(connection, dishId, categories, 'dishes_categories', 'categoryId');
            }
            if (dishTypes !== undefined) {
                await replaceDishMappings(connection, dishId, dishTypes, 'dishes_dishTypes', 'dishTypeId');
            }
            if (tags !== undefined) {
                await replaceDishMappings(connection, dishId, tags, 'dishes_tags', 'tagId');
            }
        }

        await connection.commit();
    } catch (e) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            // ignore rollback errors
        }
        throw e;
    } finally {
        connection.release();
    }

    return { updated: true };
}

module.exports = {
    getDishes: getDishes,
    getDish: getDish,
    getDishMetadataOptions: getDishMetadataOptions,
    setDishScores: setDishScores,
    updateDish: updateDish
};
