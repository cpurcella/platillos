var approvePhotoModule = {
    isSaving: false,
    setHandlers: function() {
        $(document).ready(function() {
            approvePhotoModule.loadPhoto();
        });
        $(document).on('submit', '#approve-photo-form', approvePhotoModule.handleSave);
        $(document).on('click', '#ai-evaluate-photo-btn', approvePhotoModule.handleAiEvaluate);
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
            if (!['pending', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#photo-status-select').val(currentStatus);
            $('#ai-evaluate-photo-btn').toggle(currentStatus === 'pending');

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

            var html = `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;gap:16px;flex-wrap:wrap;">
                        <div style="flex:0 0 220px;max-width:220px;">
                            <div style="font-weight:600;margin-bottom:6px;">Photo</div>
                            <div style="border:1px solid #ccc;border-radius:6px;overflow:hidden;background:#fafafa;min-height:200px;display:flex;align-items:center;justify-content:center;">
                                ${photo.photoUrl ? '<img src="' + photo.photoUrl + '" alt="Review photo" style="display:block;width:100%;height:auto;" />' : '<div style="padding:16px;text-align:center;">No preview</div>'}
                            </div>
                            ${fileMeta ? '<div style="font-size:12px;color:#666;margin-top:6px;">' + fileMeta + '</div>' : ''}
                        </div>
                        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px;">
                            <div>
                                <div style="font-weight:600;margin-bottom:4px;">Dish</div>
                                <div>${photo.dishName || ''}</div>
                            </div>
                            <div>
                                <div style="font-weight:600;margin-bottom:4px;">Restaurant</div>
                                <div>${photo.restaurantName || ''}</div>
                            </div>
                            <div>
                                <div style="font-weight:600;margin-bottom:4px;">Reviewer</div>
                                <div>${reviewer || ''}</div>
                            </div>
                            <div>
                                <div style="font-weight:600;margin-bottom:4px;">Submitted</div>
                                <div>${submitted}</div>
                            </div>
                            <div>
                                <div style="font-weight:600;margin-bottom:4px;">Last Status Update</div>
                                <div>${updated || 'Not set'}</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight:600;margin-bottom:4px;">Review</div>
                        <div style="white-space:pre-wrap;">${photo.reviewContent || ''}</div>
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
        if (!['pending', 'approved', 'rejected'].includes(normalized)) {
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
