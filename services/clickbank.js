// services/clickbank.js
// ClickBank integration service for handling order notifications and account creation

import { Business } from '../models/Business.js';
import { User } from '../models/User.js';
import { AIAgent } from '../models/AIAgent.js';
import { PricingPackage } from '../models/PricingPackage.js';
import { hashPassword } from '../utils/auth.js';
import { sendEmail } from './notifications.js';
import crypto from 'crypto';

/**
 * Generate a secure random password
 * @returns {string} Random password (16 characters, includes uppercase, lowercase, numbers, symbols)
 */
export function generateSecurePassword() {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const password = crypto.randomBytes(length).reduce((p, i) => p + charset[i % charset.length], '');
  
  // Ensure at least one uppercase, one lowercase, one number, and one symbol
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*]/.test(password);
  
  if (hasUpper && hasLower && hasNumber && hasSymbol) {
    return password;
  }
  
  // If password doesn't meet requirements, regenerate
  return generateSecurePassword();
}

/**
 * Map ClickBank item numbers to module keys
 * @param {string|number} itemNumber - ClickBank item number
 * @returns {string|null} Module key or null if not found
 */
function getModuleKeyFromItemNumber(itemNumber) {
  if (!itemNumber) return null;
  
  const itemNum = parseInt(itemNumber, 10);
  
  // Map ClickBank item numbers to module keys
  // Item 1 = Phone Agent (old system)
  // Item 2 = Review Reply (v2 system)
  const moduleMap = {
    1: 'phone-agent',
    2: 'reviews',
  };
  
  return moduleMap[itemNum] || null;
}

/**
 * Decrypt ClickBank v6.0 encrypted notification
 * @param {string} encryptedNotification - Base64-encoded encrypted notification
 * @param {string} iv - Base64-encoded initialization vector
 * @param {string} secretKey - ClickBank secret key (CLICKBANK_CLIENT_SECRET)
 * @returns {Object|null} Decrypted notification parameters or null if decryption fails
 */
export function decryptClickBankNotification(encryptedNotification, iv, secretKey) {
  if (!secretKey) {
    console.warn('[ClickBank] ⚠️  CLICKBANK_CLIENT_SECRET not configured, cannot decrypt notification');
    return null;
  }
  
  try {
    // Decode base64 strings
    const encryptedBuffer = Buffer.from(encryptedNotification, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    
    // Try multiple key derivation methods since ClickBank's exact method is not documented
    // Method 1: Use secret key directly (if exactly 16 bytes) for AES-128
    if (Buffer.from(secretKey, 'utf8').length === 16) {
      try {
        const key = Buffer.from(secretKey, 'utf8');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuffer);
        let decrypted = decipher.update(encryptedBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        const decryptedText = decrypted.toString('utf8');
        const params = JSON.parse(decryptedText);
        console.log('[ClickBank] ✅ Notification decrypted successfully (direct key, AES-128-CBC)');
        return params;
      } catch (e) {
        console.log('[ClickBank] Direct key method failed, trying MD5 hash...');
      }
    }
    
    // Method 2: MD5 hash of secret key (16 bytes) for AES-128
    try {
      const key = crypto.createHash('md5').update(secretKey).digest();
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuffer);
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      const decryptedText = decrypted.toString('utf8');
      const params = JSON.parse(decryptedText);
      console.log('[ClickBank] ✅ Notification decrypted successfully (MD5 hash, AES-128-CBC)');
      return params;
    } catch (e) {
      console.log('[ClickBank] MD5 hash method failed, trying SHA-256 hash...');
    }
    
    // Method 3: SHA-256 hash of secret key (32 bytes) for AES-256
    try {
      const key = crypto.createHash('sha256').update(secretKey).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      const decryptedText = decrypted.toString('utf8');
      const params = JSON.parse(decryptedText);
      console.log('[ClickBank] ✅ Notification decrypted successfully (SHA-256 hash, AES-256-CBC)');
      return params;
    } catch (e) {
      console.error('[ClickBank] All decryption methods failed. This might indicate:');
      console.error('[ClickBank] 1. Incorrect secret key');
      console.error('[ClickBank] 2. ClickBank uses a different encryption method');
      console.error('[ClickBank] 3. Contact ClickBank support for exact encryption specification');
      throw new Error('All decryption methods failed');
    }
  } catch (error) {
    console.error('[ClickBank] ❌ Error decrypting notification:', error);
    console.error('[ClickBank] Error details:', {
      message: error.message,
      stack: error.stack,
    });
    return null;
  }
}

/**
 * Verify ClickBank INS notification signature (for older versions that use signatures)
 * @param {Object} params - Notification parameters
 * @param {string} secretKey - ClickBank secret key (CLICKBANK_CLIENT_SECRET)
 * @returns {boolean} True if signature is valid
 */
export function verifyClickBankSignature(params, secretKey) {
  if (!secretKey) {
    console.warn('[ClickBank] ⚠️  CLICKBANK_CLIENT_SECRET not configured, skipping signature verification');
    return true; // In development, skip verification if not configured
  }
  
  try {
    const receipt = params.receipt || '';
    const signature = params.cbcPop || '';
    
    // ClickBank uses HMAC-SHA512 with the receipt and secret key
    const hmac = crypto.createHmac('sha512', secretKey);
    hmac.update(receipt);
    const calculatedSignature = hmac.digest('hex');
    
    return calculatedSignature === signature;
  } catch (error) {
    console.error('[ClickBank] Error verifying signature:', error);
    return false;
  }
}

/**
 * Process a ClickBank order notification and create account
 * @param {Object} params - ClickBank INS notification parameters
 * @returns {Promise<Object>} Created account information
 */
export async function processClickBankOrder(params) {
  console.log('[ClickBank] ========== PROCESSING CLICKBANK ORDER ==========');
  console.log('[ClickBank] Transaction Type:', params.transactionType);
  console.log('[ClickBank] Receipt:', params.receipt);
  console.log('[ClickBank] Customer Email:', params.customerEmail);
  console.log('[ClickBank] All params keys:', Object.keys(params));
  console.log('[ClickBank] Item Number:', params.itemNumber || params.item || params.cbitems || 'not provided');
  
  // Only process SALES transactions (ignore refunds, chargebacks, etc. for account creation)
  if (params.transactionType !== 'SALE' && params.transactionType !== 'TEST') {
    console.log(`[ClickBank] ⚠️  Skipping transaction type: ${params.transactionType}`);
    return { skipped: true, reason: `Transaction type ${params.transactionType} does not create accounts` };
  }
  
  const customerEmail = params.customerEmail;
  const customerFirstName = params.customerFirstName || '';
  const customerLastName = params.customerLastName || '';
  const receipt = params.receipt;
  const saleId = params.saleId;
  const amount = parseFloat(params.amount) || 0;
  const itemNumber = params.itemNumber || params.item || params.cbitems; // ClickBank sends item number
  
  if (!customerEmail) {
    throw new Error('Customer email is required');
  }
  
  // Determine which module was purchased
  const moduleKey = getModuleKeyFromItemNumber(itemNumber);
  if (!moduleKey) {
    throw new Error(`Unknown item number: ${itemNumber}. Supported items: 1 (Phone Agent), 2 (Review Reply)`);
  }
  
  console.log(`[ClickBank] Module detected: ${moduleKey} (item number: ${itemNumber})`);
  
  // Check if account already exists
  const existingUser = await User.findByEmail(customerEmail);
  if (existingUser) {
    console.log(`[ClickBank] ⚠️  Account already exists for ${customerEmail}`);
    
    // If account exists but this is a new module purchase (v2 system), activate the module
    if (moduleKey === 'reviews') {
      const { Subscription } = await import('../models/v2/Subscription.js');
      const { ExternalPurchase } = await import('../models/v2/ExternalPurchase.js');
      const { Business } = await import('../models/Business.js');
      const { calculateBillingCycle } = await import('./billing.js');
      
      const business = await Business.findById(existingUser.business_id);
      
      // Check if subscription already exists
      const existingSubscription = await Subscription.findByBusinessAndModule(existingUser.business_id, 'reviews');
      if (!existingSubscription || !['active', 'trialing', 'past_due'].includes(existingSubscription.status)) {
        // Create subscription for existing user
        const billingCycle = calculateBillingCycle(business);
        const resetDate = new Date(billingCycle.end);
        resetDate.setDate(resetDate.getDate() + 1);
        
        await Subscription.create({
          business_id: existingUser.business_id,
          module_key: 'reviews',
          plan: 'clickbank',
          status: 'active',
          stripe_subscription_item_id: `clickbank_${existingUser.business_id}_reviews_${Date.now()}`,
          usage_limit: 100,
          usage_limit_reset_date: resetDate.toISOString().split('T')[0],
          started_at: new Date().toISOString(),
        });
        
        // Record external purchase
        await ExternalPurchase.create({
          provider: 'clickbank',
          external_order_id: saleId || receipt,
          business_id: existingUser.business_id,
          user_id: existingUser.id,
          module_key: 'reviews',
          email: customerEmail,
          amount,
          currency: 'USD',
          status: 'active',
          purchase_data: { receipt, saleId, itemNumber },
        });
        
        console.log(`[ClickBank] ✅ Review Reply module activated for existing account`);
      }
    }
    
    return { 
      skipped: true, 
      reason: 'Account already exists',
      userId: existingUser.id,
      businessId: existingUser.business_id,
      moduleActivated: moduleKey === 'reviews'
    };
  }
  
  // Generate business name from customer name or use email
  const businessName = customerFirstName && customerLastName 
    ? `${customerFirstName} ${customerLastName}'s Business`
    : customerEmail.split('@')[0];
  
  // Create business
  const business = await Business.create({
    name: businessName,
    email: customerEmail,
    phone: null, // Customer can add this later
    address: '',
    timezone: 'America/New_York', // Default timezone
  });
  
  console.log(`[ClickBank] ✅ Business created: ${business.id}`);
  
  // Generate secure password
  const tempPassword = generateSecurePassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Get client IP from params (ClickBank may include this)
  const clientIp = params.customerIp || params.ip || 'unknown';
  const termsVersion = '2025-12-27'; // Current terms version
  const now = new Date().toISOString();
  
  // Create user account
  const user = await User.create({
    business_id: business.id,
    email: customerEmail,
    password_hash: passwordHash,
    first_name: customerFirstName,
    last_name: customerLastName,
    role: 'owner',
    terms_accepted_at: now, // Accept terms automatically since they purchased
    privacy_accepted_at: now,
    terms_version: termsVersion,
    terms_accepted_ip: clientIp,
  });
  
  console.log(`[ClickBank] ✅ User created: ${user.id}`);
  
  // Handle module-specific setup
  if (moduleKey === 'phone-agent') {
    // OLD SYSTEM: Phone Agent (uses packages)
    const { PricingPackage } = await import('../models/PricingPackage.js');
    
    // Find the default package (Founder's Plan at $119/month)
    const packages = await PricingPackage.findAll({ includeInactive: false, includePrivate: true });
    let defaultPackage = packages.find(p => parseFloat(p.monthly_price) === 119);
    
    if (!defaultPackage && packages.length > 0) {
      defaultPackage = packages[0];
      console.log(`[ClickBank] ⚠️  Founder's plan not found, using first available package: ${defaultPackage.name}`);
    }
    
    if (!defaultPackage) {
      throw new Error('No active pricing package found. Please create a pricing package first.');
    }
    
    console.log(`[ClickBank] Using package: ${defaultPackage.name} (${defaultPackage.id})`);
    
    // Set package and subscription info
    await Business.update(business.id, {
      package_id: defaultPackage.id,
      plan_tier: 'founder',
      usage_limit_minutes: defaultPackage.minutes_included || 1000,
      clickbank_receipt: receipt,
      clickbank_sale_id: saleId,
      purchased_at_sale_price: defaultPackage.sale_price || defaultPackage.monthly_price,
    });
    
    // Create default AI agent
    const agent = await AIAgent.create({
      business_id: business.id,
      greeting_text: `Hello! Thank you for calling ${businessName}. How can I help you today?`,
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
      system_instructions: `You are a helpful AI assistant for ${businessName}. Answer questions politely and take messages when needed.`,
    });
    
    console.log(`[ClickBank] ✅ AI Agent created: ${agent.id}`);
    
  } else if (moduleKey === 'reviews') {
    // V2 SYSTEM: Review Reply (uses v2 subscriptions)
    const { Subscription } = await import('../models/v2/Subscription.js');
    const { ExternalPurchase } = await import('../models/v2/ExternalPurchase.js');
    const { calculateBillingCycle } = await import('./billing.js');
    
    // Create v2 subscription for Review Reply module
    const billingCycle = calculateBillingCycle(business);
    const resetDate = new Date(billingCycle.end);
    resetDate.setDate(resetDate.getDate() + 1);
    
    const subscription = await Subscription.create({
      business_id: business.id,
      module_key: 'reviews',
      plan: 'clickbank',
      status: 'active',
      stripe_subscription_item_id: `clickbank_${business.id}_reviews_${Date.now()}`,
      usage_limit: 100, // Default usage limit
      usage_limit_reset_date: resetDate.toISOString().split('T')[0],
      started_at: new Date().toISOString(),
    });
    
    console.log(`[ClickBank] ✅ Review Reply subscription created: ${subscription.id}`);
    
    // Record external purchase
    await ExternalPurchase.create({
      provider: 'clickbank',
      external_order_id: saleId || receipt,
      business_id: business.id,
      user_id: user.id,
      module_key: 'reviews',
      email: customerEmail,
      amount,
      currency: 'USD',
      status: 'active',
      purchase_data: { receipt, saleId, itemNumber },
    });
    
    console.log(`[ClickBank] ✅ External purchase recorded`);
  }
  
  // Send welcome email with login credentials
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'https://tavarios.com';
  const loginUrl = `${frontendUrl}/login`;
  
  const moduleName = moduleKey === 'reviews' ? 'Review Reply' : 'Phone Agent';
  const welcomeSubject = `Welcome to Tavari AI ${moduleName} - Your Account is Ready!`;
  const welcomeBodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to Tavari AI ${moduleName}!</h2>
      <p>Hi ${customerFirstName || 'there'},</p>
      <p>Thank you for purchasing Tavari AI ${moduleName}! Your account has been created and is ready to use.</p>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #111827; margin-top: 0;">Your Login Credentials:</h3>
        <p><strong>Email:</strong> ${customerEmail}</p>
        <p><strong>Password:</strong> <code style="background-color: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">
          <strong>⚠️ Important:</strong> Please save this password and change it after your first login for security.
        </p>
      </div>
      
      <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1e40af; margin-top: 0;">Next Steps:</h3>
        <ol style="color: #374151; line-height: 1.8;">
          <li>Log in to your dashboard: <a href="${loginUrl}" style="color: #2563eb;">${loginUrl}</a></li>
          ${moduleKey === 'reviews' 
            ? '<li>Complete the setup wizard to configure your Review Reply settings</li><li>Start generating professional review responses instantly!</li>'
            : '<li>Complete the setup wizard to configure your AI agent</li><li>Add your business information, hours, and FAQs</li><li>Go live and start receiving calls!</li>'
          }
        </ol>
      </div>
      
      <p style="color: #374151;">
        If you have any questions, please don't hesitate to contact us at 
        <a href="mailto:info@tanggo.ca" style="color: #2563eb;">info@tanggo.ca</a>.
      </p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        Best regards,<br>
        The Tavari Team
      </p>
    </div>
  `;
  
  const welcomeBodyText = `
Welcome to Tavari AI ${moduleName}!

Hi ${customerFirstName || 'there'},

Thank you for purchasing Tavari AI ${moduleName}! Your account has been created and is ready to use.

Your Login Credentials:
Email: ${customerEmail}
Password: ${tempPassword}

⚠️ Important: Please save this password and change it after your first login for security.

Next Steps:
1. Log in to your dashboard: ${loginUrl}
${moduleKey === 'reviews' 
  ? '2. Complete the setup wizard to configure your Review Reply settings\n3. Start generating professional review responses instantly!'
  : '2. Complete the setup wizard to configure your AI agent\n3. Add your business information, hours, and FAQs\n4. Go live and start receiving calls!'
}

If you have any questions, please contact us at info@tanggo.ca.

Best regards,
The Tavari Team
  `.trim();
  
  try {
    await sendEmail(customerEmail, welcomeSubject, welcomeBodyText, welcomeBodyHtml, 'Tavari', null);
    console.log(`[ClickBank] ✅ Welcome email sent to ${customerEmail}`);
  } catch (emailError) {
    console.error(`[ClickBank] ❌ Failed to send welcome email:`, emailError.message);
    // Don't fail the whole process if email fails - account is created
  }
  
  console.log('[ClickBank] ========== CLICKBANK ORDER PROCESSED SUCCESSFULLY ==========');
  
  return {
    success: true,
    userId: user.id,
    businessId: business.id,
    email: customerEmail,
    password: tempPassword, // Return password (will be sent in email)
    moduleKey,
  };
}

