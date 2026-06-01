var express = require('express');
var router = express.Router();
var userService = require('./userService');
var authorization = require('./middleware');
var paginationHelper = require('./paginationHelper');

// Search users
router.get('/search', async function(req, res) {
    try {
        var q = (req.query.q || '').trim();
        if (!q) return res.json({ success: true, data: [] });
        var limit = paginationHelper.normalizeLimit(req.query.limit, 20, paginationHelper.MAX_USER_SEARCH_LIMIT);
        var users = await userService.searchUsers(q, limit);
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

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
        var responseData = { profile: profile, reviews: reviews };
        // Include follow state if viewer is logged in
        var viewerId = req.allParams.auth && req.allParams.auth.user ? req.allParams.auth.user.userId : null;
        if (viewerId && viewerId !== profile.userId) {
            responseData.isFollowing = await userService.isFollowing(viewerId, profile.userId);
        }
        res.json({ success: true, data: responseData });
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

// Set favorites
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

// Get own favorite dish IDs
router.get('/favorites/ids', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var ids = await userService.getFavoriteDishIds(userId);
        res.json({ success: true, data: ids });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Add a dish to favorites
router.post('/favorites/:dishId', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        await userService.addFavorite(userId, req.params.dishId);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Remove a dish from favorites
router.delete('/favorites/:dishId', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        await userService.removeFavorite(userId, req.params.dishId);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Get paginated favorites for a user
router.get('/profile/:username/favorites', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getPaginatedFavorites(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
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
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await watchlistService.getWatchlist(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Get paginated reviews for a user
router.get('/profile/:username/reviews', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getPaginatedReviews(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Check if user has tried a dish
router.get('/tried/:dishId', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var tried = await userService.hasTriedDish(userId, req.params.dishId);
        res.json({ success: true, data: { tried: tried } });
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

// Get followers for a user
router.get('/profile/:username/followers', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getFollowers(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Get following for a user
router.get('/profile/:username/following', async function(req, res) {
    try {
        var profile = await userService.getProfile(req.allParams.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getFollowing(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ── Follow System ──

router.post('/follow/:userId', authorization.requireAuth, async function(req, res) {
    try {
        var followerId = req.allParams.auth.user.userId;
        var followingId = req.params.userId;
        await userService.followUser(followerId, followingId);
        var counts = await userService.getFollowCounts(followingId);
        res.json({ success: true, following: true, followerCount: counts.followerCount });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

router.delete('/follow/:userId', authorization.requireAuth, async function(req, res) {
    try {
        var followerId = req.allParams.auth.user.userId;
        var followingId = req.params.userId;
        await userService.unfollowUser(followerId, followingId);
        var counts = await userService.getFollowCounts(followingId);
        res.json({ success: true, following: false, followerCount: counts.followerCount });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

module.exports = router;
