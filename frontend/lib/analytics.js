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
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
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

/**
 * Track scroll depth (how far user scrolled)
 * @param {number} percentage - Scroll percentage (0-100)
 * @param {string} pageName - Name of the page
 */
export function trackScrollDepth(percentage, pageName = 'homepage') {
  // Only track milestone percentages to avoid spam
  const milestones = [25, 50, 75, 100];
  if (milestones.includes(percentage)) {
    trackEvent('scroll_depth', {
      category: 'engagement',
      label: `${percentage}%`,
      action: 'scroll',
      value: percentage,
      location: pageName,
    });
  }
}

/**
 * Track time on page
 * @param {number} seconds - Time spent on page in seconds
 * @param {string} pageName - Name of the page
 */
export function trackTimeOnPage(seconds, pageName = 'homepage') {
  // Only track milestones to avoid spam
  const milestones = [10, 30, 60, 120, 300]; // 10s, 30s, 1m, 2m, 5m
  if (milestones.includes(seconds)) {
    trackEvent('time_on_page', {
      category: 'engagement',
      label: `${seconds}s`,
      action: 'time',
      value: seconds,
      location: pageName,
    });
  }
}

/**
 * Track section visibility (when a section comes into view)
 * @param {string} sectionName - Name of the section
 * @param {string} pageName - Name of the page
 */
export function trackSectionView(sectionName, pageName = 'homepage') {
  trackEvent('section_view', {
    category: 'engagement',
    label: sectionName,
    action: 'view',
    location: pageName,
  });
}

/**
 * Track exit intent (user moving mouse toward top of screen to close tab)
 * @param {string} pageName - Name of the page
 */
export function trackExitIntent(pageName = 'homepage') {
  trackEvent('exit_intent', {
    category: 'engagement',
    label: 'mouse_leave_top',
    action: 'exit',
    location: pageName,
  });
}

