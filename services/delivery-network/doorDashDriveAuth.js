/**
 * DoorDash Drive API JWT auth (developer portal access keys).
 * @see https://developer.doordash.com/en-US/docs/drive/reference/JWTs/
 */
import jwt from 'jsonwebtoken';

const DEFAULT_API_BASE = 'https://openapi.doordash.com';

export function getDoorDashOpenApiBaseUrl(configEntry) {
  const raw = configEntry?.base_url && String(configEntry.base_url).trim();
  if (raw) return raw.replace(/\/$/, '');
  return DEFAULT_API_BASE;
}

/**
 * @param {{ developer_id: string, key_id: string, signing_secret: string }} creds
 * @returns {string} Bearer token (JWT)
 */
export function createDoorDashDriveJwt(creds) {
  const developer_id = String(creds?.developer_id || '').trim();
  const key_id = String(creds?.key_id || '').trim();
  const signing_secret = String(creds?.signing_secret || '').trim();
  if (!developer_id || !key_id || !signing_secret) {
    throw new Error('DoorDash: developer_id, key_id, and signing_secret are required');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'doordash',
    iss: developer_id,
    kid: key_id,
    iat: now,
    exp: now + 300,
  };
  let secretBuf;
  try {
    secretBuf = Buffer.from(signing_secret, 'base64');
    if (!secretBuf.length) throw new Error('empty');
  } catch {
    secretBuf = Buffer.from(signing_secret, 'utf8');
  }
  return jwt.sign(payload, secretBuf, {
    algorithm: 'HS256',
    header: { typ: 'JWT', 'dd-ver': 'DD-JWT-V1' },
  });
}

/** @param {Record<string, unknown>|null|undefined} fullConfig - getDeliveryConfigFull() value */
export function getDoorDashBrokerFromConfig(fullConfig) {
  const row = fullConfig?.brokers?.doordash;
  if (!row || typeof row !== 'object') return null;
  if (row.enabled === false) return null;
  const developer_id = row.developer_id != null ? String(row.developer_id).trim() : '';
  const key_id = row.key_id != null ? String(row.key_id).trim() : '';
  const signing_secret = row.signing_secret != null ? String(row.signing_secret).trim() : '';
  if (!developer_id || !key_id || !signing_secret) return null;
  return {
    developer_id,
    key_id,
    signing_secret,
    environment: row.environment === 'production' ? 'production' : 'sandbox',
    base_url: getDoorDashOpenApiBaseUrl(row),
  };
}
