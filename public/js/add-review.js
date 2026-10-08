var addReviewModule = {
    lat: null,
    lng: null,
    itemType: null,
    restaurants: [],
    dishes: [],
    metadataOptions: null,
    isSubmitting: false,
    restaurantRequest: 0,
    drinkCategoryLabels: ['Cocktail', 'Beer', 'Wine', 'Spirits', 'Non-Alcoholic'],
    drinkTypeLabels: ['Margarita', 'Old Fashioned', 'Martini', 'Negroni', 'Daiquiri', 'Mojito', 'Manhattan', 'Paloma', 'Moscow Mule', 'Espresso Martini', 'Aperol Spritz', 'House Cocktail', 'Lager', 'Pilsner', 'IPA', 'Pale Ale', 'Hazy IPA', 'Wheat Beer', 'Amber Ale', 'Saison', 'Porter', 'Stout', 'Gose', 'Sour', 'Cider', 'Mocktail'],
    setHandlers: function() {
        $('#add-review-form').on('submit', function(e) { e.preventDefault(); });
        $('#review-type-section').on('click', '.review-type-option', addReviewModule.chooseItemType);
        $('#submit-review').on('click', addReviewModule.handleSubmit);
        $('#restaurant-list').on('click', '.restaurant-item', addReviewModule.selectRestaurant);
        $('#restaurant-search').on('input', addReviewModule.debounce(addReviewModule.restaurantSearch, 250));
        $('#dish-search').on('input', addReviewModule.debounce(addReviewModule.dishSearch, 250));
        $('#selected-restaurant-container').on('click', '#cancel-selection-btn', addReviewModule.cancelRestaurantSelection);
        $('#dish-list').on('click', '.dish-item', addReviewModule.selectDish);
        $('#selected-dish-container').on('click', '#cancel-dish-selection-btn', addReviewModule.cancelDishSelection);
        $('#photo-upload-btn').on('click', addReviewModule.triggerPhotoUpload);
        $('#photo-upload').on('change', addReviewModule.previewPhotos);
        $('#photo-upload-preview').on('click', '.remove-photo-btn', addReviewModule.removePhoto);
        $('#restaurant-list').on('click', '#add-restaurant-btn', addReviewModule.showAddRestaurantForm);
        $('#save-restaurant-btn').on('click', addReviewModule.saveRestaurant);
        $('#cancel-add-restaurant-btn').on('click', addReviewModule.cancelAddRestaurant);
        $('#dish-list').on('click', '#add-dish-btn', addReviewModule.showAddDishForm);
        $('#save-dish-btn').on('click', addReviewModule.saveDish);
        $('#cancel-add-dish-btn').on('click', addReviewModule.cancelAddDish);
        $('#drink-style-section').on('click', '.metadata-chip', addReviewModule.toggleMetadataChip);
        $('#add-to-favorites').on('change', addReviewModule.syncFavoriteCheckbox);
    },
    itemNoun: function() {
        return addReviewModule.itemType === 'drink' ? 'drink' : 'dish';
    },
    itemNounTitle: function() {
        return addReviewModule.itemType === 'drink' ? 'Drink' : 'Dish';
    },
    itemPlural: function() {
        return addReviewModule.itemType === 'drink' ? 'drinks' : 'dishes';
    },
    chooseItemType: function(e) {
        var nextType = $(e.currentTarget).data('itemType') === 'drink' ? 'drink' : 'food';
        if (!$('#selected-restaurant-container .selected-restaurant').length) {
            common.showAlert('Please choose a restaurant first.', 'error');
            return;
        }
        addReviewModule.itemType = nextType;
        $('.review-type-option').removeClass('active').attr('aria-pressed', 'false');
        $(e.currentTarget).addClass('active').attr('aria-pressed', 'true');
        addReviewModule.updateItemLabels();
        addReviewModule.clearItemState();
        addReviewModule.loadDishesForSelectedRestaurant();
    },
    updateItemLabels: function() {
        var noun = addReviewModule.itemNoun();
        var title = addReviewModule.itemNounTitle();
        $('#add-review-modal h2').text('Review a ' + title + '!');
        $('#restaurant-search-label').text('Where did you have this ' + noun + '?');
        $('#dish-search-label').text(addReviewModule.itemType === 'drink' ? 'What did you drink?' : 'What did you eat?');
        $('#dish-search').attr('placeholder', addReviewModule.itemType === 'drink' ? 'Search drinks...' : 'Search dishes...');
        $('#add-dish-title').text('Add a ' + title);
        $('#new-dish-name-label').text(title + ' Name');
        $('#new-dish-name').attr('placeholder', title + ' name');
        $('#save-dish-btn').text('Save ' + title);
        $('#modifications-label').text(addReviewModule.itemType === 'drink' ? 'Any notes or modifications?' : 'Any modifications to your dish?');
        $('#modifications').attr('placeholder', addReviewModule.itemType === 'drink' ? 'Salt rim, spirit swap, served up, etc.' : 'No onions, extra cheese, etc.');
    },
    renderLoading: function($target, message) {
        $target.html(
            '<div class="loading-indicator" role="status">' +
                '<span class="spinner"></span>' +
                '<span class="loading-text">' + (message || 'Loading...') + '</span>' +
            '</div>'
        );
    },
    renderEmptyState: function($target, message, actionHtml) {
        var html = '<div class="empty-state"><div class="empty-message">' + message + '</div>';
        if (actionHtml) {
            html += '<div class="empty-actions">' + actionHtml + '</div>';
        }
        html += '</div>';
        $target.html(html);
    },
    populateRestaurantList: function(restaurants) {
        addReviewModule.restaurants = Array.isArray(restaurants) ? restaurants : [];
        var $list = $('#restaurant-list');
        $list.empty();

        if (!addReviewModule.restaurants.length) {
            addReviewModule.renderEmptyState($list, 'No restaurants found nearby.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-restaurant-btn">Add a Restaurant</a>');
            return;
        }

        addReviewModule.restaurants.forEach(function(r) {
            $list.append(addReviewModule.getRestaurantCard(r));
        });

        $list.append(
            '<div class="list-footer">' +
                '<div>Can\'t find the restaurant you\'re looking for?</div>' +
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-restaurant-btn">Add a Restaurant</a>' +
            '</div>'
        );
    },
    populateDishList: function(dishes) {
        addReviewModule.dishes = Array.isArray(dishes) ? dishes : [];
        addReviewModule.renderDishResults($('#dish-search').val() || '');
    },
    renderDishResults: function(searchTerm) {
        var $list = $('#dish-list');
        if (!addReviewModule.dishes.length) {
            addReviewModule.renderEmptyState($list, 'This restaurant does not have any ' + addReviewModule.itemPlural() + ' yet.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New ' + addReviewModule.itemNounTitle() + '</a>');
            return;
        }

        var normalized = searchTerm.trim().toLowerCase();
        var filtered = normalized
            ? addReviewModule.dishes.filter(function(d) {
                  return (d.name || '').toLowerCase().indexOf(normalized) !== -1;
              })
            : addReviewModule.dishes.slice();

        $list.empty();

        if (!filtered.length) {
            addReviewModule.renderEmptyState($list, 'No ' + addReviewModule.itemPlural() + ' matched your search.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New ' + addReviewModule.itemNounTitle() + '</a>');
            return;
        }

        filtered.forEach(function(d) {
            $list.append(addReviewModule.getDishCard(d));
        });

        $list.append(
            '<div class="list-footer">' +
                '<div>Can\'t find the ' + addReviewModule.itemNoun() + ' you\'re looking for?</div>' +
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New ' + addReviewModule.itemNounTitle() + '</a>' +
            '</div>'
        );
    },
    setSubmitState: function(isSubmitting) {
        addReviewModule.isSubmitting = !!isSubmitting;
        $('#submit-review').prop('disabled', addReviewModule.isSubmitting)
            .toggleClass('is-loading', addReviewModule.isSubmitting)
            .text(addReviewModule.isSubmitting ? 'Submitting…' : 'Submit Review');
    },
    syncFavoriteCheckbox: function() {
        var $row = $('.favorite-checkbox-row');
        var $cb = $('#add-to-favorites');
        var checked = $cb.prop('checked');
        $row.toggleClass('active', checked);
        $row.find('.favorite-checkbox-icon').text(checked ? '\u2665' : '\u2661');
    },
    resetReviewSection: function() {
        $('#review-section').addClass('hidden');
        $('#rating').val('');
        $('#review').val('');
        $('#modifications').val('');
        $('#photo-upload').val('');
        $('#photo-upload-preview').empty();
        $('#add-to-favorites').prop('checked', false);
        addReviewModule.syncFavoriteCheckbox();
        addReviewModule.setSubmitState(false);
    },
    clearItemState: function() {
        $('#selected-dish-container').empty();
        $('#dish-search').val('');
        $('#dish-list').empty();
        $('#dish-search-section').addClass('hidden');
        $('#add-dish-section').addClass('hidden');
        $('#new-dish-name').val('');
        $('#drink-style-section .metadata-chip').removeClass('active').attr('aria-pressed', 'false');
        $('#selected-restaurant-container #cancel-selection-btn').removeClass('hidden');
        addReviewModule.dishes = [];
        addReviewModule.resetReviewSection();
    },
    resetAll: function() {
        addReviewModule.resetReviewSection();
        $('#selected-restaurant-container').empty();
        $('#selected-dish-container').empty();
        $('#restaurant-search').val('');
        $('#dish-search').val('');
        $('#add-review-modal h2').text('Add a Review');
        $('#review-type-section').addClass('hidden');
        $('.review-type-option').removeClass('active').attr('aria-pressed', 'false');
        $('#restaurant-search-section').removeClass('hidden');
        $('#add-restaurant-section').addClass('hidden');
        $('#dish-search-section').addClass('hidden');
        $('#add-dish-section').addClass('hidden');
        $('#restaurant-list').removeClass('hidden');
        $('#restaurant-search').closest('.form-row').removeClass('hidden');
        addReviewModule.itemType = null;
        addReviewModule.dishes = [];
        $('#dish-list').empty();
        if (addReviewModule.restaurants.length) {
            addReviewModule.populateRestaurantList(addReviewModule.restaurants);
        } else {
            addReviewModule.loadRestaurants(addReviewModule.lat, addReviewModule.lng);
        }
    },
    handleSubmit: async function(e) {
        e.preventDefault();
        if (!validate.validateForm($('#review-section')[0])) return;

        if (addReviewModule.isSubmitting) {
            return;
        }

        var $selectedRestaurant = $('#selected-restaurant-container .selected-restaurant');
        if (!$selectedRestaurant.length) {
            common.showAlert('Please select a restaurant before submitting your review.', 'error');
            return;
        }
        var selectedRestaurantId = $selectedRestaurant.data('id');
        var isNewRestaurant = selectedRestaurantId === 'new';

        if (!addReviewModule.itemType) {
            common.showAlert('Please choose Food or Drink before submitting your review.', 'error');
            return;
        }

        var $selectedDish = $('#selected-dish-container .selected-dish');
        if (!$selectedDish.length) {
            common.showAlert('Please choose or add a ' + addReviewModule.itemNoun() + ' before submitting your review.', 'error');
            return;
        }
        var selectedDishId = $selectedDish.data('id');
        var isNewDish = selectedDishId === 'new';

        var data = {
            rating: $('#rating').val(),
            review: $('#review').val(),
            modifications: $('#modifications').val(),
            photos: [],
            itemType: addReviewModule.itemType || 'food',
            newRestaurant: isNewRestaurant,
            newDish: isNewDish
        };

        if (!isNewDish) {
            data.dishId = selectedDishId;
        } else {
            data.newDishData = {
                name: $selectedDish.data('name') || $selectedDish.find('.dish-name').text().trim(),
                itemType: addReviewModule.itemType || 'food',
                categories: $selectedDish.data('categories') || [],
                dishTypes: $selectedDish.data('dishTypes') || []
            };
        }

        if (!isNewRestaurant) {
            data.restaurantId = selectedRestaurantId;
        } else {
            data.newRestaurantData = {
                name: $selectedRestaurant.data('name') || '',
                address: $selectedRestaurant.data('address') || '',
                city: $selectedRestaurant.data('city') || '',
                state: $selectedRestaurant.data('state') || '',
                zip: $selectedRestaurant.data('zip') || ''
            };
        }

        addReviewModule.setSubmitState(true);
        try {
        var $photoWrappers = $('#photo-upload-preview .photo-preview-item');
        if ($photoWrappers.length) {
            for (var i = 0; i < $photoWrappers.length; i++) {
                var $photoWrapper = $($photoWrappers[i]);
                var originalFile = $photoWrapper.data('file');
                var rotationDegrees = $photoWrapper.data('rotation') || 0;
                var uploadedPhoto = $photoWrapper.data('uploadedPhoto');
                if (!uploadedPhoto || $photoWrapper.data('uploadedRotation') !== rotationDegrees) {
                    var compressedImage = await addReviewModule.compressImage(originalFile, rotationDegrees);
                    uploadedPhoto = await addReviewModule.uploadPhoto(compressedImage);
                    if (!uploadedPhoto || !uploadedPhoto.fileId) throw new Error('A photo could not be uploaded. Please retry or remove that photo.');
                    $photoWrapper.data('uploadedPhoto', uploadedPhoto).data('uploadedRotation', rotationDegrees);
                }
                if (uploadedPhoto && uploadedPhoto.fileId) {
                    data.photos.push(uploadedPhoto.fileId);
                }
            }
        }

        data.photos = JSON.stringify(data.photos);

            var response = await common.secureAjax({
                url: '/api/reviews',
                method: 'POST',
                data: data,
                dataType: 'json'
            });
            if (response.success) {
                var favDishId = (isNewDish && response.data && response.data.dishId) ? response.data.dishId : selectedDishId;
                if ($('#add-to-favorites').prop('checked') && favDishId && favDishId !== 'new') {
                    try { await common.secureAjax({ url: '/api/users/me/favorites/' + encodeURIComponent(favDishId), method: 'PUT' }); }
                    catch (e) { common.showAlert('Your review was saved, but the favorite could not be saved. You can favorite the dish from its page.', 'warning'); }
                }
                common.showAlert(
                    response.message || 'Review submitted successfully!',
                    response.data && response.data.heldForSoftLaunch ? 'warning' : 'success'
                );
                $('#add-review-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                addReviewModule.resetAll();
            } else {
                common.showAlert(response.message || 'Failed to submit review.', 'error');
            }
        } catch (err) {
            var message = (err.responseJSON && err.responseJSON.message) || err.message || 'Failed to submit review. Please try again.';
            common.showAlert(message, 'error');
        } finally {
            addReviewModule.setSubmitState(false);
        }
    },
    uploadPhoto: async function(file) {
        var formData = new FormData();
        formData.append('file', file);

        try {
            var response = await common.secureAjax({
                url: '/api/files',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false
            });
            return response.data;
        } catch (err) {
            var message = (err.responseJSON && err.responseJSON.message) || 'Failed to upload photo. Please try again.';
            common.showAlert(message, 'error');
            return null;
        }
    },
    compressImage: async function(file, rotationDegrees) {
        var options = {
            maxSizeMB: 2,
            maxWidthOrHeight: 1920,
            fileType: 'image/jpeg',
            useWebWorker: true
        };

        var compressedFile = await imageCompression(file, options);
        compressedFile = await addReviewModule.rotateImageFile(compressedFile, rotationDegrees || 0);
        compressedFile.originalName = file.name;

        return compressedFile;
    },
    rotateImageFile: async function(file, rotationDegrees) {
        if (!rotationDegrees) {
            return file;
        }

        var rotation = ((rotationDegrees % 360) + 360) % 360;
        if (!rotation) {
            return file;
        }

        var dataUrl = await new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        var image = await new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() { resolve(img); };
            img.onerror = reject;
            img.src = dataUrl;
        });

        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');
        var swapDimensions = rotation === 90 || rotation === 270;
        canvas.width = swapDimensions ? image.height : image.width;
        canvas.height = swapDimensions ? image.width : image.height;

        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(rotation * Math.PI / 180);
        context.drawImage(image, -image.width / 2, -image.height / 2);

        var mimeType = file.type || 'image/jpeg';
        var blob = await new Promise(function(resolve, reject) {
            canvas.toBlob(function(result) {
                if (!result) {
                    reject(new Error('Failed to rotate image.'));
                    return;
                }
                resolve(result);
            }, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
        });

        return new File([blob], file.name || 'image', {
            type: blob.type || mimeType,
            lastModified: Date.now()
        });
    },
    adjustPhotoRotation: function(e) {
        var $button = $(e.currentTarget);
        var delta = parseInt($button.data('rotationDelta'), 10) || 0;
        var $photoWrapper = $button.closest('.photo-preview-item');
        var rotation = ($photoWrapper.data('rotation') || 0) + delta;
        rotation = ((rotation % 360) + 360) % 360;
        $photoWrapper.data('rotation', rotation);
        addReviewModule.applyPreviewRotation($photoWrapper);
    },
    applyPreviewRotation: function($photoWrapper) {
        var rotation = $photoWrapper.data('rotation') || 0;
        $photoWrapper.find('.photo-preview-image').css('transform', 'rotate(' + rotation + 'deg)');
    },
    triggerPhotoUpload: function() {
        $('#photo-upload').click();
    },
    previewPhotos: function() {
        var $previewContainer = $('#photo-upload-preview');
        var files = this.files;
        if (!files.length) return;
        Array.from(files).forEach(function(file) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var $photoWrapper = $('<div>').addClass('photo-preview-item');
                var $previewFrame = $('<div>').addClass('photo-preview-frame');
                var $img = $('<img>').addClass('photo-preview-image').attr('src', e.target.result);
                var $controls = $('<div>').addClass('photo-preview-controls');
                var $rotateLeftBtn = $('<button>')
                    .attr('type', 'button')
                    .addClass('photo-rotate-btn')
                    .attr('aria-label', 'Rotate photo left')
                    .attr('title', 'Rotate left')
                    .data('rotationDelta', -90)
                    .text('↺');
                var $rotateRightBtn = $('<button>')
                    .attr('type', 'button')
                    .addClass('photo-rotate-btn')
                    .attr('aria-label', 'Rotate photo right')
                    .attr('title', 'Rotate right')
                    .data('rotationDelta', 90)
                    .text('↻');
                var $removeBtn = $('<button>')
                    .attr('type', 'button')
                    .addClass('remove-photo-btn')
                    .html('&times;')
                    .attr('aria-label', 'Remove photo');
                $photoWrapper.data('file', file);
                $photoWrapper.data('rotation', 0);
                $controls.append($rotateLeftBtn).append($rotateRightBtn);
                $previewFrame.append($img);
                $photoWrapper.append($previewFrame).append($controls).append($removeBtn);
                addReviewModule.applyPreviewRotation($photoWrapper);
                $previewContainer.append($photoWrapper);
            };
            reader.readAsDataURL(file);
        });
    },
    removePhoto: function(e) {
        $(e.currentTarget).closest('.photo-preview-item').remove();
    },
    selectRestaurant: async function(e) {
        var $selectedRestaurant = $(e.currentTarget);
        addReviewModule.setSelectedRestaurant({
            restaurantId: $selectedRestaurant.data('id'),
            name: $selectedRestaurant.data('name') || $selectedRestaurant.find('.restaurant-name').text(),
            address: $selectedRestaurant.data('address') || '',
            city: $selectedRestaurant.data('city') || '',
            state: $selectedRestaurant.data('state') || '',
            zip: $selectedRestaurant.data('zip') || ''
        });
    },
    cancelRestaurantSelection: function() {
        $('#selected-restaurant-container').empty();
        $('#restaurant-search-section').removeClass('hidden');
        addReviewModule.populateRestaurantList(addReviewModule.restaurants);
        $('#review-type-section').addClass('hidden');
        $('.review-type-option').removeClass('active').attr('aria-pressed', 'false');
        addReviewModule.itemType = null;
        $('#add-review-modal h2').text('Add a Review');
        $('#dish-list').empty();
        $('#selected-dish-container').empty();
        $('#dish-search-section').addClass('hidden');
        $('#add-dish-section').addClass('hidden');
        addReviewModule.resetReviewSection();
    },
    selectDish: function(e) {
        var $selectedDish = $(e.currentTarget);
        var $selectedCard = $selectedDish.clone().addClass('selected-dish');
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-dish-selection-btn">Go Back</a>');
        $('#selected-dish-container').html($selectedCard);
        $('#dish-search-section').addClass('hidden');
        $('#selected-restaurant-container #cancel-selection-btn').addClass('hidden'); // Hide the restaurant's "Go Back" button
        $('#review-section').removeClass('hidden'); // Show the review form
    },
    cancelDishSelection: function() {
        $('#selected-dish-container').empty();
        $('#dish-search-section').removeClass('hidden');
        $('#selected-restaurant-container #cancel-selection-btn').removeClass('hidden'); // Re-show the restaurant's "Go Back" button
        addReviewModule.resetReviewSection();
    },
    restaurantSearch: async function() {
        var prefix = $('#restaurant-search').val();
        addReviewModule.loadRestaurants(addReviewModule.lat, addReviewModule.lng, prefix);
    },
    dishSearch: function() {
        var searchTerm = $('#dish-search').val() || '';
        addReviewModule.renderDishResults(searchTerm);
    },
    debounce: function(func, delay) {
        var timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    },
    getRestaurantCard: function(restaurant) {
        var city = restaurant.city || restaurant.cityName || '';
        var $card = $('<button type="button" class="restaurant-item card">').attr({
            'data-id': restaurant.restaurantId, 'data-name': restaurant.name || '',
            'data-address': restaurant.address || '', 'data-city': city,
            'data-state': restaurant.state || '', 'data-zip': restaurant.zip || '',
            'data-status': restaurant.status || ''
        });
        $card.append($('<span class="restaurant-name">').text(restaurant.name));
        if (restaurant.address) $card.append($('<span class="restaurant-address">').text(restaurant.address));
        var cityLine = [city, restaurant.state, restaurant.zip].filter(Boolean).join(', ');
        if (cityLine) $card.append($('<span class="restaurant-city">').text(cityLine));
        if (['pending', 'needs_review'].includes(restaurant.status)) {
            $card.append($('<span class="submission-status">').text('Awaiting approval · You can add a dish here'));
        }
        return $card;
    },
    getDishCard: function(dish) {
        var $card = $('<button type="button" class="dish-item card">').attr('data-id', dish.dishId)
            .append($('<span class="dish-name">').text(dish.name));
        if (['pending', 'needs_review'].includes(dish.status)) {
            $card.append($('<span class="submission-status">').text('Awaiting approval · You can review this item'));
        }
        return $card;
    },
    renderRestaurantList: function(restaurants) {
        addReviewModule.populateRestaurantList(restaurants);
    },

    showAddRestaurantForm: function() {
        $('#add-restaurant-section').removeClass('hidden');
        $('#restaurant-list').addClass('hidden');
        var searchVal = $('#restaurant-search').val() || '';
        $('#restaurant-search').closest('.form-row').addClass('hidden');
        if (searchVal.trim() && !$('#new-restaurant-name').val().trim()) {
            $('#new-restaurant-name').val(searchVal.trim());
        }
    },

    cancelAddRestaurant: function() {
        $('#add-restaurant-section').addClass('hidden');
        $('#restaurant-list').removeClass('hidden');
        $('#restaurant-search').closest('.form-row').removeClass('hidden');
        $('#new-restaurant-name').val('');
        $('#new-restaurant-address').val('');
        $('#new-restaurant-zip').val('');
        $('#new-restaurant-city').val('');
        $('#new-restaurant-state').val('');
        addReviewModule.populateRestaurantList(addReviewModule.restaurants);
    },

    saveRestaurant: async function() {
        var name = $('#new-restaurant-name').val().trim();
        var address = $('#new-restaurant-address').val().trim();
        var city = $('#new-restaurant-city').val().trim();
        var state = $('#new-restaurant-state').val().trim();
        var zip = $('#new-restaurant-zip').val().trim();

        if (!name) {
            common.showAlert('Please provide the restaurant name', 'error');
            return;
        }

        var restaurant = {
            restaurantId: 'new',
            name: name,
            address: address,
            city: city,
            state: state,
            zip: zip
        };

        addReviewModule.setSelectedRestaurant(restaurant);
        addReviewModule.cancelAddRestaurant();
    },

    showAddDishForm: function() {
        if (!addReviewModule.itemType) {
            common.showAlert('Please choose Food or Drink first.', 'error');
            return;
        }
        var searchVal = ($('#dish-search').val() || '').trim();
        $('#new-dish-name').val(searchVal);
        $('#add-dish-section').removeClass('hidden');
        $('#dish-search-section').addClass('hidden');
        if (addReviewModule.itemType === 'drink') {
            addReviewModule.renderDrinkStyleOptions();
        } else {
            $('#drink-style-section').addClass('hidden');
        }
    },

    cancelAddDish: function() {
        $('#add-dish-section').addClass('hidden');
        $('#dish-search-section').removeClass('hidden');
        $('#new-dish-name').val('');
        $('#drink-style-section .metadata-chip').removeClass('active').attr('aria-pressed', 'false');
        addReviewModule.renderDishResults($('#dish-search').val() || '');
    },

    saveDish: async function() {
        var name = $('#new-dish-name').val().trim();
        if (!name) {
            common.showAlert('Please provide a dish name', 'error');
            return;
        }
        var dish = {
            dishId: 'new',
            name: name,
            itemType: addReviewModule.itemType || 'food',
            categories: addReviewModule.getSelectedMetadataIds('#drink-category-options'),
            dishTypes: addReviewModule.getSelectedMetadataIds('#drink-type-options')
        };
        addReviewModule.dishes.push(dish);
        addReviewModule.setSelectedDish(dish);
        $('#add-dish-section').addClass('hidden');
    },

    loadMetadataOptions: async function() {
        if (addReviewModule.metadataOptions) {
            return addReviewModule.metadataOptions;
        }
        var response = await $.get('/api/dishes/metadata/options');
        addReviewModule.metadataOptions = response.data || { categories: [], dishTypes: [], tags: [] };
        return addReviewModule.metadataOptions;
    },

    renderDrinkStyleOptions: async function() {
        $('#drink-style-section').removeClass('hidden');
        addReviewModule.renderLoading($('#drink-category-options'), 'Loading categories...');
        addReviewModule.renderLoading($('#drink-type-options'), 'Loading styles...');
        try {
            var options = await addReviewModule.loadMetadataOptions();
            addReviewModule.renderMetadataChips('#drink-category-options', options.categories || [], 'categoryId', 'category', addReviewModule.drinkCategoryLabels);
            addReviewModule.renderMetadataChips('#drink-type-options', options.dishTypes || [], 'dishTypeId', 'dishType', addReviewModule.drinkTypeLabels);
        } catch (err) {
            $('#drink-category-options').empty();
            $('#drink-type-options').empty();
        }
    },

    renderMetadataChips: function(selector, rows, idKey, labelKey, allowedLabels) {
        var allowed = {};
        allowedLabels.forEach(function(label) {
            allowed[label.toLowerCase()] = true;
        });
        var filtered = rows.filter(function(row) {
            return allowed[String(row[labelKey] || '').toLowerCase()];
        });
        var html = filtered.map(function(row) {
            return '<button type="button" class="metadata-chip" data-id="' + row[idKey] + '" aria-pressed="false">' + row[labelKey] + '</button>';
        }).join('');
        $(selector).html(html || '<div class="metadata-chip-empty">No drink options yet</div>');
    },

    toggleMetadataChip: function(e) {
        var $chip = $(e.currentTarget);
        var active = !$chip.hasClass('active');
        $chip.toggleClass('active', active).attr('aria-pressed', active ? 'true' : 'false');
    },

    getSelectedMetadataIds: function(selector) {
        var ids = [];
        $(selector + ' .metadata-chip.active').each(function() {
            var id = parseInt($(this).data('id'), 10);
            if (!isNaN(id)) {
                ids.push(id);
            }
        });
        return ids;
    },

    loadDishesForSelectedRestaurant: async function() {
        var $selectedRestaurant = $('#selected-restaurant-container .selected-restaurant');
        if (!$selectedRestaurant.length || !addReviewModule.itemType) {
            return;
        }

        var restaurantId = $selectedRestaurant.data('id');
        addReviewModule.renderLoading($('#dish-list'), 'Loading ' + addReviewModule.itemPlural() + '...');
        if (restaurantId === 'new') {
            addReviewModule.populateDishList([]);
            $('#dish-search-section').removeClass('hidden');
            return;
        }

        try {
            var response = await $.get('/api/dishes', { restaurantId: restaurantId, itemType: addReviewModule.itemType, forSubmission: 1, pageSize: 100 });
            addReviewModule.populateDishList(response.data || []);
        } catch (err) {
            addReviewModule.renderEmptyState($('#dish-list'), 'We ran into a problem loading ' + addReviewModule.itemPlural() + '.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New ' + addReviewModule.itemNounTitle() + '</a>');
        }
        $('#dish-search-section').removeClass('hidden');
    },

    setSelectedRestaurant: function(restaurant, options) {
        options = options || {};
        var addressLine = restaurant.address || '';
        var cityLine = '';
        if (restaurant.city || restaurant.state || restaurant.zip) {
            cityLine = [
                restaurant.city || '',
                restaurant.state || '',
                restaurant.zip || ''
            ].filter(Boolean).join(', ');
        }
        var $source = addReviewModule.getRestaurantCard(restaurant);
        var $selectedCard = $('<div class="restaurant-item card selected-restaurant">');
        Array.from($source[0].attributes).forEach(function(attr) {
            if (attr.name.indexOf('data-') === 0) $selectedCard.attr(attr.name, attr.value);
        });
        $selectedCard.append($source.contents());
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-selection-btn">Go Back</a>');
        $('#selected-restaurant-container').html($selectedCard);
        $('#restaurant-search-section').addClass('hidden');
        $('#review-type-section').removeClass('hidden');
        addReviewModule.clearItemState();
        if (options.preserveItemType && addReviewModule.itemType) {
            $('.review-type-option').removeClass('active').attr('aria-pressed', 'false');
            $('.review-type-option[data-item-type="' + addReviewModule.itemType + '"]').addClass('active').attr('aria-pressed', 'true');
            addReviewModule.updateItemLabels();
        } else {
            addReviewModule.itemType = null;
            $('.review-type-option').removeClass('active').attr('aria-pressed', 'false');
            $('#add-review-modal h2').text('Add a Review');
        }
    },

    setSelectedDish: function(dish) {
        var $selectedCard = $('<div class="dish-item card selected-dish">')
            .attr({ 'data-id': dish.dishId, 'data-name': dish.name || '' })
            .append($('<div class="dish-name">').text(dish.name));
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-dish-selection-btn">Go Back</a>');
        $('#selected-dish-container').html($selectedCard);
        $('#dish-search-section').addClass('hidden');
        $('#selected-restaurant-container #cancel-selection-btn').addClass('hidden');
        $('#review-section').removeClass('hidden');
        $('#rating').focus();
    },

    renderDishList: function(dishes) {
        addReviewModule.populateDishList(dishes);
    },
    loadRestaurants: async function(lat, lng, prefix) {
        var requestId = ++addReviewModule.restaurantRequest;
        var $list = $('#restaurant-list');
        addReviewModule.renderLoading($list, prefix ? 'Searching for matching restaurants…' : 'Finding restaurants near you…');
        var fields = ['restaurantId', 'name', 'address', 'city', 'state', 'zip'];
        var query = {
            useLocation: 1,
            forSubmission: 1,
            pageSize: 100,
            fields: JSON.stringify(fields)
        };
        if (lat && lng) {
            query.lat = lat;
            query.lng = lng;
        }
        if (prefix) {
            query.prefix = prefix;
        }
        try {
            var response = await $.ajax({
                url: '/api/restaurants',
                dataType: 'json',
                data: query
            });
            if (requestId !== addReviewModule.restaurantRequest) return;
            addReviewModule.renderRestaurantList(response.data || []);
        } catch (err) {
            if (requestId !== addReviewModule.restaurantRequest) return;
            addReviewModule.renderEmptyState($list, 'Unable to load restaurants right now.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-restaurant-btn">Add a Restaurant</a>');
        }
    }
};

function initializeAddReview() {
    addReviewModule.setHandlers();
    $("#add-review-modal").show();

    // Check for preselection (set by dish page before opening modal)
    var preselect = window._addReviewPreselect;
    if (preselect) {
        delete window._addReviewPreselect;
        (async function() {
            addReviewModule.itemType = preselect.dish && preselect.dish.itemType === 'drink' ? 'drink' : 'food';
            addReviewModule.setSelectedRestaurant(preselect.restaurant, { preserveItemType: true });
            await addReviewModule.loadDishesForSelectedRestaurant();
            addReviewModule.setSelectedDish(preselect.dish);
        })();
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            addReviewModule.lat = position.coords.latitude;
            addReviewModule.lng = position.coords.longitude;
            addReviewModule.loadRestaurants(addReviewModule.lat, addReviewModule.lng);
        }, function() {
            addReviewModule.loadRestaurants();
        }, { timeout: 6000, maximumAge: 300000 });
    } else {
        addReviewModule.loadRestaurants();
    }
}

$(document).ready(function() {
    initializeAddReview();
});

$(document).on('click', '.photo-rotate-btn', addReviewModule.adjustPhotoRotation);

window.addReviewModule = addReviewModule;

//# sourceURL=add-review.js
