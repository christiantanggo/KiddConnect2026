// services/helcim.js
// Helcim payment processing service

import axios from 'axios';
import dotenv from 'dotenv';
import { Business } from '../models/Business.js';

dotenv.config();

const HELCIM_API_BASE_URL = process.env.HELCIM_API_BASE_URL || 'https://api.helcim.com/v2';
const HELCIM_API_TOKEN = process.env.HELCIM_API_TOKEN;

// Create axios instance for Helcim API
const helcimApi = axios.create({
  baseURL: HELCIM_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'api-token': HELCIM_API_TOKEN,
  },
});

export class HelcimService {
  // Create or get Helcim customer
  static async getOrCreateCustomer(businessId, email, name, phone = null) {
    console.log('[HelcimService] ========== GET OR CREATE CUSTOMER START ==========');
    console.log('[HelcimService] Business ID:', businessId);
    console.log('[HelcimService] Email:', email);
    console.log('[HelcimService] Name:', name);
    
    const business = await Business.findById(businessId);
    
    if (business.helcim_customer_id) {
      console.log('[HelcimService] Existing customer ID found:', business.helcim_customer_id);
      try {
        const response = await helcimApi.get(`/customers/${business.helcim_customer_id}`);
        console.log('[HelcimService] ✅ Retrieved existing customer:', {
          status: response.status,
          dataKeys: Object.keys(response.data || {}),
          customerId: response.data?.customerId,
          id: response.data?.id,
        });
        return response.data;
      } catch (error) {
        console.error('[HelcimService] ❌ Error retrieving Helcim customer:', error.response?.data || error.message);
        console.error('[HelcimService] Will create new customer instead');
        // If customer doesn't exist, create a new one
      }
    }
    
    // Create new customer
    console.log('[HelcimService] Creating new customer...');
    try {
      const customerData = {
        contactName: name,
        contactEmail: email,
        contactPhone: phone || business.phone || '',
        billingAddress1: business.address || '',
        billingCity: business.city || '',
        billingProvince: business.province || '',
        billingPostalCode: business.postal_code || '',
        billingCountry: business.country || 'CA',
      };
      console.log('[HelcimService] Customer data to send:', customerData);
      
      const response = await helcimApi.post('/customers', customerData);
      
      console.log('[HelcimService] ✅ Customer created:', {
        status: response.status,
        dataKeys: Object.keys(response.data || {}),
        fullResponse: JSON.stringify(response.data, null, 2),
      });
      
      const customer = response.data;
      
      // Try to extract customer ID from various possible structures
      const customerId = customer.customerId || customer.id || customer.data?.customerId || customer.data?.id;
      
      if (!customerId) {
        console.error('[HelcimService] ❌ No customer ID found in response!');
        console.error('[HelcimService] Full response:', JSON.stringify(customer, null, 2));
        throw new Error('Helcim API did not return a customer ID');
      }
      
      console.log('[HelcimService] Extracted customer ID:', customerId);
      
      // Save customer ID
      await Business.update(businessId, {
        helcim_customer_id: customerId,
      });
      
      console.log('[HelcimService] ✅ Customer ID saved to business');
      console.log('[HelcimService] ========== GET OR CREATE CUSTOMER COMPLETE ==========');
      
      // Return customer with consistent structure
      return {
        customerId: customerId,
        ...customer
      };
    } catch (error) {
      console.error('[HelcimService] ========== GET OR CREATE CUSTOMER ERROR ==========');
      console.error('[HelcimService] Error creating Helcim customer:', error.response?.data || error.message);
      console.error('[HelcimService] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
      });
      throw error;
    }
  }
  
  // Create payment checkout link with fixed amount (via API - no user can change amount)
  static async createPaymentCheckoutLink(businessId, amount, description, returnUrl, cancelUrl) {
    const business = await Business.findById(businessId);
    const customer = await this.getOrCreateCustomer(
      businessId,
      business.email,
      business.name,
      business.phone
    );
    
    try {
      console.log('[HelcimService] Creating payment checkout link with fixed amount:', amount);
      
      // Check if Helcim API supports creating payment checkout links
      // Try the payment pages API endpoint
      // Note: This may require a different endpoint - check Helcim API docs
      const response = await helcimApi.post('/payment-pages', {
        customerId: customer.customerId,
        amount: amount,
        currency: 'CAD',
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl,
        type: 'fixed', // Fixed amount - user cannot change
      });
      
      console.log('[HelcimService] ✅ Payment checkout link created:', response.data);
      return {
        url: response.data.url || response.data.checkoutUrl || response.data.paymentUrl,
        paymentPageId: response.data.id,
        amount: amount,
      };
    } catch (error) {
      // If payment pages API doesn't exist, fall back to alternative method
      console.warn('[HelcimService] Payment pages API not available, trying alternative...');
      console.error('[HelcimService] Error:', error.response?.data || error.message);
      
      // Alternative: Use invoice payment method if available
      // Or return null to use hosted payment page with amount parameter
      throw new Error('Helcim API does not support dynamic payment page creation. Use hosted payment page with amount parameter instead.');
    }
  }
  
  // Create recurring subscription
  static async createSubscription(businessId, amount, interval = 'monthly', description = '') {
    const business = await Business.findById(businessId);
    const customer = await this.getOrCreateCustomer(
      businessId,
      business.email,
      business.name,
      business.phone
    );
    
    try {
      // Helcim recurring payment setup
      const response = await helcimApi.post('/recurring', {
        customerId: customer.customerId,
        amount: amount,
        currency: 'CAD',
        frequency: interval === 'monthly' ? 'monthly' : 'yearly',
        description: description || `Subscription for ${business.name}`,
        startDate: new Date().toISOString().split('T')[0],
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating Helcim subscription:', error.response?.data || error.message);
      throw error;
    }
  }
  
  // Handle webhook events
  static async handleWebhook(event) {
    // Helcim webhook events structure
    const eventType = event.type || event.eventType;
    
    switch (eventType) {
      case 'payment.completed':
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(event);
        break;
        
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
        
      case 'subscription.created':
      case 'subscription.updated':
        await this.handleSubscriptionUpdate(event);
        break;
        
      case 'subscription.cancelled':
      case 'subscription.deleted':
        await this.handleSubscriptionDeleted(event);
        break;
        
      default:
        console.log(`Unhandled Helcim event type: ${eventType}`);
    }
  }
  
  // Handle payment succeeded
  static async handlePaymentSucceeded(event) {
    const customerId = event.customerId || event.customer?.customerId;
    if (!customerId) return;
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('helcim_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    const businessId = businesses[0].id;
    console.log('Payment succeeded for business:', businessId);
    
    // Update subscription status if this is a subscription payment
    if (event.subscriptionId) {
      await this.handleSubscriptionUpdate({
        subscriptionId: event.subscriptionId,
        customerId: customerId,
        status: 'active',
      });
    }
  }
  
  // Handle payment failed
  static async handlePaymentFailed(event) {
    const customerId = event.customerId || event.customer?.customerId;
    if (!customerId) return;
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('helcim_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    console.log('Payment failed for business:', businesses[0].id);
    // Could implement grace period logic here
  }
  
  // Handle subscription update
  static async handleSubscriptionUpdate(event) {
    const customerId = event.customerId || event.customer?.customerId;
    if (!customerId) return;
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('helcim_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    const businessId = businesses[0].id;
    const subscriptionId = event.subscriptionId || event.id;
    
    // Determine plan tier and limits based on amount
    const amount = event.amount || event.planAmount;
    const planTier = this.getPlanTierFromAmount(amount);
    const usageLimit = this.getUsageLimitFromTier(planTier);
    
    await Business.update(businessId, {
      helcim_subscription_id: subscriptionId,
      plan_tier: planTier,
      usage_limit_minutes: usageLimit,
    });
  }
  
  // Handle subscription deletion
  static async handleSubscriptionDeleted(event) {
    const customerId = event.customerId || event.customer?.customerId;
    if (!customerId) return;
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('helcim_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    const businessId = businesses[0].id;
    
    // Set to free tier or suspend
    await Business.update(businessId, {
      helcim_subscription_id: null,
      plan_tier: 'free',
      usage_limit_minutes: 100, // Reduced limit
    });
  }
  
  // Get plan tier from amount
  static getPlanTierFromAmount(amount) {
    if (!amount) return 'starter';
    
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (amountNum >= 179) {
      return 'pro';
    } else if (amountNum >= 129) {
      return 'core';
    } else if (amountNum >= 79) {
      return 'starter';
    }
    return 'starter';
  }
  
  // Get usage limit from tier
  static getUsageLimitFromTier(tier) {
    const limits = {
      free: 100,
      starter: 250,
      core: 500,
      pro: 750,
      enterprise: 20000,
    };
    return limits[tier] || 250;
  }
  
  // Get subscription details
  static async getSubscription(subscriptionId) {
    try {
      const response = await helcimApi.get(`/recurring/${subscriptionId}`);
      return response.data;
    } catch (error) {
      console.error('Error retrieving Helcim subscription:', error.response?.data || error.message);
      throw error;
    }
  }
  
  // Cancel subscription
  static async cancelSubscription(subscriptionId, cancelImmediately = false) {
    try {
      if (cancelImmediately) {
        const response = await helcimApi.delete(`/recurring/${subscriptionId}`);
        return response.data;
      } else {
        // Cancel at period end
        const response = await helcimApi.put(`/recurring/${subscriptionId}`, {
          status: 'cancelled',
        });
        return response.data;
      }
    } catch (error) {
      console.error('Error cancelling Helcim subscription:', error.response?.data || error.message);
      throw error;
    }
  }
  
  // Process payment with saved payment method (fixed amount - user cannot change)
  static async processPaymentWithSavedMethod(customerId, paymentMethodId, amount, description) {
    try {
      console.log('[HelcimService] Processing payment with saved method:', {
        customerId,
        paymentMethodId,
        amount,
      });
      
      // Process payment using saved payment method
      const response = await helcimApi.post('/payment/cc', {
        customerId: customerId,
        paymentMethodId: paymentMethodId, // Use saved payment method
        amount: amount.toFixed(2),
        currency: 'CAD',
        paymentType: 'purchase',
        invoiceNumber: `Tavari-${customerId}-${Date.now()}`,
        description: description,
      });
      
      console.log('[HelcimService] ✅ Payment processed successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('[HelcimService] ❌ Error processing payment:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get customer payment methods
  static async getCustomerPaymentMethods(customerId) {
    try {
      const response = await helcimApi.get(`/customers/${customerId}/payment-methods`);
      return response.data;
    } catch (error) {
      console.error('Error retrieving payment methods:', error.response?.data || error.message);
      return null;
    }
  }

  // Add payment method to customer using Helcim.js token
  static async addPaymentMethod(customerId, paymentToken) {
    try {
      console.log('[HelcimService] Adding payment method for customer:', customerId);
      console.log('[HelcimService] Payment token (preview):', paymentToken?.substring(0, 20) + '...');
      
      // Helcim API endpoint to save payment method from token
      // Try different endpoint structures based on Helcim API v2 documentation
      // Option 1: /customers/{customerId}/payment-methods (most likely)
      let response;
      try {
        response = await helcimApi.post(`/customers/${customerId}/payment-methods`, {
          paymentToken: paymentToken,
        });
        console.log('[HelcimService] ✅ Payment method added via /customers/{id}/payment-methods');
      } catch (error1) {
        // Option 2: /customers/payment-methods with customerId in body
        console.log('[HelcimService] Trying alternative endpoint structure...');
        try {
          response = await helcimApi.post('/customers/payment-methods', {
            customerId: customerId,
            paymentToken: paymentToken,
          });
          console.log('[HelcimService] ✅ Payment method added via /customers/payment-methods');
        } catch (error2) {
          // Option 3: /payment-methods endpoint
          console.log('[HelcimService] Trying /payment-methods endpoint...');
          response = await helcimApi.post('/payment-methods', {
            customerId: customerId,
            paymentToken: paymentToken,
          });
          console.log('[HelcimService] ✅ Payment method added via /payment-methods');
        }
      }
      
      console.log('[HelcimService] ✅ Payment method added:', response.data);
      return response.data;
    } catch (error) {
      console.error('[HelcimService] ❌ Error adding payment method:', error.response?.data || error.message);
      console.error('[HelcimService] Error status:', error.response?.status);
      console.error('[HelcimService] Error headers:', error.response?.headers);
      throw error;
    }
  }

}

