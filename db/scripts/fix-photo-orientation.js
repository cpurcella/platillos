/**
 * One-time script: download all uploaded photos from S3,
 * apply EXIF orientation correction, and re-upload the
 * original + regenerated _m and _s variants.
 *
 * Usage: node db/scripts/fix-photo-orientation.js
 *
 * Requires .env to be configured with DB and AWS credentials.
 */

require('dotenv').config();

var { Jimp, JimpMime } = require('jimp');
var { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
var config = require('../../config');
var buildAwsClientConfig = require('../../awsClientConfig');
var db = require('../../connections');

var s3 = new S3Client(buildAwsClientConfig());

async function downloadFromS3(key) {
    var response = await s3.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key
    }));
    var chunks = [];
    for await (var chunk of response.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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

async function fixPhoto(fileId, fileType) {
    var mimeType = 'image/' + (fileType || 'jpeg');

    var original = await downloadFromS3(fileId);
    var image = await Jimp.read(original);

    if (!image._exif || !image._exif.tags || !image._exif.tags.Orientation || image._exif.tags.Orientation === 1) {
        return false; // already correct orientation
    }

    image.exifRotate();

    var correctedBuffer = await image.getBuffer(mimeType);
    await uploadToS3(fileId, correctedBuffer, mimeType);

    var variantMime = mimeType === 'image/png' ? JimpMime.png : JimpMime.jpeg;
    var variants = [
        { suffix: '_m', size: 512 },
        { suffix: '_s', size: 256 }
    ];

    await Promise.all(variants.map(async function(def) {
        var variant = image.clone().cover({ w: def.size, h: def.size });
        var buffer = await variant.getBuffer(variantMime, { quality: 80 });
        await uploadToS3(fileId + def.suffix, buffer, variantMime);
    }));

    return true;
}

async function main() {
    var files = await db.query('SELECT fileId, fileType FROM files');
    console.log('Found ' + files.length + ' files to check.');

    var fixed = 0;
    var skipped = 0;
    var errors = 0;

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        try {
            var wasFixed = await fixPhoto(file.fileId, file.fileType);
            if (wasFixed) {
                fixed++;
                console.log('[' + (i + 1) + '/' + files.length + '] Fixed: ' + file.fileId);
            } else {
                skipped++;
                console.log('[' + (i + 1) + '/' + files.length + '] OK:    ' + file.fileId);
            }
        } catch (err) {
            errors++;
            console.error('[' + (i + 1) + '/' + files.length + '] Error: ' + file.fileId, err.message);
        }
    }

    console.log('\nDone. Fixed: ' + fixed + ', Already OK: ' + skipped + ', Errors: ' + errors);
    process.exit(0);
}

main();
