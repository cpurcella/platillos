// dish-list.js
// Home page: feed tabs + horizontal shelf browse + vertical search results

var dishListModule = {
    watchlistIds: [],
    mode: 'shelves', // 'shelves', 'search', or 'feed'
    browserLocation: null, // { lat, lng } from browser geolocation

    // Feed state
    feedTab: 'following',
    feedPage: 1,
    feedTotal: 0,
    feedLoading: false,
    FEED_PAGE_SIZE: 20,

    init: function() {
        dishListModule.bindEvents();
        var locationPromise = dishListModule.detectLocation();
        dishListModule.loadWatchlistIds().then(function() {
            return locationPromise;
        }).then(function() {
            if (window._platillosUser) {
                dishListModule.showFeedTabs();
                dishListModule.switchFeedTab('discover');
            } else {
                dishListModule.loadShelves();
            }
        });
    },

    detectLocation: function() {
        // Skip if user has an address on their profile
        if (window._platillosUser && window._platillosUser.addressLat) {
            return Promise.resolve();
        }
        if (!navigator.geolocation) return Promise.resolve();
        return new Promise(function(resolve) {
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    dishListModule.browserLocation = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    resolve();
                },
                function() { resolve(); }, // denied or error — proceed without location
                { timeout: 5000, maximumAge: 300000 }
            );
        });
    },

    bindEvents: function() {
        $('#searchBtn').on('click', dishListModule.handleSearch);
        document.addEventListener('error', function(evt) {
            var image = evt.target;
            if (!image || !image.classList) return;
            if (image.classList.contains('shelf-card-img')) {
                setTimeout(function() {
                    var shelfCard = image.closest('.shelf-card');
                    var shelfTrack = image.closest('.shelf-track');
                    var otherImages = shelfTrack ? Array.prototype.filter.call(shelfTrack.querySelectorAll('.shelf-card-img'), function(trackImage) {
                        return trackImage !== image;
                    }) : [];
                    if (!shelfCard) return;
                    if (otherImages.length) {
                        shelfCard.remove();
                        return;
                    }
                    shelfCard.classList.add('shelf-card-no-photo');
                    image.remove();
                }, 0);
            }
            if (image.classList.contains('dish-cover-photo')) {
                image.remove();
            }
        }, true);
        $('#searchInput').on('keypress', function(evt) {
            if (evt.which === 13) {
                evt.preventDefault();
                dishListModule.handleSearch();
            }
        });
        $('#searchInput').on('input', function() {
            if (!$(this).val().trim()) {
                if (window._platillosUser) {
                    dishListModule.switchFeedTab(dishListModule.feedTab);
                } else {
                    dishListModule.showShelves();
                }
            }
        });
        $(document).on('click', '.feed-tab', function() {
            dishListModule.switchFeedTab($(this).data('tab'));
        });
        $(document).on('click', '.feed-card .review-vote-btn', function(e) {
            e.preventDefault();
            dishListModule.toggleVote($(this));
        });
        $(window).on('scroll', dishListModule.handleFeedScroll);
    },

    toggleVote: async function($btn) {
        if (!window._platillosUser) {
            if (window.showLoginPopup) window.showLoginPopup();
            return;
        }
        var reviewId = $btn.data('review-id');
        var direction = parseInt($btn.data('vote'), 10);
        var $card = $btn.closest('.feed-card');
        var currentVote = parseInt($card.attr('data-user-vote'), 10) || 0;
        try {
            var res;
            if (currentVote === direction) {
                res = await $.ajax({ url: '/api/reviews/' + reviewId + '/vote', method: 'DELETE' });
            } else {
                res = await $.ajax({ url: '/api/reviews/' + reviewId + '/vote', method: 'POST', data: { value: direction } });
            }
            if (res.success) {
                $card.attr('data-user-vote', res.userVote);
                $card.find('.review-vote-count').text(res.likeCount);
                $card.find('.review-vote-btn[data-vote="1"]').toggleClass('active', res.userVote === 1);
                $card.find('.review-vote-btn[data-vote="-1"]').toggleClass('active', res.userVote === -1);
            }
        } catch (err) {
            // silently fail
        }
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

    // ── Mode switching ──

    showShelves: function() {
        dishListModule.mode = 'shelves';
        $('#search-results').hide();
        $('#feed-container').hide();
        $('#feed-loading').hide();
        $('#shelves-container').show();
    },

    showSearch: function() {
        dishListModule.mode = 'search';
        $('#shelves-container').hide();
        $('#feed-container').hide();
        $('#feed-loading').hide();
        $('#search-results').show();
    },

    showFeedTabs: function() {
        $('#feed-tabs').show();
    },

    switchFeedTab: function(tab) {
        if (tab === 'discover') {
            dishListModule.showShelves();
            dishListModule.loadShelves();
        } else {
            dishListModule.mode = 'feed';
            $('#shelves-container').hide();
            $('#search-results').hide();
            $('#feed-container').show().empty();
            dishListModule.feedTab = tab;
            dishListModule.feedPage = 1;
            dishListModule.feedTotal = 0;
            dishListModule.loadFeed();
        }
        $('.feed-tab').removeClass('active');
        $('.feed-tab[data-tab="' + tab + '"]').addClass('active');
    },

    handleFeedScroll: function() {
        if (dishListModule.mode !== 'feed') return;
        if (dishListModule.feedLoading) return;
        var $container = $('#feed-container');
        if (!$container.is(':visible') || !$container.children().length) return;
        var scrollBottom = $(window).scrollTop() + $(window).height();
        var docHeight = $(document).height();
        if (scrollBottom >= docHeight - 300) {
            var totalPages = Math.ceil(dishListModule.feedTotal / dishListModule.FEED_PAGE_SIZE);
            if (dishListModule.feedPage < totalPages) {
                dishListModule.feedPage++;
                dishListModule.loadFeed(true);
            }
        }
    },

    loadFeed: async function(append) {
        dishListModule.feedLoading = true;
        $('#feed-loading').show();
        try {
            var res = await $.get('/api/reviews/feed/' + encodeURIComponent(dishListModule.feedTab), {
                page: dishListModule.feedPage,
                pageSize: dishListModule.FEED_PAGE_SIZE
            });
            if (res.success) {
                dishListModule.feedTotal = res.total || 0;
                dishListModule.renderFeed(res.data || [], append);
            }
        } catch (err) {
            if (!append) {
                $('#feed-container').html('<div class="feed-empty">Failed to load feed.</div>');
            }
        } finally {
            dishListModule.feedLoading = false;
            $('#feed-loading').hide();
        }
    },

    renderFeed: function(reviews, append) {
        var $container = $('#feed-container');
        if (!append) $container.empty();
        if (!reviews.length && !append) {
            var emptyMsg = dishListModule.feedTab === 'following'
                ? 'No activity from people you follow yet. Try following someone!'
                : 'No reviews yet.';
            $container.html('<div class="feed-empty">' + emptyMsg + '</div>');
            return;
        }
        reviews.forEach(function(review) {
            $container.append(dishListModule.buildFeedCard(review));
        });
    },

    buildFeedCard: function(review) {
        var reviewer = ((review.firstName || '') + ' ' + (review.lastName || '')).trim() || review.username || 'Anonymous';
        var reviewerSafe = $('<div>').text(reviewer).html();

        // Avatar
        var avatarHtml;
        if (review.avatarUrl) {
            avatarHtml = '<img class="feed-card-avatar" src="' + $('<div>').text(review.avatarUrl + '_s').html() + '" alt="">';
        } else {
            var initial = (reviewer || '?').charAt(0).toUpperCase();
            avatarHtml = '<span class="feed-card-avatar feed-card-avatar-placeholder">' + initial + '</span>';
        }

        // Profile link
        var profileUrl = review.username ? '/users/' + encodeURIComponent(review.username) : '#';

        // Dish link
        var slug = (review.dishName || '').toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 80) || 'dish';
        var dishUrl = '/dishes/' + encodeURIComponent(review.dishId) + '/' + slug + '?reviewId=' + review.reviewId;
        var dishNameSafe = $('<div>').text(review.dishName || 'Untitled').html();
        var restaurantSafe = $('<div>').text(review.restaurantName || '').html();

        // Rating stars
        var ratingHtml = review.rating != null ? '<span class="feed-card-rating">' + dishListModule.renderStarsCompact(review.rating) + '</span>' : '';

        // Relative time
        var timeText = dishListModule.relativeTime(review.submitted);
        var timeSafe = $('<div>').text(timeText).html();

        // Review text (truncate)
        var contentHtml = '';
        if (review.reviewContent) {
            var text = review.reviewContent.length > 280 ? review.reviewContent.substring(0, 280) + '…' : review.reviewContent;
            contentHtml = '<div class="feed-card-text">' + $('<div>').text(text).html() + '</div>';
        }

        // Photos
        var photosHtml = '';
        if (review.photos && review.photos.length) {
            var items = review.photos.slice(0, 3).map(function(p) {
                return '<img class="feed-card-photo" src="' + $('<div>').text(p.url + '_s').html() + '" alt="Review photo" loading="lazy">';
            }).join('');
            photosHtml = '<div class="feed-card-photos">' + items + '</div>';
        }

        // Dish cover image
        var dishPhotoHtml = '';
        if (review.dishCoverPhoto) {
            dishPhotoHtml = '<img class="feed-card-dish-photo" src="' + $('<div>').text(review.dishCoverPhoto + '_s').html() + '" alt="" loading="lazy">';
        }

        // Vote buttons
        var voteHtml = '<div class="feed-card-votes">' +
            '<button class="review-vote-btn' + (review.userVote === 1 ? ' active' : '') + '" data-review-id="' + review.reviewId + '" data-vote="1" title="Thumbs up">👍</button>' +
            '<span class="review-vote-count">' + (review.likeCount || 0) + '</span>' +
            '<button class="review-vote-btn' + (review.userVote === -1 ? ' active' : '') + '" data-review-id="' + review.reviewId + '" data-vote="-1" title="Thumbs down">👎</button>' +
            '</div>';

        return '<div class="feed-card" data-review-id="' + review.reviewId + '">' +
            '<div class="feed-card-header">' +
                '<a href="' + profileUrl + '" class="feed-card-author">' + avatarHtml + '<span class="feed-card-author-name">' + reviewerSafe + '</span></a>' +
                '<span class="feed-card-time">' + timeSafe + '</span>' +
            '</div>' +
            '<a href="' + dishUrl + '" class="feed-card-dish">' +
                dishPhotoHtml +
                '<div class="feed-card-dish-info">' +
                    '<span class="feed-card-dish-name">' + dishNameSafe + '</span>' +
                    '<span class="feed-card-restaurant">' + restaurantSafe + '</span>' +
                '</div>' +
                ratingHtml +
            '</a>' +
            contentHtml +
            photosHtml +
            '<div class="feed-card-footer">' + voteHtml + '</div>' +
        '</div>';
    },

    relativeTime: function(timestamp) {
        if (!timestamp) return '';
        var diff = Date.now() - timestamp;
        var seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'just now';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        var days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        var months = Math.floor(days / 30);
        if (months < 12) return months + 'mo ago';
        return Math.floor(months / 12) + 'y ago';
    },

    // ── Shelves ──

    loadShelves: async function() {
        try {
            var query = {};
            if (dishListModule.browserLocation) {
                query.lat = dishListModule.browserLocation.lat;
                query.lng = dishListModule.browserLocation.lng;
            }
            var res = await $.get('/api/dishes/shelves', query);
            if (res.success && Array.isArray(res.data)) {
                dishListModule.renderShelves(res.data);
            }
        } catch (err) {
            // Fall back to flat list
            dishListModule.showSearch();
            dishListModule.loadDishes();
        }
    },

    renderShelves: function(shelves) {
        var $container = $('#shelves-container');
        $container.empty();
        if (!shelves.length) {
            $container.html('<div class="shelf-empty">No dishes yet.</div>');
            return;
        }
        shelves.forEach(function(shelf) {
            var shelfDishes = shelf.dishes.some(function(dish) { return dish.coverPhoto; })
                ? shelf.dishes.filter(function(dish) { return dish.coverPhoto; })
                : shelf.dishes;
            var $section = $('<section class="shelf"><h2 class="shelf-title">' +
                $('<span>').text(shelf.title).html() + '</h2></section>');
            var $track = $('<div class="shelf-track"></div>');
            shelfDishes.forEach(function(dish) {
                $track.append(dishListModule.buildShelfCard(dish));
            });
            $section.append($track);
            $container.append($section);
        });
    },

    buildShelfCard: function(dish) {
        var slug = (dish.name || '').toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 80) || 'dish';
        var dishUrl = '/dishes/' + encodeURIComponent(dish.dishId) + '/' + slug + (dish.reviewId ? '?reviewId=' + dish.reviewId : '');
        var photoUrl = dish.coverPhoto ? dishListModule.buildVariantUrl(dish.coverPhoto, '_s') : '';
        var photoEscaped = photoUrl ? $('<div>').text(photoUrl).html() : '';
        var nameEscaped = $('<div>').text(dish.name || 'Untitled').html();
        var restaurantEscaped = $('<div>').text(dish.restaurantName || '').html();
        var imageHtml = photoEscaped
            ? '<img src="' + photoEscaped + '" class="shelf-card-img" loading="lazy" alt="' + nameEscaped + '">'
            : '';
        var cardClass = 'shelf-card' + (photoEscaped ? '' : ' shelf-card-no-photo');

        var reviewerHtml = '';
        if (dish.reviewerUsername) {
            var reviewerEscaped = $('<div>').text(dish.reviewerUsername).html();
            reviewerHtml = '<div class="shelf-card-reviewer">@' + reviewerEscaped + '</div>';
        }

        return '<a href="' + dishUrl + '" class="' + cardClass + '">' +
            imageHtml +
            '<div class="shelf-card-name">' + nameEscaped + '</div>' +
            (restaurantEscaped ? '<div class="shelf-card-restaurant">' + restaurantEscaped + '</div>' : '') +
            reviewerHtml +
            '<div class="shelf-card-rating">' + dishListModule.renderStarsCompact(dish.score) + '</div>' +
            '</a>';
    },

    // ── Search / vertical list ──

    buildSearchUrl: function(term, type) {
        var params = new URLSearchParams();
        params.set('q', term);
        params.set('type', type || 'dishes');
        params.set('sort', 'score');
        return '/search?' + params.toString();
    },

    handleSearch: function() {
        var term = $('#searchInput').val();
        if (typeof term === 'string') {
            term = term.trim();
        }
        if (!term) {
            dishListModule.showShelves();
            return;
        }
        window.location.href = dishListModule.buildSearchUrl(term, 'dishes');
    },

    // ── People search ──

    loadPeople: async function(term) {
        var $section = $('#people-results');
        try {
            var res = await $.get('/api/users/search', { q: term, limit: 10 });
            if (res.success && Array.isArray(res.data) && res.data.length) {
                dishListModule.renderPeople(res.data);
                $section.show();
            } else {
                $section.hide();
            }
        } catch (err) {
            $section.hide();
        }
    },

    renderPeople: function(users) {
        var $container = $('#people-container');
        $container.empty();
        var $track = $('<div class="shelf-track"></div>');
        users.forEach(function(user) {
            var profileUrl = '/users/' + encodeURIComponent(user.username);
            var nameEscaped = $('<span>').text((user.firstName || '') + ' ' + (user.lastName || '')).html().trim() || $('<span>').text(user.username).html();
            var usernameEscaped = $('<span>').text(user.username).html();
            var initial = (user.firstName || user.username || '?').charAt(0).toUpperCase();
            var avatarHtml = user.avatarUrl
                ? '<img src="' + $('<span>').text(user.avatarUrl).html() + '" class="people-shelf-avatar" alt="">'
                : '<div class="people-shelf-avatar people-shelf-avatar-placeholder">' + initial + '</div>';
            var html = '<a href="' + profileUrl + '" class="people-shelf-card">' +
                avatarHtml +
                '<div class="people-shelf-name">' + nameEscaped + '</div>' +
                '<div class="people-shelf-username">@' + usernameEscaped + '</div>' +
                '</a>';
            $track.append(html);
        });
        $container.append($track);
        // Show "see more" if we got the max (10)
        var $more = $('#people-see-more');
        if (users.length >= 10) {
            $more.attr('href', dishListModule.buildSearchUrl(dishListModule.searchTerm, 'people')).show();
        } else {
            $more.hide();
        }
    },

    // ── Dish search ──

    loadDishes: async function(options) {
        options = options || {};
        try {
            var fields = ['dishId', 'restaurantId', 'name', 'score', 'coverPhoto', 'reviewCount'];
            var query = { fields: JSON.stringify(fields) };
            if (typeof options.search === 'string' && options.search.length) {
                query.search = options.search;
            }
            var res = await $.get('/api/dishes', query);
            if (res.success && Array.isArray(res.data)) {
                dishListModule.renderDishes(res.data);
                var $more = $('#dishes-see-more');
                if (res.data.length >= 20) {
                    $more.attr('href', dishListModule.buildSearchUrl(dishListModule.searchTerm, 'dishes')).show();
                } else {
                    $more.hide();
                }
            }
        } catch (err) {
            common.showAlert('Failed to load dishes', 'error');
        }
    },

    renderDishes: function(dishes) {
        var $container = $('#dishes-container');
        $container.empty();
        if (!dishes.length) {
            $container.html('<div class="search-empty">No dishes found.</div>');
            return;
        }
        dishes.forEach(function(dish) {
            var slug = (dish.name || '').toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .substring(0, 80) || 'dish';
            var dishUrl = '/dishes/' + encodeURIComponent(dish.dishId) + '/' + slug;
            var coverPhotoSmall = dish.coverPhoto ? dishListModule.buildVariantUrl(dish.coverPhoto, '_s') : '';
            var coverPhotoSmallEscaped = coverPhotoSmall ? $('<div>').text(coverPhotoSmall).html() : '';
            var imageMarkup = coverPhotoSmallEscaped
                ? '<img src="' + coverPhotoSmallEscaped + '" class="dish-cover-photo" loading="lazy" alt="' + $('<div>').text(dish.name || 'Dish photo').html() + '">'
                : '';
            var isOnWatchlist = dishListModule.watchlistIds.indexOf(dish.dishId) !== -1;
            var escapedDishId = $('<div>').text(dish.dishId).html();
            var wttLabel = isOnWatchlist ? 'On Your List' : 'Want to Try';
            var watchlistBtnHtml = window._platillosUser
                ? '<button class="want-to-try-card-btn' + (isOnWatchlist ? ' active' : '') + '" data-dish-id="' + escapedDishId + '" title="Want to Try" onclick="event.preventDefault(); event.stopPropagation(); dishListModule.toggleWatchlistCard(this, \'' + escapedDishId + '\')">' + wttLabel + '</button>'
                : '';
            var html = '<a href="' + dishUrl + '" class="card dish-card" data-dish-id="' + dish.dishId + '">' +
                '<div class="dish-card-content">' +
                    imageMarkup +
                    '<div class="dish-card-info">' +
                        '<div class="dish-name">' + dish.name + '</div>' +
                        '<div class="dish-meta"><span class="dish-restaurant">' + (dish.restaurantName || dish.restaurantId) + '</span></div>' +
                        '<div class="dish-rating"><span class="dish-score">' + dishListModule.renderStars(dish.score) + '</span>' +
                        '<span class="dish-review-count">(' + (dish.reviewCount || 0) + ' review' + (dish.reviewCount == 1 ? '' : 's') + ')</span></div>' +
                    '</div>' +
                    watchlistBtnHtml +
                '</div></a>';
            $container.append(html);
        });
    },

    // ── Shared helpers ──

    buildVariantUrl: function(url, suffix) {
        if (!url) return '';
        var index = url.indexOf('?');
        if (index === -1) return url + suffix;
        return url.slice(0, index) + suffix + url.slice(index);
    },

    renderStars: function(score) {
        if (score == null || isNaN(score)) {
            return '<span class="dish-score-value">No ratings yet</span>';
        }
        var numericScore = Number(score);
        var normalizedScore = numericScore > 5 ? numericScore / 2 : numericScore;
        var clampedScore = Math.max(0, Math.min(5, normalizedScore));
        var fullStars = Math.floor(clampedScore);
        var hasHalf = (clampedScore - fullStars) >= 0.5;
        var emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
        var html = '';
        for (var i = 0; i < fullStars; i++) html += '<span class="dish-star dish-star-full">★</span>';
        if (hasHalf) html += '<span class="dish-star dish-star-half">★</span>';
        for (var j = 0; j < emptyStars; j++) html += '<span class="dish-star dish-star-empty">★</span>';
        return '<span class="dish-stars" aria-label="Rating ' + clampedScore.toFixed(1) + ' out of 5">' + html + '</span>';
    },

    renderStarsCompact: function(score) {
        if (score == null || isNaN(score)) return '<span class="shelf-no-rating">—</span>';
        var numericScore = Number(score);
        var normalizedScore = numericScore > 5 ? numericScore / 2 : numericScore;
        var clampedScore = Math.max(0, Math.min(5, normalizedScore));
        var fullStars = Math.floor(clampedScore);
        var hasHalf = (clampedScore - fullStars) >= 0.5;
        var emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
        var html = '';
        for (var i = 0; i < fullStars; i++) html += '<span class="shelf-star shelf-star-full">★</span>';
        if (hasHalf) html += '<span class="shelf-star shelf-star-half">★</span>';
        for (var j = 0; j < emptyStars; j++) html += '<span class="shelf-star shelf-star-empty">★</span>';
        return html;
    },

    toggleWatchlistCard: async function(btn, dishId) {
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
    }
};

$(document).ready(dishListModule.init);
window.dishListModule = dishListModule;
