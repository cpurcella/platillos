// session.js - Session utility functions for Platillos

var session = (function() {
    async function extendSession() {
        try {

            window.isLoggedIn = true;
            var res = await $.ajax({
                url: '/api/auth/extendSession',
                method: 'POST',
                dataType: 'json'
            });
            if (res && res.user) {
                window._platillosUser = res.user;
            }
        } catch (err) {
            clearSession();
        }
    }

    function clearSession() {
        window.isLoggedIn = false;
        window._platillosUser = null;
    }



    var _ready = null;
    $(document).ready(function() {
        _ready = extendSession();
    });

    return {
        ready: function() { return _ready || Promise.resolve(); }
    };
})();
