$(document).ready(function() {
    setHandlers();
    // Set minimum date to 1900-01-01 and maximum date for 13 years ago on DOB field
    $('#dob').attr('min', '1900-01-01');
    var today = new Date();
    today.setFullYear(today.getFullYear() - 13);
    var maxDob = today.toISOString().split('T')[0];
    $('#dob').attr('max', maxDob);
});

var softLaunchModule = {
    abqLat: 35.0844,
    abqLng: -106.6504,
    radiusMiles: 50
};

function calculateDistanceMiles(lat1, lng1, lat2, lng2) {
    var toRadians = function(value) { return value * Math.PI / 180; };
    var earthRadiusMiles = 3958.8;
    var dLat = toRadians(lat2 - lat1);
    var dLng = toRadians(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMiles * c;
}

function setHandlers() {
    $('#register-form').on('submit', onRegisterSubmit);
    $('#goToHomeBtn').on('click', onGoToHome);
}

async function onGoToHome() {
    try {
        var data = {
            email: $("#email").val(),
            password: $("#password").val()
        };
        var res = await common.secureAjax({
            url: '/api/auth/authenticate',
            method: 'POST',
            dataType: 'json',
            data: data
        });
        window.location.href = '/';
    } catch (err) {
        common.showAlert('Invalid email or password', 'error');
    }
}

async function onRegisterSubmit(e) {
    e.preventDefault();
    var form = e.target;
    if (!validate.validateForm(form)) return;
    var data = $(form).serializeObject();
    var email = data.email;
    var password = data.password;
    // Get address from new Places Autocomplete element
    var place = window._platillosPlace;
    if (place && place.addressComponents) {
        var streetNumber = '', route = '', city = '', state = '', zip = '', county = '';
        for (var i = 0; i < place.addressComponents.length; i++) {
            var comp = place.addressComponents[i];
            var types = comp.types || [];
            if (types.indexOf('street_number') !== -1) streetNumber = comp.longText;
            if (types.indexOf('route') !== -1) route = comp.longText;
            if (types.indexOf('locality') !== -1) city = comp.longText;
            if (types.indexOf('administrative_area_level_1') !== -1) state = comp.shortText;
            if (types.indexOf('postal_code') !== -1) zip = comp.longText;
            if (types.indexOf('administrative_area_level_2') !== -1) county = comp.longText;
        }
        data.addressStreet = (streetNumber ? streetNumber + ' ' : '') + route;
        data.addressCity = city;
        data.addressZip = zip;
        data.addressState = state;
        data.addressCounty = county;
        if (place.location) {
            data.addressLat = place.location.lat();
            data.addressLng = place.location.lng();
        }
    }

    if (data.addressLat && data.addressLng) {
        var distanceMiles = calculateDistanceMiles(
            parseFloat(data.addressLat),
            parseFloat(data.addressLng),
            softLaunchModule.abqLat,
            softLaunchModule.abqLng
        );
        if (distanceMiles > softLaunchModule.radiusMiles) {
            var proceed = window.confirm('Platillos is currently allowing restaurants from Albuquerque, New Mexico only. You can still create your account and use the app, but restaurant submissions outside Albuquerque will stay queued for later review. Continue?');
            if (!proceed) {
                return;
            }
        }
    }
    var recaptcha = $(form).find('.g-recaptcha-response').val();
    if (recaptcha) data.recaptcha = recaptcha;
    try {
        var response = await common.secureAjax({
            url: '/api/users/register',
            method: 'POST',
            data: data,
            dataType: 'json'
        });
        if (response.success) {
            try {
                var loginResponse = await common.secureAjax({
                    url: '/api/auth/authenticate',
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        email: email,
                        password: password
                    }
                });

                window.location.href = '/';
                return;
            } catch (authErr) {
                common.showAlert('Account created, but automatic login failed. Please sign in manually.', 'warning');
            }

            $('#register-form').addClass('hidden');
            $('#register-success-message').removeClass('hidden');
            $('#register-success-message').attr('tabindex', '-1').focus();
        } else {
            common.showAlert(response.message || 'Registration failed.', 'error');
            window.grecaptcha.reset();
        }
    } catch (err) {
        var msg = (err.responseJSON && err.responseJSON.message) || 'Registration failed. Please try again.';
        common.showAlert(msg, 'error');
        window.grecaptcha.reset();
    }
}
