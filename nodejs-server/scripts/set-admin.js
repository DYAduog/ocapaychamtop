require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    const res = await User.updateMany({ email: adminEmail }, { level: 'admin' });
    console.log('Promoted to admin for email:', adminEmail, res);
  }
  const users = await User.find({ email: adminEmail });
  console.log('Current admin users:', users.map(u => ({ username: u.username, email: u.email, level: u.level })));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
