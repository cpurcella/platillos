var supertest = require('supertest');
var signature = require('cookie-signature');

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

function signedSessionCookie(sessionId) {
    return 'sessionId=' + encodeURIComponent('s:' + signature.sign(sessionId, process.env.cookieSecret));
}

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
        authService.getSession.mockReset();
        authService.getSession.mockRejectedValue(new Error('no session'));
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
        var res = await request.post('/api/session').send({ email: 'jane@example.com', password: 'secret' });

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
        var res = await request.post('/api/session')
            .set('Cookie', csrf.cookie)
            .set('X-CSRF-Token', csrf.token)
            .send({ email: 'jane@example.com', password: 'secret' });

        var sessionCookie = (res.headers['set-cookie'] || []).find(function(cookie) {
            return cookie.indexOf('sessionId=') === 0;
        });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(authService.authenticate).toHaveBeenCalledWith('jane@example.com', 'secret');
        expect(sessionCookie).toContain('HttpOnly');
        expect(sessionCookie).toContain('SameSite=Lax');
        expect(sessionCookie).toContain('Secure');
    });

    test('safe API requests do not require a CSRF header', async function() {
        var res = await request.get('/api/users?q=');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('client-supplied auth params cannot satisfy admin authorization', async function() {
        var csrf = getCsrf(await request.get('/login'));
        var res = await request.patch('/api/dishes/dish-1')
            .set('Cookie', csrf.cookie)
            .set('X-CSRF-Token', csrf.token)
            .send({
                auth: { user: { userId: 'attacker', isAdmin: 1 } },
                status: 'approved'
            });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('admin users API rejects non-admin sessions', async function() {
        authService.getSession.mockResolvedValueOnce({
            user: { userId: 'user-1', isAdmin: 0 }
        });

        var res = await request.get('/api/users?view=admin').set('Cookie', signedSessionCookie('session-1'));

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('client-supplied auth params cannot satisfy admin users API authorization', async function() {
        var res = await request.get('/api/users?view=admin&auth[user][isAdmin]=1');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('admin users API returns paginated data for admins', async function() {
        var db = require('../connections');
        authService.getSession.mockResolvedValueOnce({
            user: { userId: 'admin-1', isAdmin: 1 }
        });
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([{ userId: 'user-1', username: 'janedoe' }]);

        var res = await request.get('/api/users?view=admin&page=1&pageSize=10').set('Cookie', signedSessionCookie('session-1'));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: [{ userId: 'user-1', username: 'janedoe' }],
            total: 1
        });
    });

    test('admin page requires login for /admin', async function() {
        var res = await request.get('/admin');

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/login');
    });

    test('admin page rejects non-admin sessions', async function() {
        authService.getSession.mockResolvedValueOnce({
            user: { userId: 'user-1', isAdmin: 0 }
        });

        var res = await request.get('/admin').set('Cookie', signedSessionCookie('session-1'));

        expect(res.status).toBe(403);
        expect(res.text).toBe('Forbidden');
    });

    test('admin page renders for admins and legacy approvals route redirects', async function() {
        authService.getSession
            .mockResolvedValueOnce({ user: { userId: 'admin-1', isAdmin: 1 } })
            .mockResolvedValueOnce({ user: { userId: 'admin-1', isAdmin: 1 } });

        var adminRes = await request.get('/admin').set('Cookie', signedSessionCookie('session-1'));
        var legacyRes = await request.get('/admin/approvals').set('Cookie', signedSessionCookie('session-1'));

        expect(adminRes.status).toBe(200);
        expect(adminRes.text).toContain('<title>Platillos - Admin</title>');
        expect(adminRes.text).toContain('id="tab-users"');
        expect(legacyRes.status).toBe(302);
        expect(legacyRes.headers.location).toBe('/admin');
    });
});
