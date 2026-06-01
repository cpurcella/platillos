var ALBUQUERQUE = {
    lat: 35.0844,
    lng: -106.6504,
    city: 'albuquerque',
    state: 'nm'
};

var SOFT_LAUNCH_RADIUS_MILES = 50;
var EARTH_RADIUS_MILES = 3958.8;

function toRadians(value) {
    return value * Math.PI / 180;
}

function parseNumber(value) {
    var num = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(num) ? null : num;
}

function calculateDistanceMiles(lat1, lng1, lat2, lng2) {
    var dLat = toRadians(lat2 - lat1);
    var dLng = toRadians(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_MILES * c;
}

function evaluateLocation(location) {
    location = location || {};

    var lat = parseNumber(location.lat);
    var lng = parseNumber(location.lng);
    if (lat !== null && lng !== null) {
        var distanceMiles = calculateDistanceMiles(lat, lng, ALBUQUERQUE.lat, ALBUQUERQUE.lng);
        return {
            isOutsideLaunchArea: distanceMiles > SOFT_LAUNCH_RADIUS_MILES,
            distanceMiles: distanceMiles
        };
    }

    var city = String(location.city || '').trim().toLowerCase();
    var state = String(location.state || '').trim().toLowerCase();
    if (city && state) {
        return {
            isOutsideLaunchArea: city !== ALBUQUERQUE.city || state !== ALBUQUERQUE.state,
            distanceMiles: null
        };
    }

    return {
        isOutsideLaunchArea: false,
        distanceMiles: null
    };
}

module.exports = {
    ALBUQUERQUE: ALBUQUERQUE,
    SOFT_LAUNCH_RADIUS_MILES: SOFT_LAUNCH_RADIUS_MILES,
    calculateDistanceMiles: calculateDistanceMiles,
    evaluateLocation: evaluateLocation
};