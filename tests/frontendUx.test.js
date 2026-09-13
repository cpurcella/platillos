const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(name, exported) {
    const elements = {};
    const $ = jest.fn(selector => {
        if (!elements[selector]) {
            const element = {};
            for (const method of ['ready', 'show', 'hide', 'empty', 'text']) element[method] = jest.fn(() => element);
            elements[selector] = element;
        }
        return elements[selector];
    });
    $.get = jest.fn();
    const context = { $, window: {}, document: {}, URLSearchParams, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/' + name), 'utf8'), context);
    return { module: context[exported], $, elements };
}

test.each([1, 4, 5, 6, 10])('search and dish cards interpret %s on a consistent ten-point scale', score => {
    const search = load('search.js', 'searchModule').module;
    const dishList = load('dish-list.js', 'dishListModule').module;
    expect(search.renderStars(score)).toContain('Rating ' + (score / 2).toFixed(1) + ' out of 5');
    expect(search.renderStars(score)).toContain(score.toFixed(1) + '/10');
    expect(dishList.renderStars(score)).toContain('Rating ' + (score / 2).toFixed(1) + ' out of 5');
});

test('a slow older search cannot replace a newer result or clear its loading state', async () => {
    const { module: search, $ } = load('search.js', 'searchModule');
    const waiting = [];
    $.get.mockImplementation(() => new Promise(resolve => waiting.push(resolve)));
    search.renderDishes = jest.fn();
    search.requestVersion = 1;
    const first = search.loadDishes('old', false);
    search.requestVersion = 2;
    const second = search.loadDishes('new', false);
    waiting[0]({ success: true, data: [{ name: 'old' }], total: 1 });
    await first;
    expect(search.renderDishes).not.toHaveBeenCalled();
    expect(search.loading).toBe(true);
    waiting[1]({ success: true, data: [{ name: 'new' }], total: 1 });
    await second;
    expect(search.renderDishes).toHaveBeenCalledWith([{ name: 'new' }], false);
    expect(search.loading).toBe(false);
});

test('clearing search invalidates an in-flight response', async () => {
    const { module: search, $ } = load('search.js', 'searchModule');
    let resolve;
    $.get.mockImplementation(() => new Promise(r => { resolve = r; }));
    search.renderDishes = jest.fn();
    const first = search.loadDishes('old', false);
    // showEmptySearch also focuses the field in the browser.
    $('#searchInput').focus = jest.fn();
    search.showEmptySearch();
    resolve({ success: true, data: [{ name: 'old' }], total: 1 });
    await first;
    expect(search.renderDishes).not.toHaveBeenCalled();
});
