var restaurantApprovals = require('./ai/restaurants');
var reviewPhotoApprovals = require('./ai/reviewPhotos');
var reviewApprovals = require('./ai/reviews');
var dishApprovals = require('./ai/dishes');

module.exports = {
    evaluatePendingRestaurants: restaurantApprovals.evaluatePendingRestaurants,
    applyAiDecisions: restaurantApprovals.applyAiDecisions,
    evaluatePendingReviewPhotos: reviewPhotoApprovals.evaluatePendingReviewPhotos,
    applyPhotoDecisions: reviewPhotoApprovals.applyPhotoDecisions,
    evaluatePendingReviews: reviewApprovals.evaluatePendingReviews,
    applyReviewDecisions: reviewApprovals.applyReviewDecisions,
    evaluatePendingDishes: dishApprovals.evaluatePendingDishes,
    applyDishDecisions: dishApprovals.applyDishDecisions
};
