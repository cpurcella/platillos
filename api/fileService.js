
var db = require('../connections');



async function saveFile(fileData) {
    var sql = `
        INSERT INTO files (fileId, fileType, fileName, size, uploadedBy, uploaded)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    var params = [
        fileData.fileId,
        fileData.fileType,
        fileData.fileName,
        fileData.size,
        fileData.uploadedBy,
        fileData.uploaded
    ];
    await db.query(sql, params);
}

module.exports = {
    saveFile: saveFile
};
