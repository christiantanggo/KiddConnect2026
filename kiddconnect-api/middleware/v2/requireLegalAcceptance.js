/**
 * requireLegalAcceptance Middleware
 * 
 * Enforces that users have accepted the latest Terms of Service and Privacy Policy
 * before accessing any module functionality.
 */
export const requireLegalAcceptance = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentTermsVersion = process.env.CURRENT_TERMS_VERSION || '1.0.0';

    // Check if user has accepted latest terms and privacy
    if (!user.terms_accepted_at || 
        !user.privacy_accepted_at || 
        user.terms_version !== currentTermsVersion) {
      
      return res.status(403).json({
        error: 'Terms and Privacy Policy acceptance required',
        code: 'TERMS_NOT_ACCEPTED',
        redirect_to: '/accept-terms',
        message: 'You must accept the updated Terms of Service and Privacy Policy to continue'
      });
    }

    next();
  } catch (error) {
    console.error('[requireLegalAcceptance] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify legal acceptance',
      code: 'LEGAL_CHECK_ERROR'
    });
  }
};




