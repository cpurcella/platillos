var db = require('../connections');
var Jimp = require('jimp');
var { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
var config = require('../config');
var buildAwsClientConfig = require('../awsClientConfig');
var { getOpenAiClient, clampLimit } = require('./client');
var { extractJsonResult, resolveAiStatus } = require('./utils');

var s3 = new S3Client(buildAwsClientConfig());

function buildPublicFileUrl(fileId) {
    if (!fileId) {
        return null;
    }
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId;
}

function getStoredMimeType(fileType) {
    switch (String(fileType || '').toLowerCase()) {
        case 'png':
            return Jimp.MIME_PNG;
        case 'bmp':
            return Jimp.MIME_BMP;
        case 'tiff':
        case 'tif':
            return Jimp.MIME_TIFF;
        case 'gif':
            return Jimp.MIME_GIF;
        case 'webp':
            return Jimp.MIME_WEBP;
        case 'jpg':
        case 'jpeg':
        default:
            return Jimp.MIME_JPEG;
    }
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

function getValidRotationDegrees(value) {
    return [0, 90, 180, 270].indexOf(value) === -1 ? 0 : value;
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

async function getObjectBuffer(key) {
    var response = await s3.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key
    }));

    return Buffer.from(await response.Body.transformToByteArray());
}

async function rotateStoredPhoto(fileId, fileType, rotateDegreesClockwise) {
    var rotationDegrees = getValidRotationDegrees(rotateDegreesClockwise);
    if (!rotationDegrees || !fileId) {
        return false;
    }

    var mimeType = getStoredMimeType(fileType);
    var variantMime = getVariantMimeType(mimeType);
    var originalBuffer = await getObjectBuffer(fileId);
    var image = await Jimp.read(originalBuffer);

    image.rotate(-rotationDegrees);

    var rotatedOriginalBuffer = await image.getBufferAsync(mimeType);
    await uploadToS3(fileId, rotatedOriginalBuffer, mimeType);

    var variantDefinitions = [
        { suffix: '_m', size: 512 },
        { suffix: '_s', size: 256 }
    ];

    await Promise.all(variantDefinitions.map(async function(def) {
        var variant = image.clone().cover(def.size, def.size);
        if (variantMime === Jimp.MIME_JPEG) {
            variant.quality(80);
        }
        var buffer = await variant.getBufferAsync(variantMime);
        await uploadToS3(fileId + def.suffix, buffer, variantMime);
    }));

    return true;
}

async function fetchPendingReviewPhotos(limit, targetId) {
    var sql = "SELECT rp.reviewPhotoId, rp.reviewId, rp.fileId, r.dishId, r.review AS reviewContent, r.rating AS reviewRating, " +
        "r.submitted AS reviewSubmitted, d.name AS dishName, d.coverPhoto AS dishCoverPhoto, d.restaurantId, s.name AS restaurantName, " +
        "f.fileName, f.fileType, f.uploaded AS photoUploaded " +
        "FROM reviews_photos rp " +
        "JOIN reviews r ON rp.reviewId = r.reviewId " +
        "JOIN dishes d ON r.dishId = d.dishId " +
        "JOIN restaurants s ON d.restaurantId = s.restaurantId " +
        "JOIN files f ON rp.fileId = f.fileId " +
        "WHERE LOWER(COALESCE(rp.status, 'pending')) = 'pending' " +
        (targetId ? 'AND rp.reviewPhotoId = ? ' : '') +
        "ORDER BY f.uploaded ASC, rp.reviewPhotoId ASC LIMIT ?";

    var rows = await db.query(sql, targetId ? [targetId, limit] : [limit]);
    rows = rows || [];

    return rows.map(function(row) {
        var reviewText = row.reviewContent || '';
        return {
            reviewPhotoId: row.reviewPhotoId,
            reviewId: row.reviewId,
            fileId: row.fileId,
            photoUrl: buildPublicFileUrl(row.fileId),
            photoFileName: row.fileName,
            photoMimeType: row.fileType,
            photoUploaded: row.photoUploaded,
            dishId: row.dishId,
            dishName: row.dishName,
            restaurantId: row.restaurantId,
            restaurantName: row.restaurantName,
            dishHasCoverPhoto: !!row.dishCoverPhoto,
            currentCoverPhoto: row.dishCoverPhoto,
            reviewText: reviewText,
            reviewTextExcerpt: reviewText && reviewText.length > 480 ? reviewText.slice(0, 480) + '…' : reviewText,
            reviewRating: row.reviewRating,
            reviewSubmitted: row.reviewSubmitted
        };
    });
}

function buildPhotoPrompt(photo) {
    var lines = [
        'You are reviewing a user-submitted food photo for moderation.',
        '',
        'Dish: ' + (photo.dishName || 'Unknown Dish'),
        'Restaurant: ' + (photo.restaurantName || 'Unknown Restaurant')
    ];

    if (photo.reviewRating !== undefined && photo.reviewRating !== null) {
        lines.push('Review Rating: ' + photo.reviewRating + '/5');
    }

    if (photo.reviewTextExcerpt) {
        lines.push('Review Excerpt: ' + photo.reviewTextExcerpt);
    }

    lines.push('Photo File: ' + (photo.photoFileName || photo.fileId));

    if (photo.dishHasCoverPhoto) {
        lines.push('This dish already has a cover photo. Only recommend replacing it if the current image is clearly better.');
    } else {
        lines.push('This dish does not currently have a cover photo. If this image would make a great representative cover photo for the dish, say so.');
    }

    lines.push('');
    lines.push('Tasks:');
    lines.push('1. Confirm whether the image is an appropriate, high-quality depiction of the dish being reviewed.');
    lines.push('2. Use web search to look up the dish at the restaurant and verify the photo matches what the dish should look like.');
    lines.push('3. Flag any issues such as unrelated food, people, explicit content, text overlays, or low quality.');
    lines.push('4. Decide whether the photo is already oriented correctly for normal viewing. If not, specify how many clockwise degrees are needed to fix it (0, 90, 180, or 270 only).');
    lines.push('5. Decide if the photo should be approved, rejected, or requires manual review.');
    lines.push('6. If the dish lacks a cover photo (or this image is significantly better), indicate whether it should become the new cover photo.');
    lines.push('');
    lines.push('Return a JSON object with your verdict, confidence, orientation assessment, reasoning, and whether to set it as the cover photo.');

    return lines.join('\n');
}

function buildPhotoJsonSchema() {
    return {
        name: 'ReviewPhotoModeration',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'decisions'],
            properties: {
                summary: {
                    type: 'string'
                },
                decisions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['verdict', 'confidence', 'reasoning', 'orientationCorrect', 'rotateDegreesClockwise', 'orientationReasoning', 'setAsCoverPhoto', 'coverPhotoReasoning', 'issues', 'evidence'],
                        additionalProperties: false,
                        properties: {
                            verdict: {
                                type: 'string',
                                enum: ['approve', 'reject', 'manual_review']
                            },
                            confidence: {
                                type: 'number',
                                minimum: 0,
                                maximum: 1
                            },
                            reasoning: {
                                type: 'string'
                            },
                            orientationCorrect: {
                                type: 'boolean'
                            },
                            rotateDegreesClockwise: {
                                type: 'number',
                                enum: [0, 90, 180, 270]
                            },
                            orientationReasoning: {
                                type: 'string'
                            },
                            setAsCoverPhoto: {
                                type: 'boolean'
                            },
                            coverPhotoReasoning: {
                                type: 'string'
                            },
                            issues: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            evidence: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}

function normalizePhotoDecision(decision) {
    if (!decision || typeof decision !== 'object') {
        return null;
    }

    var verdict = String(decision.verdict || '').toLowerCase();
    if (['approve', 'reject', 'manual_review'].indexOf(verdict) === -1) {
        verdict = 'manual_review';
    }

    return {
        reviewPhotoId: decision.reviewPhotoId,
        verdict: verdict,
        confidence: typeof decision.confidence === 'number' ? Math.max(0, Math.min(1, decision.confidence)) : null,
        reasoning: decision.reasoning || '',
        orientationCorrect: Boolean(decision.orientationCorrect),
        rotateDegreesClockwise: getValidRotationDegrees(decision.rotateDegreesClockwise),
        orientationReasoning: decision.orientationReasoning || '',
        setAsCoverPhoto: Boolean(decision.setAsCoverPhoto),
        coverPhotoReasoning: decision.coverPhotoReasoning || '',
        issues: Array.isArray(decision.issues) ? decision.issues : [],
        evidence: Array.isArray(decision.evidence) ? decision.evidence : []
    };
}

async function evaluatePendingReviewPhotos(options) {
    options = options || {};
    var limit = clampLimit(options.limit);

    var photos = await fetchPendingReviewPhotos(limit);
    if (!photos.length) {
        return {
            photos: [],
            aiDecisions: [],
            rawResponse: null
        };
    }

    var client = getOpenAiClient();
    var decisions = [];
    var summaries = [];
    var rawResponses = [];

    for (var i = 0; i < photos.length; i++) {
        var photo = photos[i];
        var evaluation = await evaluateSingleReviewPhoto(client, photo);
        if (evaluation.decision) {
            decisions.push(evaluation.decision);
        }
        if (evaluation.summary) {
            summaries.push(evaluation.summary);
        }
        rawResponses.push(evaluation.rawResponse);
    }

    return {
        photos: photos,
        aiDecisions: decisions,
        summary: summaries.join('\n\n'),
        rawResponse: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
        rawResponses: rawResponses
    };
}

async function evaluateSingleReviewPhoto(client, photo) {
    if (!photo || !photo.photoUrl) {
        var missingPhotoErr = new Error('Missing photo URL for AI evaluation');
        missingPhotoErr.status = 400;
        throw missingPhotoErr;
    }

    var userPrompt = buildPhotoPrompt(photo);

    var response;
    try {
        var schemaDef = buildPhotoJsonSchema();

        response = await client.responses.create({
            model: config.aiModel,
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'input_text',
                            text: 'You are an expert food photography moderator. Evaluate images for appropriateness, quality, and relevance to the described dish.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: userPrompt
                        },
                        {
                            type: 'input_image',
                            image_url: photo.photoUrl
                        }
                    ]
                }
            ],
            tools: [
                { type: 'web_search' }
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: schemaDef.name,
                    schema: schemaDef.schema,
                    strict: true
                }
            }
        });
    } catch (err) {
        err.message = 'Failed to obtain AI photo moderation result: ' + err.message;
        throw err;
    }

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function(block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });

    var parsedContent = contentParts.find(function(part) { return part && Object.prototype.hasOwnProperty.call(part, 'parsed'); });

    var parsed = (parsedContent && parsedContent.parsed) || extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizePhotoDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;
    if (decision) {
        decision.reviewPhotoId = photo.reviewPhotoId;
    } else if (parsed.verdict) {
        decision = normalizePhotoDecision(parsed);
        if (decision) decision.reviewPhotoId = photo.reviewPhotoId;
    }

    var sources = contentParts.flatMap(function(part) {
        if (!part) return [];
        if (Array.isArray(part.citations)) return part.citations;
        if (Array.isArray(part.sources)) return part.sources;
        return [];
    });
    if (!sources.length && Array.isArray(response && response.sources)) {
        sources = response.sources;
    }

    return {
        decision: decision,
        summary: parsed.summary || '',
        sources: sources,
        rawResponse: response
    };
}

async function applyPhotoDecisions(decisions) {
    var reviewerUserId = 'openai';

    if (!Array.isArray(decisions) || !decisions.length) {
        return { updated: 0, coverPhotosSet: 0 };
    }

    var connection = await db.getConnection();
    var updates = 0;
    var coverUpdates = 0;

    try {
        await connection.beginTransaction();

        for (var i = 0; i < decisions.length; i++) {
            var decision = decisions[i];
            if (!decision || !decision.reviewPhotoId) {
                continue;
            }

            var selectResult = await connection.query(
                "SELECT rp.reviewPhotoId, rp.status, rp.fileId, rp.reviewId, r.dishId, d.coverPhoto, f.fileType " +
                "FROM reviews_photos rp " +
                "JOIN reviews r ON rp.reviewId = r.reviewId " +
                "JOIN dishes d ON r.dishId = d.dishId " +
                "JOIN files f ON rp.fileId = f.fileId " +
                "WHERE rp.reviewPhotoId = ? FOR UPDATE",
                [decision.reviewPhotoId]
            );

            var selectRows = Array.isArray(selectResult) ? selectResult[0] : selectResult;
            if (!selectRows || !selectRows.length) {
                continue;
            }

            var row = selectRows[0];
            var currentStatus = String(row.status || 'pending').toLowerCase();
            var finalStatus = currentStatus;
            var newStatus = resolveAiStatus(decision.verdict, decision.confidence);

            if (currentStatus === 'pending' && newStatus === 'approved' && decision.rotateDegreesClockwise) {
                await rotateStoredPhoto(row.fileId, row.fileType, decision.rotateDegreesClockwise);
            }

            if (newStatus && currentStatus === 'pending') {
                var aiReasoning = newStatus === 'needs_review' ? (decision.reasoning || null) : null;
                var updateResult = await connection.query(
                    "UPDATE reviews_photos SET status = ?, statusUpdated = ?, statusUpdatedBy = ?, aiReasoning = ? WHERE reviewPhotoId = ? AND LOWER(COALESCE(status, 'pending')) = 'pending'",
                    [newStatus, Date.now(), reviewerUserId, aiReasoning, decision.reviewPhotoId]
                );

                var affectedRows = 0;
                if (Array.isArray(updateResult)) {
                    affectedRows = updateResult[0] && typeof updateResult[0].affectedRows === 'number' ? updateResult[0].affectedRows : 0;
                } else if (updateResult && typeof updateResult.affectedRows === 'number') {
                    affectedRows = updateResult.affectedRows;
                }

                updates += affectedRows;
                if (affectedRows > 0) {
                    finalStatus = newStatus;
                }
            }

            var shouldSetCover = Boolean(decision.setAsCoverPhoto) && !row.coverPhoto && finalStatus === 'approved';

            if (shouldSetCover) {
                var coverResult = await connection.query(
                    "UPDATE dishes SET coverPhoto = ? WHERE dishId = ? AND (coverPhoto IS NULL OR coverPhoto = '')",
                    [row.fileId, row.dishId]
                );

                var coverAffected = 0;
                if (Array.isArray(coverResult)) {
                    coverAffected = coverResult[0] && typeof coverResult[0].affectedRows === 'number' ? coverResult[0].affectedRows : 0;
                } else if (coverResult && typeof coverResult.affectedRows === 'number') {
                    coverAffected = coverResult.affectedRows;
                }

                coverUpdates += coverAffected;
            }
        }

        await connection.commit();
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            // ignore rollback errors
        }
        throw err;
    } finally {
        connection.release();
    }

    return { updated: updates, coverPhotosSet: coverUpdates };
}

module.exports = {
    evaluatePendingReviewPhotos: evaluatePendingReviewPhotos,
    applyPhotoDecisions: applyPhotoDecisions,
    evaluateSingleReviewPhoto: evaluateSingleReviewPhoto,
    fetchPendingReviewPhotos: fetchPendingReviewPhotos,
    rotateStoredPhoto: rotateStoredPhoto
};
