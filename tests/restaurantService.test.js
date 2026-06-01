var db = require('../connections');

jest.mock('../connections', function() {
    return {
        query: jest.fn(),
        getConnection: jest.fn()
    };
});

jest.mock('../config', function() {
    return {
        googleMapsKey: 'test-google-maps-key'
    };
});

jest.mock('axios', function() {
    return {
        get: jest.fn()
    };
});

var restaurantService = require('../api/restaurantService');

describe('restaurantService location WKT', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('getRestaurants uses longitude-latitude WKT for distance ordering', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await restaurantService.getRestaurants({ useLocation: '1', lat: '35.0844', lng: '-106.6504' });

        expect(db.query.mock.calls[0][1]).toEqual([]);
        expect(db.query.mock.calls[1][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[1][1][0]).toBe('POINT(-106.6504 35.0844)');
        expect(db.query.mock.calls[1][0]).toContain('ORDER BY distance ASC');
    });

    test('getRestaurants caps pageSize and calculates offset from the capped value', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await restaurantService.getRestaurants({ page: '3', pageSize: '500' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 200]);
    });

    test('getRestaurants caps legacy take while preserving non-negative skip', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await restaurantService.getRestaurants({ take: '500', skip: '25' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 25]);
    });
});