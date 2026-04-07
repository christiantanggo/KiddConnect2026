import { Business } from '../../models/Business.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';

function isUpstreamHtmlError(error) {
  const msg = error?.message ?? '';
  if (typeof msg !== 'string') return false;
  const trimmed = msg.trim();
  return trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE') || trimmed.includes('cloudflare');
}

/** Avoid log spam when clients poll every few seconds during a Supabase/Cloudflare blip. */
let lastUpstreamHtmlLogAt = 0;
const UPSTREAM_HTML_LOG_COOLDOWN_MS = 60_000;

/** Strip junk values clients sometimes send for X-Active-Business-Id (e.g. literal "null"). */
function normalizeActiveBusinessHeader(raw) {
  const v = String(raw ?? '').trim();
  if (!v || /^null$/i.test(v) || /^undefined$/i.test(v)) return '';
  return v;
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

    // Use X-Active-Business-Id when present and user has access; else user.business_id
    let activeBusinessId = normalizeActiveBusinessHeader(req.headers['x-active-business-id']);
    const userPrimaryBiz = req.user.business_id != null ? String(req.user.business_id) : '';
    if (activeBusinessId && activeBusinessId !== userPrimaryBiz) {
      const membership = await OrganizationUser.findByUserAndBusiness(req.user.id, activeBusinessId).catch(() => null);
      if (!membership) activeBusinessId = userPrimaryBiz || '';
    }
    if (!activeBusinessId) activeBusinessId = userPrimaryBiz || '';

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
      const now = Date.now();
      if (now - lastUpstreamHtmlLogAt >= UPSTREAM_HTML_LOG_COOLDOWN_MS) {
        lastUpstreamHtmlLogAt = now;
        console.error(
          '[requireBusinessContext] Upstream returned HTML (Supabase/Cloudflare outage or 500). Clients get 503 SERVICE_UNAVAILABLE. Check Supabase status & pooler.'
        );
      }
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
