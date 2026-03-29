'use client';

/**
 * NEW 9-STEP SETUP WIZARD
 * 
 * Steps:
 * 1. Username and password (if not already set during signup)
 * 2. Business name, business phone number, business URL, business email, business time zone
 * 3. Operational hours, holiday hours
 * 4. Email notifications, SMS notifications (enter the email and the phone number for the ai to send to) and include the notifications settings
 * 5. Package choice and then helcim payment flow
 * 6. Phone number choice / configuration
 * 7. Opening greeting, closing greeting
 * 8. FAQ's
 * 9. Ai settings
 * 
 * Each step has a skip button with warning
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { agentsAPI, authAPI, telnyxPhoneNumbersAPI, billingAPI, phoneNumbersAPI } from '@/lib/api';
import api from '@/lib/api';
import TelnyxPhoneNumberSelector from '@/components/TelnyxPhoneNumberSelector';
import TimeInput12Hour from '@/components/TimeInput12Hour';
import { useToast } from '@/components/ToastProvider';

const TOTAL_STEPS = 9;

// Step 6: Phone Number Component with Auto-Assignment
function Step6PhoneNumber({ 
  business, 
  selectedPhoneNumber, 
  setSelectedPhoneNumber, 
  phoneNumberCountry, 
  updateFormData, 
  success, 
  warning,
  setBusiness 
}) {
  const [autoAssigning, setAutoAssigning] = useState(true);
  const [autoAssigned, setAutoAssigned] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const lastBusinessId = useRef(null);

  useEffect(() => {
    // Wait for business data to load
    if (business === null) {
      return; // Still loading
    }

    // Reset if business ID changed
    if (lastBusinessId.current !== business?.id) {
      lastBusinessId.current = business?.id;
      setAutoAssigning(true);
      setAutoAssigned(false);
      setShowSelector(false);
    } else {
      // Already processed this business
      return;
    }

    const tryAutoAssign = async () => {

      // Check if business already has a phone number
      if (business?.vapi_phone_number || business?.telnyx_number) {
        const existingNumber = business.vapi_phone_number || business.telnyx_number;
        setSelectedPhoneNumber(existingNumber);
        updateFormData('step6', 'phoneNumber', existingNumber);
        setAutoAssigned(true); // Show as assigned
        setShowSelector(false);
        setAutoAssigning(false);
        return;
      }

      // Try to auto-assign an unassigned number
      try {
        console.log('[Step 6] Attempting to auto-assign unassigned phone number...');
        const response = await phoneNumbersAPI.autoAssign();
        
        if (response.data.assigned) {
          console.log('[Step 6] ✅ Auto-assigned phone number:', response.data.phone_number);
          setSelectedPhoneNumber(response.data.phone_number);
          updateFormData('step6', 'phoneNumber', response.data.phone_number);
          setAutoAssigned(true);
          setShowSelector(false);
          
          // Update business state
          if (setBusiness) {
            setBusiness(prev => ({
              ...prev,
              vapi_phone_number: response.data.phone_number,
            }));
          }
          
          success(`Phone number ${response.data.phone_number} has been automatically assigned to your account.`);
        } else {
          console.log('[Step 6] No unassigned numbers available, showing selector');
          setAutoAssigned(false);
          setShowSelector(true);
        }
      } catch (error) {
        console.error('[Step 6] Auto-assign failed:', error);
        setAutoAssigned(false);
        setShowSelector(true);
        // Don't show error - just show selector as fallback
      } finally {
        setAutoAssigning(false);
      }
    };

    tryAutoAssign();
  }, [business?.id]); // Only depend on business.id to avoid infinite loops

  if (autoAssigning) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Phone Number Configuration</h2>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking for available phone numbers...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show assigned number (either existing or newly assigned)
  if (selectedPhoneNumber && (autoAssigned || business?.vapi_phone_number || business?.telnyx_number)) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Phone Number Configuration</h2>
        <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-6 h-6 text-green-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-green-800 mb-2">Phone Number Assigned</h3>
              <p className="text-green-700 mb-2">
                <strong>Your phone number:</strong> {selectedPhoneNumber}
              </p>
              <p className="text-sm text-green-600">
                This toll-free number {autoAssigned ? 'has been automatically assigned' : 'is assigned'} to your account and is ready to receive calls.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showSelector) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Phone Number Configuration</h2>
        <p className="text-sm text-gray-600 mb-4">
          Select a phone number for your AI agent. This number will receive calls and the webhook will be configured automatically.
        </p>
        <TelnyxPhoneNumberSelector
          onSelect={(number) => {
            setSelectedPhoneNumber(number);
            updateFormData('step6', 'phoneNumber', number);
          }}
          selectedNumber={selectedPhoneNumber}
          countryCode={phoneNumberCountry}
        />
        {selectedPhoneNumber && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Selected:</strong> {selectedPhoneNumber}
              <br />
              This number will be purchased and configured automatically.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SetupWizardContent({ testMode = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Get initial step from URL params (for payment redirect)
  const urlStep = searchParams.get('step');
  const paymentCompleted = searchParams.get('payment_completed') === 'true';
  // Validate step is between 1 and TOTAL_STEPS
  const parsedStep = urlStep ? parseInt(urlStep, 10) : null;
  const initialStep = parsedStep && parsedStep >= 1 && parsedStep <= TOTAL_STEPS ? parsedStep : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  
  // Log test mode status on mount
  useEffect(() => {
    console.log('[Setup Wizard] Test mode status:', testMode);
    if (testMode) {
      console.warn('[Setup Wizard] ⚠️  Running in TEST MODE - payments and purchases will be skipped');
    }
  }, [testMode]);
  
  // Show success message if payment was completed
  useEffect(() => {
    if (paymentCompleted && currentStep === 6) {
      success('Payment completed successfully! Continue with phone number selection.');
      // Clean up URL params
      router.replace('/dashboard/setup', { scroll: false });
    }
  }, [paymentCompleted, currentStep, success, router]);
  const [business, setBusiness] = useState(null);
  const [agent, setAgent] = useState(null);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState(null);
  const [phoneNumberCountry, setPhoneNumberCountry] = useState('US');
  
  // Form data for all steps
  const [formData, setFormData] = useState({
    step1: { email: '', password: '', confirmPassword: '' }, // Username/password (if needed)
    step2: { 
      name: '', 
      phone: '', 
      website: '', 
      email: '', 
      timezone: 'America/New_York' 
    },
    step3: {
      business_hours: {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      holiday_hours: [],
    },
    step4: {
      email_ai_answered: true,
      email_missed_calls: false,
      notification_email: '',
      sms_enabled: false,
      sms_notification_number: '',
      sms_business_hours_enabled: false,
      sms_timezone: 'America/New_York',
      sms_allowed_start_time: '09:00:00',
      sms_allowed_end_time: '21:00:00',
    },
    step5: { packageId: null }, // Package selection
    step6: { phoneNumber: null, countryCode: 'US' }, // Phone number
    step7: { opening_greeting: '', ending_greeting: '' },
    step8: { faqs: [] },
    step9: {
      ai_enabled: true,
      call_forward_rings: 4,
      after_hours_behavior: 'take_message',
      allow_call_transfer: true,
      max_call_duration_minutes: null,
      detect_conversation_end: true,
    },
  });
  
  // Track which steps have been skipped
  const [skippedSteps, setSkippedSteps] = useState(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userRes, setupRes, packagesRes] = await Promise.all([
        authAPI.getMe(),
        api.get('/setup/data').catch(() => ({ data: { business: null, agent: null } })),
        billingAPI.getPackages().catch(() => ({ data: { packages: [] } })),
      ]);
      
      setBusiness(setupRes.data.business || userRes.data?.business);
      setAgent(setupRes.data.agent);
      setPackages(packagesRes.data.packages || []);
      
      // Load existing data into form
      if (setupRes.data.business) {
        setFormData(prev => ({
          ...prev,
          step2: {
            name: setupRes.data.business.name || '',
            phone: setupRes.data.business.phone || '',
            website: setupRes.data.business.website || '',
            email: setupRes.data.business.email || userRes.data?.user?.email || '',
            timezone: setupRes.data.business.timezone || 'America/New_York',
          },
        }));
      }
      
      if (setupRes.data.agent) {
        setFormData(prev => ({
          ...prev,
          step7: {
            opening_greeting: setupRes.data.agent.opening_greeting || '',
            ending_greeting: setupRes.data.agent.ending_greeting || '',
          },
          step8: { faqs: setupRes.data.agent.faqs || [] },
        }));
      }
    } catch (error) {
      console.error('Failed to load setup data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (step, field, value) => {
    setFormData(prev => ({
      ...prev,
      [step]: { ...prev[step], [field]: value },
    }));
  };

  const handleSkip = () => {
    const stepNames = {
      1: 'Username and Password',
      2: 'Business Information',
      3: 'Operational and Holiday Hours',
      4: 'Notification Settings',
      5: 'Package Selection and Payment',
      6: 'Phone Number Configuration',
      7: 'Greetings',
      8: 'FAQs',
      9: 'AI Settings',
    };
    
    const warning = `⚠️ Warning: Skipping "${stepNames[currentStep]}" may prevent your AI phone agent from functioning properly or providing correct information to your callers. The AI needs this information to answer questions accurately and handle calls effectively.\n\nAre you sure you want to skip this step?`;
    
    if (confirm(warning)) {
      setSkippedSteps(prev => new Set([...prev, currentStep]));
      if (currentStep < TOTAL_STEPS) {
        setCurrentStep(currentStep + 1);
      } else {
        handleFinalize();
      }
    }
  };

  const handleNext = async () => {
    console.log('[Setup Wizard] ========== handleNext CALLED ==========');
    console.log('[Setup Wizard] handleNext called, currentStep:', currentStep);
    console.log('[Setup Wizard] formData.step5:', formData.step5);
    console.log('[Setup Wizard] formData.step5.packageId:', formData.step5.packageId);
    console.log('[Setup Wizard] testMode:', testMode);
    console.log('[Setup Wizard] Condition check:', {
      'currentStep === 5': currentStep === 5,
      'formData.step5.packageId': !!formData.step5.packageId,
      '!testMode': !testMode,
      'all true': currentStep === 5 && formData.step5.packageId && !testMode
    });
    
    // Special handling for Step 5 (Package Selection) - redirect to payment if package selected
    // In test mode, we'll still show the payment flow but log that it's test mode
    if (currentStep === 5 && formData.step5.packageId) {
      if (testMode) {
        console.log('[Setup Wizard] ⚠️  Step 5 payment flow triggered in TEST MODE - payment will be skipped');
        alert('TEST MODE: Payment flow would trigger here, but payment is skipped in test mode.\n\nIn production, this would redirect to Stripe payment page.');
        // Continue to next step in test mode
        setCurrentStep(6);
        return;
      }
      
      console.log('[Setup Wizard] ✅ Step 5 payment flow triggered');
      if (!formData.step5.packageId) {
        showError('Please select a package before continuing.');
        return;
      }
      
      setSaving(true);
      try {
        console.log('[Setup Wizard] Creating checkout for package:', formData.step5.packageId);
        const checkoutRes = await billingAPI.createCheckout(formData.step5.packageId);
        
        console.log('[Setup Wizard] ✅ Checkout API call successful');
        console.log('[Setup Wizard] Full checkout response:', checkoutRes);
        console.log('[Setup Wizard] Checkout response data:', checkoutRes.data);
        console.log('[Setup Wizard] Response keys:', Object.keys(checkoutRes.data || {}));
        
        // Handle different response formats from billing API
        // The API returns { url: ... } for both payment pages and success pages
        const redirectUrl = checkoutRes.data?.url || 
                           checkoutRes.data?.redirect_url || 
                           checkoutRes.data?.paymentUrl;
        
        console.log('[Setup Wizard] Extracted redirect URL:', redirectUrl);
        console.log('[Setup Wizard] Response success flag:', checkoutRes.data?.success);
        console.log('[Setup Wizard] Response message:', checkoutRes.data?.message);
        
        if (checkoutRes.data?.success === true || checkoutRes.data?.skipPayment === true) {
          // Payment already processed OR payment skipped (not configured)
          if (checkoutRes.data?.skipPayment) {
            console.log('[Setup Wizard] Payment skipped (not configured), continuing to next step');
            warning('Payment not configured. Package selected. You can complete payment later in billing settings.');
          } else {
            console.log('[Setup Wizard] Payment already processed, continuing to next step');
            success('Payment processed successfully! Package activated.');
          }
          // Continue to next step
          setCurrentStep(6);
          setSaving(false);
          return;
        } else if (redirectUrl) {
          // Check if this is a Stripe checkout URL or our success page
          const isStripeUrl = redirectUrl.includes('checkout.stripe.com');
          const isSuccessPage = redirectUrl.includes('/billing/success');
          
          if (isStripeUrl) {
            // Redirect to Stripe checkout page
            console.log('[Setup Wizard] ✅ Redirecting to Stripe checkout:', redirectUrl);
            window.location.href = redirectUrl;
            return; // Stop execution - user will be redirected
          } else if (isSuccessPage) {
            // This means payment is not configured, just continue to next step
            console.log('[Setup Wizard] ⚠️ Payment not configured, continuing to next step');
            warning('Payment not configured. You can complete payment later in billing settings.');
            setCurrentStep(6);
            setSaving(false);
            return;
          } else {
            // Unknown URL, redirect anyway
            console.log('[Setup Wizard] ✅ Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
            return;
          }
        } else {
          // If no URL and no success, show error but allow continuing
          const errorMsg = checkoutRes.data?.error || 
                          checkoutRes.data?.message || 
                          'Failed to initiate payment. You can complete payment later in billing settings.';
          console.error('[Setup Wizard] ❌ No payment URL returned. Full response:', JSON.stringify(checkoutRes.data, null, 2));
          warning(errorMsg);
          // Continue to next step even if payment fails
          setCurrentStep(6);
          setSaving(false);
          return;
        }
      } catch (paymentError) {
        console.error('[Setup Wizard] ❌ Payment initiation error:', paymentError);
        console.error('[Setup Wizard] Error response:', paymentError.response);
        console.error('[Setup Wizard] Error data:', paymentError.response?.data);
        const errorData = paymentError.response?.data || {};
        const errorMsg = errorData.error || 
                        errorData.message || 
                        'Failed to initiate payment. You can complete payment later in billing settings.';
        
        if (paymentError.response?.status === 402) {
          // Payment method required
          warning('Payment method required. You can add one later in billing settings.');
        } else if (paymentError.response?.status === 503) {
          // Payment not configured
          warning('Payment processing is not fully configured. You can complete payment later in billing settings.');
        } else {
          warning(errorMsg);
        }
        
        // Continue to next step even if payment fails
        setCurrentStep(6);
        setSaving(false);
        return;
      }
    }
    
    console.log('[Setup Wizard] Normal flow - saving step', currentStep);
    // Save current step before moving forward
    const saved = await saveStep(currentStep);
    console.log('[Setup Wizard] Step saved:', saved);
    if (saved && currentStep < TOTAL_STEPS) {
      console.log('[Setup Wizard] Moving to next step:', currentStep + 1);
      setCurrentStep(currentStep + 1);
    } else {
      console.log('[Setup Wizard] Not moving to next step. saved:', saved, 'currentStep:', currentStep, 'TOTAL_STEPS:', TOTAL_STEPS);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      // Remove from skipped steps if going back
      setSkippedSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(currentStep - 1);
        return newSet;
      });
    }
  };

  const saveStep = async (step) => {
    setSaving(true);
    try {
      switch (step) {
        case 1:
          // Username/password - only if not already set
          // This might not be needed if signup already handles it
          break;
        case 2:
          await api.post('/setup/step1', formData.step2);
          break;
        case 3:
          await api.post('/setup/step3', {
            business_hours: formData.step3.business_hours,
            holiday_hours: formData.step3.holiday_hours,
          });
          break;
        case 4:
          await api.put('/business/settings', {
            email_ai_answered: formData.step4.email_ai_answered,
            email_missed_calls: formData.step4.email_missed_calls,
            notification_email: formData.step4.notification_email,
            sms_enabled: formData.step4.sms_enabled,
            sms_notification_number: formData.step4.sms_notification_number,
            sms_business_hours_enabled: formData.step4.sms_business_hours_enabled,
            sms_timezone: formData.step4.sms_timezone,
            sms_allowed_start_time: formData.step4.sms_allowed_start_time,
            sms_allowed_end_time: formData.step4.sms_allowed_end_time,
          });
          break;
        case 5:
          // Package selection - handled separately in payment flow
          break;
        case 6:
          // Phone number - handled separately
          break;
        case 7:
          await api.post('/setup/step2', {
            opening_greeting: formData.step7.opening_greeting,
            ending_greeting: formData.step7.ending_greeting,
          });
          break;
        case 8:
          await api.post('/setup/step4', formData.step8);
          break;
        case 9:
          await api.put('/business/settings', {
            ai_enabled: formData.step9.ai_enabled,
            call_forward_rings: formData.step9.call_forward_rings,
            after_hours_behavior: formData.step9.after_hours_behavior,
            allow_call_transfer: formData.step9.allow_call_transfer,
            max_call_duration_minutes: formData.step9.max_call_duration_minutes,
            detect_conversation_end: formData.step9.detect_conversation_end,
          });
          break;
      }
      return true;
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setSaving(true);
    try {
      // Save all remaining steps
      for (let step = 1; step <= TOTAL_STEPS; step++) {
        if (!skippedSteps.has(step)) {
          await saveStep(step);
        }
      }
      
      // Handle package payment if selected
      if (formData.step5.packageId && !testMode) {
        try {
          const checkoutRes = await billingAPI.createCheckout(formData.step5.packageId);
          if (checkoutRes.data.paymentUrl) {
            window.location.href = checkoutRes.data.paymentUrl;
            return; // Don't finalize yet, wait for payment
          }
        } catch (paymentError) {
          console.error('Payment error:', paymentError);
          warning('Setup saved but payment failed. You can complete payment later.');
        }
      }
      
      // Handle phone number purchase if selected
      if (selectedPhoneNumber && !business?.telnyx_number && !business?.vapi_phone_number) {
        try {
          console.log('[Setup Wizard] Provisioning phone number:', selectedPhoneNumber);
          const provisionResult = await telnyxPhoneNumbersAPI.purchase(selectedPhoneNumber, phoneNumberCountry);
          console.log('[Setup Wizard] Phone number provisioned:', provisionResult);
          if (provisionResult?.data?.success) {
            success('Phone number provisioned successfully!');
          }
        } catch (phoneError) {
          console.error('Phone number purchase error:', phoneError);
          const errorMsg = phoneError.response?.data?.error || phoneError.message || 'Unknown error';
          console.error('Phone error details:', {
            message: errorMsg,
            status: phoneError.response?.status,
            data: phoneError.response?.data,
          });
          warning(`Setup completed but phone number provisioning failed: ${errorMsg}. You can add a phone number later in settings.`);
        }
      }
      
      // Finalize setup
      await api.post('/setup/finalize', {
        phoneNumber: selectedPhoneNumber,
        countryCode: phoneNumberCountry,
      });
      
      success('Setup complete! Your AI agent is ready to go.');
      
      // Navigate to dashboard after a short delay so user can see the success message
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to finalize setup');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        {testMode && (
          <div className="bg-yellow-100 border-b border-yellow-400 text-yellow-800 px-4 py-3 text-center">
            <strong>⚠️ TEST MODE ACTIVE:</strong> Payments and purchases will be skipped. This is for testing only.
          </div>
        )}
        {!testMode && <DashboardHeader />}
        
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white rounded-lg shadow p-6">
            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex justify-between mb-2">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
                  <div
                    key={step}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                      step < currentStep
                        ? 'bg-green-500 text-white'
                        : step === currentStep
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    } ${skippedSteps.has(step) ? 'ring-2 ring-yellow-400' : ''}`}
                    title={skippedSteps.has(step) ? 'Skipped' : ''}
                  >
                    {skippedSteps.has(step) ? '⏭' : step}
                  </div>
                ))}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">
                Step {currentStep} of {TOTAL_STEPS}
              </p>
            </div>

            {/* Step Content */}
            <div className="mb-8">
              {/* Step 1: Username and Password */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Account Credentials</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {business?.email ? 'Your account is already set up. You can skip this step.' : 'Set up your account email and password.'}
                  </p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.step1.email || business?.email || ''}
                      onChange={(e) => updateFormData('step1', 'email', e.target.value)}
                      disabled={!!business?.email}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100"
                      placeholder="your@email.com"
                    />
                  </div>
                  {!business?.email && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                        <input
                          type="password"
                          value={formData.step1.password}
                          onChange={(e) => updateFormData('step1', 'password', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="Enter password"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password</label>
                        <input
                          type="password"
                          value={formData.step1.confirmPassword}
                          onChange={(e) => updateFormData('step1', 'confirmPassword', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="Confirm password"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Business Information */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Business Information</h2>
                  <p className="text-sm text-gray-600 mb-4">Enter your business details</p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Name *</label>
                    <input
                      type="text"
                      value={formData.step2.name}
                      onChange={(e) => updateFormData('step2', 'name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="Your Business Name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Phone Number</label>
                    <input
                      type="tel"
                      value={formData.step2.phone}
                      onChange={(e) => updateFormData('step2', 'phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Email</label>
                    <input
                      type="email"
                      value={formData.step2.email}
                      onChange={(e) => updateFormData('step2', 'email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="business@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Website URL</label>
                    <input
                      type="url"
                      value={formData.step2.website}
                      onChange={(e) => updateFormData('step2', 'website', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Time Zone *</label>
                    <select
                      value={formData.step2.timezone}
                      onChange={(e) => updateFormData('step2', 'timezone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      required
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="America/Phoenix">Arizona Time</option>
                      <option value="America/Anchorage">Alaska Time</option>
                      <option value="Pacific/Honolulu">Hawaii Time</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3: Operational Hours and Holiday Hours */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Operational Hours</h2>
                  <p className="text-sm text-gray-600 mb-4">Set your business hours for each day of the week</p>
                  <div className="space-y-2">
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                      const dayHours = formData.step3.business_hours[day] || { closed: true, open: '09:00', close: '17:00' };
                      return (
                        <div key={day} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                          <div className="w-24 capitalize font-medium text-gray-700">{day}</div>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={!dayHours.closed}
                              onChange={(e) => {
                                const newHours = { ...formData.step3.business_hours };
                                newHours[day] = { ...newHours[day], closed: !e.target.checked };
                                updateFormData('step3', 'business_hours', newHours);
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm text-gray-700">Open</span>
                          </label>
                          {!dayHours.closed && (
                            <>
                              <TimeInput12Hour
                                value={dayHours.open || '09:00'}
                                onChange={(value) => {
                                  const newHours = { ...formData.step3.business_hours };
                                  newHours[day] = { ...newHours[day], open: value };
                                  updateFormData('step3', 'business_hours', newHours);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                              <span className="text-gray-600">to</span>
                              <TimeInput12Hour
                                value={dayHours.close || '17:00'}
                                onChange={(value) => {
                                  const newHours = { ...formData.step3.business_hours };
                                  newHours[day] = { ...newHours[day], close: value };
                                  updateFormData('step3', 'business_hours', newHours);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="mt-6">
                    <h3 className="text-xl font-bold mb-4 text-gray-900">Holiday Hours</h3>
                    <p className="text-sm text-gray-600 mb-4">Add dates when your business will be closed or have special hours</p>
                    <div className="space-y-3">
                      {formData.step3.holiday_hours.map((holiday, index) => (
                        <div key={index} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                          <input
                            type="date"
                            value={holiday.date || ''}
                            onChange={(e) => {
                              const newHolidays = [...formData.step3.holiday_hours];
                              newHolidays[index] = { ...newHolidays[index], date: e.target.value };
                              updateFormData('step3', 'holiday_hours', newHolidays);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          />
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={holiday.closed !== false}
                              onChange={(e) => {
                                const newHolidays = [...formData.step3.holiday_hours];
                                newHolidays[index] = { ...newHolidays[index], closed: e.target.checked };
                                updateFormData('step3', 'holiday_hours', newHolidays);
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm text-gray-700">Closed</span>
                          </label>
                          {holiday.closed === false && (
                            <>
                              <TimeInput12Hour
                                value={holiday.open || '09:00'}
                                onChange={(value) => {
                                  const newHolidays = [...formData.step3.holiday_hours];
                                  newHolidays[index] = { ...newHolidays[index], open: value };
                                  updateFormData('step3', 'holiday_hours', newHolidays);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                              <span className="text-gray-600">to</span>
                              <TimeInput12Hour
                                value={holiday.close || '17:00'}
                                onChange={(value) => {
                                  const newHolidays = [...formData.step3.holiday_hours];
                                  newHolidays[index] = { ...newHolidays[index], close: value };
                                  updateFormData('step3', 'holiday_hours', newHolidays);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                            </>
                          )}
                          <button
                            onClick={() => {
                              const newHolidays = formData.step3.holiday_hours.filter((_, i) => i !== index);
                              updateFormData('step3', 'holiday_hours', newHolidays);
                            }}
                            className="ml-auto text-red-600 text-sm hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newHolidays = [...formData.step3.holiday_hours, { date: '', closed: true }];
                          updateFormData('step3', 'holiday_hours', newHolidays);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                      >
                        + Add Holiday
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Notifications */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Notification Settings</h2>
                  <p className="text-sm text-gray-600 mb-4">Configure how you want to be notified about calls and messages</p>
                  
                  <div className="space-y-4">
                    <div className="border-b pb-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">Email Notifications</h3>
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.step4.email_ai_answered}
                            onChange={(e) => updateFormData('step4', 'email_ai_answered', e.target.checked)}
                            className="w-5 h-5 text-blue-600"
                          />
                          <span className="text-gray-700">Email when AI answers a call</span>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.step4.email_missed_calls}
                            onChange={(e) => updateFormData('step4', 'email_missed_calls', e.target.checked)}
                            className="w-5 h-5 text-blue-600"
                          />
                          <span className="text-gray-700">Email for missed calls</span>
                        </label>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Notification Email Address</label>
                          <input
                            type="email"
                            value={formData.step4.notification_email}
                            onChange={(e) => updateFormData('step4', 'notification_email', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                            placeholder="notifications@example.com"
                          />
                          <p className="text-xs text-gray-500 mt-1">Email address where notifications will be sent</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border-b pb-4">
                      <h3 className="text-lg font-semibold mb-3 text-gray-900">SMS Notifications</h3>
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.step4.sms_enabled}
                            onChange={(e) => updateFormData('step4', 'sms_enabled', e.target.checked)}
                            className="w-5 h-5 text-blue-600"
                          />
                          <span className="text-gray-700">Enable SMS notifications</span>
                        </label>
                        {formData.step4.sms_enabled && (
                          <>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">SMS Notification Phone Number</label>
                              <input
                                type="tel"
                                value={formData.step4.sms_notification_number}
                                onChange={(e) => updateFormData('step4', 'sms_notification_number', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                placeholder="+1 (555) 123-4567"
                              />
                              <p className="text-xs text-gray-500 mt-1">Phone number where SMS notifications will be sent</p>
                            </div>
                            <label className="flex items-center space-x-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.step4.sms_business_hours_enabled}
                                onChange={(e) => updateFormData('step4', 'sms_business_hours_enabled', e.target.checked)}
                                className="w-5 h-5 text-blue-600"
                              />
                              <span className="text-gray-700">Only send SMS during business hours</span>
                            </label>
                            {formData.step4.sms_business_hours_enabled && (
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">SMS Timezone</label>
                                  <select
                                    value={formData.step4.sms_timezone}
                                    onChange={(e) => updateFormData('step4', 'sms_timezone', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                  >
                                    <option value="America/New_York">Eastern Time (ET)</option>
                                    <option value="America/Chicago">Central Time (CT)</option>
                                    <option value="America/Denver">Mountain Time (MT)</option>
                                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time</label>
                                  <input
                                    type="time"
                                    value={formData.step4.sms_allowed_start_time}
                                    onChange={(e) => updateFormData('step4', 'sms_allowed_start_time', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Time</label>
                                  <input
                                    type="time"
                                    value={formData.step4.sms_allowed_end_time}
                                    onChange={(e) => updateFormData('step4', 'sms_allowed_end_time', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Package Selection and Payment */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Choose Your Package</h2>
                  <p className="text-sm text-gray-600 mb-4">Select a package that fits your needs</p>
                  {packages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No packages available at this time. Please contact support.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {packages.map((pkg) => {
                        const isOnSale = pkg.isOnSale && pkg.saleAvailable;
                        const saleBorderColor = isOnSale ? 'border-orange-500' : '';
                        const normalBorderColor = formData.step5.packageId === pkg.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300';
                        
                        return (
                          <div
                            key={pkg.id}
                            onClick={() => {
                              setSelectedPackage(pkg);
                              updateFormData('step5', 'packageId', pkg.id);
                            }}
                            className={`cursor-pointer p-6 border-2 rounded-lg transition-all relative ${
                              isOnSale ? saleBorderColor : normalBorderColor
                            } ${formData.step5.packageId === pkg.id && !isOnSale ? 'bg-blue-50' : ''}`}
                          >
                            {isOnSale && pkg.sale_name && (
                              <div className="absolute -top-3 left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                                {pkg.sale_name}
                              </div>
                            )}
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                            <div className="mb-2">
                              {isOnSale && pkg.sale_price ? (
                                <>
                                  <p className="text-2xl font-bold text-blue-600">
                                    ${(parseFloat(pkg.sale_price) || 0).toFixed(2)}/month
                                  </p>
                                  <p className="text-sm text-gray-400 line-through">
                                    ${(parseFloat(pkg.monthly_price) || 0).toFixed(2)}/month
                                  </p>
                                </>
                              ) : (
                                <p className="text-2xl font-bold text-blue-600">
                                  ${(parseFloat(pkg.monthly_price) || 0).toFixed(2)}/month
                                </p>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-4">{pkg.description}</p>
                            <div className="text-xs text-gray-500 space-y-1">
                              <div>
                                {pkg.minutes_included ? `${pkg.minutes_included} minutes included` : 'Unlimited minutes'}
                              </div>
                              {pkg.sms_included !== undefined && pkg.sms_included !== null && (
                                <div>
                                  {pkg.sms_included > 0 ? `${pkg.sms_included} SMS included` : 'No SMS included'}
                                </div>
                              )}
                            </div>
                            {isOnSale && pkg.sale_max_quantity && (
                              <div className="text-xs text-orange-600 font-semibold mt-2">
                                Limited Number
                              </div>
                            )}
                            {isOnSale && pkg.sale_duration_months && pkg.sale_name && (
                              <div className="text-xs text-orange-600 font-semibold mt-1">
                                "{pkg.sale_name}" special valid for {pkg.sale_duration_months} {pkg.sale_duration_months === 1 ? 'month' : 'months'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedPackage && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Selected:</strong> {selectedPackage.name} - {
                          (selectedPackage.isOnSale && selectedPackage.saleAvailable && selectedPackage.sale_price) 
                            ? `$${(parseFloat(selectedPackage.sale_price) || 0).toFixed(2)}/month`
                            : `$${(parseFloat(selectedPackage.monthly_price) || 0).toFixed(2)}/month`
                        }
                        <br />
                        You'll complete payment in the next step.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 6: Phone Number */}
              {currentStep === 6 && (
                <Step6PhoneNumber
                  business={business}
                  selectedPhoneNumber={selectedPhoneNumber}
                  setSelectedPhoneNumber={setSelectedPhoneNumber}
                  phoneNumberCountry={phoneNumberCountry}
                  updateFormData={updateFormData}
                  success={success}
                  warning={warning}
                  setBusiness={setBusiness}
                />
              )}

              {/* Step 7: Greetings */}
              {currentStep === 7 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">Greetings</h2>
                  <p className="text-sm text-gray-600 mb-4">Customize how your AI greets and ends calls</p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Opening Greeting *</label>
                    <textarea
                      value={formData.step7.opening_greeting}
                      onChange={(e) => updateFormData('step7', 'opening_greeting', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={4}
                      placeholder="Hello! Thank you for calling [Business Name]. How can I help you today?"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">This is what the AI says when answering the call</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Ending Greeting</label>
                    <textarea
                      value={formData.step7.ending_greeting}
                      onChange={(e) => updateFormData('step7', 'ending_greeting', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={4}
                      placeholder="Thank you for calling [Business Name]. Have a great day!"
                    />
                    <p className="mt-1 text-xs text-gray-500">This is what the AI says when ending the call</p>
                  </div>
                </div>
              )}

              {/* Step 8: FAQs */}
              {currentStep === 8 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">FAQs (Max 5)</h2>
                  <p className="text-sm text-gray-600 mb-4">Add up to 5 frequently asked questions that your AI can answer</p>
                  <div className="space-y-4">
                    {(formData.step8.faqs || []).map((faq, index) => (
                      <div key={index} className="border border-gray-300 p-4 rounded-lg bg-gray-50">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Question {index + 1}</label>
                        <input
                          type="text"
                          value={faq?.question || ''}
                          onChange={(e) => {
                            const newFaqs = [...(formData.step8.faqs || [])];
                            newFaqs[index] = { ...newFaqs[index], question: e.target.value };
                            updateFormData('step8', 'faqs', newFaqs);
                          }}
                          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="Enter the question"
                        />
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Answer</label>
                        <textarea
                          value={faq?.answer || ''}
                          onChange={(e) => {
                            const newFaqs = [...(formData.step8.faqs || [])];
                            newFaqs[index] = { ...newFaqs[index], answer: e.target.value };
                            updateFormData('step8', 'faqs', newFaqs);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          rows={3}
                          placeholder="Enter the answer"
                        />
                        <button
                          onClick={() => {
                            const newFaqs = (formData.step8.faqs || []).filter((_, i) => i !== index);
                            updateFormData('step8', 'faqs', newFaqs);
                          }}
                          className="mt-2 text-red-600 text-sm hover:text-red-700 font-medium"
                        >
                          Remove FAQ
                        </button>
                      </div>
                    ))}
                    {(formData.step8.faqs || []).length < 5 && (
                      <button
                        onClick={() => {
                          const newFaqs = [...(formData.step8.faqs || []), { question: '', answer: '' }];
                          updateFormData('step8', 'faqs', newFaqs);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                      >
                        + Add FAQ
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 9: AI Settings */}
              {currentStep === 9 && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900">AI Settings</h2>
                  <p className="text-sm text-gray-600 mb-4">Configure your AI agent behavior</p>
                  <div className="space-y-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step9.ai_enabled}
                        onChange={(e) => updateFormData('step9', 'ai_enabled', e.target.checked)}
                        className="w-5 h-5 text-blue-600"
                      />
                      <span className="text-gray-700 font-medium">Enable AI Agent</span>
                    </label>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Call Forward Rings</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.step9.call_forward_rings}
                        onChange={(e) => updateFormData('step9', 'call_forward_rings', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Number of rings before forwarding to AI</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">After Hours Behavior</label>
                      <select
                        value={formData.step9.after_hours_behavior}
                        onChange={(e) => updateFormData('step9', 'after_hours_behavior', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      >
                        <option value="take_message">Take Message</option>
                        <option value="voicemail">Voicemail</option>
                        <option value="forward">Forward Call</option>
                      </select>
                    </div>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step9.allow_call_transfer}
                        onChange={(e) => updateFormData('step9', 'allow_call_transfer', e.target.checked)}
                        className="w-5 h-5 text-blue-600"
                      />
                      <span className="text-gray-700 font-medium">Allow Call Transfer</span>
                    </label>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Max Call Duration (minutes)</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.step9.max_call_duration_minutes || ''}
                        onChange={(e) => updateFormData('step9', 'max_call_duration_minutes', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        placeholder="Leave empty for no limit"
                      />
                    </div>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step9.detect_conversation_end}
                        onChange={(e) => updateFormData('step9', 'detect_conversation_end', e.target.checked)}
                        className="w-5 h-5 text-blue-600"
                      />
                      <span className="text-gray-700 font-medium">Auto-detect Conversation End</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="mt-8 flex justify-between items-center border-t pt-4">
              <button
                onClick={handleBack}
                disabled={currentStep === 1 || saving}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Skip
                </button>
                {currentStep < TOTAL_STEPS ? (
                  <button
                    onClick={handleNext}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Next'}
                  </button>
                ) : (
                  <button
                    onClick={handleFinalize}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Finalizing...' : 'Complete Setup'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default function NewSetupWizard({ testMode = false }) {
  return (
    <Suspense fallback={
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    }>
      <SetupWizardContent testMode={testMode} />
    </Suspense>
  );
}

