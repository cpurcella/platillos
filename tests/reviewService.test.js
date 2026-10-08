var crypto = require('crypto');
var axios = require('axios');
var db = require('../connections');
var dishService = require('../api/dishService');
var aiJobQueue = require('../aiJobQueue');

jest.mock('../connections', function() {
    return {
        query: jest.fn(),
        getConnection: jest.fn()
    };
});

jest.mock('axios', function() {
    return {
        get: jest.fn()
    };
});

jest.mock('../config', function() {
    return {
        googleMapsKey: 'test-google-maps-key',
        bucket: 'platillos-test'
    };
});

jest.mock('../api/dishService', function() {
    return {
        setDishScores: jest.fn(),
        normalizeItemType: jest.fn(function(value) {
            if (!value) return undefined;
            var itemType = String(value).toLowerCase();
            if (itemType !== 'food' && itemType !== 'drink') {
                var err = new Error('Invalid item type');
                err.status = 400;
                throw err;
            }
            return itemType;
        }),
        addDishMetadata: jest.fn().mockResolvedValue()
    };
});

jest.mock('../aiJobQueue', function() {
    return {
        enqueueJob: jest.fn()
    };
});

jest.mock('crypto', function() {
    var actual = jest.requireActual('crypto');
    return Object.assign({}, actual, {
        randomUUID: jest.fn()
    });
});

var reviewService = require('../api/reviewService');

function buildParams(overrides) {
    return Object.assign({
        auth: { user: { userId: 'user-1' } },
        newRestaurant: true,
        newDish: true,
        rating: 9,
        review: 'Excellent',
        modifications: '',
        photos: [],
        newRestaurantData: {
            name: 'Green Chile Cafe',
            address: '123 Central Ave',
            city: 'Albuquerque',
            state: 'NM',
            zip: '87102'
        },
        newDishData: {
            name: 'Breakfast Burrito'
        }
    }, overrides || {});
}

function createConnection() {
    var queries = jest.fn();
    return {
        beginTransaction: jest.fn().mockResolvedValue(),
        query: queries,
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };
}

describe('reviewService.saveReview soft-launch behavior', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        crypto.randomUUID
            .mockReturnValueOnce('restaurant-1')
            .mockReturnValueOnce('dish-1');
    });

    test('falls back to city/state when geocoding fails for an Albuquerque restaurant', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 123 }]);

        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([]);
        axios.get.mockResolvedValue({ data: { results: [] } });

        var result = await reviewService.saveReview(buildParams());

        expect(result.heldForSoftLaunch).toBe(false);
        expect(result.awaitingApproval).toBe(true);
        expect(result.message).toContain('You can add another dish');

        var restaurantInsertParams = connection.query.mock.calls.find(c => /INSERT INTO restaurants/.test(c[0]))[1];
        expect(restaurantInsertParams[5]).toBe(0);
        expect(restaurantInsertParams[6]).toBe(0);
        expect(restaurantInsertParams[9]).toBe('pending');

        var dishInsertParams = connection.query.mock.calls.find(c => /INSERT INTO dishes/.test(c[0]))[1];
        expect(dishInsertParams[3]).toBe('food');
        expect(dishInsertParams[6]).toBe('pending');
        expect(dishService.addDishMetadata).toHaveBeenCalledWith(connection, 'dish-1', { name: 'Breakfast Burrito' });

        var reviewInsertParams = connection.query.mock.calls.find(c => /INSERT INTO reviews /.test(c[0]))[1];
        expect(reviewInsertParams[6]).toBe('approved');

        expect(aiJobQueue.enqueueJob).toHaveBeenCalledTimes(2);
        expect(aiJobQueue.enqueueJob).toHaveBeenNthCalledWith(1, 'evaluate_restaurant', 'restaurant-1');
        expect(aiJobQueue.enqueueJob).toHaveBeenNthCalledWith(2, 'evaluate_dish', 'dish-1');
        expect(dishService.setDishScores).toHaveBeenCalledWith('dish-1');
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    test('holds submissions when geocoding returns a valid out-of-area location', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 456 }]);

        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([]);
        axios.get.mockResolvedValue({
            data: {
                results: [
                    {
                        geometry: {
                            location: {
                                lat: 32.3199,
                                lng: -106.7637
                            }
                        }
                    }
                ]
            }
        });

        var result = await reviewService.saveReview(buildParams({
            newRestaurantData: {
                name: 'Far Away Diner',
                address: '456 Main St',
                city: 'Las Cruces',
                state: 'NM',
                zip: '88001'
            }
        }));

        expect(result.heldForSoftLaunch).toBe(true);

        var restaurantInsertParams = connection.query.mock.calls.find(c => /INSERT INTO restaurants/.test(c[0]))[1];
        expect(restaurantInsertParams[9]).toBe('out_of_area');

        var dishInsertParams = connection.query.mock.calls.find(c => /INSERT INTO dishes/.test(c[0]))[1];
        expect(dishInsertParams[3]).toBe('food');
        expect(dishInsertParams[6]).toBe('out_of_area');

        var reviewInsertParams = connection.query.mock.calls.find(c => /INSERT INTO reviews /.test(c[0]))[1];
        expect(reviewInsertParams[6]).toBe('out_of_area');

        expect(aiJobQueue.enqueueJob).not.toHaveBeenCalled();
        expect(dishService.setDishScores).not.toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    test('normalizes rating before inserting a review', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 789 }]);

        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([]);
        axios.get.mockResolvedValue({ data: { results: [] } });

        await reviewService.saveReview(buildParams({ rating: '7.46' }));

        var reviewInsertParams = connection.query.mock.calls.find(c => /INSERT INTO reviews /.test(c[0]))[1];
        expect(reviewInsertParams[0]).toBe(7.5);
    });

    test('saves new drink item type and initial metadata', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 321 }]);

        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([]);
        axios.get.mockResolvedValue({ data: { results: [] } });

        await reviewService.saveReview(buildParams({
            itemType: 'drink',
            newDishData: {
                name: 'House Margarita',
                itemType: 'drink',
                categories: [1],
                dishTypes: [2]
            }
        }));

        var dishInsertParams = connection.query.mock.calls.find(c => /INSERT INTO dishes/.test(c[0]))[1];
        expect(dishInsertParams[2]).toBe('House Margarita');
        expect(dishInsertParams[3]).toBe('drink');
        expect(dishService.addDishMetadata).toHaveBeenCalledWith(connection, 'dish-1', {
            name: 'House Margarita',
            itemType: 'drink',
            categories: [1],
            dishTypes: [2]
        });
    });

    test.each([
        [undefined, 'Rating is required'],
        [null, 'Rating is required'],
        ['', 'Rating is required'],
        ['abc', 'Rating must be between 1 and 10'],
        ['5abc', 'Rating must be between 1 and 10'],
        [0, 'Rating must be between 1 and 10'],
        [-1, 'Rating must be between 1 and 10'],
        [11, 'Rating must be between 1 and 10']
    ])('rejects invalid create rating %p', async function(rating, message) {
        await expect(reviewService.saveReview(buildParams({ rating: rating }))).rejects.toMatchObject({
            status: 400,
            message: message
        });
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe('reviewService.updateReview rating validation', function() {
    beforeEach(function() {
        jest.clearAllMocks();
    });

    test('normalizes valid rating updates', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[{ reviewId: 123, dishId: 'dish-1', status: 'approved' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.getConnection.mockResolvedValue(connection);

        var result = await reviewService.updateReview({
            auth: { user: { userId: 'admin-1' } },
            reviewId: 123,
            rating: '8.24'
        });

        expect(result.updated).toBe(true);
        expect(connection.query.mock.calls[1][1]).toEqual([8.2, 123]);
        expect(connection.commit).toHaveBeenCalled();
        expect(dishService.setDishScores).toHaveBeenCalledWith('dish-1');
    });

    test.each([
        [null, 'Rating is required'],
        ['', 'Rating is required'],
        ['abc', 'Rating must be between 1 and 10'],
        [0, 'Rating must be between 1 and 10'],
        [11, 'Rating must be between 1 and 10']
    ])('rejects invalid update rating %p', async function(rating, message) {
        await expect(reviewService.updateReview({ reviewId: 123, rating: rating })).rejects.toMatchObject({
            status: 400,
            message: message
        });
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe('reviewService.getReviews public response shape', function() {
    beforeEach(function() {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    function mockReviewQueries(row) {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([row])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
    }

    test('non-admin calls default to approved-only and omit PII and moderation fields', async function() {
        mockReviewQueries({
            reviewId: 12,
            rating: 9,
            reviewContent: 'Excellent',
            modifications: '',
            dishId: 'dish-1',
            submittedBy: 'user-1',
            submitted: 1710000000000,
            status: 'pending',
            statusUpdated: 1710000001000,
            statusUpdatedBy: 'admin-1',
            aiReasoning: 'Internal moderation note',
            dishName: 'Breakfast Burrito',
            restaurantName: 'Green Chile Cafe',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            username: 'janedoe',
            avatarFileId: 'avatar-1'
        });

        var result = await reviewService.getReviews({ dishId: 'dish-1' });
        var countSql = db.query.mock.calls[0][0];
        var dataSql = db.query.mock.calls[1][0];
        var row = result.rows[0];

        expect(countSql).toContain("r.status = 'approved'");
        expect(dataSql).not.toContain('u.email');
        expect(dataSql).not.toContain('r.aiReasoning');
        expect(row.email).toBeUndefined();
        expect(row.status).toBeUndefined();
        expect(row.statusUpdated).toBeUndefined();
        expect(row.statusUpdatedBy).toBeUndefined();
        expect(row.aiReasoning).toBeUndefined();
        expect(row.submittedBy).toBeUndefined();
        expect(row.avatarUrl).toBe('https://platillos-test.s3.amazonaws.com/avatar-1');
    });

    test.each(['pending', 'needs_review', 'out_of_area', 'rejected'])('non-admin cannot request %s reviews', async function(status) {
        await expect(reviewService.getReviews({ status: status })).rejects.toMatchObject({ status: 403 });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('admin calls keep moderation fields', async function() {
        mockReviewQueries({
            reviewId: 13,
            rating: 8,
            reviewContent: 'Needs a look',
            modifications: '',
            dishId: 'dish-2',
            submittedBy: 'user-2',
            submitted: 1710000000000,
            status: 'pending',
            statusUpdated: 1710000001000,
            statusUpdatedBy: 'admin-1',
            aiReasoning: 'Internal moderation note',
            dishName: 'Carne Adovada',
            restaurantName: 'Red Chile Cafe',
            firstName: '',
            lastName: '',
            email: 'reviewer@example.com',
            username: 'reviewer',
            avatarFileId: null
        });

        var result = await reviewService.getReviews({ auth: { user: { userId: 'admin-1', isAdmin: 1 } }, status: 'pending' });
        var dataSql = db.query.mock.calls[1][0];
        var row = result.rows[0];

        expect(dataSql).toContain('u.email');
        expect(dataSql).toContain('r.aiReasoning');
        expect(row.email).toBe('reviewer@example.com');
        expect(row.status).toBe('pending');
        expect(row.aiReasoning).toBe('Internal moderation note');
        expect(row.submittedBy).toBe('user-2');
    });

    test('caps review pageSize and calculates offset from the capped value', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await reviewService.getReviews({ page: '3', pageSize: '500' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 200]);
    });

    test('caps feed pageSize and calculates offset from the capped value', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        await reviewService.getFeed({ page: '2', pageSize: '500' });

        expect(db.query.mock.calls[1][1].slice(-2)).toEqual([100, 100]);
    });
});


test('review submissions cannot attach another users uploads', async function() {
    var connection = createConnection();
    connection.query.mockResolvedValueOnce([[]]);
    db.getConnection.mockResolvedValue(connection);
    await expect(reviewService.saveReview(buildParams({ photos: ['someone-elses-photo'] })))
        .rejects.toMatchObject({ status: 403 });
    expect(connection.query).toHaveBeenCalledWith(
        'SELECT fileId FROM files WHERE fileId IN (?) AND uploadedBy = ?',
        [['someone-elses-photo'], 'user-1']
    );
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
});
