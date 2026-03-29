/**
 * Parse Canadian-style address blobs into street / city / province (2-letter) / postal.
 * Keep in sync with services/delivery-network/canadianAddressParts.js
 */

const CA_PROVINCE_CODES = new Set([
  'ON', 'QC', 'BC', 'AB', 'SK', 'MB', 'NS', 'NB', 'PE', 'NL', 'NT', 'NU', 'YT',
]);

const CA_PROVINCE_FULL_NAMES = [
  ['newfoundland and labrador', 'NL'],
  ['prince edward island', 'PE'],
  ['northwest territories', 'NT'],
  ['british columbia', 'BC'],
  ['new brunswick', 'NB'],
  ['saskatchewan', 'SK'],
  ['nova scotia', 'NS'],
  ['québec', 'QC'],
  ['quebec', 'QC'],
  ['manitoba', 'MB'],
  ['ontario', 'ON'],
  ['alberta', 'AB'],
  ['nunavut', 'NU'],
  ['yukon', 'YT'],
];

function stripTrailingFullProvinceName(rest) {
  const t = rest.trim();
  const lower = t.toLowerCase();
  for (const [name, code] of CA_PROVINCE_FULL_NAMES) {
    const suf = ` ${name}`;
    if (lower.endsWith(suf)) {
      const cut = t.slice(0, t.length - suf.length).trim().replace(/,\s*$/, '');
      return { rest: cut, province: code };
    }
  }
  return { rest, province: '' };
}

export function parseCanadianAddressLine(raw) {
  const s = String(raw || '').trim();
  if (!s) return { street: '', city: '', province: '', postal: '' };

  let postal = '';
  let rest = s;
  const postalRe = /([A-Za-z]\d[A-Za-z])[\s-]?(\d[A-Za-z]\d)\s*$/i;
  const mPostal = rest.match(postalRe);
  if (mPostal) {
    postal = `${mPostal[1]} ${mPostal[2]}`.toUpperCase();
    rest = s.slice(0, mPostal.index).replace(/,\s*$/, '').trim();
  }

  let province = '';
  const fullProv = stripTrailingFullProvinceName(rest);
  if (fullProv.province) {
    province = fullProv.province;
    rest = fullProv.rest;
  }

  if (!province) {
    const provComma = rest.match(/,\s*([A-Za-z]{2})\s*$/i);
    if (provComma) {
      province = provComma[1].toUpperCase();
      rest = rest.slice(0, provComma.index).trim();
    } else {
      const provSpace = rest.match(/\s+([A-Za-z]{2})\s*$/i);
      if (provSpace) {
        const p = provSpace[1].toUpperCase();
        if (CA_PROVINCE_CODES.has(p)) {
          province = p;
          rest = rest.slice(0, provSpace.index).trim();
        }
      }
    }
  }

  const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[parts.length - 1];
    const street = parts.slice(0, -1).join(', ');
    return { street, city, province, postal };
  }

  if (parts.length === 1 && parts[0]) {
    const words = parts[0].split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const last = words[words.length - 1];
      if (/^[A-Za-z][A-Za-z\-]+$/.test(last) && last.length >= 2) {
        return {
          street: words.slice(0, -1).join(' '),
          city: last,
          province,
          postal,
        };
      }
    }
  }

  return { street: rest, city: '', province, postal };
}

export function normalizeProvinceToCode(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) {
    const u = s.toUpperCase();
    return CA_PROVINCE_CODES.has(u) ? u : u;
  }
  const lower = s.toLowerCase();
  for (const [name, code] of CA_PROVINCE_FULL_NAMES) {
    if (lower === name) return code;
  }
  return s.length <= 3 ? s.toUpperCase() : s;
}

function isCanadianProvinceFullName(s) {
  const lower = String(s || '').toLowerCase().trim();
  return CA_PROVINCE_FULL_NAMES.some(([name]) => name === lower);
}

export function savedLocationRowToParts(loc) {
  if (!loc) return null;
  const line = loc.address_line != null ? String(loc.address_line).trim() : '';
  let city = loc.city != null ? String(loc.city).trim() : '';
  let prov = loc.province != null ? String(loc.province).trim() : '';
  const pc = loc.postal_code != null ? String(loc.postal_code).trim() : '';

  if (isCanadianProvinceFullName(city)) city = '';
  if (isCanadianProvinceFullName(prov)) prov = '';

  prov = normalizeProvinceToCode(prov);

  if (line && city && prov && pc) {
    return { street: line, city, province: prov, postal: pc };
  }

  const parsed = parseCanadianAddressLine(typeof loc.address === 'string' ? loc.address : '');

  const street = line || parsed.street;
  const cityOut = city || parsed.city;
  let provOut = prov || parsed.province;
  provOut = normalizeProvinceToCode(provOut);
  const postalOut = pc || parsed.postal;

  if (!street && !cityOut && !provOut && !postalOut) return null;
  return {
    street: street || '',
    city: cityOut || '',
    province: provOut || '',
    postal: postalOut || '',
  };
}

/**
 * Pull a single E.164-style phone from free text (e.g. saved location "contact" = name + number).
 * @param {string|null|undefined} s
 * @returns {string|null}
 */
export function extractPhoneFromContact(s) {
  const raw = String(s || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, ' ');
  const chunk = compact.match(/\+?[\d][\d\s\-().]{7,}\d/);
  const toScan = chunk ? chunk[0] : raw;
  const digits = toScan.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15 && raw.includes('+')) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15 && chunk) return digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return null;
}

/** Contact phone stored on delivery_saved_locations.contact for quick-fill (frequent delivery). */
export function savedLocationContactPhone(loc) {
  return extractPhoneFromContact(loc?.contact);
}
