// session.js - Session utility functions for Platillos

var session = (function() {
    async function extendSession() {
        try {

            window.isLoggedIn = true;
            await $.ajax({
                url: '/api/auth/extendSession',
                method: 'POST',
                dataType: 'json'
            });
        } catch (err) {
            clearSession();
        }
    }

    function clearSession() {
        window.isLoggedIn = false;
    }



    $(document).ready(async function() {
        await extendSession();
    });


})();
