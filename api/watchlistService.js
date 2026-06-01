var db = require('../connections');
var paginationHelper = require('./paginationHelper');

async function isOnWatchlist(userId, dishId) {
    var rows = await db.query(
        'SELECT 1 FROM userWatchlist WHERE userId = ? AND dishId = ? LIMIT 1',
        [userId, dishId]
    );
    return rows.length > 0;
}

async function addToWatchlist(userId, dishId) {
    // Verify dish exists
    var dishRows = await db.query('SELECT dishId FROM dishes WHERE dishId = ? LIMIT 1', [dishId]);
    if (!dishRows.length) {
        var err = new Error('Dish not found');
        err.status = 404;
        throw err;
    }
    await db.query(
        'INSERT IGNORE INTO userWatchlist (userId, dishId, createdAt) VALUES (?, ?, ?)',
        [userId, dishId, Date.now()]
    );
}

async function removeFromWatchlist(userId, dishId) {
    await db.query(
        'DELETE FROM userWatchlist WHERE userId = ? AND dishId = ?',
        [userId, dishId]
    );
}

async function getWatchlist(userId, page, pageSize) {
    var pagination = paginationHelper.normalizePagination({ page: page, pageSize: pageSize }, 20);
    page = pagination.page;
    pageSize = pagination.pageSize;
    var offset = pagination.offset;

    var countRows = await db.query(
        'SELECT COUNT(*) AS total FROM userWatchlist WHERE userId = ?',
        [userId]
    );
    var total = countRows[0].total;

    var rows = await db.query(
        `SELECT w.dishId, w.createdAt, d.name AS dishName, d.coverPhoto, d.score,
                r.name AS restaurantName
         FROM userWatchlist w
         JOIN dishes d ON w.dishId = d.dishId
         JOIN restaurants r ON d.restaurantId = r.restaurantId
         WHERE w.userId = ?
         ORDER BY w.createdAt DESC
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
    );

    var config = require('../config');
    rows.forEach(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
    });

    return { items: rows, total: total, page: page, pageSize: pageSize };
}

async function getWatchlistDishIds(userId) {
    var rows = await db.query(
        'SELECT dishId FROM userWatchlist WHERE userId = ?',
        [userId]
    );
    return rows.map(function(r) { return r.dishId; });
}

module.exports = {
    isOnWatchlist: isOnWatchlist,
    addToWatchlist: addToWatchlist,
    removeFromWatchlist: removeFromWatchlist,
    getWatchlist: getWatchlist,
    getWatchlistDishIds: getWatchlistDishIds
};
