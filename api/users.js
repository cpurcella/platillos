var express = require('express');
var router = express.Router();
var userService = require('./userService');
var authorization = require('./middleware');

router.post('/register', authorization.verifyRecaptcha, async function(req, res) {
    var data = req.allParams;
    try {
        await userService.registerUser(data);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
});

// Get public profile by username
router.get('/profile/:username', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var reviews = await userService.getRecentReviews(profile.userId, 10);
        res.json({ success: true, data: { profile: profile, reviews: reviews } });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Update own profile
router.patch('/profile', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var data = {
            username: req.allParams.username,
            bio: req.allParams.bio,
            avatarFileId: req.allParams.avatarFileId
        };
        var result = await userService.updateProfile(userId, data);
        res.json({ success: true, updated: result.updated });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Set favorites (up to 4 dish IDs)
router.put('/favorites', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var dishIds = req.body.dishIds || [];
        await userService.setFavorites(userId, dishIds);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Get own favorites
router.get('/favorites', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var favorites = await userService.getFavorites(userId);
        res.json({ success: true, data: favorites });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ── Diary ──

// Get diary entries for a user's month
router.get('/profile/:username/diary', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var year = parseInt(req.query.year) || new Date().getFullYear();
        var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        if (month < 1 || month > 12) month = new Date().getMonth() + 1;
        var entries = await userService.getDiaryEntries(profile.userId, year, month);
        var years = await userService.getDiaryYears(profile.userId);
        res.json({ success: true, data: { entries: entries, years: years, year: year, month: month } });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Get user's watchlist
router.get('/profile/:username/watchlist', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var watchlistService = require('./watchlistService');
        var page = parseInt(req.query.page) || 1;
        var pageSize = parseInt(req.query.pageSize) || 20;
        var result = await watchlistService.getWatchlist(profile.userId, page, pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Add quick diary log
router.post('/diary', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var result = await userService.addDiaryLog(userId, {
            dishId: req.allParams.dishId,
            dateTried: req.allParams.dateTried,
            rating: req.allParams.rating
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

module.exports = router;
