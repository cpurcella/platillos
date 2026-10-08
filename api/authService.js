// authService.js - Business logic for authentication and security
var axios = require('axios');
var _config = require('../config');
var db = require('../connections');
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var userService = require('./userService');

async function verifyRecaptchaToken(recaptcha) {
    if (!recaptcha) {
        var err = new Error('Missing recaptcha.');
        err.status = 400;
        throw err;
    }
    var secret = _config.recaptchaKey;
    var response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
        timeout: 10000,
        params: {
            secret: secret,
            response: recaptcha
        }
    });
    if (!response.data || !response.data.success) {
        var err = new Error('Invalid recaptcha.');
        err.status = 400;
        throw err;
    }
    return;
}

async function startSession(userId) {
    var sessionId = crypto.randomBytes(32).toString('hex');
    var created = Date.now();
    var expiration = created + 1000 * 60 * 60 * 24 * 30; // 30 days
    await db.query('INSERT INTO sessions (sessionId, userId, created, expiration) VALUES (?, ?, ?, ?)', [sessionId, userId, created, expiration]);
    return {sessionId: sessionId, expiration: expiration};
}

async function authenticate(email, password) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        var err = new Error('Incorrect email or password');
        err.status = 401;
        throw err;
    }

    var sql = 'SELECT userId FROM users WHERE email = ? LIMIT 1';
    var users = await db.query(sql, [email]);
    if (!users.length) {
        var err = new Error('Incorrect email or password');
        err.status = 401;
        throw err;
    }
    var userId = users[0].userId;

    var authSql = 'SELECT password FROM userAuth WHERE userId = ? LIMIT 1';
    var authRows = await db.query(authSql, [userId]);
    if (!authRows.length) {
        var err = new Error('Incorrect email or password');
        err.status = 401;
        throw err;
    }
    var match = await bcrypt.compare(password, authRows[0].password);
    if (!match) {
        var err = new Error('Incorrect email or password');
        err.status = 401;
        throw err;
    }
    var session = await startSession(userId);
    var userObj = await userService.getUser(userId);
    var redirect = userObj.isAdmin === 1 ? '/admin' : '/';
    return { session: session, redirect: redirect };
}

async function getSession(sessionId) {
    if (!sessionId) {
        var err = new Error('Missing sessionId');
        err.status = 401;
        throw err;
    }
    var sql = 'SELECT sessionId, userId, expiration FROM sessions WHERE sessionId = ? LIMIT 1';
    var rows = await db.query(sql, [sessionId]);
    if (!rows.length) {
        var err = new Error('Session not found');
        err.status = 401;
        throw err;
    }
    var session = rows[0];
    if (Date.now() > session.expiration) {
        var err = new Error('Session expired');
        err.status = 401;
        throw err;
    }
    var userObj = await userService.getUser(session.userId);
    return { session: session, user: userObj };
}

async function extendSession(sessionId) {
    var sessionData = await getSession(sessionId);
    var userId = sessionData.session.userId;
    var newSession = await startSession(userId);
    // Update old session expiration to 60 seconds from now
    var newExpiration = Date.now() + 60 * 1000;
    await db.query('UPDATE sessions SET expiration = ? WHERE sessionId = ?', [newExpiration, sessionId]);
    return newSession;
}

async function endSession(sessionId) {
    await db.query('DELETE FROM sessions WHERE sessionId = ?', [sessionId]);
}

module.exports = {
    verifyRecaptchaToken: verifyRecaptchaToken,
    authenticate: authenticate,
    startSession: startSession,
    getSession: getSession,
    extendSession: extendSession,
    endSession: endSession
};
