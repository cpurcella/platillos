var approveReviewModule = {
    setHandlers: function() {
        $(document).ready(approveReviewModule.loadReview);
        $(document).on('click', '#approve-review-btn', approveReviewModule.handleApprove);
        $(document).on('click', '#reject-review-btn', approveReviewModule.handleReject);
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
    handleApprove: async function(e) {
        e.preventDefault();
        var reviewId = window.approveReviewId;
        if (!reviewId) {
            common.showAlert('Missing reviewId.', 'error');
            return;
        }
        try {
            var res = await $.ajax({
                url: '/api/approvals/reviews/' + encodeURIComponent(reviewId) + '/approved',
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Review approved.', 'success');
                $('#approve-review-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initReviewsGrid) {
                    approvalsModule.initReviewsGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to approve review.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to approve review.', 'error');
        }
    },
    handleReject: async function(e) {
        e.preventDefault();
        var reviewId = window.approveReviewId;
        if (!reviewId) {
            common.showAlert('Missing reviewId.', 'error');
            return;
        }
        try {
            var res = await $.ajax({
                url: '/api/approvals/reviews/' + encodeURIComponent(reviewId) + '/rejected',
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Review rejected.', 'success');
                $('#approve-review-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initReviewsGrid) {
                    approvalsModule.initReviewsGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to reject review.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to reject review.', 'error');
        }
    }
};

$(document).ready(function() {
    approveReviewModule.setHandlers();
});

window.approveReviewModule = approveReviewModule;

//# sourceURL=approve-review.js
