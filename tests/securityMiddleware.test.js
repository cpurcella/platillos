var supertest = require('supertest');

process.env.env = 'prod';
process.env.cookieSecret = 'test-cookie-secret';

jest.mock('../connections', function() {
    return { query: jest.fn() };
});

jest.mock('../api/authService', function() {
    return {
        authenticate: jest.fn(),
        getSession: jest.fn().mockRejectedValue(new Error('no session')),
        extendSession: jest.fn(),
        endSession: jest.fn()
    };
});

var authService = require('../api/authService');
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

describe('security middleware', function() {
    beforeEach(function() {
        authService.authenticate.mockReset();
    });

    test('rendered pages include a CSRF token and signed CSRF cookie', async function() {
        var res = await request.get('/login');
        var csrf = getCsrf(res);

        expect(res.status).toBe(200);
        expect(csrf.token).toMatch(/^[a-f0-9]{64}$/);
        expect(csrf.cookie).toContain('csrfToken=s%3A');
        expect(csrf.cookie).toContain('SameSite=Lax');
        expect(csrf.cookie).toContain('Secure');
    });

    test('unsafe API requests without a CSRF token are rejected', async function() {
        var res = await request.post('/api/auth/authenticate').send({ email: 'jane@example.com', password: 'secret' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Invalid CSRF token.');
        expect(authService.authenticate).not.toHaveBeenCalled();
    });

    test('unsafe API requests with a valid CSRF token reach the route', async function() {
        authService.authenticate.mockResolvedValueOnce({
            session: {
                sessionId: 'session-1',
                expiration: Date.now() + 60000
            },
            redirect: '/'
        });

        var csrf = getCsrf(await request.get('/login'));
        var res = await request.post('/api/auth/authenticate')
            .set('Cookie', csrf.cookie)
            .set('X-CSRF-Token', csrf.token)
            .send({ email: 'jane@example.com', password: 'secret' });

        var sessionCookie = (res.headers['set-cookie'] || []).find(function(cookie) {
            return cookie.indexOf('sessionId=') === 0;
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(authService.authenticate).toHaveBeenCalledWith('jane@example.com', 'secret');
        expect(sessionCookie).toContain('HttpOnly');
        expect(sessionCookie).toContain('SameSite=Lax');
        expect(sessionCookie).toContain('Secure');
    });

    test('safe API requests do not require a CSRF header', async function() {
        var res = await request.get('/api/users/search?q=');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});