var geometry = require('../public/js/photo-framing');
test('rejects malformed, empty, or out-of-range subject boxes', function() {
    [null, {}, { x: 0, y: 0, width: 0, height: 1 }, { x: 0.9, y: 0, width: 0.2, height: 1 }, { x: NaN, y: 0, width: 1, height: 1 }].forEach(function(box) { expect(Boolean(geometry.validBox(box))).toBe(false); });
});
test('moves a square crop toward an off-center subject', function() {
    var result = geometry.frame(1200, 600, 1, { x: 0.65, y: 0.2, width: 0.3, height: 0.6 });
    expect(result.fit).toBe('cover');
    expect(result.x).toBe(600);
    expect(result.position).toBe('100% 50%');
});
test('shows the full photo when the complete subject cannot fit a wide cover', function() {
    expect(geometry.frame(600, 1200, 2, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }).fit).toBe('contain');
});
test('retains all four padded subject edges whenever cropping', function() {
    for (var width of [400, 800, 1600]) for (var height of [400, 800, 1600]) for (var aspect of [1, 4 / 3, 2.5]) {
        var box = { x: 0.6, y: 0.1, width: 0.3, height: 0.3 };
        var crop = geometry.frame(width, height, aspect, box);
        if (crop.fit === 'cover') {
            expect(crop.x).toBeLessThanOrEqual(box.x * width);
            expect(crop.y).toBeLessThanOrEqual(box.y * height);
            expect(crop.x + crop.width).toBeGreaterThanOrEqual((box.x + box.width) * width);
            expect(crop.y + crop.height).toBeGreaterThanOrEqual((box.y + box.height) * height);
            expect(crop.x + crop.width).toBeLessThanOrEqual(width);
            expect(crop.y + crop.height).toBeLessThanOrEqual(height);
        }
    }
});
test('missing or low-confidence full-image boxes safely contain', function() {
    expect(geometry.frame(800, 400, 1, null).fit).toBe('contain');
    expect(geometry.frame(800, 400, 1, { x: 0, y: 0, width: 1, height: 1 }).fit).toBe('contain');
});
