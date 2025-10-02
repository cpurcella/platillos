var express = require('express');
var router = express.Router();
var dishService = require('./dishService');
var approvalService = require('./approvalService');

router.get('/', async function(req, res) {
    try {
        var data = req.allParams;
        var dishes = await dishService.getDishes(data);
        res.json({ success: true, data: dishes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dish-related API endpoints will go here

// Pending dishes (admin only)
router.get('/pending', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.pending = 1;
        var dishes = await dishService.getDishes(params);
        res.json({ success: true, data: dishes });
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

// Approve/Reject a dish
router.post('/:dishId/:status', async function(req, res) {
    try {
        await approvalService.updateDishStatus(req.allParams);
        res.json({ success: true, message: 'Dish ' + String(req.allParams.status || '').toLowerCase() });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
