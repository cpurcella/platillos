var db = require('../connections');
var config = require('../config');
var { getOpenAiClient, clampLimit } = require('./client');
var { extractJsonResult } = require('./utils');

function buildPublicFileUrl(fileId) {
    if (!fileId) {
        return null;
    }
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId;
}

async function fetchPendingReviewPhotos(limit) {
    var sql = "SELECT rp.reviewPhotoId, rp.reviewId, rp.fileId, r.dishId, r.review AS reviewContent, r.rating AS reviewRating, " +
        "r.submitted AS reviewSubmitted, d.name AS dishName, d.coverPhoto AS dishCoverPhoto, d.restaurantId, s.name AS restaurantName, " +
        "f.fileName, f.fileType, f.uploaded AS photoUploaded " +
        "FROM reviews_photos rp " +
        "JOIN reviews r ON rp.reviewId = r.reviewId " +
        "JOIN dishes d ON r.dishId = d.dishId " +
        "JOIN restaurants s ON d.restaurantId = s.restaurantId " +
        "JOIN files f ON rp.fileId = f.fileId " +
        "WHERE LOWER(COALESCE(rp.status, 'pending')) = 'pending' " +
        "ORDER BY f.uploaded DESC, rp.reviewPhotoId DESC LIMIT ?";

    var rows = await db.query(sql, [limit]);
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
    lines.push('2. Flag any issues such as unrelated food, people, explicit content, text overlays, or low quality.');
    lines.push('3. Decide if the photo should be approved, rejected, or requires manual review.');
    lines.push('4. If the dish lacks a cover photo (or this image is significantly better), indicate whether it should become the new cover photo.');
    lines.push('');
    lines.push('Return a JSON object with your verdict, confidence, reasoning, and whether to set it as the cover photo.');

    return lines.join('\n');
}

function buildPhotoJsonSchema() {
    return {
        name: 'ReviewPhotoModeration',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['decisions'],
            properties: {
                summary: {
                    type: 'string'
                },
                decisions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['reviewPhotoId', 'verdict', 'confidence', 'reasoning', 'setAsCoverPhoto'],
                        additionalProperties: false,
                        properties: {
                            reviewPhotoId: {
                                type: 'integer'
                            },
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
        response = await client.responses.create({
            model: 'gpt-4o-mini',
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'text',
                            text: 'You are an expert food photography moderator. Evaluate images for appropriateness, quality, and relevance to the described dish.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: userPrompt
                        },
                        {
                            type: 'input_image',
                            image_url: photo.photoUrl
                        }
                    ]
                }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: buildPhotoJsonSchema()
            }
        });
    } catch (err) {
        err.message = 'Failed to obtain AI photo moderation result: ' + err.message;
        throw err;
    }

    var parsed = extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizePhotoDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;

    return {
        decision: decision,
        summary: parsed.summary || '',
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
                "SELECT rp.reviewPhotoId, rp.status, rp.fileId, rp.reviewId, r.dishId, d.coverPhoto " +
                "FROM reviews_photos rp " +
                "JOIN reviews r ON rp.reviewId = r.reviewId " +
                "JOIN dishes d ON r.dishId = d.dishId " +
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
            var newStatus = null;

            if (decision.verdict === 'approve') {
                newStatus = 'approved';
            } else if (decision.verdict === 'reject') {
                newStatus = 'rejected';
            }

            if (newStatus && currentStatus === 'pending') {
                var updateResult = await connection.query(
                    "UPDATE reviews_photos SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE reviewPhotoId = ? AND LOWER(COALESCE(status, 'pending')) = 'pending'",
                    [newStatus, Date.now(), reviewerUserId, decision.reviewPhotoId]
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
    applyPhotoDecisions: applyPhotoDecisions
};
