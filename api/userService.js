// userService.js - Business logic for user operations
var db = require('../connections');
var bcrypt = require('bcrypt');
var randomUUID = require('crypto').randomUUID;
var crypto = require('crypto');
var config = require('../config');
var paginationHelper = require('./paginationHelper');

var USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

function sanitizeUsername(value) {
    if (!value) return null;
    var trimmed = String(value).trim().toLowerCase();
    if (!USERNAME_RE.test(trimmed)) {
        var err = new Error('Username must be 3–30 characters: letters, numbers, and underscores only.');
        err.status = 400;
        throw err;
    }
    return trimmed;
}

async function isUsernameTaken(username, excludeUserId) {
    var sql = 'SELECT userId FROM users WHERE username = ? LIMIT 1';
    var rows = await db.query(sql, [username]);
    if (!rows.length) return false;
    if (excludeUserId && rows[0].userId === excludeUserId) return false;
    return true;
}

async function validateAvatarFile(userId, avatarFileId) {
    if (!avatarFileId) {
        return null;
    }
    var rows = await db.query('SELECT fileId FROM files WHERE fileId = ? AND uploadedBy = ? LIMIT 1', [avatarFileId, userId]);
    if (!rows.length) {
        var err = new Error('Avatar file not found or not owned by you.');
        err.status = 400;
        throw err;
    }
    return avatarFileId;
}

async function registerUser(data) {
    var required = ['firstName', 'lastName', 'dob', 'email', 'phone', 'password', 'agreedToTerms', 'consentSms', 'username'];
    for (var i = 0; i < required.length; i++) {
        if (!data[required[i]]) {
            var err = new Error('Missing required field: ' + required[i]);
            err.status = 400;
            throw err;
        }
    }

    ['firstName', 'lastName', 'dob', 'email', 'phone', 'password', 'username'].forEach(function(field) {
        if (typeof data[field] !== 'string') {
            var err = new Error('Invalid ' + field);
            err.status = 400;
            throw err;
        }
    });

    var username = sanitizeUsername(data.username);
    if (await isUsernameTaken(username)) {
        var err = new Error('Username is already taken.');
        err.status = 400;
        throw err;
    }

    // Parse checkboxes as integers
    data.optInUpdates = parseInt(data.optInUpdates) || 0;
    data.agreedToTerms = parseInt(data.agreedToTerms) || 0;
    data.consentSms = parseInt(data.consentSms) || 0;
    var emailCheckSql = 'SELECT userId FROM users WHERE email = ? LIMIT 1';
    var emailRows = await db.query(emailCheckSql, [data.email]);
    if (emailRows.length) {
        var err = new Error('Email is already registered.');
        err.status = 400;
        throw err;
    }
    var hashRounds = 12;
    var hashedPassword = await bcrypt.hash(data.password, hashRounds);
    var userId = randomUUID();
    var createdTimestamp = Date.now();
    var emailToken = crypto.randomBytes(32).toString('hex');
    // Insert user row (without sensitive fields)
    var sql = `INSERT INTO users
        (userId, username, firstName, lastName, dob, email, phone, addressStreet, addressCity, addressZip, addressState, addressCounty, addressLat, addressLng, optInUpdates, agreedToTerms, consentSms, emailVerified, phoneVerified, created, lastLogin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`;
    var params = [
        userId,
        username,
        data.firstName,
        data.lastName,
        data.dob,
        data.email,
        data.phone,
        data.addressStreet || '',
        data.addressCity || '',
        data.addressZip || '',
        data.addressState || '',
        data.addressCounty || '',
        data.addressLat || null,
        data.addressLng || null,
        data.optInUpdates,
        data.agreedToTerms,
        data.consentSms,
        null, // emailVerified
        null, // phoneVerified
        createdTimestamp  // created
    ];
    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(sql, params);
        await connection.query('INSERT INTO userAuth (userId, password, emailToken, phoneCode) VALUES (?, ?, ?, NULL)',
            [userId, hashedPassword, emailToken]);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function getUser(userId) {
    if (!userId) {
        var err = new Error('Missing userId');
        err.status = 400;
        throw err;
    }
    var sql = 'SELECT * FROM users WHERE userId = ? LIMIT 1';
    var rows = await db.query(sql, [userId]);
    if (!rows.length) {
        var err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    var user = rows[0];
    return user;
}

async function getProfile(username) {
    if (!username) {
        var err = new Error('Missing username');
        err.status = 400;
        throw err;
    }
    var sql = `SELECT userId, username, firstName, lastName, avatarFileId, bio, addressCity, addressState, created
               FROM users WHERE username = ? LIMIT 1`;
    var rows = await db.query(sql, [username]);
    if (!rows.length) {
        var err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    var profile = rows[0];
    if (profile.avatarFileId) {
        profile.avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + profile.avatarFileId;
    }

    // Stats
    var statsSql = `SELECT COUNT(*) AS reviewCount, AVG(rating) AS avgRating
                    FROM reviews WHERE submittedBy = ? AND status = 'approved'`;
    var statsRows = await db.query(statsSql, [profile.userId]);
    profile.reviewCount = statsRows[0].reviewCount;
    profile.avgRating = statsRows[0].avgRating ? parseFloat(statsRows[0].avgRating).toFixed(1) : null;

    // Follow counts
    var followCounts = await getFollowCounts(profile.userId);
    profile.followerCount = followCounts.followerCount;
    profile.followingCount = followCounts.followingCount;

    return profile;
}

async function getFavorites(userId) {
    var sql = `SELECT uf.position, uf.dishId, d.name AS dishName, d.coverPhoto, r.name AS restaurantName
               FROM userFavorites uf
               JOIN dishes d ON uf.dishId = d.dishId
               JOIN restaurants r ON d.restaurantId = r.restaurantId
               WHERE uf.userId = ?
               ORDER BY uf.position`;
    var rows = await db.query(sql, [userId]);
    return rows.map(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
        return row;
    });
}

async function getPaginatedFavorites(userId, page, pageSize) {
    var pagination = paginationHelper.normalizePagination({ page: page, pageSize: pageSize }, 20);
    page = pagination.page;
    pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var countSql = 'SELECT COUNT(*) AS total FROM userFavorites WHERE userId = ?';
    var countRows = await db.query(countSql, [userId]);
    var total = countRows[0].total;
    var sql = `SELECT uf.position, uf.dishId, d.name AS dishName, d.coverPhoto, r.name AS restaurantName
               FROM userFavorites uf
               JOIN dishes d ON uf.dishId = d.dishId
               JOIN restaurants r ON d.restaurantId = r.restaurantId
               WHERE uf.userId = ?
               ORDER BY uf.position
               LIMIT ? OFFSET ?`;
    var rows = await db.query(sql, [userId, pageSize, offset]);
    rows.forEach(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
    });
    return { items: rows, total: total, page: page, pageSize: pageSize };
}

async function setFavorites(userId, dishIds) {
    if (!Array.isArray(dishIds)) {
        var err = new Error('Favorites must be an array of dish IDs.');
        err.status = 400;
        throw err;
    }
    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM userFavorites WHERE userId = ?', [userId]);
        var now = Date.now();
        for (var i = 0; i < dishIds.length; i++) {
            if (!dishIds[i]) continue;
            await connection.query(
                'INSERT INTO userFavorites (userId, dishId, position, createdAt) VALUES (?, ?, ?, ?)',
                [userId, dishIds[i], i + 1, now]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function addFavorite(userId, dishId) {
    var maxRows = await db.query('SELECT COALESCE(MAX(position), 0) AS maxPos FROM userFavorites WHERE userId = ?', [userId]);
    var nextPos = maxRows[0].maxPos + 1;
    await db.query(
        'INSERT IGNORE INTO userFavorites (userId, dishId, position, createdAt) VALUES (?, ?, ?, ?)',
        [userId, dishId, nextPos, Date.now()]
    );
}

async function removeFavorite(userId, dishId) {
    await db.query('DELETE FROM userFavorites WHERE userId = ? AND dishId = ?', [userId, dishId]);
}

async function getFavoriteDishIds(userId) {
    var rows = await db.query('SELECT dishId FROM userFavorites WHERE userId = ?', [userId]);
    return rows.map(function(r) { return r.dishId; });
}

async function updateProfile(userId, data) {
    var updates = [];
    var values = [];

    if (data.username !== undefined) {
        var username = sanitizeUsername(data.username);
        if (await isUsernameTaken(username, userId)) {
            var err = new Error('Username is already taken.');
            err.status = 400;
            throw err;
        }
        updates.push('username = ?');
        values.push(username);
    }
    if (data.bio !== undefined) {
        updates.push('bio = ?');
        values.push(String(data.bio || '').slice(0, 500));
    }
    if (data.avatarFileId !== undefined) {
        updates.push('avatarFileId = ?');
        values.push(await validateAvatarFile(userId, data.avatarFileId));
    }
    if (!updates.length) {
        return { updated: false };
    }
    values.push(userId);
    await db.query('UPDATE users SET ' + updates.join(', ') + ' WHERE userId = ?', values);
    return { updated: true };
}

async function getRecentReviews(userId, limit) {
    limit = paginationHelper.normalizeLimit(limit, 5, paginationHelper.MAX_PAGE_SIZE);
    var sql = `SELECT r.reviewId, r.rating, r.review AS reviewContent, r.submitted, r.dishId,
                      d.name AS dishName, d.coverPhoto, s.name AS restaurantName
               FROM reviews r
               JOIN dishes d ON r.dishId = d.dishId
               JOIN restaurants s ON d.restaurantId = s.restaurantId
               WHERE r.submittedBy = ? AND r.status = 'approved'
               ORDER BY r.submitted DESC
               LIMIT ?`;
    var rows = await db.query(sql, [userId, limit]);
    return rows.map(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
        return row;
    });
}

async function getPaginatedReviews(userId, page, pageSize) {
    var pagination = paginationHelper.normalizePagination({ page: page, pageSize: pageSize }, 20);
    page = pagination.page;
    pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var countRows = await db.query(
        "SELECT COUNT(*) AS total FROM reviews WHERE submittedBy = ? AND status = 'approved'",
        [userId]
    );
    var total = countRows[0].total;
    var sql = `SELECT r.reviewId, r.rating, r.review AS reviewContent, r.submitted, r.dishId,
                      d.name AS dishName, d.coverPhoto, s.name AS restaurantName
               FROM reviews r
               JOIN dishes d ON r.dishId = d.dishId
               JOIN restaurants s ON d.restaurantId = s.restaurantId
               WHERE r.submittedBy = ? AND r.status = 'approved'
               ORDER BY r.submitted DESC
               LIMIT ? OFFSET ?`;
    var rows = await db.query(sql, [userId, pageSize, offset]);
    rows.forEach(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
    });
    return { items: rows, total: total, page: page, pageSize: pageSize };
}

// ── Diary ──

async function getDiaryEntries(userId, year, month) {
    // UNION of approved reviews + quick-log entries for the given month
    var startDate = year + '-' + String(month).padStart(2, '0') + '-01';
    var endMonth = month < 12 ? (month + 1) : 1;
    var endYear = month < 12 ? year : (year + 1);
    var endDate = endYear + '-' + String(endMonth).padStart(2, '0') + '-01';

    var sql = `
        SELECT 'review' AS entryType, r.reviewId AS entryId, r.dishId, d.name AS dishName,
               d.coverPhoto, s.name AS restaurantName, r.rating, r.submitted AS createdAt,
               DATE(FROM_UNIXTIME(r.submitted / 1000)) AS dateTried
        FROM reviews r
        JOIN dishes d ON r.dishId = d.dishId
        JOIN restaurants s ON d.restaurantId = s.restaurantId
        WHERE r.submittedBy = ? AND r.status = 'approved'
          AND DATE(FROM_UNIXTIME(r.submitted / 1000)) >= ? AND DATE(FROM_UNIXTIME(r.submitted / 1000)) < ?

        UNION ALL

        SELECT 'log' AS entryType, l.logId AS entryId, l.dishId, d.name AS dishName,
               d.coverPhoto, s.name AS restaurantName, l.rating, l.createdAt,
               l.dateTried
        FROM userDishLog l
        JOIN dishes d ON l.dishId = d.dishId
        LEFT JOIN restaurants s ON l.restaurantId = s.restaurantId
        WHERE l.userId = ? AND l.dateTried >= ? AND l.dateTried < ?

        ORDER BY dateTried DESC, createdAt DESC`;

    var rows = await db.query(sql, [userId, startDate, endDate, userId, startDate, endDate]);
    return rows.map(function(row) {
        if (row.coverPhoto) {
            row.coverPhoto = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.coverPhoto;
        }
        return row;
    });
}

async function addDiaryLog(userId, data) {
    if (!data.dishId) {
        var err = new Error('Missing dishId');
        err.status = 400;
        throw err;
    }
    if (!data.dateTried) {
        var err = new Error('Missing dateTried');
        err.status = 400;
        throw err;
    }
    var rating = data.rating != null ? parseInt(data.rating) : null;
    if (rating != null && (rating < 1 || rating > 10)) {
        var err = new Error('Rating must be between 1 and 10');
        err.status = 400;
        throw err;
    }

    // Look up restaurantId from dish
    var dishRows = await db.query('SELECT restaurantId FROM dishes WHERE dishId = ? LIMIT 1', [data.dishId]);
    if (!dishRows.length) {
        var err = new Error('Dish not found');
        err.status = 404;
        throw err;
    }

    var sql = 'INSERT INTO userDishLog (userId, dishId, restaurantId, rating, dateTried, createdAt) VALUES (?, ?, ?, ?, ?, ?)';
    var result = await db.query(sql, [userId, data.dishId, dishRows[0].restaurantId, rating, data.dateTried, Date.now()]);
    return { logId: result.insertId };
}

async function getDiaryYears(userId) {
    // Returns distinct years that have diary entries
    var sql = `
        SELECT DISTINCT yr FROM (
            SELECT YEAR(FROM_UNIXTIME(r.submitted / 1000)) AS yr
            FROM reviews r WHERE r.submittedBy = ? AND r.status = 'approved'
            UNION
            SELECT YEAR(l.dateTried) AS yr
            FROM userDishLog l WHERE l.userId = ?
        ) combined ORDER BY yr DESC`;
    var rows = await db.query(sql, [userId, userId]);
    return rows.map(function(r) { return r.yr; });
}

async function hasTriedDish(userId, dishId) {
    var sql = `SELECT 1 AS tried FROM (
        SELECT 1 FROM reviews WHERE submittedBy = ? AND dishId = ? AND status = 'approved'
        UNION ALL
        SELECT 1 FROM userDishLog WHERE userId = ? AND dishId = ?
    ) t LIMIT 1`;
    var rows = await db.query(sql, [userId, dishId, userId, dishId]);
    return rows.length > 0;
}

// ── Follow System ──

async function followUser(followerId, followingId) {
    if (followerId === followingId) {
        var err = new Error('Cannot follow yourself');
        err.status = 400;
        throw err;
    }
    await db.query(
        'INSERT IGNORE INTO userFollows (followerId, followingId, createdAt) VALUES (?, ?, ?)',
        [followerId, followingId, Date.now()]
    );
}

async function unfollowUser(followerId, followingId) {
    await db.query(
        'DELETE FROM userFollows WHERE followerId = ? AND followingId = ?',
        [followerId, followingId]
    );
}

async function getFollowCounts(userId) {
    var rows = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM userFollows WHERE followingId = ?) AS followerCount,
            (SELECT COUNT(*) FROM userFollows WHERE followerId = ?) AS followingCount`,
        [userId, userId]
    );
    return { followerCount: rows[0].followerCount, followingCount: rows[0].followingCount };
}

async function isFollowing(followerId, followingId) {
    var rows = await db.query(
        'SELECT 1 FROM userFollows WHERE followerId = ? AND followingId = ? LIMIT 1',
        [followerId, followingId]
    );
    return rows.length > 0;
}

async function getFollowers(userId, page, pageSize) {
    var pagination = paginationHelper.normalizePagination({ page: page, pageSize: pageSize }, 20);
    page = pagination.page;
    pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var countRows = await db.query('SELECT COUNT(*) AS total FROM userFollows WHERE followingId = ?', [userId]);
    var total = countRows[0].total;
    var sql = `SELECT u.userId, u.username, u.firstName, u.lastName, u.avatarFileId
               FROM userFollows uf
               JOIN users u ON uf.followerId = u.userId
               WHERE uf.followingId = ?
               ORDER BY uf.createdAt DESC
               LIMIT ? OFFSET ?`;
    var rows = await db.query(sql, [userId, pageSize, offset]);
    rows.forEach(function(row) {
        if (row.avatarFileId) {
            row.avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.avatarFileId;
        }
    });
    return { items: rows, total: total, page: page, pageSize: pageSize };
}

async function getFollowing(userId, page, pageSize) {
    var pagination = paginationHelper.normalizePagination({ page: page, pageSize: pageSize }, 20);
    page = pagination.page;
    pageSize = pagination.pageSize;
    var offset = pagination.offset;
    var countRows = await db.query('SELECT COUNT(*) AS total FROM userFollows WHERE followerId = ?', [userId]);
    var total = countRows[0].total;
    var sql = `SELECT u.userId, u.username, u.firstName, u.lastName, u.avatarFileId
               FROM userFollows uf
               JOIN users u ON uf.followingId = u.userId
               WHERE uf.followerId = ?
               ORDER BY uf.createdAt DESC
               LIMIT ? OFFSET ?`;
    var rows = await db.query(sql, [userId, pageSize, offset]);
    rows.forEach(function(row) {
        if (row.avatarFileId) {
            row.avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.avatarFileId;
        }
    });
    return { items: rows, total: total, page: page, pageSize: pageSize };
}

async function searchUsers(query, limit) {
    limit = paginationHelper.normalizeLimit(limit, 20, paginationHelper.MAX_USER_SEARCH_LIMIT);
    var pattern = '%' + query + '%';
    var sql = `SELECT userId, username, firstName, lastName, avatarFileId
               FROM users
               WHERE username LIKE ? OR firstName LIKE ? OR lastName LIKE ?
               ORDER BY username
               LIMIT ?`;
    var rows = await db.query(sql, [pattern, pattern, pattern, limit]);
    return rows.map(function(row) {
        if (row.avatarFileId) {
            row.avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + row.avatarFileId + '_s';
        }
        return row;
    });
}

async function getAdminUsers(params) {
    params = params || {};
    var pagination = paginationHelper.normalizePagination(params, 20);
    var whereClauses = [];
    var whereValues = [];
    var q = params.q ? String(params.q).trim() : '';

    if (q) {
        var pattern = '%' + q + '%';
        whereClauses.push('(username LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)');
        whereValues.push(pattern, pattern, pattern, pattern);
    }

    var whereSql = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '';
    var countRows = await db.query('SELECT COUNT(*) AS total FROM users' + whereSql, whereValues);
    var total = countRows[0].total;
    var sql = `SELECT userId, username, firstName, lastName, email, phone,
                      addressCity, addressState, isAdmin, emailVerified,
                      phoneVerified, created, lastLogin
               FROM users` + whereSql + `
               ORDER BY created DESC
               LIMIT ? OFFSET ?`;
    var rows = await db.query(sql, whereValues.concat([pagination.pageSize, pagination.offset]));

    return {
        items: rows,
        total: total,
        page: pagination.page,
        pageSize: pagination.pageSize
    };
}

module.exports = {
    registerUser: registerUser,
    getUser: getUser,
    getProfile: getProfile,
    getFavorites: getFavorites,
    getPaginatedFavorites: getPaginatedFavorites,
    setFavorites: setFavorites,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    getFavoriteDishIds: getFavoriteDishIds,
    updateProfile: updateProfile,
    getRecentReviews: getRecentReviews,
    getPaginatedReviews: getPaginatedReviews,
    getDiaryEntries: getDiaryEntries,
    addDiaryLog: addDiaryLog,
    getDiaryYears: getDiaryYears,
    hasTriedDish: hasTriedDish,
    followUser: followUser,
    unfollowUser: unfollowUser,
    getFollowCounts: getFollowCounts,
    isFollowing: isFollowing,
    getFollowers: getFollowers,
    getFollowing: getFollowing,
    searchUsers: searchUsers,
    getAdminUsers: getAdminUsers
};
