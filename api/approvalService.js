var db = require('../connections');
var config = require('../config');
var dishService = require('./dishService');

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending']);

function buildPhotoUrl(fileId) {
    return fileId ? 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId : null;
}

function createError(message, status) {
    var err = new Error(message);
    err.status = status;
    return err;
}

function normalizeStatus(rawStatus) {
    var normalized = String(rawStatus || '').toLowerCase();
    if (!VALID_STATUSES.has(normalized)) {
        throw createError('Invalid status', 400);
    }
    return normalized;
}

function resolveAuditColumns(status, userId) {
    if (status === 'pending') {
        return [status, null, null];
    }
    var now = Date.now();
    return [status, now, userId];
}

async function applyStatusUpdate(options) {
    var status = normalizeStatus(options.status);
    var audit = resolveAuditColumns(status, options.userId);
    var sql = 'UPDATE ' + options.table + ' SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE ' + options.idColumn + ' = ?';
    var params = audit.concat(options.idValue);
    var result = await db.query(sql, params);
    var affected = result && (result.affectedRows || (Array.isArray(result) && result[0] && result[0].affectedRows));
    if (!affected) {
        throw createError(options.notFoundMessage, 404);
    }
    return status;
}

async function updateReviewStatus(params) {
    if (!params || !params.reviewId) {
        throw createError('Missing reviewId', 400);
    }

    var reviewRows = await db.query('SELECT dishId FROM reviews WHERE reviewId = ? LIMIT 1', [params.reviewId]) || [];
    var review = reviewRows[0];
    if (!review) {
        throw createError('Review not found', 404);
    }

    var status = await applyStatusUpdate({
        table: 'reviews',
        idColumn: 'reviewId',
        idValue: params.reviewId,
        status: params.status,
        userId: params.auth.user.userId,
        notFoundMessage: 'Review not found'
    });

    if (status === 'approved' && review.dishId) {
        await dishService.setDishScores(review.dishId).catch(function(scoreErr) {
            console.error('[approvalService] Failed to update dish scores after review approval:', scoreErr);
        });
    }
    return true;
}

async function updateRestaurantStatus(params) {
    if (!params || !params.restaurantId) {
        throw createError('Missing restaurantId', 400);
    }

    await applyStatusUpdate({
        table: 'restaurants',
        idColumn: 'restaurantId',
        idValue: params.restaurantId,
        status: params.status,
        userId: params.auth.user.userId,
        notFoundMessage: 'Restaurant not found'
    });
    return true;
}

async function updatePhotoStatus(params) {
    if (!params || !params.reviewPhotoId) {
        throw createError('Missing reviewPhotoId', 400);
    }

    await applyStatusUpdate({
        table: 'reviews_photos',
        idColumn: 'reviewPhotoId',
        idValue: params.reviewPhotoId,
        status: params.status,
        userId: params.auth.user.userId,
        notFoundMessage: 'Photo not found'
    });
    return true;
}

async function getReviewPhotos(params) {
    params = params || {};

    var selectClause = `
        SELECT
            rp.reviewPhotoId,
            rp.reviewId,
            rp.fileId,
            rp.status,
            rp.statusUpdated,
            rp.statusUpdatedBy,
            r.review AS reviewContent,
            r.rating,
            r.submitted AS reviewSubmitted,
            r.status AS reviewStatus,
            d.name AS dishName,
            s.name AS restaurantName,
            f.fileName,
            f.fileType,
            f.size,
            f.uploaded,
            f.uploadedBy,
            u.firstName AS reviewerFirstName,
            u.lastName AS reviewerLastName,
            u.email AS reviewerEmail
    `;
    var fromClause = `
        FROM reviews_photos rp
        JOIN reviews r ON rp.reviewId = r.reviewId
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        JOIN files f ON rp.fileId = f.fileId
        JOIN users u ON r.submittedBy = u.userId
    `;

    var whereClauses = ['1=1'];
    var whereValues = [];

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? normalizeStatus(params.status) : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            throw createError('Forbidden', 403);
        }
        whereClauses.push("rp.status = 'pending'");
    } else if (!isAdmin) {
        whereClauses.push("rp.status = 'approved'");
    } else if (statusFilter) {
        whereClauses.push('rp.status = ?');
        whereValues.push(statusFilter);
    }

    if (params.reviewPhotoId) {
        whereClauses.push('rp.reviewPhotoId = ?');
        whereValues.push(params.reviewPhotoId);
    }

    if (params.reviewId) {
        whereClauses.push('rp.reviewId = ?');
        whereValues.push(params.reviewId);
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = (countRows[0] && countRows[0].total) || 0;

    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    page = page < 1 ? 1 : page;
    var offset = (page - 1) * pageSize;

    var dataSql = selectClause + fromClause + whereSql + ' ORDER BY rp.reviewPhotoId DESC LIMIT ? OFFSET ?';
    var dataValues = whereValues.concat([pageSize, offset]);

    var rows = await db.query(dataSql, dataValues) || [];
    return {
        rows: rows.map(function(row) {
            return Object.assign({}, row, {
                reviewerName: ((row.reviewerFirstName || '') + ' ' + (row.reviewerLastName || '')).trim(),
                photoUrl: buildPhotoUrl(row.fileId)
            });
        }),
        total: total
    };
}

async function getReviewPhoto(params) {
    if (!params || !params.reviewPhotoId) {
        return null;
    }

    var result = await getReviewPhotos(Object.assign({}, params, {
        reviewPhotoId: params.reviewPhotoId,
        pageSize: 1,
        page: 1
    }));
    return result.rows[0] || null;
}

module.exports = {
    updateReviewStatus: updateReviewStatus,
    updateRestaurantStatus: updateRestaurantStatus,
    updatePhotoStatus: updatePhotoStatus,
    getReviewPhotos: getReviewPhotos,
    getReviewPhoto: getReviewPhoto
};
