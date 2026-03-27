var express = require('express');
var router = express.Router();
var reviewPhotoService = require('./reviewPhotoService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res) {
    try {
        var params = req.allParams || {};
        var result = await reviewPhotoService.getReviewPhotos(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/pending', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { pending: 1 });
        var result = await reviewPhotoService.getReviewPhotos(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:reviewPhotoId', async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { reviewPhotoId: req.params.reviewPhotoId });
        var photo = await reviewPhotoService.getReviewPhoto(params);
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

router.patch('/:reviewPhotoId', requireAdmin, async function(req, res) {
    try {
        var params = Object.assign({}, req.allParams || {}, { reviewPhotoId: req.params.reviewPhotoId });
        var result = await reviewPhotoService.updateReviewPhoto(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var message = status ? 'Photo ' + status : 'Photo updated';
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
