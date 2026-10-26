require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const BankAccount = require('../src/models/BankAccount');
const Setting = require('../src/models/Setting');
const Invoice = require('../src/models/Invoice');
const { PusherConfig } = require('../src/models/Log');

// Simple SQL parser for standard phpMyAdmin dumps
function parseSqlInserts(sqlContent) {
  const insertRegex = /INSERT INTO `?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*(?:INSERT|CREATE|ALTER|COMMIT|\n\s*\n|$))/gi;
  const results = {};

  let match;
  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const tableName = match[1].toLowerCase();
    const columns = match[2]
      .split(',')
      .map((col) => col.replace(/[`'\s]/g, '').trim());
    const rawValuesBlock = match[3];

    if (!results[tableName]) results[tableName] = [];

    // Parse value tuples (val1, val2, ...)
    const tupleRegex = /\(([\s\S]*?)\)(?:,\s*|\s*$)/g;
    let tupleMatch;

    while ((tupleMatch = tupleRegex.exec(rawValuesBlock)) !== null) {
      const rowRaw = tupleMatch[1];
      // Parse individual values respecting quotes and commas
      const values = [];
      let currentVal = '';
      let inQuotes = false;
      let escapeNext = false;

      for (let i = 0; i < rowRaw.length; i++) {
        const char = rowRaw[i];
        if (escapeNext) {
          currentVal += char;
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === "'" && !inQuotes) {
          inQuotes = true;
        } else if (char === "'" && inQuotes) {
          inQuotes = false;
        } else if (char === ',' && !inQuotes) {
          values.push(cleanSqlValue(currentVal));
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      values.push(cleanSqlValue(currentVal));

      const rowObj = {};
      columns.forEach((col, idx) => {
        rowObj[col] = values[idx] !== undefined ? values[idx] : null;
      });
      results[tableName].push(rowObj);
    }
  }

  return results;
}

function cleanSqlValue(val) {
  const trimmed = val.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\r/g, '\r').replace(/\\n/g, '\n');
  }
  if (!isNaN(trimmed) && trimmed !== '') return Number(trimmed);
  return trimmed;
}

async function migrate() {
  const sqlFilePath = path.resolve(__dirname, '../../API BANK 7 CỔNG.sql');
  if (!fs.existsSync(sqlFilePath)) {
    console.error(`[Migration] SQL file not found at: ${sqlFilePath}`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bank7gate';
  console.log(`[Migration] Connecting to MongoDB: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri);
    console.log('[Migration] MongoDB connected successfully.');
  } catch (err) {
    console.error('[Migration] Failed to connect to MongoDB:', err.message);
    console.error('Make sure your local MongoDB service is running (mongod or MongoDB service).');
    process.exit(1);
  }

  console.log(`[Migration] Reading and parsing SQL dump: ${sqlFilePath}`);
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  const parsedData = parseSqlInserts(sqlContent);

  console.log('[Migration] Tables detected:', Object.keys(parsedData).join(', '));

  // 1. Migrate Users
  if (parsedData['users']) {
    console.log(`[Migration] Migrating ${parsedData['users'].length} Users...`);
    for (const u of parsedData['users']) {
      await User.findOneAndUpdate(
        { username: u.username },
        {
          legacyId: u.id,
          username: u.username,
          password: u.password,
          email: u.email || '',
          phone: u.phone || '',
          money: Number(u.money || 0),
          totalMoney: Number(u.total_money || 0),
          token: u.token || '',
          level: u.level || 'member',
          status: Number(u.status || 1),
          banned: Number(u.banned || 0),
          timeMomo: Number(u.time_momo || 0),
          device: u.device || '',
        },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Users migrated.');
  }

  // 2. Migrate Settings
  if (parsedData['settings']) {
    console.log(`[Migration] Migrating ${parsedData['settings'].length} Settings...`);
    for (const s of parsedData['settings']) {
      await Setting.findOneAndUpdate({ name: s.name }, { value: s.value }, { upsert: true });
    }
    console.log('✅ Settings migrated.');
  }

  // 3. Migrate Unified Bank Accounts (ACB, BIDV, MBBank, VCB, Viettel, Vietin, ZaloPay, TheSieuRe)
  const bankTables = [
    { table: 'account_acb', code: 'acb', accField: 'account', phoneField: 'username' },
    { table: 'account_bidv', code: 'bidv', accField: 'account', phoneField: 'username' },
    { table: 'account_mbbank', code: 'mbbank', accField: 'stk', phoneField: 'phone' },
    { table: 'account_thesieure', code: 'thesieure', accField: 'usernametsr', phoneField: 'usernametsr' },
    { table: 'account_vietcombank', code: 'vcb', accField: 'account', phoneField: 'username' },
    { table: 'account_viettel', code: 'viettel', accField: 'phone', phoneField: 'phone' },
    { table: 'account_viettin', code: 'viettin', accField: 'account', phoneField: 'username' },
    { table: 'account_zalopay', code: 'zalopay', accField: 'phone', phoneField: 'phone' },
  ];

  let totalBankAccounts = 0;
  for (const { table, code, accField, phoneField } of bankTables) {
    if (parsedData[table]) {
      for (const item of parsedData[table]) {
        const accNum = String(item[accField] || item.account || item.phone || item.stk || '');
        const token = item.token || '';
        if (!token) continue;

        await BankAccount.findOneAndUpdate(
          { token },
          {
            legacyId: item.id,
            legacyUserId: item.user_id,
            bankCode: code,
            accountName: item.name || item.fullname || '',
            accountNumber: accNum,
            username: item[phoneField] || '',
            passwordEncrypted: item.password || '',
            token,
            status: item.status !== undefined ? Number(item.status) : 1,
            sessionData: {
              sessionId: item.sessionId || '',
              deviceId: item.deviceId || '',
              accessToken: item.access_token || '',
              refreshToken: item.refreshToken || '',
              cookie: item.cookie || '',
              salt: item.salt || '',
              iv: item.iv || '',
            },
          },
          { upsert: true }
        );
        totalBankAccounts++;
      }
    }
  }
  console.log(`✅ Migrated ${totalBankAccounts} Bank Accounts across all 8 gateways into MongoDB.`);

  // 4. Migrate Pusher Config
  if (parsedData['tb_pusher']) {
    for (const p of parsedData['tb_pusher']) {
      await PusherConfig.create({
        appId: p.pusher_app_id,
        key: p.pusher_key,
        secret: p.pusher_secret,
        cluster: p.pusher_cluster,
      });
    }
    console.log('✅ Pusher config migrated.');
  }

  console.log('========================================================');
  console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('All MySQL data from "API BANK 7 CỔNG.sql" is now in MongoDB.');
  console.log('========================================================');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
