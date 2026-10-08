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
    trendRatings: [],
    coverPhotoUrl: null,
    lightboxOpener: null,
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
        dishPage.coverResizeObserver = new ResizeObserver(dishPage.applyCoverFraming);
        dishPage.coverResizeObserver.observe(document.getElementById('dish-cover-container'));
        dishPage.loadDish();
        dishPage.loadGalleryPhotos();
        dishPage.loadReviews();
        dishPage.loadRatingTrend();

        dishPage.syncAuth();
    },

    syncAuth: function() {
        var authenticated = Boolean(window._platillosUser);
        $('#watchlist-btn, #tried-it-btn, #favorite-btn').toggleClass('hidden', !authenticated);
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
        $(document).on('click', '.js-add-review', function() {
            if (!dishPage.dishData) return;
            if (!window._platillosUser) {
                if (window.showLoginPopup) window.showLoginPopup();
                return;
            }
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

        $('#view-dish-photos').on('click', function() {
            dishPage.openGalleryLightbox(0);
        });

        $('#dish-cover-container').on('click', function() {
            var index = dishPage.galleryPhotos.findIndex(function(photo) { return photo.url === dishPage.coverPhotoUrl; });
            dishPage.openGalleryLightbox(index);
        });

        $('#rating-trend').on('toggle', function() {
            if (this.open) dishPage.renderRatingTrend(dishPage.trendRatings);
        });

        $('#dish-lightbox-close').on('click', function() {
            dishPage.closeGalleryLightbox();
        });
        $('#adjust-photo-framing').on('click', dishPage.openFramingEditor);
        $('#photo-framing-editor input').on('input', dishPage.previewFraming);
        $('#framing-full').on('click', function() { dishPage.setFramingFields({ x: 0, y: 0, width: 1, height: 1 }); });
        $('#framing-cancel').on('click', dishPage.closeFramingEditor);
        $('#framing-save').on('click', dishPage.saveFraming);
        $('#dish-lightbox-image').on('pointerdown', function(e) {
            if ($('#photo-framing-editor').hasClass('hidden')) return;
            e.preventDefault();
            dishPage.framingDrag = { x: e.clientX, y: e.clientY, rect: this.getBoundingClientRect() };
            this.setPointerCapture(e.originalEvent.pointerId);
        }).on('pointermove', function(e) {
            var drag = dishPage.framingDrag;
            if (!drag) return;
            var x = Math.max(drag.rect.left, Math.min(drag.rect.right, e.clientX));
            var y = Math.max(drag.rect.top, Math.min(drag.rect.bottom, e.clientY));
            $('#framing-selection').removeClass('hidden').css({ left: Math.min(x, drag.x), top: Math.min(y, drag.y), width: Math.abs(x - drag.x), height: Math.abs(y - drag.y) });
        }).on('pointerup', function(e) {
            var drag = dishPage.framingDrag;
            if (!drag) return;
            var x1 = (drag.x - drag.rect.left) / drag.rect.width;
            var y1 = (drag.y - drag.rect.top) / drag.rect.height;
            var x2 = Math.max(0, Math.min(1, (e.clientX - drag.rect.left) / drag.rect.width));
            var y2 = Math.max(0, Math.min(1, (e.clientY - drag.rect.top) / drag.rect.height));
            var box = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
            if (photoFraming.validBox(box) && box.width > 0.02 && box.height > 0.02) dishPage.setFramingFields(box);
            dishPage.framingDrag = null;
            $('#framing-selection').addClass('hidden');
        }).on('pointercancel', function() { dishPage.framingDrag = null; $('#framing-selection').addClass('hidden'); });

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
            } else if (e.key === 'ArrowLeft' && $('#photo-framing-editor').hasClass('hidden')) {
                dishPage.showPreviousGalleryPhoto();
            } else if (e.key === 'ArrowRight' && $('#photo-framing-editor').hasClass('hidden')) {
                dishPage.showNextGalleryPhoto();
            } else if (e.key === 'Tab') {
                var buttons = $('#dish-photo-lightbox button:enabled, #dish-photo-lightbox input:enabled').filter(':visible').toArray();
                var first = buttons[0];
                var last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
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
                res = await common.secureAjax({ url: '/api/reviews/' + reviewId + '/vote', method: 'PUT', data: { value: direction } });
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
            var res = await $.get('/api/users/me/favorites/ids');
            if (res.success && Array.isArray(res.data)) {
                dishPage.isFavorite = res.data.indexOf(dishPage.dishId) !== -1;
                dishPage.updateFavoriteButton();
            }
        } catch (err) { /* silent */ }
    },

    loadWatchlistState: async function() {
        try {
            var res = await $.get('/api/users/me/watchlist/ids');
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
                await common.secureAjax({ url: '/api/users/me/watchlist/' + dishPage.dishId, method: 'DELETE' });
                dishPage.isOnWatchlist = false;
            } else {
                await common.secureAjax({ url: '/api/users/me/watchlist/' + dishPage.dishId, method: 'PUT' });
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
                await common.secureAjax({ url: '/api/users/me/favorites/' + dishPage.dishId, method: 'DELETE' });
                dishPage.isFavorite = false;
            } else {
                await common.secureAjax({ url: '/api/users/me/favorites/' + dishPage.dishId, method: 'PUT' });
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
            var res = await $.get('/api/users/me/tried/' + encodeURIComponent(dishPage.dishId));
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
            var res = await common.secureAjax({ url: '/api/users/me/diary', method: 'POST', data: payload });
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
        $('#dish-score').text('Loading ratings…');
        $('#dish-rating-note').addClass('hidden');
        $('#dish-review-count, #reviews-count-label').text('');
        $('#quick-log-btn').prop('disabled', true);
        $('#dish-cover-container').empty().hide();
    },

    renderDishError: function(message) {
        $('#dish-header').removeClass('has-cover');
        $('#dish-name').text('Dish');
        $('#dish-restaurant').text(message || 'Unavailable');
        $('#dish-score').text('');
        $('#dish-rating-note').addClass('hidden');
        $('#dish-cover-container').empty().hide();
        $('#dish-actions').addClass('hidden');
        $('#rating-trend, #view-dish-photos').addClass('hidden');
        dishPage.dishData = null;
    },

    renderDish: function(dish) {
        dishPage.dishData = dish;
        $('#dish-actions').removeClass('hidden');
        $('#quick-log-btn').prop('disabled', false).text(Number(dish.reviewCount) === 0 ? 'Be the first to review' : 'Add my review');
        $('#dish-name').text(dish.name || 'Dish');
        document.title = (dish.name || 'Dish') + (dish.restaurantName ? ' — ' + dish.restaurantName : '') + ' | Platillos';

        var $restaurant = $('#dish-restaurant');
        if (dish.restaurantId && dish.restaurantName) {
            var slug = dish.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            $restaurant.empty().append($('<a>').attr('href', '/restaurants/' + encodeURIComponent(dish.restaurantId) + '/' + slug).text(dish.restaurantName));
        } else {
            $restaurant.text(dish.restaurantName || '');
        }

        var count = Number(dish.reviewCount) || 0;
        $('#reviews-count-label').text('(' + count + ')');
        dishPage.renderCoverPhoto();
    },

    renderCoverPhoto: function() {
        if (!dishPage.dishData) return;
        // The gallery endpoint returns only approved photos on approved reviews.
        // An explicitly selected cover always takes priority over the fallback.
        var dish = dishPage.dishData;
        var url = dish.coverPhoto || (dishPage.galleryPhotos[0] && dishPage.galleryPhotos[0].url);
        dishPage.coverPhotoUrl = url || null;
        var $cover = $('#dish-cover-container');
        $cover.empty();
        $('#dish-header').toggleClass('has-cover', Boolean(url));

        if (url) {
            var framing = dish.coverPhoto ? dish.coverFraming : dishPage.galleryPhotos[0]?.framing;
            var $image = $('<img>').attr({ src: framing?.displayUrl || url, alt: (dish.name || 'Dish') + ' cover photo' });
            $image.on('load', dishPage.applyCoverFraming);
            $image.one('error', function() {
                $(this).one('error', function() {
                    $cover.hide();
                    $('#dish-header').removeClass('has-cover');
                }).attr('src', framing?.displayUrl ? url : url + '_m');
            });
            $cover.append($image, $('<span>').addClass('dish-photo-hint').text('View full photo')).show();
            dishPage.applyCoverFraming();
        } else {
            $cover.hide();
        }
    },

    applyCoverFraming: function() {
        var img = document.querySelector('#dish-cover-container img');
        var container = document.getElementById('dish-cover-container');
        if (!img || !img.naturalWidth || !container.clientHeight || !dishPage.dishData) return;
        var data = dishPage.dishData.coverPhoto ? dishPage.dishData.coverFraming : dishPage.galleryPhotos[0]?.framing;
        var box = data?.displayUrl === img.getAttribute('src') ? data.displayBox : data?.box;
        // A medium fallback has already been framed; original coordinates no longer apply.
        if (img.getAttribute('src') !== dishPage.coverPhotoUrl && img.getAttribute('src') !== data?.displayUrl) box = null;
        var result = box ? photoFraming.frame(img.naturalWidth, img.naturalHeight, container.clientWidth / container.clientHeight, box) : { fit: 'contain', position: '50% 50%' };
        $(img).css({ objectFit: result.fit, objectPosition: result.position });
    },

    activePhoto: function() {
        if (dishPage.activeGalleryIndex === -1) return { url: dishPage.coverPhotoUrl, fileId: dishPage.dishData.coverFileId, framing: dishPage.dishData.coverFraming, canAdjust: dishPage.dishData.canAdjustCover, firstName: 'Dish photo' };
        return dishPage.galleryPhotos[dishPage.activeGalleryIndex];
    },
    openFramingEditor: function() {
        var photo = dishPage.activePhoto();
        if (!photo?.canAdjust) return;
        $('#photo-framing-editor').removeClass('hidden');
        $('#dish-photo-lightbox').addClass('is-adjusting');
        $('#framing-status').text('');
        dishPage.setFramingFields(photo.framing?.box || { x: 0, y: 0, width: 1, height: 1 });
        $('#framing-left').trigger('focus');
    },
    closeFramingEditor: function() {
        dishPage.framingDrag = null;
        $('#framing-selection').addClass('hidden');
        $('#photo-framing-editor').addClass('hidden');
        $('#dish-photo-lightbox').removeClass('is-adjusting');
        $('#adjust-photo-framing').trigger('focus');
    },
    setFramingFields: function(box) {
        $('#framing-left').val(Math.floor(box.x * 100));
        $('#framing-top').val(Math.floor(box.y * 100));
        $('#framing-right').val(Math.ceil((box.x + box.width) * 100));
        $('#framing-bottom').val(Math.ceil((box.y + box.height) * 100));
        dishPage.previewFraming();
    },
    framingFields: function() {
        var left = Number($('#framing-left').val()) / 100;
        var top = Number($('#framing-top').val()) / 100;
        return { x: left, y: top, width: Number($('#framing-right').val()) / 100 - left, height: Number($('#framing-bottom').val()) / 100 - top };
    },
    previewFraming: function() {
        var img = document.getElementById('dish-lightbox-image');
        var box = dishPage.framingFields();
        var valid = photoFraming.validBox(box);
        $('#framing-save').prop('disabled', !valid);
        $('#framing-status').text(valid ? '' : 'Right and bottom must be beyond left and top.');
        if (valid) {
            var rect = photoFraming.subjectRect(img.naturalWidth, img.naturalHeight, box);
            var canvas = document.getElementById('framing-preview');
            var context = canvas.getContext('2d');
            var scale = Math.min(canvas.width / rect.width, canvas.height / rect.height);
            context.fillStyle = '#f5f9f8';
            context.fillRect(0, 0, canvas.width, canvas.height);
            if (img.naturalWidth) context.drawImage(img, rect.x, rect.y, rect.width, rect.height, (canvas.width - rect.width * scale) / 2, (canvas.height - rect.height * scale) / 2, rect.width * scale, rect.height * scale);
        }
    },
    saveFraming: async function() {
        var photo = dishPage.activePhoto();
        var box = dishPage.framingFields();
        if (!photo?.canAdjust || !photoFraming.validBox(box)) return;
        $('#framing-save').prop('disabled', true);
        try {
            var result = await common.secureAjax({ url: '/api/files/' + encodeURIComponent(photo.fileId) + '/framing', method: 'PATCH', data: JSON.stringify({ box: box }), contentType: 'application/json' });
            if (!result.success) throw new Error('Unable to save framing.');
            photo.framing = result.data;
            if (photo.url === dishPage.dishData.coverPhoto) dishPage.dishData.coverFraming = result.data;
            dishPage.renderCoverPhoto();
            dishPage.closeFramingEditor();
        } catch (err) { $('#framing-status').text('Unable to save framing. Please try again.'); }
        finally { $('#framing-save').prop('disabled', false); }
    },

    loadGalleryPhotos: async function() {
        if (dishPage.galleryLoading || !dishPage.galleryHasMore) {
            return;
        }

        dishPage.galleryLoading = true;

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

            $('#view-dish-photos').toggleClass('hidden', !dishPage.galleryPhotos.length)
                .text('View all photos (' + dishPage.galleryTotal + ')');
            if (dishPage.dishData && !dishPage.dishData.coverPhoto) dishPage.renderCoverPhoto();
            if (dishPage.activeGalleryIndex !== null) dishPage.updateGalleryLightboxControls();
        } catch (err) {
            dishPage.galleryHasMore = false;
        } finally {
            dishPage.galleryLoading = false;
            if (dishPage.activeGalleryIndex !== null) dishPage.updateGalleryLightboxControls();
        }
    },

    appendGalleryPhotos: function(photos) {
        if (!photos || !photos.length) {
            return;
        }

        photos.forEach(function(photo) {
            dishPage.galleryPhotos.push(photo);
        });
    },

    openGalleryLightbox: function(index) {
        if ((index < 0 && !dishPage.coverPhotoUrl) || index >= dishPage.galleryPhotos.length) {
            return;
        }
        dishPage.lightboxOpener = document.activeElement;
        dishPage.activeGalleryIndex = index;
        dishPage.renderGalleryLightbox();
        $('#dish-photo-lightbox').removeClass('hidden');
        $('body').addClass('dish-lightbox-open');
        $('#dish-lightbox-close').trigger('focus');
        if (dishPage.galleryHasMore && index >= dishPage.galleryPhotos.length - 3) {
            dishPage.loadGalleryPhotos();
        }
    },

    closeGalleryLightbox: function() {
        dishPage.closeFramingEditor();
        $('#dish-photo-lightbox').addClass('hidden');
        $('body').removeClass('dish-lightbox-open');
        dishPage.activeGalleryIndex = null;
        $('#dish-lightbox-image').off('error').removeAttr('src');
        if (dishPage.lightboxOpener && dishPage.lightboxOpener.isConnected) dishPage.lightboxOpener.focus();
    },

    renderGalleryLightbox: function() {
        var index = dishPage.activeGalleryIndex;
        var photo = dishPage.activePhoto();
        if (!photo) {
            return;
        }
        dishPage.closeFramingEditor();
        $('#adjust-photo-framing').toggleClass('hidden', !photo.canAdjust);

        var reviewer = (photo.firstName || photo.lastName) ? ((photo.firstName || '') + ' ' + (photo.lastName || '')).trim() : (photo.username || 'Anonymous');
        var reviewerSafe = common.escapeHtml(reviewer);
        var reviewSafe = common.escapeHtml(photo.reviewContent || '');
        var ratingSafe = common.escapeHtml(photo.rating != null ? 'Rating: ' + photo.rating : '');
        var submittedDate = photo.submitted ? new Date(photo.submitted) : null;
        var submittedSafe = common.escapeHtml(submittedDate ? submittedDate.toLocaleDateString() : '');
        var metaParts = [];
        if (ratingSafe) metaParts.push(ratingSafe);
        if (submittedSafe) metaParts.push(submittedSafe);

        $('#dish-lightbox-image')
            .off('error').one('error', function() { $(this).attr('src', photo.url + '_m'); })
            .attr('src', photo.url || '')
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
        $('#dish-lightbox-next').prop('disabled', index < 0 || (index >= dishPage.galleryPhotos.length - 1 && (!dishPage.galleryHasMore || dishPage.galleryLoading)));
    },

    showPreviousGalleryPhoto: function() {
        if (dishPage.activeGalleryIndex === null || dishPage.activeGalleryIndex <= 0) {
            return;
        }
        dishPage.activeGalleryIndex -= 1;
        dishPage.renderGalleryLightbox();
    },

    showNextGalleryPhoto: async function() {
        if (dishPage.activeGalleryIndex === null || dishPage.activeGalleryIndex < 0) {
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
            if (dishPage.activeGalleryIndex === null) return;
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
            var res = await $.get('/api/dishes/' + encodeURIComponent(dishPage.dishId) + '/reviews', {
                page: dishPage.currentPage,
                pageSize: dishPage.pageSize
            });
            if (!res.success) {
                dishPage.renderReviewsError((res && res.message) || 'Failed to load reviews');
                return;
            }
            dishPage.renderReviews(res.data || [], res.total);
        } catch (err) {
            dishPage.renderReviewsError('Failed to load reviews.');
        }
    },

    renderReviewsError: function(message) {
        var safeMessage = common.escapeHtml(message || 'Error');
        $('#reviews-list').html('<div class="reviews-error">' + safeMessage + '</div>');
        $('#reviews-prev').prop('disabled', dishPage.currentPage <= 1);
        $('#reviews-next').prop('disabled', true);
        $('.reviews-pagination').toggleClass('hidden', dishPage.currentPage <= 1);
    },

    renderReviews: function(reviews, total) {
        var $reviewsList = $('#reviews-list');
        $reviewsList.empty();

        if (!reviews.length) {
            if (dishPage.currentPage === 1) {
                $reviewsList.html('<div class="reviews-empty"><strong>Tried this dish?</strong><p>Share your first impression. Your review can help someone find their next favorite.</p><button type="button" class="btn btn-turquoise js-add-review">Be the first to review</button></div>');
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
                var reviewerSafe = common.escapeHtml(reviewer || '');
                var modifications = review.modifications ? '<div class="review-modifications"><strong>Modifications:</strong> ' + common.escapeHtml(review.modifications) + '</div>' : '';
                var safeContent = common.escapeHtml(review.reviewContent || '');
                var ratingText = review.rating != null ? review.rating : 'N/A';
                var submittedHtml = '';
                if (submittedText) {
                    var submittedSafe = common.escapeHtml('Submitted: ' + submittedText);
                    submittedHtml = '<div class="review-meta">' + submittedSafe + '</div>';
                }

                // Build reviewer avatar
                var avatarHtml = '';
                if (review.avatarUrl) {
                    avatarHtml = '<img class="review-author-avatar" src="' + common.escapeHtml(review.avatarUrl + '_s') + '" alt="">';
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
                        var safeUrl = common.escapeHtml(p.url + '_s');
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

            dishPage.hasNextPage = reviews.length === dishPage.pageSize && (total == null || dishPage.currentPage * dishPage.pageSize < Number(total));
        }

        $('#reviews-prev').prop('disabled', dishPage.currentPage <= 1);
        $('#reviews-next').prop('disabled', !dishPage.hasNextPage);
        $('#reviews-page').text('Page ' + dishPage.currentPage);
        $('.reviews-pagination').toggleClass('hidden', dishPage.currentPage === 1 && !dishPage.hasNextPage);
    },

    loadRatingTrend: function() {
        $.get('/api/dishes/' + encodeURIComponent(dishPage.dishId) + '/ratings')
            .done(function(res) {
                if (res.success && res.data && res.summary) {
                    dishPage.renderRatingSummary(res.summary);
                    dishPage.trendRatings = res.data;
                    var dates = new Set(res.data.filter(function(row) {
                        return dishPage.parseTrendNumber(row.rating) !== null && dishPage.parseTrendNumber(row.submitted) !== null;
                    }).map(function(row) { return dishPage.parseTrendNumber(row.submitted); }));
                    $('#rating-trend').toggleClass('hidden', dates.size < 2);
                } else {
                    dishPage.renderRatingSummaryError();
                }
            }).fail(dishPage.renderRatingSummaryError);
    },

    renderRatingSummaryError: function() {
        $('#dish-score').text('Ratings unavailable');
        $('#dish-rating-note').addClass('hidden');
        $('#rating-trend').addClass('hidden').prop('open', false);
    },

    renderRatingSummary: function(summary) {
        var $scores = $('#dish-score').empty();
        var overall = summary.overall;
        var recent = summary.recent;
        var showComparison = recent.count >= 3 && recent.count < overall.count;
        var note = '';
        function addAverage(label, period, value) {
            var $card = $('<div>').addClass('dish-rating-average');
            $card.append($('<span>').addClass('dish-rating-label').text(label));
            $card.append($('<span>').addClass('dish-score').text(Number(value.average).toFixed(1) + ' / 10'));
            var $count = label === 'Overall average' ? $('<a>').attr({ id: 'dish-review-count', href: '#dish-reviews' }) : $('<span>');
            $card.append($count.addClass('dish-rating-count').text(period + ' · Based on ' + value.count + (value.count === 1 ? ' review' : ' reviews')));
            $scores.append($card);
        }
        if (!overall.count) {
            $scores.append($('<span>').addClass('dish-score is-unrated').text('No ratings yet'));
        } else {
            if (showComparison) addAverage('Recent average', 'Last 6 months', recent);
            addAverage('Overall average', 'All time', overall);
            if (!recent.count) {
                note = 'No reviews in the last 6 months.';
            } else if (!showComparison && recent.count < overall.count) {
                note = 'Only ' + recent.count + (recent.count === 1 ? ' review' : ' reviews') + ' in the last 6 months; showing the overall average.';
            }
        }
        $('#dish-rating-note').text(note).toggleClass('hidden', !note);
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

    renderRatingTrend: function(ratings) {
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

            var overallAverage = dishPage.parseTrendNumber(ratings[i].overallAverage);
            if (overallAverage !== null) {
                scorePoints.push({
                    x: submitted,
                    y: overallAverage
                });
            }
        }

        if (reviewPoints.length < 2 || new Set(reviewPoints.map(function(point) { return point.x; })).size < 2) {
            $('#rating-trend').addClass('hidden').prop('open', false);
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
                        label: 'Overall average',
                        data: scorePoints,
                        borderColor: '#007C87',
                        backgroundColor: 'rgba(0, 124, 135, 0.08)',
                        pointRadius: 0,
                        pointHitRadius: 8,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
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
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
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
