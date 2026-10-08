var authService = require('./authService');

// Path IDs and server-verified authentication always override client input.
function requestParams(req) {
    var input = ['GET', 'HEAD'].includes(req.method) ? req.query : req.body;
    return Object.assign({}, input, req.params, { auth: req.auth });
}

function requireAuth(req, res, next) {
    if (!req.auth || !req.auth.user) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Unauthorized. Please log in.'
        });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.auth || !req.auth.user) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Unauthorized. Please log in.'
        });
    }
    if (req.auth.user.isAdmin !== 1) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    next();
}

async function verifyRecaptcha(req, res, next) {
    try {
        await authService.verifyRecaptchaToken(req.body.recaptcha);
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    requestParams: requestParams,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin,
    verifyRecaptcha: verifyRecaptcha
};
