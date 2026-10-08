var supertest = require('supertest');
var signature = require('cookie-signature');
process.env.env = 'test';
process.env.cookieSecret = 'test-cookie-secret';

jest.mock('../connections', function() { return { query: jest.fn() }; });
jest.mock('../api/authService', function() {
    return { getSession: jest.fn(), authenticate: jest.fn(), extendSession: jest.fn(), endSession: jest.fn() };
});
jest.mock('../api/dishService', function() { return { updateDish: jest.fn(), getDishes: jest.fn() }; });
jest.mock('../api/reviewService', function() { return { saveReview: jest.fn(), voteReview: jest.fn() }; });
jest.mock('../api/fileService', function() { return { saveFile: jest.fn() }; });
jest.mock('../aiJobQueue', function() { return { enqueueJob: jest.fn() }; });
jest.mock('@aws-sdk/client-s3', function() {
    return Object.assign({}, jest.requireActual('@aws-sdk/client-s3'), {
        S3Client: jest.fn(function() { this.send = jest.fn().mockResolvedValue({}); })
    });
});

var auth = require('../api/authService');
var dishes = require('../api/dishService');
var reviews = require('../api/reviewService');
var files = require('../api/fileService');
var sdk = require('@aws-sdk/client-s3');
var request = supertest(require('../app'));
var s3Clients = sdk.S3Client.mock.instances.slice();
var user = { userId: 'admin-1', isAdmin: 1, username: 'admin' };
var sessionCookie = 'sessionId=' + encodeURIComponent('s:' + signature.sign('old-session', process.env.cookieSecret));

beforeEach(function() {
    jest.clearAllMocks();
    auth.getSession.mockResolvedValue({ user: user });
});

async function write(method, path, body) {
    var bootstrap = await request.get('/api/session');
    var csrfCookie = bootstrap.headers['set-cookie'].find(function(cookie) { return cookie.startsWith('csrfToken='); });
    return request[method](path).set('Cookie', [csrfCookie, sessionCookie])
        .set('X-CSRF-Token', bootstrap.body.csrfToken).send(body);
}

test('logout uses CSRF-protected DELETE and GET has no side effects', async function() {
    expect((await request.get('/logout').set('Cookie', sessionCookie)).status).toBe(404);
    expect(auth.endSession).not.toHaveBeenCalled();
    expect((await request.delete('/api/session').set('Cookie', sessionCookie)).status).toBe(403);
    var response = await write('delete', '/api/session');
    expect(response.status).toBe(204);
    expect(auth.endSession).toHaveBeenCalledWith('old-session');
    expect(response.headers['set-cookie'].join()).toContain('Expires=Thu, 01 Jan 1970');
});

test('session renewal uses PATCH and replaces the signed cookie', async function() {
    auth.extendSession.mockResolvedValue({ sessionId: 'new-session', expiration: Date.now() + 60000 });
    var response = await write('patch', '/api/session');
    expect(response.status).toBe(200);
    expect(auth.extendSession).toHaveBeenCalledWith('old-session');
    expect(response.headers['set-cookie'].join()).toContain('new-session');
});

test('path IDs and verified auth override body input, and query strings cannot change writes', async function() {
    dishes.updateDish.mockResolvedValue({ updated: true });
    var response = await write('patch', '/api/dishes/target?status=rejected&dishId=query', {
        dishId: 'body', auth: { user: { userId: 'attacker' } }, name: 'Latte'
    });
    expect(response.status).toBe(200);
    expect(dishes.updateDish).toHaveBeenCalledWith({ dishId: 'target', name: 'Latte', auth: { user: user } });
});

test('review creation returns 201 and a resource Location', async function() {
    reviews.saveReview.mockResolvedValue({ reviewId: 123, message: 'Saved' });
    var response = await write('post', '/api/reviews', { rating: 8 });
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/api/reviews/123');
});

test('votes use PUT and reject invalid values before storage', async function() {
    reviews.voteReview.mockResolvedValue({ likeCount: 1, userVote: 1 });
    expect((await write('put', '/api/reviews/123/vote', { value: 1 })).status).toBe(200);
    expect(reviews.voteReview).toHaveBeenCalledWith('admin-1', 123, 1);
    reviews.voteReview.mockClear();
    expect((await write('put', '/api/reviews/123/vote', { value: 0 })).status).toBe(400);
    expect(reviews.voteReview).not.toHaveBeenCalled();
});

test('internal error details stay off the public API', async function() {
    dishes.updateDish.mockRejectedValue(new Error('SQL with private credentials'));
    var response = await write('patch', '/api/dishes/target', { name: 'Latte' });
    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Internal Server Error');
});

test('upload MIME comes from image bytes rather than the client header', async function() {
    var Jimp = require('jimp').Jimp;
    var buffer = await new Jimp({ width: 10, height: 10, color: 0xccaa88ff }).getBuffer('image/jpeg');
    var bootstrap = await request.get('/api/session');
    var csrfCookie = bootstrap.headers['set-cookie'].find(function(cookie) { return cookie.startsWith('csrfToken='); });
    var response = await request.post('/api/files').set('Cookie', [csrfCookie, sessionCookie])
        .set('X-CSRF-Token', bootstrap.body.csrfToken)
        .attach('file', buffer, { filename: 'image.html', contentType: 'text/html' });
    expect(response.status).toBe(201);
    expect(files.saveFile).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'jpeg', uploadedBy: 'admin-1' }));
    var writes = s3Clients.flatMap(function(client) { return client.send.mock.calls; });
    expect(writes).toHaveLength(3);
    writes.forEach(function(call) { expect(call[0].input.ContentType).toBe('image/jpeg'); });
});

test('oversized uploads return 413 before image processing or storage', async function() {
    var bootstrap = await request.get('/api/session');
    var csrfCookie = bootstrap.headers['set-cookie'].find(function(cookie) { return cookie.startsWith('csrfToken='); });
    var response = await request.post('/api/files').set('Cookie', [csrfCookie, sessionCookie])
        .set('X-CSRF-Token', bootstrap.body.csrfToken)
        .attach('file', Buffer.alloc(3 * 1024 * 1024), 'large.jpg');
    expect(response.status).toBe(413);
    expect(files.saveFile).not.toHaveBeenCalled();
});


test('profile updates read username from the body on the current-user resource', async function() {
    var users = require('../api/userService');
    var update = jest.spyOn(users, 'updateProfile').mockResolvedValue({ updated: true });
    var response = await write('patch', '/api/users/me', { username: 'newname', bio: 'Hello' });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith('admin-1', { username: 'newname', bio: 'Hello', avatarFileId: undefined });
    update.mockRestore();
});


test('HEAD uses the same collection query parameters as GET', async function() {
    dishes.getDishes.mockResolvedValue({ rows: [], total: 0 });
    var response = await request.head('/api/dishes?q=latte');
    expect(response.status).toBe(200);
    expect(dishes.getDishes).toHaveBeenCalledWith(expect.objectContaining({ q: 'latte' }));
});
