import { RolePermission } from '../../models/v2/RolePermission.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';

/**
 * requireModuleConfigurePermission Middleware
 *
 * Ensures user has 'configure_module' permission to edit module settings.
 * Owner/Admin have this permission by default. Staff is read-only.
 *
 * Resolves req.business_membership when missing (auth + requireBusinessContext do not set it).
 */
export const requireModuleConfigurePermission = async (req, res, next) => {
  try {
    if (!req.user?.id || !req.active_business_id) {
      return res.status(400).json({
        error: 'Business context required',
        code: 'BUSINESS_CONTEXT_REQUIRED',
      });
    }

    if (!req.business_membership) {
      const row = await OrganizationUser.findByUserAndBusiness(req.user.id, req.active_business_id);
      if (row) {
        req.business_membership = row;
      } else if (String(req.user.business_id) === String(req.active_business_id)) {
        req.business_membership = { role: req.user.role || 'owner' };
      } else {
        return res.status(403).json({
          error: 'You are not a member of this organization',
          code: 'NOT_ORG_MEMBER',
        });
      }
    }

    const role = (req.business_membership.role || req.user.role || 'staff').toLowerCase();

    // Owners/admins always configure modules (do not depend on role_permissions seed data).
    if (['owner', 'admin'].includes(role)) {
      return next();
    }

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




