jest.mock('../connections', () => ({ query: jest.fn() }));
jest.mock('../ai/client', () => ({ getOpenAiClient: jest.fn(() => ({})) }));
jest.mock('../ai/restaurants', () => ({ fetchPendingRestaurants: jest.fn(), evaluateSingleRestaurant: jest.fn(), applyAiDecisions: jest.fn() }));
jest.mock('../ai/dishes', () => ({}));
jest.mock('../ai/reviews', () => ({}));
jest.mock('../ai/reviewPhotos', () => ({}));
const db = require('../connections');
const ai = require('../ai/restaurants');
const queue = require('../aiJobQueue');
const job = { jobId: 7, jobType: 'evaluate_restaurant', targetId: 'old-restaurant', attempts: 0, maxAttempts: 3 };
beforeEach(() => {
    jest.resetAllMocks();
    db.query.mockImplementation(async sql => sql.startsWith('SELECT *') ? [job] : { affectedRows: 1 });
    ai.fetchPendingRestaurants.mockResolvedValue([{ restaurantId: job.targetId }]);
    ai.evaluateSingleRestaurant.mockResolvedValue({ decision: { verdict: 'approve' } });
});
test('fetches the exact queued target even when it is older than the newest 50 submissions', async () => {
    expect(await queue.processJobs(10)).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(ai.fetchPendingRestaurants).toHaveBeenCalledWith(1, 'old-restaurant');
    expect(ai.applyAiDecisions).toHaveBeenCalledWith([{ verdict: 'approve', restaurantId: 'old-restaurant' }]);
});
test('a competing worker that loses the claim never evaluates or applies a decision', async () => {
    db.query.mockImplementation(async sql => sql.startsWith('SELECT *') ? [job] : { affectedRows: 0 });
    expect(await queue.processJobs(10)).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(ai.evaluateSingleRestaurant).not.toHaveBeenCalled();
});
test('an empty AI result is retried instead of recorded as completed', async () => {
    ai.evaluateSingleRestaurant.mockResolvedValue({ decision: null });
    expect((await queue.processJobs(10)).failed).toBe(1);
    const retry = db.query.mock.calls.find(c => c[0].startsWith('UPDATE ai_jobs SET status = ?'));
    expect(retry[1][0]).toBe('pending');
    expect(retry[1][1]).toContain('No moderation decision');
});
test('stops claiming work when the Lambda is nearly out of time', async () => {
    expect((await queue.processJobs(10, { getRemainingTimeInMillis: () => 30000 })).processed).toBe(0);
    expect(ai.fetchPendingRestaurants).not.toHaveBeenCalled();
});
