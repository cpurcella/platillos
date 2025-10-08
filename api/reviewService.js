var db = require('../connections');
var crypto = require('crypto');
var axios = require('axios');
var config = require('../config');
var dishService = require('./dishService');

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending']);

function hasProp(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeStatus(rawStatus) {
    if (rawStatus === undefined) {
        return undefined;
    }
    var status = String(rawStatus || '').toLowerCase();
    if (!VALID_STATUSES.has(status)) {
        var err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }
    return status;
}

function resolveAuditColumns(status, userId) {
    if (status === undefined) {
        return [];
    }
    if (status === 'pending') {
        return [status, null, null];
    }
    var now = Date.now();
    return [status, now, userId || null];
}

function normalizeRating(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    var num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) {
        var err = new Error('Invalid rating');
        err.status = 400;
        throw err;
    }
    if (num < 0) num = 0;
    if (num > 10) num = 10;
    return Math.round(num * 10) / 10;
}

function normalizeString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return String(value);
}

async function hasRecentReview(dishId, userId) {
    var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    var sql = `
        SELECT COUNT(*) AS reviewCount
        FROM reviews
        WHERE dishId = ? AND submittedBy = ? AND submitted >= ?
    `;
    var params = [dishId, userId, thirtyDaysAgo];
    var [result] = await db.query(sql, params);

    return result.reviewCount > 0;
}

async function getOrCreateCityId(connection, cityName) {
    if(!connection) {
        connection = db.getConnection();
    }
    var name = (cityName || '').trim();
    if (!name) name = 'Unknown';
    var rows = await db.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    if (rows && rows.length) return rows[0].cityId;
    var insert = await db.query('INSERT INTO cities (city) VALUES (?)', [name]);
    return insert[0].insertId;
}

async function geocodeRestaurantLocation(restaurantData) {
    if (!restaurantData || !config.googleMapsKey) {
        return null;
    }

    var parts = [restaurantData.address, restaurantData.city, restaurantData.state, restaurantData.zip]
        .map(function(part) {
            return typeof part === 'string' ? part.trim() : (part || '');
        })
        .filter(function(part) {
            return Boolean(part);
        });

    if (!parts.length) {
        return null;
    }

    var formattedAddress = parts.join(', ');

    try {
        var response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: formattedAddress,
                key: config.googleMapsKey
            }
        });

        if (response.data && Array.isArray(response.data.results) && response.data.results.length) {
            var location = response.data.results[0].geometry && response.data.results[0].geometry.location;
            if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
                return {
                    lat: location.lat,
                    lng: location.lng
                };
            }
        }
    } catch (err) {
        console.error('[reviewService] Failed to geocode restaurant address:', err.message || err);
    }

    return null;
}

async function saveReview(allParams) {
    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        var userId = allParams.auth.user.userId;
        var nowMs = Date.now();

        var isNewRestaurant = String(allParams.newRestaurant).toLowerCase() === 'true';
        var isNewDish = String(allParams.newDish).toLowerCase() === 'true';

        var photoPayload = allParams.photos;
        if (!photoPayload && allParams['photos[]']) {
            photoPayload = allParams['photos[]'];
        }
        if (typeof photoPayload === 'string') {
            try {
                photoPayload = JSON.parse(photoPayload);
            } catch (err) {
                photoPayload = [];
            }
        }
        if (!Array.isArray(photoPayload)) {
            photoPayload = [];
        }
        allParams.photos = photoPayload;

        var restaurantId = allParams.restaurantId || null;
        if (isNewRestaurant && allParams.newRestaurantData) {
            var cityId = await getOrCreateCityId(connection, allParams.newRestaurantData.city);
            restaurantId = crypto.randomUUID();

            var geocodeResult = await geocodeRestaurantLocation(allParams.newRestaurantData);
            var lat = 0;
            var lng = 0;
            if (geocodeResult) {
                var parsedLat = parseFloat(geocodeResult.lat);
                var parsedLng = parseFloat(geocodeResult.lng);
                if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                    lat = parsedLat;
                    lng = parsedLng;
                }
            }

            await connection.query(
                `
                INSERT INTO restaurants
                    (restaurantId, name, cityId, address, zip, lat, lng, submitted, submittedBy, status, statusUpdated, statusUpdatedBy)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    restaurantId,
                    allParams.newRestaurantData.name || '',
                    cityId,
                    allParams.newRestaurantData.address || '',
                    allParams.newRestaurantData.zip || '',
                    lat,
                    lng,
                    nowMs,
                    userId,
                    'pending',
                    null,
                    null
                ]
            );
        }

        var finalDishId = allParams.dishId || null;
        if (isNewDish && allParams.newDishData) {
            if (!restaurantId) {
                throw new Error('Restaurant is required to add a new dish.');
            }
            var dishId = crypto.randomUUID();
            await connection.query(
                `
                INSERT INTO dishes
                    (dishId, restaurantId, name, submitted, submittedBy, status, statusUpdated, statusUpdatedBy)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [dishId, restaurantId, allParams.newDishData.name || '', nowMs, userId, 'pending', null, null]
            );
            finalDishId = dishId;
        }

        if (!finalDishId) {
            throw new Error('Dish is required.');
        }

        if (!isNewDish) {
            var hasReview = await hasRecentReview(finalDishId, userId);
            if (hasReview) {
                var err = new Error('You have already submitted a review for this dish within the last 30 days.');
                err.status = 400;
                throw err;
            }
        }

        var reviewData = {
            rating: allParams.rating,
            reviewContent: allParams.review,
            modifications: allParams.modifications,
            dishId: finalDishId,
            submittedBy: userId,
            submitted: nowMs
        };

        var sql = `
            INSERT INTO reviews (rating, review, modifications, dishId, submittedBy, submitted)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        var params = [
            reviewData.rating,
            reviewData.reviewContent,
            reviewData.modifications,
            reviewData.dishId,
            reviewData.submittedBy,
            reviewData.submitted
        ];
        var result = await connection.query(sql, params);
        var reviewId = result[0].insertId;

        if (allParams.photos && allParams.photos.length) {
            var photoSql = `
                INSERT INTO reviews_photos (reviewId, fileId)
                VALUES ?
            `;
            var photoParams = allParams.photos.map(function(fileId) {
                return [reviewId, fileId];
            });
            await connection.query(photoSql, [photoParams]);
        }

        await connection.commit();
        return reviewId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
async function getReviews(params) {
    params = params || {};
    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) page = 1;
    var offset = (page - 1) * pageSize;

    var selectClause = `
        SELECT
            r.reviewId, r.rating, r.review AS reviewContent, r.modifications, r.dishId, r.submittedBy, r.submitted,
            r.status, r.statusUpdated, r.statusUpdatedBy,
            d.name AS dishName, s.name AS restaurantName,
            u.firstName, u.lastName, u.email
    `;
    var fromClause = `
        FROM reviews r
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        JOIN users u ON r.submittedBy = u.userId
    `;

    var whereClauses = ['1=1'];
    var whereValues = [];

    if (params.reviewId) {
        whereClauses.push('r.reviewId = ?');
        whereValues.push(params.reviewId);
    }
    if (params.userId) {
        whereClauses.push('r.submittedBy = ?');
        whereValues.push(params.userId);
    }
    if (params.dishId) {
        whereClauses.push('r.dishId = ?');
        whereValues.push(params.dishId);
    }

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';
    var normalizedStatusExpr = "LOWER(COALESCE(r.status, 'pending'))";

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push(normalizedStatusExpr + " = 'pending'");
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        whereClauses.push(normalizedStatusExpr + ' = ?');
        whereValues.push(statusFilter);
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total ' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = countRows.length ? countRows[0].total : 0;

    var dataSql = selectClause + fromClause + whereSql + ' ORDER BY r.submitted DESC LIMIT ? OFFSET ?';
    var dataValues = whereValues.slice();
    dataValues.push(pageSize, offset);
    var reviews = await db.query(dataSql, dataValues) || [];

    if (reviews.length) {
        var reviewIds = reviews.map(function(r) { return r.reviewId; });
        if (reviewIds.length) {
            var photoRows = await db.query('SELECT reviewId, fileId FROM reviews_photos WHERE reviewId IN (?)', [reviewIds]) || [];
            var photosByReview = {};
            for (var i = 0; i < photoRows.length; i++) {
                var pr = photoRows[i];
                photosByReview[pr.reviewId] = photosByReview[pr.reviewId] || [];
                photosByReview[pr.reviewId].push(pr.fileId);
            }
            for (var j = 0; j < reviews.length; j++) {
                var rv = reviews[j];
                rv.photos = photosByReview[rv.reviewId] || [];
            }
        }
    }

    return {
        rows: reviews,
        total: total
    };
}

async function getReviewsForDish(params) {
    if (!params || !params.dishId) {
        var err = new Error('dishId is required');
        err.status = 400;
        throw err;
    }

    var queryParams = Object.assign({}, params);
    var hasPagination = queryParams.page !== undefined || queryParams.pageSize !== undefined;
    if (!hasPagination) {
        queryParams.pageSize = 50;
        queryParams.page = 1;
    }

    queryParams.dishId = params.dishId;
    return getReviews(queryParams);
}

async function updateReview(params) {
    params = params || {};

    var reviewId = params.reviewId || params.id;
    if (!reviewId) {
        var missingErr = new Error('Missing reviewId');
        missingErr.status = 400;
        throw missingErr;
    }

    var statusValue = normalizeStatus(params.status);
    var ratingValue = normalizeRating(params.rating);
    var reviewProvided = hasProp(params, 'review') || hasProp(params, 'reviewContent');
    var reviewValue = reviewProvided
        ? normalizeString(hasProp(params, 'reviewContent') ? params.reviewContent : params.review)
        : undefined;
    var modificationsProvided = hasProp(params, 'modifications');
    var modificationsValue = modificationsProvided ? normalizeString(params.modifications) : undefined;

    if (
        statusValue === undefined &&
        ratingValue === undefined &&
        reviewValue === undefined &&
        modificationsValue === undefined
    ) {
        return { updated: false };
    }

    if (ratingValue === null) {
        var ratingErr = new Error('Rating is required');
        ratingErr.status = 400;
        throw ratingErr;
    }

    var connection = await db.getConnection();
    var previousStatus;
    var dishId;
    try {
        await connection.beginTransaction();

        var rowsResult = await connection.query('SELECT reviewId, dishId, status FROM reviews WHERE reviewId = ? FOR UPDATE', [reviewId]);
        var rows = Array.isArray(rowsResult) ? rowsResult[0] : rowsResult;
        if (!rows || !rows.length) {
            var notFoundErr = new Error('Review not found');
            notFoundErr.status = 404;
            throw notFoundErr;
        }

        var reviewRow = rows[0];
        previousStatus = String(reviewRow.status || 'pending').toLowerCase();
        dishId = reviewRow.dishId;

        var updates = [];
        var values = [];

        if (ratingValue !== undefined) {
            updates.push('rating = ?');
            values.push(ratingValue);
        }

        if (reviewValue !== undefined) {
            updates.push('review = ?');
            values.push(reviewValue);
        }

        if (modificationsValue !== undefined) {
            updates.push('modifications = ?');
            values.push(modificationsValue);
        }

        if (statusValue !== undefined) {
            var audit = resolveAuditColumns(statusValue, params?.auth?.user?.userId);
            updates.push('status = ?', 'statusUpdated = ?', 'statusUpdatedBy = ?');
            values.push(audit[0], audit[1], audit[2]);
        }

        if (!updates.length) {
            await connection.rollback();
            return { updated: false };
        }

        values.push(reviewId);
        var sql = 'UPDATE reviews SET ' + updates.join(', ') + ' WHERE reviewId = ?';
        await connection.query(sql, values);

        await connection.commit();
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            // ignore rollback errors
        }
        throw err;
    } finally {
        connection.release();
    }

    var shouldRecalculate = false;
    if (statusValue !== undefined) {
        shouldRecalculate = statusValue === 'approved';
    } else if (ratingValue !== undefined && previousStatus === 'approved') {
        shouldRecalculate = true;
    }

    if (shouldRecalculate && dishId) {
        try {
            await dishService.setDishScores(dishId);
        } catch (scoreErr) {
            console.error('[reviewService] Failed to update dish scores after review update:', scoreErr);
        }
    }

    return { updated: true };
}

module.exports = {
    saveReview: saveReview,
    hasRecentReview: hasRecentReview,
    getReviews: getReviews,
    getReviewsForDish: getReviewsForDish,
    updateReview: updateReview
};
