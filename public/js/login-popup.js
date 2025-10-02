$(document).ready(function() {
    var popup = $('#login-popup');
    var closeBtn = $('#close-popup');

    $('.logged-in-only').on('click', function(event) {
        if (!window.isLoggedIn) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            popup.removeClass('hidden');
        }
    });

    closeBtn.on('click', function() {
        popup.addClass('hidden');
    });
});
