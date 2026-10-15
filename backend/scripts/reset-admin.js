#!/usr/bin/env node
// Create or repair an admin login directly in the database. Use this when:
//   - there is no admin yet / setup-first-admin says one already exists,
//   - you forgot the password, or
//   - 2FA is on and you lost the authenticator.
//
//   node scripts/reset-admin.js --list
//   node scripts/reset-admin.js you@example.com NewPassword123            (creates a super admin, or resets the password)
//   node scripts/reset-admin.js you@example.com NewPassword123 --disable-2fa
//
// Run from the backend folder (it reads backend/.env for MONGO_URI).
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const env = require('../src/config/environment');
const Admin = require('../src/models/Admin');

(async () => {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [email, password] = args.filter((a) => !a.startsWith('--'));

  await mongoose.connect(env.mongoUri);
  console.log(`Connected to ${env.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);

  if (flags.includes('--list') || !email) {
    const admins = await Admin.find({}).select('name email role status twoFactorEnabled');
    console.log(admins.length ? 'Admins in this database:' : 'There are NO admins in this database.');
    admins.forEach((a) => console.log(` - ${a.email}  role=${a.role}  status=${a.status}  2FA=${a.twoFactorEnabled ? 'ON' : 'off'}`));
    if (!email) console.log('\nTo create/reset one:  node scripts/reset-admin.js you@example.com NewPassword123');
    return;
  }
  if (!password || password.length < 8) throw new Error('Give a password of at least 8 characters.');

  const passwordHash = await bcrypt.hash(password, 12);
  let admin = await Admin.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (admin) {
    admin.passwordHash = passwordHash;
    admin.status = 'active';
    if (flags.includes('--disable-2fa')) { admin.twoFactorEnabled = false; admin.twoFactorSecret = undefined; }
    await admin.save();
    console.log(`Password reset for ${admin.email} (role ${admin.role}).`);
  } else {
    admin = await Admin.create({ name: 'Admin', email, passwordHash, role: 'super_admin', status: 'active' });
    console.log(`Created super admin ${admin.email}.`);
  }
})()
  .catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
