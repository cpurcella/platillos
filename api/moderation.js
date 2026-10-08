var { getOpenAiClient } = require('../ai/client');
var reviewAi = require('../ai/reviews');
var dishAi = require('../ai/dishes');
var restaurantAi = require('../ai/restaurants');
var photoAi = require('../ai/reviewPhotos');

async function review(req, res, next) {
    try {
        var reviewId = parseInt(req.params.reviewId, 10);
        if (!reviewId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewId' });
        }
        var reviews = await reviewAi.fetchPendingReviews(1, reviewId);
        var review = reviews[0];
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await reviewAi.evaluateSingleReview(client, review);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        next(err);
    }
}

async function dish(req, res, next) {
    try {
        var dishId = req.params.dishId;
        var dishes = await dishAi.fetchPendingDishes(1, dishId);
        var dish = dishes[0];
        if (!dish) {
            return res.status(404).json({ success: false, message: 'Dish not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await dishAi.evaluateSingleDish(client, dish);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        next(err);
    }
}

async function restaurant(req, res, next) {
    try {
        var restaurantId = req.params.restaurantId;
        var restaurants = await restaurantAi.fetchPendingRestaurants(1, restaurantId);
        var restaurant = restaurants[0];
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await restaurantAi.evaluateSingleRestaurant(client, restaurant);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        next(err);
    }
}

async function photo(req, res, next) {
    try {
        var photoId = parseInt(req.params.reviewPhotoId, 10);
        if (!photoId) {
            return res.status(400).json({ success: false, message: 'Invalid reviewPhotoId' });
        }
        var photos = await photoAi.fetchPendingReviewPhotos(1, photoId);
        var photo = photos[0];
        if (!photo) {
            return res.status(404).json({ success: false, message: 'Photo not found or not pending' });
        }
        var client = getOpenAiClient();
        var result = await photoAi.evaluateSingleReviewPhoto(client, photo);
        res.json({ success: true, data: result.decision, summary: result.summary });
    } catch (err) {
        next(err);
    }
}

module.exports = { review: review, dish: dish, restaurant: restaurant, photo: photo };
