var express = require('express');
var multer = require('multer');
var Jimp = require('jimp');
var { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
var { randomUUID } = require('crypto');
var config = require('../config');
var fileService = require('./fileService');
var router = express.Router();

// Configure AWS S3 Client
var s3 = new S3Client({
    credentials: {
        accessKeyId: config.awsAccessKey,
        secretAccessKey: config.awsSecretKey
    },
    region: config.awsRegion
});

var upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2.1 * 1024 * 1024 } // 2.1 MB size limit
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

function getVariantMimeType(mimeType) {
    switch ((mimeType || '').toLowerCase()) {
        case Jimp.MIME_PNG:
            return Jimp.MIME_PNG;
        case Jimp.MIME_BMP:
            return Jimp.MIME_BMP;
        case Jimp.MIME_TIFF:
            return Jimp.MIME_TIFF;
        case Jimp.MIME_GIF:
            return Jimp.MIME_GIF;
        case Jimp.MIME_WEBP:
            return Jimp.MIME_WEBP;
        default:
            return Jimp.MIME_JPEG;
    }
}

router.post('/upload', async function(req, res, next) {
    if (!req.allParams.auth || !req.allParams.auth.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }
    next();
}, upload.single('file'), async function(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        var fileId = randomUUID();
        req.fileId = fileId;
        var mimeType = req.file.mimetype || 'application/octet-stream';
        var variantMime = getVariantMimeType(mimeType);
        var originalBuffer = req.file.buffer;

        await uploadToS3(fileId, originalBuffer, mimeType);

        try {
            var baseImage = await Jimp.read(originalBuffer);
            var variantDefinitions = [
                { suffix: '_m', size: 512 },
                { suffix: '_s', size: 256 }
            ];

            await Promise.all(variantDefinitions.map(async function(def) {
                var variant = baseImage.clone().cover(def.size, def.size);
                if (variantMime === Jimp.MIME_JPEG) {
                    variant.quality(80);
                }
                var buffer = await variant.getBufferAsync(variantMime);
                await uploadToS3(fileId + def.suffix, buffer, variantMime);
            }));
        } catch (imageErr) {
            console.error('[files] Failed to create resized variants for file', fileId, imageErr);
            return res.status(400).json({ success: false, message: 'Uploaded file must be a supported image.' });
        }

        var fileData = {
            fileId: fileId,
            fileType: (mimeType.split('/') || [])[1] || '',
            fileName: req.file.originalname,
            size: req.file.size,
            uploadedBy: req.allParams.auth.user.userId,
            uploaded: Date.now()
        };

        await fileService.saveFile(fileData);

        res.json({
            success: true,
            data: {
                fileId: fileId,
                url: getPublicUrl(fileId)
            }
        });
    } catch (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'File size exceeds the 2.1 MB limit.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
