const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');

async function getSettings() {
  let doc = await Settings.findOne({ key: 'org' });
  if (!doc) doc = await Settings.create({ key: 'org' });
  return doc;
}

async function updateSettings(updates, adminId) {
  const doc = await getSettings();
  const previousValue = doc.toObject();
  Object.assign(doc, updates);
  await doc.save();
  await AuditLog.create({
    adminId,
    action: 'UPDATE_SETTINGS',
    entity: 'Settings',
    entityId: String(doc._id),
    previousValue,
    newValue: doc.toObject(),
  });
  return doc;
}

module.exports = { getSettings, updateSettings };
