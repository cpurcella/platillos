var express = require('express');
var router = express.Router();
var reviewService = require('./reviewService');
var { requireAuth, requireAdmin } = require('./middleware');

router.post('/', requireAuth, async function(req, res) {
    try {
        var result = await reviewService.saveReview(req.allParams);

        res.json({
            success: true,
            message: (result && result.message) || 'Review submitted successfully.',
            data: result || null
        });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// Add: GET /api/reviews - paged list with optional filters and photos
router.get('/', async function(req, res) {
    try {
        var params = req.allParams || {};
        var result = await reviewService.getReviews(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/feed/:tab', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { tab: req.params.tab });
        var result = await reviewService.getFeed(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/dish/:dishId/ratings', async function(req, res) {
    try {
        var trend = await reviewService.getRatingsForDish(req.params.dishId);
        res.json({
            success: true,
            data: trend.reviews || [],
            currentScore: trend.currentScore,
            scoreCalculatedAt: trend.scoreCalculatedAt
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/dish/:dishId', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { dishId: req.params.dishId });
        var result = await reviewService.getReviewsForDish(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:reviewId', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.reviewId = req.params.reviewId;
        params.pageSize = 1;
        params.page = 1;
        var result = await reviewService.getReviews(params);
        var review = (result.rows && result.rows.length) ? result.rows[0] : null;
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }
        res.json({ success: true, data: review });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/:reviewId', requireAdmin, async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { reviewId: req.params.reviewId });
        var result = await reviewService.updateReview(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Review ' + status : 'Review updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:reviewId/vote', requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var value = parseInt(req.allParams.value, 10);
        if (value !== 1 && value !== -1) {
            return res.status(400).json({ success: false, message: 'Value must be 1 or -1' });
        }
        var result = await reviewService.voteReview(userId, reviewId, value);
        res.json({ success: true, likeCount: result.likeCount, userVote: result.userVote });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/:reviewId/vote', requireAuth, async function(req, res) {
    try {
        var userId = req.allParams.auth.user.userId;
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var result = await reviewService.removeVote(userId, reviewId);
        res.json({ success: true, likeCount: result.likeCount, userVote: result.userVote });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
