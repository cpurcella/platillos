var express = require('express');
var multer = require('multer');
var { Jimp } = require('jimp');
var { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
var { randomUUID } = require('crypto');
var config = require('../config');
var buildAwsClientConfig = require('../awsClientConfig');
var fileService = require('./fileService');
var router = express.Router();
var { requireAuth } = require('./middleware');

// Configure AWS S3 Client
var s3 = new S3Client(buildAwsClientConfig());

var upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.floor(2.1 * 1024 * 1024) } // 2.1 MB size limit
});

function getPublicUrl(key) {
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + key;
}

async function uploadToS3(key, buffer, contentType) {
    await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read'
    }));
}

router.post('/', requireAuth, upload.single('file'), async function(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        var fileId = randomUUID();

        try {
            var baseImage = await Jimp.read(req.file.buffer);
        } catch (imageErr) {
            console.warn('[files] Invalid image', imageErr.name);
            return res.status(400).json({ success: false, message: 'Uploaded file must be a supported image.' });
        }

        var mimeType = baseImage.mime;
        var originalBuffer = await baseImage.getBuffer(mimeType);
        await uploadToS3(fileId, originalBuffer, mimeType);

        var variantDefinitions = [
            { suffix: '_m', size: 512 },
            { suffix: '_s', size: 256 }
        ];
        await Promise.all(variantDefinitions.map(async function(def) {
            var variant = baseImage.clone().cover({ w: def.size, h: def.size });
            var buffer = await variant.getBuffer(mimeType, { quality: 80 });
            await uploadToS3(fileId + def.suffix, buffer, mimeType);
        }));

        var fileData = {
            fileId: fileId,
            fileType: mimeType.split('/')[1],
            fileName: req.file.originalname,
            size: req.file.size,
            uploadedBy: req.auth.user.userId,
            uploaded: Date.now()
        };

        await fileService.saveFile(fileData);
        try { await require('../aiJobQueue').enqueueJob('frame_photo', fileId); }
        catch (err) { console.error('[files] Framing enqueue failed; reconciliation will retry', fileId); }

        res.status(201).json({
            success: true,
            data: {
                fileId: fileId,
                url: getPublicUrl(fileId)
            }
        });
    } catch (err) {
        next(err);
    }
});

router.patch('/:fileId/framing', requireAuth, async function(req, res, next) {
    try {
        var user = req.auth.user;
        var rows = await require('../connections').query('SELECT fileId, uploadedBy FROM files WHERE fileId = ?', [req.params.fileId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Photo not found.' });
        if (rows[0].uploadedBy !== user.userId && user.isAdmin !== 1) return res.status(403).json({ success: false, message: 'You can only adjust your own photos.' });
        var box = req.body.box;
        if (!require('../public/js/photo-framing').validBox(box)) return res.status(400).json({ success: false, message: 'Choose a valid subject area.' });
        var framing = await require('../ai/photoFraming').apply({ fileId: req.params.fileId, box: box, source: 'manual', confidence: 1 });
        res.json({ success: true, data: framing });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
