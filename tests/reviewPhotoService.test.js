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

jest.mock('../ai/reviewPhotos', function() {
    return {
        rotateStoredPhoto: jest.fn()
    };
});

var reviewPhotoService = require('../api/reviewPhotoService');

describe('reviewPhotoService pagination', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('getReviewPhotos caps pageSize and calculates offset from the capped value', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await reviewPhotoService.getReviewPhotos({ page: '2', pageSize: '500' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 100]);
    });
});