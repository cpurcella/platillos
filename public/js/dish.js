var dishPage = {
    dishId: null,
    currentPage: 1,
    pageSize: 10,
    hasNextPage: false,

    init: function() {
        dishPage.dishId = dishPage.getDishIdFromPath();
        if (!dishPage.dishId) {
            dishPage.renderDishError('Dish not found.');
            dishPage.renderReviewsError('Unable to determine dish.');
            return;
        }

        dishPage.bindEvents();
        dishPage.loadDish();
        dishPage.loadReviews();
    },

    getDishIdFromPath: function() {
        var segments = (window.location.pathname || '')
            .split('/')
            .filter(function(part) { return part.length; });
        if (segments.length < 2 || segments[0] !== 'dishes') {
            return null;
        }
        return segments[1];
    },

    bindEvents: function() {
        $('#reviews-prev').on('click', function() {
            if (dishPage.currentPage > 1) {
                dishPage.currentPage -= 1;
                dishPage.loadReviews();
            }
        });

        $('#reviews-next').on('click', function() {
            if (dishPage.hasNextPage) {
                dishPage.currentPage += 1;
                dishPage.loadReviews();
            }
        });
    },

    loadDish: async function() {
        try {
            dishPage.renderDishLoading();
            var res = await $.get('/api/dishes/' + encodeURIComponent(dishPage.dishId));
            if (!res.success || !res.data) {
                dishPage.renderDishError((res && res.message) || 'Dish not found.');
                return;
            }
            dishPage.renderDish(res.data);
        } catch (err) {
            dishPage.renderDishError('Failed to load dish.');
        }
    },

    renderDishLoading: function() {
        $('#dish-name').text('Loading...');
        $('#dish-restaurant').text('');
        $('#dish-score').text('');
        $('#dish-cover-container').empty();
    },

    renderDishError: function(message) {
        var safeMessage = $('<div>').text(message || 'Unavailable').html();
        $('#dish-name').text('Dish');
        $('#dish-restaurant').text('');
        $('#dish-score').text('');
        $('#dish-cover-container').html('<div class="dish-cover-placeholder">' + safeMessage + '</div>');
    },

    renderDish: function(dish) {
        $('#dish-name').text(dish.name || 'Dish');
        $('#dish-restaurant').text(dish.restaurantName || '');

        var scoreValue = dish.score;
        var scoreText = 'Score: N/A';
        if (scoreValue !== null && scoreValue !== undefined) {
            var formatted = typeof scoreValue === 'number' ? scoreValue.toFixed(1) : scoreValue;
            scoreText = 'Score: ' + formatted;
        }
        $('#dish-score').text(scoreText);

        if (dish.coverPhoto) {
            $('#dish-cover-container').html('<img src="' + dish.coverPhoto + '" alt="' + (dish.name || 'Dish') + ' cover photo">');
        } else {
            $('#dish-cover-container').html('<div class="dish-cover-placeholder">No photo available</div>');
        }
    },

    loadReviews: async function() {
        var $reviewsList = $('#reviews-list');
        $reviewsList.html('<div class="reviews-loading">Loading reviews...</div>');
        $('#reviews-prev').prop('disabled', true);
        $('#reviews-next').prop('disabled', true);
        $('#reviews-page').text('Page ' + dishPage.currentPage);

        try {
            var res = await $.get('/api/reviews/dish/' + encodeURIComponent(dishPage.dishId), {
                page: dishPage.currentPage,
                pageSize: dishPage.pageSize
            });
            if (!res.success) {
                dishPage.renderReviewsError((res && res.message) || 'Failed to load reviews');
                return;
            }
            dishPage.renderReviews(res.data || []);
        } catch (err) {
            dishPage.renderReviewsError('Failed to load reviews.');
        }
    },

    renderReviewsError: function(message) {
        var safeMessage = $('<div>').text(message || 'Error').html();
        $('#reviews-list').html('<div class="reviews-error">' + safeMessage + '</div>');
        $('#reviews-prev').prop('disabled', dishPage.currentPage <= 1);
        $('#reviews-next').prop('disabled', true);
    },

    renderReviews: function(reviews) {
        var $reviewsList = $('#reviews-list');
        $reviewsList.empty();

        if (!reviews.length) {
            if (dishPage.currentPage === 1) {
                $reviewsList.html('<div class="reviews-empty">No reviews yet.</div>');
            } else {
                $reviewsList.html('<div class="reviews-empty">No more reviews.</div>');
            }
            dishPage.hasNextPage = false;
        } else {
            reviews.forEach(function(review) {
                var submittedDate = review.submitted ? new Date(review.submitted) : null;
                var submittedText = submittedDate ? submittedDate.toLocaleDateString() : '';
                var reviewer = (review.firstName || review.lastName) ? ((review.firstName || '') + ' ' + (review.lastName || '')).trim() : (review.email || 'Anonymous');
                var reviewerSafe = $('<div>').text(reviewer || '').html();
                var modifications = review.modifications ? '<div class="review-modifications"><strong>Modifications:</strong> ' + $('<div>').text(review.modifications).html() + '</div>' : '';
                var safeContent = $('<div>').text(review.reviewContent || '').html();
                var ratingText = review.rating != null ? review.rating : 'N/A';
                var submittedHtml = '';
                if (submittedText) {
                    var submittedSafe = $('<div>').text('Submitted: ' + submittedText).html();
                    submittedHtml = '<div class="review-meta">' + submittedSafe + '</div>';
                }

                var reviewHtml = `
                    <div class="review-card">
                        <div class="review-card-header">
                            <span class="review-rating">Rating: ${ratingText}</span>
                            <span class="review-author">${reviewerSafe}</span>
                        </div>
                        <div class="review-content">${safeContent}</div>
                        ${modifications}
                        ${submittedHtml}
                    </div>
                `;
                $reviewsList.append(reviewHtml);
            });

            dishPage.hasNextPage = reviews.length === dishPage.pageSize;
        }

        $('#reviews-prev').prop('disabled', dishPage.currentPage <= 1);
        $('#reviews-next').prop('disabled', !dishPage.hasNextPage);
        $('#reviews-page').text('Page ' + dishPage.currentPage);
    }
};

$(document).ready(function() {
    dishPage.init();
});

window.dishPage = dishPage;

//# sourceURL=dish.js
