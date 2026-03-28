var db = require('../connections');
var config = require('../config');
var dishService = require('../api/dishService');
var { getOpenAiClient, clampLimit } = require('./client');
var { formatDate, extractJsonResult, resolveAiStatus } = require('./utils');

var VALID_VERDICTS = ['approve', 'reject', 'manual_review'];

function buildPublicFileUrl(fileId) {
    if (!fileId) return null;
    return 'https://' + config.bucket + '.s3.amazonaws.com/' + fileId;
}

async function fetchPendingReviews(limit) {
    var sql = "SELECT r.reviewId, r.review AS reviewContent, r.modifications, r.rating, r.dishId, r.submitted, " +
        "r.submittedBy, r.status, d.name AS dishName, d.restaurantId, s.name AS restaurantName, " +
        "u.firstName, u.lastName, u.email " +
        "FROM reviews r " +
        "JOIN dishes d ON r.dishId = d.dishId " +
        "JOIN restaurants s ON d.restaurantId = s.restaurantId " +
        "JOIN users u ON r.submittedBy = u.userId " +
        "WHERE LOWER(COALESCE(r.status, 'pending')) = 'pending' " +
        "ORDER BY r.submitted DESC, r.reviewId DESC LIMIT ?";

    var rows = await db.query(sql, [limit]) || [];

    var reviewIds = rows.map(function(row) { return row.reviewId; });
    var photoMap = {};
    if (reviewIds.length) {
        var photoSql = "SELECT rp.reviewId, rp.fileId FROM reviews_photos rp " +
            "JOIN files f ON rp.fileId = f.fileId " +
            "WHERE rp.reviewId IN (?) " +
            "ORDER BY rp.reviewPhotoId ASC";
        var photoRows = await db.query(photoSql, [reviewIds]) || [];
        photoRows.forEach(function(pr) {
            if (!photoMap[pr.reviewId]) photoMap[pr.reviewId] = [];
            photoMap[pr.reviewId].push(buildPublicFileUrl(pr.fileId));
        });
    }

    return rows.map(function(row) {
        var reviewerName = ((row.firstName || '') + ' ' + (row.lastName || '')).trim();
        return {
            reviewId: row.reviewId,
            reviewText: row.reviewContent || '',
            modifications: row.modifications || '',
            rating: row.rating,
            dishId: row.dishId,
            dishName: row.dishName,
            restaurantId: row.restaurantId,
            restaurantName: row.restaurantName,
            submitted: row.submitted,
            reviewerId: row.submittedBy,
            reviewerName: reviewerName || row.email || 'Anonymous',
            photoUrls: photoMap[row.reviewId] || []
        };
    });
}

function buildReviewPrompt(review) {
    var lines = [
        'You are moderating a user-submitted restaurant dish review. Determine if it is polite, food-focused, and safe to publish.',
        '',
        'Dish: ' + (review.dishName || 'Unknown Dish'),
        'Restaurant: ' + (review.restaurantName || 'Unknown Restaurant'),
        'Rating: ' + (review.rating !== undefined && review.rating !== null ? review.rating + '/5' : 'Not provided'),
        'Reviewer: ' + (review.reviewerName || 'Anonymous'),
        ''
    ];

    if (review.modifications) {
        lines.push('Modifications: ' + review.modifications);
        lines.push('');
    }

    var submittedIso = formatDate(review.submitted);
    if (submittedIso) {
        lines.push('Submitted: ' + submittedIso);
        lines.push('');
    }

    lines.push('Review Text:');
    lines.push(review.reviewText || '[empty review]');
    lines.push('');
    lines.push('Evaluate the review for the following:');
    lines.push('1. The review should primarily discuss the food or dining experience.');
    lines.push('2. Reject content with hate speech, harassment, personal attacks, profanity, explicit or unsafe material.');
    lines.push('3. Reject content that includes personal information, order numbers, or unrelated topics.');
    lines.push('4. If photos are attached, verify they appear to show food relevant to the dish and restaurant described.');
    lines.push('5. If unsure, request manual review.');
    lines.push('');
    lines.push('Return your verdict as JSON using the provided schema.');

    return lines.join('\n');
}

function buildReviewJsonSchema() {
    return {
        name: 'ReviewModeration',
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
                        required: ['reviewId', 'verdict', 'confidence', 'reasoning', 'issues', 'evidence', 'suggestedEdits'],
                        additionalProperties: false,
                        properties: {
                            reviewId: {
                                type: 'integer'
                            },
                            verdict: {
                                type: 'string',
                                enum: VALID_VERDICTS
                            },
                            confidence: {
                                type: 'number',
                                minimum: 0,
                                maximum: 1
                            },
                            reasoning: {
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
                            },
                            suggestedEdits: {
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

function normalizeReviewDecision(decision) {
    if (!decision || typeof decision !== 'object') {
        return null;
    }

    var verdict = String(decision.verdict || '').toLowerCase();
    if (VALID_VERDICTS.indexOf(verdict) === -1) {
        verdict = 'manual_review';
    }

    return {
        reviewId: decision.reviewId,
        verdict: verdict,
        confidence: typeof decision.confidence === 'number' ? Math.max(0, Math.min(1, decision.confidence)) : null,
        reasoning: decision.reasoning || '',
        issues: Array.isArray(decision.issues) ? decision.issues : [],
        evidence: Array.isArray(decision.evidence) ? decision.evidence : [],
        suggestedEdits: Array.isArray(decision.suggestedEdits) ? decision.suggestedEdits : []
    };
}

async function evaluatePendingReviews(options) {
    options = options || {};
    var limit = clampLimit(options.limit);

    var reviews = await fetchPendingReviews(limit);
    if (!reviews.length) {
        return {
            reviews: [],
            aiDecisions: [],
            rawResponse: null
        };
    }

    var client = getOpenAiClient();
    var decisions = [];
    var summaries = [];
    var rawResponses = [];

    for (var i = 0; i < reviews.length; i++) {
        var review = reviews[i];
        var evaluation = await evaluateSingleReview(client, review);
        if (evaluation.decision) {
            decisions.push(evaluation.decision);
        }
        if (evaluation.summary) {
            summaries.push(evaluation.summary);
        }
        rawResponses.push(evaluation.rawResponse);
    }

    return {
        reviews: reviews,
        aiDecisions: decisions,
        summary: summaries.join('\n\n'),
        rawResponse: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
        rawResponses: rawResponses
    };
}

async function evaluateSingleReview(client, review) {
    var userPrompt = buildReviewPrompt(review);

    var userContent = [
        {
            type: 'input_text',
            text: userPrompt
        }
    ];

    if (review.photoUrls && review.photoUrls.length) {
        review.photoUrls.forEach(function(url) {
            userContent.push({
                type: 'input_image',
                image_url: url
            });
        });
    }

    var response;
    try {
        var schemaDef = buildReviewJsonSchema();

        response = await client.responses.create({
            model: config.aiModel,
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'input_text',
                            text: 'You are a helpful but strict content moderator for restaurant reviews. Ensure all published reviews are polite, food-focused, and safe.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: userContent
                }
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
        err.message = 'Failed to obtain AI review moderation result: ' + err.message;
        throw err;
    }

    var outputBlocks = Array.isArray(response && response.output) ? response.output : [];
    var contentParts = outputBlocks.flatMap(function(block) {
        return Array.isArray(block && block.content) ? block.content : [];
    });

    var parsedContent = contentParts.find(function(part) { return part && Object.prototype.hasOwnProperty.call(part, 'parsed'); });

    var parsed = (parsedContent && parsedContent.parsed) || extractJsonResult(response) || {};
    var decisions = Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeReviewDecision).filter(Boolean) : [];
    var decision = decisions.length ? decisions[0] : null;

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

async function applyReviewDecisions(decisions) {
    var reviewerUserId = 'openai';

    if (!Array.isArray(decisions) || !decisions.length) {
        return { updated: 0 };
    }

    var connection = await db.getConnection();
    var updates = 0;
    var approvedDishIds = [];

    try {
        await connection.beginTransaction();

        for (var i = 0; i < decisions.length; i++) {
            var decision = decisions[i];
            if (!decision || !decision.reviewId) {
                continue;
            }

            var selectResult = await connection.query(
                "SELECT reviewId, status, dishId FROM reviews WHERE reviewId = ? FOR UPDATE",
                [decision.reviewId]
            );

            var selectRows = Array.isArray(selectResult) ? selectResult[0] : selectResult;
            if (!selectRows || !selectRows.length) {
                continue;
            }

            var row = selectRows[0];
            var currentStatus = String(row.status || 'pending').toLowerCase();
            var newStatus = resolveAiStatus(decision.verdict, decision.confidence);

            if (newStatus && currentStatus === 'pending') {
                var updateResult = await connection.query(
                    "UPDATE reviews SET status = ?, statusUpdated = ?, statusUpdatedBy = ? WHERE reviewId = ? AND LOWER(COALESCE(status, 'pending')) = 'pending'",
                    [newStatus, Date.now(), reviewerUserId, decision.reviewId]
                );

                var affectedRows = 0;
                if (Array.isArray(updateResult)) {
                    affectedRows = updateResult[0] && typeof updateResult[0].affectedRows === 'number' ? updateResult[0].affectedRows : 0;
                } else if (updateResult && typeof updateResult.affectedRows === 'number') {
                    affectedRows = updateResult.affectedRows;
                }

                updates += affectedRows;
                if (affectedRows > 0 && newStatus === 'approved') {
                    approvedDishIds.push(row.dishId);
                }
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

    if (approvedDishIds.length) {
        var seen = {};
        for (var j = 0; j < approvedDishIds.length; j++) {
            var dishId = approvedDishIds[j];
            if (!dishId || seen[dishId]) continue;
            seen[dishId] = true;
            dishService.setDishScores(dishId).catch(function(err) {
                console.error('[ai/reviews] Failed to update dish scores after AI approval:', err && err.message ? err.message : err);
            });
        }
    }

    return { updated: updates };
}

module.exports = {
    evaluatePendingReviews: evaluatePendingReviews,
    applyReviewDecisions: applyReviewDecisions,
    evaluateSingleReview: evaluateSingleReview,
    fetchPendingReviews: fetchPendingReviews
};
