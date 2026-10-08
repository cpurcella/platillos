var profilePage = (function() {
    var profileData = null;
    var isOwnProfile = false;
    var diaryYear = new Date().getFullYear();
    var diaryMonth = new Date().getMonth() + 1;
    var diaryYears = [];
    var favoritesPage = 1;
    var favoritesTotal = 0;
    var favoritesLoading = false;
    var reviewsPage = 1;
    var reviewsTotal = 0;
    var reviewsLoading = false;
    var watchlistPage = 1;
    var watchlistTotal = 0;
    var watchlistLoading = false;
    var PAGE_SIZE = 20;
    var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    function getUsername() {
        var segments = (window.location.pathname || '')
            .split('/')
            .filter(function(s) { return s.length; });
        if (segments.length >= 2 && segments[0] === 'users') {
            return segments[1];
        }
        return null;
    }

    function relativeDate(timestamp) {
        if (!timestamp) return '';
        var diff = Date.now() - timestamp;
        var seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'just now';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        var days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        return new Date(timestamp).toLocaleDateString();
    }

    function avatarInitial(name) {
        return (name || '?').charAt(0).toUpperCase();
    }

    async function load() {
        var username = getUsername();
        if (!username) {
            $('#profile-header').html('<p class="reviews-empty">User not found.</p>');
            return;
        }

        try {
            var res = await $.get('/api/users/' + encodeURIComponent(username));
            if (!res.success || !res.data) {
                $('#profile-header').html('<p class="reviews-empty">User not found.</p>');
                return;
            }
            profileData = res.data.profile;

            renderProfile(profileData);
            loadFavorites();
            loadReviews();

            // Check if this is the logged-in user's own profile
            if (window._platillosUser && window._platillosUser.username === profileData.username) {
                isOwnProfile = true;
                $('#edit-profile-btn').removeClass('hidden');
                $('#logout-btn').removeClass('hidden');
            } else if (window._platillosUser) {
                // Show follow button for other users' profiles
                var $followBtn = $('#follow-btn');
                $followBtn.removeClass('hidden');
                if (res.data.isFollowing) {
                    $followBtn.addClass('following').text('Following');
                }
                $followBtn.on('click', function() {
                    toggleFollow();
                });
            }

            // Pre-load diary data for current month
            loadDiary();
            loadWatchlist();
        } catch (err) {
            if (err.status === 404) {
                $('#profile-header').html('<p class="reviews-empty">User not found.</p>');
            } else {
                common.showAlert('Failed to load profile.', 'error');
            }
        }
    }

    function renderProfile(profile) {
        // Avatar
        var $avatar = $('#profile-avatar');
        if (profile.avatarUrl) {
            $avatar.html('<img src="' + common.escapeHtml(profile.avatarUrl) + '_s" alt="Avatar">');
        } else {
            $avatar.text(avatarInitial(profile.firstName));
        }

        // Name / username
        $('#profile-display-name').text((profile.firstName || '') + ' ' + (profile.lastName || ''));
        $('#profile-username').text('@' + profile.username);

        // Location
        var loc = [profile.addressCity, profile.addressState].filter(Boolean).join(', ');
        if (loc) {
            $('#profile-location').text(loc);
        }

        // Bio
        if (profile.bio) {
            $('#profile-bio').text(profile.bio);
        }

        // Stats
        var joined = profile.created ? new Date(profile.created).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
        var statsHtml = '';
        statsHtml += '<a href="javascript:void(0)" class="profile-stat profile-stat-link" data-follow-type="followers"><span class="profile-stat-value" id="stat-follower-count">' + (profile.followerCount || 0) + '</span><span class="profile-stat-label">Followers</span></a>';
        statsHtml += '<a href="javascript:void(0)" class="profile-stat profile-stat-link" data-follow-type="following"><span class="profile-stat-value" id="stat-following-count">' + (profile.followingCount || 0) + '</span><span class="profile-stat-label">Following</span></a>';
        statsHtml += '<div class="profile-stat"><span class="profile-stat-value">' + (profile.reviewCount || 0) + '</span><span class="profile-stat-label">Reviews</span></div>';
        statsHtml += '<div class="profile-stat"><span class="profile-stat-value">' + (profile.avgRating || '—') + '</span><span class="profile-stat-label">Avg Rating</span></div>';
        if (joined) {
            statsHtml += '<div class="profile-stat"><span class="profile-stat-value">' + common.escapeHtml(joined) + '</span><span class="profile-stat-label">Joined</span></div>';
        }
        $('#profile-stats').html(statsHtml);
    }

    async function toggleFollow() {
        if (!profileData) return;
        var $btn = $('#follow-btn');
        var isFollowing = $btn.hasClass('following');
        try {
            var res;
            if (isFollowing) {
                res = await common.secureAjax({ url: '/api/users/me/following/' + profileData.userId, method: 'DELETE' });
            } else {
                res = await common.secureAjax({ url: '/api/users/me/following/' + profileData.userId, method: 'PUT' });
            }
            if (res.success) {
                if (res.following) {
                    $btn.addClass('following').text('Following');
                } else {
                    $btn.removeClass('following').text('Follow');
                }
                // Update follower count in stats
                profileData.followerCount = res.followerCount;
                $('#stat-follower-count').text(res.followerCount);
            }
        } catch (err) {
            console.error('Follow toggle failed:', err);
        }
    }

    function renderFavorites(favorites) {
        var $grid = $('#favorites-grid');
        if (!favorites.length && favoritesPage === 1) {
            $grid.html('<div class="favorites-empty">No favorite dishes yet.</div>');
            return;
        }
        favorites.forEach(function(fav) {
            var photoHtml = fav.coverPhoto
                ? '<img src="' + common.escapeHtml(fav.coverPhoto) + '_s" alt="' + common.escapeHtml(fav.dishName) + '">'
                : '<div class="favorite-card-placeholder">🍽</div>';
            var html = '<a href="/dishes/' + encodeURIComponent(fav.dishId) + '" class="favorite-card">' +
                '<div class="favorite-card-photo">' + photoHtml + '</div>' +
                '<div class="favorite-card-name">' + common.escapeHtml(fav.dishName) + '</div>' +
                '<div class="favorite-card-restaurant">' + common.escapeHtml(fav.restaurantName || '') + '</div>' +
                '</a>';
            $grid.append(html);
        });
    }

    async function loadFavorites() {
        if (!profileData || favoritesLoading) return;
        if (favoritesPage > 1 && (favoritesPage - 1) * PAGE_SIZE >= favoritesTotal) return;
        favoritesLoading = true;
        try {
            var url = '/api/users/' + encodeURIComponent(profileData.username) +
                '/favorites?page=' + favoritesPage + '&pageSize=' + PAGE_SIZE;
            var res = await $.get(url);
            if (res.success && res.data) {
                favoritesTotal = res.data.total;
                renderFavorites(res.data.items || []);
                favoritesPage++;
            }
        } catch (err) {
            if (favoritesPage === 1) {
                $('#favorites-grid').html('<div class="favorites-empty">Failed to load favorites.</div>');
            }
        } finally {
            favoritesLoading = false;
        }
    }

    function renderReviews(reviews) {
        var $list = $('#profile-reviews-list');
        if (!reviews.length && reviewsPage === 1) {
            $list.html('<div class="reviews-empty">No reviews yet.</div>');
            return;
        }
        reviews.forEach(function(r) {
            var ratingText = r.rating != null ? r.rating + '/10' : '';
            var html = '<div class="profile-review-card">' +
                '<div class="profile-review-header">' +
                    '<span class="profile-review-dish"><a href="/dishes/' + encodeURIComponent(r.dishId) + '?reviewId=' + r.reviewId + '">' + common.escapeHtml(r.dishName) + '</a></span>' +
                    '<span class="profile-review-rating">' + common.escapeHtml(ratingText) + '</span>' +
                '</div>' +
                '<div class="profile-review-restaurant">' + common.escapeHtml(r.restaurantName || '') + '</div>' +
                (r.reviewContent ? '<div class="profile-review-text">' + common.escapeHtml(r.reviewContent) + '</div>' : '') +
                '<div class="profile-review-date">' + relativeDate(r.submitted) + '</div>' +
                '</div>';
            $list.append(html);
        });
    }

    async function loadReviews() {
        if (!profileData || reviewsLoading) return;
        if (reviewsPage > 1 && (reviewsPage - 1) * PAGE_SIZE >= reviewsTotal) return;
        reviewsLoading = true;
        try {
            var url = '/api/users/' + encodeURIComponent(profileData.username) +
                '/reviews?page=' + reviewsPage + '&pageSize=' + PAGE_SIZE;
            var res = await $.get(url);
            if (res.success && res.data) {
                reviewsTotal = res.data.total;
                renderReviews(res.data.items || []);
                reviewsPage++;
            }
        } catch (err) {
            if (reviewsPage === 1) {
                $('#profile-reviews-list').html('<div class="reviews-empty">Failed to load reviews.</div>');
            }
        } finally {
            reviewsLoading = false;
        }
    }

    // ── Tabs ──
    function switchTab(tabName) {
        $('.profile-tab').removeClass('active');
        $('.profile-tab[data-tab="' + tabName + '"]').addClass('active');
        $('.profile-tab-content').addClass('hidden');
        $('#tab-' + tabName).removeClass('hidden');
        if (tabName === 'favorites') loadFavorites();
        if (tabName === 'watchlist') loadWatchlist();
    }

    // ── Diary ──
    async function loadDiary() {
        if (!profileData) return;
        try {
            var url = '/api/users/' + encodeURIComponent(profileData.username) +
                '/diary?year=' + diaryYear + '&month=' + diaryMonth;
            var res = await $.get(url);
            if (res.success && res.data) {
                diaryYears = res.data.years || [];
                renderDiaryControls();
                renderDiaryCalendar(res.data.entries || []);
                renderDiaryList(res.data.entries || []);
            }
        } catch (err) {
            $('#diary-entries-list').html('<div class="reviews-empty">Failed to load diary.</div>');
        }
    }

    function renderDiaryControls() {
        var html = '<div class="diary-nav">' +
            '<button class="btn btn-outline btn-sm diary-prev" aria-label="Previous month">&lsaquo;</button>' +
            '<span class="diary-month-label">' + common.escapeHtml(MONTH_NAMES[diaryMonth]) + ' ' + diaryYear + '</span>' +
            '<button class="btn btn-outline btn-sm diary-next" aria-label="Next month">&rsaquo;</button>' +
            '</div>';
        $('#diary-controls').html(html);
    }

    function renderDiaryCalendar(entries) {
        // Build a mini calendar grid for the month
        var firstDay = new Date(diaryYear, diaryMonth - 1, 1).getDay(); // 0=Sun
        var daysInMonth = new Date(diaryYear, diaryMonth, 0).getDate();

        // Group entries by day
        var byDay = {};
        entries.forEach(function(e) {
            var d = new Date(e.dateTried + 'T12:00:00');
            var day = d.getDate();
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(e);
        });

        var html = '<div class="diary-cal-grid">';
        // Day headers
        var dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        dayLabels.forEach(function(l) {
            html += '<div class="diary-cal-header">' + l + '</div>';
        });
        // Empty cells before first day
        for (var i = 0; i < firstDay; i++) {
            html += '<div class="diary-cal-cell empty"></div>';
        }
        // Day cells
        for (var day = 1; day <= daysInMonth; day++) {
            var count = byDay[day] ? byDay[day].length : 0;
            var cls = 'diary-cal-cell' + (count > 0 ? ' has-entries' : '');
            html += '<div class="' + cls + '">' +
                '<span class="diary-cal-day">' + day + '</span>' +
                (count > 0 ? '<span class="diary-cal-dot" title="' + count + ' ' + (count === 1 ? 'entry' : 'entries') + '"></span>' : '') +
                '</div>';
        }
        html += '</div>';
        $('#diary-calendar').html(html);
    }

    function renderDiaryList(entries) {
        var $list = $('#diary-entries-list');
        $list.empty();
        if (!entries.length) {
            $list.html('<div class="reviews-empty">No diary entries this month.</div>');
            return;
        }
        entries.forEach(function(e) {
            var ratingText = e.rating != null ? e.rating + '/10' : '';
            var dateStr = new Date(e.dateTried + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            var badge = e.entryType === 'log' ? '<span class="diary-badge-log">Quick log</span>' : '';
            var html = '<div class="profile-review-card diary-entry">' +
                '<div class="profile-review-header">' +
                    '<span class="profile-review-dish"><a href="/dishes/' + encodeURIComponent(e.dishId) + '">' + common.escapeHtml(e.dishName) + '</a></span>' +
                    '<span class="profile-review-rating">' + common.escapeHtml(ratingText) + '</span>' +
                '</div>' +
                '<div class="profile-review-restaurant">' + common.escapeHtml(e.restaurantName || '') + '</div>' +
                '<div class="diary-entry-meta">' +
                    '<span class="diary-entry-date">' + common.escapeHtml(dateStr) + '</span>' +
                    badge +
                '</div>' +
                '</div>';
            $list.append(html);
        });
    }

    function changeMonth(delta) {
        diaryMonth += delta;
        if (diaryMonth > 12) { diaryMonth = 1; diaryYear++; }
        if (diaryMonth < 1) { diaryMonth = 12; diaryYear--; }
        loadDiary();
    }

    // ── Watchlist ──
    async function loadWatchlist() {
        if (!profileData || watchlistLoading) return;
        if (watchlistPage > 1 && (watchlistPage - 1) * PAGE_SIZE >= watchlistTotal) return;
        watchlistLoading = true;
        try {
            var url = '/api/users/' + encodeURIComponent(profileData.username) +
                '/watchlist?page=' + watchlistPage + '&pageSize=' + PAGE_SIZE;
            var res = await $.get(url);
            if (res.success && res.data) {
                watchlistTotal = res.data.total;
                renderWatchlist(res.data.items || []);
                watchlistPage++;
            }
        } catch (err) {
            if (watchlistPage === 1) {
                $('#watchlist-list').html('<div class="reviews-empty">Failed to load watchlist.</div>');
            }
        } finally {
            watchlistLoading = false;
        }
    }

    function renderWatchlist(items) {
        var $list = $('#watchlist-list');
        if (!items.length && watchlistPage === 1) {
            $list.html('<div class="favorites-empty">No dishes on the watchlist yet.</div>');
            return;
        }
        items.forEach(function(item) {
            var photoHtml = item.coverPhoto
                ? '<img src="' + common.escapeHtml(item.coverPhoto) + '_s" alt="' + common.escapeHtml(item.dishName) + '">'
                : '<div class="favorite-card-placeholder">🍽</div>';
            var html = '<a href="/dishes/' + encodeURIComponent(item.dishId) + '" class="favorite-card">' +
                '<div class="favorite-card-photo">' + photoHtml + '</div>' +
                '<div class="favorite-card-name">' + common.escapeHtml(item.dishName) + '</div>' +
                '<div class="favorite-card-restaurant">' + common.escapeHtml(item.restaurantName || '') + '</div>' +
                '</a>';
            $list.append(html);
        });
    }

    // ── Followers / Following Modal ──
    var followModalType = null;
    var followModalPage = 1;

    function openFollowModal(type) {
        followModalType = type;
        followModalPage = 1;
        $('#follow-modal-title').text(type === 'followers' ? 'Followers' : 'Following');
        $('#follow-modal-overlay').removeClass('hidden');
        $('#follow-modal').removeClass('hidden');
        loadFollowModal();
    }

    function closeFollowModal() {
        $('#follow-modal-overlay').addClass('hidden');
        $('#follow-modal').addClass('hidden');
        followModalType = null;
    }

    async function loadFollowModal() {
        if (!profileData || !followModalType) return;
        var $list = $('#follow-modal-list');
        $list.html('<div class="reviews-empty">Loading...</div>');
        try {
            var url = '/api/users/' + encodeURIComponent(profileData.username) +
                '/' + followModalType + '?page=' + followModalPage + '&pageSize=20';
            var res = await $.get(url);
            if (res.success && res.data) {
                renderFollowModalList(res.data.items || []);
                renderFollowModalPagination(res.data);
            }
        } catch (err) {
            $list.html('<div class="reviews-empty">Failed to load.</div>');
        }
    }

    function renderFollowModalList(items) {
        var $list = $('#follow-modal-list');
        $list.empty();
        if (!items.length) {
            var label = followModalType === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
            $list.html('<div class="reviews-empty">' + label + '</div>');
            return;
        }
        items.forEach(function(user) {
            var avatarHtml = user.avatarUrl
                ? '<img src="' + common.escapeHtml(user.avatarUrl) + '_s" alt="Avatar">'
                : '<span class="follow-card-initial">' + avatarInitial(user.firstName) + '</span>';
            var displayName = common.escapeHtml((user.firstName || '') + ' ' + (user.lastName || '')).trim();
            var html = '<a href="/users/' + encodeURIComponent(user.username) + '" class="follow-card">' +
                '<div class="follow-card-avatar">' + avatarHtml + '</div>' +
                '<div class="follow-card-info">' +
                    '<div class="follow-card-name">' + (displayName || common.escapeHtml(user.username)) + '</div>' +
                    '<div class="follow-card-username">@' + common.escapeHtml(user.username) + '</div>' +
                '</div>' +
                '</a>';
            $list.append(html);
        });
    }

    function renderFollowModalPagination(data) {
        var $pag = $('#follow-modal-pagination');
        var totalPages = Math.ceil(data.total / data.pageSize);
        if (totalPages <= 1) {
            $pag.empty();
            return;
        }
        var html = '<button class="btn btn-outline btn-sm follow-modal-prev"' + (followModalPage <= 1 ? ' disabled' : '') + '>Previous</button>' +
            '<span class="follow-page-label">Page ' + followModalPage + ' of ' + totalPages + '</span>' +
            '<button class="btn btn-outline btn-sm follow-modal-next"' + (followModalPage >= totalPages ? ' disabled' : '') + '>Next</button>';
        $pag.html(html);
    }

    // ── Edit profile ──
    var croppieInstance = null;
    var croppedBlob = null;

    function openEditModal() {
        $('#edit-username').val(profileData.username || '');
        $('#edit-bio').val(profileData.bio || '');
        var $preview = $('#avatar-preview');
        if (profileData.avatarUrl) {
            $preview.html('<img src="' + common.escapeHtml(profileData.avatarUrl) + '_s" alt="Avatar">');
        } else {
            $preview.text(avatarInitial(profileData.firstName));
        }
        croppedBlob = null;
        destroyCroppie();
        $('#avatar-row-default').removeClass('hidden');
        $('#avatar-crop-area').addClass('hidden');
        $('#edit-profile-overlay').removeClass('hidden');
        $('#edit-profile-modal').removeClass('hidden');
    }

    function closeEditModal() {
        destroyCroppie();
        $('#edit-profile-overlay').addClass('hidden');
        $('#edit-profile-modal').addClass('hidden');
    }

    function destroyCroppie() {
        if (croppieInstance) {
            croppieInstance.destroy();
            croppieInstance = null;
        }
    }

    function showCroppie(url) {
        destroyCroppie();
        $('#avatar-row-default').addClass('hidden');
        $('#avatar-crop-area').removeClass('hidden');
        croppieInstance = new Croppie(document.getElementById('avatar-croppie'), {
            viewport: { width: 200, height: 200, type: 'circle' },
            boundary: { width: 280, height: 280 },
            enableResize: false,
            enableOrientation: true
        });
        croppieInstance.bind({ url: url });
    }

    function confirmCrop() {
        if (!croppieInstance) return;
        croppieInstance.result({ type: 'blob', size: { width: 512, height: 512 }, format: 'jpeg', quality: 0.9 })
            .then(function(blob) {
                croppedBlob = blob;
                // Show cropped preview
                var previewUrl = URL.createObjectURL(blob);
                $('#avatar-preview').html('<img src="' + previewUrl + '" alt="Preview">');
                destroyCroppie();
                $('#avatar-crop-area').addClass('hidden');
                $('#avatar-row-default').removeClass('hidden');
            });
    }

    function cancelCrop() {
        destroyCroppie();
        croppedBlob = null;
        $('#avatar-file-input').val('');
        $('#avatar-crop-area').addClass('hidden');
        $('#avatar-row-default').removeClass('hidden');
    }

    async function uploadAvatar(blob) {
        var formData = new FormData();
        formData.append('file', blob, 'avatar.jpg');
        var res = await common.secureAjax({
            url: '/api/files',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'json'
        });
        if (!res.success || !res.data || !res.data.fileId) {
            throw new Error('Upload failed');
        }
        return res.data.fileId;
    }

    async function onEditSubmit(e) {
        e.preventDefault();
        var data = {};
        var newUsername = $('#edit-username').val().trim();
        var newBio = $('#edit-bio').val();
        if (newUsername !== (profileData.username || '')) {
            data.username = newUsername;
        }
        if (newBio !== (profileData.bio || '')) {
            data.bio = newBio;
        }

        // Handle avatar upload
        if (croppedBlob) {
            try {
                data.avatarFileId = await uploadAvatar(croppedBlob);
            } catch (err) {
                common.showAlert('Failed to upload avatar.', 'error');
                return;
            }
        }

        if (!Object.keys(data).length) {
            closeEditModal();
            return;
        }

        try {
            var res = await common.secureAjax({
                url: '/api/users/me',
                method: 'PATCH',
                data: JSON.stringify(data),
                contentType: 'application/json',
                dataType: 'json'
            });
            if (res.success) {
                common.showAlert('Profile updated!', 'success');
                closeEditModal();
                // Reload if username changed (URL changes)
                if (data.username) {
                    window.location.href = '/users/' + encodeURIComponent(data.username);
                } else {
                    load();
                }
            } else {
                common.showAlert(res.message || 'Update failed.', 'error');
            }
        } catch (err) {
            var msg = (err.responseJSON && err.responseJSON.message) || 'Update failed.';
            common.showAlert(msg, 'error');
        }
    }

    function bindEvents() {
        // Tabs
        $(document).on('click', '.profile-tab', function() {
            switchTab($(this).data('tab'));
        });
        // Diary navigation
        $(document).on('click', '.diary-prev', function() { changeMonth(-1); });
        $(document).on('click', '.diary-next', function() { changeMonth(1); });

        // Infinite scroll for reviews and watchlist
        $(window).on('scroll', function() {
            var scrollBottom = $(window).scrollTop() + $(window).height();
            var threshold = $(document).height() - 200;
            if (scrollBottom >= threshold) {
                var activeTab = $('.profile-tab.active').data('tab');
                if (activeTab === 'reviews') loadReviews();
                if (activeTab === 'favorites') loadFavorites();
                if (activeTab === 'watchlist') loadWatchlist();
            }
        });

        // Follow modal
        $(document).on('click', '.profile-stat-link', function() {
            openFollowModal($(this).data('follow-type'));
        });
        $('#follow-modal-overlay').on('click', closeFollowModal);
        $('#follow-modal .close-modal').on('click', closeFollowModal);
        $(document).on('click', '.follow-modal-prev', function() { followModalPage--; loadFollowModal(); });
        $(document).on('click', '.follow-modal-next', function() { followModalPage++; loadFollowModal(); });

        // Edit profile
        $('#edit-profile-btn').on('click', openEditModal);
        $('#cancel-edit-btn').on('click', closeEditModal);
        $('#edit-profile-overlay').on('click', closeEditModal);
        $('#edit-profile-modal .close-modal').on('click', closeEditModal);
        $('#edit-profile-form').on('submit', onEditSubmit);
        $('#avatar-upload-btn').on('click', function() {
            $('#avatar-file-input').trigger('click');
        });
        $('#avatar-file-input').on('change', function() {
            var file = this.files && this.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function(e) {
                    showCroppie(e.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
        $('#avatar-crop-confirm').on('click', confirmCrop);
        $('#avatar-crop-cancel').on('click', cancelCrop);
    }

    $(document).ready(async function() {
        bindEvents();
        await session.ready();
        load();
    });

    return {
        load: load
    };
})();

$(document).on('click', '#logout-btn', async function(event) {
    event.preventDefault();
    try {
        await common.secureAjax({ url: '/api/session', method: 'DELETE' });
        window.location.href = '/';
    } catch (err) {
        common.showAlert('Unable to log out. Please try again.', 'error');
    }
});
