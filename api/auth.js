var express = require('express');
var router = express.Router();
var authService = require('./authService');
var cookieOptions = require('./cookieOptions');
var config = require('../config');

function publicUser(user) {
    if (!user) {
        return null;
    }
    return {
        username: user.username || null,
        firstName: user.firstName || null,
        isAdmin: user.isAdmin || 0,
        avatarUrl: user.avatarFileId
            ? 'https://' + config.bucket + '.s3.amazonaws.com/' + user.avatarFileId + '_s'
            : null,
        addressLat: user.addressLat || null,
        addressLng: user.addressLng || null
    };
}

router.get('/session', function(req, res) {
    var auth = req.allParams.auth;
    var user = auth && auth.user ? auth.user : null;
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    res.json({
        success: true,
        authenticated: !!user,
        csrfToken: req.csrfToken,
        user: publicUser(user)
    });
});

// Auth-related API endpoints will go here
router.post('/authenticate', async function (req, res) {
    var data = req.allParams;
    try {
        var result = await authService.authenticate(data.email, data.password);
        // Use expiration from session object
        var maxAge = result.session.expiration - Date.now();
        res.cookie('sessionId', result.session.sessionId, cookieOptions.sessionCookieOptions(maxAge));
        res.json({ success: true, redirect: result.redirect });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
});

router.post('/extendSession', async function (req, res) {
    var sessionId = req.signedCookies.sessionId;

    try {
        if (!sessionId || !req.allParams.auth || !req.allParams.auth.user) {
            return res.status(401).json({
                success: false,
                code: 'AUTH_REQUIRED',
                message: 'Unauthorized. Please log in.'
            });
        }

        var result = await authService.extendSession(sessionId);

        var maxAge = result.expiration - Date.now();
        res.cookie('sessionId', result.sessionId, cookieOptions.sessionCookieOptions(maxAge));

        res.json({
            success: true,
            user: publicUser(req.allParams.auth.user)
        });
    } catch (err) {
        var status = err.status || 401;
        res.status(status).json({
            success: false,
            code: status === 401 ? 'AUTH_REQUIRED' : undefined,
            message: err.message
        });
    }
});

module.exports = router;
