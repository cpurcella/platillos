var db = require('../connections');

jest.mock('../connections', function() {
    return {
        query: jest.fn(),
        getConnection: jest.fn()
    };
});

jest.mock('../config', function() {
    return {
        bucket: 'platillos-test'
    };
});

jest.mock('../ai/search', function() {
    return {
        getSearchMappings: jest.fn()
    };
});

var dishService = require('../api/dishService');

describe('dishService location WKT', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('getDishes passes longitude-latitude WKT for radius and nearest distance', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await dishService.getDishes({ lat: '35.0844', lng: '-106.6504', sort: 'nearest' });

        expect(db.query.mock.calls[0][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[0][1]).toEqual(['POINT(-106.6504 35.0844)']);
        expect(db.query.mock.calls[1][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[1][1].slice(0, 2)).toEqual([
            'POINT(-106.6504 35.0844)',
            'POINT(-106.6504 35.0844)'
        ]);
        expect(db.query.mock.calls[1][0]).toContain('ORDER BY distance ASC');
    });

    test('getHomeShelves passes longitude-latitude WKT to location-scoped shelves', async function() {
        db.query.mockResolvedValue([]);

        await dishService.getHomeShelves({ lat: '35.0844', lng: '-106.6504' });

        expect(db.query.mock.calls[0][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[0][1][1]).toBe('POINT(-106.6504 35.0844)');
        expect(db.query.mock.calls[1][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[1][1][1]).toBe('POINT(-106.6504 35.0844)');
        expect(db.query.mock.calls[3][0]).toContain("ST_GeomFromText(?, 4326, 'axis-order=long-lat')");
        expect(db.query.mock.calls[3][1][0]).toBe('POINT(-106.6504 35.0844)');
        expect(db.query.mock.calls[2][1]).toEqual([15]);
    });

    test('getDishes caps pageSize and calculates offset from the capped value', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await dishService.getDishes({ page: '3', pageSize: '500' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 200]);
    });

    test('getDishes filters by drink itemType', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await dishService.getDishes({ itemType: 'drink' });

        expect(db.query.mock.calls[0][0]).toContain('d.itemType = ?');
        expect(db.query.mock.calls[0][1]).toEqual(['drink']);
        expect(db.query.mock.calls[1][1].slice(-3)).toEqual(['drink', 10, 0]);
    });

    test('getDishes rejects invalid itemType', async function() {
        await expect(dishService.getDishes({ itemType: 'cocktail' })).rejects.toMatchObject({
            status: 400,
            message: 'Invalid item type'
        });
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('dishService dish score calculation', function() {
    test('calculateDishScore applies the stored dish score recency weights', function() {
        var now = Date.UTC(2026, 5, 1);
        var score = dishService.calculateDishScore([
            { rating: 10, submitted: Date.UTC(2026, 4, 25) },
            { rating: 4, submitted: Date.UTC(2026, 2, 1) },
            { rating: 8, submitted: Date.UTC(2025, 8, 1) },
            { rating: 2, submitted: Date.UTC(2024, 11, 1) },
            { rating: 1, submitted: Date.UTC(2023, 5, 1) }
        ], now);

        expect(score).toBe(7.6);
    });

    test('buildDishScoreTrend sorts reviews and includes a current score point', function() {
        var trend = dishService.buildDishScoreTrend([
            { reviewId: 2, rating: 10, submitted: Date.UTC(2026, 1, 1) },
            { reviewId: 1, rating: 6, submitted: Date.UTC(2026, 0, 1) }
        ], Date.UTC(2026, 5, 1));

        expect(trend.reviews.map(function(review) { return review.reviewId; })).toEqual([1, 2]);
        expect(trend.reviews[0].rollingScore).toBe(6);
        expect(trend.reviews[1].rollingScore).toBe(8.7);
        expect(trend.currentScore).toBe(8);
        expect(trend.scoreCalculatedAt).toBe(Date.UTC(2026, 5, 1));
    });
});
