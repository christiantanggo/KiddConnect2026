/**
 * Signed tokens for SMS → /deliverydispatch links so callback phone is bound to the texter (no login).
 * Uses HS256 JWT. Set DELIVERY_SMS_INTAKE_TOKEN_SECRET (or JWT_SECRET) in production.
 */
import jwt from 'jsonwebtoken';
import { normalizePhone } from './config.js';

const ISS = 'delivery-sms-intake';
const TYP = 'sms_schedule';

function getSecret() {
  return (
    String(process.env.DELIVERY_SMS_INTAKE_TOKEN_SECRET || process.env.JWT_SECRET || '').trim() || null
  );
}

/**
 * @param {string} phoneE164
 * @returns {string|null} JWT or null if secret missing / phone invalid
 */
export function signDeliverySmsIntakeToken(phoneE164) {
  const secret = getSecret();
  const phone = normalizePhone(String(phoneE164 || '').trim());
  if (!secret || !phone) return null;
  return jwt.sign(
    { typ: TYP },
    secret,
    {
      subject: phone,
      issuer: ISS,
      expiresIn: '7d',
    },
  );
}

/**
 * @param {string} token
 * @returns {{ phone_e164: string } | null}
 */
export function verifyDeliverySmsIntakeToken(token) {
  const secret = getSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const raw = token.trim();
  if (!raw) return null;
  try {
    const decoded = jwt.verify(raw, secret, {
      issuer: ISS,
      algorithms: ['HS256'],
    });
    if (!decoded || decoded.typ !== TYP) return null;
    const sub = typeof decoded.sub === 'string' ? decoded.sub.trim() : '';
    const phone = normalizePhone(sub) || sub;
    if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) return null;
    return { phone_e164: phone };
  } catch {
    return null;
  }
}

export function isSmsIntakeLinkSigningConfigured() {
  return Boolean(getSecret());
}
