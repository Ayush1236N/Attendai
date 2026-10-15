const mongoose = require('mongoose');

// One applied CSV import. `changes` keeps the BEFORE image of every touched
// record so the whole batch can be undone safely (see importService.undo).
const importBatchSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    actorName: String,
    actorRole: String,
    target: { type: String, enum: ['employees', 'attendance', 'adjustments'], required: true },
    mode: String,
    filename: String,
    status: { type: String, enum: ['applied', 'undone', 'partly_undone'], default: 'applied' },
    counts: {
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    sensitive: { type: Boolean, default: false },
    changes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    undoneAt: Date,
    undoneByName: String,
    undoReport: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImportBatch', importBatchSchema);
