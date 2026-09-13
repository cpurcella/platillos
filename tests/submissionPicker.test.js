jest.mock('../connections', () => ({ query: jest.fn(), getConnection: jest.fn() }));
const db = require('../connections');
const restaurants = require('../api/restaurantService');
const dishes = require('../api/dishService');
beforeEach(() => db.query.mockReset().mockResolvedValue([]));

test('authenticated submission picker includes pending and manual review restaurants', async () => {
    await restaurants.getRestaurants({ forSubmission: 1, prefix: 'Cafe', auth: { user: { userId: 'user' } } });
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain("r.status IN ('approved', 'pending', 'needs_review')");
    expect(sql).not.toContain('r.*');
    expect(sql).not.toContain('submittedBy');
    expect(params).toContain('%Cafe%');
});

test('unauthenticated clients cannot use submission mode to browse pending restaurants', async () => {
    await restaurants.getRestaurants({ forSubmission: 1 });
    expect(db.query.mock.calls[0][0]).toContain("r.status = 'approved'");
});

test('rejected restaurant browsing requires admin access', async () => {
    await expect(restaurants.getRestaurants({ status: 'rejected' })).rejects.toMatchObject({ status: 403 });
});

test('submission dish picker includes existing pending dishes only at usable restaurants', async () => {
    await dishes.getDishes({ forSubmission: 1, restaurantId: 'pending-cafe', auth: { user: { userId: 'user' } } });
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain("d.status IN ('approved', 'pending', 'needs_review')");
    expect(sql).toContain("r.status IN ('approved', 'pending', 'needs_review')");
});
