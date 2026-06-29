var approvePhotoModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approvePhotoModule.loadPhoto();
        });
        $(document).on('submit', '#approve-photo-form', approvePhotoModule.handleSave);
        $(document).on('click', '#ai-evaluate-photo-btn', approvePhotoModule.handleAiEvaluate);
        $(document).on('click', '.photo-rotate-admin-btn', approvePhotoModule.handleRotate);
    },
    loadPhoto: async function() {
        var photoId = window.approvePhotoId;
        if (!photoId) {
            $('#approve-photo-content').text('Missing reviewPhotoId.');
            return;
        }

        try {
            var res = await $.get('/api/review-photos/' + encodeURIComponent(photoId));
            var photo = res && res.data ? res.data : null;
            if (!photo) {
                $('#approve-photo-content').text('Photo not found.');
                return;
            }

            var currentStatus = (photo.status || 'pending').toLowerCase();
            if (!['pending', 'needs_review', 'approved', 'rejected', 'out_of_area'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#photo-status-select').val(currentStatus);
            $('#ai-evaluate-photo-btn').toggle(currentStatus === 'pending');

            if (photo.aiReasoning) {
                $('#ai-photo-stored-reasoning-text').text(photo.aiReasoning);
                $('#ai-photo-stored-reasoning').show();
            } else {
                $('#ai-photo-stored-reasoning').hide();
            }

            var reviewer = photo.reviewerName || photo.reviewerEmail || '';
            var submitted = photo.reviewSubmitted ? new Date(photo.reviewSubmitted).toLocaleString() : '';
            var updated = photo.statusUpdated ? new Date(photo.statusUpdated).toLocaleString() : '';
            var fileMetaParts = [];
            if (photo.fileName) {
                fileMetaParts.push(photo.fileName);
            }
            if (photo.fileType) {
                fileMetaParts.push(photo.fileType);
            }
            if (photo.size) {
                var sizeKb = Math.round((photo.size / 1024) * 10) / 10;
                fileMetaParts.push(sizeKb + ' KB');
            }
            var fileMeta = fileMetaParts.join(' • ');
            var photoUrl = photo.photoUrl ? photo.photoUrl + '?v=' + Date.now() : '';

            var html = `
                <div class="approve-photo-layout">
                    <div class="approve-photo-main">
                        <div class="approve-photo-preview-column">
                            <div class="approve-photo-label">Photo</div>
                            <div class="approve-photo-preview">
                                ${photo.photoUrl ? '<img src="' + photoUrl + '" alt="Review photo" />' : '<div class="approve-photo-empty">No preview</div>'}
                            </div>
                            ${photo.photoUrl ? '<div class="approve-photo-rotate-actions"><button type="button" class="btn btn-outline photo-rotate-admin-btn" data-rotation="270">Rotate Left</button><button type="button" class="btn btn-outline photo-rotate-admin-btn" data-rotation="90">Rotate Right</button></div>' : ''}
                            ${fileMeta ? '<div class="approve-photo-file-meta">' + fileMeta + '</div>' : ''}
                        </div>
                        <div class="approve-photo-details">
                            <div>
                                <div class="approve-photo-field-label">Dish</div>
                                <div>${photo.dishName || ''}</div>
                            </div>
                            <div>
                                <div class="approve-photo-field-label">Restaurant</div>
                                <div>${photo.restaurantName || ''}</div>
                            </div>
                            <div>
                                <div class="approve-photo-field-label">Reviewer</div>
                                <div>${reviewer || ''}</div>
                            </div>
                            <div>
                                <div class="approve-photo-field-label">Submitted</div>
                                <div>${submitted}</div>
                            </div>
                            <div>
                                <div class="approve-photo-field-label">Last Status Update</div>
                                <div>${updated || 'Not set'}</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="approve-photo-field-label">Review</div>
                        <div class="approve-photo-review">${photo.reviewContent || ''}</div>
                    </div>
                </div>
            `;
            $('#approve-photo-content').html(html);
        } catch (err) {
            $('#approve-photo-content').text('Failed to load photo.');
        }
    },
    handleSave: async function(e) {
        e.preventDefault();
        if (approvePhotoModule.isSaving) {
            return;
        }

        var photoId = window.approvePhotoId;
        if (!photoId) {
            common.showAlert('Missing reviewPhotoId.', 'error');
            return;
        }

        var status = $('#photo-status-select').val();
        var normalized = (status || '').toLowerCase();
        if (!['pending', 'needs_review', 'approved', 'rejected', 'out_of_area'].includes(normalized)) {
            common.showAlert('Please select a valid status.', 'error');
            return;
        }

        if (normalized === 'approved' || normalized === 'rejected') {
            if (!confirm('Are you sure you want to mark this photo as ' + normalized + '?')) {
                return;
            }
        }

        var payload = { status: normalized };
        var $btn = $('#save-photo-status-btn');
        var originalText = $btn.text();
        approvePhotoModule.isSaving = true;
        $btn.prop('disabled', true).text('Saving...');

        try {
            var res = await $.ajax({
                url: '/api/review-photos/' + encodeURIComponent(photoId),
                method: 'PATCH',
                dataType: 'json',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify(payload)
            });
            if (res && res.success) {
                var message = (res && res.message) || 'Photo updated.';
                common.showAlert(message, 'success');
                $('#approve-photo-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule) {
                    if (approvalsModule.photoGrid) {
                        approvalsModule.photoGrid.forceRender();
                    }
                    if (approvalsModule.loadPendingCounts) {
                        approvalsModule.loadPendingCounts();
                    }
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update photo.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update photo.', 'error');
        } finally {
            approvePhotoModule.isSaving = false;
            $btn.prop('disabled', false).text(originalText);
        }
    },
    handleRotate: async function(e) {
        var photoId = window.approvePhotoId;
        if (!photoId) {
            common.showAlert('Missing reviewPhotoId.', 'error');
            return;
        }

        var rotationDegrees = parseInt($(e.currentTarget).data('rotation'), 10);
        if ([90, 180, 270].indexOf(rotationDegrees) === -1) {
            common.showAlert('Invalid rotation.', 'error');
            return;
        }

        var $buttons = $('.photo-rotate-admin-btn');
        $buttons.prop('disabled', true);

        try {
            var res = await $.ajax({
                url: '/api/review-photos/' + encodeURIComponent(photoId),
                method: 'PATCH',
                dataType: 'json',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify({ rotateDegreesClockwise: rotationDegrees })
            });

            if (res && res.success) {
                common.showAlert((res && res.message) || 'Photo rotated.', 'success');
                await approvePhotoModule.loadPhoto();
            } else {
                common.showAlert((res && res.message) || 'Failed to rotate photo.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to rotate photo.', 'error');
        } finally {
            $buttons.prop('disabled', false);
        }
    },
    handleAiEvaluate: async function() {
        var photoId = window.approvePhotoId;
        if (!photoId) {
            common.showAlert('Missing reviewPhotoId.', 'error');
            return;
        }
        var $btn = $('#ai-evaluate-photo-btn');
        var originalText = $btn.text();
        $btn.prop('disabled', true).text('Evaluating...');
        $('#ai-photo-result').hide();
        try {
            var res = await $.ajax({
                url: '/api/approvals/ai/photo/' + encodeURIComponent(photoId),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success && res.data) {
                var d = res.data;
                var verdictLabel = (d.verdict || 'unknown').replace('_', ' ');
                var confidence = d.confidence != null ? ' (' + Math.round(d.confidence * 100) + '% confidence)' : '';
                $('#ai-photo-verdict').text(verdictLabel.charAt(0).toUpperCase() + verdictLabel.slice(1) + confidence);
                $('#ai-photo-reasoning').text(d.reasoning || '');
                $('#ai-photo-result').show();
                if (d.verdict === 'approve') {
                    $('#photo-status-select').val('approved');
                } else if (d.verdict === 'reject') {
                    $('#photo-status-select').val('rejected');
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
    approvePhotoModule.setHandlers();
});

window.approvePhotoModule = approvePhotoModule;

//# sourceURL=approve-photo.js
