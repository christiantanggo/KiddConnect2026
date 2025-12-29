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
 * Verify ClickBank INS notification signature
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
  
  if (!customerEmail) {
    throw new Error('Customer email is required');
  }
  
  // Check if account already exists
  const existingUser = await User.findByEmail(customerEmail);
  if (existingUser) {
    console.log(`[ClickBank] ⚠️  Account already exists for ${customerEmail}`);
    return { 
      skipped: true, 
      reason: 'Account already exists',
      userId: existingUser.id,
      businessId: existingUser.business_id 
    };
  }
  
  // Find the default package (Founder's Plan at $119/month)
  // Look for the package with monthly_price of 119
  const packages = await PricingPackage.findAll({ includeInactive: false, includePrivate: true });
  let defaultPackage = packages.find(p => parseFloat(p.monthly_price) === 119);
  
  // If not found, try to find any active package
  if (!defaultPackage && packages.length > 0) {
    defaultPackage = packages[0];
    console.log(`[ClickBank] ⚠️  Founder's plan not found, using first available package: ${defaultPackage.name}`);
  }
  
  if (!defaultPackage) {
    throw new Error('No active pricing package found. Please create a pricing package first.');
  }
  
  console.log(`[ClickBank] Using package: ${defaultPackage.name} (${defaultPackage.id})`);
  
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
  
  // Set package and subscription info
  await Business.update(business.id, {
    package_id: defaultPackage.id,
    plan_tier: 'founder', // Or use package name
    usage_limit_minutes: defaultPackage.minutes_included || 1000,
    clickbank_receipt: receipt, // Store ClickBank receipt for reference
    clickbank_sale_id: saleId,
    purchased_at_sale_price: defaultPackage.sale_price || defaultPackage.monthly_price, // Store price they paid
    // Note: ClickBank customers don't have stripe_subscription_status since they pay through ClickBank
    // The presence of package_id and clickbank_receipt indicates an active subscription
  });
  
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
  
  // Send welcome email with login credentials
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'https://tavarios.com';
  const loginUrl = `${frontendUrl}/login`;
  
  const welcomeSubject = 'Welcome to Tavari AI - Your Account is Ready!';
  const welcomeBodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to Tavari AI!</h2>
      <p>Hi ${customerFirstName || 'there'},</p>
      <p>Thank you for purchasing Tavari AI! Your account has been created and is ready to use.</p>
      
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
          <li>Complete the setup wizard to configure your AI agent</li>
          <li>Add your business information, hours, and FAQs</li>
          <li>Go live and start receiving calls!</li>
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
Welcome to Tavari AI!

Hi ${customerFirstName || 'there'},

Thank you for purchasing Tavari AI! Your account has been created and is ready to use.

Your Login Credentials:
Email: ${customerEmail}
Password: ${tempPassword}

⚠️ Important: Please save this password and change it after your first login for security.

Next Steps:
1. Log in to your dashboard: ${loginUrl}
2. Complete the setup wizard to configure your AI agent
3. Add your business information, hours, and FAQs
4. Go live and start receiving calls!

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
  };
}

