/**
 * Centralized Error Handling Utility
 * Handles common API error codes and provides user-friendly messages
 */

/**
 * Handle API errors and provide appropriate user feedback
 */
export function handleAPIError(error, router) {
  if (!error.response) {
    // Network error or no response
    return {
      message: 'Unable to connect to server. Please check your internet connection.',
      redirect: null,
      code: 'NETWORK_ERROR'
    };
  }

  const status = error.response.status;
  const data = error.response.data || {};
  const code = data.code || 'UNKNOWN_ERROR';

  switch (status) {
    case 401:
      // Unauthorized - redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return {
        message: 'Your session has expired. Please log in again.',
        redirect: '/login',
        code: 'UNAUTHORIZED'
      };

    case 403:
      // Forbidden - check specific codes
      if (code === 'TERMS_NOT_ACCEPTED') {
        return {
          message: 'You must accept the updated Terms of Service and Privacy Policy to continue.',
          redirect: '/accept-terms',
          code: 'TERMS_NOT_ACCEPTED'
        };
      }

      if (code === 'SUBSCRIPTION_REQUIRED' || code === 'SUBSCRIPTION_INACTIVE') {
        return {
          message: data.message || 'A subscription is required to use this feature.',
          redirect: `/dashboard/v2/modules/${data.module_key || ''}`,
          code: code
        };
      }

      if (code === 'USAGE_LIMIT_REACHED') {
        return {
          message: data.message || 'You have reached your usage limit. Please upgrade your plan.',
          redirect: `/dashboard/v2/settings/billing`,
          code: 'USAGE_LIMIT_REACHED',
          usage: data.usage
        };
      }

      if (code === 'BUSINESS_CONTEXT_REQUIRED') {
        return {
          message: 'Please select an organization to continue.',
          redirect: '/dashboard/v2',
          code: 'BUSINESS_CONTEXT_REQUIRED'
        };
      }

      if (code === 'PERMISSION_DENIED') {
        return {
          message: data.message || 'You do not have permission to perform this action.',
          redirect: null,
          code: 'PERMISSION_DENIED'
        };
      }

      return {
        message: data.message || 'You do not have permission to access this resource.',
        redirect: null,
        code: code
      };

    case 404:
      return {
        message: data.message || 'The requested resource was not found.',
        redirect: null,
        code: 'NOT_FOUND'
      };

    case 429:
      // Rate limit exceeded
      const retryAfter = data.retryAfter || 60;
      return {
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        redirect: null,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter
      };

    case 503:
      // Service unavailable (module offline)
      if (code === 'MODULE_OFFLINE') {
        return {
          message: data.message || 'This module is temporarily unavailable. Please try again later.',
          redirect: null,
          code: 'MODULE_OFFLINE'
        };
      }

      return {
        message: 'The service is temporarily unavailable. Please try again later.',
        redirect: null,
        code: 'SERVICE_UNAVAILABLE'
      };

    case 500:
    default:
      return {
        message: data.message || 'An unexpected error occurred. Please try again later.',
        redirect: null,
        code: code || 'SERVER_ERROR'
      };
  }
}

/**
 * Display error to user using toast notification
 */
export function showError(error, toast) {
  const errorInfo = handleAPIError(error);
  
  if (errorInfo.redirect && typeof window !== 'undefined') {
    // Show error message briefly, then redirect
    toast.error(errorInfo.message);
    setTimeout(() => {
      window.location.href = errorInfo.redirect;
    }, 2000);
  } else {
    toast.error(errorInfo.message);
  }
  
  return errorInfo;
}





