var express = require('express');
var router = express.Router();
var userService = require('./userService');
var authorization = require('./middleware');

// User-related API endpoints will go here
router.post('/register', authorization.verifyRecaptcha, async function(req, res) {
    var data = req.allParams;
    try {
        await userService.registerUser(data);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
});

module.exports = router;
