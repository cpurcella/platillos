var express = require('express');
var router = express.Router();
var approvalService = require('./approvalService');

router.post('/reviews/:reviewId/:status', async function(req, res) {
    try {
        await approvalService.updateReviewStatus(req.allParams);
        res.json({ success: true, message: 'Review ' + String(req.allParams.status || '').toLowerCase() });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/dishes/:dishId/:status', async function(req, res) {
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

router.post('/restaurants/:restaurantId/:status', async function(req, res) {
    try {
        await approvalService.updateRestaurantStatus(req.allParams);
        res.json({ success: true, message: 'Restaurant ' + String(req.allParams.status || '').toLowerCase() });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/photos/:reviewPhotoId/:status', async function(req, res) {
    try {
        await approvalService.updatePhotoStatus(req.allParams);
        res.json({ success: true, message: 'Photo ' + String(req.allParams.status || '').toLowerCase() });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/photos', async function(req, res) {
    try {
        var params = Object.assign({ pageSize: 10, page: 1 }, req.allParams || {});
        var rows = await approvalService.getReviewPhotos(params);
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/photos/pending', async function(req, res) {
    try {
        var params = Object.assign({ pageSize: 10, page: 1 }, req.allParams || {}, { pending: 1 });
        var rows = await approvalService.getReviewPhotos(params);
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/photos/:reviewPhotoId', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { reviewPhotoId: req.params.reviewPhotoId });
        var photo = await approvalService.getReviewPhoto(params);
        if (!photo) {
            return res.status(404).json({ success: false, message: 'Photo not found' });
        }
        res.json({ success: true, data: photo });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
