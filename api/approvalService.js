var db = require('../connections');
var config = require('../config');

function buildPhotoUrl(fileId) {
    if (!fileId) {
        return null;
    }
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId;
}

async function updateReviewStatus(params) {
    var auth = params && params.auth;
    var reviewId = params && params.reviewId;
    var status = String(params && params.status || '').toLowerCase();
    var err;


    if (!reviewId) {
        err = new Error('Missing reviewId');
        err.status = 400;
        throw err;
    }
    if (['approved', 'rejected', 'pending'].indexOf(status) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var approverUserId = auth.user.userId;
    var nowMs = Date.now();
    var statusUpdated = status === 'pending' ? null : nowMs;
    var statusUpdatedBy = status === 'pending' ? null : approverUserId;
    var sql = 'UPDATE reviews SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE reviewId = ?';
    var result = await db.query(sql, [status, statusUpdated, statusUpdatedBy, reviewId]);
    if (!result || result.affectedRows === 0) {
        err = new Error('Review not found');
        err.status = 404;
        throw err;
    }
    return true;
}

async function updateDishStatus(params) {
    var auth = params && params.auth;
    var dishId = params && params.dishId;
    var status = String(params && params.status || '').toLowerCase();
    var err;

    if (!dishId) {
        err = new Error('Missing dishId');
        err.status = 400;
        throw err;
    }
    if (['approved', 'rejected', 'pending'].indexOf(status) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var approverUserId = auth.user.userId;
    var nowMs = Date.now();
    var statusUpdated = status === 'pending' ? null : nowMs;
    var statusUpdatedBy = status === 'pending' ? null : approverUserId;
    var sql = 'UPDATE dishes SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE dishId = ?';
    var result = await db.query(sql, [status, statusUpdated, statusUpdatedBy, dishId]);
    if (!result || result.affectedRows === 0) {
        err = new Error('Dish not found');
        err.status = 404;
        throw err;
    }
    return true;
}

async function updateRestaurantStatus(params) {
    var auth = params && params.auth;
    var restaurantId = params && params.restaurantId;
    var status = String(params && params.status || '').toLowerCase();
    var err;

    if (!restaurantId) {
        err = new Error('Missing restaurantId');
        err.status = 400;
        throw err;
    }
    if (['approved', 'rejected', 'pending'].indexOf(status) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var approverUserId = auth.user.userId;
    var nowMs = Date.now();
    var statusUpdated = status === 'pending' ? null : nowMs;
    var statusUpdatedBy = status === 'pending' ? null : approverUserId;
    var sql = 'UPDATE restaurants SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE restaurantId = ?';
    var result = await db.query(sql, [status, statusUpdated, statusUpdatedBy, restaurantId]);
    if (!result || result.affectedRows === 0) {
        err = new Error('Restaurant not found');
        err.status = 404;
        throw err;
    }
    return true;
}

async function updatePhotoStatus(params) {
    var auth = params && params.auth;
    var reviewPhotoId = params && params.reviewPhotoId;
    var status = String(params && params.status || '').toLowerCase();
    var err;

    if (!reviewPhotoId) {
        err = new Error('Missing reviewPhotoId');
        err.status = 400;
        throw err;
    }
    if (['approved', 'rejected', 'pending'].indexOf(status) === -1) {
        err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }

    var approverUserId = auth.user.userId;
    var nowMs = Date.now();
    var statusUpdated = status === 'pending' ? null : nowMs;
    var statusUpdatedBy = status === 'pending' ? null : approverUserId;
    var sql = 'UPDATE reviews_photos SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE reviewPhotoId = ?';
    var result = await db.query(sql, [status, statusUpdated, statusUpdatedBy, reviewPhotoId]);
    if (!result || result.affectedRows === 0) {
        err = new Error('Photo not found');
        err.status = 404;
        throw err;
    }
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
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("rp.status = 'pending'");
    } else if (!isAdmin) {
        whereClauses.push("rp.status = 'approved'");
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
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
    var total = countRows.length ? countRows[0].total : 0;

    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) {
        page = 1;
    }
    var offset = (page - 1) * pageSize;

    var dataSql = selectClause + fromClause + whereSql + ' ORDER BY rp.reviewPhotoId DESC LIMIT ? OFFSET ?';
    var dataValues = whereValues.slice();
    dataValues.push(pageSize, offset);

    var rows = await db.query(dataSql, dataValues) || [];
    var mappedRows = rows.map(function(row) {
        return Object.assign({}, row, {
            reviewerName: ((row.reviewerFirstName || '') + ' ' + (row.reviewerLastName || '')).trim(),
            photoUrl: buildPhotoUrl(row.fileId)
        });
    });

    return {
        rows: mappedRows,
        total: total
    };
}

async function getReviewPhoto(params) {
    if (!params || !params.reviewPhotoId) {
        return null;
    }

    var queryParams = Object.assign({}, params, {
        reviewPhotoId: params.reviewPhotoId,
        pageSize: 1,
        page: 1
    });

    var result = await getReviewPhotos(queryParams);
    return (result.rows && result.rows.length) ? result.rows[0] : null;
}

module.exports = {
    updateReviewStatus: updateReviewStatus,
    updateDishStatus: updateDishStatus,
    updateRestaurantStatus: updateRestaurantStatus,
    updatePhotoStatus: updatePhotoStatus,
    getReviewPhotos: getReviewPhotos,
    getReviewPhoto: getReviewPhoto
};
