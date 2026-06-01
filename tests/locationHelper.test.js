var locationHelper = require('../api/locationHelper');

describe('locationHelper.buildPointWkt', function() {
    test('builds MySQL WKT in longitude-latitude order', function() {
        expect(locationHelper.buildPointWkt(35.0844, -106.6504)).toBe('POINT(-106.6504 35.0844)');
    });

    test('accepts numeric strings', function() {
        expect(locationHelper.buildPointWkt('35.0844', '-106.6504')).toBe('POINT(-106.6504 35.0844)');
    });

    test('accepts coordinate boundaries', function() {
        expect(locationHelper.buildPointWkt(90, 180)).toBe('POINT(180 90)');
        expect(locationHelper.buildPointWkt(-90, -180)).toBe('POINT(-180 -90)');
    });

    test('builds MySQL geometry expression with explicit long-lat axis order', function() {
        expect(locationHelper.pointFromWktSql()).toBe("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
    });

    test.each([
        [91, -106.6504],
        [-91, -106.6504],
        [35.0844, 181],
        [35.0844, -181],
        ['north', -106.6504],
        [35.0844, 'west']
    ])('rejects invalid coordinates %s, %s', function(lat, lng) {
        expect(function() {
            locationHelper.buildPointWkt(lat, lng);
        }).toThrow('Invalid coordinates');
    });
});