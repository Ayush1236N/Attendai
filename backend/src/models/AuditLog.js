const mongoose = require('mongoose');

// Rule 8: every admin-initiated change to attendance (or other sensitive
// records) must be logged with who did what, and what changed.
const auditLogSchema = new mongoose.Schema(
  {
    // Absent for changes made through the Power BI write-back (see actorName/source).
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    actorName: { type: String },
    source: { type: String, enum: ['app', 'powerbi'], default: 'app' },
    // Client-supplied id so a retried request (Power Automate retries!) is applied only once.
    requestId: { type: String, index: { unique: true, sparse: true } },
    action: { type: String, required: true }, // e.g. 'UPDATE_ATTENDANCE', 'DEACTIVATE_EMPLOYEE'
    entity: { type: String, required: true }, // e.g. 'Attendance', 'Employee'
    entityId: { type: String, required: true },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
