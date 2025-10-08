var approveReviewModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approveReviewModule.loadReview();
        });
        $(document).on('submit', '#approve-review-form', approveReviewModule.handleSave);
    },
    loadReview: async function() {
        var reviewId = window.approveReviewId;
        if (!reviewId) {
            $('#approve-review-content').text('Missing reviewId.');
            return;
        }

        try {
            var res = await $.get('/api/reviews/' + encodeURIComponent(reviewId));
            var review = res && res.data ? res.data : null;
            if (!review) {
                $('#approve-review-content').text('Review not found.');
                return;
            }

            $('#approve-review-dish').text(review.dishName || '');
            $('#approve-review-restaurant').text(review.restaurantName || '');
            var reviewer = (review.firstName || review.lastName)
                ? ((review.firstName || '') + ' ' + (review.lastName || '')).trim()
                : (review.email || review.submittedBy || '');
            $('#approve-review-author').text(reviewer);
            var submittedText = review.submitted ? new Date(review.submitted).toLocaleString() : '';
            $('#approve-review-submitted').text(submittedText);
            $('#approve-review-photos').text((review.photos || []).length);

            if (review.rating !== undefined && review.rating !== null) {
                $('#review-rating-input').val(review.rating);
            } else {
                $('#review-rating-input').val('');
            }

            $('#review-content-input').val(review.reviewContent || '');
            $('#review-modifications-input').val(review.modifications || '');

            var currentStatus = (review.status || 'pending').toLowerCase();
            if (!['pending', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#review-status-select').val(currentStatus);
        } catch (err) {
            $('#approve-review-content').text('Failed to load review.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        if (approveReviewModule.isSaving) {
            return;
        }

        var reviewId = window.approveReviewId;
        if (!reviewId) {
            common.showAlert('Missing reviewId.', 'error');
            return;
        }

        var ratingValue = $('#review-rating-input').val();
        if (ratingValue === '') {
            common.showAlert('Rating is required.', 'error');
            return;
        }

        var payload = {
            rating: ratingValue,
            review: $('#review-content-input').val() || '',
            modifications: $('#review-modifications-input').val() || '',
            status: $('#review-status-select').val()
        };

        var $btn = $('#save-review-status-btn');
        var originalText = $btn.text();
        approveReviewModule.isSaving = true;
        $btn.prop('disabled', true).text('Saving...');

        try {
            var res = await $.ajax({
                url: '/api/reviews/' + encodeURIComponent(reviewId),
                method: 'PATCH',
                dataType: 'json',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify(payload)
            });
            if (res && res.success) {
                var message = (res && res.message) || 'Review updated.';
                common.showAlert(message, 'success');
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
        } finally {
            approveReviewModule.isSaving = false;
            $btn.prop('disabled', false).text(originalText);
        }
    }
};

$(document).ready(function() {
    approveReviewModule.setHandlers();
});

window.approveReviewModule = approveReviewModule;

//# sourceURL=approve-review.js
