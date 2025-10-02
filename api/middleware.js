// authorization.js - Handles user permissions and security checks
var authService = require('./authService');

async function verifyRecaptcha(req, res, next) {
    try {
        await authService.verifyRecaptchaToken(req.allParams.recaptcha);
        next();
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message });
    }
}

module.exports = {
    verifyRecaptcha: verifyRecaptcha
};
