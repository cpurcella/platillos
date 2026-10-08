var express = require('express');
var router = express.Router();
var { requestParams } = require('./middleware');
var restaurantService = require('./restaurantService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res, next) {
    try {
        var data = requestParams(req);
        var result = await restaurantService.getRestaurants(data);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/:restaurantId/stats', async function(req, res, next) {
    try {
        var stats = await restaurantService.getRestaurantStats(req.params.restaurantId);
        res.json({ success: true, data: stats });
    } catch (err) {
        next(err);
    }
});

router.get('/:restaurantId', async function(req, res, next) {
    try {
        var restaurant = await restaurantService.getRestaurant(requestParams(req));
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found' });
        }
        res.json({ success: true, data: restaurant });
    } catch (err) {
        next(err);
    }
});

router.patch('/:restaurantId', requireAdmin, async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await restaurantService.updateRestaurant(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Restaurant ' + status : 'Restaurant updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/discoveries', requireAdmin, async function(req, res, next) {
    try {
        var discovery = require('../ai/discovery');
        var result = await discovery.discoverRestaurants({ metro: req.body && req.body.metro });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/search-index/refreshes', requireAdmin, async function(req, res, next) {
    try {
        var vs = require('../ai/vectorStore');
        var metros = (req.body && req.body.metros) || ['Albuquerque'];
        var result = await vs.refreshVectorStore(metros);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/:restaurantId/moderations', requireAdmin, require('./moderation').restaurant);

module.exports = router;
