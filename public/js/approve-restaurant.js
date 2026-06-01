var approveRestaurantModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approveRestaurantModule.loadRestaurant();
        });
        $(document).on('submit', '#approve-restaurant-form', approveRestaurantModule.handleSave);
        $(document).on('click', '#ai-evaluate-restaurant-btn', approveRestaurantModule.handleAiEvaluate);
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
            if (!['pending', 'needs_review', 'approved', 'rejected', 'out_of_area'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#restaurant-status-select').val(currentStatus);
            $('#ai-evaluate-restaurant-btn').toggle(currentStatus === 'pending');

            if (restaurant.aiReasoning) {
                $('#ai-restaurant-stored-reasoning-text').text(restaurant.aiReasoning);
                $('#ai-restaurant-stored-reasoning').show();
            } else {
                $('#ai-restaurant-stored-reasoning').hide();
            }

            var submittedDate = restaurant.submitted ? new Date(restaurant.submitted).toLocaleString() : '';
            $('#restaurant-submitted').text(submittedDate || '');

            var submitter = (restaurant.submitterFirstName || restaurant.submitterLastName)
                ? ((restaurant.submitterFirstName || '') + ' ' + (restaurant.submitterLastName || '')).trim()
                : (restaurant.submitterEmail || restaurant.submittedBy || '');
            $('#restaurant-submitter').text(submitter);
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

        var selectedStatus = $('#restaurant-status-select').val();
        if (selectedStatus === 'approved' || selectedStatus === 'rejected') {
            if (!confirm('Are you sure you want to mark this restaurant as ' + selectedStatus + '?')) {
                return;
            }
        }

        var payload = {
            name: name,
            address: $('#restaurant-address-input').val() || '',
            city: city,
            zip: $('#restaurant-zip-input').val() || '',
            status: selectedStatus
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
                if (window.approvalsModule) {
                    if (approvalsModule.restaurantGrid) {
                        approvalsModule.restaurantGrid.forceRender();
                    }
                    if (approvalsModule.loadPendingCounts) {
                        approvalsModule.loadPendingCounts();
                    }
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
    },
    handleAiEvaluate: async function() {
        var restaurantId = window.approveRestaurantId;
        if (!restaurantId) {
            common.showAlert('Missing restaurantId.', 'error');
            return;
        }
        var $btn = $('#ai-evaluate-restaurant-btn');
        var originalText = $btn.text();
        $btn.prop('disabled', true).text('Evaluating...');
        $('#ai-restaurant-result').hide();
        try {
            var res = await $.ajax({
                url: '/api/approvals/ai/restaurant/' + encodeURIComponent(restaurantId),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success && res.data) {
                var d = res.data;
                var verdictLabel = (d.verdict || 'unknown').replace('_', ' ');
                var confidence = d.confidence != null ? ' (' + Math.round(d.confidence * 100) + '% confidence)' : '';
                $('#ai-restaurant-verdict').text(verdictLabel.charAt(0).toUpperCase() + verdictLabel.slice(1) + confidence);
                $('#ai-restaurant-reasoning').text(d.reasoning || '');
                $('#ai-restaurant-result').show();
                if (d.verdict === 'approve') {
                    $('#restaurant-status-select').val('approved');
                } else if (d.verdict === 'reject') {
                    $('#restaurant-status-select').val('rejected');
                }
                if (d.verifiedName) {
                    $('#restaurant-name-input').val(d.verifiedName);
                }
                if (d.verifiedAddress) {
                    if (d.verifiedAddress.street) $('#restaurant-address-input').val(d.verifiedAddress.street);
                    if (d.verifiedAddress.city) $('#restaurant-city-input').val(d.verifiedAddress.city);
                    if (d.verifiedAddress.postalCode) $('#restaurant-zip-input').val(d.verifiedAddress.postalCode);
                    if (typeof d.verifiedAddress.lat === 'number') $('#restaurant-lat-input').val(d.verifiedAddress.lat);
                    if (typeof d.verifiedAddress.lng === 'number') $('#restaurant-lng-input').val(d.verifiedAddress.lng);
                }
            } else {
                common.showAlert((res && res.message) || 'AI evaluation failed.', 'error');
            }
        } catch (err) {
            common.showAlert('AI evaluation failed.', 'error');
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    }
};

$(document).ready(function() {
    approveRestaurantModule.setHandlers();
});

window.approveRestaurantModule = approveRestaurantModule;

//# sourceURL=approve-restaurant.js
