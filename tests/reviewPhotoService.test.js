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

    test('getReviewPhotos strips reviewer email from public responses', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([{
                reviewPhotoId: 7,
                reviewId: 12,
                fileId: 'file-1',
                status: 'approved',
                statusUpdated: 1710000000000,
                statusUpdatedBy: 'admin-1',
                aiReasoning: 'internal note',
                reviewContent: 'Great',
                rating: 9,
                reviewSubmitted: 1710000000000,
                reviewStatus: 'approved',
                dishName: 'Taco',
                restaurantName: 'Cafe',
                fileName: 'photo.jpg',
                fileType: 'jpg',
                size: 123,
                uploaded: 1710000000000,
                uploadedBy: 'user-1',
                reviewerFirstName: 'Jane',
                reviewerLastName: 'Doe',
                reviewerEmail: 'jane@example.com'
            }]);

        var result = await reviewPhotoService.getReviewPhotos({});
        var sql = db.query.mock.calls[1][0];
        var row = result.rows[0];

        expect(sql).not.toContain('reviewerEmail');
        expect(sql).not.toContain('u.email');
        expect(row.reviewerEmail).toBeUndefined();
        expect(row.uploadedBy).toBeUndefined();
        expect(row.statusUpdated).toBeUndefined();
        expect(row.statusUpdatedBy).toBeUndefined();
        expect(row.aiReasoning).toBeUndefined();
        expect(row.reviewerName).toBe('Jane Doe');
    });

    test('getReviewPhotos keeps reviewer email for admin responses', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([{
                reviewPhotoId: 7,
                reviewId: 12,
                fileId: 'file-1',
                status: 'pending',
                reviewerFirstName: 'Jane',
                reviewerLastName: 'Doe',
                reviewerEmail: 'jane@example.com'
            }]);

        var result = await reviewPhotoService.getReviewPhotos({
            auth: { user: { isAdmin: 1 } },
            status: 'pending'
        });
        var sql = db.query.mock.calls[1][0];

        expect(sql).toContain('u.email AS reviewerEmail');
        expect(result.rows[0].reviewerEmail).toBe('jane@example.com');
    });
});
