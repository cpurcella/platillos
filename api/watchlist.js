var express = require('express');
var router = express.Router();
var watchlistService = require('./watchlistService');
var authorization = require('./middleware');

// Get current user's watchlist dish IDs (for toggling UI state)
router.get('/ids', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var ids = await watchlistService.getWatchlistDishIds(userId);
        res.json({ success: true, data: ids });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Add dish to watchlist
router.post('/:dishId', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var dishId = req.params.dishId;
        if (!dishId) {
            return res.status(400).json({ success: false, message: 'Invalid dishId' });
        }
        await watchlistService.addToWatchlist(userId, dishId);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// Remove dish from watchlist
router.delete('/:dishId', authorization.requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var dishId = req.params.dishId;
        if (!dishId) {
            return res.status(400).json({ success: false, message: 'Invalid dishId' });
        }
        await watchlistService.removeFromWatchlist(userId, dishId);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

module.exports = router;
