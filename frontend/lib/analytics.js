/**
 * Analytics tracking utility
 * Supports both Google Analytics (if configured) and custom database tracking
 */

/**
 * Track an event (button click, page view, etc.)
 * @param {string} eventName - Name of the event (e.g., 'button_click', 'demo_started')
 * @param {object} eventData - Event data (category, label, value, location, etc.)
 */
export function trackEvent(eventName, eventData = {}) {
  if (typeof window === 'undefined') return;

  const {
    category = 'general',
    label = '',
    value = null,
    action = eventName,
    location = null,
    ...customData
  } = eventData;

  // Track with Google Analytics if available
  if (window.gtag) {
    try {
      window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
        ...customData,
      });
    } catch (error) {
      console.warn('[Analytics] Error tracking with gtag:', error);
    }
  }

  // Also track with custom API (database) for redundancy
  try {
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    const payload = {
      event_name: eventName,
      category,
      label,
      value,
      action,
      location,
      custom_data: customData,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[Analytics] Tracking event:', eventName, payload);
    
    fetch(`${API_URL}/api/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    .then(response => {
      console.log('[Analytics] Response status:', response.status);
      return response.json();
    })
    .then(data => {
      console.log('[Analytics] Response data:', data);
    })
    .catch((error) => {
      console.error('[Analytics] Could not send to API:', error);
    });
  } catch (error) {
    console.error('[Analytics] Error in trackEvent:', error);
  }
}

/**
 * Track a button click
 * @param {string} buttonName - Name/identifier of the button
 * @param {string} location - Where the button is located (e.g., 'homepage_nav', 'hero_section')
 */
export function trackButtonClick(buttonName, location = 'unknown') {
  trackEvent('button_click', {
    category: 'interaction',
    label: buttonName,
    action: 'click',
    location,
  });
}

/**
 * Track a link click
 * @param {string} linkName - Name/identifier of the link
 * @param {string} destination - Where the link goes
 * @param {string} location - Where the link is located
 */
export function trackLinkClick(linkName, destination, location = 'unknown') {
  trackEvent('link_click', {
    category: 'navigation',
    label: linkName,
    action: 'click',
    destination,
    location,
  });
}

/**
 * Track page view
 * @param {string} pageName - Name of the page
 */
export function trackPageView(pageName) {
  trackEvent('page_view', {
    category: 'navigation',
    label: pageName,
    action: 'view',
  });
}

