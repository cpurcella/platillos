// Run explicitly: node scripts/audit-qa.js. Never runs against production.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../connections');
const reviewService = require('../api/reviewService');
const restaurantService = require('../api/restaurantService');
const dishService = require('../api/dishService');

async function run() {
    assert.equal(config.database, 'platillos_qa', 'QA database required');
    assert.equal(config.dbUser, 'platillos_dev', 'QA-only account required');
    const userId = crypto.randomUUID();
    const fixture = 'QA Audit ' + userId.slice(0, 8);
    const auth = { user: { userId, isAdmin: 0 } };
    let first;
    let second;
    let pending;
    try {
        await db.query("INSERT INTO users (userId, firstName, lastName, dob, email, phone, created) VALUES (?, 'QA', 'Audit', '1990-01-01', ?, '', ?)", [userId, userId + '@example.invalid', Date.now()]);
        first = await reviewService.saveReview({ auth, rating: 9, review: 'Synthetic QA review', modifications: '', newRestaurant: true, newRestaurantData: { name: fixture, address: '1 QA Test Street', city: 'Albuquerque', state: 'NM', zip: '87102' }, newDish: true, newDishData: { name: 'QA First Dish' } });
        assert.equal(first.awaitingApproval, true);
        const picker = await restaurantService.getRestaurants({ forSubmission: 1, prefix: fixture, auth });
        assert.equal(picker.rows.length, 1);
        assert.equal(picker.rows[0].restaurantId, first.restaurantId);
        assert.equal(picker.rows[0].status, 'pending');
        assert.equal((await restaurantService.getRestaurants({ prefix: fixture })).total, 0);
        second = await reviewService.saveReview({ auth, rating: 8, review: 'Second synthetic review', modifications: '', restaurantId: first.restaurantId, newDish: true, newDishData: { name: 'QA Second Dish' } });
        assert.equal(second.restaurantId, first.restaurantId);
        assert.equal(second.awaitingApproval, true);
        const dishes = await dishService.getDishes({ forSubmission: 1, restaurantId: first.restaurantId, auth });
        assert.equal(dishes.rows.length, 2);
        assert.equal((await dishService.getDishes({ restaurantId: first.restaurantId })).total, 0);
        assert.equal((await reviewService.getReviews({ dishId: first.dishId })).total, 0);
        assert.equal((await reviewService.getRatingsForDish(first.dishId)).reviews.length, 0);
        // Resubmitting the same restaurant and dish reuses their IDs. The user
        // receives the duplicate-review explanation, with no duplicate rows.
        await assert.rejects(reviewService.saveReview({ auth, rating: 7, review: 'Retry', newRestaurant: true, newRestaurantData: { name: fixture, address: '1 QA Test Street', city: 'Albuquerque' }, newDish: true, newDishData: { name: 'QA First Dish' } }), /already submitted a review/);
        assert.equal((await restaurantService.getRestaurants({ forSubmission: 1, prefix: fixture, auth })).total, 1);
        assert.equal((await dishService.getDishes({ forSubmission: 1, restaurantId: first.restaurantId, auth })).total, 2);
        await db.query("UPDATE restaurants SET status = 'approved' WHERE restaurantId = ?", [first.restaurantId]);
        await db.query("UPDATE dishes SET status = 'approved' WHERE dishId = ?", [first.dishId]);
        assert.equal((await reviewService.getReviews({ dishId: first.dishId })).total, 1);
        assert.equal((await dishService.getDish({ dishId: first.dishId })).name, 'QA First Dish');
        if (process.argv.includes('--browser')) {
            pending = await reviewService.saveReview({ auth, rating: 8, review: 'Pending QA review', modifications: '', newRestaurant: true, newRestaurantData: { name: fixture + ' Pending', address: '2 QA Test Street', city: 'Albuquerque', state: 'NM' }, newDish: true, newDishData: { name: 'Pending QA Dish' } });
            await db.query("UPDATE dishes SET itemType = 'drink', coverPhoto = ? WHERE dishId = ?", [crypto.randomUUID(), first.dishId]);
            await require('./audit-browser')({ userId, restaurantId: first.restaurantId, dishId: first.dishId, pendingName: fixture + ' Pending' });
        }
        console.log('QA PASS: pending restaurant reuse, second dish, duplicate prevention, public visibility, approval release, strict MySQL inserts');
    } finally {
        const ownDishes = await db.query('SELECT dishId FROM dishes WHERE submittedBy = ?', [userId]);
        const ids = ownDishes.map(row => row.dishId);
        const ownRestaurants = await db.query('SELECT restaurantId FROM restaurants WHERE submittedBy = ?', [userId]);
        const targets = ids.concat(ownRestaurants.map(row => row.restaurantId));
        if (targets.length) await db.query('DELETE FROM ai_jobs WHERE targetId IN (?)', [targets]);
        if (ids.length) {
            for (const table of ['dishes_categories', 'dishes_dishTypes', 'dishes_tags']) await db.query('DELETE FROM ' + table + ' WHERE dishId IN (?)', [ids]);
            await db.query('DELETE FROM reviews WHERE dishId IN (?) AND submittedBy = ?', [ids, userId]);
            await db.query('DELETE FROM dishes WHERE dishId IN (?) AND submittedBy = ?', [ids, userId]);
        }
        await db.query('DELETE FROM restaurants WHERE submittedBy = ?', [userId]);
        await db.query('DELETE FROM users WHERE userId = ?', [userId]);
        await db.getPool().end();
    }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
