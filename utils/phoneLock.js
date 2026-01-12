// utils/phoneLock.js
// Simple in-memory lock to prevent race conditions when assigning phone numbers

const phoneAssignmentLocks = new Map();

/**
 * Acquire a lock for phone number assignment
 * @param {string} phoneNumber - Phone number to lock
 * @param {number} timeoutMs - Lock timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Promise<boolean>} True if lock acquired, false if already locked
 */
export async function acquirePhoneLock(phoneNumber, timeoutMs = 30000) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const lockKey = `phone_${normalized}`;
  
  // Check if lock exists and is still valid
  const existingLock = phoneAssignmentLocks.get(lockKey);
  if (existingLock) {
    if (Date.now() < existingLock.expiresAt) {
      console.log(`[Phone Lock] Phone number ${normalized} is already locked (expires in ${Math.round((existingLock.expiresAt - Date.now()) / 1000)}s)`);
      return false;
    } else {
      // Lock expired, remove it
      phoneAssignmentLocks.delete(lockKey);
    }
  }
  
  // Acquire lock
  phoneAssignmentLocks.set(lockKey, {
    phoneNumber: normalized,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + timeoutMs,
  });
  
  console.log(`[Phone Lock] ✅ Lock acquired for phone number ${normalized} (expires in ${timeoutMs}ms)`);
  return true;
}

/**
 * Release a lock for phone number assignment
 * @param {string} phoneNumber - Phone number to unlock
 */
export function releasePhoneLock(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const lockKey = `phone_${normalized}`;
  
  if (phoneAssignmentLocks.has(lockKey)) {
    phoneAssignmentLocks.delete(lockKey);
    console.log(`[Phone Lock] ✅ Lock released for phone number ${normalized}`);
  }
}

/**
 * Check if a phone number is currently locked
 * @param {string} phoneNumber - Phone number to check
 * @returns {boolean} True if locked, false otherwise
 */
export function isPhoneLocked(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const lockKey = `phone_${normalized}`;
  
  const lock = phoneAssignmentLocks.get(lockKey);
  if (!lock) return false;
  
  if (Date.now() >= lock.expiresAt) {
    // Lock expired, remove it
    phoneAssignmentLocks.delete(lockKey);
    return false;
  }
  
  return true;
}

/**
 * Normalize phone number for lock key
 * @param {string} phoneNumber - Phone number to normalize
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  let normalized = phoneNumber.replace(/[^0-9+]/g, '');
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return normalized;
}

/**
 * Clean up expired locks (should be called periodically)
 */
export function cleanupExpiredLocks() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, lock] of phoneAssignmentLocks.entries()) {
    if (now >= lock.expiresAt) {
      phoneAssignmentLocks.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Phone Lock] Cleaned up ${cleaned} expired locks`);
  }
}

// Clean up expired locks every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredLocks, 5 * 60 * 1000);
}
















