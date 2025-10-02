// google-places.js - Google Places Autocomplete for Platillos

(function() {
    function initAutocomplete() {
        var input = document.getElementById('confirmationCode');
        if (!input || !window.google || !google.maps || !google.maps.places) return;
        var autocomplete = new google.maps.places.Autocomplete(input, {
            types: ['address'],
            componentRestrictions: { country: 'us' }
        });
        window._platillosAutocomplete = autocomplete;
        autocomplete.addListener('place_changed', function() {
            window._platillosPlaceResult = autocomplete.getPlace();
        });
    }
    window.initAutocomplete = initAutocomplete;
    if (window.google && window.google.maps && window.google.maps.places) {
        initAutocomplete();
    } else {
        var oldCallback = window.onload;
        window.onload = function() {
            if (typeof oldCallback === 'function') oldCallback();
            initAutocomplete();
        };
    }
})();
