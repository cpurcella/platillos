var dishPage = {
    dishId: null,
    dishData: null,
    isOnWatchlist: false,
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

        // Show buttons for logged-in users
        if (window._platillosUser) {
            $('#quick-log-btn').removeClass('hidden');
            $('#watchlist-btn').removeClass('hidden');
            dishPage.loadWatchlistState();
        }
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

        // Review button
        $('#quick-log-btn').on('click', function() {
            if (!dishPage.dishData) return;
            var d = dishPage.dishData;
            window._addReviewPreselect = {
                restaurant: {
                    restaurantId: d.restaurantId,
                    name: d.restaurantName || ''
                },
                dish: {
                    dishId: d.dishId,
                    name: d.name || ''
                }
            };
            common.showModal('/add-review');
        });

        // Watchlist toggle
        $('#watchlist-btn').on('click', function() {
            dishPage.toggleWatchlist();
        });
    },

    loadWatchlistState: async function() {
        try {
            var res = await $.get('/api/watchlist/ids');
            if (res.success && Array.isArray(res.data)) {
                var onList = res.data.indexOf(dishPage.dishId) !== -1;
                dishPage.isOnWatchlist = onList;
                dishPage.updateWatchlistButton();
            }
        } catch (err) {
            // Silently fail
        }
    },

    toggleWatchlist: async function() {
        var $btn = $('#watchlist-btn');
        $btn.prop('disabled', true);
        try {
            if (dishPage.isOnWatchlist) {
                await $.ajax({ url: '/api/watchlist/' + dishPage.dishId, method: 'DELETE' });
                dishPage.isOnWatchlist = false;
            } else {
                await $.ajax({ url: '/api/watchlist/' + dishPage.dishId, method: 'POST' });
                dishPage.isOnWatchlist = true;
            }
            dishPage.updateWatchlistButton();
        } catch (err) {
            common.showAlert('Failed to update watchlist.', 'error');
        } finally {
            $btn.prop('disabled', false);
        }
    },

    updateWatchlistButton: function() {
        var $btn = $('#watchlist-btn');
        if (dishPage.isOnWatchlist) {
            $btn.addClass('active');
            $btn.find('.want-to-try-label').text('On Your List');
        } else {
            $btn.removeClass('active');
            $btn.find('.want-to-try-label').text('Want to Try');
        }
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
            dishPage.dishData = res.data;
        } catch (err) {
            dishPage.renderDishError('Failed to load dish.');
        }
    },

    renderDishLoading: function() {
        $('#dish-restaurant').text('');
        $('#dish-score').text('');
        $('#dish-cover-container').empty().hide();
    },

    renderDishError: function(message) {
        var safeMessage = $('<div>').text(message || 'Unavailable').html();
        $('#dish-name').text('Dish');
        $('#dish-restaurant').text('');
        $('#dish-score').text('');
        $('#dish-cover-container')
            .html('<div class="dish-cover-placeholder">' + safeMessage + '</div>')
            .show();
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

        var $cover = $('#dish-cover-container');
        $cover.empty();

        if (dish.coverPhoto) {
            $cover
                .html('<img src="' + dish.coverPhoto + '" alt="' + (dish.name || 'Dish') + ' cover photo">')
                .show();
        } else {
            $cover.hide();
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

                // Build reviewer avatar
                var avatarHtml = '';
                if (review.avatarUrl) {
                    avatarHtml = '<img class="review-author-avatar" src="' + $('<div>').text(review.avatarUrl + '_s').html() + '" alt="">';
                } else {
                    var initial = (reviewer || '?').charAt(0).toUpperCase();
                    avatarHtml = '<span class="review-author-avatar review-author-initial">' + initial + '</span>';
                }

                // Link to profile if username available
                var authorHtml = avatarHtml;
                if (review.username) {
                    var usernameSafe = encodeURIComponent(review.username);
                    authorHtml = '<a href="/users/' + usernameSafe + '" class="review-author-link">' + avatarHtml + '<span class="review-author-name">' + reviewerSafe + '</span></a>';
                } else {
                    authorHtml = '<span class="review-author-link">' + avatarHtml + '<span class="review-author-name">' + reviewerSafe + '</span></span>';
                }

                var photosHtml = '';
                if (review.photos && review.photos.length) {
                    var photoItems = review.photos.map(function(p) {
                        var safeUrl = $('<div>').text(p.url).html();
                        return '<img class="review-photo" src="' + safeUrl + '" alt="Review photo" loading="lazy">';
                    }).join('');
                    photosHtml = '<div class="review-photos">' + photoItems + '</div>';
                }

                var reviewHtml = `
                    <div class="review-card">
                        <div class="review-card-header">
                            <span class="review-rating">Rating: ${ratingText}</span>
                            <span class="review-author">${authorHtml}</span>
                        </div>
                        <div class="review-content">${safeContent}</div>
                        ${photosHtml}
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

$(document).ready(async function() {
    await session.ready();
    dishPage.init();
});

window.dishPage = dishPage;

//# sourceURL=dish.js
