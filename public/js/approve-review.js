var approveReviewModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approveReviewModule.loadReview();
        });
        $(document).on('submit', '#approve-review-form', approveReviewModule.handleSave);
        $(document).on('click', '#ai-evaluate-review-btn', approveReviewModule.handleAiEvaluate);
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

            var photosHtml = '';
            if (review.photos && review.photos.length) {
                photosHtml = review.photos.map(function(photo) {
                    var thumbUrl = photo.url + '_s';
                    return '<a href="' + photo.url + '" target="_blank" rel="noopener"><img src="' + thumbUrl + '" alt="Review photo" style="width:60px;height:60px;object-fit:cover;border-radius:4px;" /></a>';
                }).join(' ');
            }
            $('#approve-review-photo-thumbs').html(photosHtml);

            if (review.rating !== undefined && review.rating !== null) {
                $('#review-rating-input').val(review.rating);
            } else {
                $('#review-rating-input').val('');
            }

            $('#review-content-input').val(review.reviewContent || '');
            $('#review-modifications-input').val(review.modifications || '');

            var currentStatus = (review.status || 'pending').toLowerCase();
            if (!['pending', 'needs_review', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#review-status-select').val(currentStatus);
            $('#ai-evaluate-review-btn').toggle(currentStatus === 'pending');
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

        var newStatus = $('#review-status-select').val();
        if (newStatus === 'approved' || newStatus === 'rejected') {
            if (!confirm('Are you sure you want to mark this review as ' + newStatus + '?')) {
                return;
            }
        }

        var payload = {
            rating: ratingValue,
            review: $('#review-content-input').val() || '',
            modifications: $('#review-modifications-input').val() || '',
            status: newStatus
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
                if (window.approvalsModule) {
                    if (approvalsModule.reviewGrid) {
                        approvalsModule.reviewGrid.forceRender();
                    }
                    if (approvalsModule.loadPendingCounts) {
                        approvalsModule.loadPendingCounts();
                    }
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
    },
    handleAiEvaluate: async function() {
        var reviewId = window.approveReviewId;
        if (!reviewId) {
            common.showAlert('Missing reviewId.', 'error');
            return;
        }
        var $btn = $('#ai-evaluate-review-btn');
        var originalText = $btn.text();
        $btn.prop('disabled', true).text('Evaluating...');
        $('#ai-review-result').hide();
        try {
            var res = await $.ajax({
                url: '/api/approvals/ai/review/' + encodeURIComponent(reviewId),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success && res.data) {
                var d = res.data;
                var verdictLabel = (d.verdict || 'unknown').replace('_', ' ');
                var confidence = d.confidence != null ? ' (' + Math.round(d.confidence * 100) + '% confidence)' : '';
                $('#ai-review-verdict').text(verdictLabel.charAt(0).toUpperCase() + verdictLabel.slice(1) + confidence);
                $('#ai-review-reasoning').text(d.reasoning || '');
                $('#ai-review-result').show();
                if (d.verdict === 'approve') {
                    $('#review-status-select').val('approved');
                } else if (d.verdict === 'reject') {
                    $('#review-status-select').val('rejected');
                }
            } else {
                common.showAlert((res && res.message) || 'AI evaluation failed.', 'error');
            }
        } catch (err) {
            common.showAlert('AI evaluation failed.', 'error');
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    }
};

$(document).ready(function() {
    approveReviewModule.setHandlers();
});

window.approveReviewModule = approveReviewModule;

//# sourceURL=approve-review.js
