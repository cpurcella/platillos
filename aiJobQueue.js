var db = require('./connections');
var { getOpenAiClient } = require('./ai/client');
var restaurantAi = require('./ai/restaurants');
var dishAi = require('./ai/dishes');
var reviewAi = require('./ai/reviews');
var photoAi = require('./ai/reviewPhotos');

var JOB_HANDLERS = {
    evaluate_restaurant: {
        fetch: restaurantAi.fetchPendingRestaurants,
        evaluate: restaurantAi.evaluateSingleRestaurant,
        apply: function(decision) { return restaurantAi.applyAiDecisions([decision]); },
        idField: 'restaurantId'
    },
    evaluate_dish: {
        fetch: dishAi.fetchPendingDishes,
        evaluate: dishAi.evaluateSingleDish,
        apply: function(decision, lookups) { return dishAi.applyDishDecisions([decision], lookups); },
        idField: 'dishId'
    },
    evaluate_review: {
        fetch: reviewAi.fetchPendingReviews,
        evaluate: reviewAi.evaluateSingleReview,
        apply: function(decision) { return reviewAi.applyReviewDecisions([decision]); },
        idField: 'reviewId'
    },
    evaluate_photo: {
        fetch: photoAi.fetchPendingReviewPhotos,
        evaluate: photoAi.evaluateSingleReviewPhoto,
        apply: function(decision) { return photoAi.applyPhotoDecisions([decision]); },
        idField: 'reviewPhotoId'
    }
};

async function enqueueJob(jobType, targetId) {
    if (!JOB_HANDLERS[jobType]) {
        throw new Error('Unknown job type: ' + jobType);
    }
    var now = Date.now();

    // Skip if there's already a pending/processing job for this target
    var existing = await db.query(
        "SELECT jobId FROM ai_jobs WHERE jobType = ? AND targetId = ? AND status IN ('pending', 'processing') LIMIT 1",
        [jobType, String(targetId)]
    );
    if (existing && existing.length) {
        return { enqueued: false, jobId: existing[0].jobId };
    }

    var result = await db.query(
        'INSERT INTO ai_jobs (jobType, targetId, status, attempts, maxAttempts, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [jobType, String(targetId), 'pending', 0, 3, now, now]
    );
    return { enqueued: true, jobId: result.insertId };
}

async function processJobs(batchSize) {
    batchSize = batchSize || 10;
    var now = Date.now();

    // Claim pending jobs (oldest first), skip ones that exceeded max attempts
    var jobs = await db.query(
        "SELECT * FROM ai_jobs WHERE status = 'pending' AND attempts < maxAttempts ORDER BY createdAt ASC LIMIT ?",
        [batchSize]
    );

    if (!jobs || !jobs.length) {
        return { processed: 0, succeeded: 0, failed: 0 };
    }

    var client = getOpenAiClient();
    var succeeded = 0;
    var failed = 0;

    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        var handler = JOB_HANDLERS[job.jobType];

        if (!handler) {
            await db.query(
                "UPDATE ai_jobs SET status = 'failed', error = ?, updatedAt = ? WHERE jobId = ?",
                ['Unknown job type: ' + job.jobType, now, job.jobId]
            );
            failed++;
            continue;
        }

        // Mark as processing
        await db.query(
            "UPDATE ai_jobs SET status = 'processing', attempts = attempts + 1, updatedAt = ? WHERE jobId = ?",
            [now, job.jobId]
        );

        try {
            // Fetch the pending item from its source table
            var items = await handler.fetch(50);
            var item = items.find(function(r) {
                return String(r[handler.idField]) === String(job.targetId);
            });

            if (!item) {
                // Item no longer pending — mark job as completed (nothing to do)
                await db.query(
                    "UPDATE ai_jobs SET status = 'completed', result = ?, updatedAt = ? WHERE jobId = ?",
                    [JSON.stringify({ skipped: true, reason: 'Item no longer pending' }), Date.now(), job.jobId]
                );
                succeeded++;
                continue;
            }

            var evaluation = await handler.evaluate(client, item);

            // Ensure the decision carries the correct target ID
            if (evaluation.decision && handler.idField) {
                evaluation.decision[handler.idField] = item[handler.idField];
            }

            // Apply the decision (update status, insert tags, etc.)
            if (evaluation.decision && handler.apply) {
                await handler.apply(evaluation.decision, evaluation.lookups);
            }

            await db.query(
                "UPDATE ai_jobs SET status = 'completed', result = ?, updatedAt = ? WHERE jobId = ?",
                [JSON.stringify(evaluation.decision || null), Date.now(), job.jobId]
            );
            succeeded++;
        } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            var newStatus = (job.attempts + 1) >= job.maxAttempts ? 'failed' : 'pending';
            await db.query(
                "UPDATE ai_jobs SET status = ?, error = ?, updatedAt = ? WHERE jobId = ?",
                [newStatus, errorMessage, Date.now(), job.jobId]
            );
            failed++;
        }
    }

    return { processed: jobs.length, succeeded: succeeded, failed: failed };
}

async function reconcileOrphans() {
    var enqueued = 0;

    // Find pending photos with no pending/processing job
    var orphanPhotos = await db.query(
        "SELECT rp.reviewPhotoId FROM reviews_photos rp " +
        "WHERE LOWER(COALESCE(rp.status, 'pending')) = 'pending' " +
        "AND NOT EXISTS (SELECT 1 FROM ai_jobs aj WHERE aj.jobType = 'evaluate_photo' AND aj.targetId = CAST(rp.reviewPhotoId AS CHAR) AND aj.status IN ('pending', 'processing')) " +
        "LIMIT 20"
    );
    for (var i = 0; i < orphanPhotos.length; i++) {
        await enqueueJob('evaluate_photo', orphanPhotos[i].reviewPhotoId);
        enqueued++;
    }

    // Find pending restaurants with no pending/processing job
    var orphanRestaurants = await db.query(
        "SELECT r.restaurantId FROM restaurants r " +
        "WHERE LOWER(COALESCE(r.status, 'pending')) = 'pending' " +
        "AND NOT EXISTS (SELECT 1 FROM ai_jobs aj WHERE aj.jobType = 'evaluate_restaurant' AND aj.targetId = r.restaurantId AND aj.status IN ('pending', 'processing')) " +
        "LIMIT 20"
    );
    for (var j = 0; j < orphanRestaurants.length; j++) {
        await enqueueJob('evaluate_restaurant', orphanRestaurants[j].restaurantId);
        enqueued++;
    }

    // Find pending dishes with no pending/processing job
    var orphanDishes = await db.query(
        "SELECT d.dishId FROM dishes d " +
        "WHERE LOWER(COALESCE(d.status, 'pending')) = 'pending' " +
        "AND NOT EXISTS (SELECT 1 FROM ai_jobs aj WHERE aj.jobType = 'evaluate_dish' AND aj.targetId = d.dishId AND aj.status IN ('pending', 'processing')) " +
        "LIMIT 20"
    );
    for (var k = 0; k < orphanDishes.length; k++) {
        await enqueueJob('evaluate_dish', orphanDishes[k].dishId);
        enqueued++;
    }

    return { enqueued: enqueued };
}

module.exports = {
    enqueueJob: enqueueJob,
    processJobs: processJobs,
    reconcileOrphans: reconcileOrphans
};
