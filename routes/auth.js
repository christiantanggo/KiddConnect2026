import express from 'express';
import { Business } from '../models/Business.js';
import { User } from '../models/User.js';
import { AIAgent } from '../models/AIAgent.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import { supabaseClient } from '../config/database.js';

const router = express.Router();

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      phone, 
      public_phone_number,
      address, 
      first_name, 
      last_name,
      timezone,
      business_hours,
      contact_email,
      terms_accepted
    } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and business name are required' });
    }
    
    // Require terms acceptance
    if (!terms_accepted) {
      return res.status(400).json({ 
        error: 'You must agree to the Terms of Service and Privacy Policy to create an account',
        code: 'TERMS_NOT_ACCEPTED'
      });
    }
    
    // Validate and format phone number to E.164
    let formattedPhone = public_phone_number || phone;
    if (formattedPhone) {
      const { formatPhoneNumberE164, validatePhoneNumber } = await import('../utils/phoneFormatter.js');
      const e164 = formatPhoneNumberE164(formattedPhone);
      if (!e164 || !validatePhoneNumber(e164)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format. Please include country code (e.g., +1 for US/Canada)' 
        });
      }
      formattedPhone = e164;
    }
    
    // Check if business email already exists
    const existingBusiness = await Business.findByEmail(email);
    let business;
    
    if (existingBusiness) {
      // Check if there's already a user for this business
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        // Account fully exists - redirect to login
        return res.status(400).json({ 
          error: 'An account with this email already exists. Please log in instead.',
          code: 'ACCOUNT_EXISTS'
        });
      }
      // Business exists but no user - incomplete signup, allow completion
      console.log(`[Signup] Found incomplete signup for ${email}, completing signup...`);
      // Update existing business with new data
      business = await Business.update(existingBusiness.id, {
        name,
        email: contact_email || email,
        phone: formattedPhone,
        address: address || '',
        timezone: timezone || 'America/New_York',
        public_phone_number: formattedPhone,
      });
      business = await Business.findById(existingBusiness.id);
    } else {
      // Create new business
      business = await Business.create({
        name,
        email: contact_email || email,
        phone: formattedPhone,
        address: address || '',
        timezone: timezone || 'America/New_York',
        public_phone_number: formattedPhone,
      });
    }
    
    // Mark demo email as signed up if this email was used for a demo
    try {
      const { data: demoEmail } = await supabaseClient
        .from('demo_emails')
        .select('id')
        .eq('email', email)
        .eq('signed_up', false)
        .single();
      
      if (demoEmail) {
        await supabaseClient
          .from('demo_emails')
          .update({
            signed_up: true,
            signed_up_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', demoEmail.id);
        console.log(`[Signup] ✅ Marked demo email as signed up: ${email}`);
      }
    } catch (demoError) {
      // Non-critical - just log it
      console.log(`[Signup] Note: Could not check demo emails table (may not exist yet):`, demoError.message);
    }
    
    // Hash password
    const password_hash = await hashPassword(password);
    
    // Get client IP address for terms acceptance tracking
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    // Extract first IP if x-forwarded-for contains multiple
    const termsAcceptedIp = typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : 'unknown';
    
    // Current terms version (update this when Terms are updated)
    const termsVersion = '2025-12-27';
    const now = new Date().toISOString();
    
    // Create user with terms acceptance
    const user = await User.create({
      business_id: business.id,
      email,
      password_hash,
      first_name,
      last_name,
      role: 'owner',
      terms_accepted_at: now,
      privacy_accepted_at: now, // Privacy policy accepted at same time
      terms_version: termsVersion,
      terms_accepted_ip: termsAcceptedIp,
    });
    
    // Create default AI agent
    const agent = await AIAgent.create({
      business_id: business.id,
      greeting_text: `Hello! Thank you for calling ${name}. How can I help you today?`,
      business_hours: {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      faqs: [],
      message_settings: {
        ask_name: true,
        ask_phone: true,
        ask_email: false,
        ask_reason: true,
      },
      system_instructions: `You are a helpful AI assistant for ${name}. Answer questions politely and take messages when needed.`,
    });

    // Automatically assign an unassigned phone number during signup
    let assignedPhoneNumber = null;
    try {
      // Pre-flight check
      const { canAssignPhoneNumber } = await import('../utils/phonePreflight.js');
      const preflightCheck = await canAssignPhoneNumber();
      
      if (!preflightCheck.canAssign) {
        console.warn('[Signup] ⚠️  Phone assignment pre-flight check failed:', preflightCheck.reason);
        console.warn('[Signup] Details:', preflightCheck.details);
        console.warn('[Signup] Skipping automatic phone assignment. User can assign manually later.');
        // Continue with signup - don't fail
      } else {
        const { 
          findUnassignedTelnyxNumbers, 
          checkIfNumberProvisionedInVAPI,
          createAssistant, 
          provisionPhoneNumber, 
          linkAssistantToNumber,
          searchAvailablePhoneNumbers,
          purchaseTelnyxNumber
        } = await import('../services/vapi.js');
        
        const { acquirePhoneLock, releasePhoneLock } = await import('../utils/phoneLock.js');
        
        console.log('[Signup] Attempting to automatically assign phone number...');
      
      // Extract area code from business phone if available
      let preferredAreaCode = null;
      if (formattedPhone) {
        const { extractAreaCode } = await import('../utils/phoneFormatter.js');
        preferredAreaCode = extractAreaCode(formattedPhone);
        if (preferredAreaCode) {
          console.log(`[Signup] Preferred area code: ${preferredAreaCode}`);
        }
      }
      
      // Step 1: Check for unassigned numbers already purchased in Telnyx
      const unassignedNumbers = await findUnassignedTelnyxNumbers(preferredAreaCode);
      let selectedNumber = null;
      let phoneNumber = null;
      let phoneNumberId = null;
      
      if (unassignedNumbers.length > 0) {
        // Try to acquire lock for the first available number
        let lockedNumber = null;
        for (const num of unassignedNumbers) {
          const candidateNumber = num.phoneNumber || num.phone_number || num.number;
          let candidateE164 = candidateNumber;
          if (!candidateE164.startsWith('+')) {
            candidateE164 = '+' + candidateE164.replace(/[^0-9]/g, '');
          }
          
          const lockAcquired = await acquirePhoneLock(candidateE164, 60000); // 60 second lock
          if (lockAcquired) {
            lockedNumber = candidateE164;
            selectedNumber = num;
            phoneNumber = candidateE164;
            console.log(`[Signup] ✅ Acquired lock for phone number ${candidateE164}`);
            break;
          } else {
            console.log(`[Signup] Phone number ${candidateE164} is locked, trying next...`);
          }
        }
        
        if (!lockedNumber) {
          console.warn('[Signup] ⚠️  All available numbers are currently locked, will purchase new number instead');
          // Fall through to purchase new number
        } else {
          // Check if this number is already provisioned in VAPI
          const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
          if (existingVapiNumber) {
            // Number is already in VAPI, just get its ID
            phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
            console.log(`[Signup] Number ${phoneNumber} is already provisioned in VAPI (ID: ${phoneNumberId}), will reuse it`);
          } else {
            // Number exists in Telnyx but not in VAPI, need to provision it
            console.log(`[Signup] Number ${phoneNumber} exists in Telnyx but not in VAPI, provisioning to VAPI...`);
            try {
              const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
              phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
              
              if (!phoneNumberId) {
                console.error(`[Signup] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
                console.error(`[Signup] Provisioned number response:`, JSON.stringify(provisionedNumber, null, 2));
                // Try to get it from VAPI directly
                const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumber);
                if (vapiCheck) {
                  phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
                  console.log(`[Signup] Retrieved phoneNumberId from VAPI check: ${phoneNumberId}`);
                }
              }
            } catch (provisionError) {
              // Release lock on error
              releasePhoneLock(phoneNumber);
              throw provisionError;
            }
          }
        }
      }
      
      // If we don't have a phone number yet (either no unassigned numbers or all were locked), purchase new
      if (!phoneNumber) {
      } else {
        // Step 2: No unassigned numbers, purchase a new one matching area code
        console.log('[Signup] No unassigned numbers found, purchasing new number...');
        
        // Only purchase toll-free numbers (first number is included in subscription)
        if (preferredAreaCode) {
          console.log(`[Signup] Searching for available toll-free numbers with area code ${preferredAreaCode}...`);
          const availableNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, preferredAreaCode);
          
          if (availableNumbers.length > 0) {
            phoneNumber = availableNumbers[0].phone_number;
            console.log(`[Signup] Found available toll-free number with area code ${preferredAreaCode}: ${phoneNumber}`);
          } else {
            // Try without area code
            console.log(`[Signup] No toll-free numbers found with area code ${preferredAreaCode}, trying any area code...`);
            const fallbackNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, null);
            if (fallbackNumbers.length > 0) {
              phoneNumber = fallbackNumbers[0].phone_number;
              console.log(`[Signup] Found available toll-free number: ${phoneNumber}`);
            } else {
              throw new Error('No available toll-free phone numbers found. Please try again or contact support.');
            }
          }
        } else {
          // No preferred area code, get any available toll-free number
          const availableNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, null);
          if (availableNumbers.length > 0) {
            phoneNumber = availableNumbers[0].phone_number;
            console.log(`[Signup] Found available toll-free number: ${phoneNumber}`);
          } else {
            throw new Error('No available toll-free phone numbers found. Please try again or contact support.');
          }
        }
        
        // Ensure phone number is in E.164 format
        let phoneNumberE164 = phoneNumber;
        if (!phoneNumberE164.startsWith('+')) {
          phoneNumberE164 = '+' + phoneNumberE164.replace(/[^0-9]/g, '');
        }
        phoneNumber = phoneNumberE164;
        
        // Acquire lock before purchasing
        const lockAcquired = await acquirePhoneLock(phoneNumber, 60000);
        if (!lockAcquired) {
          throw new Error(`Phone number ${phoneNumber} is currently being assigned to another account. Please try again.`);
        }
        
        try {
          // Purchase the number from Telnyx
          console.log(`[Signup] Purchasing number ${phoneNumber} from Telnyx...`);
          await purchaseTelnyxNumber(phoneNumber, business.id);
          console.log(`[Signup] ✅ Number purchased from Telnyx`);
          
          // Provision to VAPI
          console.log(`[Signup] Provisioning number ${phoneNumber} to VAPI...`);
          const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
          phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
          
          if (!phoneNumberId) {
            console.error(`[Signup] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
            const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumber);
            if (vapiCheck) {
              phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
            }
          }
        } catch (purchaseError) {
          // Release lock on error
          releasePhoneLock(phoneNumber);
          throw purchaseError;
        }
      }
      
      // Release lock after successful assignment (will be done in finally block)
      
      // Step 3: Create VAPI assistant
      console.log(`[Signup] Creating VAPI assistant for business...`);
      const assistant = await createAssistant({
        name: business.name,
        public_phone_number: formattedPhone || '',
        timezone: business.timezone,
        business_hours: agent.business_hours || {},
        faqs: agent.faqs || [],
        contact_email: business.email,
        address: business.address || '',
        allow_call_transfer: business.allow_call_transfer ?? true,
        opening_greeting: agent.greeting_text,
        voice_settings: agent.voice_settings || {},
        ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
        businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
      });
      
      if (!assistant || !assistant.id) {
        throw new Error('Failed to create VAPI assistant - no assistant ID returned');
      }
      
      // Step 4: Link assistant to phone number
      if (!phoneNumberId) {
        console.warn(`[Signup] ⚠️  Warning: phoneNumberId is missing, cannot link assistant to phone number`);
        console.warn(`[Signup] Phone number: ${phoneNumber}, Assistant ID: ${assistant.id}`);
        // Try to extract phoneNumberId from the phone number if we have it
        if (phoneNumber) {
          // Try to find the phone number in VAPI by the actual number
          const vapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
          if (vapiNumber) {
            phoneNumberId = vapiNumber.id || vapiNumber.phoneNumberId;
            console.log(`[Signup] Found phoneNumberId from VAPI lookup: ${phoneNumberId}`);
          }
        }
      }
      
      if (phoneNumberId && assistant.id) {
        console.log(`[Signup] Linking assistant ${assistant.id} to phone number ${phoneNumberId}...`);
        try {
          await linkAssistantToNumber(assistant.id, phoneNumberId);
          console.log(`[Signup] ✅ Successfully linked assistant to phone number`);
        } catch (linkError) {
          console.error(`[Signup] ⚠️  Failed to link assistant to phone number:`, linkError.message);
          // Continue anyway - number might still work
        }
      } else {
        console.warn(`[Signup] ⚠️  Cannot link assistant - missing phoneNumberId (${phoneNumberId}) or assistant.id (${assistant.id})`);
      }
      
      // Step 5: Update business with phone number and assistant ID
      // Ensure phone number is in E.164 format
      const phoneNumberE164 = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/[^0-9]/g, '')}`;
      
      if (!phoneNumberE164 || phoneNumberE164 === '+') {
        throw new Error(`Invalid phone number format: ${phoneNumber}`);
      }
      
      try {
        await Business.update(business.id, {
          vapi_phone_number: phoneNumberE164,
          vapi_assistant_id: assistant.id,
        });
        assignedPhoneNumber = phoneNumberE164;
        console.log(`[Signup] ✅ Phone number ${phoneNumberE164} automatically assigned to business ${business.id}`);
        
        // Release lock after successful assignment
        if (phoneNumber) {
          releasePhoneLock(phoneNumber);
        }
      } catch (dbError) {
        console.error(`[Signup] ⚠️  Failed to update business with phone number:`, dbError.message);
        console.error(`[Signup] Database error details:`, dbError);
        // Still set assignedPhoneNumber so it's returned in response
        assignedPhoneNumber = phoneNumberE164;
        // Release lock even on database error
        if (phoneNumber) {
          releasePhoneLock(phoneNumber);
        }
      }
      } // End of preflight check else block
    } catch (phoneError) {
      // Don't fail signup if phone assignment fails - user can assign manually later
      console.error('[Signup] ⚠️  Error automatically assigning phone number (non-blocking):', phoneError.message);
      console.error('[Signup] Business can assign phone number manually via the setup wizard.');
      // Release lock if we had one (phoneNumber might be undefined if error occurred early)
      if (typeof phoneNumber !== 'undefined' && phoneNumber) {
        try {
          releasePhoneLock(phoneNumber);
        } catch (lockError) {
          console.warn('[Signup] Could not release phone lock:', lockError.message);
        }
      }
    }
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      businessId: business.id,
      email: user.email,
    });
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        onboarding_complete: business.onboarding_complete,
        vapi_phone_number: assignedPhoneNumber, // Automatically assigned if available
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    console.log('[Auth Login] ========== LOGIN ATTEMPT START ==========');
    console.log('[Auth Login] Email:', req.body.email);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log('[Auth Login] ❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    console.log('[Auth Login] Looking up user...');
    const user = await User.findByEmail(email);
    
    if (!user) {
      console.log('[Auth Login] ❌ User not found for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('[Auth Login] ✅ User found, verifying password...');
    const isValid = await comparePassword(password, user.password_hash);
    
    if (!isValid) {
      console.log('[Auth Login] ❌ Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.is_active) {
      console.log('[Auth Login] ❌ Account is inactive');
      return res.status(401).json({ error: 'Account is inactive' });
    }
    
    console.log('[Auth Login] ✅ Password valid, updating last login...');
    // Update last login
    await User.updateLastLogin(user.id);
    
    console.log('[Auth Login] Fetching business...');
    // Get business
    const business = await Business.findById(user.business_id);
    
    if (!business) {
      console.log('[Auth Login] ❌ Business not found for user');
      return res.status(500).json({ error: 'Business not found' });
    }
    
    console.log('[Auth Login] Generating token...');
    // Generate token
    const token = generateToken({
      userId: user.id,
      businessId: user.business_id,
      email: user.email,
    });
    
    console.log('[Auth Login] ✅ Login successful, token generated');
    console.log('[Auth Login] ========== LOGIN ATTEMPT COMPLETE ==========');
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        onboarding_complete: business.onboarding_complete,
      },
    });
  } catch (error) {
    console.error('[Auth Login] ❌ Error:', error);
    console.error('[Auth Login] Error stack:', error.stack);
    res.status(500).json({ error: 'Login failed', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    const agent = await AIAgent.findByBusinessId(req.businessId); // Fetch agent for FAQ data
    
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        role: req.user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        phone: business.phone,
        public_phone_number: business.public_phone_number,
        address: business.address,
        website: business.website,
        timezone: business.timezone,
        onboarding_complete: business.onboarding_complete,
        vapi_phone_number: business.vapi_phone_number,
        ai_enabled: business.ai_enabled,
        call_forward_rings: business.call_forward_rings,
        after_hours_behavior: business.after_hours_behavior,
        allow_call_transfer: business.allow_call_transfer,
        email_ai_answered: business.email_ai_answered,
        email_missed_calls: business.email_missed_calls,
        sms_enabled: business.sms_enabled,
        sms_notification_number: business.sms_notification_number,
        takeout_orders_enabled: business.takeout_orders_enabled,
        takeout_tax_rate: business.takeout_tax_rate,
        takeout_tax_calculation_method: business.takeout_tax_calculation_method,
        takeout_estimated_ready_minutes: business.takeout_estimated_ready_minutes,
        plan_tier: business.plan_tier,
        usage_limit_minutes: business.usage_limit_minutes,
        faq_count: agent?.faqs?.length || 0,
        faq_limit: business.plan_tier === 'Tier 1' ? 5 : business.plan_tier === 'Tier 2' ? 10 : business.plan_tier === 'Tier 3' ? 20 : 5,
      },
      // Include agent data directly for checklist
      agent: agent ? {
        faqs: agent.faqs || [],
      } : { faqs: [] },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Update current user's email
router.put('/me/email', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if email is already taken by another user
    const existingUser = await User.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: 'Email is already in use' });
    }
    
    // Update user email directly using Supabase (avoiding updated_at if column doesn't exist)
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from('users')
      .update({ email })
      .eq('id', userId)
      .select()
      .single();
    
    if (updateError) {
      console.error('[Update Email] Database error:', updateError);
      throw updateError;
    }
    
    res.json({ success: true, message: 'Email updated successfully' });
  } catch (error) {
    console.error('[Update Email] Error:', error);
    console.error('[Update Email] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: 'Failed to update email',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update current user's password
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const password_hash = await hashPassword(newPassword);
    
    // Update password directly using Supabase
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({ password_hash })
      .eq('id', userId);
    
    if (updateError) {
      console.error('[Update Password] Database error:', updateError);
      throw updateError;
    }
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Update Password] Error:', error);
    res.status(500).json({ 
      error: 'Failed to update password',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all users for current business
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await User.findByBusinessId(req.businessId);
    
    // Remove password_hash from response
    const safeUsers = users.map(user => {
      const { password_hash, ...safeUser } = user;
      return safeUser;
    });
    
    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Create additional user (only for owners)
router.post('/users', authenticate, async (req, res) => {
  try {
    // Check if current user is owner
    const currentUser = req.user;
    if (currentUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can create additional users' });
    }
    
    const { email, password, first_name, last_name, role = 'user' } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check if email is already taken
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }
    
    // Hash password
    const password_hash = await hashPassword(password);
    
    // Create user
    const user = await User.create({
      business_id: req.businessId,
      email,
      password_hash,
      first_name: first_name || '',
      last_name: last_name || '',
      role: role === 'owner' ? 'user' : role, // Prevent creating another owner
    });
    
    // Remove password_hash from response
    const { password_hash: _, ...safeUser } = user;
    
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (only for owners, or users updating themselves)
router.put('/users/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    const currentUserId = req.user.id;
    
    // Users can only update themselves unless they're owners
    if (currentUser.role !== 'owner' && userId !== currentUserId) {
      return res.status(403).json({ error: 'You can only update your own account' });
    }
    
    const user = await User.findById(userId);
    if (!user || user.business_id !== req.businessId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { email, password, first_name, last_name, role } = req.body;
    const updateData = {};
    
    if (email && email !== user.email) {
      // Check if email is already taken
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
      updateData.email = email;
    }
    
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      updateData.password_hash = await hashPassword(password);
    }
    
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    
    // Only owners can change roles, and can't change to owner
    if (currentUser.role === 'owner' && role && role !== 'owner') {
      updateData.role = role;
    }
    
    const updatedUser = await User.update(userId, updateData);
    
    // Remove password_hash from response
    const { password_hash: _, ...safeUser } = updatedUser;
    
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (only for owners)
router.delete('/users/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    const currentUserId = req.user.id;
    
    if (currentUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can delete users' });
    }
    
    if (userId === currentUserId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    
    const user = await User.findById(userId);
    if (!user || user.business_id !== req.businessId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Soft delete
    await User.update(userId, { deleted_at: new Date().toISOString() });
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log('[Forgot Password] Request for email:', email);

    // Find user by email (first try users table)
    let user = await User.findByEmail(email);
    
    // If user not found, try finding by business email
    if (!user) {
      console.log('[Forgot Password] User not found in users table, checking businesses table...');
      const business = await Business.findByEmail(email);
      if (business) {
        console.log('[Forgot Password] Business found, looking for associated users...');
        // Find users associated with this business
        const users = await User.findByBusinessId(business.id);
        if (users && users.length > 0) {
          // Use the first active user (preferably owner)
          user = users.find(u => u.role === 'owner') || users[0];
          console.log('[Forgot Password] Found user via business email:', user.id);
        }
      }
    }
    
    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (user) {
      // Generate 6-digit random code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Set expiration to 15 minutes from now
      const resetExpires = new Date();
      resetExpires.setMinutes(resetExpires.getMinutes() + 15);
      
      // Save code and expiration to user
      await User.update(user.id, {
        password_reset_token: resetCode,
        password_reset_expires: resetExpires.toISOString(),
      });
      
      // Get business to include name in email
      const business = await Business.findById(user.business_id);
      
      // Send reset code email
      const { sendEmail } = await import('../services/notifications.js');
      const subject = 'Your Password Reset Code - Tavari';
      const bodyText = `Hello,

You requested to reset your password for your Tavari account${business ? ` (${business.name})` : ''}.

Your password reset code is: ${resetCode}

Enter this code on the password reset page to continue.

This code will expire in 15 minutes.

If you didn't request this, please ignore this email and your password will remain unchanged.

Best regards,
The Tavari Team`;
      
      const bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Password Reset Code</h2>
          <p>Hello,</p>
          <p>You requested to reset your password for your Tavari account${business ? ` (<strong>${business.name}</strong>)` : ''}.</p>
          <div style="background-color: #f3f4f6; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
            <p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Reset Code</p>
            <p style="margin: 10px 0 0 0; font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 8px;">${resetCode}</p>
          </div>
          <p>Enter this code on the password reset page to continue.</p>
          <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
          <p>Best regards,<br>The Tavari Team</p>
        </div>
      `;
      
      try {
        await sendEmail(email, subject, bodyText, bodyHtml, 'Tavari');
        console.log('[Forgot Password] ✅ Reset code sent to:', email, 'Code:', resetCode);
      } catch (emailError) {
        console.error('[Forgot Password] ❌ Error sending reset code email:', emailError);
        console.error('[Forgot Password] Error details:', {
          message: emailError.message,
          stack: emailError.stack,
        });
        // Still return success to prevent email enumeration
        // But log the error so we can debug
      }
    } else {
      console.log('[Forgot Password] User not found for email:', email);
    }

    // Always return success (security best practice - don't reveal if email exists)
    res.json({ 
      message: 'If an account with that email exists, a password reset code has been sent.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with code
router.post('/reset-password', async (req, res) => {
  try {
    const { code, email, password } = req.body;

    if (!code || !email || !password) {
      return res.status(400).json({ error: 'Reset code, email, and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    console.log('[Reset Password] Request for email:', email, 'Code:', code);

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Verify code
    const storedCode = user.password_reset_token;
    
    if (!storedCode || storedCode !== code) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    // Check if code has expired
    if (!user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
    }

    // Hash new password
    const { hashPassword } = await import('../utils/auth.js');
    const passwordHash = await hashPassword(password);

    // Update password and clear reset code
    await User.update(user.id, {
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
    });

    console.log('[Reset Password] Password reset successful for user:', user.id);

    res.json({ message: 'Password has been reset successfully. You can now login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;

