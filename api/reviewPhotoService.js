var db = require('../connections');
var config = require('../config');

function buildPhotoUrl(fileId) {
    if (!fileId) {
        return null;
    }
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId;
}

async function getReviewPhotos(params) {
    var vals = [];
    var sql = `
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
        FROM reviews_photos rp
        JOIN reviews r ON rp.reviewId = r.reviewId
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        JOIN files f ON rp.fileId = f.fileId
        JOIN users u ON r.submittedBy = u.userId
        WHERE 1=1
    `;

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    if (String(params.pending) === '1') {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        sql += ` AND rp.status = 'pending'`;
    } else if (!isAdmin) {
        sql += ` AND rp.status = 'approved'`;
    }

    if (params.reviewPhotoId) {
        sql += ' AND rp.reviewPhotoId = ?';
        vals.push(params.reviewPhotoId);
    }

    if (params.reviewId) {
        sql += ' AND rp.reviewId = ?';
        vals.push(params.reviewId);
    }

    if (params.status) {
        sql += ' AND rp.status = ?';
        vals.push(params.status);
    }

    sql += ' ORDER BY rp.reviewPhotoId DESC';

    var pageSize = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) {
        page = 1;
    }
    var offset = (page - 1) * pageSize;

    sql += ' LIMIT ? OFFSET ?';
    vals.push(pageSize, offset);

    var rows = await db.query(sql, vals) || [];
    return rows.map(function(row) {
        return Object.assign({}, row, {
            reviewerName: ((row.reviewerFirstName || '') + ' ' + (row.reviewerLastName || '')).trim(),
            photoUrl: buildPhotoUrl(row.fileId)
        });
    });
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

    var rows = await getReviewPhotos(queryParams);
    return (rows && rows.length) ? rows[0] : null;
}

module.exports = {
    getReviewPhotos: getReviewPhotos,
    getReviewPhoto: getReviewPhoto
};
