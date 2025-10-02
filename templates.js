var path = require('path');
var fs = require('fs');
var handlebars = require('handlebars');
var dataProviders = require('./dataProviders');

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
            var context = req.allParams.auth || {};
            if (typeof dataProviders[templateName] === 'function') {
                var extraData = await dataProviders[templateName](req);
                context = Object.assign({}, context, extraData);
            }
            var template = handlebars.compile(source);
            var html = template(context);
            res.send(html);
        } catch (err) {
            if (err.code === 'ENOENT') {
                res.status(404).send('Template not found');
            } else {
                res.status(500).send('Server error');
            }
        }
    }
};

module.exports = templates;
