import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';
import { OrganizationJoinRequest } from '../../models/v2/OrganizationJoinRequest.js';
import { Business } from '../../models/Business.js';
import { AuditLog } from '../../models/v2/AuditLog.js';

const router = express.Router();

/**
 * GET /api/v2/organizations
 * Get all organizations the user belongs to
 * Includes legacy users.business_id if no organization_users entries exist
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const organizations = await OrganizationUser.findByUserId(req.user.id);
    
    // If no organizations found via organization_users, check legacy users.business_id
    if (organizations.length === 0 && req.user.business_id) {
      const business = await Business.findById(req.user.business_id);
      if (business) {
        // Return legacy business as organization
        return res.json({
          organizations: [{
            id: business.id,
            name: business.name,
            role: req.user.role || 'owner',
            created_at: req.user.created_at,
            legacy: true
          }]
        });
      }
    }
    
    res.json({
      organizations: organizations.map(org => ({
        id: org.business_id,
        name: org.businesses?.name,
        role: org.role,
        created_at: org.created_at
      }))
    });
  } catch (error) {
    console.error('[GET /api/v2/organizations] Error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

/**
 * POST /api/v2/organizations
 * Create a new organization and add user as owner
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phone, address, timezone } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }
    
    // Create new business/organization
    const business = await Business.create({
      name,
      email: email || req.user.email,
      phone: phone || null,
      address: address || null,
      timezone: timezone || 'America/New_York',
    });
    
    // Add user as owner of the new organization
    const orgUser = await OrganizationUser.create({
      business_id: business.id,
      user_id: req.user.id,
      role: 'owner',
    });
    
    // Log audit
    await AuditLog.create({
      business_id: business.id,
      user_id: req.user.id,
      action: 'organization_created',
      resource_type: 'business',
      resource_id: business.id,
      metadata: { organization_name: name },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      organization: {
        id: business.id,
        name: business.name,
        role: 'owner',
        created_at: orgUser.created_at
      }
    });
  } catch (error) {
    console.error('[POST /api/v2/organizations] Error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * POST /api/v2/organizations/select
 * Select active organization (stores in session)
 */
router.post('/select', authenticate, async (req, res) => {
  try {
    const { business_id } = req.body;
    
    if (!business_id) {
      return res.status(400).json({ error: 'business_id is required' });
    }
    
    // Verify user belongs to this organization
    const membership = await OrganizationUser.findByUserAndBusiness(
      req.user.id,
      business_id
    );
    
    // Legacy fallback: check users.business_id
    if (!membership && req.user.business_id === business_id) {
      console.warn(`[POST /api/v2/organizations/select] Legacy access for user ${req.user.id}`);
    } else if (!membership) {
      return res.status(403).json({ error: 'Access denied to this organization' });
    }
    
    // Verify business exists
    const business = await Business.findById(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Store in session
    if (req.session) {
      req.session.active_organization_id = business_id;
    }
    
    // Log audit
    await AuditLog.create({
      business_id,
      user_id: req.user.id,
      action: 'organization_selected',
      metadata: { business_id },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      organization: {
        id: business.id,
        name: business.name
      }
    });
  } catch (error) {
    console.error('[POST /api/v2/organizations/select] Error:', error);
    res.status(500).json({ error: 'Failed to select organization' });
  }
});

/**
 * GET /api/v2/organizations/search
 * Search for organizations to join (by name or email)
 * Returns organizations the user doesn't already belong to
 */
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const searchTerm = q.trim().toLowerCase();
    
    // Get all organizations the user already belongs to
    const userOrgs = await OrganizationUser.findByUserId(req.user.id);
    const userBusinessIds = userOrgs.map(org => org.business_id);
    
    // Also include legacy business_id if exists
    if (req.user.business_id) {
      userBusinessIds.push(req.user.business_id);
    }
    
    // Search businesses by name or email (excluding ones user already belongs to)
    const { supabaseClient } = await import('../../config/database.js');
    let query = supabaseClient
      .from('businesses')
      .select('id, name, email, created_at')
      .is('deleted_at', null)
      .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(10);
    
    if (userBusinessIds.length > 0) {
      query = query.not('id', 'in', `(${userBusinessIds.join(',')})`);
    }
    
    const { data: businesses, error } = await query;
    
    if (error) throw error;
    
    res.json({
      organizations: (businesses || []).map(b => ({
        id: b.id,
        name: b.name,
        email: b.email,
        created_at: b.created_at
      }))
    });
  } catch (error) {
    console.error('[GET /api/v2/organizations/search] Error:', error);
    res.status(500).json({ error: 'Failed to search organizations' });
  }
});

/**
 * POST /api/v2/organizations/join
 * Request to join an existing organization (requires approval)
 * Exception: If organization email matches user email, auto-approve as owner
 */
router.post('/join', authenticate, async (req, res) => {
  try {
    const { business_id, role = 'staff', message } = req.body;
    
    if (!business_id) {
      return res.status(400).json({ error: 'business_id is required' });
    }
    
    // Validate role
    if (!['owner', 'admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, admin, or staff' });
    }
    
    // Check if business exists
    const business = await Business.findById(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Check if user already belongs to this organization
    const existingMembership = await OrganizationUser.findByUserAndBusiness(
      req.user.id,
      business_id
    );
    
    if (existingMembership) {
      return res.status(400).json({ 
        error: 'Already a member',
        message: 'You are already a member of this organization',
        organization: {
          id: business.id,
          name: business.name,
          role: existingMembership.role
        }
      });
    }
    
    // Check for existing pending request
    const existingRequest = await OrganizationJoinRequest.findByUserAndBusiness(
      req.user.id,
      business_id,
      'pending'
    );
    
    if (existingRequest) {
      return res.status(400).json({ 
        error: 'Request already pending',
        message: 'You already have a pending request to join this organization'
      });
    }
    
    // Special case: If organization email matches user email, auto-approve as owner
    if (business.email && business.email.toLowerCase() === req.user.email.toLowerCase()) {
      // Auto-approve and join immediately
      const orgUser = await OrganizationUser.create({
        business_id: business.id,
        user_id: req.user.id,
        role: 'owner',
      });
      
      // Log audit
      await AuditLog.create({
        business_id: business.id,
        user_id: req.user.id,
        action: 'organization_joined',
        resource_type: 'organization_user',
        resource_id: orgUser.id,
        metadata: {
          organization_name: business.name,
          role: 'owner',
          join_method: 'email_match_auto_approve'
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      }).catch(err => console.error('Failed to log audit:', err));
      
      return res.json({
        success: true,
        auto_approved: true,
        message: `You have been automatically added to ${business.name} as owner`,
        organization: {
          id: business.id,
          name: business.name,
          role: 'owner',
          created_at: orgUser.created_at
        }
      });
    }
    
    // Create join request (requires approval)
    const joinRequest = await OrganizationJoinRequest.create({
      business_id: business.id,
      user_id: req.user.id,
      requested_role: role,
      message: message || null,
    });
    
    // Log audit
    await AuditLog.create({
      business_id: business.id,
      user_id: req.user.id,
      action: 'organization_join_requested',
      resource_type: 'organization_join_request',
      resource_id: joinRequest.id,
      metadata: {
        organization_name: business.name,
        requested_role: role,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      message: `Join request sent to ${business.name}. An owner or admin will review your request.`,
      request: {
        id: joinRequest.id,
        status: 'pending',
        requested_role: role
      }
    });
  } catch (error) {
    console.error('[POST /api/v2/organizations/join] Error:', error);
    res.status(500).json({ error: 'Failed to request to join organization' });
  }
});

/**
 * GET /api/v2/organizations/join-requests
 * Get join requests for the current organization (owners/admins only)
 */
router.get('/join-requests', authenticate, requireBusinessContext, async (req, res) => {
  try {
    if (!req.active_business_id) {
      return res.status(400).json({ error: 'Active business context required' });
    }

    // Verify user is owner or admin of this organization
    const membership = req.business_membership;
    
    // For legacy users without organization_users entry, check users.role
    let userRole = membership?.role;
    if (!userRole && req.user.role) {
      userRole = req.user.role;
    }
    
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Only owners and admins can view join requests' });
    }
    
    const pendingRequests = await OrganizationJoinRequest.findByBusinessId(
      req.active_business_id,
      'pending'
    );
    
    res.json({
      requests: (pendingRequests || []).map(req => ({
        id: req.id,
        user: {
          id: req.users?.id,
          email: req.users?.email,
          first_name: req.users?.first_name,
          last_name: req.users?.last_name,
        },
        requested_role: req.requested_role,
        message: req.message,
        created_at: req.created_at,
      }))
    });
  } catch (error) {
    console.error('[GET /api/v2/organizations/join-requests] Error:', error);
    console.error('[GET /api/v2/organizations/join-requests] Error details:', {
      message: error.message,
      stack: error.stack,
      active_business_id: req.active_business_id,
    });
    res.status(500).json({ 
      error: 'Failed to fetch join requests',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/v2/organizations/join-requests/:requestId/approve
 * Approve a join request (owners/admins only)
 */
router.post('/join-requests/:requestId/approve', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { role } = req.body; // Optional: can override requested role
    
    // Get the request
    const joinRequest = await OrganizationJoinRequest.findById(requestId);
    if (!joinRequest || joinRequest.status !== 'pending') {
      return res.status(404).json({ error: 'Join request not found or not pending' });
    }
    
    // Verify user is owner or admin of this organization
    const membership = await OrganizationUser.findByUserAndBusiness(
      req.user.id,
      joinRequest.business_id
    );
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Only owners and admins can approve join requests' });
    }
    
    // Use provided role or requested role (but don't allow non-owners to assign owner role)
    let assignedRole = role || joinRequest.requested_role;
    if (assignedRole === 'owner' && membership.role !== 'owner') {
      assignedRole = 'admin'; // Admins can't assign owner role
    }
    
    // Update request status
    await OrganizationJoinRequest.updateStatus(requestId, 'approved', req.user.id);
    
    // Create organization_user entry
    const orgUser = await OrganizationUser.create({
      business_id: joinRequest.business_id,
      user_id: joinRequest.user_id,
      role: assignedRole,
    });
    
    // Get business name for audit
    const business = await Business.findById(joinRequest.business_id);
    
    // Log audit
    await AuditLog.create({
      business_id: joinRequest.business_id,
      user_id: req.user.id,
      action: 'organization_join_approved',
      resource_type: 'organization_user',
      resource_id: orgUser.id,
      metadata: {
        approved_user_id: joinRequest.user_id,
        approved_user_email: joinRequest.users?.email,
        requested_role: joinRequest.requested_role,
        assigned_role: assignedRole,
        organization_name: business?.name,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      message: `Join request approved. User added as ${assignedRole}.`,
      organization_user: {
        id: orgUser.id,
        user_id: joinRequest.user_id,
        role: assignedRole,
      }
    });
  } catch (error) {
    console.error('[POST /api/v2/organizations/join-requests/:requestId/approve] Error:', error);
    res.status(500).json({ error: 'Failed to approve join request' });
  }
});

/**
 * POST /api/v2/organizations/join-requests/:requestId/reject
 * Reject a join request (owners/admins only)
 */
router.post('/join-requests/:requestId/reject', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Get the request
    const joinRequest = await OrganizationJoinRequest.findById(requestId);
    if (!joinRequest || joinRequest.status !== 'pending') {
      return res.status(404).json({ error: 'Join request not found or not pending' });
    }
    
    // Verify user is owner or admin of this organization
    const membership = await OrganizationUser.findByUserAndBusiness(
      req.user.id,
      joinRequest.business_id
    );
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Only owners and admins can reject join requests' });
    }
    
    // Update request status
    await OrganizationJoinRequest.updateStatus(requestId, 'rejected', req.user.id);
    
    // Get business name for audit
    const business = await Business.findById(joinRequest.business_id);
    
    // Log audit
    await AuditLog.create({
      business_id: joinRequest.business_id,
      user_id: req.user.id,
      action: 'organization_join_rejected',
      resource_type: 'organization_join_request',
      resource_id: requestId,
      metadata: {
        rejected_user_id: joinRequest.user_id,
        rejected_user_email: joinRequest.users?.email,
        requested_role: joinRequest.requested_role,
        organization_name: business?.name,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log audit:', err));
    
    res.json({
      success: true,
      message: 'Join request rejected'
    });
  } catch (error) {
    console.error('[POST /api/v2/organizations/join-requests/:requestId/reject] Error:', error);
    res.status(500).json({ error: 'Failed to reject join request' });
  }
});

/**
 * GET /api/v2/organizations/current
 * Get currently selected organization
 */
router.get('/current', authenticate, async (req, res) => {
  try {
    const activeBusinessId = 
      req.headers['x-active-business-id'] ||
      req.session?.active_organization_id;
    
    if (!activeBusinessId) {
      // Auto-select if user has only one organization
      const organizations = await OrganizationUser.findByUserId(req.user.id);
      
      if (organizations.length === 1) {
        const business = await Business.findById(organizations[0].business_id);
        return res.json({
          organization: {
            id: business.id,
            name: business.name,
            role: organizations[0].role
          },
          auto_selected: true
        });
      }
      
      // Legacy: use users.business_id if no organizations
      if (organizations.length === 0 && req.user.business_id) {
        const business = await Business.findById(req.user.business_id);
        if (business) {
          return res.json({
            organization: {
              id: business.id,
              name: business.name,
              role: req.user.role || 'owner'
            },
            auto_selected: true,
            legacy: true
          });
        }
      }
      
      return res.json({ organization: null });
    }
    
    const business = await Business.findById(activeBusinessId);
    if (!business) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    const membership = await OrganizationUser.findByUserAndBusiness(
      req.user.id,
      activeBusinessId
    );
    
    // Legacy fallback: if no membership found but user has this business_id, allow access
    if (!membership && req.user.business_id === activeBusinessId) {
      return res.json({
        organization: {
          id: business.id,
          name: business.name,
          role: req.user.role || 'owner'
        },
        legacy: true
      });
    }
    
    res.json({
      organization: {
        id: business.id,
        name: business.name,
        role: membership?.role || req.user.role || 'staff'
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/organizations/current] Error:', error);
    res.status(500).json({ error: 'Failed to get current organization' });
  }
});

export default router;
