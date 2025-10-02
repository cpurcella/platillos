var approveRestaurantModule = {
    setHandlers: function() {
        $(document).ready(approveRestaurantModule.loadRestaurant);
        $(document).on('click', '#save-restaurant-status-btn', approveRestaurantModule.handleSave);
    },
    loadRestaurant: async function() {
        try {
            var restaurantId = window.approveRestaurantId;
            if (!restaurantId) {
                $('#approve-restaurant-content').text('Missing restaurantId.');
                return;
            }
            var res = await $.get('/api/restaurants/' + encodeURIComponent(restaurantId));
            var restaurant = res && res.data ? res.data : null;
            if (!restaurant) {
                $('#approve-restaurant-content').text('Restaurant not found.');
                return;
            }
            var submittedDate = restaurant.submitted ? new Date(restaurant.submitted).toLocaleString() : '';
            var html = `
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Restaurant</div>
                        <div>${restaurant.name || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Address</div>
                        <div>${restaurant.address || ''}${restaurant.zip ? ', ' + restaurant.zip : ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">City</div>
                        <div>${restaurant.cityName || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Submitted</div>
                        <div>${submittedDate}</div>
                    </div>
                </div>
            `;
            $('#approve-restaurant-content').html(html);
        } catch (err) {
            $('#approve-restaurant-content').text('Failed to load restaurant.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        var restaurantId = window.approveRestaurantId;
        if (!restaurantId) {
            common.showAlert('Missing restaurantId.', 'error');
            return;
        }
        var status = $('#restaurant-status-select').val();
        try {
            var res = await $.ajax({
                url: '/api/approvals/restaurants/' + encodeURIComponent(restaurantId) + '/' + encodeURIComponent(status),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Restaurant ' + status + '.', 'success');
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
        }
    }
};

$(document).ready(function() {
    approveRestaurantModule.setHandlers();
});

window.approveRestaurantModule = approveRestaurantModule;

//# sourceURL=approve-restaurant.js
