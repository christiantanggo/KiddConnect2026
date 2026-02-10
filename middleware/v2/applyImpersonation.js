import { User } from '../../models/User.js';

/**
 * applyImpersonation Middleware
 * 
 * Applies impersonation context when admin is impersonating a user.
 * Must be used AFTER authentication middleware.
 */
export const applyImpersonation = async (req, res, next) => {
  try {
    if (req.session?.impersonation) {
      const { user_id, mode, admin_user_id, started_at } = req.session.impersonation;
      
      // Check if impersonation session expired (2 hours default)
      const IMPERSONATION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
      const duration = Date.now() - new Date(started_at).getTime();
      
      if (duration > IMPERSONATION_TIMEOUT) {
        // Session expired
        delete req.session.impersonation;
        return res.status(401).json({
          error: 'Impersonation session expired',
          code: 'IMPERSONATION_EXPIRED'
        });
      }
      
      // Load impersonated user
      const impersonatedUser = await User.findById(user_id);
      if (!impersonatedUser) {
        delete req.session.impersonation;
        return res.status(404).json({
          error: 'Impersonated user not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Store original user
      req.original_user = req.user;
      
      // Override user context
      req.user = impersonatedUser;
      req.impersonated_by = admin_user_id;
      req.impersonation_mode = mode;
      
      // In read-only mode, block mutations
      if (mode === 'readonly' && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return res.status(403).json({
          error: 'Read-only impersonation mode. Cannot make changes.',
          code: 'READONLY_IMPERSONATION'
        });
      }
      
      // Attach to audit log context
      req.audit_context = {
        ...req.audit_context,
        impersonated: true,
        impersonated_by: admin_user_id,
        impersonation_mode: mode
      };
    }
    
    next();
  } catch (error) {
    console.error('[applyImpersonation] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to apply impersonation context',
      code: 'IMPERSONATION_ERROR'
    });
  }
};




