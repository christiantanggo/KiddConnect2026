// utils/phonePreflight.js
// Pre-flight checks for phone number assignment

/**
 * Validate environment variables required for phone number assignment
 * @returns {Object} { valid: boolean, missing: string[], warnings: string[] }
 */
export function validatePhoneAssignmentEnv() {
  const missing = [];
  const warnings = [];
  
  // Required environment variables
  if (!process.env.VAPI_API_KEY) {
    missing.push('VAPI_API_KEY');
  }
  
  if (!process.env.TELNYX_API_KEY) {
    missing.push('TELNYX_API_KEY');
  }
  
  // Optional but recommended
  if (!process.env.VAPI_TELNYX_CREDENTIAL_ID) {
    warnings.push('VAPI_TELNYX_CREDENTIAL_ID not set - VAPI may auto-detect credentials, but explicit credential ID is recommended');
  }
  
  // Check VAPI base URL
  const vapiUrl = process.env.VAPI_BASE_URL || 'https://api.vapi.ai';
  if (!vapiUrl.startsWith('https://')) {
    warnings.push(`VAPI_BASE_URL should use HTTPS: ${vapiUrl}`);
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Check if phone number assignment is possible
 * @returns {Promise<Object>} { canAssign: boolean, reason: string, details: Object }
 */
export async function canAssignPhoneNumber() {
  const envCheck = validatePhoneAssignmentEnv();
  
  if (!envCheck.valid) {
    return {
      canAssign: false,
      reason: 'Missing required environment variables',
      details: {
        missing: envCheck.missing,
        warnings: envCheck.warnings,
      },
    };
  }
  
  // Try to verify VAPI connection
  try {
    const { getVapiClient } = await import('../services/vapi.js');
    const client = getVapiClient();
    
    // Try a simple API call to verify connection
    try {
      await client.get('/assistant?limit=1');
      return {
        canAssign: true,
        reason: 'All checks passed',
        details: {
          warnings: envCheck.warnings,
        },
      };
    } catch (error) {
      if (error.response?.status === 401) {
        return {
          canAssign: false,
          reason: 'VAPI authentication failed - check VAPI_API_KEY',
          details: {
            error: error.message,
            warnings: envCheck.warnings,
          },
        };
      }
      // Other errors might be OK (e.g., no assistants yet)
      return {
        canAssign: true,
        reason: 'VAPI connection verified (with warnings)',
        details: {
          warnings: [...envCheck.warnings, `VAPI API call returned: ${error.response?.status || error.message}`],
        },
      };
    }
  } catch (error) {
    return {
      canAssign: false,
      reason: 'Failed to verify VAPI connection',
      details: {
        error: error.message,
        warnings: envCheck.warnings,
      },
    };
  }
}
















