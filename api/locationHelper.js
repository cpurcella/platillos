function parseCoordinate(value) {
    var num = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(num) ? null : num;
}

function buildPointWkt(lat, lng) {
    var parsedLat = parseCoordinate(lat);
    var parsedLng = parseCoordinate(lng);
    if (parsedLat === null || parsedLng === null || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
        var err = new Error('Invalid coordinates');
        err.status = 400;
        throw err;
    }
    return 'POINT(' + parsedLng + ' ' + parsedLat + ')';
}

function pointFromWktSql() {
    return "ST_GeomFromText(?, 4326, 'axis-order=long-lat')";
}

module.exports = {
    buildPointWkt: buildPointWkt,
    pointFromWktSql: pointFromWktSql
};