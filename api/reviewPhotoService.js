var db = require('../connections');
var config = require('../config');

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending', 'needs_review']);

function buildPhotoUrl(fileId) {
    return fileId ? 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId : null;
}

function normalizeOptionalStatus(rawStatus) {
    if (rawStatus === undefined || rawStatus === null || rawStatus === '') {
        return undefined;
    }
    var status = String(rawStatus).toLowerCase();
    if (!VALID_STATUSES.has(status)) {
        var err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }
    return status;
}

function normalizeRequiredStatus(rawStatus) {
    var status = normalizeOptionalStatus(rawStatus);
    if (status === undefined) {
        var err = new Error('Status is required');
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

function mapPhotoRow(row) {
    return Object.assign({}, row, {
        reviewerName: ((row.reviewerFirstName || '') + ' ' + (row.reviewerLastName || '')).trim(),
        photoUrl: buildPhotoUrl(row.fileId),
        status: String(row.status || 'pending').toLowerCase()
    });
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
    var statusFilterRaw = params.status;
    var normalizedFilter;
    if (statusFilterRaw !== undefined && statusFilterRaw !== null) {
        var lowered = String(statusFilterRaw).toLowerCase();
        if (lowered !== 'all' && lowered !== '') {
            normalizedFilter = normalizeOptionalStatus(lowered);
        }
    }

    var shouldFilterPending = String(params.pending) === '1' || normalizedFilter === 'pending';

    var normalizedColumn = "LOWER(COALESCE(rp.status, 'pending'))";

    if (shouldFilterPending) {
        if (!isAdmin) {
            var pendingErr = new Error('Forbidden');
            pendingErr.status = 403;
            throw pendingErr;
        }
        whereClauses.push(normalizedColumn + " = 'pending'");
    } else if (!isAdmin) {
        whereClauses.push(normalizedColumn + " = 'approved'");
    } else if (normalizedFilter) {
        whereClauses.push(normalizedColumn + ' = ?');
        whereValues.push(normalizedFilter);
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

    var countSql = 'SELECT COUNT(*) AS total ' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = (countRows[0] && countRows[0].total) || 0;

    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) {
        page = 1;
    }
    var offset = (page - 1) * pageSize;

    var dataSql = selectClause + fromClause + whereSql + ' ORDER BY rp.reviewPhotoId DESC LIMIT ? OFFSET ?';
    var dataValues = whereValues.concat([pageSize, offset]);
    var rows = await db.query(dataSql, dataValues) || [];

    return {
        rows: rows.map(mapPhotoRow),
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

async function updateReviewPhoto(params) {
    params = params || {};

    var reviewPhotoId = params.reviewPhotoId || params.id;
    if (!reviewPhotoId) {
        var missingErr = new Error('Missing reviewPhotoId');
        missingErr.status = 400;
        throw missingErr;
    }

    var statusValue = normalizeRequiredStatus(params.status);

    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        var rowsResult = await connection.query('SELECT reviewPhotoId FROM reviews_photos WHERE reviewPhotoId = ? FOR UPDATE', [reviewPhotoId]);
        var rows = Array.isArray(rowsResult) ? rowsResult[0] : rowsResult;
        if (!rows || !rows.length) {
            var notFoundErr = new Error('Photo not found');
            notFoundErr.status = 404;
            throw notFoundErr;
        }

        var audit = resolveAuditColumns(statusValue, params?.auth?.user?.userId);
        var sql = 'UPDATE reviews_photos SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE reviewPhotoId = ?';
        var values = [audit[0], audit[1], audit[2], reviewPhotoId];
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

    return { updated: true };
}

module.exports = {
    getReviewPhotos: getReviewPhotos,
    getReviewPhoto: getReviewPhoto,
    updateReviewPhoto: updateReviewPhoto
};
