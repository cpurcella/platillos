var db = require('../connections');
var bcrypt = require('bcrypt');
var userService = require('../api/userService');

// Mock the database
jest.mock('../connections', function() {
    return { query: jest.fn() };
});

// Speed up bcrypt for tests
jest.mock('bcrypt', function() {
    return {
        hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
        compare: jest.fn()
    };
});

function validData() {
    return {
        firstName: 'Jane',
        lastName: 'Doe',
        dob: '1995-06-15',
        email: 'jane@example.com',
        phone: '5551234567',
        password: 'securepassword123',
        agreedToTerms: '1',
        consentSms: '1',
        username: 'janedoe',
        optInUpdates: '0'
    };
}

describe('registerUser', function() {
    beforeEach(function() {
        db.query.mockReset();
    });

    test('succeeds with valid data', async function() {
        // username check returns no rows
        db.query.mockResolvedValueOnce([]);
        // email check returns no rows
        db.query.mockResolvedValueOnce([]);
        // INSERT into users
        db.query.mockResolvedValueOnce({ insertId: 1 });
        // INSERT into userAuth
        db.query.mockResolvedValueOnce({ insertId: 1 });

        await expect(userService.registerUser(validData())).resolves.toBeUndefined();
        expect(db.query).toHaveBeenCalledTimes(4);
    });

    test('inserts correct columns into users table', async function() {
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce({ insertId: 1 });
        db.query.mockResolvedValueOnce({ insertId: 1 });

        await userService.registerUser(validData());

        var usersInsertCall = db.query.mock.calls[2];
        var sql = usersInsertCall[0];
        var params = usersInsertCall[1];

        expect(sql).toContain('INSERT INTO users');
        expect(params[1]).toBe('janedoe'); // username lowercased
        expect(params[2]).toBe('Jane');
        expect(params[3]).toBe('Doe');
        expect(params[4]).toBe('1995-06-15');
        expect(params[5]).toBe('jane@example.com');
        expect(params[6]).toBe('5551234567');
        // 20 params + NULL literal in SQL = 21 columns
        expect(params).toHaveLength(20);
    });

    test('inserts into userAuth with hashed password', async function() {
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce({ insertId: 1 });
        db.query.mockResolvedValueOnce({ insertId: 1 });

        await userService.registerUser(validData());

        var authInsertCall = db.query.mock.calls[3];
        var sql = authInsertCall[0];
        var params = authInsertCall[1];

        expect(sql).toContain('INSERT INTO userAuth');
        expect(params[1]).toBe('$2b$12$hashedpassword');
        expect(params[2]).toHaveLength(64); // emailToken is 32 random bytes as hex
    });

    test.each([
        'firstName', 'lastName', 'dob', 'email', 'phone',
        'password', 'agreedToTerms', 'consentSms', 'username'
    ])('rejects when %s is missing', async function(field) {
        var data = validData();
        delete data[field];

        await expect(userService.registerUser(data)).rejects.toThrow('Missing required field: ' + field);
    });

    test('rejects invalid username format', async function() {
        var data = validData();
        data.username = 'no spaces!';

        await expect(userService.registerUser(data)).rejects.toThrow('letters, numbers, and underscores only');
    });

    test('rejects username shorter than 3 characters', async function() {
        var data = validData();
        data.username = 'ab';

        await expect(userService.registerUser(data)).rejects.toThrow('3–30 characters');
    });

    test('rejects duplicate username', async function() {
        // username check returns a row
        db.query.mockResolvedValueOnce([{ userId: 'existing-id' }]);

        var data = validData();
        await expect(userService.registerUser(data)).rejects.toThrow('Username is already taken');
    });

    test('rejects duplicate email', async function() {
        // username check passes
        db.query.mockResolvedValueOnce([]);
        // email check returns a row
        db.query.mockResolvedValueOnce([{ userId: 'existing-id' }]);

        var data = validData();
        await expect(userService.registerUser(data)).rejects.toThrow('Email is already registered');
    });

    test('lowercases username', async function() {
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce({ insertId: 1 });
        db.query.mockResolvedValueOnce({ insertId: 1 });

        var data = validData();
        data.username = 'JaneDoe';
        await userService.registerUser(data);

        var usernameCheckCall = db.query.mock.calls[0];
        expect(usernameCheckCall[1][0]).toBe('janedoe');
    });

    test('handles missing address fields gracefully', async function() {
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce({ insertId: 1 });
        db.query.mockResolvedValueOnce({ insertId: 1 });

        var data = validData();
        // No address fields set
        await userService.registerUser(data);

        var params = db.query.mock.calls[2][1];
        // addressStreet through addressCounty should be ''
        expect(params[7]).toBe('');
        expect(params[8]).toBe('');
        expect(params[9]).toBe('');
        expect(params[10]).toBe('');
        expect(params[11]).toBe('');
        // lat/lng should be null
        expect(params[12]).toBeNull();
        expect(params[13]).toBeNull();
    });

    test('passes address fields when provided', async function() {
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce([]);
        db.query.mockResolvedValueOnce({ insertId: 1 });
        db.query.mockResolvedValueOnce({ insertId: 1 });

        var data = validData();
        data.addressStreet = '123 Main St';
        data.addressCity = 'Austin';
        data.addressZip = '78701';
        data.addressState = 'TX';
        data.addressCounty = 'Travis';
        data.addressLat = 30.267;
        data.addressLng = -97.743;
        await userService.registerUser(data);

        var params = db.query.mock.calls[2][1];
        expect(params[7]).toBe('123 Main St');
        expect(params[8]).toBe('Austin');
        expect(params[9]).toBe('78701');
        expect(params[10]).toBe('TX');
        expect(params[11]).toBe('Travis');
        expect(params[12]).toBe(30.267);
        expect(params[13]).toBe(-97.743);
    });
});

describe('userService.updateProfile avatar ownership', function() {
    beforeEach(function() {
        db.query.mockReset();
    });

    test.each(['', null])('allows clearing avatar with %p without a file lookup', async function(avatarFileId) {
        db.query.mockResolvedValueOnce({ affectedRows: 1 });

        var result = await userService.updateProfile('user-1', { avatarFileId: avatarFileId });

        expect(result.updated).toBe(true);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('UPDATE users SET avatarFileId = ?');
        expect(db.query.mock.calls[0][1]).toEqual([null, 'user-1']);
    });

    test('allows avatar files uploaded by the current user', async function() {
        db.query
            .mockResolvedValueOnce([{ fileId: 'avatar-1' }])
            .mockResolvedValueOnce({ affectedRows: 1 });

        var result = await userService.updateProfile('user-1', { avatarFileId: 'avatar-1' });

        expect(result.updated).toBe(true);
        expect(db.query.mock.calls[0][0]).toContain('FROM files');
        expect(db.query.mock.calls[0][1]).toEqual(['avatar-1', 'user-1']);
        expect(db.query.mock.calls[1][0]).toContain('UPDATE users SET avatarFileId = ?');
        expect(db.query.mock.calls[1][1]).toEqual(['avatar-1', 'user-1']);
    });

    test('rejects avatar files that are missing or owned by another user', async function() {
        db.query.mockResolvedValueOnce([]);

        await expect(userService.updateProfile('user-1', { avatarFileId: 'avatar-2' })).rejects.toMatchObject({
            status: 400,
            message: 'Avatar file not found or not owned by you.'
        });

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('FROM files');
        expect(db.query.mock.calls[0][1]).toEqual(['avatar-2', 'user-1']);
    });

    test('updates bio without querying files', async function() {
        db.query.mockResolvedValueOnce({ affectedRows: 1 });

        var result = await userService.updateProfile('user-1', { bio: 'Updated bio' });

        expect(result.updated).toBe(true);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('UPDATE users SET bio = ?');
        expect(db.query.mock.calls[0][1]).toEqual(['Updated bio', 'user-1']);
    });
});

describe('userService pagination caps', function() {
    beforeEach(function() {
        db.query.mockReset();
    });

    test('getPaginatedFavorites caps pageSize and returns normalized pagination', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        var result = await userService.getPaginatedFavorites('user-1', '3', '500');

        expect(db.query.mock.calls[1][1]).toEqual(['user-1', 100, 200]);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(100);
    });

    test('getPaginatedReviews caps pageSize and returns normalized pagination', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        var result = await userService.getPaginatedReviews('user-1', '3', '500');

        expect(db.query.mock.calls[1][1]).toEqual(['user-1', 100, 200]);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(100);
    });

    test('getFollowers caps pageSize and returns normalized pagination', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        var result = await userService.getFollowers('user-1', '3', '500');

        expect(db.query.mock.calls[1][1]).toEqual(['user-1', 100, 200]);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(100);
    });

    test('getFollowing caps pageSize and returns normalized pagination', async function() {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        var result = await userService.getFollowing('user-1', '3', '500');

        expect(db.query.mock.calls[1][1]).toEqual(['user-1', 100, 200]);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(100);
    });

    test('searchUsers caps limit at 50', async function() {
        db.query.mockResolvedValueOnce([]);

        await userService.searchUsers('jane', '500');

        expect(db.query.mock.calls[0][1][3]).toBe(50);
    });
});
