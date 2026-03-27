import { verifyToken } from '../utils/auth.js';
import { User } from '../models/User.js';

/** True if the error looks like an upstream HTML error (e.g. Cloudflare 500 page) */
function isUpstreamHtmlError(error) {
  const msg = error?.message ?? '';
  if (typeof msg !== 'string') return false;
  const trimmed = msg.trim();
  return trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE') || trimmed.includes('cloudflare');
}

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    req.businessId = user.business_id;
    next();
  } catch (error) {
    if (isUpstreamHtmlError(error)) {
      console.error('Auth middleware: auth service returned HTML (e.g. Supabase/Cloudflare 500).', error?.code ?? '');
      return res.status(503).json({
        error: 'Auth service temporarily unavailable',
        code: 'AUTH_SERVICE_UNAVAILABLE',
      });
    }
    const msg = typeof error?.message === 'string' && error.message.length < 500 ? error.message : (error?.code ?? 'Unknown');
    console.error('Auth middleware error:', msg);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Middleware to ensure user belongs to the business they're accessing
export const ensureBusinessAccess = (req, res, next) => {
  const requestedBusinessId = req.params.businessId || req.body.business_id;
  
  if (requestedBusinessId && requestedBusinessId !== req.businessId) {
    return res.status(403).json({ error: 'Access denied to this business' });
  }
  
  next();
};

