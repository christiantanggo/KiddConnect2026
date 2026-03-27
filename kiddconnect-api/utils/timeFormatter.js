/**
 * Time Formatting Utilities
 * Frontend-specific time formatting functions
 */

/**
 * Convert 24-hour time to 12-hour format for display
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
export function to12Hour(time24) {
  if (!time24 || typeof time24 !== 'string') return '';
  
  const [hours, minutes] = time24.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return time24;
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Convert 12-hour time to 24-hour format for storage
 * @param {string} time12 - Time in 12-hour format (e.g., "2:30 PM")
 * @returns {string} Time in 24-hour format (e.g., "14:30")
 */
export function to24Hour(time12) {
  if (!time12 || typeof time12 !== 'string') return '';
  
  const trimmed = time12.trim();
  
  // If it's already in 24-hour format, return as-is
  if (!trimmed.match(/[AP]M/i)) {
    return trimmed;
  }
  
  const match = trimmed.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return time12;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

