/**
 * Format date string to local timezone
 * Handles UTC dates properly by ensuring timezone conversion
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  // Ensure the date string is treated as UTC if it doesn't have timezone info
  let date;
  if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    // Already has timezone info
    date = new Date(dateString);
  } else {
    // Assume UTC if no timezone specified (database timestamps are typically UTC)
    date = new Date(dateString + 'Z');
  }
  
  // Convert to local timezone for display
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Format date only (no time)
 */
export function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  
  let date;
  if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    date = new Date(dateString);
  } else {
    date = new Date(dateString + 'Z');
  }
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

/**
 * Format time only (no date)
 */
export function formatTimeOnly(dateString) {
  if (!dateString) return 'N/A';
  
  let date;
  if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    date = new Date(dateString);
  } else {
    date = new Date(dateString + 'Z');
  }
  
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

