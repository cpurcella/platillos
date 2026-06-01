var config = require('../config');

function isSecureCookie() {
    return config.env === 'prod';
}

function sessionCookieOptions(maxAge) {
    var options = {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureCookie(),
        signed: true,
        path: '/'
    };
    if (maxAge !== undefined) {
        options.maxAge = maxAge;
    }
    return options;
}

function csrfCookieOptions() {
    return {
        httpOnly: false,
        sameSite: 'lax',
        secure: isSecureCookie(),
        signed: true,
        path: '/'
    };
}

module.exports = {
    sessionCookieOptions: sessionCookieOptions,
    csrfCookieOptions: csrfCookieOptions
};