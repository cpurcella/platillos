var express = require('express');
var router = express.Router();
var { requireAdmin } = require('./middleware');
var { getOpenAiClient } = require('../ai/client');
var reviewAi = require('../ai/reviews');
var dishAi = require('../ai/dishes');
var restaurantAi = require('../ai/restaurants');
var photoAi = require('../ai/reviewPhotos');

// POST /api/approvals/ai/review/:reviewId — Run AI moderation on a single review
router.post('/ai/review/:reviewId', requireAdmin, async function(req, res) {
    try {
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var reviews = await reviewAi.fetchPendingReviews(50);
        var review = reviews.find(function(r) { return r.reviewId === reviewId; });
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await reviewAi.evaluateSingleReview(client, review);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// POST /api/approvals/ai/dish/:dishId — Run AI moderation on a single dish
router.post('/ai/dish/:dishId', requireAdmin, async function(req, res) {
    try {
        var dishId = req.params.dishId;
        if (!dishId) {
            return res.status(400).json({ success: false, message: 'Invalid dishId' });
        }
        var dishes = await dishAi.fetchPendingDishes(50);
        var dish = dishes.find(function(d) { return String(d.dishId) === String(dishId); });
        if (!dish) {
            return res.status(404).json({ success: false, message: 'Dish not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await dishAi.evaluateSingleDish(client, dish);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// POST /api/approvals/ai/restaurant/:restaurantId — Run AI moderation on a single restaurant
router.post('/ai/restaurant/:restaurantId', requireAdmin, async function(req, res) {
    try {
        var restaurantId = req.params.restaurantId;
        if (!restaurantId) {
            return res.status(400).json({ success: false, message: 'Invalid restaurantId' });
        }
        var restaurants = await restaurantAi.fetchPendingRestaurants(50);
        var restaurant = restaurants.find(function(r) { return String(r.restaurantId) === String(restaurantId); });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await restaurantAi.evaluateSingleRestaurant(client, restaurant);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// POST /api/approvals/ai/photo/:reviewPhotoId — Run AI moderation on a single photo
router.post('/ai/photo/:reviewPhotoId', requireAdmin, async function(req, res) {
    try {
        var photoId = parseInt(req.params.reviewPhotoId, 10);
        if (!photoId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewPhotoId' });
        }
        var photos = await photoAi.fetchPendingReviewPhotos(50);
        var photo = photos.find(function(p) { return p.reviewPhotoId === photoId; });
        if (!photo) {
            return res.status(404).json({ success: false, message: 'Photo not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await photoAi.evaluateSingleReviewPhoto(client, photo);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

module.exports = router;
