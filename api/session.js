var express = require('express');
var router = express.Router();
var authService = require('./authService');
var { requireAuth } = require('./middleware');
var cookieOptions = require('./cookieOptions');
var config = require('../config');

function publicUser(user) {
    return {
        username: user.username,
        firstName: user.firstName,
        isAdmin: user.isAdmin,
        avatarUrl: user.avatarFileId
            ? 'https://' + config.bucket + '.s3.amazonaws.com/' + user.avatarFileId + '_s'
            : null,
        addressLat: user.addressLat,
        addressLng: user.addressLng
    };
}

router.use(function(req, res, next) {
    res.set('Cache-Control', 'no-store, private');
    next();
});

router.get('/', function(req, res) {
    var user = req.auth && req.auth.user;
    res.json({
        success: true,
        authenticated: !!user,
        csrfToken: req.csrfToken,
        user: user ? publicUser(user) : null
    });
});

router.post('/', async function(req, res, next) {
    try {
        var result = await authService.authenticate(req.body.email, req.body.password);
        res.cookie('sessionId', result.session.sessionId,
            cookieOptions.sessionCookieOptions(result.session.expiration - Date.now()));
        res.location('/api/session').status(201).json({ success: true, redirect: result.redirect });
    } catch (err) {
        next(err);
    }
});

router.patch('/', requireAuth, async function(req, res, next) {
    try {
        var session = await authService.extendSession(req.signedCookies.sessionId);
        res.cookie('sessionId', session.sessionId,
            cookieOptions.sessionCookieOptions(session.expiration - Date.now()));
        res.json({ success: true, user: publicUser(req.auth.user) });
    } catch (err) {
        next(err);
    }
});

router.delete('/', async function(req, res, next) {
    try {
        if (req.signedCookies.sessionId) {
            await authService.endSession(req.signedCookies.sessionId);
        }
        res.clearCookie('sessionId', cookieOptions.sessionCookieOptions());
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
