var paginationHelper = require('../api/paginationHelper');

describe('paginationHelper.normalizePagination', function() {
    test('uses defaults for missing values', function() {
        expect(paginationHelper.normalizePagination({}, 10)).toEqual({ page: 1, pageSize: 10, offset: 0 });
    });

    test('accepts numeric strings and calculates offset', function() {
        expect(paginationHelper.normalizePagination({ page: '3', pageSize: '25' }, 10)).toEqual({ page: 3, pageSize: 25, offset: 50 });
    });

    test('normalizes invalid and low values', function() {
        expect(paginationHelper.normalizePagination({ page: '-2', pageSize: '0' }, 20)).toEqual({ page: 1, pageSize: 20, offset: 0 });
        expect(paginationHelper.normalizePagination({ page: 'nope', pageSize: 'also-nope' }, 20)).toEqual({ page: 1, pageSize: 20, offset: 0 });
    });

    test('caps page size at the default maximum', function() {
        expect(paginationHelper.normalizePagination({ page: 2, pageSize: 500 }, 20)).toEqual({ page: 2, pageSize: 100, offset: 100 });
    });

    test('supports custom maximums', function() {
        expect(paginationHelper.normalizePagination({ page: 2, pageSize: 500 }, 20, 50)).toEqual({ page: 2, pageSize: 50, offset: 50 });
    });
});

describe('paginationHelper.normalizeLimit', function() {
    test('uses defaults and caps limits', function() {
        expect(paginationHelper.normalizeLimit(undefined, 20, 50)).toBe(20);
        expect(paginationHelper.normalizeLimit('0', 20, 50)).toBe(20);
        expect(paginationHelper.normalizeLimit('500', 20, 50)).toBe(50);
        expect(paginationHelper.normalizeLimit('25', 20, 50)).toBe(25);
    });
});