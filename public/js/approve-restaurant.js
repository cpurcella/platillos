var approveRestaurantModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approveRestaurantModule.loadRestaurant();
        });
        $(document).on('submit', '#approve-restaurant-form', approveRestaurantModule.handleSave);
    },
    loadRestaurant: async function() {
        var restaurantId = window.approveRestaurantId;
        if (!restaurantId) {
            $('#approve-restaurant-content').text('Missing restaurantId.');
            return;
        }

        try {
            var res = await $.get('/api/restaurants/' + encodeURIComponent(restaurantId));
            var restaurant = res && res.data ? res.data : null;
            if (!restaurant) {
                $('#approve-restaurant-content').text('Restaurant not found.');
                return;
            }

            $('#restaurant-name-input').val(restaurant.name || '');
            $('#restaurant-address-input').val(restaurant.address || '');
            $('#restaurant-city-input').val(restaurant.cityName || '');
            $('#restaurant-zip-input').val(restaurant.zip || '');
            $('#restaurant-lat-input').val(restaurant.lat != null ? restaurant.lat : '');
            $('#restaurant-lng-input').val(restaurant.lng != null ? restaurant.lng : '');

            var currentStatus = (restaurant.status || 'pending').toLowerCase();
            if (!['pending', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#restaurant-status-select').val(currentStatus);

            var submittedDate = restaurant.submitted ? new Date(restaurant.submitted).toLocaleString() : '';
            $('#restaurant-submitted').text(submittedDate || '');
        } catch (err) {
            $('#approve-restaurant-content').text('Failed to load restaurant.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        if (approveRestaurantModule.isSaving) {
            return;
        }

        var restaurantId = window.approveRestaurantId;
        if (!restaurantId) {
            common.showAlert('Missing restaurantId.', 'error');
            return;
        }

        var name = $('#restaurant-name-input').val() || '';
        var city = $('#restaurant-city-input').val() || '';
        if (!name.trim()) {
            common.showAlert('Name is required.', 'error');
            return;
        }
        if (!city.trim()) {
            common.showAlert('City is required.', 'error');
            return;
        }

        var payload = {
            name: name,
            address: $('#restaurant-address-input').val() || '',
            city: city,
            zip: $('#restaurant-zip-input').val() || '',
            status: $('#restaurant-status-select').val()
        };

        var latVal = $('#restaurant-lat-input').val();
        if (latVal !== undefined) {
            payload.lat = latVal;
        }
        var lngVal = $('#restaurant-lng-input').val();
        if (lngVal !== undefined) {
            payload.lng = lngVal;
        }

        var $btn = $('#save-restaurant-status-btn');
        var originalText = $btn.text();
        approveRestaurantModule.isSaving = true;
        $btn.prop('disabled', true).text('Saving...');

        try {
            var res = await $.ajax({
                url: '/api/restaurants/' + encodeURIComponent(restaurantId),
                method: 'PATCH',
                dataType: 'json',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify(payload)
            });
            if (res && res.success) {
                var message = (res && res.message) || 'Restaurant updated.';
                common.showAlert(message, 'success');
                $('#approve-restaurant-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initRestaurantsGrid) {
                    $('#restaurants-grid').empty();
                    approvalsModule.restaurantGrid = null;
                    approvalsModule.initRestaurantsGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update restaurant.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update restaurant.', 'error');
        } finally {
            approveRestaurantModule.isSaving = false;
            $btn.prop('disabled', false).text(originalText);
        }
    }
};

$(document).ready(function() {
    approveRestaurantModule.setHandlers();
});

window.approveRestaurantModule = approveRestaurantModule;

//# sourceURL=approve-restaurant.js
