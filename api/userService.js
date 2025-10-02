// userService.js - Business logic for user operations
var db = require('../connections');
var bcrypt = require('bcrypt');
var randomUUID = require('crypto').randomUUID;
var crypto = require('crypto');

async function registerUser(data) {
    var required = ['firstName', 'lastName', 'dob', 'email', 'phone', 'password', 'agreedToTerms', 'consentSms'];
    for (var i = 0; i < required.length; i++) {
        if (!data[required[i]]) {
            var err = new Error('Missing required field: ' + required[i]);
            err.status = 400;
            throw err;
        }
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
        (userId, firstName, lastName, dob, email, phone, addressStreet, addressCity, addressZip, addressState, addressCounty, addressLat, addressLng, optInUpdates, agreedToTerms, consentSms, emailVerified, phoneVerified, created, lastLogin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`;
    var params = [
        userId,
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

module.exports = {
    registerUser: registerUser,
    getUser: getUser
};
