// scripts/migrate-v2.js
// Migration script for Tavari AI Core v2 tables
// Run with: node scripts/migrate-v2.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('');
console.log('🔄 Tavari AI Core v2 Migration');
console.log('================================');
console.log('');
console.log('⚠️  Supabase migrations need to be run via SQL Editor');
console.log('📝 Please run the following SQL in your Supabase SQL Editor:');
console.log('');
console.log('1. Go to Supabase Dashboard → SQL Editor → New Query');
console.log('2. Copy and paste the SQL from: migrations/create_v2_tables.sql');
console.log('3. Run the query');
console.log('');
console.log('Alternatively, you can read the file and copy it manually:');
console.log('');
console.log('   cat migrations/create_v2_tables.sql');
console.log('');
console.log('Or on Windows:');
console.log('');
console.log('   type migrations\\create_v2_tables.sql');
console.log('');
console.log('================================');
console.log('');

// Read and display the SQL file
const sqlPath = path.join(__dirname, '..', 'migrations', 'create_v2_tables.sql');

if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('📄 SQL Migration File Contents:');
  console.log('================================');
  console.log(sql);
  console.log('================================');
  console.log('');
  console.log('✅ Migration SQL file found at:', sqlPath);
  console.log('📋 Copy the SQL above and run it in Supabase SQL Editor');
} else {
  console.error('❌ Migration file not found:', sqlPath);
  console.error('Please ensure migrations/create_v2_tables.sql exists');
  process.exit(1);
}




