// authorization.js - Handles user permissions and security checks
var authService = require('./authService');

function requireAuth(req, res, next) {
    if (!req.allParams.auth || !req.allParams.auth.user) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Unauthorized. Please log in.'
        });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.allParams.auth || !req.allParams.auth.user) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Unauthorized. Please log in.'
        });
    }
    if (req.allParams.auth.user.isAdmin !== 1) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    next();
}

async function verifyRecaptcha(req, res, next) {
    try {
        await authService.verifyRecaptchaToken(req.allParams.recaptcha);
        next();
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
}

module.exports = {
    requireAuth: requireAuth,
    requireAdmin: requireAdmin,
    verifyRecaptcha: verifyRecaptcha
};
