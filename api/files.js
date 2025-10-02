var express = require('express');
var multer = require('multer');
var multerS3 = require('multer-s3');
var { S3Client } = require('@aws-sdk/client-s3');
var { v4: uuidv4 } = require('uuid');
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

// Configure multer-s3 for S3 storage with a size limit of 2.1 MB
var upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: config.bucket,
        acl: 'public-read',
        key: function(req, file, cb) {
            var uniqueName = uuidv4();
            req.fileId = uniqueName;
            cb(null, uniqueName);
        }
    }),
    limits: { fileSize: 2.1 * 1024 * 1024 } // 2.1 MB size limit
});

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

        var fileData = {
            fileId: req.fileId,
            fileType: req.file.mimetype.split('/')[1],
            fileName: req.file.originalname,
            size: req.file.size,
            uploadedBy: req.allParams.auth.user.userId,
            uploaded: Date.now()
        };

        await fileService.saveFile(fileData);

        res.json({
            success: true,
            data: {
                fileId: req.fileId,
                url: req.file.location
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
