var supertest = require('supertest');
process.env.env = 'test';
process.env.cookieSecret = 'test-cookie-secret';

var db = require('../connections');
var authService = require('../api/authService');

// Mock DB and external services
jest.mock('../connections', function() {
    var query = jest.fn();
    return {
        query: query,
        getConnection: jest.fn().mockResolvedValue({
            query: query,
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        })
    };
});

jest.mock('bcrypt', function() {
    return {
        hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
        compare: jest.fn()
    };
});

jest.mock('../api/authService', function() {
    return {
        verifyRecaptchaToken: jest.fn().mockResolvedValue(),
        getSession: jest.fn().mockRejectedValue(new Error('no session')),
        startSession: jest.fn(),
        endSession: jest.fn()
    };
});

var app = require('../app');
var request = supertest(app);

function getCsrf(res) {
    var match = res.text.match(/<meta name="csrf-token" content="([^"]+)">/);
    var cookies = res.headers['set-cookie'] || [];
    return {
        token: match && match[1],
        cookie: cookies.find(function(cookie) { return cookie.indexOf('csrfToken=') === 0; })
    };
}

async function postWithCsrf(path, body) {
    var csrf = getCsrf(await request.get('/register'));
    return request.post(path)
        .set('Cookie', csrf.cookie)
        .set('X-CSRF-Token', csrf.token)
        .send(body);
}

function validBody() {
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
        recaptcha: 'fake-token'
    };
}

describe('POST /api/users', function() {
    beforeEach(function() {
        db.query.mockReset();
        authService.verifyRecaptchaToken.mockReset();
        authService.verifyRecaptchaToken.mockResolvedValue();
    });

    test('returns 201 on successful registration', async function() {
        db.query.mockResolvedValueOnce([]);  // username check
        db.query.mockResolvedValueOnce([]);  // email check
        db.query.mockResolvedValueOnce({ insertId: 1 }); // users INSERT
        db.query.mockResolvedValueOnce({ insertId: 1 }); // userAuth INSERT

        var res = await postWithCsrf('/api/users', validBody());

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('returns 400 when required field is missing', async function() {
        var body = validBody();
        delete body.email;

        var res = await postWithCsrf('/api/users', body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Missing required field: email');
    });

    test('returns 400 for duplicate username', async function() {
        db.query.mockResolvedValueOnce([{ userId: 'existing' }]); // username taken

        var res = await postWithCsrf('/api/users', validBody());

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Username is already taken');
    });

    test('returns 400 for duplicate email', async function() {
        db.query.mockResolvedValueOnce([]); // username ok
        db.query.mockResolvedValueOnce([{ userId: 'existing' }]); // email taken

        var res = await postWithCsrf('/api/users', validBody());

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Email is already registered');
    });

    test('returns 400 when recaptcha fails', async function() {
        authService.verifyRecaptchaToken.mockRejectedValue(Object.assign(new Error('Invalid recaptcha.'), { status: 400 }));

        var res = await postWithCsrf('/api/users', validBody());

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid recaptcha');
    });

    test('returns 400 for invalid username format', async function() {
        var body = validBody();
        body.username = 'no spaces!';

        var res = await postWithCsrf('/api/users', body);

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('letters, numbers, and underscores only');
    });
});
