// userService.js - Business logic for user operations
var db = require('../connections');
var bcrypt = require('bcrypt');
var randomUUID = require('crypto').randomUUID;
var crypto = require('crypto');
var config = require('../config');

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

async function registerUser(data) {
    var required = ['firstName', 'lastName', 'dob', 'email', 'phone', 'password', 'agreedToTerms', 'consentSms', 'username'];
    for (var i = 0; i < required.length; i++) {
        if (!data[required[i]]) {
            var err = new Error('Missing required field: ' + required[i]);
            err.status = 400;
            throw err;
        }
    }

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
        createdTimestamp, // emailVerified
        createdTimestamp, // phoneVerified
        createdTimestamp  // created
    ];
    await db.query(sql, params);
    // Insert sensitive fields into userAuth
    var authSql = `INSERT INTO userAuth (userId, password, emailToken, phoneCode) VALUES (?, ?, ?, NULL)`;
    var authParams = [userId, hashedPassword, emailToken];
    await db.query(authSql, authParams);
    return;
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
                    FROM reviews WHERE submittedBy = ? AND LOWER(COALESCE(status,'pending')) = 'approved'`;
    var statsRows = await db.query(statsSql, [profile.userId]);
    profile.reviewCount = statsRows[0].reviewCount || 0;
    profile.avgRating = statsRows[0].avgRating ? parseFloat(statsRows[0].avgRating).toFixed(1) : null;

    // Favorites
    profile.favorites = await getFavorites(profile.userId);

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

async function setFavorites(userId, dishIds) {
    if (!Array.isArray(dishIds) || dishIds.length > 4) {
        var err = new Error('Favorites must be an array of up to 4 dish IDs.');
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
        values.push(data.avatarFileId || null);
    }
    if (!updates.length) {
        return { updated: false };
    }
    values.push(userId);
    await db.query('UPDATE users SET ' + updates.join(', ') + ' WHERE userId = ?', values);
    return { updated: true };
}

async function getRecentReviews(userId, limit) {
    limit = limit || 5;
    var sql = `SELECT r.reviewId, r.rating, r.review AS reviewContent, r.submitted, r.dishId,
                      d.name AS dishName, d.coverPhoto, s.name AS restaurantName
               FROM reviews r
               JOIN dishes d ON r.dishId = d.dishId
               JOIN restaurants s ON d.restaurantId = s.restaurantId
               WHERE r.submittedBy = ? AND LOWER(COALESCE(r.status,'pending')) = 'approved'
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
        WHERE r.submittedBy = ? AND LOWER(COALESCE(r.status,'pending')) = 'approved'
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
            FROM reviews r WHERE r.submittedBy = ? AND LOWER(COALESCE(r.status,'pending')) = 'approved'
            UNION
            SELECT YEAR(l.dateTried) AS yr
            FROM userDishLog l WHERE l.userId = ?
        ) combined ORDER BY yr DESC`;
    var rows = await db.query(sql, [userId, userId]);
    return rows.map(function(r) { return r.yr; });
}

module.exports = {
    registerUser: registerUser,
    getUser: getUser,
    getProfile: getProfile,
    getFavorites: getFavorites,
    setFavorites: setFavorites,
    updateProfile: updateProfile,
    getRecentReviews: getRecentReviews,
    getDiaryEntries: getDiaryEntries,
    addDiaryLog: addDiaryLog,
    getDiaryYears: getDiaryYears
};
