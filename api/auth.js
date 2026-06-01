var express = require('express');
var router = express.Router();
var authService = require('./authService');
var cookieOptions = require('./cookieOptions');

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
        if (!sessionId) {
            return res.status(400).json({ success: false, message: "Unauthenticated" });
        }

        var sessionData = await authService.getSession(sessionId);
        var result = await authService.extendSession(sessionId);

        var maxAge = result.expiration - Date.now();
        res.cookie('sessionId', result.sessionId, cookieOptions.sessionCookieOptions(maxAge));

        var user = sessionData.user || {};
        var avatarUrl = user.avatarFileId
            ? 'https://' + require('../config').bucket + '.s3.amazonaws.com/' + user.avatarFileId
            : null;
        res.json({
            success: true,
            user: {
                username: user.username || null,
                firstName: user.firstName || null,
                isAdmin: user.isAdmin || 0,
                avatarUrl: avatarUrl,
                addressLat: user.addressLat || null,
                addressLng: user.addressLng || null
            }
        });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
});

module.exports = router;
