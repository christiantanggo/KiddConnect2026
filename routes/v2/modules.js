import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { requireLegalAcceptance } from '../../middleware/v2/requireLegalAcceptance.js';
import { Module } from '../../models/v2/Module.js';
import { Subscription } from '../../models/v2/Subscription.js';
import { Business } from '../../models/Business.js';
import { AIAgent } from '../../models/AIAgent.js';
import { getStripeInstance } from '../../services/stripe.js';
import { calculateBillingCycle } from '../../services/billing.js';

const router = express.Router();

/**
 * GET /api/v2/modules/list
 * Get all available modules (no business context required - for dropdowns, etc.)
 * This route must come BEFORE /:moduleKey to avoid route conflicts
 */
router.get('/list', authenticate, async (req, res) => {
  try {
    const modules = await Module.findAll();
    res.json({ modules });
  } catch (error) {
    console.error('[GET /api/v2/modules/list] Error:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

/**
 * GET /api/v2/modules
 * Get all available modules with subscription status for current business
 */
router.get('/', authenticate, requireBusinessContext, async (req, res) => {
  try {
    const modules = await Module.findAll();
    const subscriptions = await Subscription.findByBusinessId(req.active_business_id);
    
    // Get business to check for legacy Phone Agent subscription
    const business = await Business.findById(req.active_business_id);
    
    // Check if business has legacy Phone Agent subscription (stripe_subscription_id or package_id)
    const hasLegacyPhoneAgent = business && (
      business.stripe_subscription_id || 
      business.package_id ||
      business.vapi_assistant_id
    );
    
    // Create subscription map for quick lookup
    const subscriptionMap = {};
    subscriptions.forEach(sub => {
      subscriptionMap[sub.module_key] = sub;
    });
    
    const modulesWithStatus = modules.map(module => {
      let subscribed = !!subscriptionMap[module.key];
      let subscription = subscriptionMap[module.key];
      
      // Special handling for phone-agent: check legacy subscription status
      if (module.key === 'phone-agent' && !subscribed && hasLegacyPhoneAgent) {
        subscribed = true;
        // Create a synthetic subscription object for legacy users
        subscription = {
          status: 'active',
          plan: business.package_id ? 'legacy' : 'active',
        };
      }
      
      return {
        ...module,
        subscribed: subscribed,
        subscription_status: subscription?.status || null,
        subscription_plan: subscription?.plan || null,
        usage_limit: subscription?.usage_limit || null
      };
    });
    
    res.json({ modules: modulesWithStatus });
  } catch (error) {
    console.error('[GET /api/v2/modules] Error:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

/**
 * GET /api/v2/modules/:moduleKey
 * Get specific module details
 */
router.get('/:moduleKey', authenticate, requireBusinessContext, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    
    const module = await Module.findByKey(moduleKey);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    let subscription = await Subscription.findByBusinessAndModule(
      req.active_business_id,
      moduleKey
    );
    
    // Special handling for phone-agent: check legacy subscription status
    if (moduleKey === 'phone-agent' && !subscription) {
      const business = await Business.findById(req.active_business_id);
      if (business && (business.stripe_subscription_id || business.package_id || business.vapi_assistant_id)) {
        subscription = {
          status: 'active',
          plan: business.package_id ? 'legacy' : 'active',
        };
      }
    }
    
    res.json({
      module: {
        ...module,
        subscribed: !!subscription,
        subscription: subscription || null
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/modules/:moduleKey] Error:', error);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

/**
 * POST /api/v2/modules/:moduleKey/activate
 * Create subscription for module (creates Stripe subscription item)
 * Query param ?test=true bypasses Stripe and creates a test subscription (development only)
 * Test mode also bypasses legal acceptance requirement
 */
// Internal/free modules that don't require Stripe or legal acceptance gate
const FREE_MODULES = new Set(['kidquiz', 'movie-review', 'emergency-dispatch', 'emergency-network', 'delivery-dispatch']);

router.post('/:moduleKey/activate',
  authenticate,
  requireBusinessContext,
  // Conditionally apply legal acceptance middleware
  async (req, res, next) => {
    const testMode = req.query.test === 'true' || req.body.test === true;
    const { moduleKey } = req.params;

    // Free/internal modules skip the legal acceptance gate entirely
    if (FREE_MODULES.has(moduleKey)) {
      return next();
    }

    // Test mode only available in development
    if (testMode && process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Test mode is only available in development'
      });
    }
    
    // Skip legal acceptance check in test mode
    if (testMode) {
      return next();
    }
    
    // Apply legal acceptance middleware for production
    return requireLegalAcceptance(req, res, next);
  },
  async (req, res) => {
    try {
      const { moduleKey } = req.params;
      const businessId = req.active_business_id;
      const testMode = req.query.test === 'true' || req.body.test === true;
      
      // Verify module exists
      const module = await Module.findByKey(moduleKey);
      if (!module) {
        return res.status(404).json({ error: 'Module not found' });
      }
      
      // Check if subscription already exists
      const existingSubscription = await Subscription.findByBusinessAndModule(businessId, moduleKey);
      if (existingSubscription && ['active', 'trialing', 'past_due'].includes(existingSubscription.status)) {
        return res.status(400).json({
          error: 'Already subscribed',
          message: 'You already have an active subscription for this module'
        });
      }
      
      // Get business
      const business = await Business.findById(businessId);
      
      // Get module pricing from metadata or defaults
      const pricing = module.metadata?.pricing || {
        monthly_price_cents: 2900, // $29.00 in cents
        currency: 'usd',
        usage_limit: 100
      };
      
      let subscriptionItemId = null;
      
      if (testMode) {
        // TEST MODE: Skip Stripe entirely, create test subscription
        console.log(`[TEST MODE] Activating ${moduleKey} for business ${businessId} without Stripe`);
        
        // Create test subscription record in database
        const billingCycle = calculateBillingCycle(business);
        const resetDate = new Date(billingCycle.end);
        resetDate.setDate(resetDate.getDate() + 1); // Next day after cycle ends
        
        const testSubscription = await Subscription.create({
          business_id: businessId,
          module_key: moduleKey,
          plan: 'test', // Mark as test subscription
          status: 'active',
          stripe_subscription_item_id: `test_${businessId}_${moduleKey}_${Date.now()}`, // Fake Stripe ID for test
          usage_limit: pricing.usage_limit || null,
          usage_limit_reset_date: resetDate.toISOString().split('T')[0],
          started_at: new Date().toISOString(),
        });
        
        subscriptionItemId = testSubscription.stripe_subscription_item_id;
      } else {
        // PRODUCTION MODE: Use Stripe
        // Get or create Stripe customer
        let customerId = business.stripe_customer_id;
        const stripe = getStripeInstance();
        
        if (!customerId) {
        const customer = await stripe.customers.create({
          email: business.email,
          name: business.name,
          phone: business.phone,
          metadata: {
            business_id: businessId,
          },
        });
        customerId = customer.id;
        await Business.update(businessId, { stripe_customer_id: customerId });
      }
      
      // Get or create main subscription (if doesn't exist, create it)
      // IMPORTANT: All modules share ONE Stripe subscription. This ensures:
      // - All modules charge on the SAME billing date (aligned with subscription.current_period_end)
      // - All modules appear on ONE unified invoice
      // - Single payment date per month, regardless of how many modules are active
      // - New modules added mid-cycle are prorated until the next billing date
      let subscriptionId = business.stripe_subscription_id;
      
      if (!subscriptionId) {
        // Create a base subscription with no items (will add module item below)
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [], // Empty initially, module item added below
          metadata: {
            business_id: businessId,
          },
        });
        subscriptionId = subscription.id;
        await Business.update(businessId, { stripe_subscription_id: subscriptionId });
        }
        
        // Get or create Stripe product and price for module
        // First check if product/price IDs are in module metadata
        let productId = module.metadata?.stripe_product_id || process.env[`STRIPE_PRODUCT_ID_${moduleKey.toUpperCase()}`];
        let priceId = module.metadata?.stripe_price_id || process.env[`STRIPE_PRICE_ID_${moduleKey.toUpperCase()}`];
        
        if (!productId || !priceId) {
        // Create product and price (idempotent - check if exists first)
        const products = await stripe.products.list({ limit: 100 });
        let product = products.data.find(p => p.metadata?.module_key === moduleKey);
        
        if (!product) {
          product = await stripe.products.create({
            name: module.name,
            metadata: {
              module_key: moduleKey,
            },
          });
        }
        productId = product.id;
        
        // Create price
        const prices = await stripe.prices.list({ product: productId, limit: 1 });
        let price = prices.data[0];
        
        if (!price || price.unit_amount !== pricing.monthly_price_cents) {
          price = await stripe.prices.create({
            product: productId,
            unit_amount: pricing.monthly_price_cents,
            currency: pricing.currency,
            recurring: {
              interval: 'month',
            },
            metadata: {
              module_key: moduleKey,
            },
          });
        }
        priceId = price.id;
        
        // Update module metadata with product/price IDs
        await Module.update(moduleKey, {
          metadata: {
            ...module.metadata,
            stripe_product_id: productId,
            stripe_price_id: priceId,
            pricing: pricing
          }
        });
      }
      
        // Add subscription item to existing subscription
        const subscriptionItem = await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: priceId,
          metadata: {
            business_id: businessId,
            module_key: moduleKey,
          },
        });
        
        subscriptionItemId = subscriptionItem.id;
        
        // Create subscription record in database
        const billingCycle = calculateBillingCycle(business);
        const resetDate = new Date(billingCycle.end);
        resetDate.setDate(resetDate.getDate() + 1); // Next day after cycle ends
        
        await Subscription.create({
          business_id: businessId,
          module_key: moduleKey,
          plan: 'standard', // Or from pricing config
          status: 'active',
          stripe_subscription_item_id: subscriptionItem.id,
          usage_limit: pricing.usage_limit || null,
          usage_limit_reset_date: resetDate.toISOString().split('T')[0],
          started_at: new Date().toISOString(),
        });
      }
      
      // For phone-agent module: Create AI agent and assign phone number
      if (moduleKey === 'phone-agent') {
        try {
          // Check if AI agent already exists (shouldn't happen, but be safe)
          let agent = await AIAgent.findByBusinessId(businessId);
          
          if (!agent) {
            // Create default AI agent
            agent = await AIAgent.create({
              business_id: businessId,
              greeting_text: `Hello! Thank you for calling ${business.name}. How can I help you today?`,
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
              system_instructions: `You are a helpful AI assistant for ${business.name}. Answer questions politely and take messages when needed.`,
            });
          }

          // Automatically assign an unassigned phone number during activation
          let assignedPhoneNumber = null;
          const formattedPhone = business.public_phone_number || business.phone;
          
          try {
            // Pre-flight check
            const { canAssignPhoneNumber } = await import('../../utils/phonePreflight.js');
            const preflightCheck = await canAssignPhoneNumber();
            
            if (!preflightCheck.canAssign) {
              console.warn('[Module Activation] ⚠️  Phone assignment pre-flight check failed:', preflightCheck.reason);
              console.warn('[Module Activation] Details:', preflightCheck.details);
              console.warn('[Module Activation] Skipping automatic phone assignment. User can assign manually later.');
              // Continue with activation - don't fail
            } else {
              const { 
                findUnassignedTelnyxNumbers, 
                checkIfNumberProvisionedInVAPI,
                createAssistant, 
                provisionPhoneNumber, 
                linkAssistantToNumber,
                searchAvailablePhoneNumbers,
                purchaseTelnyxNumber
              } = await import('../../services/vapi.js');
              
              const { acquirePhoneLock, releasePhoneLock } = await import('../../utils/phoneLock.js');
              
              console.log('[Module Activation] Attempting to automatically assign phone number...');
            
              // Extract area code from business phone if available
              let preferredAreaCode = null;
              if (formattedPhone) {
                const { extractAreaCode } = await import('../../utils/phoneFormatter.js');
                preferredAreaCode = extractAreaCode(formattedPhone);
                if (preferredAreaCode) {
                  console.log(`[Module Activation] Preferred area code: ${preferredAreaCode}`);
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
                    console.log(`[Module Activation] ✅ Acquired lock for phone number ${candidateE164}`);
                    break;
                  } else {
                    console.log(`[Module Activation] Phone number ${candidateE164} is locked, trying next...`);
                  }
                }
                
                if (!lockedNumber) {
                  console.warn('[Module Activation] ⚠️  All available numbers are currently locked, will purchase new number instead');
                  // Fall through to purchase new number
                } else {
                  // Check if this number is already provisioned in VAPI
                  const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
                  if (existingVapiNumber) {
                    // Number is already in VAPI, just get its ID
                    phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
                    console.log(`[Module Activation] Number ${phoneNumber} is already provisioned in VAPI (ID: ${phoneNumberId}), will reuse it`);
                  } else {
                    // Number exists in Telnyx but not in VAPI, need to provision it
                    console.log(`[Module Activation] Number ${phoneNumber} exists in Telnyx but not in VAPI, provisioning to VAPI...`);
                    try {
                      const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
                      phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
                      
                      if (!phoneNumberId) {
                        console.error(`[Module Activation] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
                        console.error(`[Module Activation] Provisioned number response:`, JSON.stringify(provisionedNumber, null, 2));
                        // Try to get it from VAPI directly
                        const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumber);
                        if (vapiCheck) {
                          phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
                          console.log(`[Module Activation] Retrieved phoneNumberId from VAPI check: ${phoneNumberId}`);
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
                // Step 2: No unassigned numbers, purchase a new one matching area code
                console.log('[Module Activation] No unassigned numbers found, purchasing new number...');
                
                // Only purchase toll-free numbers (first number is included in subscription)
                if (preferredAreaCode) {
                  console.log(`[Module Activation] Searching for available toll-free numbers with area code ${preferredAreaCode}...`);
                  const availableNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, preferredAreaCode);
                  
                  if (availableNumbers.length > 0) {
                    phoneNumber = availableNumbers[0].phone_number;
                    console.log(`[Module Activation] Found available toll-free number with area code ${preferredAreaCode}: ${phoneNumber}`);
                  } else {
                    // Try without area code
                    console.log(`[Module Activation] No toll-free numbers found with area code ${preferredAreaCode}, trying any area code...`);
                    const fallbackNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, null);
                    if (fallbackNumbers.length > 0) {
                      phoneNumber = fallbackNumbers[0].phone_number;
                      console.log(`[Module Activation] Found available toll-free number: ${phoneNumber}`);
                    } else {
                      throw new Error('No available toll-free phone numbers found. Please try again or contact support.');
                    }
                  }
                } else {
                  // No preferred area code, get any available toll-free number
                  const availableNumbers = await searchAvailablePhoneNumbers('US', 'toll-free', 5, null);
                  if (availableNumbers.length > 0) {
                    phoneNumber = availableNumbers[0].phone_number;
                    console.log(`[Module Activation] Found available toll-free number: ${phoneNumber}`);
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
                  console.log(`[Module Activation] Purchasing number ${phoneNumber} from Telnyx...`);
                  await purchaseTelnyxNumber(phoneNumber, businessId);
                  console.log(`[Module Activation] ✅ Number purchased from Telnyx`);
                  
                  // Provision to VAPI
                  console.log(`[Module Activation] Provisioning number ${phoneNumber} to VAPI...`);
                  const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
                  phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
                  
                  if (!phoneNumberId) {
                    console.error(`[Module Activation] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
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
              
              // Step 3: Create VAPI assistant
              console.log(`[Module Activation] Creating VAPI assistant for business...`);
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
                businessId: businessId, // CRITICAL: Include businessId in metadata for webhook lookup
              });
              
              if (!assistant || !assistant.id) {
                throw new Error('Failed to create VAPI assistant - no assistant ID returned');
              }
              
              // Step 4: Link assistant to phone number
              if (!phoneNumberId) {
                console.warn(`[Module Activation] ⚠️  Warning: phoneNumberId is missing, cannot link assistant to phone number`);
                console.warn(`[Module Activation] Phone number: ${phoneNumber}, Assistant ID: ${assistant.id}`);
                // Try to extract phoneNumberId from the phone number if we have it
                if (phoneNumber) {
                  // Try to find the phone number in VAPI by the actual number
                  const vapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
                  if (vapiNumber) {
                    phoneNumberId = vapiNumber.id || vapiNumber.phoneNumberId;
                    console.log(`[Module Activation] Found phoneNumberId from VAPI lookup: ${phoneNumberId}`);
                  }
                }
              }
              
              if (phoneNumberId && assistant.id) {
                console.log(`[Module Activation] Linking assistant ${assistant.id} to phone number ${phoneNumberId}...`);
                try {
                  await linkAssistantToNumber(assistant.id, phoneNumberId);
                  console.log(`[Module Activation] ✅ Successfully linked assistant to phone number`);
                } catch (linkError) {
                  console.error(`[Module Activation] ⚠️  Failed to link assistant to phone number:`, linkError.message);
                  // Continue anyway - number might still work
                }
              } else {
                console.warn(`[Module Activation] ⚠️  Cannot link assistant - missing phoneNumberId (${phoneNumberId}) or assistant.id (${assistant.id})`);
              }
              
              // Step 5: Update business with phone number and assistant ID
              // Ensure phone number is in E.164 format
              const phoneNumberE164 = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/[^0-9]/g, '')}`;
              
              if (!phoneNumberE164 || phoneNumberE164 === '+') {
                throw new Error(`Invalid phone number format: ${phoneNumber}`);
              }
              
              try {
                await Business.update(businessId, {
                  vapi_phone_number: phoneNumberE164,
                  vapi_assistant_id: assistant.id,
                });
                assignedPhoneNumber = phoneNumberE164;
                console.log(`[Module Activation] ✅ Phone number ${phoneNumberE164} automatically assigned to business ${businessId}`);
                
                // Release lock after successful assignment
                if (phoneNumber) {
                  releasePhoneLock(phoneNumber);
                }
              } catch (dbError) {
                console.error(`[Module Activation] ⚠️  Failed to update business with phone number:`, dbError.message);
                console.error(`[Module Activation] Database error details:`, dbError);
                // Still set assignedPhoneNumber so it's returned in response
                assignedPhoneNumber = phoneNumberE164;
                // Release lock even on database error
                if (phoneNumber) {
                  releasePhoneLock(phoneNumber);
                }
              }
            } // End of preflight check else block
          } catch (phoneError) {
            // Don't fail activation if phone assignment fails - user can assign manually later
            console.error('[Module Activation] ⚠️  Error automatically assigning phone number (non-blocking):', phoneError.message);
            console.error('[Module Activation] Business can assign phone number manually via the setup wizard.');
            // Release lock if we had one (phoneNumber might be undefined if error occurred early)
            if (typeof phoneNumber !== 'undefined' && phoneNumber) {
              try {
                releasePhoneLock(phoneNumber);
              } catch (lockError) {
                console.warn('[Module Activation] Could not release phone lock:', lockError.message);
              }
            }
          }
        } catch (agentError) {
          // Don't fail activation if agent creation fails - log and continue
          console.error('[Module Activation] ⚠️  Error creating AI agent (non-blocking):', agentError.message);
          console.error('[Module Activation] Business can set up agent manually via the setup wizard.');
        }
      }
      
      // Redirect to the appropriate dashboard for this module
      const moduleDashboards = {
        'kidquiz': '/dashboard/v2/modules/kidquiz/dashboard',
        'movie-review': '/dashboard/v2/modules/movie-review/dashboard',
        'emergency-dispatch': '/dashboard/v2/modules/emergency-dispatch',
        'emergency-network': '/dashboard/v2/modules/emergency-dispatch',
        'delivery-dispatch': '/dashboard/v2/modules/delivery-dispatch',
      };
      const dashboardPath = moduleDashboards[moduleKey] || `/modules/${moduleKey}/setup`;
      const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${dashboardPath}`;
      
      res.json({
        success: true,
        subscription_item_id: subscriptionItemId,
        redirect_to: successUrl,
        message: testMode 
          ? 'Test subscription activated successfully. Redirecting to setup...' 
          : 'Subscription activated successfully. Redirecting to setup...',
        test_mode: testMode
      });
    } catch (error) {
      console.error('[POST /api/v2/modules/:moduleKey/activate] Error:', error);
      res.status(500).json({
        error: 'Failed to activate module',
        message: error.message
      });
    }
  }
);

export default router;
