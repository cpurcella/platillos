var approvePhotoModule = {
    setHandlers: function() {
        $(document).ready(approvePhotoModule.loadPhoto);
        $(document).on('click', '#save-photo-status-btn', approvePhotoModule.handleSave);
    },
    loadPhoto: async function() {
        try {
            var photoId = window.approvePhotoId;
            if (!photoId) {
                $('#approve-photo-content').text('Missing reviewPhotoId.');
                return;
            }
            var res = await $.get('/api/approvals/photos/' + encodeURIComponent(photoId));
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

            var reviewer = photo.reviewerName || photo.reviewerEmail || '';
            var submitted = photo.reviewSubmitted ? new Date(photo.reviewSubmitted).toLocaleString() : '';
            var html = `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;gap:16px;flex-wrap:wrap;">
                        <div style="flex:0 0 220px;max-width:220px;">
                            <div style="font-weight:600;margin-bottom:6px;">Photo</div>
                            <div style="border:1px solid #ccc;border-radius:6px;overflow:hidden;background:#fafafa;">
                                ${photo.photoUrl ? '<img src="' + photo.photoUrl + '" alt="Review photo" style="display:block;width:100%;height:auto;" />' : '<div style="padding:16px;text-align:center;">No preview</div>'}
                            </div>
                        </div>
                        <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:10px;">
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
    handleSave: function(e) {
        e.preventDefault();
        var status = $('#photo-status-select').val();
        approvePhotoModule.submitStatus(status);
    },
    submitStatus: async function(status) {
        var photoId = window.approvePhotoId;
        if (!photoId) {
            common.showAlert('Missing reviewPhotoId.', 'error');
            return;
        }
        try {
            var res = await $.ajax({
                url: '/api/approvals/photos/' + encodeURIComponent(photoId) + '/' + encodeURIComponent(status),
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.success) {
                common.showAlert('Photo ' + status + '.', 'success');
                $('#approve-photo-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initPhotosGrid) {
                    approvalsModule.initPhotosGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update photo.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update photo.', 'error');
        }
    }
};

$(document).ready(function() {
    approvePhotoModule.setHandlers();
});

window.approvePhotoModule = approvePhotoModule;

//# sourceURL=approve-photo.js
