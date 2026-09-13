var fs = require('fs');
var path = require('path');
var db = require('../connections');
var config = require('../config');
async function main() {
    var args = process.argv.slice(2);
    if (args[args.indexOf('--database') + 1] !== config.database || !args.includes('--database')) throw new Error('Explicit matching --database required');
    if (!args.includes('--apply')) throw new Error('Add --apply to create the additive framing table');
    await db.query(fs.readFileSync(path.join(__dirname, '../db/09_photo_framing.sql'), 'utf8'));
    console.log('Framing table ready in ' + config.database);
}
main().catch(function(err) { console.error(err.message); process.exitCode = 1; }).finally(function() { return db.getPool().end(); });
