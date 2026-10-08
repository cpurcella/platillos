var express = require('express');
var router = express.Router();
var { requestParams } = require('./middleware');
var reviewPhotoService = require('./reviewPhotoService');
var { requireAdmin } = require('./middleware');

router.get('/', async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await reviewPhotoService.getReviewPhotos(params);
        res.json({ success: true, data: result.rows, total: result.total });
    } catch (err) {
        next(err);
    }
});

router.get('/:reviewPhotoId', async function(req, res, next) {
    try {
        var params = requestParams(req);
        var photo = await reviewPhotoService.getReviewPhoto(params);
        if (!photo) {
            return res.status(404).json({ success: false, message: 'Photo not found' });
        }
        res.json({ success: true, data: photo });
    } catch (err) {
        next(err);
    }
});

router.patch('/:reviewPhotoId', requireAdmin, async function(req, res, next) {
    try {
        var params = requestParams(req);
        var result = await reviewPhotoService.updateReviewPhoto(params);
        var status = params.status ? String(params.status).toLowerCase() : '';
        var rotation = params.rotateDegreesClockwise !== undefined && params.rotateDegreesClockwise !== null && params.rotateDegreesClockwise !== '';
        var message = 'Photo updated';
        if (status && rotation) {
            message = 'Photo rotated and ' + status;
        } else if (status) {
            message = 'Photo ' + status;
        } else if (rotation) {
            message = 'Photo rotated';
        }
        res.json({ success: true, message: message, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/:reviewPhotoId/moderations', requireAdmin, require('./moderation').photo);

module.exports = router;
