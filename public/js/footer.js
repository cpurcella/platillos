// footer.js - Handles footer interactions

var footerModule = {
    setHandlers: function() {
        $('.footer-plus-btn').on('click', async function(event) {
            event.preventDefault();
            if (!await session.requireAuth()) {
                return;
            }
            if (window.dishPage && window.dishPage.dishData) {
                var d = window.dishPage.dishData;
                window._addReviewPreselect = {
                    restaurant: { restaurantId: d.restaurantId, name: d.restaurantName || '' },
                    dish: { dishId: d.dishId, name: d.name || '' }
                };
            }
            common.showModal('/add-review');
        });
    }
};

$(document).ready(function() {
    footerModule.setHandlers();
});

window.footerModule = footerModule;
