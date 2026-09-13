const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const signature = require('cookie-signature');
const config = require('../config');
const authService = require('../api/authService');

module.exports = async function auditBrowser(fixture) {
    const server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const session = await authService.startSession(fixture.userId);
    const browser = await chromium.launch({ headless: true });
    const output = path.join(__dirname, '../dist/ux-audit');
    await fs.mkdir(output, { recursive: true });
    try {
        const context = await browser.newContext();
        await context.addCookies([{ name: 'sessionId', value: 's:' + signature.sign(session.sessionId, config.cookieSecret), url: base, httpOnly: true, sameSite: 'Lax' }]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // A deterministic photo fixture; all application API requests use QA.
        await page.route('https://' + config.bucket + '.s3.amazonaws.com/**', route => route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dbbaa0"/><ellipse cx="400" cy="250" rx="230" ry="180" fill="#faf4e8"/><ellipse cx="400" cy="250" rx="145" ry="110" fill="#7a9e59"/><text x="400" y="260" text-anchor="middle" font-size="32" fill="#fff">QA dish photo</text></svg>'
        }));
        for (const width of [390, 768, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(base + '/dishes/' + fixture.dishId);
            await page.waitForFunction(() => window.dishPage && dishPage.dishData && window._platillosUser);
            await page.locator('#dish-cover-container img').waitFor({ state: 'visible' });
            await page.waitForTimeout(600);
            const layout = await page.evaluate(() => {
                const box = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width }; };
                return { header: box('dish-header'), title: box('dish-name'), photo: box('dish-cover-container'), trend: box('rating-trend'), overflow: document.documentElement.scrollWidth > innerWidth };
            });
            assert.equal(layout.overflow, false, 'No horizontal overflow at ' + width);
            assert(layout.title.right <= layout.header.right, 'Title fits header');
            assert(layout.photo.right <= layout.header.right, 'Photo fits header');
            if (layout.trend.width) assert(layout.trend.y >= Math.max(layout.title.bottom, layout.photo.bottom), 'Chart sits below title/photo');
            await page.screenshot({ path: path.join(output, 'dish-' + width + '.png'), fullPage: true });
        }
        // Long/untrusted names must be rendered as text, including attributes.
        await page.evaluate(() => dishPage.renderDish(Object.assign({}, dishPage.dishData, { name: 'A very long dish name with <img src=x onerror=alert(1)> & "quotes"', restaurantName: '<b>Real Cafe</b>' })));
        assert.equal(await page.locator('#dish-name img, #dish-restaurant b').count(), 0);
        await page.evaluate(() => dishPage.renderDish(Object.assign({}, dishPage.dishData, { coverPhoto: null })));
        assert.equal(await page.locator('#dish-header').evaluate(el => el.classList.contains('has-cover')), false);
        await page.screenshot({ path: path.join(output, 'dish-no-photo.png'), fullPage: true });

        await page.locator('#quick-log-btn').click();
        await page.locator('#selected-dish-container .selected-dish').waitFor();
        assert.equal(await page.evaluate(() => addReviewModule.itemType), 'drink', 'Drink preselection survives opening review form');
        // Exercise the actual authenticated picker and confirm pending dishes remain reusable.
        await page.evaluate(async () => {
            addReviewModule.resetAll();
            await addReviewModule.loadRestaurants(null, null, 'QA Audit');
        });
        const pendingRestaurant = page.locator('#restaurant-list .restaurant-item').filter({ hasText: fixture.pendingName });
        await pendingRestaurant.waitFor();
        assert.match(await pendingRestaurant.innerText(), /Awaiting approval/);
        await pendingRestaurant.click();
        await page.locator('.review-type-option[data-item-type="food"]').click();
        await page.locator('#dish-list .dish-item').filter({ hasText: 'Pending QA Dish' }).waitFor();
        await page.screenshot({ path: path.join(output, 'pending-submission.png'), fullPage: true });

        // Load main navigation pages and catch runtime errors, including empty states.
        for (const route of ['/', '/search?q=QA', '/register', '/login', '/about', '/restaurants/' + fixture.restaurantId]) {
            const response = await page.goto(base + route);
            assert.equal(response.status(), 200, route);
            await page.waitForTimeout(250);
        }
        assert.deepEqual(errors, [], 'No browser JavaScript exceptions');
        console.log('BROWSER PASS: 390/768/1440px layout, photo/no-photo, escaped names, drink preselection, pending picker, navigation pages');
    } finally {
        await browser.close();
        await authService.endSession(session.sessionId);
        await new Promise(resolve => server.close(resolve));
    }
};
