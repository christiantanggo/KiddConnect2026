import { Business } from '../../models/Business.js';

function isUpstreamHtmlError(error) {
  const msg = error?.message ?? '';
  if (typeof msg !== 'string') return false;
  const trimmed = msg.trim();
  return trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE') || trimmed.includes('cloudflare');
}

/**
 * Simplified requireBusinessContext Middleware
 *
 * Uses user.business_id directly (single business per user)
 * Multi-organization features removed - will be added back later
 */
export const requireBusinessContext = async (req, res, next) => {
  try {
    // User must be authenticated first (via authenticate middleware)
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Use user's business_id directly (single business per user)
    const activeBusinessId = req.user.business_id;

    if (!activeBusinessId) {
      return res.status(400).json({
        error: 'Business not found',
        code: 'BUSINESS_NOT_FOUND',
        message: 'Your account is not associated with a business'
      });
    }

    // Load full business object
    const business = await Business.findById(activeBusinessId);
    if (!business) {
      return res.status(404).json({
        error: 'Business not found',
        code: 'BUSINESS_NOT_FOUND'
      });
    }

    // Attach to request
    req.active_business_id = activeBusinessId;
    req.business = business;

    next();
  } catch (error) {
    if (isUpstreamHtmlError(error)) {
      console.error('[requireBusinessContext] Database returned HTML (e.g. Supabase/Cloudflare 500).', error?.code ?? '');
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    console.error('[requireBusinessContext] Error:', error);
    return res.status(500).json({
      error: 'Failed to resolve business context',
      code: 'BUSINESS_CONTEXT_ERROR'
    });
  }
};
