// lib/toast.js
// Utility to show toast notifications
// This replaces the browser's alert() function

let toastContext = null;

export function setToastContext(context) {
  toastContext = context;
}

export function showToast(message, type = 'info', duration = 5000) {
  if (toastContext) {
    toastContext.showToast(message, type, duration);
  } else {
    // Fallback to console if toast context not available (SSR-safe)
    console.warn('Toast context not available:', message);
    if (typeof window !== 'undefined') {
      // Only use alert in browser environment
      alert(message);
    }
  }
}

export function success(message, duration) {
  showToast(message, 'success', duration);
}

export function error(message, duration) {
  showToast(message, 'error', duration);
}

export function warning(message, duration) {
  showToast(message, 'warning', duration);
}

export function info(message, duration) {
  showToast(message, 'info', duration);
}

