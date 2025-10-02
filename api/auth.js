var express = require('express');
var router = express.Router();
var authService = require('./authService');

// Auth-related API endpoints will go here
router.post('/authenticate', async function (req, res) {
    var data = req.allParams;
    try {
        var result = await authService.authenticate(data.email, data.password);
        // Use expiration from session object
        var maxAge = result.session.expiration - Date.now();
        res.cookie('sessionId', result.session.sessionId, {
            maxAge: maxAge,
            httpOnly: true,
            sameSite: 'lax',
            signed: true
        });
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

        var result = await authService.extendSession(sessionId);

        var maxAge = result.expiration - Date.now();
        res.cookie('sessionId', result.sessionId, {
            maxAge: maxAge,
            httpOnly: true,
            sameSite: 'lax',
            signed: true
        });
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
});

module.exports = router;
