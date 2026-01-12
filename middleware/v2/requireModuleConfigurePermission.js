import { RolePermission } from '../../models/v2/RolePermission.js';

/**
 * requireModuleConfigurePermission Middleware
 * 
 * Ensures user has 'configure_module' permission to edit module settings.
 * Owner/Admin have this permission by default. Staff is read-only.
 */
export const requireModuleConfigurePermission = async (req, res, next) => {
  try {
    // Must have business context first
    if (!req.business_membership) {
      return res.status(400).json({ 
        error: 'Business context required',
        code: 'BUSINESS_CONTEXT_REQUIRED'
      });
    }

    const role = req.business_membership.role || req.user.role || 'staff';

    // Check if user's role has configure_module permission
    const hasPermission = await RolePermission.hasPermission(role, 'configure_module');

    if (!hasPermission) {
      return res.status(403).json({
        error: 'You do not have permission to configure this module',
        code: 'PERMISSION_DENIED',
        required_permission: 'configure_module',
        user_role: role
      });
    }

    next();
  } catch (error) {
    console.error('[requireModuleConfigurePermission] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify permissions',
      code: 'PERMISSION_CHECK_ERROR'
    });
  }
};

