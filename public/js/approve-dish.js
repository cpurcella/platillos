var approveDishModule = {
    setHandlers: function() {
        $(document).ready(approveDishModule.loadDish);
        $(document).on('click', '#save-dish-status-btn', approveDishModule.handleSave);
    },
    loadDish: async function() {
        try {
            var dishId = window.approveDishId;
            if (!dishId) {
                $('#approve-dish-content').text('Missing dishId.');
                return;
            }
            var res = await $.get('/api/dishes', { dishId: dishId, pageSize: 1, page: 1 });
            var dish = (res.data || [])[0];
            if (!dish) {
                $('#approve-dish-content').text('Dish not found.');
                return;
            }
            var html = `
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Dish</div>
                        <div>${dish.name || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Restaurant</div>
                        <div>${dish.restaurantName || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Submitted</div>
                        <div>${new Date(dish.submitted).toLocaleString()}</div>
                    </div>
                </div>
            `;
            $('#approve-dish-content').html(html);
        } catch (err) {
            $('#approve-dish-content').text('Failed to load dish.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        var dishId = window.approveDishId;
        if (!dishId) {
            common.showAlert('Missing dishId.', 'error');
            return;
        }
        var status = $('#dish-status-select').val();
        try {
            var res = await $.ajax({
                url: '/api/approvals/dishes/' + encodeURIComponent(dishId) + '/' + encodeURIComponent(status),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Dish ' + status + '.', 'success');
                $('#approve-dish-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initDishesGrid) {
                    $('#dishes-grid').empty();
                    approvalsModule.initDishesGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update dish.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update dish.', 'error');
        }
    }
};

$(document).ready(function() { approveDishModule.setHandlers(); });

window.approveDishModule = approveDishModule;

//# sourceURL=approve-dish.js
