var fs = require('fs');
var path = require('path');
var db = require('../connections'); // Use custom db module

var _ddlDir = path.join(__dirname, 'ddls');

async function exportDDLs() {
    try {
        if (!fs.existsSync(_ddlDir)) {
            fs.mkdirSync(_ddlDir);
        }
        var result = await db.query("SHOW TABLES FROM platillos_qa");
        var tables = result.map(function(row) {
            return row[Object.keys(row)[0]];
        });
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i];
            var ddlRes = await db.query("SHOW CREATE TABLE `" + table + "`");
            var ddl = ddlRes[0]['Create Table'];
            var filePath = path.join(_ddlDir, table + '.sql');
            await fs.promises.writeFile(filePath, ddl, 'utf8');
            console.log('Exported DDL for', table, 'to', filePath);
        }
    } catch (err) {
        console.error('Error exporting DDLs:', err);
    }
}

exportDDLs();
