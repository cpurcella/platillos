var approvalsModule = {
    reviewGrid: null,
    dishGrid: null,
    restaurantGrid: null,
    photoGrid: null,

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
    },
    initReviewsGrid: async function() {
        try {
            var res = await $.get('/api/reviews', { pending: 1, pageSize: 10, page: 1 });
            var rows = (res.data || []).map(function(r) {
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
            if (approvalsModule.reviewGrid) {
                approvalsModule.reviewGrid.updateConfig({ data: rows }).forceRender();
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
                    pagination: { limit: 10 },
                    data: rows
                });
                approvalsModule.reviewGrid.render(document.getElementById('reviews-grid'));
            }
        } catch (err) {
            common.showAlert('Failed to load reviews', 'error');
        }
    },
    initDishesGrid: async function() {
        try {
            var res = await $.get('/api/dishes/pending', { pending: 1, pageSize: 10, page: 1 });
            var rows = (res.data || []).map(function(d) {
                return [
                    d.name || '',
                    d.restaurantName || '',
                    new Date(d.submitted).toLocaleString(),
                    gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise review-dish-btn" data-dish-id="' + d.dishId + '">Review</a>')
                ];
            });
            if (approvalsModule.dishGrid) {
                approvalsModule.dishGrid.updateConfig({ data: rows }).forceRender();
            } else {
                approvalsModule.dishGrid = new gridjs.Grid({
                    columns: ['Dish', 'Restaurant', 'Submitted', 'Actions'],
                    search: true,
                    sort: true,
                    pagination: { limit: 10 },
                    data: rows
                });
                approvalsModule.dishGrid.render(document.getElementById('dishes-grid'));
            }
        } catch (err) {
            common.showAlert('Failed to load dishes', 'error');
        }
    },
    initRestaurantsGrid: async function() {
        try {
            var res = await $.get('/api/restaurants/pending', { pending: 1, pageSize: 10, page: 1 });
            var rows = (res.data || []).map(function(r) {
                return [
                    r.name || '',
                    r.cityName || '',
                    r.address || '',
                    new Date(r.submitted).toLocaleString(),
                    gridjs.html('<a href="javascript:void(0)" class="btn btn-turquoise review-restaurant-btn" data-restaurant-id="' + r.restaurantId + '">Review</a>')
                ];
            });
            if (approvalsModule.restaurantGrid) {
                approvalsModule.restaurantGrid.updateConfig({ data: rows }).forceRender();
            } else {
                approvalsModule.restaurantGrid = new gridjs.Grid({
                    columns: ['Restaurant', 'City', 'Address', 'Submitted', 'Actions'],
                    search: true,
                    sort: true,
                    pagination: { limit: 10 },
                    data: rows
                });
                approvalsModule.restaurantGrid.render(document.getElementById('restaurants-grid'));
            }
        } catch (err) {
            common.showAlert('Failed to load restaurants', 'error');
        }
    },
    initPhotosGrid: async function() {
        try {
            var res = await $.get('/api/approvals/photos/pending', { pending: 1, pageSize: 10, page: 1 });
            var rows = (res.data || []).map(function(p) {
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
            if (approvalsModule.photoGrid) {
                approvalsModule.photoGrid.updateConfig({ data: rows }).forceRender();
            } else {
                approvalsModule.photoGrid = new gridjs.Grid({
                    columns: ['Photo', 'Dish', 'Restaurant', 'Reviewer', 'Review', 'Submitted', 'Actions'],
                    search: true,
                    sort: true,
                    pagination: { limit: 10 },
                    data: rows
                });
                approvalsModule.photoGrid.render(document.getElementById('photos-grid'));
            }
        } catch (err) {
            common.showAlert('Failed to load photos', 'error');
        }
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
