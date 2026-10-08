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

    test('getRestaurant does not select submitter email for public requests', async function() {
        db.query.mockResolvedValueOnce([{ restaurantId: 'restaurant-1', status: 'approved' }]);

        var restaurant = await restaurantService.getRestaurant({ restaurantId: 'restaurant-1' });
        var sql = db.query.mock.calls[0][0];

        expect(restaurant.restaurantId).toBe('restaurant-1');
        expect(sql).not.toContain('submitterEmail');
        expect(sql).not.toContain('u.email');
        expect(sql).toContain("AND r.status = 'approved'");
    });

    test('getRestaurant keeps submitter email for admin requests', async function() {
        db.query.mockResolvedValueOnce([{
            restaurantId: 'restaurant-1',
            status: 'pending',
            submitterEmail: 'reviewer@example.com'
        }]);

        var restaurant = await restaurantService.getRestaurant({
            restaurantId: 'restaurant-1',
            auth: { user: { isAdmin: 1 } }
        });
        var sql = db.query.mock.calls[0][0];

        expect(restaurant.submitterEmail).toBe('reviewer@example.com');
        expect(sql).toContain('u.email as submitterEmail');
        expect(sql).toContain('LEFT JOIN users u');
        expect(sql).not.toContain("AND r.status = 'approved'");
    });
});


describe('restaurant statistics aggregation', function() {
    var fixture;
    beforeEach(function() {
        var DatabaseSync = require('node:sqlite').DatabaseSync;
        fixture = new DatabaseSync(':memory:');
        // The aggregate queries use SQL shared by SQLite and MySQL.
        fixture.exec(`
            CREATE TABLE dishes (dishId TEXT, restaurantId TEXT, score REAL, reviewCount INTEGER, status TEXT);
            CREATE TABLE reviews (reviewId INTEGER, dishId TEXT, submitted INTEGER, status TEXT);
            INSERT INTO dishes VALUES
                ('dish-1', 'restaurant-1', 8, 3, 'approved'),
                ('dish-2', 'restaurant-1', 6, 1, 'approved'),
                ('pending', 'restaurant-1', 10, 4, 'pending');
        `);
        var insert = fixture.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?)');
        var now = Date.now();
        var old = now - 100 * 24 * 60 * 60 * 1000;
        [[1, 'dish-1', now, 'approved'], [2, 'dish-1', now, 'approved'],
            [3, 'dish-1', old, 'approved'], [4, 'dish-2', old, 'approved'],
            [5, 'dish-1', now, 'rejected'], [6, 'pending', now, 'approved']
        ].forEach(function(row) { insert.run(...row); });
        db.query.mockReset();
        db.query.mockImplementation(async function(sql, params) {
            return fixture.prepare(sql).all(...params);
        });
    });
    afterEach(function() { fixture.close(); });

    test('counts each dish and review once, with an average across dishes', async function() {
        await expect(restaurantService.getRestaurantStats('restaurant-1')).resolves.toEqual({
            dishCount: 2, avgScore: 7, totalReviews: 4, recentReviews: 2
        });
    });

    test('returns empty statistics when there are no approved dishes', async function() {
        await expect(restaurantService.getRestaurantStats('missing')).resolves.toEqual({
            dishCount: 0, avgScore: null, totalReviews: 0, recentReviews: 0
        });
    });
});
