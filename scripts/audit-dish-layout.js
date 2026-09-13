// Deterministic visual states on the local QA app; no production writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const config = require('../config');
const dishService = require('../api/dishService');

module.exports = async function auditDishLayout(context, base, fixture, output) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const photoUrl = 'https://' + config.bucket + '.s3.amazonaws.com/layout-photo';
    const reviews = Array.from({ length: 11 }, (_, index) => ({
        reviewId: index + 1, firstName: 'Alex', lastName: 'R.', rating: 8,
        submitted: Date.now() - (11 - index) * 86400000,
        reviewContent: 'Rich espresso with silky milk and a lovely, balanced finish. A favorite for a slow morning.',
        photos: [], likeCount: 0
    }));
    const states = [
        { name: 'photo', cover: true, count: 2 },
        { name: 'no-photo', count: 2 },
        { name: 'gallery-fallback', gallery: true, count: 2 },
        { name: 'empty', count: 0 },
        { name: 'long-photo', cover: true, count: 1, title: 'Mixed Berry Brioche Bread Pudding with Vanilla Bean Custard' },
        { name: 'long-no-photo', count: 11, title: 'Poached Pear with Whipped Mascarpone, Toasted Almonds & Honey' }
    ];
    let state = states[0];
    let rejectPhotos = false;
    await page.route(photoUrl + '**', route => rejectPhotos ? route.abort() : route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#cbb59a"/><ellipse cx="400" cy="330" rx="230" ry="195" fill="#eee5d8"/><circle cx="400" cy="290" r="155" fill="#faf5e9"/><circle cx="400" cy="290" r="125" fill="#a56837"/><ellipse cx="400" cy="290" rx="42" ry="80" fill="#f4dfb9"/></svg>'
    }));
    const photos = Array.from({ length: 21 }, (_, index) => ({ url: photoUrl + '-' + index, firstName: 'Alex', rating: 8, reviewContent: 'A lovely latte.', submitted: reviews[0].submitted }));
    await page.route('**/api/dishes/' + fixture.dishId + '**', route => {
        const url = new URL(route.request().url());
        const isPhotos = url.pathname.endsWith('/photos');
        const offset = ((Number(url.searchParams.get('page')) || 1) - 1) * 20;
        return route.fulfill({ json: isPhotos
            ? { success: true, data: state.gallery ? photos.slice(offset, offset + 20) : [], total: state.gallery ? photos.length : 0 }
            : { success: true, data: { dishId: fixture.dishId, restaurantId: fixture.restaurantId, name: state.title || 'Latte', restaurantName: 'Cabra Coffee', itemType: 'drink', coverPhoto: state.cover ? photoUrl : null, score: state.count ? 8.3 : null, reviewCount: state.count } }
        });
    });
    await page.route('**/api/reviews/dish/' + fixture.dishId + '**', route => {
        const url = new URL(route.request().url());
        const offset = ((Number(url.searchParams.get('page')) || 1) - 1) * 10;
        return route.fulfill({ json: url.pathname.endsWith('/ratings')
            ? { success: true, data: dishService.buildDishScoreTrend(reviews.slice(0, state.count)).reviews, summary: dishService.buildDishRatingSummary(reviews.slice(0, state.count)) }
            : { success: true, data: reviews.slice(offset, Math.min(state.count, offset + 10)).map((row, index) => ({ ...row, photos: state.gallery && index === 0 ? [photos[0]] : [] })), total: state.count }
        });
    });
    try {
        for (const nextState of states) {
            state = nextState;
            await page.goto(base + '/dishes/' + fixture.dishId);
            await page.waitForFunction(() => dishPage.dishData && !dishPage.galleryLoading && !document.querySelector('.reviews-loading'));
            await page.waitForLoadState('networkidle');
            await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
            if (state.count > 1) await page.locator('#rating-trend').waitFor({ state: 'visible' });
            for (const width of [320, 360, 390, 430, 599, 600, 767, 768, 959, 960, 1024, 1280, 1440, 1920]) {
                await page.setViewportSize({ width, height: 1000 });
                const layout = await page.evaluate(() => {
                    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
                    return { header: box('#dish-header'), info: box('.dish-header-info'), photo: box('#dish-cover-container'), actions: box('#dish-actions'), overflow: document.documentElement.scrollWidth > innerWidth };
                });
                const label = state.name + ' at ' + width;
                assert.equal(layout.overflow, false, label + ': no horizontal overflow');
                assert(layout.actions.bottom <= layout.header.bottom, label + ': actions inside summary');
                assert(layout.info.right <= layout.header.right, label + ': summary fits');
                if (state.cover || state.gallery) {
                    assert(layout.photo.height > 0, label + ': photo visible');
                    if (width < 960) {
                        assert(layout.info.y >= layout.photo.bottom - 1, label + ': stacked');
                        assert(layout.photo.height <= (width < 600 ? 240 : 300), label + ': capped photo height');
                    } else assert(layout.info.x >= layout.photo.right - 1, label + ': side by side');
                } else {
                    assert.equal(layout.photo.height, 0, label + ': no placeholder');
                    assert(layout.info.width >= layout.header.width - 3, label + ': full-width summary');
                }
                if ([390, 768, 1440].includes(width)) {
                    await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
                    await page.screenshot({ path: path.join(output, state.name + '-' + width + '.png'), fullPage: true });
                }
            }
            assert.equal(await page.locator('.reviews-pagination').isVisible(), state.count > 10, 'Pagination only when needed');
            assert.equal(await page.locator('#rating-trend').isVisible(), state.count > 1, 'No single-rating trend');
            assert.equal(await page.locator('#view-dish-photos').isVisible(), Boolean(state.gallery));
            assert.equal(await page.locator('#dish-header #rating-trend').count(), 0);
            if (state.count > 1) {
                assert.equal(await page.locator('#rating-trend').evaluate(el => el.open), false, 'History is opt-in');
                await page.locator('#rating-trend summary').click();
                await page.waitForFunction(() => Boolean(dishPage.ratingTrendChart));
                assert.equal(await page.locator('#rating-trend-chart').isVisible(), true);
                assert.equal(await page.evaluate(() => dishPage.ratingTrendChart.data.datasets[1].data.at(-1).y), 8, 'Graph uses the same arithmetic average');
                await page.screenshot({ path: path.join(output, state.name + '-history.png'), fullPage: true });
                await page.setViewportSize({ width: 320, height: 1000 });
                await page.waitForFunction(() => dishPage.ratingTrendChart.width <= document.querySelector('.rating-trend-chart-wrap').clientWidth);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Expanded graph resizes to phone width');
            }
            if (state.cover || state.gallery) {
                await page.setViewportSize({ width: 320, height: 568 });
                await page.locator('#dish-cover-container').click();
                assert.equal(await page.locator('#dish-photo-lightbox').isVisible(), true);
                await page.waitForFunction(() => { const img = document.getElementById('dish-lightbox-image'); return img.complete && img.naturalWidth > 0; });
                assert.equal(await page.locator('#dish-lightbox-image').getAttribute('src'), state.cover ? photoUrl : photos[0].url, 'Full resolution photo');
                assert.equal(await page.locator('#dish-lightbox-image').evaluate(el => getComputedStyle(el).objectFit), 'contain');
                await page.screenshot({ path: path.join(output, state.name + '-viewer-phone.png') });
                await page.keyboard.press('Shift+Tab');
                assert.equal(await page.locator('#dish-photo-lightbox').evaluate(el => el.contains(document.activeElement)), true, 'Focus stays in viewer');
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#dish-cover-container').evaluate(el => el === document.activeElement), true, 'Focus returns');
                await page.setViewportSize({ width: 844, height: 390 });
                await page.locator('#quick-log-btn').scrollIntoViewIfNeeded();
                assert.equal(await page.locator('#quick-log-btn').isVisible(), true, 'Landscape actions reachable');
                await page.screenshot({ path: path.join(output, state.name + '-landscape.png') });
            }
            if (state.gallery) {
                await page.locator('#view-dish-photos').click();
                for (let index = 0; index < 20; index++) await page.locator('#dish-lightbox-next').click();
                assert.equal(await page.locator('#dish-lightbox-image').getAttribute('src'), photos[20].url, 'Lazy gallery pagination');
                assert.equal(await page.locator('#dish-lightbox-next').isDisabled(), true);
                await page.keyboard.press('Escape');
                await page.evaluate(url => dishPage.renderDish({ ...dishPage.dishData, coverPhoto: url }), photoUrl);
                assert.equal(await page.locator('#dish-cover-container img').getAttribute('src'), photoUrl, 'Explicit cover beats gallery');
            }
            if (state.count > 10) {
                await page.locator('#reviews-next').click();
                await page.waitForFunction(() => document.querySelectorAll('.review-card').length === 1);
                assert.equal(await page.locator('#reviews-next').isDisabled(), true);
                assert.equal(await page.locator('#reviews-prev').isEnabled(), true);
            }
            if (!state.count) {
                assert.match(await page.locator('#quick-log-btn').innerText(), /first to review/);
                await page.evaluate(() => { window._platillosUser = null; dishPage.syncAuth(); window.showLoginPopup = function() { window.qaLoginRequested = true; }; });
                await page.locator('.reviews-empty .js-add-review').click();
                assert.equal(await page.evaluate(() => window.qaLoginRequested), true, 'Guest empty CTA asks for login');
            }
        }
        // The summary is independent of the weighted discovery score and of
        // request completion order. Exercise the comparison thresholds directly.
        await page.locator('#rating-trend').evaluate(el => { el.open = false; });
        const summaryCases = [
            { name: 'empty', recent: [], old: [], cards: 0, note: '' },
            { name: 'one-review', recent: [9], old: [], cards: 1, note: '' },
            { name: 'two-reviews', recent: [7, 9], old: [], cards: 1, note: '' },
            { name: 'same-period', recent: [7, 8, 9], old: [], cards: 1, note: '' },
            { name: 'few-recent', recent: [8, 10], old: [4, 6], cards: 1, note: 'Only 2 reviews in the last 6 months; showing the overall average.' },
            { name: 'one-recent', recent: [8], old: [4, 6], cards: 1, note: 'Only 1 review in the last 6 months; showing the overall average.' },
            { name: 'no-recent', recent: [], old: [4, 6], cards: 1, note: 'No reviews in the last 6 months.' },
            { name: 'comparison', recent: [8, 9, 10], old: [4, 6], cards: 2, note: '' },
            { name: 'equal-averages', recent: [8, 8, 8], old: [8], cards: 2, note: '' }
        ];
        for (const test of summaryCases) {
            const now = Date.now();
            const rows = test.recent.map(rating => ({ rating, submitted: now })).concat(test.old.map(rating => ({ rating, submitted: now - 900 * 86400000 })));
            const summary = dishService.buildDishRatingSummary(rows, now);
            await page.evaluate(({ summary, photoUrl }) => {
                dishPage.renderRatingSummary(summary);
                dishPage.renderDish({ ...dishPage.dishData, name: 'Latte', coverPhoto: photoUrl, score: 1.2 });
            }, { summary, photoUrl });
            assert.equal(await page.locator('.dish-rating-average').count(), test.cards, test.name);
            assert.equal(await page.locator('#dish-rating-note').innerText(), test.note);
            if (test.cards) {
                assert.equal(await page.locator('.dish-rating-average').last().locator('.dish-score').innerText(), summary.overall.average.toFixed(1) + ' / 10');
                assert.match(await page.locator('.dish-rating-average').last().innerText(), new RegExp('Based on ' + summary.overall.count + ' review'));
            }
            if (test.cards === 2) assert.equal(await page.locator('.dish-rating-average').first().locator('.dish-score').innerText(), summary.recent.average.toFixed(1) + ' / 10');
            for (const width of [320, 390, 600, 768, 960, 1440]) {
                await page.setViewportSize({ width, height: 1000 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, test.name + ' at ' + width);
                assert.equal(await page.locator('#dish-score').evaluate(el => el.scrollWidth > el.clientWidth), false, 'Summary fits');
                if (['comparison', 'two-reviews', 'no-recent'].includes(test.name) && [390, 1440].includes(width)) {
                    await page.screenshot({ path: path.join(output, 'averages-' + test.name + '-' + width + '.png'), fullPage: true });
                }
            }
        }
        await page.evaluate(url => dishPage.renderDish({ ...dishPage.dishData, coverPhoto: url, coverFileId: 'qa-framing', canAdjustCover: true, coverFraming: { box: { x: 0.55, y: 0.2, width: 0.4, height: 0.5 } } }), photoUrl);
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.locator('#dish-cover-container').click();
        await page.waitForFunction(() => document.getElementById('dish-lightbox-image').naturalWidth > 0);
        await page.locator('#adjust-photo-framing').click();
        const framingImage = await page.locator('#dish-lightbox-image').boundingBox();
        await page.mouse.move(framingImage.x + framingImage.width * 0.2, framingImage.y + framingImage.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(framingImage.x + framingImage.width * 0.8, framingImage.y + framingImage.height * 0.8, { steps: 5 });
        await page.mouse.up();
        assert.ok(Math.abs(Number(await page.locator('#framing-left').inputValue()) - 20) <= 1, 'Drag selects subject bounds');
        await page.locator('#framing-left').focus();
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator('#photo-framing-editor').isVisible(), true, 'Editing fields does not navigate gallery');
        await page.locator('#framing-left').fill('10');
        await page.locator('#framing-right').fill('90');
        await page.locator('#framing-top').fill('5');
        await page.locator('#framing-bottom').fill('95');
        assert.equal(await page.locator('#framing-save').isEnabled(), true);
        await page.screenshot({ path: path.join(output, 'framing-editor-390.png') });
        await page.route('**/api/files/qa-framing/framing', async route => {
            const body = route.request().postDataJSON();
            assert.equal(route.request().method(), 'PATCH');
            assert.equal(body.box.x, 0.1);
            await route.fulfill({ json: { success: true, data: { box: body.box, source: 'manual' } } });
        });
        await page.locator('#framing-save').click();
        await page.locator('#photo-framing-editor').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => dishPage.dishData.coverFraming.source), 'manual');
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            dishPage.dishData.canAdjustCover = false;
            dishPage.dishData.coverFraming = { box: { x: 0, y: 0, width: 1, height: 1 } };
            dishPage.applyCoverFraming();
        });
        for (const width of [320, 390, 768, 960, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(() => dishPage.applyCoverFraming());
            assert.equal(await page.locator('#dish-cover-container img').evaluate(el => getComputedStyle(el).objectFit), 'contain', 'Complete subject preserved at ' + width);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await page.locator('#dish-cover-container').click();
        assert.equal(await page.locator('#adjust-photo-framing').isVisible(), false, 'Visitors cannot adjust another user photo');
        await page.keyboard.press('Escape');
        console.log('FRAMING UI PASS: responsive subject preservation, owner editor and preview, manual save, and visitor control visibility');
        await page.route('**/api/reviews/dish/' + fixture.dishId + '/ratings', route => route.fulfill({ status: 503, json: { success: false } }));
        await page.evaluate(() => dishPage.loadRatingTrend());
        await page.waitForFunction(() => document.getElementById('dish-score').textContent === 'Ratings unavailable');
        assert.equal(await page.locator('#rating-trend').isVisible(), false, 'Failed ratings never show a weighted or stale average');
        console.log('RATING SUMMARY PASS: nine sparse/comparison states at six widths, arithmetic values/counts, late dish response, and failed ratings request');
        rejectPhotos = true;
        await page.evaluate(url => dishPage.renderDish({ ...dishPage.dishData, coverPhoto: url + '-broken' }), photoUrl);
        await page.waitForFunction(() => !document.querySelector('#dish-header').classList.contains('has-cover'));
        assert.deepEqual(errors, [], 'No layout JavaScript exceptions');
        console.log('DISH LAYOUT PASS: 84 viewport/state checks (320–1920px), gallery fallback/pagination, full-photo viewer, keyboard focus, empty/guest CTA, rating history, failed photos');
    } finally {
        await page.close();
    }
};
