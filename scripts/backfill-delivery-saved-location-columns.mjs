/**
 * One-time: fill address_line, city, province, postal_code from legacy `address` on delivery_saved_locations.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (same as backend).
 *
 * Usage: node scripts/backfill-delivery-saved-location-columns.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  hydrateSavedLocationStructuredFields,
} from '../services/delivery-network/canadianAddressParts.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const pageSize = 200;
  let start = 0;
  let updated = 0;
  for (;;) {
    const { data: rows, error } = await supabase
      .from('delivery_saved_locations')
      .select('id, address, address_line, city, province, postal_code')
      .order('created_at', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    if (!rows?.length) break;

    for (const row of rows) {
      const h = hydrateSavedLocationStructuredFields({
        address_line: row.address_line,
        city: row.city,
        province: row.province,
        postal_code: row.postal_code,
        address: row.address,
      });
      const needsWrite =
        h.address_line !== row.address_line ||
        h.city !== row.city ||
        h.province !== row.province ||
        h.postal_code !== row.postal_code ||
        h.address !== row.address;
      if (!needsWrite) continue;

      const { error: upErr } = await supabase
        .from('delivery_saved_locations')
        .update({
          address_line: h.address_line,
          city: h.city,
          province: h.province,
          postal_code: h.postal_code,
          address: h.address,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) console.error('Update failed', row.id, upErr.message);
      else updated += 1;
    }
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  console.log('Done. Rows updated:', updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
