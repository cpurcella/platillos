jest.mock('../config', () => ({ aiConfidenceThreshold: 0.8 }));
jest.mock('../connections', () => ({ query: jest.fn(), getConnection: jest.fn() }));
const { resolveListingStatus } = require('../ai/utils');
const db = require('../connections');
const restaurants = require('../ai/restaurants');
const dishes = require('../ai/dishes');

test.each([
    ['reject', 1, ['https://menu.example'], 'needs_review'],
    ['reject', 0.9, [], 'needs_review'],
    ['manual_review', 1, ['https://menu.example'], 'needs_review'],
    ['approve', 0.95, [], 'needs_review'],
    ['approve', 0.95, ['I think it exists'], 'needs_review'],
    ['approve', NaN, ['https://menu.example'], 'needs_review'],
    ['approve', 0.6, ['https://menu.example'], 'needs_review'],
    ['approve', 0.95, ['Official menu: https://menu.example'], 'approved']
])('listing decision %s at %s with %j becomes %s', (verdict, confidence, evidence, expected) => {
    expect(resolveListingStatus({ verdict, confidence, evidence })).toBe(expected);
});

test('restaurant rejection is held with reasoning, never deleted or automatically rejected', async () => {
    const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    db.getConnection.mockResolvedValue(connection);
    await restaurants.applyAiDecisions([{ restaurantId: 'local-cafe', verdict: 'reject', confidence: 1, evidence: [], reasoning: 'No online menu found' }]);
    expect(connection.query.mock.calls[0][1]).toEqual(['needs_review', expect.any(Number), 'openai', 'No online menu found', 'local-cafe']);
});

test('AI cannot change human-reviewed dish metadata or names', async () => {
    const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([[{ dishId: 'dish', status: 'approved' }]]) };
    db.getConnection.mockResolvedValue(connection);
    await dishes.applyDishDecisions([{ dishId: 'dish', verdict: 'approve', confidence: 1, correctedName: 'Different', categories: ['Sandwich'] }], { categories: [{ categoryId: 1, category: 'Sandwich' }], dishTypes: [], tags: [] });
    expect(connection.query).toHaveBeenCalledTimes(1);
});
