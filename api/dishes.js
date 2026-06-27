var express = require('express');
var router = express.Router();
var dishService = require('./dishService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res) {
    try {
        var data = req.allParams;
        var result = await dishService.getDishes(data);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        console.log(err)
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dish-related API endpoints will go here

// Pending dishes (admin only)
router.get('/pending', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.pending = 1;
        var result = await dishService.getDishes(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/metadata/options', async function(req, res) {
    try {
        var options = await dishService.getDishMetadataOptions();
        res.json({ success: true, data: options });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/shelves', async function(req, res) {
    try {
        var shelves = await dishService.getHomeShelves(req.allParams);
        res.json({ success: true, data: shelves });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:dishId/photos', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { dishId: req.params.dishId });
        var result = await dishService.getDishPhotos(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:dishId', async function(req, res) {
    try {
        var dish = await dishService.getDish(req.allParams);
        if (!dish) {
            return res.status(404).json({ success: false, message: 'Dish not found' });
        }
        res.json({ success: true, data: dish });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/:dishId', requireAdmin, async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { dishId: req.params.dishId });
        var result = await dishService.updateDish(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Dish ' + status : 'Dish updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
