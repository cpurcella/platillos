var crypto = require('crypto');
var cookieOptions = require('./cookieOptions');

var CSRF_COOKIE = 'csrfToken';
var CSRF_HEADER = 'x-csrf-token';
var SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

function safeCompare(a, b) {
    var left = Buffer.from(String(a || ''), 'utf8');
    var right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sendInvalid(req, res, reason) {
    console.warn('[security]', JSON.stringify({
        event: 'csrf_rejected',
        reason: reason,
        method: req.method,
        path: req.originalUrl || req.path
    }));
    return res.status(403).json({
        success: false,
        code: 'CSRF_INVALID',
        message: 'Invalid CSRF token.'
    });
}

function middleware(req, res, next) {
    var cookieToken = req.signedCookies && req.signedCookies[CSRF_COOKIE];
    if (SAFE_METHODS.has(req.method)) {
        req.csrfToken = cookieToken || createToken();
        if (!cookieToken) {
            res.cookie(CSRF_COOKIE, req.csrfToken, cookieOptions.csrfCookieOptions());
        }
        res.set(CSRF_HEADER, req.csrfToken);
        return next();
    }

    var headerToken = req.get(CSRF_HEADER);
    if (!cookieToken) {
        return sendInvalid(req, res, 'missing_cookie');
    }
    if (!headerToken) {
        return sendInvalid(req, res, 'missing_header');
    }
    if (!safeCompare(cookieToken, headerToken)) {
        return sendInvalid(req, res, 'mismatch');
    }
    req.csrfToken = cookieToken;
    next();
}

module.exports = {
    middleware: middleware,
    CSRF_COOKIE: CSRF_COOKIE,
    CSRF_HEADER: CSRF_HEADER
};
