var addReviewModule = {
    lat: null,
    lng: null,
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
    handleSubmit: async function(e) {
        e.preventDefault();
        var form = $('#add-review-form')[0];
        if (!validate.validateForm(form)) return;

        var $selectedRestaurant = $('#selected-restaurant-container .selected-restaurant');
        var selectedRestaurantId = $selectedRestaurant.data('id');
        var isNewRestaurant = selectedRestaurantId === 'new';

        var $selectedDish = $('#selected-dish-container .selected-dish');
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
            } else {
                common.showAlert(response.message || 'Failed to submit review.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to submit review. Please try again.', 'error');
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

        var response = await $.get('/api/dishes', { restaurantId: restaurantId });
        addReviewModule.renderDishList(response.data || []);
        $('#dish-search-section').removeClass('hidden');
    },
    cancelRestaurantSelection: function() {
        $('#selected-restaurant-container').empty();
        $('#restaurant-search-section').removeClass('hidden');
        $('#dish-list').empty();
        $('#selected-dish-container').empty();
        $('#dish-search-section').addClass('hidden');
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
        $('#review-section').addClass('hidden'); // Hide the review form
    },
    restaurantSearch: async function() {
        var prefix = $('#restaurant-search').val();
        addReviewModule.loadRestaurants(addReviewModule.lat, addReviewModule.lng, prefix);
    },
    dishSearch: function() {
        var searchTerm = $('#dish-search').val().toLowerCase();
        var $dishes = $('#dish-list .dish-item');
        var hasMatches = false;

        $dishes.each(function() {
            var $dish = $(this);
            var dishName = $dish.find('.dish-name').text().toLowerCase();
            if (dishName.includes(searchTerm)) {
                $dish.removeClass('hidden'); // Use removeClass('hidden') instead of .show()
                hasMatches = true;
            } else {
                $dish.addClass('hidden'); // Use addClass('hidden') instead of .hide()
            }
        });

        if (!hasMatches) {
            $('#dish-list').html(`
                <div style="padding:8px;text-align:center;">
                    <div style="margin-bottom:0.5rem;">No dishes found.</div>
                    <a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>
                </div>
            `);
        }
    },
    debounce: function(func, delay) {
        var timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    },
    getRestaurantCard: function(restaurant) {
        return `
            <div class="restaurant-item card" data-id="${restaurant.restaurantId}" data-name="${restaurant.name}" data-address="${restaurant.address}" data-zip="${restaurant.zip}">
                <div class="restaurant-name">${restaurant.name}</div>
                <div class="restaurant-address">${restaurant.address || ''}${restaurant.zip ? ', ' + restaurant.zip : ''}</div>
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
        var $list = $('#restaurant-list');
        $list.empty();

        restaurants.forEach(function(r) {
            $list.append(addReviewModule.getRestaurantCard(r));
        });

        $list.append(`
            <div style="padding:8px;text-align:center;">
                <div style="margin-bottom:0.5rem;">Can't find the restaurant you're looking for?</div>
                <a href="javascript:void(0)" class="btn btn-turquoise" id="add-restaurant-btn">Add a Restaurant</a>
            </div>
        `);
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
    },

    saveRestaurant: async function() {
        var name = $('#new-restaurant-name').val().trim();
        var address = $('#new-restaurant-address').val().trim();
        var city = $('#new-restaurant-city').val().trim();
        var state = $('#new-restaurant-state').val().trim();
        var zip = $('#new-restaurant-zip').val().trim();

        if (!name || !address) {
            common.showAlert('Please provide restaurant name and address', 'error');
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
                <div class="restaurant-address">${addressLine}</div>
                ${cityLine ? `<div class="restaurant-city">${cityLine}</div>` : ''}
            </div>`
        );
        $selectedCard.append('<a href="javascript:void(0)" class="btn btn-gray cancel-btn" id="cancel-selection-btn">Go Back</a>');
        $('#selected-restaurant-container').html($selectedCard);
        $('#restaurant-search-section').addClass('hidden');
        if (restaurant.restaurantId !== 'new') {
            (async function() {
                var res = await $.get('/api/dishes', { restaurantId: restaurant.restaurantId });
                addReviewModule.renderDishList(res.data || []);
                $('#dish-search-section').removeClass('hidden');
            })();
        } else {
            $('#dish-list').empty();
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
    },

    renderDishList: function(dishes) {
        var $list = $('#dish-list');
        $list.empty();
        dishes.forEach(function(d) {
            $list.append(addReviewModule.getDishCard(d));
        });
        $list.append(`
            <div style="padding:8px;text-align:center;">
                <div style="margin-bottom:0.5rem;">Can't find the dish you're looking for?</div>
                <a href="javascript:void(0)" class="btn btn-turquoise" id="add-dish-btn">Add a New Dish</a>
            </div>
        `);
    },
    loadRestaurants: async function(lat, lng, prefix) {
        var query = {
            useLocation: 1,
            fields: ['restaurantId', 'name', 'address', 'zip']
        };
        if (lat && lng) {
            query.lat = lat;
            query.lng = lng;
        }
        if (prefix) {
            query.prefix = prefix;
        }
        var response = await $.ajax({
            url: '/api/restaurants',
            dataType: 'json',
            data: query
        });
        addReviewModule.renderRestaurantList(response.data || []);
    }
};

function initializeAddReview() {
    addReviewModule.setHandlers();
    $("#add-review-modal").show();
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