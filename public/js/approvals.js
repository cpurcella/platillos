var approvalsModule = {
    reviewGrid: null,
    dishGrid: null,
    restaurantGrid: null,
    photoGrid: null,
    reviewStatus: 'pending',
    dishStatus: 'pending',
    restaurantStatus: 'pending',
    photoStatus: 'pending',

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
                        gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise approve-btn" data-review-id="' + r.reviewId + '">Approve</a>')
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
        var baseUrl = '/api/approvals/photos';
        var statusGetter = function() { return approvalsModule.photoStatus || 'pending'; };
        var paginationConfig = approvalsModule.buildPaginationConfig(baseUrl, statusGetter);
        var serverConfig = {
            url: function() { return approvalsModule.buildDataUrl(baseUrl, statusGetter, 0, paginationConfig.limit); },
            then: function(res) {
                var data = (res && res.data) || [];
                return data.map(function(p) {
                    var reviewer = p.reviewerName || p.reviewerEmail || '';
                    var reviewSnippet = (p.reviewContent || '').length > 120 ? (p.reviewContent || '').substring(0, 117) + '...' : (p.reviewContent || '');
                    var thumbHtml = p.photoUrl ? '<img src="' + p.photoUrl + '" alt="Review photo" style="width:60px;height:60px;object-fit:cover;border-radius:4px;" />' : '';
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
    },
    loadPendingItems: async function() {
        try {
            var reviews = await $.get('/api/reviews/pending');
            approvalsModule.renderReviews(reviews.data || []);
            
            var dishes = await $.get('/api/dishes/pending');
            approvalsModule.renderDishes(dishes.data || []);
            
            var restaurants = await $.get('/api/restaurants/pending');
            approvalsModule.renderRestaurants(restaurants.data || []);
            
            var images = await $.get('/api/files/pending');
            approvalsModule.renderImages(images.data || []);
        } catch (err) {
            common.showAlert('Failed to load pending items', 'error');
        }
    },
    renderReviews: function(reviews) {
        var $list = $('#reviews-list');
        $list.empty();
        if (!reviews.length) {
            $list.html('<div>No pending reviews.</div>');
            return;
        }
        reviews.forEach(function(review) {
            var html = `
                <div class="card">
                    <div>${review.reviewContent}</div>
                    <div>Rating: ${review.rating}</div>
                    <!-- Add approve/reject buttons here -->
                </div>
            `;
            $list.append(html);
        });
    },
    renderDishes: function(dishes) {
        var $list = $('#dishes-list');
        $list.empty();
        if (!dishes.length) {
            $list.html('<div>No pending dishes.</div>');
            return;
        }
        dishes.forEach(function(dish) {
            var html = `
                <div class="card">
                    <div>${dish.name}</div>
                    <!-- Add approve/reject buttons here -->
                </div>
            `;
            $list.append(html);
        });
    },
    renderRestaurants: function(restaurants) {
        var $list = $('#restaurants-list');
        $list.empty();
        if (!restaurants.length) {
            $list.html('<div>No pending restaurants.</div>');
            return;
        }
        restaurants.forEach(function(restaurant) {
            var html = `
                <div class="card">
                    <div>${restaurant.name}</div>
                    <div>${restaurant.address}</div>
                    <!-- Add approve/reject buttons here -->
                </div>
            `;
            $list.append(html);
        });
    },
    renderImages: function(images) {
        var $list = $('#images-list');
        $list.empty();
        if (!images.length) {
            $list.html('<div>No pending images.</div>');
            return;
        }
        images.forEach(function(image) {
            var html = `
                <div class="card">
                    <img src="${image.url}" alt="Pending image" style="max-width: 200px;">
                    <!-- Add approve/reject buttons here -->
                </div>
            `;
            $list.append(html);
        });
    }
};

$(document).ready(function() {
    approvalsModule.setHandlers();
});

window.approvalsModule = approvalsModule;

//# sourceURL=approvals.js
