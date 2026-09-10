const database = require('../database');

const requestFields = [
  'hospital_name', 'doctor_name', 'diagnosis', 'disease_type', 'treatment_cost', 'is_urgent'
];
const attachmentFields = ['original_name', 'file_path', 'mime_type', 'file_size'];

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value === true || value === 'true' || value === 1 || value === '1';
}

function requestData(body = {}) {
  return {
    hospital_name: body.hospital_name ?? null,
    doctor_name: body.doctor_name ?? null,
    diagnosis: body.diagnosis ?? null,
    disease_type: body.disease_type ?? null,
    treatment_cost: body.treatment_cost ?? null,
    is_urgent: body.is_urgent ?? false
  };
}

function auditContext(context = {}) {
  return {
    requestId: context.requestId ?? null,
    operationType: context.operationType,
    userId: context.userId ?? null,
    ipAddress: context.ipAddress ?? null,
    device: context.device ?? null,
    notes: context.notes ?? null
  };
}

async function addAuditLog(connection, context) {
  const audit = auditContext(context);
  if (!audit.operationType) return;

  await connection.execute(
    `INSERT INTO treatment_request_audit_logs
      (treatment_request_id, operation_type, user_id, operation_date,
       operation_time, ip_address, device, notes)
     VALUES (?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?)`,
    [audit.requestId, audit.operationType, audit.userId, audit.ipAddress,
    audit.device, audit.notes]
  );
}

async function addAttachment(connection, requestId, file) {
  await connection.execute(
    `INSERT INTO treatment_request_attachments
      (treatment_request_id, original_name, stored_name, file_path, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [requestId, file.originalname, file.filename, file.path, file.mimetype, file.size]
  );
}

async function createRequest(beneficiaryId, body, files = [], context = {}) {
  const submissionType = 'submit';

  const data = requestData(body);

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO treatment_requests
        (
          beneficiary_id,
          hospital_name,
          doctor_name,
          diagnosis,
          disease_type,
          treatment_cost,
          is_urgent,
          submission_type,
          status,
          stage
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        beneficiaryId,
        ...Object.values(data),
        submissionType,
        'waiting_review',
        'باحث اجتماعي'
      ]
    );

    for (const file of files) {
      await addAttachment(connection, result.insertId, file);
    }

    await addAuditLog(connection, {
      ...context,
      requestId: result.insertId,
      operationType:
        context.operationType || 'CREATE_TREATMENT_REQUEST'
    });

    await connection.commit();

    return {
      id: result.insertId,
      status: 'waiting_review'
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// async function createRequest(beneficiaryId, body, files = [], context = {}) {
//   const submissionType = body.submission_type || 'draft';
//   const isSubmit = submissionType === 'submit';
//   const missingFields = requestFields.filter((field) => {
//     return isSubmit && (body[field] === undefined || body[field] === '');
//   });
//   if (!['draft', 'submit'].includes(submissionType) || missingFields.length) {
//     const error = new Error('Invalid treatment request');
//     error.statusCode = 400;
//     error.missingFields = missingFields;
//     throw error;
//   }

//   const data = requestData(body);
//   const connection = await database.getConnection();
//   try {
//     await connection.beginTransaction();
//     const [result] = await connection.execute(
//       `INSERT INTO treatment_requests
//         (beneficiary_id, hospital_name, doctor_name, diagnosis, disease_type,
//          treatment_cost, is_urgent, submission_type, status, stage)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [beneficiaryId, ...Object.values(data), submissionType,
//         isSubmit ? 'waiting_review' : 'draft', isSubmit ? 'باحث اجتماعي' : 'مستفيد']
//     );
//     for (const file of files) await addAttachment(connection, result.insertId, file);
//     await addAuditLog(connection, {
//       ...context,
//       requestId: result.insertId,
//       operationType: context.operationType || 'CREATE_TREATMENT_REQUEST'
//     });
//     await connection.commit();
//     return { id: result.insertId, status: isSubmit ? 'waiting_review' : 'draft' };
//   } catch (error) {
//     await connection.rollback();
//     throw error;
//   } finally {
//     connection.release();
//   }
// }

async function updateRequest(requestId, body, context = {}) {
  const data = requestData(body);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const assignments = requestFields.map((field) => `${field} = ?`).join(', ');
    const [result] = await connection.execute(
      `UPDATE treatment_requests SET ${assignments} WHERE id = ?`,
      [...requestFields.map((field) => data[field]), requestId]
    );
    if (result.affectedRows > 0) {
      await addAuditLog(connection, {
        ...context,
        requestId,
        operationType: context.operationType || 'UPDATE_REQUEST'
      });
    }
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function addRequestAttachments(requestId, files = [], context = {}) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    for (const file of files) await addAttachment(connection, requestId, file);
    if (files.length) {
      await addAuditLog(connection, {
        ...context,
        requestId,
        operationType: context.operationType || 'ADD_ATTACHMENT'
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAttachment(attachmentId, body, context = {}) {
  const data = Object.fromEntries(attachmentFields
    .filter((field) => body[field] !== undefined)
    .map((field) => [field, body[field]]));
  const fields = Object.keys(data);
  if (!fields.length) return false;
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE treatment_request_attachments SET ${assignments} WHERE id = ?`,
      [...fields.map((field) => data[field]), attachmentId]
    );
    if (result.affectedRows > 0) {
      const [attachments] = await connection.execute(
        'SELECT treatment_request_id FROM treatment_request_attachments WHERE id = ?',
        [attachmentId]
      );
      await addAuditLog(connection, {
        ...context,
        requestId: attachments[0]?.treatment_request_id ?? null,
        operationType: context.operationType || 'UPDATE_ATTACHMENT'
      });
    }
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function transitionRequest(requestId, action, notes, context = {}) {
  const transitions = {
    forward: { status: 'waiting_review', stage: 'باحث اجتماعي' },
    return_to_beneficiary: { status: 'returned_for_correction', stage: 'مستفيد' }
  };
  const transition = transitions[action];
  if (!transition) {
    const error = new Error('Invalid treatment request action');
    error.statusCode = 400;
    throw error;
  }
  if (action === 'return_to_beneficiary' && !notes?.trim()) {
    const error = new Error('Notes are required when returning a request');
    error.statusCode = 400;
    throw error;
  }
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'UPDATE treatment_requests SET status = ?, stage = ?, notes = ? WHERE id = ?',
      [transition.status, transition.stage, notes || null, requestId]
    );
    if (result.affectedRows > 0) {
      await addAuditLog(connection, {
        ...context,
        requestId,
        operationType: context.operationType || 'STATUS_CHANGE',
        notes: notes || context.notes
      });
    }
    await connection.commit();
    return result.affectedRows > 0 ? transition : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getStatuses(request, response) {
  const [rows] = await database.execute(
    'SELECT DISTINCT status FROM treatment_requests ORDER BY status'
  );
  response.json({ success: true, data: rows.map((row) => row.status) });
}

async function create(request, response) {
  const result = await createRequest(request.user.id, request.body, [], {
    userId: request.user.id,
    ipAddress: request.ip,
    device: request.get('user-agent')
  });
  response.status(201).json({ success: true, data: result });
}

async function list(request, response) {
  const values = [];
  let query = 'SELECT * FROM treatment_requests';
  if (request.user.role === 'مستفيد' || request.user.role === 'beneficiary' || request.user.role === 'Beneficiary') {
    query += ' WHERE beneficiary_id = ?';
    values.push(request.user.id);
  }
  query += ' ORDER BY created_at DESC';
  const [rows] = await database.execute(query, values);
  response.json({ success: true, data: rows });
}

async function getById(request, response) {
  const [rows] = await database.execute(
    'SELECT * FROM treatment_requests WHERE id = ?',
    [request.params.id]
  );
  if (!rows.length) return response.status(404).json({ success: false, error: 'Treatment request not found' });
  if (request.user.role === 'مستفيد' && rows[0].beneficiary_id !== request.user.id) {
    return response.status(403).json({ success: false, error: 'Forbidden' });
  }
  response.json({ success: true, data: rows[0] });
}

async function update(request, response) {
  const updated = await updateRequest(request.params.id, request.body, {
    userId: request.user.id,
    ipAddress: request.ip,
    device: request.get('user-agent')
  });
  if (!updated) return response.status(404).json({ success: false, error: 'Treatment request not found' });
  response.json({ success: true, data: { id: request.params.id } });
}

async function updateStatus(request, response) {
  const result = await transitionRequest(request.params.id, request.body.action, request.body.notes, {
    userId: request.user.id,
    ipAddress: request.ip,
    device: request.get('user-agent')
  });
  if (!result) return response.status(404).json({ success: false, error: 'Treatment request not found' });
  response.json({ success: true, data: result });
}

async function remove(request, response) {
  const [result] = await database.execute(
    'DELETE FROM treatment_requests WHERE id = ?',
    [request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ success: false, error: 'Treatment request not found' });
  response.status(204).send();
}

module.exports = {
  addAuditLog,
  createRequest,
  updateRequest,
  addRequestAttachments,
  updateAttachment,
  transitionRequest,
  getStatuses,
  create,
  list,
  getById,
  update,
  updateStatus,
  delete: remove
};
