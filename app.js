var path = require('path');
var templates = require('./templates');
var express = require('express');
var xssClean = require('xss-clean');
var router = express.Router();
var authService = require("./api/authService")
var cookieParser = require('cookie-parser')
var config = require("./config")
var ai = require("./ai/restaurants")
var cookieOptions = require('./api/cookieOptions')
var csrf = require('./api/csrf')

process.on('uncaughtException', function(err) {
    console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', function(reason, promise) {
    var message = reason && reason.stack ? reason.stack : reason;
    console.error('[unhandledRejection]', message);
});

if (!process.env.env) {
    var { spawn } = require('child_process');
    var exportDDL = spawn('node', [path.join(__dirname, 'db', 'export-ddl.js')]);
}

router.use(function(req, res, next) {
    var extras = {};
    var serverOnlyParams = { auth: true };
    var getBody = function() {
        return (req.body && typeof req.body === 'object') ? req.body : {};
    };
    var copyClientParams = function(source) {
        var copy = {};
        if (!source || typeof source !== 'object') {
            return copy;
        }
        Object.keys(source).forEach(function(key) {
            if (!serverOnlyParams[key]) {
                copy[key] = source[key];
            }
        });
        return copy;
    };
    var buildSnapshot = function() {
        return Object.assign(
            {},
            copyClientParams(req.query),
            copyClientParams(getBody()),
            copyClientParams(req.params),
            extras
        );
    };

    req.allParams = new Proxy(extras, {
        get: function(target, prop) {
            if (prop === Symbol.toStringTag) {
                return 'AllParams';
            }
            if (prop === 'toJSON' || prop === 'valueOf') {
                return buildSnapshot;
            }
            if (prop === 'keys') {
                return function() { return Object.keys(buildSnapshot()); };
            }
            if (prop === 'entries') {
                return function() { return Object.entries(buildSnapshot()); };
            }
            if (Object.prototype.hasOwnProperty.call(extras, prop)) {
                return extras[prop];
            }
            if (serverOnlyParams[prop]) {
                return target[prop];
            }
            if (req.params && Object.prototype.hasOwnProperty.call(req.params, prop)) {
                return req.params[prop];
            }
            var body = getBody();
            if (Object.prototype.hasOwnProperty.call(body, prop)) {
                return body[prop];
            }
            if (req.query && Object.prototype.hasOwnProperty.call(req.query, prop)) {
                return req.query[prop];
            }
            return target[prop];
        },
        set: function(target, prop, value) {
            extras[prop] = value;
            return true;
        },
        has: function(target, prop) {
            var snapshot = buildSnapshot();
            return Object.prototype.hasOwnProperty.call(snapshot, prop);
        },
        ownKeys: function() {
            var snapshot = buildSnapshot();
            return Reflect.ownKeys(snapshot);
        },
        getOwnPropertyDescriptor: function(target, prop) {
            var snapshot = buildSnapshot();
            if (Object.prototype.hasOwnProperty.call(snapshot, prop)) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: snapshot[prop],
                    writable: true
                };
            }
            return undefined;
        },
        deleteProperty: function(target, prop) {
            if (Object.prototype.hasOwnProperty.call(extras, prop)) {
                delete extras[prop];
            }
            return true;
        }
    });

    next();
});

router.use(cookieParser(config.cookieSecret))

router.use(async function(req, res, next) {
    if(req.signedCookies.sessionId) {
        try {
            req.allParams.auth = await authService.getSession(req.signedCookies.sessionId)
        } catch(e) {
            console.log("Couldn't find session " + req.signedCookies.sessionId)
            res.clearCookie('sessionId', cookieOptions.sessionCookieOptions())
        }
    }
    next()
})

router.use(csrf.middleware)

router.use('/api', require('./api/index'));

router.get('/logout', async function(req, res) {
    var sessionId = req.signedCookies ? req.signedCookies.sessionId : null;
    if (sessionId) {
        await authService.endSession(sessionId);
    }
    res.clearCookie('sessionId', cookieOptions.sessionCookieOptions());
    res.redirect('/');
});

// Gate all /admin pages behind authentication + admin check
function requireAdminPage(req, res, next) {
    if (!req.allParams.auth || !req.allParams.auth.user) {
        return res.redirect('/login');
    }
    if (req.allParams.auth.user.isAdmin !== 1) {
        return res.status(403).send('Forbidden');
    }
    next();
}

router.get(['/admin', '/admin/*'], requireAdminPage);

router.get('/admin', async function(req, res) {
    await templates.renderTemplate('admin/approvals', req, res);
});

router.get('/admin/approvals', function(req, res) {
    res.redirect('/admin');
});

router.get('*', async function(req, res, next) {
    var _urlPath = req.path;
    if (path.extname(_urlPath)) {
        res.sendFile(path.join(__dirname, 'public', _urlPath));
        return;
    }
    // Special case: dish detail routes like /dishes/:dishId or /dishes/:dishId/:slug -> render dish template
    if (/^\/dishes\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?$/.test(_urlPath)) {
        try {
            await templates.renderTemplate('dish', req, res);
            return;
        } catch (err) {
            // fall through to generic handling if template missing
        }
    }
    // User profile routes: /users/:username
    if (/^\/users\/[A-Za-z0-9_]+$/.test(_urlPath)) {
        try {
            await templates.renderTemplate('profile', req, res);
            return;
        } catch (err) {
            // fall through
        }
    }    // Restaurant profile routes: /restaurants/:restaurantId or /restaurants/:restaurantId/:slug
    if (/^\/restaurants\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?$/.test(_urlPath)) {
        try {
            await templates.renderTemplate('restaurant', req, res);
            return;
        } catch (err) {
            // fall through
        }
    }    // Dedicated search page: /search
    if (_urlPath === '/search') {
        try {
            await templates.renderTemplate('search', req, res);
            return;
        } catch (err) {
            // fall through
        }
    }    var templateName = _urlPath.replace(/^[\/]/, '') || 'index';
    try {
        await templates.renderTemplate(templateName, req, res);
    } catch (err) {
        next();
    }
});

var app = express();
app.use(xssClean());
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

app.use(function(err, req, res, next) {
    console.error('[express-error]', err && err.stack ? err.stack : err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({ success: false, message: 'Internal Server Error' });
});

if(!process.env.env || process.env.local == "true") {
    var port = process.env.PORT || 3000;
    app.listen(port, function() {
        console.log('Platillos server running on http://localhost:' + port);
    });
} else {
    module.exports = app;
}
