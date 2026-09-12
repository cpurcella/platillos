$(document).ready(function() {
    var popup = $('#login-popup');
    var overlay = $('#login-overlay');
    var closeBtn = $('#close-popup');

    function openPopup() {
        overlay.addClass('is-visible');
        popup.removeClass('hidden');
        popup.attr('aria-hidden', 'false');
        closeBtn.trigger('focus');
    }

    window.showLoginPopup = openPopup;

    function closePopup() {
        overlay.removeClass('is-visible');
        popup.addClass('hidden');
        popup.attr('aria-hidden', 'true');
    }

    closeBtn.on('click', closePopup);
    overlay.on('click', closePopup);

    $(document).on('keydown', function(event) {
        if (event.key === 'Escape' && overlay.hasClass('is-visible')) {
            closePopup();
        }
    });
});
