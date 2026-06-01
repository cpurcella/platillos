var restaurantPage = {
    restaurantId: null,
    restaurantData: null,
    allDishes: [],
    map: null,

    init: function() {
        restaurantPage.restaurantId = restaurantPage.getIdFromPath();
        if (!restaurantPage.restaurantId) {
            $('#restaurant-name').text('Restaurant not found.');
            return;
        }
        restaurantPage.bindEvents();
        restaurantPage.loadRestaurant();
    },

    getIdFromPath: function() {
        var segments = (window.location.pathname || '')
            .split('/')
            .filter(function(s) { return s.length; });
        if (segments.length < 2 || segments[0] !== 'restaurants') return null;
        return segments[1];
    },

    bindEvents: function() {
        $('#dish-search').on('input', function() {
            restaurantPage.filterDishes($(this).val());
        });
    },

    loadRestaurant: function() {
        $.get('/api/restaurants/' + restaurantPage.restaurantId)
            .done(function(res) {
                if (!res.success || !res.data) {
                    $('#restaurant-name').text('Restaurant not found.');
                    return;
                }
                restaurantPage.restaurantData = res.data;
                restaurantPage.renderHeader(res.data);
                restaurantPage.loadStats();
                restaurantPage.loadDishes();
            })
            .fail(function() {
                $('#restaurant-name').text('Restaurant not found.');
            });
    },

    renderHeader: function(r) {
        $('#restaurant-name').text(r.name || 'Restaurant');
        document.title = (r.name || 'Restaurant') + ' | Platillos';

        var parts = [r.address, r.cityName, r.state].filter(Boolean);
        if (r.zip) parts.push(r.zip);
        $('#restaurant-meta').text(parts.join(', '));

        if (r.lat && r.lng) {
            var q = encodeURIComponent(r.name + ', ' + parts.join(', '));
            $('#directions-link')
                .attr('href', 'https://maps.apple.com/?daddr=' + q)
                .removeClass('hidden');
            restaurantPage.initMap(r.lat, r.lng, r.name);
        } else {
            $('#restaurant-map').addClass('hidden');
        }
    },

    initMap: function(lat, lng, name) {
        var map = L.map('restaurant-map', {
            scrollWheelZoom: false,
            dragging: !L.Browser.mobile
        }).setView([lat, lng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        L.marker([lat, lng]).addTo(map).bindPopup(name || 'Restaurant');
        restaurantPage.map = map;

        // Fix tile loading when map container resizes
        setTimeout(function() { map.invalidateSize(); }, 200);
    },

    loadStats: function() {
        $.get('/api/restaurants/' + restaurantPage.restaurantId + '/stats')
            .done(function(res) {
                if (res.success && res.data) {
                    restaurantPage.renderStats(res.data);
                }
            });
    },

    renderStats: function(stats) {
        var $el = $('#restaurant-stats');
        var items = [];

        items.push(restaurantPage.statCard('Avg Score', stats.avgScore !== null ? stats.avgScore.toFixed(1) : '—'));
        items.push(restaurantPage.statCard('Dishes', stats.dishCount));
        items.push(restaurantPage.statCard('Total Reviews', stats.totalReviews));
        items.push(restaurantPage.statCard('Recent Reviews', stats.recentReviews, 'Last 90 days'));

        $el.html(items.join(''));
    },

    statCard: function(label, value, subtitle) {
        var html = '<div class="stat-card">' +
            '<div class="stat-value">' + value + '</div>' +
            '<div class="stat-label">' + label + '</div>';
        if (subtitle) {
            html += '<div class="stat-subtitle">' + subtitle + '</div>';
        }
        html += '</div>';
        return html;
    },

    loadDishes: function() {
        $.get('/api/dishes', { restaurantId: restaurantPage.restaurantId, pageSize: 100 })
            .done(function(res) {
                var dishes = (res.success && res.data) ? res.data : [];
                restaurantPage.allDishes = dishes;
                restaurantPage.renderDishes(dishes);
            });
    },

    renderDishes: function(dishes) {
        var $list = $('#dishes-list');
        var $empty = $('#dishes-empty');
        $list.empty();

        if (!dishes.length) {
            $empty.removeClass('hidden');
            return;
        }
        $empty.addClass('hidden');

        for (var i = 0; i < dishes.length; i++) {
            $list.append(restaurantPage.dishCard(dishes[i]));
        }
    },

    dishCard: function(dish) {
        var score = dish.score !== null && dish.score !== undefined
            ? '<span class="dish-card-score">' + Number(dish.score).toFixed(1) + '</span>'
            : '';
        var reviews = dish.reviewCount
            ? '<span class="dish-card-reviews">' + dish.reviewCount + ' review' + (dish.reviewCount === 1 ? '' : 's') + '</span>'
            : '';

        var slug = (dish.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        var href = '/dishes/' + dish.dishId + '/' + slug;

        return '<a href="' + href + '" class="dish-card">' +
            '<div class="dish-card-name">' + (dish.name || 'Dish') + '</div>' +
            '<div class="dish-card-meta">' + score + reviews + '</div>' +
            '</a>';
    },

    filterDishes: function(query) {
        var q = (query || '').toLowerCase().trim();
        if (!q) {
            restaurantPage.renderDishes(restaurantPage.allDishes);
            return;
        }
        var filtered = restaurantPage.allDishes.filter(function(d) {
            return (d.name || '').toLowerCase().indexOf(q) !== -1;
        });
        restaurantPage.renderDishes(filtered);
    }
};

$(document).ready(async function() {
    await session.ready();
    restaurantPage.init();
});
