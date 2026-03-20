/**
 * Run the delivery_requests scheduled_date/scheduled_time migration.
 * Uses DATABASE_URL (direct Postgres connection string from Supabase Dashboard → Settings → Database).
 * If DATABASE_URL is not set, prints the SQL to run in Supabase SQL Editor.
 */
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

const migrationPath = join(__dirname, '..', 'migrations', 'add_delivery_scheduled_datetime.sql');
const sql = readFileSync(migrationPath, 'utf8');

async function run() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL (or SUPABASE_DB_URL) not set. Run the following SQL in Supabase Dashboard → SQL Editor:\n');
    console.log(sql);
    process.exit(1);
  }

  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log('✅ Migration add_delivery_scheduled_datetime.sql applied.');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('Install pg first: npm install pg');
      console.log('\nOr run this SQL manually in Supabase SQL Editor:\n');
      console.log(sql);
      process.exit(1);
    }
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
