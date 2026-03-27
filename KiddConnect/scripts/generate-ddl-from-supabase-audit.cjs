#!/usr/bin/env node
/**
 * Reads a JSON export from old-database-export-for-migration.sql (Option A):
 *   [ { "section": "02_columns", "payload": { ... } }, ... ]
 *
 * Supabase SQL Editor: run Option A, export rows as JSON (full result — use Download).
 * "payload" may be an object or a JSON string.
 *
 * Usage (repo root has "type":"module" — this file is .cjs on purpose):
 *   node KiddConnect/scripts/generate-ddl-from-supabase-audit.cjs path/to/export.json > public-ddl.sql
 *
 * Re-run Option A on the OLD (Tavari) DB after pulling latest SQL file so 04_foreign_keys
 * includes from_ordinal for composite keys.
 */

const fs = require('fs');

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node generate-ddl-from-supabase-audit.cjs <export.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.rows || raw.data || [];
if (!Array.isArray(rows)) {
  console.error('JSON must be an array of { section, payload }');
  process.exit(1);
}

function payloadObj(p) {
  if (p == null) return null;
  if (typeof p === 'string') {
    try {
      return JSON.parse(p);
    } catch {
      return null;
    }
  }
  return p;
}

const bySection = new Map();
for (const row of rows) {
  const sec = row.section;
  const pay = payloadObj(row.payload);
  if (!sec || !pay) continue;
  if (!bySection.has(sec)) bySection.set(sec, []);
  bySection.get(sec).push(pay);
}

const cols = bySection.get('02_columns') || [];
const pkUnique = bySection.get('03_pk_unique') || [];
const fks = bySection.get('04_foreign_keys') || [];
const checks = bySection.get('05_other_constraints') || [];

/** @type {Map<string, object[]>} */
const tableCols = new Map();
for (const c of cols) {
  const t = c.table_name;
  if (!t) continue;
  if (!tableCols.has(t)) tableCols.set(t, []);
  tableCols.get(t).push(c);
}
for (const [, list] of tableCols) {
  list.sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
}

function pgType(c) {
  const dt = c.data_type;
  const udt = c.udt_name;
  const ml = c.character_maximum_length;
  const p = c.numeric_precision;
  const s = c.numeric_scale;

  if (dt === 'ARRAY') {
    const base = udt && udt.startsWith('_') ? udt.slice(1) : udt || 'text';
    return `${base}[]`;
  }
  if (dt === 'USER-DEFINED') {
    return `"${String(udt).replace(/"/g, '""')}"`;
  }
  if (dt === 'character varying') {
    return ml != null ? `character varying(${ml})` : 'character varying';
  }
  if (dt === 'character') {
    return ml != null ? `character(${ml})` : 'character';
  }
  if (dt === 'numeric' || dt === 'decimal') {
    if (p != null && s != null) return `${dt}(${p},${s})`;
    if (p != null) return `${dt}(${p})`;
    return dt;
  }
  const passthrough = new Set([
    'bigint',
    'integer',
    'smallint',
    'uuid',
    'text',
    'boolean',
    'json',
    'jsonb',
    'date',
    'real',
    'double precision',
    'bytea',
    'timestamp with time zone',
    'timestamp without time zone',
    'time without time zone',
    'time with time zone',
    'interval',
  ]);
  if (passthrough.has(dt)) return dt;
  return udt || dt;
}

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function isTrivialNotNullCheck(clause) {
  if (!clause || typeof clause !== 'string') return false;
  const s = clause.replace(/\s+/g, ' ').trim();
  // Skip auto NOT NULL checks (redundant with column NOT NULL)
  return (
    /^\(?[a-zA-Z_][a-zA-Z0-9_]*\)? IS NOT NULL$/i.test(s) ||
    /^\("[^"]+"\) IS NOT NULL$/i.test(s)
  );
}

const pkByTable = new Map();
const uniqueConstraints = [];

for (const row of pkUnique) {
  const t = row.table_name;
  const cn = row.constraint_name;
  const typ = row.constraint_type;
  const col = row.column_name;
  const ord = row.ordinal_position || 0;
  if (!t || !cn || !typ || !col) continue;

  if (typ === 'PRIMARY KEY') {
    if (!pkByTable.has(t)) pkByTable.set(t, new Map());
    const m = pkByTable.get(t);
    if (!m.has(cn)) m.set(cn, []);
    m.get(cn).push({ name: col, ord });
  } else if (typ === 'UNIQUE') {
    uniqueConstraints.push({ table: t, constraint_name: cn, col, ord });
  }
}

function pkColumnsForTable(table) {
  const m = pkByTable.get(table);
  if (!m || m.size === 0) return null;
  const [, cols] = [...m.entries()][0];
  return [...cols].sort((a, b) => a.ord - b.ord).map((x) => x.name);
}

const fkGroups = new Map();
for (const row of fks) {
  const key = `${row.from_table}\0${row.constraint_name}`;
  if (!fkGroups.has(key)) fkGroups.set(key, []);
  fkGroups.get(key).push(row);
}
for (const [, list] of fkGroups) {
  list.sort((a, b) => (a.from_ordinal || 0) - (b.from_ordinal || 0));
}

const uniqGroups = new Map();
for (const row of uniqueConstraints) {
  const key = `${row.table}\0${row.constraint_name}`;
  if (!uniqGroups.has(key)) uniqGroups.set(key, []);
  uniqGroups.get(key).push(row);
}
for (const [, list] of uniqGroups) {
  list.sort((a, b) => (a.ord || 0) - (b.ord || 0));
}

const tableNames = [...tableCols.keys()].sort();

const out = [];
out.push('-- Generated by generate-ddl-from-supabase-audit.cjs — REVIEW before running.');
out.push('-- Target: empty public schema (or drop existing objects first).');
out.push('-- Does not create sequences for SERIAL/nextval — use pg_dump or add sequences if restore fails.');
out.push('SET search_path = public;');
out.push('');

for (const t of tableNames) {
  const list = tableCols.get(t);
  const pkCols = pkColumnsForTable(t);
  const lines = [];
  for (const c of list) {
    const parts = [qIdent(c.column_name), pgType(c)];
    if (c.is_nullable === 'NO') parts.push('NOT NULL');
    if (c.column_default != null && String(c.column_default).length > 0) {
      parts.push('DEFAULT', String(c.column_default));
    }
    lines.push('  ' + parts.join(' '));
  }
  if (pkCols && pkCols.length) {
    lines.push(`  PRIMARY KEY (${pkCols.map(qIdent).join(', ')})`);
  }
  out.push(`CREATE TABLE IF NOT EXISTS public.${qIdent(t)} (`);
  out.push(lines.join(',\n'));
  out.push(');');
  out.push('');
}

for (const [, list] of uniqGroups) {
  const t = list[0].table;
  const cn = list[0].constraint_name;
  const colnames = list.map((r) => qIdent(r.col)).join(', ');
  out.push(
    `ALTER TABLE ONLY public.${qIdent(t)} ADD CONSTRAINT ${qIdent(cn)} UNIQUE (${colnames});`
  );
}
if (uniqGroups.size) out.push('');

let anyCheck = false;
for (const row of checks) {
  if (row.constraint_type !== 'CHECK' || !row.check_clause) continue;
  if (isTrivialNotNullCheck(row.check_clause)) continue;
  const t = row.table_name;
  const cn = row.constraint_name;
  if (!t || !cn) continue;
  anyCheck = true;
  out.push(
    `ALTER TABLE ONLY public.${qIdent(t)} ADD CONSTRAINT ${qIdent(cn)} CHECK (${row.check_clause});`
  );
}
if (anyCheck) out.push('');

for (const [, list] of fkGroups) {
  const first = list[0];
  const ft = first.from_table;
  const tt = first.to_table;
  const cn = first.constraint_name;
  const fromCols = list.map((r) => qIdent(r.from_column)).join(', ');
  const toCols = list.map((r) => qIdent(r.to_column)).join(', ');
  out.push(
    `ALTER TABLE ONLY public.${qIdent(ft)} ADD CONSTRAINT ${qIdent(cn)} FOREIGN KEY (${fromCols}) REFERENCES public.${qIdent(tt)} (${toCols});`
  );
}

out.push('');
console.log(out.join('\n'));
