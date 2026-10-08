var express = require('express');
var router = express.Router();
var { requestParams } = require('./middleware');
var dishService = require('./dishService');
var reviewService = require('./reviewService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res, next) {
    try {
        var data = requestParams(req);
        var result = await dishService.getDishes(data);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/metadata/options', async function(req, res, next) {
    try {
        var options = await dishService.getDishMetadataOptions();
        res.json({ success: true, data: options });
    } catch (err) {
        next(err);
    }
});

router.get('/shelves', async function(req, res, next) {
    try {
        var shelves = await dishService.getHomeShelves(requestParams(req));
        res.json({ success: true, data: shelves });
    } catch (err) {
        next(err);
    }
});

router.get('/:dishId/photos', async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await dishService.getDishPhotos(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/:dishId/ratings', async function(req, res, next) {
    try {
        var trend = await reviewService.getRatingsForDish(req.params.dishId);
        res.json({
            success: true,
            data: trend.reviews,
            summary: trend.summary,
            currentScore: trend.currentScore,
            scoreCalculatedAt: trend.scoreCalculatedAt
        });
    } catch (err) {
        next(err);
    }
});

router.get('/:dishId/reviews', async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await reviewService.getReviewsForDish(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/:dishId', async function(req, res, next) {
    try {
        var dish = await dishService.getDish(requestParams(req));
        if (!dish) {
            return res.status(404).json({ success: false, message: 'Dish not found' });
        }
        res.json({ success: true, data: dish });
    } catch (err) {
        next(err);
    }
});

router.patch('/:dishId', requireAdmin, async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await dishService.updateDish(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Dish ' + status : 'Dish updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/:dishId/moderations', requireAdmin, require('./moderation').dish);

module.exports = router;
