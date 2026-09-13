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

describe('dishService dish photos', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('getDishPhotos returns approved dish review photos with capped pagination and S3 URLs', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 2 }])
            .mockResolvedValueOnce([
                {
                    reviewPhotoId: 11,
                    reviewId: 101,
                    fileId: 'reviews/photo-one.jpg',
                    reviewContent: 'Crispy edges.',
                    rating: 9,
                    submitted: 1717200000000,
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    username: 'ada',
                    avatarFileId: 'avatars/ada.jpg'
                },
                {
                    reviewPhotoId: 12,
                    reviewId: 102,
                    fileId: 'reviews/photo-two.jpg',
                    reviewContent: 'Great sauce.',
                    rating: 8,
                    submitted: 1717100000000,
                    firstName: null,
                    lastName: null,
                    username: 'grace',
                    avatarFileId: null
                }
            ]);

        var result = await dishService.getDishPhotos({
            dishId: 'dish-1',
            page: '2',
            pageSize: '500'
        });

        expect(result.total).toBe(2);
        expect(result.rows[0].url).toBe('https://platillos-test.s3.amazonaws.com/reviews/photo-one.jpg');
        expect(result.rows[0].avatarUrl).toBe('https://platillos-test.s3.amazonaws.com/avatars/ada.jpg');
        expect(result.rows[1].url).toBe('https://platillos-test.s3.amazonaws.com/reviews/photo-two.jpg');
        expect(result.rows[1].avatarUrl).toBeUndefined();

        expect(db.query.mock.calls[0][0]).toContain("LOWER(COALESCE(d.status, 'pending')) = 'approved'");
        expect(db.query.mock.calls[0][0]).toContain("LOWER(COALESCE(r.status, 'pending')) = 'approved'");
        expect(db.query.mock.calls[0][0]).toContain("LOWER(COALESCE(rv.status, 'pending')) = 'approved'");
        expect(db.query.mock.calls[0][0]).toContain("LOWER(COALESCE(rp.status, 'pending')) = 'approved'");
        expect(db.query.mock.calls[0][1]).toEqual(['dish-1']);
        expect(db.query.mock.calls[1][0]).toContain('ORDER BY rv.submitted DESC, rp.reviewPhotoId ASC');
        expect(db.query.mock.calls[1][1]).toEqual(['dish-1', 100, 100]);
    });

    test('getDishPhotos requires a dishId', async function() {
        await expect(dishService.getDishPhotos({})).rejects.toMatchObject({
            status: 400,
            message: 'dishId is required'
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
        expect(trend.reviews[1].overallAverage).toBe(8);
        expect(trend.summary.overall).toEqual({ average: 8, count: 2 });
        expect(trend.currentScore).toBe(8);
        expect(trend.scoreCalculatedAt).toBe(Date.UTC(2026, 5, 1));
    });
});

describe('dishService arithmetic rating summaries', function() {
    var now = Date.UTC(2026, 8, 12, 12);
    test('returns no averages for no ratings', function() {
        var summary = dishService.buildDishRatingSummary([], now);
        expect(summary.overall).toEqual({ average: null, count: 0 });
        expect(summary.recent).toEqual({ average: null, count: 0 });
    });

    test('includes old ratings in overall and weights every rating equally', function() {
        var summary = dishService.buildDishRatingSummary([
            { rating: 2, submitted: Date.UTC(2020, 0, 1) },
            { rating: 6, submitted: Date.UTC(2026, 6, 1) },
            { rating: 8, submitted: Date.UTC(2026, 7, 1) },
            { rating: '10', submitted: now }
        ], now);
        expect(summary.overall).toEqual({ average: 6.5, count: 4 });
        expect(summary.recent).toEqual({ average: 8, count: 3 });
    });

    test('includes the exact six-calendar-month boundary, not the millisecond before', function() {
        var cutoff = dishService.buildDishRatingSummary([], now).recentSince;
        var summary = dishService.buildDishRatingSummary([
            { rating: 10, submitted: cutoff },
            { rating: 2, submitted: cutoff - 1 }
        ], now);
        expect(summary.recent).toEqual({ average: 10, count: 1 });
        expect(summary.overall).toEqual({ average: 6, count: 2 });
    });

    test('clamps the six-month boundary to February at month-end', function() {
        var summary = dishService.buildDishRatingSummary([], new Date(2026, 7, 31, 12).getTime());
        expect(summary.recentSince).toBe(new Date(2026, 1, 28, 12).getTime());
    });

    test('does not fabricate recent scores from old reviews', function() {
        var summary = dishService.buildDishRatingSummary([{ rating: 9, submitted: Date.UTC(2020, 0, 1) }], now);
        expect(summary.overall).toEqual({ average: 9, count: 1 });
        expect(summary.recent).toEqual({ average: null, count: 0 });
    });

    test('excludes invalid ratings, invalid dates, and future reviews', function() {
        var rows = [null, '', 0, 11, 'bad', Infinity].map(function(rating) { return { rating: rating, submitted: now }; });
        rows.push({ rating: 9, submitted: null }, { rating: 9, submitted: 'bad' }, { rating: 9, submitted: now + 1 }, { rating: 7, submitted: now });
        var trend = dishService.buildDishScoreTrend(rows, now);
        expect(trend.summary.overall).toEqual({ average: 7, count: 1 });
        expect(trend.reviews).toHaveLength(1);
        expect(trend.reviews[0].overallAverage).toBe(7);
    });

    test('rounds once at the end and keeps the graph consistent with the summary', function() {
        var trend = dishService.buildDishScoreTrend([8, 9, 9].map(function(rating, index) {
            return { reviewId: index, rating: rating, submitted: now - index * 86400000 };
        }), now);
        expect(trend.summary.overall).toEqual({ average: 8.7, count: 3 });
        expect(trend.summary.recent).toEqual(trend.summary.overall);
        expect(trend.reviews[2].overallAverage).toBe(8.7);
    });
});
