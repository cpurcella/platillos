// search.js - Dedicated search results page

var searchModule = {
    currentType: 'dishes',
    currentSort: 'score',
    currentPage: 1,
    pageSize: 20,
    totalResults: 0,
    loading: false,
    hasMore: true,
    browserLocation: null,
    requestVersion: 0,

    init: function() {
        searchModule.bindEvents();

        searchModule.detectLocation().then(function() {
            searchModule.applyUrlState({ replaceUrl: true });
        });
    },

    normalizeType: function(type) {
        return type === 'people' ? 'people' : 'dishes';
    },

    normalizeSort: function(sort) {
        return ['score', 'reviews', 'nearest', 'newest'].indexOf(sort) !== -1 ? sort : 'score';
    },

    readUrlState: function() {
        var params = new URLSearchParams(window.location.search);
        return {
            q: params.get('q') || '',
            type: searchModule.normalizeType(params.get('type')),
            sort: searchModule.normalizeSort(params.get('sort'))
        };
    },

    buildSearchUrl: function(term, type, sort) {
        if (!term) return '/search';
        var params = new URLSearchParams();
        params.set('q', term);
        params.set('type', searchModule.normalizeType(type));
        params.set('sort', searchModule.normalizeSort(sort));
        return '/search?' + params.toString();
    },

    setSearchUrl: function(term, type, sort, replace) {
        var url = searchModule.buildSearchUrl(term, type, sort);
        if (window.location.pathname + window.location.search === url) return;
        if (replace) {
            window.history.replaceState(null, '', url);
        } else {
            window.history.pushState(null, '', url);
        }
    },

    applyUrlState: function(options) {
        options = options || {};
        var state = searchModule.readUrlState();
        var term = state.q.trim();
        $('#searchInput').val(term);
        $('#sort-select').val(state.sort);
        searchModule.currentSort = state.sort;
        searchModule.setActiveTab(state.type);
        searchModule.currentPage = 1;
        searchModule.hasMore = true;

        if (options.replaceUrl) {
            searchModule.setSearchUrl(term, state.type, state.sort, true);
        }

        if (term) {
            searchModule.runSearch(term);
        } else {
            searchModule.showEmptySearch();
        }
    },

    showEmptySearch: function() {
        searchModule.requestVersion++;
        searchModule.loading = false;
        $('#dishes-loading').hide();
        $('#search-tabs').hide();
        $('#dishes-section').hide();
        $('#people-section').hide();
        $('#search-empty').text('No results found. Try another dish or restaurant name.').hide();
        $('#dishes-container').empty();
        $('#people-container').empty();
        $('#results-count').empty();
        $('#searchInput').focus();
    },

    detectLocation: function() {
        if (window._platillosUser && window._platillosUser.addressLat) {
            return Promise.resolve();
        }
        if (!navigator.geolocation) return Promise.resolve();
        return new Promise(function(resolve) {
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    searchModule.browserLocation = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    resolve();
                },
                function() { resolve(); },
                { timeout: 5000, maximumAge: 300000 }
            );
        });
    },

    bindEvents: function() {
        $('#searchBtn').on('click', function() {
            searchModule.handleSearch();
        });
        document.addEventListener('error', function(evt) {
            var image = evt.target;
            if (!image || !image.classList || !image.classList.contains('search-dish-photo')) return;
            var card = image.closest('.search-dish-card');
            if (card) card.classList.add('search-dish-card-no-photo');
            image.remove();
        }, true);
        $('#searchInput').on('keypress', function(evt) {
            if (evt.which === 13) {
                evt.preventDefault();
                searchModule.handleSearch();
            }
        });
        $('.search-tab').on('click', function() {
            var type = $(this).data('type');
            searchModule.setActiveTab(type);
            searchModule.handleSearch();
        });
        $('#sort-select').on('change', function() {
            searchModule.currentSort = $(this).val();
            searchModule.handleSearch();
        });
        $(window).on('popstate', function() {
            searchModule.applyUrlState();
        });
        $(window).on('scroll', function() {
            if (searchModule.currentType !== 'dishes') return;
            if (searchModule.loading || !searchModule.hasMore) return;
            if ($(window).scrollTop() + $(window).height() >= $(document).height() - 300) {
                searchModule.loadMoreDishes();
            }
        });
    },

    setActiveTab: function(type) {
        searchModule.currentType = type;
        $('.search-tab').removeClass('active');
        $('.search-tab[data-type="' + type + '"]').addClass('active');
    },

    handleSearch: function() {
        var term = ($('#searchInput').val() || '').trim();
        if (!term) {
            if (window.location.pathname + window.location.search !== '/search') {
                window.history.pushState(null, '', '/search');
            }
            searchModule.showEmptySearch();
            return;
        }
        var type = searchModule.currentType;
        var sort = searchModule.currentSort;
        searchModule.setSearchUrl(term, type, sort);
        searchModule.currentPage = 1;
        searchModule.hasMore = true;
        searchModule.runSearch(term);
    },

    runSearch: function(term) {
        searchModule.requestVersion++;
        searchModule.loading = false;
        $('#search-tabs').show();
        $('#search-empty').text('No results found. Try another dish or restaurant name.').hide();

        if (searchModule.currentType === 'people') {
            $('#dishes-section').hide();
            searchModule.loadPeople(term);
        } else {
            $('#people-section').hide();
            $('#dishes-container').empty();
            searchModule.loadDishes(term, false);
        }
    },

    loadPeople: async function(term) {
        var version = searchModule.requestVersion;
        try {
            var res = await $.get('/api/users/search', { q: term, limit: 50 });
            if (version !== searchModule.requestVersion) return;
            if (res.success && res.data.length) {
                searchModule.renderPeople(res.data);
                $('#people-section').show();
                return;
            }
            $('#people-section').hide();
            $('#search-empty').show();
        } catch (err) {
            if (version !== searchModule.requestVersion) return;
            $('#people-section').hide();
            $('#search-empty').text('Search could not load. Please try again.').show();
        }
    },

    renderPeople: function(users) {
        var $container = $('#people-container');
        $container.empty();
        users.forEach(function(user) {
            var profileUrl = '/users/' + encodeURIComponent(user.username);
            var nameEscaped = $('<span>').text((user.firstName || '') + ' ' + (user.lastName || '')).html().trim();
            var usernameEscaped = $('<span>').text(user.username).html();
            var initial = (user.firstName || user.username || '?').charAt(0).toUpperCase();
            var avatarHtml = user.avatarUrl
                ? '<img src="' + $('<span>').text(user.avatarUrl).html() + '" class="people-card-avatar" alt="">'
                : '<div class="people-card-avatar people-card-avatar-placeholder">' + initial + '</div>';
            var html = '<a href="' + profileUrl + '" class="people-card">' +
                avatarHtml +
                '<div class="people-card-info">' +
                    '<div class="people-card-name">' + nameEscaped + '</div>' +
                    '<div class="people-card-username">@' + usernameEscaped + '</div>' +
                '</div></a>';
            $container.append(html);
        });
    },

    loadDishes: async function(term, append) {
        if (append && searchModule.loading) return;
        var version = searchModule.requestVersion;
        var page = searchModule.currentPage;
        searchModule.loading = true;
        $('#dishes-loading').show();

        try {
            var params = {
                search: term,
                fields: JSON.stringify(['dishId', 'restaurantId', 'name', 'score', 'coverPhoto', 'reviewCount']),
                sort: searchModule.currentSort,
                page: searchModule.currentPage,
                pageSize: searchModule.pageSize,
                useLocation: '1'
            };
            if (searchModule.browserLocation) {
                params.lat = searchModule.browserLocation.lat;
                params.lng = searchModule.browserLocation.lng;
            }
            var res = await $.get('/api/dishes', params);
            if (version !== searchModule.requestVersion) return;
            if (res.success) {
                searchModule.totalResults = res.total;
                $('#results-count').text(res.total + ' result' + (res.total === 1 ? '' : 's'));

                if (res.data.length) {
                    searchModule.renderDishes(res.data, append);
                    $('#dishes-section').show();
                    searchModule.hasMore = (page * searchModule.pageSize) < res.total;
                } else if (!append) {
                    $('#dishes-section').hide();
                    $('#search-empty').text('No results found. Try another dish or restaurant name.').show();
                    searchModule.hasMore = false;
                }
            }
        } catch (err) {
            if (version !== searchModule.requestVersion) return;
            if (append) searchModule.currentPage = Math.max(1, page - 1);
            if (!append) {
                $('#dishes-section').hide();
                $('#search-empty').text('Search could not load. Please try again.').show();
            }
        }

        if (version === searchModule.requestVersion) {
            searchModule.loading = false;
            $('#dishes-loading').hide();
        }
    },

    loadMoreDishes: function() {
        if (searchModule.loading || !searchModule.hasMore) return;
        var term = ($('#searchInput').val() || '').trim();
        if (!term) return;
        searchModule.currentPage++;
        searchModule.loadDishes(term, true);
    },

    renderDishes: function(dishes, append) {
        var $container = $('#dishes-container');
        if (!append) $container.empty();

        dishes.forEach(function(dish) {
            var slug = (dish.name || '').toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .substring(0, 80) || 'dish';
            var dishUrl = '/dishes/' + encodeURIComponent(dish.dishId) + '/' + slug;
            var coverUrl = dish.coverPhoto ? searchModule.buildVariantUrl(dish.coverPhoto, '_s') : '';
            var coverEscaped = coverUrl ? $('<div>').text(coverUrl).html() : '';
            var imageMarkup = coverEscaped
                ? '<img src="' + coverEscaped + '" class="search-dish-photo" loading="lazy" alt="' + $('<div>').text(dish.name || 'Dish photo').html() + '">'
                : '';
            var cardClass = 'search-dish-card' + (coverEscaped ? '' : ' search-dish-card-no-photo');

            var restaurantName = $('<span>').text(dish.restaurantName || '').html();
            var reviewCount = dish.reviewCount || 0;
            var distanceHtml = '';
            if (dish.distance != null) {
                var miles = (dish.distance / 1609.344).toFixed(1);
                distanceHtml = '<span class="search-dish-distance">' + miles + ' mi</span>';
            }

            var html = '<a href="' + dishUrl + '" class="' + cardClass + '">' +
                imageMarkup +
                '<div class="search-dish-info">' +
                    '<div class="search-dish-name">' + $('<span>').text(dish.name).html() + '</div>' +
                    '<div class="search-dish-restaurant">' + restaurantName + '</div>' +
                    '<div class="search-dish-meta">' +
                        '<span class="search-dish-stars">' + searchModule.renderStars(dish.score) + '</span>' +
                        '<span class="search-dish-reviews">' + reviewCount + ' review' + (reviewCount === 1 ? '' : 's') + '</span>' +
                        distanceHtml +
                    '</div>' +
                '</div>' +
            '</a>';
            $container.append(html);
        });
    },

    buildVariantUrl: function(url, suffix) {
        if (!url) return '';
        var index = url.indexOf('?');
        if (index === -1) return url + suffix;
        return url.slice(0, index) + suffix + url.slice(index);
    },

    renderStars: function(score) {
        if (score == null || isNaN(score)) {
            return '<span class="search-dish-no-rating">No ratings yet</span>';
        }
        var numericScore = Number(score);
        var normalizedScore = numericScore / 2;
        var clampedScore = Math.max(0, Math.min(5, normalizedScore));
        var fullStars = Math.floor(clampedScore);
        var hasHalf = (clampedScore - fullStars) >= 0.5;
        var emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
        var html = '';
        for (var i = 0; i < fullStars; i++) html += '<span class="star star-full">\u2605</span>';
        if (hasHalf) html += '<span class="star star-half">\u2605</span>';
        for (var j = 0; j < emptyStars; j++) html += '<span class="star star-empty">\u2605</span>';
        return '<span class="stars" aria-label="Rating ' + clampedScore.toFixed(1) + ' out of 5">' + html + '</span>' +
            '<span class="search-dish-score-num">' + (clampedScore * 2).toFixed(1) + '/10</span>';
    }
};

$(document).ready(searchModule.init);
