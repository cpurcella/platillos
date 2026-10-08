var path = require('path');
var templates = require('./templates');
var express = require('express');
var router = express.Router();
var authService = require('./api/authService');
var cookieParser = require('cookie-parser');
var config = require('./config');
var cookieOptions = require('./api/cookieOptions');
var csrf = require('./api/csrf');

if (!config.cookieSecret) {
    throw new Error('Set cookieSecret to a long random value before starting the server.');
}

router.use(cookieParser(config.cookieSecret));
router.use(function(req, res, next) {
    res.set('Cache-Control', 'no-store, private');
    next();;
});

router.use(async function(req, res, next) {
    if (req.signedCookies.sessionId) {
        try {
            req.auth = await authService.getSession(req.signedCookies.sessionId);
        } catch (err) {
            console.warn('[security]', JSON.stringify({
                event: 'session_rejected',
                reason: 'invalid_session'
            }));;
            res.clearCookie('sessionId', cookieOptions.sessionCookieOptions());
        }
    } else if (req.signedCookies.sessionId === false) {
        console.warn('[security]', JSON.stringify({
            event: 'session_rejected',
            reason: 'invalid_signature'
        }));
        res.clearCookie('sessionId', cookieOptions.sessionCookieOptions());
    }
    next();
});

router.use(csrf.middleware);

router.use('/api', require('./api/index'));

// Gate all /admin pages behind authentication + admin check
function requireAdminPage(req, res, next) {
    if (!req.auth || !req.auth.user) {
        return res.redirect('/login');
    }
    if (req.auth.user.isAdmin !== 1) {
        return res.status(403).send('Forbidden');
    }
    next();;
}

router.get(['/admin', '/admin/*'], requireAdminPage);

router.get('/admin', async function(req, res) {
    await templates.renderTemplate('admin/approvals', req, res);
});

router.get('/admin/approvals', function(req, res) {
    res.redirect('/admin');
});

function renderPage(templateName) {
    return async function(req, res, next) {
        try {
            await templates.renderTemplate(templateName, req, res);
        } catch (err) {
            next(err);
        }
    };
}

router.get(['/dishes/:dishId', '/dishes/:dishId/:slug'], renderPage('dish'));
router.get('/users/:username', renderPage('profile'));
router.get(['/restaurants/:restaurantId', '/restaurants/:restaurantId/:slug'], renderPage('restaurant'));
router.get('/', renderPage('index'));
['about', 'search', 'login', 'register', 'dish-list', 'add-review',
    'privacy-policy', 'terms-and-conditions', 'admin/approve-dish',
    'admin/approve-restaurant', 'admin/approve-review', 'admin/approve-photo'
].forEach(function(page) {
    router.get('/' + page, renderPage(page));
});

var app = express();
app.disable('x-powered-by');
app.use(function(req, res, next) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    next();;
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function(res, filePath) {
        if (/\.(js|css|svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
    }
}));
app.use('/', router);
app.use(function(req, res) {
    res.status(404).json({ success: false, message: 'Not found' });
});

app.use(function(err, req, res, next) {
    console.error('[express-error]', err.code || err.name);
    if (res.headersSent) {
        return next(err);
    }
    var status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status || 500);
    res.status(status).json({ success: false, message: status < 500 ? err.message : 'Internal Server Error' });
});

module.exports = app;

if (require.main === module) {
    var port = process.env.PORT || 3000;
    app.listen(port, function() {
        console.log('Platillos server running on http://localhost:' + port);
    });
}
