var approveReviewModule = {
    setHandlers: function() {
        $(document).ready(approveReviewModule.loadReview);
        $(document).on('click', '#save-review-status-btn', approveReviewModule.handleSave);
    },
    loadReview: async function() {
        try {
            var reviewId = window.approveReviewId;
            if (!reviewId) {
                $('#approve-review-content').text('Missing reviewId.');
                return;
            }
            var res = await $.get('/api/reviews/' + encodeURIComponent(reviewId));
            var r = res && res.data ? res.data : null;
            if (!r) {
                $('#approve-review-content').text('Review not found.');
                return;
            }
            var currentStatus = (r.status || 'pending').toLowerCase();
            if (!['pending', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#review-status-select').val(currentStatus);
            var reviewer = (r.firstName || r.lastName) ? ((r.firstName || '') + ' ' + (r.lastName || '')).trim() : (r.email || r.submittedBy);
            var html = `
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Dish</div>
                        <div>${r.dishName || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Restaurant</div>
                        <div>${r.restaurantName || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Reviewer</div>
                        <div>${reviewer || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Rating</div>
                        <div>${r.rating}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Review</div>
                        <div>${r.reviewContent || ''}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Photos</div>
                        <div>${(r.photos || []).length}</div>
                    </div>
                </div>
            `;
            $('#approve-review-content').html(html);
        } catch (err) {
            $('#approve-review-content').text('Failed to load review.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        var reviewId = window.approveReviewId;
        if (!reviewId) {
            common.showAlert('Missing reviewId.', 'error');
            return;
        }
        var status = $('#review-status-select').val();
        try {
            var res = await $.ajax({
                url: '/api/approvals/reviews/' + encodeURIComponent(reviewId) + '/' + encodeURIComponent(status),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Review ' + status + '.', 'success');
                $('#approve-review-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initReviewsGrid) {
                    approvalsModule.initReviewsGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update review.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update review.', 'error');
        }
    }
};

$(document).ready(function() {
    approveReviewModule.setHandlers();
});

window.approveReviewModule = approveReviewModule;

//# sourceURL=approve-review.js
