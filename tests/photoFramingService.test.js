jest.mock('../connections', function() { return { query: jest.fn(), getConnection: jest.fn() }; });
jest.mock('../config', function() { return { bucket: 'framing-test', aiModel: 'test-model' }; });
var sdk = require('@aws-sdk/client-s3');
var send = jest.spyOn(sdk.S3Client.prototype, 'send');
var db = require('../connections');
var Jimp = require('jimp');
var service = require('../ai/photoFraming');
var original;
var writes;
var connection;
beforeEach(async function() {
    original = await new Jimp(800, 400, 0xccaa88ff).getBufferAsync(Jimp.MIME_JPEG);
    writes = [];
    connection = { query: jest.fn(async function(sql) {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.startsWith('SELECT framing')) return [[]];
        return [{ affectedRows: 1 }];
    }), release: jest.fn() };
    db.getConnection.mockResolvedValue(connection);
    send.mockImplementation(async function(command) {
        if (command instanceof sdk.HeadObjectCommand) { var err = new Error('Not found'); err.$metadata = { httpStatusCode: 404 }; throw err; }
        if (command instanceof sdk.GetObjectCommand) return { Body: { transformToByteArray: async function() { return original; } }, ContentType: Jimp.MIME_JPEG };
        if (command instanceof sdk.PutObjectCommand) { writes.push(command.input); return {}; }
        throw new Error('Unexpected command');
    });
});
test('backs up all originals/variants privately before replacing only thumbnails', async function() {
    var result = await service.apply({ fileId: 'photo', source: 'manual', box: { x: 0.6, y: 0.1, width: 0.35, height: 0.8 } });
    expect(writes.slice(0, 3).every(function(write) { return write.Key.startsWith('framing-backups/') && write.ACL === 'private'; })).toBe(true);
    expect(writes[3].Key).toMatch(/^photo_framed_v1_/);
    expect(writes.slice(4).map(function(write) { return write.Key; })).toEqual(['photo_s', 'photo_m']);
    expect(writes.some(function(write) { return write.Key === 'photo'; })).toBe(false);
    expect((await Jimp.read(writes[4].Body)).bitmap.width).toBe(256);
    expect(result.originalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(connection.release).toHaveBeenCalled();
});
test('a failed backup cannot overwrite thumbnails or save metadata', async function() {
    send.mockRejectedValue(new Error('Storage unavailable'));
    await expect(service.apply({ fileId: 'photo', box: { x: 0, y: 0, width: 1, height: 1 } })).rejects.toThrow();
    expect(writes).toHaveLength(0);
    expect(connection.query.mock.calls.some(function(call) { return call[0].startsWith('INSERT'); })).toBe(false);
});
test('rejects stale AI coordinates when the original changed', async function() {
    await expect(service.apply({ fileId: 'photo', originalHash: 'old', box: { x: 0, y: 0, width: 1, height: 1 } })).rejects.toThrow('Photo changed');
    expect(writes).toHaveLength(0);
});
test('AI cannot overwrite a manual override', async function() {
    connection.query.mockImplementation(async function(sql) { return sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : sql.startsWith('SELECT framing') ? [[{ framing: JSON.stringify({ source: 'manual' }) }]] : [[]]; });
    expect(await service.apply({ fileId: 'photo', source: 'ai', box: { x: 0, y: 0, width: 1, height: 1 } })).toEqual({ skipped: true });
    expect(writes).toHaveLength(0);
});
test('low-confidence analysis uses the entire image without modifying storage', async function() {
    var client = { responses: { create: jest.fn().mockResolvedValue({ output_text: JSON.stringify({ x: 0.5, y: 0.2, width: 0.2, height: 0.2, confidence: 0.4 }) }) } };
    var result = await service.evaluate(client, { fileId: 'photo' });
    expect(result.decision.box).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(writes).toHaveLength(0);
});
