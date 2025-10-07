$(document).ready(function() {
    setHandlers();
    // Set minimum date to 1900-01-01 and maximum date for 13 years ago on DOB field
    $('#dob').attr('min', '1900-01-01');
    var today = new Date();
    today.setFullYear(today.getFullYear() - 13);
    var maxDob = today.toISOString().split('T')[0];
    $('#dob').attr('max', maxDob);
});

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
        var res = await $.ajax({
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
    // Get address components from Google Places Autocomplete directly
    var place = window._platillosAutocomplete.getPlace();
    if (place && place.address_components) {
        var streetNumber = '', route = '', city = '', state = '', zip = '', county = '', country = '';
        for (var i = 0; i < place.address_components.length; i++) {
            var comp = place.address_components[i];
            var type = comp.types[0];
            if (type === 'street_number') streetNumber = comp.long_name;
            if (type === 'route') route = comp.long_name;
            if (type === 'locality') city = comp.long_name;
            if (type === 'administrative_area_level_1') state = comp.short_name;
            if (type === 'postal_code') zip = comp.long_name;
            if (type === 'administrative_area_level_2') county = comp.long_name;
            if (type === 'country') country = comp.short_name;
        }
        data.addressStreet = (streetNumber ? streetNumber + ' ' : '') + route;
        data.addressCity = city;
        data.addressZip = zip;
        data.addressState = state;
        data.addressCounty = county;
        if (place.geometry && place.geometry.location) {
            data.addressLat = place.geometry.location.lat();
            data.addressLng = place.geometry.location.lng();
        }
    }
    var recaptcha = $(form).find('.g-recaptcha-response').val();
    if (recaptcha) data.recaptcha = recaptcha;
    try {
        var response = await $.ajax({
            url: '/api/users/register',
            method: 'POST',
            data: data,
            dataType: 'json'
        });
        if (response.success) {
            try {
                var loginResponse = await $.ajax({
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
        common.showAlert('Registration failed. Please try again.', 'error');
        window.grecaptcha.reset();
    }
}
