var express = require('express');
var router = express.Router();
var userService = require('./userService');
var authorization = require('./middleware');
var paginationHelper = require('./paginationHelper');

router.get('/', function(req, res, next) {
    if (req.query.view === 'admin') return authorization.requireAdmin(req, res, next);
    next();
}, async function(req, res, next) {
    try {
        if (req.query.view === 'admin') {
            var result = await userService.getAdminUsers(req.query);
            return res.json({ success: true, data: result.items, total: result.total });
        }
        var q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        var limit = paginationHelper.normalizeLimit(req.query.limit, 20, paginationHelper.MAX_USER_SEARCH_LIMIT);
        var users = q ? await userService.searchUsers(q, limit) : [];
        res.json({ success: true, data: users });
    } catch (err) {
        next(err);
    }
});

router.post('/', authorization.verifyRecaptcha, async function(req, res, next) {
    try {
        await userService.registerUser(req.body);
        res.location('/api/users/' + req.body.username.toLowerCase()).status(201).json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.use('/me/watchlist', require('./watchlist'));

// Update own profile
router.patch('/me', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var data = {
            username: req.body.username,
            bio: req.body.bio,
            avatarFileId: req.body.avatarFileId
        };
        var result = await userService.updateProfile(userId, data);
        res.json({ success: true, updated: result.updated });
    } catch (err) {
        next(err);
    }
});

// Set favorites
router.put('/me/favorites', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var dishIds = req.body.dishIds;
        await userService.setFavorites(userId, dishIds);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Get own favorites
router.get('/me/favorites', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var favorites = await userService.getFavorites(userId);
        res.json({ success: true, data: favorites });
    } catch (err) {
        next(err);
    }
});

// Get own favorite dish IDs
router.get('/me/favorites/ids', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var ids = await userService.getFavoriteDishIds(userId);
        res.json({ success: true, data: ids });
    } catch (err) {
        next(err);
    }
});

// Add a dish to favorites
router.put('/me/favorites/:dishId', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        await userService.addFavorite(userId, req.params.dishId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Remove a dish from favorites
router.delete('/me/favorites/:dishId', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        await userService.removeFavorite(userId, req.params.dishId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Get paginated favorites for a user
router.get('/:username/favorites', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getPaginatedFavorites(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ── Diary ──

// Get diary entries for a user's month
router.get('/:username/diary', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var year = parseInt(req.query.year) || new Date().getFullYear();
        var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        if (month < 1 || month > 12) month = new Date().getMonth() + 1;
        var entries = await userService.getDiaryEntries(profile.userId, year, month);
        var years = await userService.getDiaryYears(profile.userId);
        res.json({ success: true, data: { entries: entries, years: years, year: year, month: month } });
    } catch (err) {
        next(err);
    }
});

// Get user's watchlist
router.get('/:username/watchlist', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var watchlistService = require('./watchlistService');
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await watchlistService.getWatchlist(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// Get paginated reviews for a user
router.get('/:username/reviews', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getPaginatedReviews(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// Check if user has tried a dish
router.get('/me/tried/:dishId', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var tried = await userService.hasTriedDish(userId, req.params.dishId);
        res.json({ success: true, data: { tried: tried } });
    } catch (err) {
        next(err);
    }
});

// Add quick diary log
router.post('/me/diary', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var result = await userService.addDiaryLog(userId, {
            dishId: req.body.dishId,
            dateTried: req.body.dateTried,
            rating: req.body.rating
        });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// Get followers for a user
router.get('/:username/followers', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getFollowers(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// Get following for a user
router.get('/:username/following', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var pagination = paginationHelper.normalizePagination(req.query, 20);
        var result = await userService.getFollowing(profile.userId, pagination.page, pagination.pageSize);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ── Follow System ──

router.put('/me/following/:userId', authorization.requireAuth, async function(req, res, next) {
    try {
        var followerId = req.auth.user.userId;
        var followingId = req.params.userId;
        await userService.followUser(followerId, followingId);
        var counts = await userService.getFollowCounts(followingId);
        res.json({ success: true, following: true, followerCount: counts.followerCount });
    } catch (err) {
        next(err);
    }
});

router.delete('/me/following/:userId', authorization.requireAuth, async function(req, res, next) {
    try {
        var followerId = req.auth.user.userId;
        var followingId = req.params.userId;
        await userService.unfollowUser(followerId, followingId);
        var counts = await userService.getFollowCounts(followingId);
        res.json({ success: true, following: false, followerCount: counts.followerCount });
    } catch (err) {
        next(err);
    }
});

// Get public profile by username
router.get('/:username', async function(req, res, next) {
    try {
        var profile = await userService.getProfile(req.params.username);
        var reviews = await userService.getRecentReviews(profile.userId, 10);
        var responseData = { profile: profile, reviews: reviews };
        // Include follow state if viewer is logged in
        var viewerId = req.auth && req.auth.user ? req.auth.user.userId : null;
        if (viewerId && viewerId !== profile.userId) {
            responseData.isFollowing = await userService.isFollowing(viewerId, profile.userId);
        }
        res.json({ success: true, data: responseData });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
