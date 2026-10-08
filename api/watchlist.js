var express = require('express');
var router = express.Router();
var watchlistService = require('./watchlistService');
var authorization = require('./middleware');

// Get current user's watchlist dish IDs (for toggling UI state)
router.get('/ids', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var ids = await watchlistService.getWatchlistDishIds(userId);
        res.json({ success: true, data: ids });
    } catch (err) {
        next(err);
    }
});

// Add dish to watchlist
router.put('/:dishId', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var dishId = req.params.dishId;
        await watchlistService.addToWatchlist(userId, dishId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Remove dish from watchlist
router.delete('/:dishId', authorization.requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var dishId = req.params.dishId;
        await watchlistService.removeFromWatchlist(userId, dishId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
