var express = require('express');
var router = express.Router();
var reviewService = require('./reviewService');
var { requireAuth, requireAdmin } = require('./middleware');

router.post('/', requireAuth, async function(req, res) {
    try {
        await reviewService.saveReview(req.allParams);

        res.json({ success: true, message: 'Review submitted successfully.' });
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

module.exports = router;
