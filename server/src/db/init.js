import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Needed for gen_random_uuid()
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);

  console.log('✅ Database initialized.');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});
