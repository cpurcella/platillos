var dishPage = {
    dishId: null,
    dishData: null,
    isOnWatchlist: false,
    isFavorite: false,
    hasTried: false,
    currentPage: 1,
    pageSize: 10,
    hasNextPage: false,
    ratingTrendChart: null,
    galleryPhotos: [],
    galleryPage: 1,
    galleryPageSize: 20,
    galleryTotal: 0,
    galleryLoading: false,
    galleryHasMore: true,
    activeGalleryIndex: null,

    highlightReviewId: null,

    init: function() {
        dishPage.dishId = dishPage.getDishIdFromPath();
        var params = new URLSearchParams(window.location.search);
        dishPage.highlightReviewId = params.get('reviewId');
        if (!dishPage.dishId) {
            dishPage.renderDishError('Dish not found.');
            dishPage.renderReviewsError('Unable to determine dish.');
            return;
        }

        dishPage.bindEvents();
        dishPage.loadDish();
        dishPage.loadGalleryPhotos();
        dishPage.loadReviews();
        dishPage.loadRatingTrend();

        dishPage.syncAuth();
    },

    syncAuth: function() {
        var authenticated = Boolean(window._platillosUser);
        $('#quick-log-btn, #watchlist-btn, #tried-it-btn, #favorite-btn').toggleClass('hidden', !authenticated);
        if (authenticated) {
            dishPage.loadTriedState();
            dishPage.loadFavoriteState();
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
        $(document).on('platillos:authchange', dishPage.syncAuth);
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
                    name: d.name || '',
                    itemType: d.itemType
                }
            };
            common.showModal('/add-review');
        });

        // Watchlist toggle
        $('#watchlist-btn').on('click', function() {
            dishPage.toggleWatchlist();
        });

        // Favorite toggle
        $('#favorite-btn').on('click', function() {
            dishPage.toggleFavorite();
        });

        // Tried It
        $('#tried-it-btn').on('click', function() {
            if (dishPage.hasTried) return;
            dishPage.showTriedPopup();
        });
        $('#tried-it-cancel').on('click', function() {
            dishPage.hideTriedPopup();
        });
        $('#tried-it-save').on('click', function() {
            dishPage.saveTriedIt();
        });

        // Vote buttons (delegated since review cards are dynamic)
        $('#reviews-list').on('click', '.review-vote-btn', function(e) {
            e.preventDefault();
            dishPage.toggleVote($(this));
        });

        $('#dish-photo-track').on('scroll', function() {
            dishPage.handleGalleryScroll();
        });

        $('#dish-photo-track').on('click', '.dish-gallery-thumb', function() {
            var index = parseInt($(this).attr('data-gallery-index'), 10);
            if (!isNaN(index)) {
                dishPage.openGalleryLightbox(index);
            }
        });

        $('#dish-lightbox-close').on('click', function() {
            dishPage.closeGalleryLightbox();
        });

        $('#dish-photo-lightbox').on('click', function(e) {
            if (e.target === this) {
                dishPage.closeGalleryLightbox();
            }
        });

        $('#dish-lightbox-prev').on('click', function() {
            dishPage.showPreviousGalleryPhoto();
        });

        $('#dish-lightbox-next').on('click', function() {
            dishPage.showNextGalleryPhoto();
        });

        $(document).on('keydown', function(e) {
            if ($('#dish-photo-lightbox').hasClass('hidden')) return;
            if (e.key === 'Escape') {
                dishPage.closeGalleryLightbox();
            } else if (e.key === 'ArrowLeft') {
                dishPage.showPreviousGalleryPhoto();
            } else if (e.key === 'ArrowRight') {
                dishPage.showNextGalleryPhoto();
            }
        });
    },

    toggleVote: async function($btn) {
        if (!window._platillosUser) {
            if (window.showLoginPopup) window.showLoginPopup();
            return;
        }
        var reviewId = $btn.data('review-id');
        var direction = parseInt($btn.data('vote'), 10);
        var $card = $btn.closest('.review-card');
        var currentVote = parseInt($card.attr('data-user-vote'), 10) || 0;
        try {
            var res;
            if (currentVote === direction) {
                // Toggle off — remove vote
                res = await common.secureAjax({ url: '/api/reviews/' + reviewId + '/vote', method: 'DELETE' });
            } else {
                // Cast or switch vote
                res = await common.secureAjax({ url: '/api/reviews/' + reviewId + '/vote', method: 'POST', data: { value: direction } });
            }
            if (res.success) {
                $card.attr('data-user-vote', res.userVote);
                $card.find('.review-vote-count').text(res.likeCount);
                $card.find('.review-vote-btn[data-vote="1"]').toggleClass('active', res.userVote === 1);
                $card.find('.review-vote-btn[data-vote="-1"]').toggleClass('active', res.userVote === -1);
            }
        } catch (err) {
            console.error('Vote failed:', err);
        }
    },

    loadFavoriteState: async function() {
        try {
            var res = await $.get('/api/users/favorites/ids');
            if (res.success && Array.isArray(res.data)) {
                dishPage.isFavorite = res.data.indexOf(dishPage.dishId) !== -1;
                dishPage.updateFavoriteButton();
            }
        } catch (err) { /* silent */ }
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
                await common.secureAjax({ url: '/api/watchlist/' + dishPage.dishId, method: 'DELETE' });
                dishPage.isOnWatchlist = false;
            } else {
                await common.secureAjax({ url: '/api/watchlist/' + dishPage.dishId, method: 'POST' });
                dishPage.isOnWatchlist = true;
            }
            dishPage.updateWatchlistButton();
            common.showAlert(dishPage.isOnWatchlist ? 'Added to Want to Try' : 'Removed from Want to Try', 'success');
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
            $btn.find('.want-to-try-icon').text('\u2605');
        } else {
            $btn.removeClass('active');
            $btn.find('.want-to-try-icon').text('\u2606');
        }
    },

    toggleFavorite: async function() {
        var $btn = $('#favorite-btn');
        $btn.prop('disabled', true);
        try {
            if (dishPage.isFavorite) {
                await common.secureAjax({ url: '/api/users/favorites/' + dishPage.dishId, method: 'DELETE' });
                dishPage.isFavorite = false;
            } else {
                await common.secureAjax({ url: '/api/users/favorites/' + dishPage.dishId, method: 'POST' });
                dishPage.isFavorite = true;
            }
            dishPage.updateFavoriteButton();
            common.showAlert(dishPage.isFavorite ? 'Added to Favorites' : 'Removed from Favorites', 'success');
        } catch (err) {
            common.showAlert('Failed to update favorite.', 'error');
        } finally {
            $btn.prop('disabled', false);
        }
    },

    updateFavoriteButton: function() {
        var $btn = $('#favorite-btn');
        if (dishPage.isFavorite) {
            $btn.addClass('active');
            $btn.find('.favorite-icon').text('\u2665');
            $btn.find('.favorite-label').text('Favorited');
        } else {
            $btn.removeClass('active');
            $btn.find('.favorite-icon').text('\u2661');
            $btn.find('.favorite-label').text('Favorite');
        }
    },

    loadTriedState: async function() {
        try {
            var res = await $.get('/api/users/tried/' + encodeURIComponent(dishPage.dishId));
            if (res.success && res.data && res.data.tried) {
                dishPage.hasTried = true;
                dishPage.updateTriedButton();
            }
        } catch (err) {
            // Silently fail
        }
    },

    updateTriedButton: function() {
        var $btn = $('#tried-it-btn');
        if (dishPage.hasTried) {
            $btn.addClass('active');
            $btn.find('.tried-it-label').text('Tried');
        } else {
            $btn.removeClass('active');
            $btn.find('.tried-it-label').text('Tried It');
        }
    },

    showTriedPopup: function() {
        var today = new Date().toISOString().split('T')[0];
        $('#tried-it-date').val(today);
        $('#tried-it-rating').val('');
        $('#tried-it-popup').removeClass('hidden');
    },

    hideTriedPopup: function() {
        $('#tried-it-popup').addClass('hidden');
    },

    saveTriedIt: async function() {
        var dateVal = $('#tried-it-date').val();
        if (!dateVal) {
            common.showAlert('Please enter a date.', 'error');
            return;
        }
        var ratingVal = $('#tried-it-rating').val();
        var payload = { dishId: dishPage.dishId, dateTried: dateVal };
        if (ratingVal) payload.rating = parseInt(ratingVal);

        $('#tried-it-save').prop('disabled', true);
        try {
            var res = await common.secureAjax({ url: '/api/users/diary', method: 'POST', data: payload });
            if (res.success) {
                dishPage.hasTried = true;
                dishPage.updateTriedButton();
                dishPage.hideTriedPopup();
                common.showAlert('Marked as Tried', 'success');
            } else {
                common.showAlert(res.message || 'Failed to save.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to save.', 'error');
        } finally {
            $('#tried-it-save').prop('disabled', false);
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
            if (res.data.isOnWatchlist !== undefined) {
                dishPage.isOnWatchlist = res.data.isOnWatchlist;
                dishPage.updateWatchlistButton();
            }
        } catch (err) {
            dishPage.renderDishError('Failed to load dish.');
        }
    },

    renderDishLoading: function() {
        $('#dish-name').text('Loading dish…');
        $('#dish-header').removeClass('has-cover');
        $('#dish-restaurant').text('');
        $('#dish-score').text('');
        $('#dish-cover-container').empty().hide();
    },

    renderDishError: function(message) {
        $('#dish-header').removeClass('has-cover');
        $('#dish-name').text('Dish');
        $('#dish-restaurant').text(message || 'Unavailable');
        $('#dish-score').text('');
        $('#dish-cover-container').empty().hide();
        $('#dish-actions').addClass('hidden');
    },

    renderDish: function(dish) {
        $('#dish-name').text(dish.name || 'Dish');
        document.title = (dish.name || 'Dish') + (dish.restaurantName ? ' — ' + dish.restaurantName : '') + ' | Platillos';

        var $restaurant = $('#dish-restaurant');
        if (dish.restaurantId && dish.restaurantName) {
            var slug = dish.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            $restaurant.empty().append($('<a>').attr('href', '/restaurants/' + encodeURIComponent(dish.restaurantId) + '/' + slug).text(dish.restaurantName));
        } else {
            $restaurant.text(dish.restaurantName || '');
        }

        var scoreValue = dish.score;
        var scoreText = 'No ratings yet';
        if (scoreValue !== null && scoreValue !== undefined) {
            var formatted = typeof scoreValue === 'number' ? scoreValue.toFixed(1) : scoreValue;
            scoreText = formatted + ' / 10';
        }
        $('#dish-score').text(scoreText);

        var $cover = $('#dish-cover-container');
        $cover.empty();
        $('#dish-header').toggleClass('has-cover', Boolean(dish.coverPhoto));

        if (dish.coverPhoto) {
            var $image = $('<img>').attr({ src: dish.coverPhoto + '_m', alt: (dish.name || 'Dish') + ' cover photo' });
            $image.one('error', function() {
                // Older uploads may not have a medium variant.
                $(this).one('error', function() {
                    $cover.hide();
                    $('#dish-header').removeClass('has-cover');
                }).attr('src', dish.coverPhoto);
            });
            $cover.append($image).show();
        } else {
            $cover.hide();
        }
    },

    loadGalleryPhotos: async function() {
        if (dishPage.galleryLoading || !dishPage.galleryHasMore) {
            return;
        }

        dishPage.galleryLoading = true;
        $('#dish-photo-loading').removeClass('hidden');

        try {
            var res = await $.get('/api/dishes/' + encodeURIComponent(dishPage.dishId) + '/photos', {
                page: dishPage.galleryPage,
                pageSize: dishPage.galleryPageSize
            });
            if (!res.success) {
                dishPage.galleryHasMore = false;
                return;
            }

            var photos = res.data || [];
            dishPage.galleryTotal = res.total || 0;
            dishPage.appendGalleryPhotos(photos);
            dishPage.galleryPage += 1;
            dishPage.galleryHasMore = dishPage.galleryPhotos.length < dishPage.galleryTotal;

            if (dishPage.galleryPhotos.length) {
                $('#dish-photo-gallery').removeClass('hidden');
            } else if (!dishPage.galleryHasMore) {
                $('#dish-photo-gallery').addClass('hidden');
            }
        } catch (err) {
            dishPage.galleryHasMore = false;
        } finally {
            dishPage.galleryLoading = false;
            $('#dish-photo-loading').addClass('hidden');
        }
    },

    appendGalleryPhotos: function(photos) {
        if (!photos || !photos.length) {
            return;
        }

        var $track = $('#dish-photo-track');
        photos.forEach(function(photo) {
            var index = dishPage.galleryPhotos.length;
            dishPage.galleryPhotos.push(photo);
            var safeUrl = $('<div>').text((photo.url || '') + '_s').html();
            var reviewer = (photo.firstName || photo.lastName) ? ((photo.firstName || '') + ' ' + (photo.lastName || '')).trim() : (photo.username || 'Anonymous');
            var safeAlt = $('<div>').text('Photo from ' + reviewer).html();
            var thumbHtml = '<button type="button" class="dish-gallery-thumb" data-gallery-index="' + index + '">' +
                '<img src="' + safeUrl + '" alt="' + safeAlt + '" loading="lazy">' +
            '</button>';
            $track.append(thumbHtml);
        });
    },

    handleGalleryScroll: function() {
        var track = document.getElementById('dish-photo-track');
        if (!track || dishPage.galleryLoading || !dishPage.galleryHasMore) {
            return;
        }
        var remaining = track.scrollWidth - track.scrollLeft - track.clientWidth;
        if (remaining < 260) {
            dishPage.loadGalleryPhotos();
        }
    },

    openGalleryLightbox: function(index) {
        if (index < 0 || index >= dishPage.galleryPhotos.length) {
            return;
        }
        dishPage.activeGalleryIndex = index;
        dishPage.renderGalleryLightbox();
        $('#dish-photo-lightbox').removeClass('hidden');
        $('body').addClass('dish-lightbox-open');
        if (dishPage.galleryHasMore && index >= dishPage.galleryPhotos.length - 3) {
            dishPage.loadGalleryPhotos();
        }
    },

    closeGalleryLightbox: function() {
        $('#dish-photo-lightbox').addClass('hidden');
        $('body').removeClass('dish-lightbox-open');
        dishPage.activeGalleryIndex = null;
        $('#dish-lightbox-image').attr('src', '');
    },

    renderGalleryLightbox: function() {
        var index = dishPage.activeGalleryIndex;
        var photo = dishPage.galleryPhotos[index];
        if (!photo) {
            return;
        }

        var reviewer = (photo.firstName || photo.lastName) ? ((photo.firstName || '') + ' ' + (photo.lastName || '')).trim() : (photo.username || 'Anonymous');
        var reviewerSafe = $('<div>').text(reviewer).html();
        var reviewSafe = $('<div>').text(photo.reviewContent || '').html();
        var ratingSafe = $('<div>').text(photo.rating != null ? 'Rating: ' + photo.rating : '').html();
        var submittedDate = photo.submitted ? new Date(photo.submitted) : null;
        var submittedSafe = $('<div>').text(submittedDate ? submittedDate.toLocaleDateString() : '').html();
        var metaParts = [];
        if (ratingSafe) metaParts.push(ratingSafe);
        if (submittedSafe) metaParts.push(submittedSafe);

        $('#dish-lightbox-image')
            .attr('src', (photo.url || '') + '_m')
            .attr('alt', 'Photo from ' + reviewer);
        $('#dish-lightbox-review').html(
            '<div class="dish-lightbox-review-meta">' +
                '<span class="dish-lightbox-reviewer">' + reviewerSafe + '</span>' +
                (metaParts.length ? '<span>' + metaParts.join('</span><span>') + '</span>' : '') +
            '</div>' +
            (reviewSafe ? '<div class="dish-lightbox-review-text">' + reviewSafe + '</div>' : '')
        );
        dishPage.updateGalleryLightboxControls();
    },

    updateGalleryLightboxControls: function() {
        var index = dishPage.activeGalleryIndex;
        $('#dish-lightbox-prev').prop('disabled', !index || index <= 0);
        $('#dish-lightbox-next').prop('disabled', index >= dishPage.galleryPhotos.length - 1 && !dishPage.galleryHasMore);
    },

    showPreviousGalleryPhoto: function() {
        if (dishPage.activeGalleryIndex === null || dishPage.activeGalleryIndex <= 0) {
            return;
        }
        dishPage.activeGalleryIndex -= 1;
        dishPage.renderGalleryLightbox();
    },

    showNextGalleryPhoto: async function() {
        if (dishPage.activeGalleryIndex === null) {
            return;
        }

        if (dishPage.activeGalleryIndex < dishPage.galleryPhotos.length - 1) {
            dishPage.activeGalleryIndex += 1;
            dishPage.renderGalleryLightbox();
            if (dishPage.galleryHasMore && dishPage.activeGalleryIndex >= dishPage.galleryPhotos.length - 3) {
                dishPage.loadGalleryPhotos();
            }
            return;
        }

        if (dishPage.galleryHasMore) {
            await dishPage.loadGalleryPhotos();
            if (dishPage.activeGalleryIndex < dishPage.galleryPhotos.length - 1) {
                dishPage.activeGalleryIndex += 1;
                dishPage.renderGalleryLightbox();
            } else {
                dishPage.updateGalleryLightboxControls();
            }
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
            if (dishPage.highlightReviewId && dishPage.currentPage === 1) {
                var pinnedId = String(dishPage.highlightReviewId);
                reviews.sort(function(a, b) {
                    var aPin = String(a.reviewId) === pinnedId ? 0 : 1;
                    var bPin = String(b.reviewId) === pinnedId ? 0 : 1;
                    return aPin - bPin;
                });
            }
            reviews.forEach(function(review) {
                var submittedDate = review.submitted ? new Date(review.submitted) : null;
                var submittedText = submittedDate ? submittedDate.toLocaleDateString() : '';
                var reviewer = (review.firstName || review.lastName) ? ((review.firstName || '') + ' ' + (review.lastName || '')).trim() : (review.username || 'Anonymous');
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
                        var safeUrl = $('<div>').text(p.url + '_s').html();
                        return '<img class="review-photo" src="' + safeUrl + '" alt="Review photo" loading="lazy">';
                    }).join('');
                    photosHtml = '<div class="review-photos">' + photoItems + '</div>';
                }

                var reviewHtml = `
                    <div class="review-card" data-review-id="${review.reviewId}" data-user-vote="${review.userVote || 0}">
                        <div class="review-card-header">
                            <span class="review-rating">Rating: ${ratingText}</span>
                            <span class="review-author">${authorHtml}</span>
                        </div>
                        <div class="review-content">${safeContent}</div>
                        ${photosHtml}
                        ${modifications}
                        <div class="review-card-footer">
                            ${submittedHtml}
                            <div class="review-votes">
                                <button class="review-vote-btn${review.userVote === 1 ? ' active' : ''}" data-review-id="${review.reviewId}" data-vote="1" title="Thumbs up">👍</button>
                                <span class="review-vote-count">${review.likeCount || 0}</span>
                                <button class="review-vote-btn${review.userVote === -1 ? ' active' : ''}" data-review-id="${review.reviewId}" data-vote="-1" title="Thumbs down">👎</button>
                            </div>
                        </div>
                    </div>
                `;
                var $card = $(reviewHtml);
                if (dishPage.highlightReviewId && String(review.reviewId) === String(dishPage.highlightReviewId)) {
                    $card.addClass('review-card-highlight');
                }
                $reviewsList.append($card);
            });

            dishPage.hasNextPage = reviews.length === dishPage.pageSize;
        }

        $('#reviews-prev').prop('disabled', dishPage.currentPage <= 1);
        $('#reviews-next').prop('disabled', !dishPage.hasNextPage);
        $('#reviews-page').text('Page ' + dishPage.currentPage);
    },

    loadRatingTrend: function() {
        $.get('/api/reviews/dish/' + encodeURIComponent(dishPage.dishId) + '/ratings')
            .done(function(res) {
                if (res.success && res.data && res.data.length) {
                    dishPage.renderRatingTrend(res.data, {
                        currentScore: res.currentScore,
                        scoreCalculatedAt: res.scoreCalculatedAt
                    });
                }
            });
    },

    parseTrendNumber: function(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        var parsed = typeof value === 'number' ? value : Number(value);
        return isFinite(parsed) ? parsed : null;
    },

    formatTrendDate: function(value, includeYear) {
        var timestamp = dishPage.parseTrendNumber(value);
        if (timestamp === null) {
            return '';
        }
        var options = includeYear
            ? { month: 'short', day: 'numeric', year: 'numeric' }
            : { month: 'short', day: 'numeric' };
        return new Date(timestamp).toLocaleDateString(undefined, options);
    },

    formatTrendScore: function(value) {
        var score = dishPage.parseTrendNumber(value);
        if (score === null) {
            return 'N/A';
        }
        return score.toFixed(1);
    },

    renderRatingTrend: function(ratings, trendMeta) {
        trendMeta = trendMeta || {};

        var reviewPoints = [];
        var scorePoints = [];
        var xValues = [];

        for (var i = 0; i < ratings.length; i++) {
            var submitted = dishPage.parseTrendNumber(ratings[i].submitted);
            var rating = dishPage.parseTrendNumber(ratings[i].rating);
            if (submitted === null || rating === null) {
                continue;
            }

            reviewPoints.push({
                x: submitted,
                y: rating,
                reviewId: ratings[i].reviewId
            });
            xValues.push(submitted);

            var rollingScore = dishPage.parseTrendNumber(ratings[i].rollingScore);
            if (rollingScore !== null) {
                scorePoints.push({
                    x: submitted,
                    y: rollingScore
                });
            }
        }

        var calculatedAt = dishPage.parseTrendNumber(trendMeta.scoreCalculatedAt);
        var currentScore = dishPage.parseTrendNumber(trendMeta.currentScore);
        if (calculatedAt !== null) {
            xValues.push(calculatedAt);
            if (currentScore !== null) {
                scorePoints.push({
                    x: calculatedAt,
                    y: currentScore,
                    isCurrentScore: true
                });
            }
        }

        if (!reviewPoints.length) {
            return;
        }

        scorePoints.sort(function(a, b) {
            return a.x - b.x;
        });

        var minX = Math.min.apply(null, xValues);
        var maxX = Math.max.apply(null, xValues);
        var range = maxX - minX;
        var padding = range > 0 ? Math.max(range * 0.04, 12 * 60 * 60 * 1000) : 24 * 60 * 60 * 1000;

        $('#rating-trend').removeClass('hidden');
        var ctx = document.getElementById('rating-trend-chart').getContext('2d');

        if (dishPage.ratingTrendChart) {
            dishPage.ratingTrendChart.destroy();
        }

        dishPage.ratingTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Review Rating',
                        data: reviewPoints,
                        borderColor: 'rgba(227, 100, 20, 0.25)',
                        backgroundColor: 'rgba(227, 100, 20, 0.72)',
                        pointBackgroundColor: 'rgba(227, 100, 20, 0.78)',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1.5,
                        pointRadius: 4.5,
                        pointHoverRadius: 6,
                        borderWidth: 0,
                        showLine: false
                    },
                    {
                        label: 'Rolling Score',
                        data: scorePoints,
                        borderColor: '#007C87',
                        backgroundColor: 'rgba(0, 124, 135, 0.08)',
                        pointRadius: 0,
                        pointHitRadius: 8,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        max: 10,
                        ticks: { stepSize: 2 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        type: 'linear',
                        min: minX - padding,
                        max: maxX + padding,
                        ticks: {
                            maxTicksLimit: 5,
                            callback: function(value) {
                                return dishPage.formatTrendDate(value, range > 365 * 24 * 60 * 60 * 1000);
                            }
                        },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(items) {
                                if (!items.length) return '';
                                return dishPage.formatTrendDate(items[0].parsed.x, true);
                            },
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + dishPage.formatTrendScore(ctx.parsed.y);
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    intersect: false
                }
            }
        });
    }
};

$(document).ready(async function() {
    await session.ready();
    dishPage.init();
});

window.dishPage = dishPage;

//# sourceURL=dish.js
