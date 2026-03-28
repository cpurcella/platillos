// dish-list.js
// Handles search and pagination for dish-list partial

var dishListModule = {
    watchlistIds: [],
    init: function() {
        dishListModule.bindEvents();
        dishListModule.loadWatchlistIds().then(function() {
            dishListModule.loadDishes();
        });
    },
    bindEvents: function() {
        $('#searchBtn').on('click', dishListModule.handleSearch);
        $('#searchInput').on('keypress', function(evt) {
            if (evt.which === 13) {
                evt.preventDefault();
                dishListModule.handleSearch();
            }
        });
    },
    loadWatchlistIds: async function() {
        if (!window._platillosUser) return;
        try {
            var res = await $.get('/api/watchlist/ids');
            if (res.success && Array.isArray(res.data)) {
                dishListModule.watchlistIds = res.data;
            }
        } catch (err) {
            // Silently fail
        }
    },
    handleSearch: function() {
        var term = $('#searchInput').val();
        if (typeof term === 'string') {
            term = term.trim();
        }
        dishListModule.loadDishes({ search: term });
    },
    loadDishes: async function(options) {
        options = options || {};
        try {
            var fields = [
                'dishId',
                'restaurantId',
                'name',
                'score',
                'coverPhoto',
                'reviewCount'
            ];
            var query = {
                fields: JSON.stringify(fields)
            };

            if (typeof options.search === 'string' && options.search.length) {
                query.search = options.search;
            }

            var res = await $.get('/api/dishes', query);
            if (res.success && Array.isArray(res.data)) {
                dishListModule.renderDishes(res.data);
            }
        } catch (err) {
            common.showAlert('Failed to load dishes', 'error');
        }
    },
    renderDishes: function(dishes) {
        var $container = $('#dishes-container');
        $container.empty();
        if (!dishes.length) {
            $container.html('<div>No dishes found.</div>');
            return;
        }
        function buildVariantUrl(url, suffix) {
            if (!url) return '';
            var index = url.indexOf('?');
            if (index === -1) {
                return url + suffix;
            }
            return url.slice(0, index) + suffix + url.slice(index);
        }

        function renderStars(score) {
            if (score == null || isNaN(score)) {
                return '<span class="dish-score-value">No ratings yet</span>';
            }
            var numericScore = Number(score);
            var normalizedScore = numericScore;
            if (normalizedScore > 5) {
                normalizedScore = normalizedScore / 2;
            }
            var clampedScore = Math.max(0, Math.min(5, normalizedScore));
            var fullStars = Math.floor(clampedScore);
            var hasHalf = (clampedScore - fullStars) >= 0.5;
            var emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
            var starsHtml = '';
            for (var i = 0; i < fullStars; i++) {
                starsHtml += '<span class="dish-star dish-star-full">★</span>';
            }
            if (hasHalf) {
                starsHtml += '<span class="dish-star dish-star-half">★</span>';
            }
            for (var j = 0; j < emptyStars; j++) {
                starsHtml += '<span class="dish-star dish-star-empty">★</span>';
            }
            var scoreText = numericScore % 1 === 0 ? numericScore.toString() : numericScore.toFixed(1);
            //starsHtml += '<span class="dish-score-value">' + scoreText + '</span>';
            return '<span class="dish-stars" aria-label="Rating ' + clampedScore.toFixed(1) + ' out of 5">' + starsHtml + '</span>';
        }
        dishes.forEach(function(dish) {
            var slug = (dish.name || '').toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .substring(0, 80);
            if (!slug) slug = 'dish';
            var dishUrl = '/dishes/' + encodeURIComponent(dish.dishId) + '/' + slug;
            var coverPhotoSmall = '';
            if (dish.coverPhoto) {
                coverPhotoSmall = buildVariantUrl(dish.coverPhoto, '_s');
            }
            var coverPhotoSmallEscaped = coverPhotoSmall ? $('<div>').text(coverPhotoSmall).html() : '';
            var imageMarkup = coverPhotoSmallEscaped
                ? `<img src="${coverPhotoSmallEscaped}" class="dish-cover-photo" loading="lazy" alt="${$('<div>').text(dish.name || 'Dish photo').html()}">`
                : '';
            var isOnWatchlist = dishListModule.watchlistIds.indexOf(dish.dishId) !== -1;
            var escapedDishId = $('<div>').text(dish.dishId).html();
            var watchlistBtnHtml = window._platillosUser
                ? `<button class="want-to-try-card-btn${isOnWatchlist ? ' active' : ''}" data-dish-id="${escapedDishId}" title="Want to Try" onclick="event.preventDefault(); event.stopPropagation(); dishListModule.toggleWatchlistCard(this, '${escapedDishId}')">Want to Try</button>`
                : '';
            var html = `
                <a href="${dishUrl}" class="card dish-card" data-dish-id="${dish.dishId}">
                    <div class="dish-card-content">
                        ${imageMarkup}
                        <div class="dish-card-info">
                            <div class="dish-name">${dish.name}</div>
                            <div class="dish-meta">
                                <span class="dish-restaurant">${dish.restaurantName || dish.restaurantId}</span>
                            </div>
                            <div class="dish-rating">
                                <span class="dish-score">
                                    ${renderStars(dish.score)}
                                </span>
                                <span class="dish-review-count">
                                    (${dish.reviewCount || 0} review${dish.reviewCount == 1 ? '' : 's'})
                                </span>
                            </div>
                        </div>
                        ${watchlistBtnHtml}
                    </div>
                </a>
            `;
            $container.append(html);
        });
    }
};

$(document).ready(dishListModule.init);

// Export for other scripts if needed
window.dishListModule = dishListModule;

dishListModule.toggleWatchlistCard = async function(btn, dishId) {
    var $btn = $(btn);
    $btn.prop('disabled', true);
    var isActive = $btn.hasClass('active');
    try {
        if (isActive) {
            await $.ajax({ url: '/api/watchlist/' + encodeURIComponent(dishId), method: 'DELETE' });
            $btn.removeClass('active').text('Want to Try');
            var idx = dishListModule.watchlistIds.indexOf(dishId);
            if (idx !== -1) dishListModule.watchlistIds.splice(idx, 1);
        } else {
            await $.ajax({ url: '/api/watchlist/' + encodeURIComponent(dishId), method: 'POST' });
            $btn.addClass('active').text('On Your List');
            dishListModule.watchlistIds.push(dishId);
        }
    } catch (err) {
        // Silently fail
    } finally {
        $btn.prop('disabled', false);
    }
};
