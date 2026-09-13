// Dry-run by default. Originals and prior thumbnails are backed up privately in
// S3 before mutation. Completed/manual framings are skipped on rerun.
var fs = require('fs');
var path = require('path');
var config = require('../config');
var db = require('../connections');
var framing = require('../ai/photoFraming');
var { getOpenAiClient } = require('../ai/client');
async function main() {
    var args = process.argv.slice(2);
    function option(name) { return args[args.indexOf(name) + 1]; }
    var apply = args.includes('--apply');
    var analyze = args.includes('--analyze');
    if (apply && analyze) throw new Error('Choose --analyze or --apply, not both');
    if (!args.includes('--database') || option('--database') !== config.database || !args.includes('--bucket') || option('--bucket') !== config.bucket) throw new Error('Explicit matching --database and --bucket required');
    var tables = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'file_framing'", [config.database]);
    if (apply && !tables.length) throw new Error('Apply the framing migration before writing photos');
    var files = await db.query(tables.length ? 'SELECT f.fileId, f.fileType, ff.framing FROM files f LEFT JOIN file_framing ff ON ff.fileId = f.fileId ORDER BY f.uploaded, f.fileId' : 'SELECT fileId, fileType, NULL AS framing FROM files ORDER BY uploaded, fileId');
    if (args.includes('--file')) files = files.filter(function(file) { return file.fileId === option('--file'); });
    if (args.includes('--limit')) files = files.slice(0, Number(option('--limit')));
    console.log(JSON.stringify({ database: config.database, bucket: config.bucket, photos: files.length, apply: apply }));
    if (!apply && !analyze) return;
    if (!args.includes('--output')) throw new Error('--output is required for an auditable backfill');
    var output = path.resolve(option('--output'));
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    var runId = Date.now();
    fs.writeFileSync(path.join(output, 'before-' + runId + '.json'), JSON.stringify(files, null, 2), { mode: 0o600, flag: 'wx' });
    var results = [];
    var plan = args.includes('--plan') ? JSON.parse(fs.readFileSync(option('--plan'), 'utf8')) : [];
    // Serial by design: bounded API spend, easy resumability and no write races.
    for (var file of files) {
        var result;
        try {
            var planned = plan.find(function(item) { return item.fileId === file.fileId && item.decision; });
            var decision = planned ? planned.decision : (await framing.evaluate(getOpenAiClient(), file)).decision;
            var saved = analyze ? decision : await framing.apply(decision);
            result = { fileId: file.fileId, status: saved.skipped ? 'skipped' : analyze ? 'analyzed' : 'processed', confidence: saved.confidence, source: saved.source };
            if (analyze) result.decision = decision;
        } catch (err) { result = { fileId: file.fileId, status: 'failed', error: err.code || err.name, message: String(err.message).slice(0, 200) }; }
        results.push(result);
        fs.writeFileSync(path.join(output, 'results-' + runId + '.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
        console.log(JSON.stringify(result));
    }
    console.log(JSON.stringify({ processed: results.filter(function(r) { return r.status === 'processed'; }).length, skipped: results.filter(function(r) { return r.status === 'skipped'; }).length, failed: results.filter(function(r) { return r.status === 'failed'; }).length }));
    if (results.some(function(r) { return r.status === 'failed'; })) process.exitCode = 1;
}
main().catch(function(err) { console.error(err.message); process.exitCode = 1; }).finally(function() { return db.getPool().end(); });
