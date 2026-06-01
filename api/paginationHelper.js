var MAX_PAGE_SIZE = 100;
var MAX_USER_SEARCH_LIMIT = 50;

function normalizeLimit(value, defaultLimit, maxLimit) {
    var fallback = parseInt(defaultLimit, 10) || 20;
    var cap = parseInt(maxLimit, 10) || MAX_PAGE_SIZE;
    var limit = parseInt(value, 10);
    if (isNaN(limit) || limit < 1) {
        limit = fallback;
    }
    return Math.min(limit, cap);
}

function normalizePagination(params, defaultPageSize, maxPageSize) {
    params = params || {};
    var page = parseInt(params.page, 10);
    var pageSize = normalizeLimit(params.pageSize, defaultPageSize, maxPageSize || MAX_PAGE_SIZE);

    if (isNaN(page) || page < 1) {
        page = 1;
    }

    return {
        page: page,
        pageSize: pageSize,
        offset: (page - 1) * pageSize
    };
}

module.exports = {
    MAX_PAGE_SIZE: MAX_PAGE_SIZE,
    MAX_USER_SEARCH_LIMIT: MAX_USER_SEARCH_LIMIT,
    normalizeLimit: normalizeLimit,
    normalizePagination: normalizePagination
};