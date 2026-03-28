var addReviewModule = {
    lat: null,
    lng: null,
    restaurants: [],
    dishes: [],
    isSubmitting: false,
    setHandlers: function() {
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
            addReviewModule.renderEmptyState($list, 'This restaurant does not have any dishes yet.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>');
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
            addReviewModule.renderEmptyState($list, 'No dishes matched your search.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>');
            return;
        }

        filtered.forEach(function(d) {
            $list.append(addReviewModule.getDishCard(d));
        });

        $list.append(
            '<div class="list-footer">' +
                '<div>Can\'t find the dish you\'re looking for?</div>' +
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>' +
            '</div>'
        );
    },
    setSubmitState: function(isSubmitting) {
        addReviewModule.isSubmitting = !!isSubmitting;
        $('#submit-review').prop('disabled', addReviewModule.isSubmitting)
            .toggleClass('is-loading', addReviewModule.isSubmitting)
            .text(addReviewModule.isSubmitting ? 'Submitting…' : 'Submit Review');
    },
    resetReviewSection: function() {
        $('#review-section').addClass('hidden');
        $('#rating').val('');
        $('#review').val('');
        $('#modifications').val('');
        $('#photo-upload').val('');
        $('#photo-upload-preview').empty();
        addReviewModule.setSubmitState(false);
    },
    resetAll: function() {
        addReviewModule.resetReviewSection();
        $('#selected-restaurant-container').empty();
        $('#selected-dish-container').empty();
        $('#restaurant-search').val('');
        $('#dish-search').val('');
        $('#restaurant-search-section').removeClass('hidden');
        $('#dish-search-section').addClass('hidden');
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
        var form = $('#add-review-form')[0];
        if (!validate.validateForm(form)) return;

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

        var $selectedDish = $('#selected-dish-container .selected-dish');
        if (!$selectedDish.length) {
            common.showAlert('Please choose or add a dish before submitting your review.', 'error');
            return;
        }
        var selectedDishId = $selectedDish.data('id');
        var isNewDish = selectedDishId === 'new';

        var data = {
            rating: $('#rating').val(),
            review: $('#review').val(),
            modifications: $('#modifications').val(),
            photos: [],
            newRestaurant: isNewRestaurant,
            newDish: isNewDish
        };

        if (!isNewDish) {
            data.dishId = selectedDishId;
        } else {
            data.newDishData = {
                name: $selectedDish.data('name') || $selectedDish.find('.dish-name').text().trim()
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
        var $images = $('#photo-upload-preview img');
        if ($images.length) {
            for (var i = 0; i < $images.length; i++) {
                var compressedImage = await addReviewModule.compressImage($images[i]);
                var uploadedPhoto = await addReviewModule.uploadPhoto(compressedImage);
                if (uploadedPhoto && uploadedPhoto.fileId) {
                    data.photos.push(uploadedPhoto.fileId);
                }
            }
        }

        data.photos = JSON.stringify(data.photos);

        try {
            var response = await $.ajax({
                url: '/api/reviews',
                method: 'POST',
                data: data,
                dataType: 'json'
            });
            if (response.success) {
                common.showAlert('Review submitted successfully!', 'success');
                $('#add-review-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                addReviewModule.resetAll();
            } else {
                common.showAlert(response.message || 'Failed to submit review.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to submit review. Please try again.', 'error');
        } finally {
            addReviewModule.setSubmitState(false);
        }
    },
    uploadPhoto: async function(file) {
        var formData = new FormData();
        formData.append('file', file);

        try {
            var response = await $.ajax({
                url: '/api/files/upload',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false
            });
            return response.data;
        } catch (err) {
            common.showAlert('Failed to upload photo. Please try again.', 'error');
            return null;
        }
    },
    compressImage: async function(imageElement) {
        var options = {
            maxSizeMB: 2, // Maximum file size in MB
            maxWidthOrHeight: 1920, // Maximum width or height
            useWebWorker: true // Use web workers for better performance
        };

        var file = await fetch(imageElement.src)
            .then(res => res.blob())
            .then(blob => new File([blob], 'image.jpg', { type: blob.type }));

        var compressedFile = await imageCompression(file, options);
        compressedFile.originalName = file.name;

        return compressedFile;
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
                var $photoWrapper = $('<div>').css({
                    position: 'relative',
                    display: 'inline-block',
                    marginRight: '8px'
                });
                var $img = $('<img>').attr('src', e.target.result).css({
                    width: '80px',
                    height: '80px',
                    borderRadius: '4px',
                    objectFit: 'cover',
                    border: '1px solid #d1d5db'
                });
                var $removeBtn = $('<button>')
                    .addClass('remove-photo-btn')
                    .html('&times;')
                    .css({
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: '#6b7280',
                        color: '#fff',
                        border: 'none',
                        fontSize: '14px',
                        cursor: 'pointer'
                    });
                $photoWrapper.append($img).append($removeBtn);
                $previewContainer.append($photoWrapper);
            };
            reader.readAsDataURL(file);
        });
    },
    removePhoto: function(e) {
        $(e.currentTarget).closest('div').remove();
    },
    selectRestaurant: async function(e) {
        var $selectedRestaurant = $(e.currentTarget);
        var restaurantId = $selectedRestaurant.data('id');

        $('#restaurant-search-section').addClass('hidden');

        var $selectedCard = $selectedRestaurant.clone().addClass('selected-restaurant');
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-selection-btn">Go Back</a>');
        $('#selected-restaurant-container').html($selectedCard);

        addReviewModule.renderLoading($('#dish-list'), 'Loading dishes...');
        try {
            var response = await $.get('/api/dishes', { restaurantId: restaurantId });
            addReviewModule.populateDishList(response.data || []);
        } catch (err) {
            addReviewModule.renderEmptyState($('#dish-list'), 'We ran into a problem loading dishes.',
                '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>');
        }
        $('#dish-search-section').removeClass('hidden');
    },
    cancelRestaurantSelection: function() {
        $('#selected-restaurant-container').empty();
        $('#restaurant-search-section').removeClass('hidden');
        addReviewModule.populateRestaurantList(addReviewModule.restaurants);
        $('#dish-list').empty();
        $('#selected-dish-container').empty();
        $('#dish-search-section').addClass('hidden');
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
        var cityParts = [];
        if (restaurant.city) cityParts.push(restaurant.city);
        if (restaurant.state) cityParts.push(restaurant.state);
        if (restaurant.zip) cityParts.push(restaurant.zip);
        var cityLine = cityParts.join(', ');
        return `
            <div class="restaurant-item card" data-id="${restaurant.restaurantId}" data-name="${restaurant.name}" data-address="${restaurant.address || ''}" data-city="${restaurant.city || ''}" data-state="${restaurant.state || ''}" data-zip="${restaurant.zip || ''}">
                <div class="restaurant-name">${restaurant.name}</div>
                ${restaurant.address ? `<div class="restaurant-address">${restaurant.address}</div>` : ''}
                ${cityLine ? `<div class="restaurant-city">${cityLine}</div>` : ''}
            </div>
        `;
    },
    getDishCard: function(dish) {
        return `
            <div class="dish-item card" data-id="${dish.dishId}">
                <div class="dish-name">${dish.name}</div>
            </div>
        `;
    },
    renderRestaurantList: function(restaurants) {
        addReviewModule.populateRestaurantList(restaurants);
    },

    showAddRestaurantForm: function() {
        $('#add-restaurant-section').removeClass('hidden');
        $('#restaurant-list').addClass('hidden');
        $('#restaurant-search').closest('.form-row').addClass('hidden');
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
        $('#add-dish-section').removeClass('hidden');
        $('#dish-search-section').addClass('hidden');
    },

    cancelAddDish: function() {
        $('#add-dish-section').addClass('hidden');
        $('#dish-search-section').removeClass('hidden');
        $('#new-dish-name').val('');
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
            name: name
        };
        addReviewModule.dishes.push(dish);
        addReviewModule.setSelectedDish(dish);
        $('#add-dish-section').addClass('hidden');
    },

    setSelectedRestaurant: function(restaurant) {
        var addressLine = restaurant.address || '';
        var cityLine = '';
        if (restaurant.city || restaurant.state || restaurant.zip) {
            cityLine = [
                restaurant.city || '',
                restaurant.state || '',
                restaurant.zip || ''
            ].filter(Boolean).join(', ');
        }
        var $selectedCard = $(
            `<div class="restaurant-item card selected-restaurant"
                  data-id="${restaurant.restaurantId}"
                  data-name="${restaurant.name || ''}"
                  data-address="${restaurant.address || ''}"
                  data-city="${restaurant.city || ''}"
                  data-state="${restaurant.state || ''}"
                  data-zip="${restaurant.zip || ''}">
                <div class="restaurant-name">${restaurant.name}</div>
                ${addressLine ? `<div class="restaurant-address">${addressLine}</div>` : ''}
                ${cityLine ? `<div class="restaurant-city">${cityLine}</div>` : ''}
            </div>`
        );
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-selection-btn">Go Back</a>');
        $('#selected-restaurant-container').html($selectedCard);
        $('#restaurant-search-section').addClass('hidden');
        if (restaurant.restaurantId !== 'new') {
            (async function() {
                addReviewModule.renderLoading($('#dish-list'), 'Loading dishes...');
                try {
                    var res = await $.get('/api/dishes', { restaurantId: restaurant.restaurantId });
                    addReviewModule.populateDishList(res.data || []);
                } catch (err) {
                    addReviewModule.renderEmptyState($('#dish-list'), 'We ran into a problem loading dishes.',
                        '<a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>');
                }
                $('#dish-search-section').removeClass('hidden');
            })();
        } else {
            addReviewModule.populateDishList([]);
            $('#dish-search-section').removeClass('hidden');
        }
    },

    setSelectedDish: function(dish) {
        var $selectedCard = $(
            `<div class="dish-item card selected-dish" data-id="${dish.dishId}" data-name="${dish.name || ''}">
                <div class="dish-name">${dish.name}</div>
            </div>`
        );
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
        var $list = $('#restaurant-list');
        addReviewModule.renderLoading($list, prefix ? 'Searching for matching restaurants…' : 'Finding restaurants near you…');
        var fields = ['restaurantId', 'name', 'address', 'city', 'state', 'zip'];
        var query = {
            useLocation: 1,
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
            addReviewModule.renderRestaurantList(response.data || []);
        } catch (err) {
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
        addReviewModule.setSelectedRestaurant(preselect.restaurant);
        // Wait for dishes to load, then select the dish
        var checkInterval = setInterval(function() {
            var dishLoaded = addReviewModule.dishes.some(function(d) {
                return d.dishId === preselect.dish.dishId;
            });
            if (dishLoaded || addReviewModule.dishes.length > 0 || $('#dish-list .empty-state').length) {
                clearInterval(checkInterval);
                addReviewModule.setSelectedDish(preselect.dish);
            }
        }, 100);
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            addReviewModule.lat = position.coords.latitude;
            addReviewModule.lng = position.coords.longitude;
            addReviewModule.loadRestaurants(addReviewModule.lat, addReviewModule.lng);
        }, function() {
            addReviewModule.loadRestaurants();
        });
    } else {
        addReviewModule.loadRestaurants();
    }
}

$(document).ready(function() {
    initializeAddReview();
});

window.addReviewModule = addReviewModule;

//# sourceURL=add-review.js