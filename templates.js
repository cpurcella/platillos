var path = require('path');
var fs = require('fs');
var handlebars = require('handlebars');
var config = require('./config');

handlebars.registerHelper('initial', function(str) {
    return (str || '?').charAt(0).toUpperCase();
});

var templates = {
    renderTemplate: async function(templateName, req, res) {
        var filePath = path.join(__dirname, 'views', templateName + '.handlebars');
        var partialsDir = path.join(__dirname, 'views', 'partials');
        try {
            var source = await fs.promises.readFile(filePath, 'utf8');
            var files = await fs.promises.readdir(partialsDir);
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.endsWith('.handlebars')) {
                    var partialName = path.basename(file, '.handlebars');
                    var partialPath = path.join(partialsDir, file);
                    var partialSource = await fs.promises.readFile(partialPath, 'utf8');
                    handlebars.registerPartial(partialName, partialSource);
                }
            }
            var context = Object.assign({}, req.auth || {}, { csrfToken: req.csrfToken, googleMapsBrowserKey: config.googleMapsBrowserKey, recaptchaSiteKey: config.recaptchaSiteKey });
            if (context.user) {
                context.user = Object.assign({}, context.user);
            }
            if (context.user && context.user.avatarFileId) {
                context.user.avatarUrl = 'https://' + config.bucket + '.s3.amazonaws.com/' + context.user.avatarFileId + '_s';
            }
            var template = handlebars.compile(source);
            var html = template(context);
            res.send(html);
        } catch (err) {
            if (err.code === 'ENOENT') {
                res.status(404).send('Template not found');
            } else {
                console.error('[template-error]', err.code || err.name);
                res.status(500).send('Server error');
            }
        }
    }
};

module.exports = templates;
