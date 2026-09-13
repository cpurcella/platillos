var db = require('../connections');
var crypto = require('crypto');
var axios = require('axios');
var config = require('../config');
var dishService = require('./dishService');
var aiJobQueue = require('../aiJobQueue');
var softLaunch = require('../softLaunch');
var paginationHelper = require('./paginationHelper');

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending', 'needs_review', 'out_of_area']);

var PUBLIC_REVIEW_SELECT = `
        SELECT
            r.reviewId, r.rating, r.review AS reviewContent, r.modifications, r.dishId, r.submitted,
        d.name AS dishName, d.itemType, s.name AS restaurantName,
            u.firstName, u.lastName, u.username, u.avatarFileId
    `;

var ADMIN_REVIEW_SELECT = `
        SELECT
            r.reviewId, r.rating, r.review AS reviewContent, r.modifications, r.dishId, r.submittedBy, r.submitted,
            r.status, r.statusUpdated, r.statusUpdatedBy, r.aiReasoning,
        d.name AS dishName, d.itemType, s.name AS restaurantName,
            u.firstName, u.lastName, u.email, u.username, u.avatarFileId
    `;

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
    if (status === 'pending' || status === 'out_of_area') {
        return [status, null, null];
    }
    var now = Date.now();
    return [status, now, userId || null];
}

function normalizeRating(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
        var requiredErr = new Error('Rating is required');
        requiredErr.status = 400;
        throw requiredErr;
    }
    var num = typeof value === 'number' ? value : Number(value);
    if (!isFinite(num) || num < 1 || num > 10) {
        var err = new Error('Rating must be between 1 and 10');
        err.status = 400;
        throw err;
    }
    return Math.round(num * 10) / 10;
}

function requireRating(value) {
    var rating = normalizeRating(value);
    if (rating === undefined) {
        var err = new Error('Rating is required');
        err.status = 400;
        throw err;
    }
    return rating;
}

function normalizeString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return String(value);
}

function stripPublicReviewFields(review) {
    delete review.submittedBy;
    delete review.status;
    delete review.statusUpdated;
    delete review.statusUpdatedBy;
    delete review.aiReasoning;
    delete review.email;
    return review;
}

async function hasRecentReview(dishId, userId) {
    var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    var sql = `
        SELECT COUNT(*) AS reviewCount
        FROM reviews
        WHERE dishId = ? AND submittedBy = ? AND submitted >= ? AND status != 'rejected'
    `;
    var params = [dishId, userId, thirtyDaysAgo];
    var [result] = await db.query(sql, params);

    return result.reviewCount > 0;
}

async function getOrCreateCityId(connection, cityName) {
    if(!connection) {
        connection = await db.getConnection();
    }
    var name = (cityName || '').trim();
    if (!name) name = 'Unknown';
    var result = await connection.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    var rows = Array.isArray(result) ? result[0] : result;
    if (rows && rows.length) return rows[0].cityId;
    var insertResult = await connection.query("INSERT INTO cities (city, state, lat, lng) VALUES (?, '', 0, 0)", [name]);
    var header = Array.isArray(insertResult) ? insertResult[0] : insertResult;
    return header && header.insertId;
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
    var ratingValue = requireRating(allParams.rating);
    function invalid(message, status) {
        var err = new Error(message);
        err.status = status || 400;
        throw err;
    }
    function submissionName(value, label) {
        var name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
        if (!name || name.length > 64) invalid(label + ' must be between 1 and 64 characters.');
        return name;
    }
    if (String(allParams.newRestaurant).toLowerCase() === 'true') {
        if (!allParams.newRestaurantData) invalid('Restaurant details are required.');
        allParams.newRestaurantData.name = submissionName(allParams.newRestaurantData.name, 'Restaurant name');
        ['address', 'city', 'zip', 'state'].forEach(function(field) {
            var limit = field === 'zip' ? 16 : 64;
            var value = allParams.newRestaurantData[field];
            if (value !== undefined && (typeof value !== 'string' || value.length > limit)) invalid('Please check the restaurant ' + field + '.');
        });
    }
    if (String(allParams.newDish).toLowerCase() === 'true') {
        if (!allParams.newDishData) invalid('Dish details are required.');
        allParams.newDishData.name = submissionName(allParams.newDishData.name, 'Dish name');
    }
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
        var holdForSoftLaunch = false;
        var awaitingApproval = false;
        // Reuse a matching location when a stale picker leads to another submission.
        if (isNewRestaurant) {
            var submittedRestaurant = allParams.newRestaurantData;
            var matches = await connection.query(
                "SELECT r.restaurantId FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId " +
                "WHERE LOWER(TRIM(r.name)) = LOWER(?) AND LOWER(TRIM(COALESCE(r.address, ''))) = LOWER(?) " +
                "AND LOWER(TRIM(COALESCE(c.city, ''))) = LOWER(?) AND r.status IN ('approved', 'pending', 'needs_review') LIMIT 1",
                [submittedRestaurant.name, String(submittedRestaurant.address || '').trim(), String(submittedRestaurant.city || 'Unknown').trim()]
            );
            if (matches[0] && matches[0].length) {
                restaurantId = matches[0][0].restaurantId;
                isNewRestaurant = false;
            }
        }
        if (isNewRestaurant && allParams.newRestaurantData) {
            var cityId = await getOrCreateCityId(connection, allParams.newRestaurantData.city);
            restaurantId = crypto.randomUUID();

            var geocodeResult = await geocodeRestaurantLocation(allParams.newRestaurantData);
            var lat = 0;
            var lng = 0;
            var hasGeocodedCoordinates = false;
            if (geocodeResult) {
                var parsedLat = parseFloat(geocodeResult.lat);
                var parsedLng = parseFloat(geocodeResult.lng);
                if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                    lat = parsedLat;
                    lng = parsedLng;
                    hasGeocodedCoordinates = true;
                }
            }

            var launchCheck = softLaunch.evaluateLocation({
                lat: hasGeocodedCoordinates ? lat : null,
                lng: hasGeocodedCoordinates ? lng : null,
                city: allParams.newRestaurantData.city,
                state: allParams.newRestaurantData.state
            });
            holdForSoftLaunch = launchCheck.isOutsideLaunchArea;
            var restaurantStatus = holdForSoftLaunch ? 'out_of_area' : 'pending';
            awaitingApproval = true;

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
                    restaurantStatus,
                    null,
                    null
                ]
            );
        }

        if (!isNewRestaurant && restaurantId) {
            var parentResult = await connection.query('SELECT restaurantId, status FROM restaurants WHERE restaurantId = ? FOR UPDATE', [restaurantId]);
            var parent = parentResult[0] && parentResult[0][0];
            if (!parent || !['approved', 'pending', 'needs_review'].includes(parent.status)) {
                invalid('This restaurant is unavailable for new submissions. Please choose another restaurant.', 409);
            }
            awaitingApproval = parent.status !== 'approved';
        }

        var submissionStatus = holdForSoftLaunch ? 'out_of_area' : 'pending';
        var finalDishId = allParams.dishId || null;
        if (isNewDish && restaurantId) {
            var existingDish = await connection.query(
                "SELECT dishId FROM dishes WHERE restaurantId = ? AND LOWER(TRIM(name)) = LOWER(?) AND itemType = ? AND status IN ('approved', 'pending', 'needs_review') LIMIT 1",
                [restaurantId, allParams.newDishData.name, dishService.normalizeItemType(allParams.newDishData.itemType || allParams.itemType) || 'food']
            );
            if (existingDish[0] && existingDish[0].length) {
                finalDishId = existingDish[0][0].dishId;
                isNewDish = false;
            }
        }
        if (isNewDish && allParams.newDishData) {
            if (!restaurantId) {
                throw new Error('Restaurant is required to add a new dish.');
            }
            var dishId = crypto.randomUUID();
            var itemType = dishService.normalizeItemType(allParams.newDishData.itemType || allParams.itemType) || 'food';
            await connection.query(
                `
                INSERT INTO dishes
                    (dishId, restaurantId, name, itemType, submitted, submittedBy, status, statusUpdated, statusUpdatedBy, reviewCount)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                `,
                [dishId, restaurantId, allParams.newDishData.name || '', itemType, nowMs, userId, submissionStatus, null, null]
            );
            await dishService.addDishMetadata(connection, dishId, allParams.newDishData);
            finalDishId = dishId;
            awaitingApproval = true;
        }

        if (!finalDishId) {
            throw new Error('Dish is required.');
        }

        if (!isNewDish) {
            var dishResult = await connection.query(
                'SELECT d.restaurantId, d.status, r.status AS restaurantStatus FROM dishes d JOIN restaurants r ON r.restaurantId = d.restaurantId WHERE d.dishId = ? FOR UPDATE',
                [finalDishId]
            );
            var existing = dishResult[0] && dishResult[0][0];
            if (!existing || !['approved', 'pending', 'needs_review'].includes(existing.status) || !['approved', 'pending', 'needs_review'].includes(existing.restaurantStatus)) {
                invalid('This dish is unavailable for new reviews. Please choose another dish.', 409);
            }
            if (restaurantId && String(restaurantId) !== String(existing.restaurantId)) invalid('The dish does not belong to the selected restaurant.');
            restaurantId = existing.restaurantId;
            awaitingApproval = existing.status !== 'approved' || existing.restaurantStatus !== 'approved';
            var hasReview = await hasRecentReview(finalDishId, userId);
            if (hasReview) {
                var err = new Error('You have already submitted a review for this dish within the last 30 days.');
                err.status = 400;
                throw err;
            }
        }

        var reviewData = {
            rating: ratingValue,
            reviewContent: allParams.review,
            modifications: allParams.modifications,
            dishId: finalDishId,
            submittedBy: userId,
            submitted: nowMs
        };

        var reviewStatus = holdForSoftLaunch ? 'out_of_area' : 'approved';
        var sql = `
            INSERT INTO reviews (rating, review, modifications, dishId, submittedBy, submitted, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        var params = [
            reviewData.rating,
            reviewData.reviewContent,
            reviewData.modifications,
            reviewData.dishId,
            reviewData.submittedBy,
            reviewData.submitted,
            reviewStatus
        ];
        var result = await connection.query(sql, params);
        var reviewId = result[0].insertId;

        if (allParams.photos && allParams.photos.length) {
            var photoSql = `
                INSERT INTO reviews_photos (reviewId, fileId, status)
                VALUES ?
            `;
            var photoParams = allParams.photos.map(function(fileId) {
                return [reviewId, fileId, holdForSoftLaunch ? 'out_of_area' : 'pending'];
            });
            await connection.query(photoSql, [photoParams]);
        }

        await connection.commit();

        // Enqueue AI evaluation jobs (non-blocking, after commit)
        try {
            if (!holdForSoftLaunch) {
                if (isNewRestaurant && restaurantId) {
                    await aiJobQueue.enqueueJob('evaluate_restaurant', restaurantId);
                }
                if (isNewDish && finalDishId) {
                    await aiJobQueue.enqueueJob('evaluate_dish', finalDishId);
                }
                if (allParams.photos && allParams.photos.length) {
                    var photoRows = await db.query(
                        'SELECT reviewPhotoId FROM reviews_photos WHERE reviewId = ?',
                        [reviewId]
                    );
                    for (var p = 0; p < photoRows.length; p++) {
                        await aiJobQueue.enqueueJob('evaluate_photo', photoRows[p].reviewPhotoId);
                    }
                }
            }
        } catch (enqueueErr) {
            console.error('[ai-jobs] Failed to enqueue:', enqueueErr.message || enqueueErr);
        }

        // Recalculate dish scores now that the review is immediately approved
        if (!holdForSoftLaunch && reviewStatus === 'approved') {
            try {
                await dishService.setDishScores(finalDishId);
            } catch (scoreErr) {
                console.error('[scores] Failed to recalculate:', scoreErr.message || scoreErr);
            }
        }

        return {
            reviewId: reviewId,
            dishId: finalDishId,
            restaurantId: restaurantId,
            awaitingApproval: awaitingApproval,
            heldForSoftLaunch: holdForSoftLaunch,
            message: holdForSoftLaunch
                ? 'Review submitted. Because Platillos is currently limited to Albuquerque restaurants, this restaurant and related content were saved for later review and were not sent to AI yet.'
                : awaitingApproval
                    ? 'Review saved. The restaurant or dish is awaiting approval before it appears publicly. You can add another dish at this restaurant now.'
                    : 'Review submitted successfully.'
        };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
async function getReviews(params) {
    params = params || {};
    var pagination = paginationHelper.normalizePagination(params, 10);
    var pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';

    var selectClause = isAdmin ? ADMIN_REVIEW_SELECT : PUBLIC_REVIEW_SELECT;
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

    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';
    var normalizedStatusExpr = "LOWER(COALESCE(r.status, 'pending'))";

    if (!isAdmin) {
        if (shouldFilterPending || statusFilter === 'needs_review' || statusFilter === 'out_of_area' || statusFilter === 'rejected') {
            var publicStatusErr = new Error('Forbidden');
            publicStatusErr.status = 403;
            throw publicStatusErr;
        }
        whereClauses.push(normalizedStatusExpr + " = 'approved'");
        whereClauses.push("d.status = 'approved'", "s.status = 'approved'");
    } else if (shouldFilterPending) {
        whereClauses.push(normalizedStatusExpr + " = 'pending'");
    } else if (statusFilter === 'needs_review') {
        whereClauses.push(normalizedStatusExpr + " = 'needs_review'");
    } else if (statusFilter === 'out_of_area') {
        whereClauses.push(normalizedStatusExpr + " = 'out_of_area'");
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
            var photoRows = await db.query("SELECT reviewId, fileId FROM reviews_photos WHERE reviewId IN (?) AND LOWER(COALESCE(status, 'pending')) = 'approved'", [reviewIds]) || [];
            var photosByReview = {};
            for (var i = 0; i < photoRows.length; i++) {
                var pr = photoRows[i];
                photosByReview[pr.reviewId] = photosByReview[pr.reviewId] || [];
                var photoUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + pr.fileId;
                photosByReview[pr.reviewId].push({ fileId: pr.fileId, url: photoUrl });
            }
            for (var j = 0; j < reviews.length; j++) {
                var rv = reviews[j];
                rv.photos = photosByReview[rv.reviewId] || [];
            }
        }
    }

    // Resolve vote counts (and whether current user voted on each review)
    if (reviews.length) {
        var rvIds = reviews.map(function(r) { return r.reviewId; });
        var voteCounts = await db.query('SELECT reviewId, SUM(value) AS likeCount FROM reviewLikes WHERE reviewId IN (?) GROUP BY reviewId', [rvIds]) || [];
        var likeMap = {};
        for (var lc = 0; lc < voteCounts.length; lc++) {
            likeMap[voteCounts[lc].reviewId] = parseInt(voteCounts[lc].likeCount, 10) || 0;
        }
        var currentUserId = params.auth && params.auth.user ? params.auth.user.userId : null;
        var userVoteMap = {};
        if (currentUserId) {
            var userVotes = await db.query('SELECT reviewId, value FROM reviewLikes WHERE userId = ? AND reviewId IN (?)', [currentUserId, rvIds]) || [];
            for (var ul = 0; ul < userVotes.length; ul++) {
                userVoteMap[userVotes[ul].reviewId] = userVotes[ul].value;
            }
        }
        for (var li = 0; li < reviews.length; li++) {
            reviews[li].likeCount = likeMap[reviews[li].reviewId] || 0;
            reviews[li].userVote = userVoteMap[reviews[li].reviewId] || 0;
        }
    }

    // Resolve avatar URLs
    for (var k = 0; k < reviews.length; k++) {
        if (reviews[k].avatarFileId) {
            reviews[k].avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + reviews[k].avatarFileId;
        }
        if (!isAdmin) {
            stripPublicReviewFields(reviews[k]);
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

async function voteReview(userId, reviewId, value) {
    // value must be 1 or -1
    var v = value === -1 ? -1 : 1;
    await db.query(
        'INSERT INTO reviewLikes (userId, reviewId, value, createdAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, createdAt = ?',
        [userId, reviewId, v, Date.now(), v, Date.now()]
    );
    var rows = await db.query('SELECT COALESCE(SUM(value), 0) AS likeCount FROM reviewLikes WHERE reviewId = ?', [reviewId]);
    var userRow = await db.query('SELECT value FROM reviewLikes WHERE userId = ? AND reviewId = ?', [userId, reviewId]);
    return { likeCount: parseInt(rows[0].likeCount, 10) || 0, userVote: userRow[0].value };
}

async function removeVote(userId, reviewId) {
    await db.query('DELETE FROM reviewLikes WHERE userId = ? AND reviewId = ?', [userId, reviewId]);
    var rows = await db.query('SELECT COALESCE(SUM(value), 0) AS likeCount FROM reviewLikes WHERE reviewId = ?', [reviewId]);
    return { likeCount: parseInt(rows[0].likeCount, 10) || 0, userVote: 0 };
}

async function getFeed(params) {
    params = params || {};
    var tab = params.tab || 'recent';
    var pagination = paginationHelper.normalizePagination(params, 20);
    var pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var currentUserId = params.auth && params.auth.user ? params.auth.user.userId : null;

    var selectClause = `
        SELECT
            r.reviewId, r.rating, r.review AS reviewContent, r.modifications, r.dishId, r.submittedBy, r.submitted,
            d.name AS dishName, d.coverPhoto AS dishCoverPhoto, d.score AS dishScore,
            s.name AS restaurantName, s.restaurantId,
            u.firstName, u.lastName, u.username, u.avatarFileId
    `;
    var fromClause = `
        FROM reviews r
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        JOIN users u ON r.submittedBy = u.userId
    `;

    var whereClauses = ["r.status = 'approved'", "d.status = 'approved'", "s.status = 'approved'"];
    var whereValues = [];
    var orderClause;

    if (tab === 'following') {
        if (!currentUserId) {
            return { rows: [], total: 0 };
        }
        fromClause += ' JOIN userFollows uf ON uf.followingId = r.submittedBy AND uf.followerId = ? ';
        whereValues.push(currentUserId);
        orderClause = ' ORDER BY r.submitted DESC';
    } else if (tab === 'popular') {
        fromClause += ` LEFT JOIN (
            SELECT reviewId, COALESCE(SUM(value), 0) AS likeCount
            FROM reviewLikes GROUP BY reviewId
        ) rl ON rl.reviewId = r.reviewId `;
        orderClause = ' ORDER BY rl.likeCount DESC, r.submitted DESC';
    } else {
        orderClause = ' ORDER BY r.submitted DESC';
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total ' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = countRows.length ? countRows[0].total : 0;

    var dataSql = selectClause + fromClause + whereSql + orderClause + ' LIMIT ? OFFSET ?';
    var dataValues = whereValues.slice();
    dataValues.push(pageSize, offset);
    var reviews = await db.query(dataSql, dataValues) || [];

    // Attach photos
    if (reviews.length) {
        var reviewIds = reviews.map(function(r) { return r.reviewId; });
        var photoRows = await db.query("SELECT reviewId, fileId FROM reviews_photos WHERE reviewId IN (?) AND LOWER(COALESCE(status, 'pending')) = 'approved'", [reviewIds]) || [];
        var photosByReview = {};
        for (var i = 0; i < photoRows.length; i++) {
            var pr = photoRows[i];
            photosByReview[pr.reviewId] = photosByReview[pr.reviewId] || [];
            photosByReview[pr.reviewId].push({ fileId: pr.fileId, url: 'https://' + config.bucket + '.s3.amazonaws.com/' + pr.fileId });
        }
        for (var j = 0; j < reviews.length; j++) {
            reviews[j].photos = photosByReview[reviews[j].reviewId] || [];
        }
    }

    // Attach vote counts + current user vote
    if (reviews.length) {
        var rvIds = reviews.map(function(r) { return r.reviewId; });
        var voteCounts = await db.query('SELECT reviewId, SUM(value) AS likeCount FROM reviewLikes WHERE reviewId IN (?) GROUP BY reviewId', [rvIds]) || [];
        var likeMap = {};
        for (var lc = 0; lc < voteCounts.length; lc++) {
            likeMap[voteCounts[lc].reviewId] = parseInt(voteCounts[lc].likeCount, 10) || 0;
        }
        var userVoteMap = {};
        if (currentUserId) {
            var userVotes = await db.query('SELECT reviewId, value FROM reviewLikes WHERE userId = ? AND reviewId IN (?)', [currentUserId, rvIds]) || [];
            for (var ul = 0; ul < userVotes.length; ul++) {
                userVoteMap[userVotes[ul].reviewId] = userVotes[ul].value;
            }
        }
        for (var li = 0; li < reviews.length; li++) {
            reviews[li].likeCount = likeMap[reviews[li].reviewId] || 0;
            reviews[li].userVote = userVoteMap[reviews[li].reviewId] || 0;
        }
    }

    // Resolve URLs
    for (var k = 0; k < reviews.length; k++) {
        if (reviews[k].avatarFileId) {
            reviews[k].avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + reviews[k].avatarFileId;
        }
        if (reviews[k].dishCoverPhoto) {
            reviews[k].dishCoverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + reviews[k].dishCoverPhoto;
        }
    }

    return { rows: reviews, total: total };
}

async function getRatingsForDish(dishId) {
    var rows = await db.query(
        "SELECT rv.reviewId, rv.rating, rv.submitted FROM reviews rv JOIN dishes d ON d.dishId = rv.dishId JOIN restaurants r ON r.restaurantId = d.restaurantId WHERE rv.dishId = ? AND rv.status = 'approved' AND d.status = 'approved' AND r.status = 'approved' ORDER BY rv.submitted ASC, rv.reviewId ASC",
        [dishId]
    );
    return dishService.buildDishScoreTrend(rows || []);
}

module.exports = {
    saveReview: saveReview,
    hasRecentReview: hasRecentReview,
    getReviews: getReviews,
    getReviewsForDish: getReviewsForDish,
    getRatingsForDish: getRatingsForDish,
    getFeed: getFeed,
    updateReview: updateReview,
    voteReview: voteReview,
    removeVote: removeVote
};
