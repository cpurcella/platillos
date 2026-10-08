var express = require('express');
var router = express.Router();
var { requestParams } = require('./middleware');
var reviewService = require('./reviewService');
var { requireAuth, requireAdmin } = require('./middleware');

router.post('/', requireAuth, async function(req, res, next) {
    try {
        var result = await reviewService.saveReview(requestParams(req));

        res.location('/api/reviews/' + result.reviewId).status(201).json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (err) {
        next(err);
    }
});

router.get('/', async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await reviewService.getReviews(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/feed/:tab', async function(req, res, next) {
    try {
        var params = Object.assign({}, requestParams(req), { tab: req.params.tab });
        var result = await reviewService.getFeed(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/:reviewId', async function(req, res, next) {
    try {
        var params = requestParams(req);
        params.reviewId = req.params.reviewId;
        params.pageSize = 1;
        params.page = 1;
        var result = await reviewService.getReviews(params);
        var review = result.rows[0];
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }
        res.json({ success: true, data: review });
    } catch (err) {
        next(err);
    }
});

router.patch('/:reviewId', requireAdmin, async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await reviewService.updateReview(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Review ' + status : 'Review updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        next(err);
    }
});

router.put('/:reviewId/vote', requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var value = parseInt(req.body.value, 10);
        if (value !== 1 && value !== -1) {
            return res.status(400).json({ success: false, message: 'Value must be 1 or -1' });
        }
        var result = await reviewService.voteReview(userId, reviewId, value);
        res.json({ success: true, likeCount: result.likeCount, userVote: result.userVote });
    } catch (err) {
        next(err);
    }
});

router.delete('/:reviewId/vote', requireAuth, async function(req, res, next) {
    try {
        var userId = req.auth.user.userId;
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var result = await reviewService.removeVote(userId, reviewId);
        res.json({ success: true, likeCount: result.likeCount, userVote: result.userVote });
    } catch (err) {
        next(err);
    }
});

router.post('/:reviewId/moderations', requireAdmin, require('./moderation').review);

module.exports = router;
