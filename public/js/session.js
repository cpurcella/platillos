// session.js - Authentication and CSRF synchronization
var session = (function() {
    var state = 'checking';
    var user = null;
    var bootstrapPromise = null;
    var readyPromise = null;

    window.isLoggedIn = false;
    window._platillosUser = null;

    function setElementHidden($elements, hidden) {
        $elements.each(function() {
            this.hidden = hidden;
        });
    }

    function updateUserElements(currentUser) {
        if (!currentUser) return;

        var username = currentUser.username || '';
        var firstName = currentUser.firstName || '?';
        $('.js-user-profile-link').attr('href', username ? '/users/' + encodeURIComponent(username) : '#');
        $('.js-user-initial').text(firstName.charAt(0).toUpperCase());

        var $images = $('.js-user-avatar-image');
        var $initials = $('.js-user-avatar-initial');
        if (currentUser.avatarUrl) {
            $images.attr('src', currentUser.avatarUrl);
            setElementHidden($images, false);
            setElementHidden($initials, true);
        } else {
            setElementHidden($images, true);
            setElementHidden($initials, false);
        }

        setElementHidden($('.js-admin-link'), !currentUser.isAdmin);
    }

    function renderState() {
        var authenticated = state === 'authenticated';
        var anonymous = state === 'anonymous';
        var unavailable = state === 'checking' || state === 'unavailable';

        $('body').attr('data-auth-state', state);
        setElementHidden($('.auth-only'), !authenticated);
        setElementHidden($('.guest-only'), !anonymous);
        $('.logged-in-only')
            .toggleClass('auth-unavailable', unavailable)
            .attr('aria-disabled', unavailable ? 'true' : 'false');

        if (authenticated) {
            updateUserElements(user);
        }
        $(document).trigger('platillos:authchange', [{ state: state, user: user }]);
    }

    function setState(nextState, nextUser) {
        state = nextState;
        user = nextState === 'authenticated' ? (nextUser || null) : null;
        window.isLoggedIn = nextState === 'authenticated';
        window._platillosUser = user;
        renderState();
    }

    function showLoginPrompt() {
        if (typeof window.showLoginPopup === 'function') {
            window.showLoginPopup();
        } else {
            common.showAlert('Your session has expired. Please log in.', 'error');
        }
    }

    function handleAuthRequired() {
        setState('anonymous', null);
        showLoginPrompt();
    }

    function bootstrap(options) {
        options = options || {};
        if (bootstrapPromise) {
            return bootstrapPromise;
        }

        if (options.force || state === 'checking' || state === 'unavailable') {
            setState('checking', null);
        }

        bootstrapPromise = Promise.resolve($.ajax({
            url: '/api/session',
            method: 'GET',
            dataType: 'json',
            cache: false
        })).then(function(response) {
            common.setCsrfToken(response.csrfToken);
            if (response.authenticated) {
                setState('authenticated', response.user);
            } else {
                setState('anonymous', null);
            }
            return response;
        }).catch(function(err) {
            setState('unavailable', null);
            throw err;
        }).finally(function() {
            bootstrapPromise = null;
        });

        return bootstrapPromise;
    }

    async function extendSession() {
        if (state !== 'authenticated') return;
        try {
            var response = await $.ajax({
                url: '/api/session',
                method: 'PATCH',
                dataType: 'json'
            });
            if (response.user) {
                setState('authenticated', response.user);
            }
        } catch (err) {
            if (err && err.responseJSON && err.responseJSON.code === 'AUTH_REQUIRED') {
                setState('anonymous', null);
            }
            // A network failure must not claim that a validated session is anonymous.
        }
    }

    function initialize() {
        if (!readyPromise) {
            readyPromise = bootstrap()
                .then(function() {
                    extendSession();
                    return null;
                })
                .catch(function() { return null; });
        }
        return readyPromise;
    }

    async function requireAuth() {
        await initialize();
        try {
            await bootstrap({ force: true });
        } catch (err) {
            common.showAlert('Unable to verify your session. Please try again.', 'error');
            return false;
        }

        if (state !== 'authenticated') {
            showLoginPrompt();
            return false;
        }
        return true;
    }

    $(document).ready(function() {
        renderState();
        initialize();
    });

    window.addEventListener('pageshow', function(event) {
        if (!event.persisted) return;
        bootstrap({ force: true })
            .then(function() { return extendSession(); })
            .catch(function() { return null; });
    });

    return {
        ready: initialize,
        bootstrap: bootstrap,
        requireAuth: requireAuth,
        handleAuthRequired: handleAuthRequired,
        getState: function() { return state; }
    };
})();

window.session = session;
