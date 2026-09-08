const database = require('../database');

async function upload(request, response) {
  if (!request.file) {
    return response.status(400).json({ success: false, error: 'File is required' });
  }

  const [result] = await database.execute(
    `INSERT INTO treatment_request_attachments
      (treatment_request_id, original_name, stored_name, file_path, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [request.params.requestId, request.file.originalname, request.file.filename || request.file.originalname,
      request.file.path || '', request.file.mimetype, request.file.size]
  );
  response.status(201).json({ success: true, data: { id: result.insertId } });
}

async function list(request, response) {
  const [rows] = await database.execute(
    'SELECT * FROM treatment_request_attachments WHERE treatment_request_id = ? ORDER BY created_at DESC',
    [request.params.requestId]
  );
  response.json({ success: true, data: rows });
}

async function getById(request, response) {
  const [rows] = await database.execute(
    'SELECT * FROM treatment_request_attachments WHERE id = ?',
    [request.params.id]
  );
  if (!rows.length) return response.status(404).json({ success: false, error: 'Attachment not found' });
  response.json({ success: true, data: rows[0] });
}

async function download(request, response) {
  const [rows] = await database.execute(
    'SELECT file_path FROM treatment_request_attachments WHERE id = ?',
    [request.params.id]
  );
  if (!rows.length) return response.status(404).json({ success: false, error: 'Attachment not found' });
  response.download(rows[0].file_path);
}

async function update(request, response) {
  const fields = ['original_name', 'file_path', 'mime_type', 'file_size']
    .filter((field) => request.body[field] !== undefined);
  if (!fields.length) return response.status(400).json({ success: false, error: 'No fields to update' });
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  const [result] = await database.execute(
    `UPDATE treatment_request_attachments SET ${assignments} WHERE id = ?`,
    [...fields.map((field) => request.body[field]), request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ success: false, error: 'Attachment not found' });
  response.json({ success: true, data: { id: request.params.id } });
}

async function replaceFile(request, response) {
  return upload(request, response);
}

async function remove(request, response) {
  const [result] = await database.execute(
    'DELETE FROM treatment_request_attachments WHERE id = ?',
    [request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ success: false, error: 'Attachment not found' });
  response.status(204).send();
}

module.exports = {
  upload,
  list,
  getById,
  download,
  update,
  replaceFile,
  delete: remove
};
