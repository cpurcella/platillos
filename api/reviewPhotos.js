var express = require('express');
var router = express.Router();
var reviewPhotoService = require('./reviewPhotoService');

router.get('/pending', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.pending = 1;
        var photos = await reviewPhotoService.getReviewPhotos(params);
        res.json({ success: true, data: photos });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/:reviewPhotoId', async function(req, res) {
    try {
        var params = req.allParams || {};
        params.reviewPhotoId = req.params.reviewPhotoId;
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

module.exports = router;
