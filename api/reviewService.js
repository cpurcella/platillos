var db = require('../connections');
var crypto = require('crypto');

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

async function saveReview(allParams) {
    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        var userId = allParams.auth.user.userId;
        var nowMs = Date.now();

        var isNewRestaurant = String(allParams.newRestaurant).toLowerCase() === 'true';
        var isNewDish = String(allParams.newDish).toLowerCase() === 'true';

        var restaurantId = allParams.restaurantId || null;
        if (isNewRestaurant && allParams.newRestaurantData) {
            var cityId = await getOrCreateCityId(connection, allParams.newRestaurantData.city);
            restaurantId = crypto.randomUUID();
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
                    0,
                    0,
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
    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) page = 1;
    var offset = (page - 1) * pageSize;

    var vals = [];
    var sql = `
        SELECT
            r.reviewId, r.rating, r.review as reviewContent, r.modifications, r.dishId, r.submittedBy, r.submitted,
            r.status, r.statusUpdated, r.statusUpdatedBy,
            d.name AS dishName, s.name AS restaurantName,
            u.firstName, u.lastName, u.email
        FROM reviews r
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        JOIN users u ON r.submittedBy = u.userId
        WHERE 1=1
    `;

    if (params.reviewId) {
        sql += ' AND r.reviewId = ?';
        vals.push(params.reviewId);
    }
    if (params.userId) {
        sql += ' AND r.submittedBy = ?';
        vals.push(params.userId);
    }
    if (params.dishId) {
        sql += ' AND r.dishId = ?';
        vals.push(params.dishId);
    }

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        sql += ' AND r.status IS NULL';
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        sql += ' AND r.status = ?';
        vals.push(statusFilter);
    }

    sql += ' ORDER BY r.submitted DESC LIMIT ? OFFSET ?';
    vals.push(pageSize, offset);

    var reviews = await db.query(sql, vals) || [];

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

    return reviews;
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

module.exports = {
    saveReview: saveReview,
    hasRecentReview: hasRecentReview,
    getReviews: getReviews,
    getReviewsForDish: getReviewsForDish
};
