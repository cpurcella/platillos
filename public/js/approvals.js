var approvalsModule = {
    reviewGrid: null,
    dishGrid: null,
    restaurantGrid: null,
    photoGrid: null,
    userGrid: null,
    reviewStatus: 'pending',
    dishStatus: 'pending',
    restaurantStatus: 'pending',
    photoStatus: 'pending',
    userSearch: '',

    buildDataUrl: function(baseUrl, statusGetter, page, limit) {
        var normalizedLimit = limit || 10;
        var normalizedPage = (typeof page === 'number' && page >= 0) ? page : 0;
        var paramsObj = {
            page: normalizedPage + 1,
            pageSize: normalizedLimit
        };
        var currentStatus = statusGetter ? statusGetter() : null;
        if (currentStatus && String(currentStatus).toLowerCase() !== 'all') {
            paramsObj.status = currentStatus;
        }
        var params = new URLSearchParams(paramsObj).toString();
        return baseUrl + '?' + params;
    },
    buildPaginationConfig: function(baseUrl, statusGetter) {
        var defaultLimit = 10;
        return {
            limit: defaultLimit,
            server: {
                url: function(prev, page, limit) {
                    return approvalsModule.buildDataUrl(baseUrl, statusGetter, page, limit || defaultLimit);
                }
            }
        };
    },
    setHandlers: function() {
        $(document).ready(function() {
            approvalsModule.initReviewsGrid();
            approvalsModule.initDishesGrid();
            approvalsModule.initRestaurantsGrid();
            approvalsModule.initPhotosGrid();
            approvalsModule.initUsersGrid();
            approvalsModule.loadPendingCounts();
        });
        $('#reviews-grid').on('click', '.approve-btn', approvalsModule.openApproveModal);
        $('#dishes-grid').on('click', '.review-dish-btn', approvalsModule.openDishModal);
        $('#restaurants-grid').on('click', '.review-restaurant-btn', approvalsModule.openRestaurantModal);
        $('#photos-grid').on('click', '.review-photo-btn', approvalsModule.openPhotoModal);
        $('#reviews-status-filter').on('change', function() {
            var status = $(this).val();
            approvalsModule.reviewStatus = status;
            approvalsModule.initReviewsGrid(status);
        });
        $('#dishes-status-filter').on('change', function() {
            var status = $(this).val();
            approvalsModule.dishStatus = status;
            approvalsModule.initDishesGrid(status);
        });
        $('#restaurants-status-filter').on('change', function() {
            var status = $(this).val();
            approvalsModule.restaurantStatus = status;
            approvalsModule.initRestaurantsGrid(status);
        });
        $('#photos-status-filter').on('change', function() {
            var status = $(this).val();
            approvalsModule.photoStatus = status;
            approvalsModule.initPhotosGrid(status);
        });
        $('#users-search-filter').on('input', function() {
            approvalsModule.userSearch = $(this).val().trim();
            clearTimeout(approvalsModule.userSearchTimer);
            approvalsModule.userSearchTimer = setTimeout(function() {
                approvalsModule.initUsersGrid();
            }, 250);
        });
    },
    initReviewsGrid: function(status) {
        status = status || approvalsModule.reviewStatus || 'pending';
        approvalsModule.reviewStatus = status;
        var baseUrl = '/api/reviews';
        var statusGetter = function() { return approvalsModule.reviewStatus || 'pending'; };
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, statusGetter);
        var serverConfig = {
            url: function() { return approvalsModule.buildDataUrl(baseUrl, statusGetter, 0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(r) {
                    var reviewer = (r.firstName || r.lastName) ? ((r.firstName || '') + ' ' + (r.lastName || '')).trim() : (r.email || r.submittedBy);
                    return [
                        r.dishName || '',
                        r.restaurantName || '',
                        reviewer || '',
                        r.rating,
                        r.reviewContent || '',
                        new Date(r.submitted).toLocaleString(),
                        (r.photos || []).length,
                        gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise approve-btn" data-review-id="' + r.reviewId + '">Review</a>')
                    ];
                });
            },
            total: function(res) {
                return (res && typeof res.total === 'number') ? res.total : 0;
            }
        };
        if (approvalsModule.reviewGrid) {
            approvalsModule.reviewGrid.updateConfig({
                server: serverConfig,
                pagination: paginationConfig
            }).forceRender();
        } else {
            approvalsModule.reviewGrid = new gridjs.Grid({
                columns: [
                    'Dish',
                    'Restaurant',
                    'Reviewer',
                    'Rating',
                    'Review',
                    'Submitted',
                    'Photos',
                    'Actions'
                ],
                search: true,
                sort: true,
                server: serverConfig,
                pagination: paginationConfig
            });
            approvalsModule.reviewGrid.render(document.getElementById('reviews-grid'));
        }
        $('#reviews-status-filter').val(status);
    },
    initDishesGrid: function(status) {
        status = status || approvalsModule.dishStatus || 'pending';
        approvalsModule.dishStatus = status;
        var baseUrl = '/api/dishes';
        var statusGetter = function() { return approvalsModule.dishStatus || 'pending'; };
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, statusGetter);
        var serverConfig = {
            url: function() { return approvalsModule.buildDataUrl(baseUrl, statusGetter, 0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(d) {
                    return [
                        d.name || '',
                        d.restaurantName || '',
                        new Date(d.submitted).toLocaleString(),
                        gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise review-dish-btn" data-dish-id="' + d.dishId + '">Review</a>')
                    ];
                });
            },
            total: function(res) {
                return (res && typeof res.total === 'number') ? res.total : 0;
            }
        };
        if (approvalsModule.dishGrid) {
            approvalsModule.dishGrid.updateConfig({
                server: serverConfig,
                pagination: paginationConfig
            }).forceRender();
        } else {
            approvalsModule.dishGrid = new gridjs.Grid({
                columns: ['Dish', 'Restaurant', 'Submitted', 'Actions'],
                search: true,
                sort: true,
                server: serverConfig,
                pagination: paginationConfig
            });
            approvalsModule.dishGrid.render(document.getElementById('dishes-grid'));
        }
        $('#dishes-status-filter').val(status);
    },
    initRestaurantsGrid: function(status) {
        status = status || approvalsModule.restaurantStatus || 'pending';
        approvalsModule.restaurantStatus = status;
        var baseUrl = '/api/restaurants';
        var statusGetter = function() { return approvalsModule.restaurantStatus || 'pending'; };
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, statusGetter);
        var serverConfig = {
            url: function() { return approvalsModule.buildDataUrl(baseUrl, statusGetter, 0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(r) {
                    return [
                        r.name || '',
                        r.cityName || '',
                        r.address || '',
                        new Date(r.submitted).toLocaleString(),
                        gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise review-restaurant-btn" data-restaurant-id="' + r.restaurantId + '">Review</a>')
                    ];
                });
            },
            total: function(res) {
                return (res && typeof res.total === 'number') ? res.total : 0;
            }
        };
        if (approvalsModule.restaurantGrid) {
            approvalsModule.restaurantGrid.updateConfig({
                server: serverConfig,
                pagination: paginationConfig
            }).forceRender();
        } else {
            approvalsModule.restaurantGrid = new gridjs.Grid({
                columns: ['Restaurant', 'City', 'Address', 'Submitted', 'Actions'],
                search: true,
                sort: true,
                server: serverConfig,
                pagination: paginationConfig
            });
            approvalsModule.restaurantGrid.render(document.getElementById('restaurants-grid'));
        }
        $('#restaurants-status-filter').val(status);
    },
    initPhotosGrid: function(status) {
        status = status || approvalsModule.photoStatus || 'pending';
        approvalsModule.photoStatus = status;
        var baseUrl = '/api/review-photos';
        var statusGetter = function() { return approvalsModule.photoStatus || 'pending'; };
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, statusGetter);
        var serverConfig = {
            url: function() { return approvalsModule.buildDataUrl(baseUrl, statusGetter, 0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(p) {
                    var thumbUrl = '';
                    if (p.photoUrl) {
                        var queryIndex = p.photoUrl.indexOf('?');
                        thumbUrl = queryIndex === -1
                            ? p.photoUrl + '_s'
                            : p.photoUrl.slice(0, queryIndex) + '_s' + p.photoUrl.slice(queryIndex);
                    }
                    var reviewer = p.reviewerName || p.reviewerEmail || '';
                    var reviewSnippet = (p.reviewContent || '').length > 120 ? (p.reviewContent || '').substring(0, 117) + '...' : (p.reviewContent || '');
                    var thumbHtml = thumbUrl ? '<img src="' + thumbUrl + '" alt="Review photo" style="width:60px;height:60px;object-fit:cover;border-radius:4px;" />' : '';
                    var submitted = p.reviewSubmitted ? new Date(p.reviewSubmitted).toLocaleString() : '';
                    return [
                        gridjs.html('<div style="display:flex;align-items:center;gap:8px;">' + thumbHtml + '</div>'),
                        p.dishName || '',
                        p.restaurantName || '',
                        reviewer || '',
                        reviewSnippet,
                        submitted,
                        gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise review-photo-btn" data-photo-id="' + p.reviewPhotoId + '">Review</a>')
                    ];
                });
            },
            total: function(res) {
                return (res && typeof res.total === 'number') ? res.total : 0;
            }
        };
        if (approvalsModule.photoGrid) {
            approvalsModule.photoGrid.updateConfig({
                server: serverConfig,
                pagination: paginationConfig
            }).forceRender();
        } else {
            approvalsModule.photoGrid = new gridjs.Grid({
                columns: ['Photo', 'Dish', 'Restaurant', 'Reviewer', 'Review', 'Submitted', 'Actions'],
                search: true,
                sort: true,
                server: serverConfig,
                pagination: paginationConfig
            });
            approvalsModule.photoGrid.render(document.getElementById('photos-grid'));
        }
        $('#photos-status-filter').val(status);
    },
    initUsersGrid: function() {
        var baseUrl = '/api/users/admin';
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, null);
        var buildUserUrl = function(page, limit) {
            var normalizedLimit = limit || paginationConfig.limit;
            var normalizedPage = (typeof page === 'number' && page >= 0) ? page : 0;
            var paramsObj = {
                page: normalizedPage + 1,
                pageSize: normalizedLimit
            };
            if (approvalsModule.userSearch) {
                paramsObj.q = approvalsModule.userSearch;
            }
            return baseUrl + '?' + new URLSearchParams(paramsObj).toString();
        };
        paginationConfig.server.url = function(prev, page, limit) {
            return buildUserUrl(page, limit);
        };
        var serverConfig = {
            url: function() { return buildUserUrl(0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(u) {
                    var name = [u.firstName, u.lastName].filter(Boolean).join(' ');
                    var location = [u.addressCity, u.addressState].filter(Boolean).join(', ');
                    var profile = u.username
                        ? '<a href="/users/' + encodeURIComponent(u.username) + '" class="btn btn-turquoise">Profile</a>'
                        : '';
                    return [
                        name || '',
                        u.username || '',
                        u.email || '',
                        u.phone || '',
                        location || '',
                        u.isAdmin === 1 ? 'Yes' : 'No',
                        u.emailVerified ? 'Yes' : 'No',
                        u.phoneVerified ? 'Yes' : 'No',
                        u.created ? new Date(u.created).toLocaleString() : '',
                        u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '',
                        gridjs.html(profile)
                    ];
                });
            },
            total: function(res) {
                return (res && typeof res.total === 'number') ? res.total : 0;
            }
        };
        if (approvalsModule.userGrid) {
            approvalsModule.userGrid.updateConfig({
                server: serverConfig,
                pagination: paginationConfig
            }).forceRender();
        } else {
            approvalsModule.userGrid = new gridjs.Grid({
                columns: ['Name', 'Username', 'Email', 'Phone', 'Location', 'Admin', 'Email Verified', 'Phone Verified', 'Created', 'Last Login', 'Profile'],
                search: false,
                sort: true,
                server: serverConfig,
                pagination: paginationConfig
            });
            approvalsModule.userGrid.render(document.getElementById('users-grid'));
        }
    },
    loadPendingCounts: function() {
        var endpoints = [
            { url: '/api/reviews?status=pending&page=1&pageSize=1', needsReviewUrl: '/api/reviews?status=needs_review&page=1&pageSize=1', outOfAreaUrl: '/api/reviews?status=out_of_area&page=1&pageSize=1', badge: '#badge-reviews' },
            { url: '/api/dishes?status=pending&page=1&pageSize=1', needsReviewUrl: '/api/dishes?status=needs_review&page=1&pageSize=1', outOfAreaUrl: '/api/dishes?status=out_of_area&page=1&pageSize=1', badge: '#badge-dishes' },
            { url: '/api/restaurants?status=pending&page=1&pageSize=1', needsReviewUrl: '/api/restaurants?status=needs_review&page=1&pageSize=1', outOfAreaUrl: '/api/restaurants?status=out_of_area&page=1&pageSize=1', badge: '#badge-restaurants' },
            { url: '/api/review-photos?status=pending&page=1&pageSize=1', needsReviewUrl: '/api/review-photos?status=needs_review&page=1&pageSize=1', outOfAreaUrl: '/api/review-photos?status=out_of_area&page=1&pageSize=1', badge: '#badge-photos' }
        ];
        endpoints.forEach(function(ep) {
            $.when($.get(ep.url), $.get(ep.needsReviewUrl), $.get(ep.outOfAreaUrl)).then(function(pendingRes, needsReviewRes, outOfAreaRes) {
                var pendingCount = (pendingRes[0] && typeof pendingRes[0].total === 'number') ? pendingRes[0].total : 0;
                var needsReviewCount = (needsReviewRes[0] && typeof needsReviewRes[0].total === 'number') ? needsReviewRes[0].total : 0;
                var outOfAreaCount = (outOfAreaRes[0] && typeof outOfAreaRes[0].total === 'number') ? outOfAreaRes[0].total : 0;
                var count = pendingCount + needsReviewCount + outOfAreaCount;
                if (count > 0) {
                    $(ep.badge).text(count).show();
                } else {
                    $(ep.badge).hide();
                }
            });
        });
    },
    openDishModal: function(e) {
        e.preventDefault();
        var dishId = $(this).data('dish-id');
        window.approveDishId = dishId;
        common.showModal('/admin/approve-dish');
    },
    openRestaurantModal: function(e) {
        e.preventDefault();
        var restaurantId = $(this).data('restaurant-id');
        window.approveRestaurantId = restaurantId;
        common.showModal('/admin/approve-restaurant');
    },
    openPhotoModal: function(e) {
        e.preventDefault();
        var photoId = $(this).data('photo-id');
        window.approvePhotoId = photoId;
        common.showModal('/admin/approve-photo');
    },
    openApproveModal: function(e) {
        e.preventDefault();
        var reviewId = $(this).data('review-id');
        window.approveReviewId = reviewId;
        common.showModal('/admin/approve-review');
    }
};

$(document).ready(function() {
    approvalsModule.setHandlers();
});

window.approvalsModule = approvalsModule;

//# sourceURL=approvals.js
