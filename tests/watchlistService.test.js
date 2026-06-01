var db = require('../connections');

jest.mock('../connections', function() {
    return {
        query: jest.fn()
    };
});

jest.mock('../config', function() {
    return {
        bucket: 'platillos-test'
    };
});

var watchlistService = require('../api/watchlistService');

describe('watchlistService pagination', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('getWatchlist caps pageSize and returns normalized pagination', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        var result = await watchlistService.getWatchlist('user-1', '3', '500');

        expect(db.query.mock.calls[1][1]).toEqual(['user-1', 100, 200]);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(100);
    });
});