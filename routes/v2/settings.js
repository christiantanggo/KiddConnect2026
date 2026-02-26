import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { requireModuleConfigurePermission } from '../../middleware/v2/requireModuleConfigurePermission.js';
import { requireLegalAcceptance } from '../../middleware/v2/requireLegalAcceptance.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { AuditLog } from '../../models/v2/AuditLog.js';
import { Business } from '../../models/Business.js';
import { User } from '../../models/User.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';
import { RolePermission } from '../../models/v2/RolePermission.js';
import { supabaseClient } from '../../config/database.js';

const router = express.Router();

// All settings routes require authentication and business context
router.use(authenticate);
router.use(requireBusinessContext);
// Legal acceptance required per route (for write operations)

/**
 * GET /api/v2/settings/modules/:moduleKey
 * Get module settings for current business
 */
router.get('/modules/:moduleKey', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const settings = await ModuleSettings.findByBusinessAndModule(
      req.active_business_id,
      moduleKey
    );
    
    res.json({
      module_key: moduleKey,
      settings: settings?.settings || {}
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/modules/:moduleKey] Error:', error);
    res.status(500).json({ error: 'Failed to fetch module settings' });
  }
});

/**
 * PUT /api/v2/settings/modules/:moduleKey
 * Update module settings (requires configure_module permission)
 */
router.put('/modules/:moduleKey', requireModuleConfigurePermission, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }
    
    const updated = await ModuleSettings.update(
      req.active_business_id,
      moduleKey,
      settings
    );
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'module_settings_updated',
      resource_type: 'module_settings',
      resource_id: updated.id,
      metadata: {
        module_key: moduleKey,
        settings_keys: Object.keys(settings)
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      module_key: moduleKey,
      settings: updated.settings
    });
  } catch (error) {
    console.error('[PUT /api/v2/settings/modules/:moduleKey] Error:', error);
    res.status(500).json({ error: 'Failed to update module settings' });
  }
});

/**
 * GET /api/v2/settings/modules
 * Get all module settings for current business
 */
router.get('/modules', async (req, res) => {
  try {
    const allSettings = await ModuleSettings.findByBusinessId(req.active_business_id);
    
    res.json({
      settings: allSettings.map(s => ({
        module_key: s.module_key,
        settings: s.settings
      }))
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/modules] Error:', error);
    res.status(500).json({ error: 'Failed to fetch module settings' });
  }
});

/**
 * GET /api/v2/settings/business
 * Get business profile settings
 */
router.get('/business', async (req, res) => {
  try {
    const business = await Business.findById(req.active_business_id);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    res.json({
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        phone: business.phone,
        address: business.address,
        timezone: business.timezone || 'America/New_York',
        website: business.website,
        public_phone_number: business.public_phone_number,
        legal_name: business.legal_name || business.name,
        display_name: business.display_name || business.name,
        business_hours: business.business_hours || {},
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/business] Error:', error);
    res.status(500).json({ error: 'Failed to fetch business settings' });
  }
});

/**
 * PUT /api/v2/settings/business
 * Update business profile settings
 */
router.put('/business', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      timezone,
      website,
      public_phone_number,
      legal_name,
      display_name,
      business_hours,
    } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (website !== undefined) updateData.website = website;
    if (public_phone_number !== undefined) updateData.public_phone_number = public_phone_number;
    if (legal_name !== undefined) updateData.legal_name = legal_name;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    
    const updated = await Business.update(req.active_business_id, updateData);
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'business_settings_updated',
      resource_type: 'business',
      resource_id: updated.id,
      metadata: {
        fields_updated: Object.keys(updateData)
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      business: updated
    });
  } catch (error) {
    console.error('[PUT /api/v2/settings/business] Error:', error);
    res.status(500).json({ error: 'Failed to update business settings' });
  }
});

/**
 * GET /api/v2/settings/communications
 * Get communications settings (SMS/Email configuration)
 */
router.get('/communications', async (req, res) => {
  try {
    const business = await Business.findById(req.active_business_id);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    res.json({
      communications: {
        sms_enabled: business.sms_enabled || false,
        sms_notification_number: business.sms_notification_number,
        sms_business_hours_enabled: business.sms_business_hours_enabled || false,
        sms_timezone: business.sms_timezone || business.timezone || 'America/New_York',
        sms_allowed_start_time: business.sms_allowed_start_time,
        sms_allowed_end_time: business.sms_allowed_end_time,
        email_ai_answered: business.email_ai_answered !== false,
        email_missed_calls: business.email_missed_calls || false,
        // Provider info (from environment, not stored per business)
        sms_provider: 'telnyx',
        email_provider: 'aws_ses',
        from_phone: business.telnyx_number || business.vapi_phone_number,
        from_email: process.env.AWS_SES_FROM_EMAIL || 'noreply@tavarios.com',
        email_display_name: business.display_name || business.name,
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/communications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch communications settings' });
  }
});

/**
 * PUT /api/v2/settings/communications
 * Update communications settings
 */
router.put('/communications', async (req, res) => {
  try {
    const {
      sms_enabled,
      sms_notification_number,
      sms_business_hours_enabled,
      sms_timezone,
      sms_allowed_start_time,
      sms_allowed_end_time,
      email_ai_answered,
      email_missed_calls,
      email_display_name,
    } = req.body;
    
    const updateData = {};
    if (sms_enabled !== undefined) updateData.sms_enabled = sms_enabled;
    if (sms_notification_number !== undefined) updateData.sms_notification_number = sms_notification_number;
    if (sms_business_hours_enabled !== undefined) updateData.sms_business_hours_enabled = sms_business_hours_enabled;
    if (sms_timezone !== undefined) updateData.sms_timezone = sms_timezone;
    if (sms_allowed_start_time !== undefined) updateData.sms_allowed_start_time = sms_allowed_start_time;
    if (sms_allowed_end_time !== undefined) updateData.sms_allowed_end_time = sms_allowed_end_time;
    if (email_ai_answered !== undefined) updateData.email_ai_answered = email_ai_answered;
    if (email_missed_calls !== undefined) updateData.email_missed_calls = email_missed_calls;
    if (email_display_name !== undefined) updateData.display_name = email_display_name;
    
    const updated = await Business.update(req.active_business_id, updateData);
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'communications_settings_updated',
      resource_type: 'business',
      resource_id: updated.id,
      metadata: {
        fields_updated: Object.keys(updateData)
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      communications: {
        sms_enabled: updated.sms_enabled || false,
        sms_notification_number: updated.sms_notification_number,
        sms_business_hours_enabled: updated.sms_business_hours_enabled || false,
        sms_timezone: updated.sms_timezone || updated.timezone,
        sms_allowed_start_time: updated.sms_allowed_start_time,
        sms_allowed_end_time: updated.sms_allowed_end_time,
        email_ai_answered: updated.email_ai_answered !== false,
        email_missed_calls: updated.email_missed_calls || false,
        email_display_name: updated.display_name || updated.name,
      }
    });
  } catch (error) {
    console.error('[PUT /api/v2/settings/communications] Error:', error);
    res.status(500).json({ error: 'Failed to update communications settings' });
  }
});

/**
 * GET /api/v2/settings/users
 * Get organization users (including owner)
 * All users in organization_users table are returned
 */
router.get('/users', async (req, res) => {
  try {
    const orgUsers = await OrganizationUser.findByBusinessId(req.active_business_id);
    
    // orgUsers already contains joined user data from the query
    const users = orgUsers.map((orgUser) => {
      const user = orgUser.users || {};
      return {
        id: user.id || orgUser.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: orgUser.role,
        created_at: orgUser.created_at,
        organization_user_id: orgUser.id,
      };
    });
    
    res.json({
      users
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/users] Error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/v2/settings/users/:organizationUserId
 * Update user's role in the organization
 * Requires owner or admin role
 */
router.put('/users/:organizationUserId', async (req, res) => {
  try {
    // Check if user has permission (owner or admin)
    const userRole = req.business_membership?.role || req.user.role || 'staff';
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Permission denied',
        message: 'Only owners and admins can manage user roles'
      });
    }

    const { organizationUserId } = req.params;
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    
    // Validate role
    if (!['owner', 'admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, admin, or staff' });
    }
    
    // Get the organization_user entry
    const { supabaseClient } = await import('../../config/database.js');
    const { data: orgUser, error: fetchError } = await supabaseClient
      .from('organization_users')
      .select('*')
      .eq('id', organizationUserId)
      .eq('business_id', req.active_business_id)
      .is('deleted_at', null)
      .single();
    
    if (fetchError || !orgUser) {
      return res.status(404).json({ error: 'Organization user not found' });
    }

    // Prevent changing your own role if you're the only owner
    if (orgUser.user_id === req.user.id && role !== 'owner' && userRole === 'owner') {
      const { data: otherOwners } = await supabaseClient
        .from('organization_users')
        .select('id')
        .eq('business_id', req.active_business_id)
        .eq('role', 'owner')
        .neq('user_id', req.user.id)
        .is('deleted_at', null);
      
      if (!otherOwners || otherOwners.length === 0) {
        return res.status(400).json({ 
          error: 'Cannot change role',
          message: 'You cannot change your own role. There must be at least one owner in the organization.'
        });
      }
    }
    
    // Update role
    const updated = await OrganizationUser.update(organizationUserId, { role });
    
    // Get user details for response
    const user = await User.findById(orgUser.user_id);
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'user_role_updated',
      resource_type: 'organization_user',
      resource_id: organizationUserId,
      metadata: {
        updated_user_id: orgUser.user_id,
        updated_user_email: user?.email,
        old_role: orgUser.role,
        new_role: role,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: role,
        organization_user_id: updated.id,
      },
      message: `User role updated to ${role}`
    });
  } catch (error) {
    console.error('[PUT /api/v2/settings/users/:organizationUserId] Error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/v2/settings/users/:organizationUserId
 * Remove user from organization
 * Requires owner or admin role
 */
router.delete('/users/:organizationUserId', async (req, res) => {
  try {
    // Check if user has permission (owner or admin)
    const userRole = req.business_membership?.role || req.user.role || 'staff';
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Permission denied',
        message: 'Only owners and admins can remove users from an organization'
      });
    }

    const { organizationUserId } = req.params;
    
    // Get the organization_user entry
    const { supabaseClient } = await import('../../config/database.js');
    const { data: orgUser, error: fetchError } = await supabaseClient
      .from('organization_users')
      .select('*')
      .eq('id', organizationUserId)
      .eq('business_id', req.active_business_id)
      .is('deleted_at', null)
      .single();
    
    if (fetchError || !orgUser) {
      return res.status(404).json({ error: 'Organization user not found' });
    }

    // Prevent removing yourself if you're the only owner
    if (orgUser.user_id === req.user.id && orgUser.role === 'owner') {
      const { data: otherOwners } = await supabaseClient
        .from('organization_users')
        .select('id')
        .eq('business_id', req.active_business_id)
        .eq('role', 'owner')
        .neq('user_id', req.user.id)
        .is('deleted_at', null);
      
      if (!otherOwners || otherOwners.length === 0) {
        return res.status(400).json({ 
          error: 'Cannot remove user',
          message: 'You cannot remove yourself. There must be at least one owner in the organization.'
        });
      }
    }
    
    // Soft delete the organization_user entry
    await OrganizationUser.remove(organizationUserId);
    
    // Get user details for audit
    const user = await User.findById(orgUser.user_id);
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'user_removed_from_organization',
      resource_type: 'organization_user',
      resource_id: organizationUserId,
      metadata: {
        removed_user_id: orgUser.user_id,
        removed_user_email: user?.email,
        removed_user_role: orgUser.role,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      message: `User ${user?.email || 'removed'} has been removed from the organization`
    });
  } catch (error) {
    console.error('[DELETE /api/v2/settings/users/:organizationUserId] Error:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

/**
 * POST /api/v2/settings/users
 * Add a user to the organization by email.
 * If no account exists for that email, one is created automatically with a
 * temporary password and an invite email is sent. The admin does NOT need to
 * ask the person to sign up first.
 * Requires owner or admin role.
 */
router.post('/users', async (req, res) => {
  try {
    // Check if user has permission (owner or admin)
    const userRole = req.business_membership?.role || req.user.role || 'staff';
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Permission denied',
        message: 'Only owners and admins can add users to an organization'
      });
    }

    const { email, role = 'staff', first_name = '', last_name = '' } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Validate role
    if (!['owner', 'admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, admin, or staff' });
    }

    // Get the current business for the invite email
    const business = await Business.findById(req.active_business_id);

    // Look up the user — or create one if they haven't signed up yet
    let targetUser = await User.findByEmail(email);
    let wasInvited = false;
    let tempPassword = null;

    if (!targetUser) {
      // Generate a random temporary password (12 chars: letters + digits)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

      const { hashPassword } = await import('../../utils/auth.js');
      const password_hash = await hashPassword(tempPassword);

      // Create the user account linked to this business
      targetUser = await User.create({
        business_id: req.active_business_id,
        email: email.toLowerCase().trim(),
        password_hash,
        first_name: first_name.trim() || null,
        last_name: last_name.trim() || null,
        role: role === 'owner' ? 'admin' : role, // invited users can't be owner at creation
        terms_accepted_at: null,
        privacy_accepted_at: null,
      });

      wasInvited = true;

      // Send invite email (non-fatal if it fails)
      try {
        const { sendEmail } = await import('../../services/notifications.js');
        const loginUrl = `${process.env.FRONTEND_URL || 'https://tavarios.com'}/login`;
        const subject = `You've been added to ${business?.name || 'an organization'} on Tavari`;
        const bodyText = [
          `Hi${first_name ? ' ' + first_name : ''},`,
          ``,
          `${req.user.first_name || req.user.email} has added you to ${business?.name || 'their organization'} on Tavari as ${role}.`,
          ``,
          `Your login details:`,
          `  Email:    ${email}`,
          `  Password: ${tempPassword}`,
          ``,
          `Please log in and change your password as soon as possible:`,
          loginUrl,
          ``,
          `— The Tavari Team`,
        ].join('\n');
        const bodyHtml = `
          <p>Hi${first_name ? ' ' + first_name : ''},</p>
          <p><strong>${req.user.first_name || req.user.email}</strong> has added you to <strong>${business?.name || 'their organization'}</strong> on Tavari as <strong>${role}</strong>.</p>
          <p><strong>Your login details:</strong><br>
          Email: <code>${email}</code><br>
          Temporary password: <code>${tempPassword}</code></p>
          <p><a href="${loginUrl}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;">Log in to Tavari</a></p>
          <p style="color:#666;font-size:12px;">Please change your password after logging in.</p>
        `;
        await sendEmail(email, subject, bodyText, bodyHtml);
        console.log(`[POST /api/v2/settings/users] Invite email sent to ${email}`);
      } catch (emailErr) {
        console.warn(`[POST /api/v2/settings/users] Could not send invite email:`, emailErr.message);
      }
    }
    
    // Check if user is already in this organization
    const existingMembership = await OrganizationUser.findByUserAndBusiness(
      targetUser.id,
      req.active_business_id
    );
    
    if (existingMembership) {
      return res.status(400).json({ 
        error: 'User already belongs to this organization',
        user: {
          id: targetUser.id,
          email: targetUser.email,
          role: existingMembership.role
        }
      });
    }
    
    // Add user to organization
    const orgUser = await OrganizationUser.create({
      business_id: req.active_business_id,
      user_id: targetUser.id,
      role: role,
    });
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: wasInvited ? 'user_invited_to_organization' : 'user_added_to_organization',
      resource_type: 'organization_user',
      resource_id: orgUser.id,
      metadata: {
        added_user_id: targetUser.id,
        added_user_email: targetUser.email,
        role,
        was_invited: wasInvited,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      was_invited: wasInvited,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        role,
        organization_user_id: orgUser.id,
      },
      // Only returned when a new account was created so the admin can share it if email fails
      temp_password: wasInvited ? tempPassword : undefined,
      message: wasInvited
        ? `Account created and invite email sent to ${targetUser.email}. They can log in with their temporary password.`
        : `${targetUser.email} has been added to the organization as ${role}.`,
    });
  } catch (error) {
    console.error('[POST /api/v2/settings/users] Error:', error);
    res.status(500).json({ error: 'Failed to add user to organization' });
  }
});

/**
 * GET /api/v2/settings/billing
 * Get billing and subscription information
 */
router.get('/billing', async (req, res) => {
  try {
    const business = await Business.findById(req.active_business_id);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Import Subscription model dynamically to avoid circular dependencies
    const { Subscription } = await import('../../models/v2/Subscription.js');
    const subscriptions = await Subscription.findByBusinessId(req.active_business_id);
    
    res.json({
      billing: {
        stripe_customer_id: business.stripe_customer_id,
        stripe_subscription_id: business.stripe_subscription_id,
        plan_tier: business.plan_tier || 'starter',
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          module_key: sub.module_key,
          status: sub.status,
          plan: sub.plan,
          usage_limit: sub.usage_limit,
          current_usage: sub.current_usage || 0,
        }))
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/billing] Error:', error);
    res.status(500).json({ error: 'Failed to fetch billing information' });
  }
});

/**
 * GET /api/v2/settings/permissions
 * Get all permissions and role permissions (owners/admins only)
 */
router.get('/permissions', async (req, res) => {
  try {
    // Verify user is owner or admin
    const membership = req.business_membership;
    let userRole = membership?.role;
    if (!userRole && req.user.role) {
      userRole = req.user.role;
    }
    
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Only owners and admins can view permissions' });
    }
    
    // Get all permissions
    const { data: permissions, error: permsError } = await supabaseClient
      .from('permissions')
      .select('*')
      .order('key');
    
    if (permsError) throw permsError;
    
    // Get role permissions for each role
    const roles = ['owner', 'admin', 'staff'];
    const rolePermissions = {};
    
    for (const role of roles) {
      const rolePerms = await RolePermission.findByRole(role);
      rolePermissions[role] = rolePerms.map(rp => rp.permission_key);
    }
    
    res.json({
      permissions: permissions || [],
      role_permissions: rolePermissions
    });
  } catch (error) {
    console.error('[GET /api/v2/settings/permissions] Error:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * PUT /api/v2/settings/permissions
 * Update role permissions (owners only)
 * Note: Legal acceptance not required for settings management
 */
router.put('/permissions', async (req, res) => {
  try {
    // Verify user is owner
    const membership = req.business_membership;
    let userRole = membership?.role;
    if (!userRole && req.user.role) {
      userRole = req.user.role;
    }
    
    if (userRole !== 'owner') {
      return res.status(403).json({ error: 'Only owners can modify permissions' });
    }
    
    const { role, permission_key, enabled } = req.body;
    
    if (!role || !permission_key || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'role, permission_key, and enabled are required' });
    }
    
    if (!['owner', 'admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Verify permission exists
    const { data: permission, error: permError } = await supabaseClient
      .from('permissions')
      .select('*')
      .eq('key', permission_key)
      .single();
    
    if (permError || !permission) {
      return res.status(400).json({ error: 'Permission not found' });
    }
    
    // Add or remove permission
    if (enabled) {
      // Check if it already exists
      const exists = await RolePermission.hasPermission(role, permission_key);
      if (!exists) {
        await RolePermission.create({ role, permission_key });
      }
    } else {
      // Prevent removing all permissions from owner (safety check)
      if (role === 'owner') {
        const ownerPerms = await RolePermission.findByRole('owner');
        if (ownerPerms.length <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last permission from owner role' });
        }
      }
      await RolePermission.remove(role, permission_key);
    }
    
    // Log audit
    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'role_permission_updated',
      resource_type: 'role_permission',
      resource_id: `${role}-${permission_key}`,
      metadata: {
        role,
        permission_key,
        enabled,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    // Get updated role permissions
    const rolePerms = await RolePermission.findByRole(role);
    
    res.json({
      success: true,
      role,
      permission_key,
      enabled,
      role_permissions: rolePerms.map(rp => rp.permission_key)
    });
  } catch (error) {
    console.error('[PUT /api/v2/settings/permissions] Error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

/**
 * GET /api/v2/settings/profile
 * Return the current user's profile (name, email)
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      profile: {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      }
    });
  } catch (err) {
    console.error('[GET /api/v2/settings/profile]', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

/**
 * PUT /api/v2/settings/profile
 * Update first/last name for the current user
 */
router.put('/profile', async (req, res) => {
  try {
    const { first_name, last_name } = req.body;
    const updated = await User.update(req.user.id, {
      first_name: first_name?.trim() ?? null,
      last_name: last_name?.trim() ?? null,
    });
    res.json({ success: true, profile: { id: updated.id, email: updated.email, first_name: updated.first_name, last_name: updated.last_name } });
  } catch (err) {
    console.error('[PUT /api/v2/settings/profile]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PUT /api/v2/settings/profile/password
 * Change the current user's password (requires current password)
 */
router.put('/profile/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { comparePassword, hashPassword } = await import('../../utils/auth.js');
    const valid = await comparePassword(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const password_hash = await hashPassword(new_password);
    await User.update(req.user.id, { password_hash });

    await AuditLog.create({
      business_id: req.active_business_id,
      user_id: req.user.id,
      action: 'password_changed',
      resource_type: 'user',
      resource_id: req.user.id,
      metadata: {},
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    }).catch(() => {});

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[PUT /api/v2/settings/profile/password]', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

export default router;
