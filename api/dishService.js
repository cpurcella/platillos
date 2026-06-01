var db = require('../connections');
var config = require('../config');
var searchAi = require('../ai/search');
var locationHelper = require('./locationHelper');
var paginationHelper = require('./paginationHelper');

var DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTimestamp(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    var timestamp = typeof value === 'number' ? value : Number(value);
    if (!isFinite(timestamp)) {
        return null;
    }
    return timestamp;
}

function subtractCalendarMonths(timestamp, months) {
    var d = new Date(timestamp);
    var originalDate = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - months);
    var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDate, lastDay));
    return d.getTime();
}

function subtractCalendarYears(timestamp, years) {
    var d = new Date(timestamp);
    var originalMonth = d.getMonth();
    var originalDate = d.getDate();
    d.setDate(1);
    d.setFullYear(d.getFullYear() - years);
    d.setMonth(originalMonth);
    var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDate, lastDay));
    return d.getTime();
}

function getDishScoreThresholds(referenceMs) {
    var reference = normalizeTimestamp(referenceMs);
    if (reference === null) {
        reference = Date.now();
    }

    return [
        { threshold: reference - (30 * DAY_MS), weight: 4 },
        { threshold: subtractCalendarMonths(reference, 6), weight: 2 },
        { threshold: subtractCalendarYears(reference, 1), weight: 1 },
        { threshold: subtractCalendarYears(reference, 2), weight: 0.5 }
    ];
}

function getDishScoreWeight(submitted, referenceMs) {
    var submittedMs = normalizeTimestamp(submitted);
    if (submittedMs === null) {
        return 0;
    }

    var thresholds = getDishScoreThresholds(referenceMs);
    for (var i = 0; i < thresholds.length; i++) {
        if (submittedMs >= thresholds[i].threshold) {
            return thresholds[i].weight;
        }
    }
    return 0;
}

function roundDishScore(value) {
    if (value === null || value === undefined || !isFinite(value)) {
        return null;
    }
    return Math.round(value * 10) / 10;
}

function calculateDishScore(reviews, referenceMs) {
    if (!Array.isArray(reviews) || !reviews.length) {
        return null;
    }

    var weightedTotal = 0;
    var weightTotal = 0;
    for (var i = 0; i < reviews.length; i++) {
        var rating = typeof reviews[i].rating === 'number' ? reviews[i].rating : Number(reviews[i].rating);
        if (!isFinite(rating)) {
            continue;
        }

        var weight = getDishScoreWeight(reviews[i].submitted, referenceMs);
        if (!weight) {
            continue;
        }

        weightedTotal += rating * weight;
        weightTotal += weight;
    }

    if (!weightTotal) {
        return null;
    }

    return roundDishScore(weightedTotal / weightTotal);
}

function buildDishScoreWeightSql(submittedColumn) {
    return `(CASE
                            WHEN ${submittedColumn} >= ? THEN 4
                            WHEN ${submittedColumn} >= ? THEN 2
                            WHEN ${submittedColumn} >= ? THEN 1
                            WHEN ${submittedColumn} >= ? THEN 0.5
                            ELSE 0
                        END)`;
}

function buildDishScoreTrend(rows, referenceMs) {
    var scoreCalculatedAt = normalizeTimestamp(referenceMs);
    if (scoreCalculatedAt === null) {
        scoreCalculatedAt = Date.now();
    }

    var reviews = (rows || []).map(function(row) {
        return {
            reviewId: row.reviewId,
            rating: typeof row.rating === 'number' ? row.rating : Number(row.rating),
            submitted: normalizeTimestamp(row.submitted)
        };
    }).filter(function(row) {
        return row.submitted !== null && isFinite(row.rating);
    }).sort(function(a, b) {
        if (a.submitted !== b.submitted) {
            return a.submitted - b.submitted;
        }
        return (a.reviewId || 0) - (b.reviewId || 0);
    });

    var includedReviews = [];
    var trendReviews = reviews.map(function(review) {
        includedReviews.push(review);
        return {
            reviewId: review.reviewId,
            rating: review.rating,
            submitted: review.submitted,
            rollingScore: calculateDishScore(includedReviews, review.submitted)
        };
    });

    return {
        reviews: trendReviews,
        currentScore: calculateDishScore(reviews, scoreCalculatedAt),
        scoreCalculatedAt: scoreCalculatedAt
    };
}

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

function normalizeItemType(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    var itemType = String(value).toLowerCase();
    if (itemType !== 'food' && itemType !== 'drink') {
        var err = new Error('Invalid item type');
        err.status = 400;
        throw err;
    }
    return itemType;
}

async function insertDishMappings(connection, dishId, ids, tableName, columnName) {
    if (!ids || !ids.length) {
        return;
    }

    var placeholders = ids.map(function() { return '(?, ?)'; }).join(', ');
    var params = [];
    for (var i = 0; i < ids.length; i++) {
        params.push(dishId, ids[i]);
    }
    await connection.query('INSERT IGNORE INTO ' + tableName + ' (dishId, ' + columnName + ') VALUES ' + placeholders, params);
}

async function replaceDishMappings(connection, dishId, ids, tableName, columnName) {
    await connection.query('DELETE FROM ' + tableName + ' WHERE dishId = ?', [dishId]);
    await insertDishMappings(connection, dishId, ids, tableName, columnName);
}

async function addDishMetadata(connection, dishId, metadata) {
    metadata = metadata || {};
    await insertDishMappings(connection, dishId, normalizeIdList(metadata.categories), 'dishes_categories', 'categoryId');
    await insertDishMappings(connection, dishId, normalizeIdList(metadata.dishTypes), 'dishes_dishTypes', 'dishTypeId');
    await insertDishMappings(connection, dishId, normalizeIdList(metadata.tags), 'dishes_tags', 'tagId');
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
    } else if (statusFilter === 'needs_review') {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("d.status = 'needs_review'");
    } else if (statusFilter === 'out_of_area') {
        if (!isAdmin) {
            var outOfAreaErr = new Error('Forbidden');
            outOfAreaErr.status = 403;
            throw outOfAreaErr;
        }
        whereClauses.push("d.status = 'out_of_area'");
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

    var itemType = normalizeItemType(params.itemType);
    if (itemType) {
        whereClauses.push('d.itemType = ?');
        whereValues.push(itemType);
    }

    if (params.prefix) {
        whereClauses.push('d.name LIKE ?');
        whereValues.push(params.prefix + '%');
    }

    var searchMappings = null;
    var hasMetadataSearch = false;

    if (typeof params.search === 'string') {
        var searchTerm = params.search.trim();
        if (searchTerm) {
            try {
                searchMappings = await searchAi.getSearchMappings(searchTerm);
            } catch (mappingErr) {
                console.error('[search] AI mapping error:', mappingErr.message || mappingErr);
            }

            var likeValue = '%' + escapeLikePattern(searchTerm) + '%';

            if (searchMappings) {
                hasMetadataSearch = true;
                // Build subqueries for each metadata dimension
                var relevanceParts = ['(CASE WHEN d.name LIKE ? OR r.name LIKE ? THEN 1.0 ELSE 0 END)'];
                var relevanceValues = [likeValue, likeValue];
                var matchConditions = ['d.name LIKE ?', 'r.name LIKE ?'];
                var matchValues = [likeValue, likeValue];

                if (searchMappings.categories && searchMappings.categories.length) {
                    var catCases = searchMappings.categories.map(function(c) {
                        relevanceValues.push(c.id);
                        return 'WHEN dc_search.categoryId = ? THEN ' + parseFloat(c.weight);
                    });
                    relevanceParts.push('COALESCE((SELECT MAX(CASE ' + catCases.join(' ') + ' ELSE 0 END) FROM dishes_categories dc_search WHERE dc_search.dishId = d.dishId), 0)');
                    var catIds = searchMappings.categories.map(function(c) { return c.id; });
                    matchConditions.push('EXISTS (SELECT 1 FROM dishes_categories dc_match WHERE dc_match.dishId = d.dishId AND dc_match.categoryId IN (' + catIds.map(function() { return '?'; }).join(',') + '))');
                    matchValues = matchValues.concat(catIds);
                }

                if (searchMappings.dishTypes && searchMappings.dishTypes.length) {
                    var dtCases = searchMappings.dishTypes.map(function(dt) {
                        relevanceValues.push(dt.id);
                        return 'WHEN ddt_search.dishTypeId = ? THEN ' + parseFloat(dt.weight);
                    });
                    relevanceParts.push('COALESCE((SELECT MAX(CASE ' + dtCases.join(' ') + ' ELSE 0 END) FROM dishes_dishTypes ddt_search WHERE ddt_search.dishId = d.dishId), 0)');
                    var dtIds = searchMappings.dishTypes.map(function(dt) { return dt.id; });
                    matchConditions.push('EXISTS (SELECT 1 FROM dishes_dishTypes ddt_match WHERE ddt_match.dishId = d.dishId AND ddt_match.dishTypeId IN (' + dtIds.map(function() { return '?'; }).join(',') + '))');
                    matchValues = matchValues.concat(dtIds);
                }

                if (searchMappings.tags && searchMappings.tags.length) {
                    var tagCases = searchMappings.tags.map(function(t) {
                        relevanceValues.push(t.id);
                        return 'WHEN dt_search.tagId = ? THEN ' + parseFloat(t.weight);
                    });
                    relevanceParts.push('COALESCE((SELECT MAX(CASE ' + tagCases.join(' ') + ' ELSE 0 END) FROM dishes_tags dt_search WHERE dt_search.dishId = d.dishId), 0)');
                    var tagIds = searchMappings.tags.map(function(t) { return t.id; });
                    matchConditions.push('EXISTS (SELECT 1 FROM dishes_tags dt_match WHERE dt_match.dishId = d.dishId AND dt_match.tagId IN (' + tagIds.map(function() { return '?'; }).join(',') + '))');
                    matchValues = matchValues.concat(tagIds);
                }

                selectExtra += ', (' + relevanceParts.join(' + ') + ') AS relevance';
                selectExtraValues = selectExtraValues.concat(relevanceValues);
                whereClauses.push('(' + matchConditions.join(' OR ') + ')');
                whereValues = whereValues.concat(matchValues);
            } else {
                whereClauses.push('(d.name LIKE ? OR r.name LIKE ?)');
                whereValues.push(likeValue, likeValue);
            }
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
            WHERE ST_Distance_Sphere(coords, ${locationHelper.pointFromWktSql()}) <= 80467
        )`);
        whereValues.push(locationHelper.buildPointWkt(lat, lng));
    }

    var hasLocation = lat && lng && shouldApplyLocationFilters;
    if (hasLocation) {
        selectExtra += ', ST_Distance_Sphere(coords, ' + locationHelper.pointFromWktSql() + ') AS distance';
        selectExtraValues.push(locationHelper.buildPointWkt(lat, lng));
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = countRows.length ? countRows[0].total : 0;

    var pagination = paginationHelper.normalizePagination(params, 10);
    var pageSize = pagination.pageSize;
    var offset = pagination.offset;

    var sort = params.sort ? String(params.sort) : '';
    var orderClause = '';
    if (sort === 'score') {
        orderClause = ' ORDER BY d.score DESC, d.reviewCount DESC';
    } else if (sort === 'reviews') {
        orderClause = ' ORDER BY d.reviewCount DESC, d.score DESC';
    } else if (sort === 'nearest' && hasLocation) {
        orderClause = ' ORDER BY distance ASC';
    } else if (sort === 'newest') {
        orderClause = ' ORDER BY d.submitted DESC';
    } else if (hasLocation && params.useLocation == '1') {
        orderClause = ' ORDER BY distance ASC';
    } else if (hasMetadataSearch) {
        orderClause = ' ORDER BY relevance DESC, d.score DESC, d.reviewCount DESC';
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

    // Watchlist check for logged-in user
    var userId = params.auth && params.auth.user ? params.auth.user.userId : null;
    if (userId) {
        var wRows = await db.query(
            'SELECT 1 FROM userWatchlist WHERE userId = ? AND dishId = ? LIMIT 1',
            [userId, dish.dishId]
        );
        dish.isOnWatchlist = wRows.length > 0;
    }

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

        var scoreWeightSql = buildDishScoreWeightSql('r.submitted');
        var updateSql = `
            UPDATE dishes d
            JOIN (
                SELECT
                    r.dishId,
                    SUM(r.rating * ${scoreWeightSql}) / NULLIF(SUM(${scoreWeightSql}), 0) AS score,
                    COUNT(*) AS reviewCount
                FROM reviews r
                WHERE r.dishId IN (?) AND r.status = 'approved'
                GROUP BY r.dishId
            ) scores ON d.dishId = scores.dishId
            SET d.score = scores.score,
                d.reviewCount = scores.reviewCount
            WHERE d.dishId IN (?)
        `;

        for (var b = 0; b < batches.length; b++) {
            var thresholds = getDishScoreThresholds();
            var thresholdValues = thresholds.map(function(item) { return item.threshold; });
            var scoreParams = thresholdValues.concat(thresholdValues, [batches[b], batches[b]]);
            await connection.query(updateSql, scoreParams);
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
    if (shouldUpdateStatus && ['approved', 'rejected', 'pending', 'needs_review', 'out_of_area'].indexOf(statusValue) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var shouldUpdateName = Object.prototype.hasOwnProperty.call(params, 'name');
    var nameValue = shouldUpdateName ? String(params.name || '').trim() : undefined;
    if (shouldUpdateName && !nameValue) {
        err = new Error('Dish name cannot be empty');
        err.status = 400;
        throw err;
    }

    var shouldUpdateItemType = Object.prototype.hasOwnProperty.call(params, 'itemType');
    var itemTypeValue = shouldUpdateItemType ? normalizeItemType(params.itemType) : undefined;

    var categories = normalizeIdList(params.categories);
    var dishTypes = normalizeIdList(params.dishTypes);
    var tags = normalizeIdList(params.tags);
    var shouldUpdateMetadata = categories !== undefined || dishTypes !== undefined || tags !== undefined;

    if (!shouldUpdateStatus && !shouldUpdateMetadata && !shouldUpdateName && !shouldUpdateItemType) {
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
            var statusUpdated = (statusValue === 'pending' || statusValue === 'out_of_area') ? null : nowMs;
            var statusUpdatedBy = (statusValue === 'pending' || statusValue === 'out_of_area') ? null : approverUserId;
            var statusSql = 'UPDATE dishes SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE dishId = ?';
            var statusResult = await connection.query(statusSql, [statusValue, statusUpdated, statusUpdatedBy, dishId]);
            var statusAffected = Array.isArray(statusResult) ? statusResult[0] && statusResult[0].affectedRows : statusResult && statusResult.affectedRows;
            if (!statusAffected) {
                err = new Error('Dish not found');
                err.status = 404;
                throw err;
            }
        }

        if (shouldUpdateName) {
            await connection.query('UPDATE dishes SET name = ? WHERE dishId = ?', [nameValue, dishId]);
        }

        if (shouldUpdateItemType) {
            await connection.query('UPDATE dishes SET itemType = ? WHERE dishId = ?', [itemTypeValue || 'food', dishId]);
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

async function getHomeShelves(params) {
    params = params || {};
    var limit = 15;
    var userId = params.auth && params.auth.user ? params.auth.user.userId : null;

    // Location scoping: prefer user's address, fall back to browser-provided lat/lng
    var lat = null;
    var lng = null;
    if (params.auth && params.auth.user) {
        if (params.auth.user.addressLat && params.auth.user.addressLng) {
            lat = parseFloat(params.auth.user.addressLat);
            lng = parseFloat(params.auth.user.addressLng);
        }
    }
    if (!lat && !lng && params.lat && params.lng) {
        lat = parseFloat(params.lat);
        lng = parseFloat(params.lng);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            lat = null;
            lng = null;
        }
    }

    var locationFilter = '';
    var locationParams = [];
    if (lat && lng) {
        locationFilter = ` AND r.restaurantId IN (
            SELECT restaurantId FROM restaurants
            WHERE ST_Distance_Sphere(coords, ${locationHelper.pointFromWktSql()}) <= 80467
        )`;
        locationParams = [locationHelper.buildPointWkt(lat, lng)];
    }

    // Timeframe: 6 months in ms
    var sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);

    var approvedPhotoJoin = ` LEFT JOIN (
            SELECT rv.dishId, MIN(rp.fileId) AS fileId
            FROM reviews rv
            JOIN reviews_photos rp ON rv.reviewId = rp.reviewId
            WHERE rv.status = 'approved' AND rp.status = 'approved'
            GROUP BY rv.dishId
        ) rp_any ON d.dishId = rp_any.dishId`;

    var baseSql = `SELECT d.dishId, d.name, d.score, COALESCE(d.coverPhoto, rp_any.fileId) AS coverPhoto, d.reviewCount, r.name AS restaurantName
        FROM dishes d
        JOIN restaurants r ON d.restaurantId = r.restaurantId` + approvedPhotoJoin + `
        WHERE d.status = 'approved' AND r.status = 'approved'`;

    // Popular: scoped by location, only reviews in last 6 months
    var popularSql = `SELECT d.dishId, d.name, d.score, COALESCE(d.coverPhoto, rp_any.fileId) AS coverPhoto, pr.recentCount AS reviewCount, r.name AS restaurantName
        FROM dishes d
        JOIN restaurants r ON d.restaurantId = r.restaurantId
        ` + approvedPhotoJoin + `
        JOIN (
            SELECT dishId, COUNT(*) AS recentCount
            FROM reviews WHERE status = 'approved' AND submitted >= ?
            GROUP BY dishId
        ) pr ON d.dishId = pr.dishId
        WHERE d.status = 'approved' AND r.status = 'approved'` + locationFilter +
        ` ORDER BY pr.recentCount DESC, d.score DESC LIMIT ?`;
    var popularParams = [sixMonthsAgo].concat(locationParams, [limit]);

    // Top Rated: scoped by location, only reviews in last 6 months, min 2
    var topRatedSql = `SELECT d.dishId, d.name, tr.avgScore AS score, COALESCE(d.coverPhoto, rp_any.fileId) AS coverPhoto, tr.recentCount AS reviewCount, r.name AS restaurantName
        FROM dishes d
        JOIN restaurants r ON d.restaurantId = r.restaurantId
        ` + approvedPhotoJoin + `
        JOIN (
            SELECT dishId, AVG(rating) AS avgScore, COUNT(*) AS recentCount
            FROM reviews WHERE status = 'approved' AND submitted >= ?
            GROUP BY dishId
            HAVING recentCount >= 2
        ) tr ON d.dishId = tr.dishId
        WHERE d.status = 'approved' AND r.status = 'approved'` + locationFilter +
        ` ORDER BY tr.avgScore DESC LIMIT ?`;
    var topRatedParams = [sixMonthsAgo].concat(locationParams, [limit]);

    // Recently Reviewed: no location/time filter — shows freshest activity globally
    var recentlyReviewedSql = `SELECT d.dishId, d.name, d.score,
            COALESCE(rp_latest.fileId, d.coverPhoto) AS coverPhoto,
            d.reviewCount, r.name AS restaurantName
        FROM dishes d
        JOIN restaurants r ON d.restaurantId = r.restaurantId
        JOIN (
            SELECT dishId, MAX(submitted) AS latestReview
            FROM reviews WHERE status = 'approved'
            GROUP BY dishId
        ) lr ON d.dishId = lr.dishId
        LEFT JOIN reviews lr_rev ON lr_rev.dishId = lr.dishId AND lr_rev.submitted = lr.latestReview AND lr_rev.status = 'approved'
        LEFT JOIN (
            SELECT rp.reviewId, MIN(rp.fileId) AS fileId
            FROM reviews_photos rp WHERE rp.status = 'approved'
            GROUP BY rp.reviewId
        ) rp_latest ON lr_rev.reviewId = rp_latest.reviewId
        WHERE d.status = 'approved' AND r.status = 'approved'
        ORDER BY lr.latestReview DESC LIMIT ?`;

    // Newly Added: scoped by location
    var newlyAddedSql = baseSql + locationFilter + ` ORDER BY d.submitted DESC LIMIT ?`;
    var newlyAddedParams = locationParams.concat([limit]);

    var queries = [
        db.query(popularSql, popularParams),
        db.query(topRatedSql, topRatedParams),
        db.query(recentlyReviewedSql, [limit]),
        db.query(newlyAddedSql, newlyAddedParams)
    ];

    if (userId) {
        queries.push(
            db.query(
                `SELECT d.dishId, d.name, d.score, COALESCE(d.coverPhoto, rp_any.fileId) AS coverPhoto, d.reviewCount, r.name AS restaurantName
                FROM userWatchlist w
                JOIN dishes d ON w.dishId = d.dishId
                JOIN restaurants r ON d.restaurantId = r.restaurantId
                ` + approvedPhotoJoin + `
                WHERE w.userId = ? AND d.status = 'approved' AND r.status = 'approved'
                ORDER BY w.createdAt DESC LIMIT ?`,
                [userId, limit]
            )
        );
        // Friends' activity: dishes recently reviewed by people you follow
        queries.push(
            db.query(
                `SELECT d.dishId, d.name, d.score,
                    COALESCE(rp.fileId, d.coverPhoto) AS coverPhoto,
                    d.reviewCount, r.name AS restaurantName,
                    fr.reviewId, fr.submitted AS friendReviewedAt, u.username AS reviewerUsername
                FROM userFollows uf
                JOIN reviews fr ON uf.followingId = fr.submittedBy AND fr.status = 'approved'
                JOIN users u ON fr.submittedBy = u.userId
                JOIN dishes d ON fr.dishId = d.dishId
                JOIN restaurants r ON d.restaurantId = r.restaurantId
                LEFT JOIN (
                    SELECT reviewId, MIN(fileId) AS fileId
                    FROM reviews_photos WHERE status = 'approved'
                    GROUP BY reviewId
                ) rp ON fr.reviewId = rp.reviewId
                WHERE uf.followerId = ? AND d.status = 'approved' AND r.status = 'approved'
                ORDER BY fr.submitted DESC LIMIT ?`,
                [userId, limit]
            )
        );
    }

    var results = await Promise.all(queries);

    function resolvePhotos(rows) {
        if (!rows || !rows.length) return [];
        return rows.map(function(row) {
            if (row.coverPhoto) {
                row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
            }
            return row;
        });
    }

    var shelves = [];

    // Friends' Activity first (logged-in only, query index 5)
    if (userId && results[5] && results[5].length) {
        shelves.push({ key: 'friendsActivity', title: 'New from Friends', dishes: resolvePhotos(results[5]) });
    }

    var popularShelf = { key: 'popular', title: lat && lng ? 'Popular Near You' : 'Popular Dishes', dishes: resolvePhotos(results[0]) };
    var newlyAddedShelf = { key: 'newlyAdded', title: lat && lng ? 'Newly Added Near You' : 'Newly Added', dishes: resolvePhotos(results[3]) };
    var topRatedShelf = { key: 'topRated', title: lat && lng ? 'Top Rated Near You' : 'Top Rated', dishes: resolvePhotos(results[1]) };
    var recentlyReviewedShelf = { key: 'recentlyReviewed', title: 'Recently Reviewed', dishes: resolvePhotos(results[2]) };

    shelves.push(popularShelf, newlyAddedShelf, topRatedShelf, recentlyReviewedShelf);

    if (userId && results[4] && results[4].length) {
        shelves.push({ key: 'wantToTry', title: 'Your Want to Try', dishes: resolvePhotos(results[4]) });
    }

    return shelves.filter(function(s) { return s.dishes.length > 0; });
}

module.exports = {
    getDishes: getDishes,
    getDish: getDish,
    getDishMetadataOptions: getDishMetadataOptions,
    normalizeItemType: normalizeItemType,
    addDishMetadata: addDishMetadata,
    setDishScores: setDishScores,
    updateDish: updateDish,
    getHomeShelves: getHomeShelves,
    getDishScoreWeight: getDishScoreWeight,
    calculateDishScore: calculateDishScore,
    buildDishScoreTrend: buildDishScoreTrend
};
