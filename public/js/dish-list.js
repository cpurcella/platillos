// dish-list.js
// Handles search and pagination for dish-list partial

var dishListModule = {
    setHandlers: function() {
        $(document).ready(dishListModule.loadDishes);
    },
    loadDishes: async function() {
        try {
            var res = await $.get('/api/dishes', {
                fields: [
                    'dishId',
                    'restaurantId',
                    'name',
                    'score',
                    'coverPhoto',
                    'reviewCount'
                ]
            });
            if (res.success && Array.isArray(res.data)) {
                dishListModule.renderDishes(res.data);
            }
        } catch (err) {
            common.showAlert('Failed to load dishes', 'error');
        }
    },
    renderDishes: function(dishes) {
        var $container = $('#dishes-container');
        $container.empty();
        if (!dishes.length) {
            $container.html('<div>No dishes found.</div>');
            return;
        }
        dishes.forEach(function(dish) {
            var slug = (dish.name || '').toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .substring(0, 80);
            if (!slug) slug = 'dish';
            var dishUrl = '/dishes/' + encodeURIComponent(dish.dishId) + '/' + slug;
            var html = `
                <a href="${dishUrl}" class="card dish-card" data-dish-id="${dish.dishId}">
                    <div class="dish-card-content">
                        <div class="dish-card-info">
                            <div class="dish-name">${dish.name}</div>
                            <div class="dish-meta">
                                <span class="dish-restaurant">${dish.restaurantName || dish.restaurantId}</span>
                                <span class="dish-score">
                                    ${dish.score != null ? dish.score : 'N/A'}
                                    <span class="dish-review-count">
                                        (${dish.reviewCount || 0} review${dish.reviewCount == 1 ? '' : 's'})
                                    </span>
                                </span>
                            </div>
                        </div>
                        ${dish.coverPhoto ? `<img src="${dish.coverPhoto}" class="dish-cover-photo">` : ''}
                    </div>
                </a>
            `;
            $container.append(html);
        });
    }
};

$(document).ready(function() {
    dishListModule.setHandlers();
});

// Export for other scripts if needed
window.dishListModule = dishListModule;
