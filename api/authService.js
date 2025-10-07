// authService.js - Business logic for authentication and security
var axios = require('axios');
var _config = require('../config');
var db = require('../connections');
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var userService = require('./userService');

async function verifyRecaptchaToken(recaptcha) {
    if (!recaptcha) {
        throw new Error('Missing recaptcha.');
    }
    var secret = _config.recaptchaKey;
    var response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
        params: {
            secret: secret,
            response: recaptcha
        }
    });
    if (!response.data || !response.data.success) {
        throw new Error('Invalid recaptcha.');
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
    if (!email || !password) {
        throw new Error('Incorrect email or password');
    }

    var sql = 'SELECT userId FROM users WHERE email = ? LIMIT 1';
    var users = await db.query(sql, [email]);
    if (!users.length) {
        throw new Error('Incorrect email or password');
    }
    var userId = users[0].userId;

    var authSql = 'SELECT password FROM userAuth WHERE userId = ? LIMIT 1';
    var authRows = await db.query(authSql, [userId]);
    if (!authRows.length) {
        throw new Error('Incorrect email or password');
    }
    var match = await bcrypt.compare(password, authRows[0].password);
    if (!match) {
        throw new Error('Incorrect email or password');
    }
    var session = await startSession(userId);
    var userObj = await userService.getUser(userId);
    var redirect = (userObj && userObj.isAdmin === 1) ? '/admin/approvals' : '/';
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
    if (!sessionId) {
        return;
    }
    try {
        await db.query('DELETE FROM sessions WHERE sessionId = ?', [sessionId]);
    } catch (err) {
        // Ignore errors during logout to avoid blocking the user
        console.warn('Failed to delete session during logout', err);
    }
}

module.exports = {
    verifyRecaptchaToken: verifyRecaptchaToken,
    authenticate: authenticate,
    startSession: startSession,
    getSession: getSession,
    extendSession: extendSession,
    endSession: endSession
};
