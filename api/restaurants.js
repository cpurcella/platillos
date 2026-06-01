var express = require('express');
var router = express.Router();
var restaurantService = require('./restaurantService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res) {
    try {
        var data = req.allParams;
        var result = await restaurantService.getRestaurants(data);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/pending', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.status = 'pending';
        var result = await restaurantService.getRestaurants(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:restaurantId/stats', async function(req, res) {
    try {
        var stats = await restaurantService.getRestaurantStats(req.params.restaurantId);
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:restaurantId', async function(req, res) {
    try {
        var restaurant = await restaurantService.getRestaurant(req.allParams);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found' });
        }
        res.json({ success: true, data: restaurant });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/:restaurantId', requireAdmin, async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { restaurantId: req.params.restaurantId });
        var result = await restaurantService.updateRestaurant(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Restaurant ' + status : 'Restaurant updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/discover', requireAdmin, async function(req, res) {
    try {
        var discovery = require('../ai/discovery');
        var result = await discovery.discoverRestaurants({ metro: req.body && req.body.metro });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/discover/refresh-vector-store', requireAdmin, async function(req, res) {
    try {
        var vs = require('../ai/vectorStore');
        var metros = (req.body && req.body.metros) || ['Albuquerque'];
        var result = await vs.refreshVectorStore(metros);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
