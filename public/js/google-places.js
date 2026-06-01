// google-places.js - Google Places Autocomplete (New) for Platillos

(function() {
    async function initAutocomplete() {
        var container = document.getElementById('address-autocomplete');
        if (!container || !window.google || !google.maps) return;

        await google.maps.importLibrary('places');

        var autocomplete = new google.maps.places.PlaceAutocompleteElement({
            includedRegionCodes: ['us'],
            includedPrimaryTypes: ['street_address', 'subpremise', 'premise']
        });
        container.appendChild(autocomplete);

        autocomplete.addEventListener('gmp-select', async function(e) {
            var place = e.placePrediction.toPlace();
            await place.fetchFields({ fields: ['addressComponents', 'location'] });
            window._platillosPlace = place;
            var hidden = document.getElementById('addressSelected');
            if (hidden) hidden.value = '1';
        });
    }

    function tryInit() {
        if (window.google && window.google.maps) {
            initAutocomplete();
        } else {
            window.addEventListener('load', initAutocomplete);
        }
    }

    tryInit();
})();
