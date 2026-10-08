jest.mock('../connections', function() { return { query: jest.fn() }; });
jest.mock('../ai/photoFraming', function() { return { apply: jest.fn() }; });
var express = require('express');
var supertest = require('supertest');
var db = require('../connections');
var framing = require('../ai/photoFraming');
var user;
var app = express();
app.use(express.json());
app.use(function(req, res, next) { req.auth = { user: user }; next(); });
app.use('/files', require('../api/files'));
beforeEach(function() {
    jest.clearAllMocks();
    user = { userId: 'owner' };
    db.query.mockResolvedValue([{ fileId: 'photo', uploadedBy: 'owner' }]);
    framing.apply.mockResolvedValue({ source: 'manual' });
});
var box = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
test('only an authenticated owner or admin may change framing', async function() {
    user = null;
    expect((await supertest(app).patch('/files/photo/framing').send({ box: box })).status).toBe(401);
    user = { userId: 'someone-else', isAdmin: 0 };
    expect((await supertest(app).patch('/files/photo/framing').send({ box: box, auth: { user: { isAdmin: 1 } } })).status).toBe(403);
    expect(framing.apply).not.toHaveBeenCalled();
    user = { userId: 'admin', isAdmin: 1 };
    expect((await supertest(app).patch('/files/photo/framing').send({ box: box })).status).toBe(200);
});
test('validates coordinates before any storage write', async function() {
    expect((await supertest(app).patch('/files/photo/framing').send({ box: { x: 0, y: 0, width: 2, height: 1 } })).status).toBe(400);
    expect(framing.apply).not.toHaveBeenCalled();
});
test('owner framing is recorded as manual', async function() {
    expect((await supertest(app).patch('/files/photo/framing').send({ box: box })).status).toBe(200);
    expect(framing.apply).toHaveBeenCalledWith({ fileId: 'photo', box: box, source: 'manual', confidence: 1 });
});
