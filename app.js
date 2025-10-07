var path = require('path');
var templates = require('./templates');
var express = require('express');
var xssClean = require('xss-clean');
var router = express.Router();
var authService = require("./api/authService")
var cookieParser = require('cookie-parser')
var config = require("./config")

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
    var getBody = function() {
        return (req.body && typeof req.body === 'object') ? req.body : {};
    };
    var buildSnapshot = function() {
        return Object.assign({}, req.query || {}, getBody(), req.params || {}, extras);
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
            res.clearCookie("sessionId")
        }
    }
    next()
})


router.use('/api', require('./api/index'));

router.get('/logout', async function(req, res) {
    var sessionId = req.signedCookies ? req.signedCookies.sessionId : null;
    if (sessionId) {
        await authService.endSession(sessionId);
    }
    res.clearCookie('sessionId', {
        httpOnly: true,
        sameSite: 'lax',
        signed: true,
        path: '/'
    });
    res.redirect('/');
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
    var templateName = _urlPath.replace(/^[\/]/, '') || 'index';
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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', router);

app.use(function(err, req, res, next) {
    console.error('[express-error]', err && err.stack ? err.stack : err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({ success: false, message: 'Internal Server Error' });
});

if(!process.env.env) {
    var port = process.env.PORT || 3000;
    app.listen(port, function() {
        console.log('Platillos server running on http://localhost:' + port);
    });
} else {
    module.exports = app;
}
