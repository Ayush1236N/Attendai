const mongoose = require('mongoose');

// A saved analysis (dataset + range + filters + pivot/chart settings) so the
// analyst can reopen it later or share it with the team. `config` is whatever
// the Analytics Studio UI stores; the server treats it as opaque JSON.
const analystViewSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    ownerName: { type: String },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    shared: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AnalystView', analystViewSchema);
