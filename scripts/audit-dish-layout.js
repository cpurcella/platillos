// Deterministic visual states on the local QA app; no production writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const config = require('../config');

module.exports = async function auditDishLayout(context, base, fixture, output) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const photoUrl = 'https://' + config.bucket + '.s3.amazonaws.com/layout-photo';
    const reviews = Array.from({ length: 11 }, (_, index) => ({
        reviewId: index + 1, firstName: 'Alex', lastName: 'R.', rating: 8,
        submitted: 1788000000000 + index * 86400000,
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
            ? { success: true, data: reviews.slice(0, state.count).map(row => ({ ...row, rollingScore: 8.3 })), currentScore: state.count ? 8.3 : null }
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
                await page.locator('#rating-trend summary').click();
                await page.waitForFunction(() => Boolean(dishPage.ratingTrendChart));
                assert.equal(await page.locator('#rating-trend-chart').isVisible(), true);
                await page.screenshot({ path: path.join(output, state.name + '-history.png'), fullPage: true });
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
        rejectPhotos = true;
        await page.evaluate(url => dishPage.renderDish({ ...dishPage.dishData, coverPhoto: url + '-broken' }), photoUrl);
        await page.waitForFunction(() => !document.querySelector('#dish-header').classList.contains('has-cover'));
        assert.deepEqual(errors, [], 'No layout JavaScript exceptions');
        console.log('DISH LAYOUT PASS: 84 viewport/state checks (320–1920px), gallery fallback/pagination, full-photo viewer, keyboard focus, empty/guest CTA, rating history, failed photos');
    } finally {
        await page.close();
    }
};
