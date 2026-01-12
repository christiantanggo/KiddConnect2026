'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { reviewsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, ArrowRight, Check, Loader } from 'lucide-react';

const TOTAL_STEPS = 8;

function ReviewsSetupWizard() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupStatus, setSetupStatus] = useState(null);
  const [existingData, setExistingData] = useState(null);
  const [formData, setFormData] = useState({
    step1: {},
    step2: {},
    step3: {},
    step4: {},
    step5: {},
    step6: {},
    step7: {},
    step8: {}
  });

  useEffect(() => {
    loadSetupStatus();
  }, []);

  // Initialize defaults when entering steps that have defaults
  useEffect(() => {
    // Step 4: Legal & Risk Guardrails
    if (currentStep === 4) {
      if (!formData.step4.legal_sensitivity) {
        updateFormData('step4', 'legal_sensitivity', 'medium');
      }
      if (!formData.step4.apology_behavior) {
        updateFormData('step4', 'apology_behavior', 'apologize');
      }
    }
    // Step 5: Review Reply Strategy
    if (currentStep === 5) {
      if (!formData.step5.default_reply_goal) {
        updateFormData('step5', 'default_reply_goal', 'professional');
      }
      if (formData.step5.auto_severity_detection === undefined) {
        updateFormData('step5', 'auto_severity_detection', true);
      }
      if (formData.step5.crisis_mode_auto_activation === undefined) {
        updateFormData('step5', 'crisis_mode_auto_activation', true);
      }
    }
    // Step 6: AI Customization - ensure at least one opening and closing
    if (currentStep === 6) {
      if (!formData.step6.reply_openings || formData.step6.reply_openings.length === 0) {
        updateFormData('step6', 'reply_openings', ['thank']);
      }
      if (!formData.step6.reply_closings || formData.step6.reply_closings.length === 0) {
        updateFormData('step6', 'reply_closings', ['contact_info']);
      }
      if (!formData.step6.apology_tone) {
        updateFormData('step6', 'apology_tone', 'apologetic');
      }
    }
    // Step 7: Review Reminders - Initialize defaults immediately when entering step
    if (currentStep === 7) {
      setFormData(prev => {
        const step7 = prev.step7 || {};
        const updates = {};
        
        if (step7.reminders_enabled === undefined || step7.reminders_enabled === null) {
          updates.reminders_enabled = false;
        }
        if (!step7.reminder_frequency) {
          updates.reminder_frequency = 'daily';
        }
        if (!step7.reminder_time) {
          updates.reminder_time = '09:00';
        }
        if (!step7.reminder_delivery || step7.reminder_delivery.length === 0) {
          updates.reminder_delivery = ['email'];
        }
        if (!step7.reminder_recipient) {
          updates.reminder_recipient = 'owner';
        }
        if (!step7.reminder_template) {
          updates.reminder_template = 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.';
        }
        
        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          return {
            ...prev,
            step7: {
              ...step7,
              ...updates
            }
          };
        }
        return prev;
      });
    }
  }, [currentStep]);

  // Initialize defaults when entering step 4
  useEffect(() => {
    if (currentStep === 4) {
      // Ensure defaults are set if not already initialized
      if (!formData.step4.legal_sensitivity) {
        updateFormData('step4', 'legal_sensitivity', 'medium');
      }
      if (!formData.step4.apology_behavior) {
        updateFormData('step4', 'apology_behavior', 'apologize');
      }
    }
  }, [currentStep]);

  const loadSetupStatus = async () => {
    try {
      setLoading(true);
      const response = await reviewsAPI.getSetupStatus();
      setSetupStatus(response.data.setup_status);
      setExistingData(response.data.existing_data);
      
      // Pre-fill form with existing data
      if (response.data.existing_data) {
        setFormData({
          step1: {
            business_name: response.data.existing_data.business_name || '',
            business_website: response.data.existing_data.business_website || ''
          },
          step2: {
            industry: response.data.existing_data.industry || '',
            contact_method: response.data.existing_data.contact_method || ''
          },
          step3: {
            default_tone: response.data.existing_data.default_tone || 'professional',
            tone_preferences: response.data.existing_data.tone_preferences || {},
            emoji_usage: response.data.existing_data.emoji_usage || 'none',
            sentence_length: response.data.existing_data.sentence_length || 'medium',
            perspective: response.data.existing_data.perspective || 'we',
            sign_off: response.data.existing_data.sign_off || 'none',
            custom_sign_off: response.data.existing_data.custom_sign_off || ''
          },
          step4: {
            legal_sensitivity: response.data.existing_data.legal_sensitivity || 'medium',
            forbidden_phrases: response.data.existing_data.forbidden_phrases || [],
            preferred_phrases: response.data.existing_data.preferred_phrases || [],
            apology_behavior: response.data.existing_data.apology_behavior || 'apologize'
          },
          step5: {
            default_reply_goal: response.data.existing_data.default_reply_goal || 'professional',
            auto_severity_detection: response.data.existing_data.auto_severity_detection !== false,
            crisis_mode_auto_activation: response.data.existing_data.crisis_mode_auto_activation !== false
          },
          step6: {
            reply_openings: response.data.existing_data.reply_openings || ['thank'],
            reply_closings: response.data.existing_data.reply_closings || ['contact_info'],
            apology_tone: response.data.existing_data.apology_tone || 'apologetic',
            legal_awareness_enabled: response.data.existing_data.legal_awareness_enabled !== false,
            jurisdiction: response.data.existing_data.jurisdiction || ''
          },
          step7: {
            reminders_enabled: response.data.existing_data.reminders_enabled !== false,
            reminder_frequency: response.data.existing_data.reminder_frequency || 'daily',
            reminder_day_of_week: response.data.existing_data.reminder_day_of_week || '',
            reminder_time: response.data.existing_data.reminder_time || '09:00',
            reminder_delivery: response.data.existing_data.reminder_delivery || ['email'],
            reminder_recipient: response.data.existing_data.reminder_recipient || 'owner',
            reminder_template: response.data.existing_data.reminder_template || 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.'
          },
          step8: {
            confirmation: false
          }
        });
        
        // Resume from saved step
        if (response.data.setup_status.current_step && response.data.setup_status.current_step <= TOTAL_STEPS) {
          setCurrentStep(response.data.setup_status.current_step);
        }
      }
    } catch (error) {
      console.error('Failed to load setup status:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load setup');
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    // Validate current step
    if (!validateStep(currentStep)) {
      showErrorToast('Please complete all required fields');
      return;
    }

    try {
      setSaving(true);
      
      // Save current step
      await reviewsAPI.saveSetupStep(currentStep, formData[`step${currentStep}`]);
      
      // If this is the last step, complete setup
      if (currentStep === TOTAL_STEPS) {
        await reviewsAPI.completeSetup();
        success('Setup complete! You can now use Tavari AI Review Reply.');
        router.push('/review-reply-ai/dashboard');
      } else {
        // Move to next step
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error('Failed to save step:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error message:', error.response?.data?.message || error.message);
      console.error('Error details:', error.response?.data?.details);
      const errorInfo = handleAPIError(error);
      const errorMessage = error.response?.data?.message || errorInfo.message || 'Failed to save step';
      showErrorToast(errorMessage);
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    // Skip to next step (save empty data)
    try {
      setSaving(true);
      await reviewsAPI.saveSetupStep(currentStep, {});
      if (currentStep < TOTAL_STEPS) {
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error('Failed to skip step:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to skip step');
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setSaving(false);
    }
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        // Step 1: Business Information - requires business name
        return formData.step1.business_name && formData.step1.business_name.trim().length > 0;
      case 2:
        // Step 2: Industry & Social Media - all optional
        return true;
      case 3:
        // Step 3: Default Tone & Style Preferences - requires default_tone
        return formData.step3.default_tone;
      case 4:
        // Step 4: Legal & Risk Guardrails - all fields have defaults
        return true;
      case 5:
        // Step 5: Review Reply Strategy - all fields have defaults
        return true;
      case 6:
        // Step 6: AI Customization - requires at least one opening and one closing option, plus apology_tone
        const hasOpening = formData.step6.reply_openings?.length > 0;
        const hasClosing = formData.step6.reply_closings?.length > 0;
        return hasOpening && hasClosing && formData.step6.apology_tone;
      case 7:
        // Step 7: Review Reminders - all optional (reminders can be disabled)
        return true;
      case 8:
        // Step 8: Confirmation - requires confirmation checkbox
        return formData.step8.confirmation === true;
      default:
        return true;
    }
  };

  const updateFormData = (step, field, value) => {
    setFormData(prev => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: value
      }
    }));
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell showSidebar={false}>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  // If setup is already complete, redirect to dashboard
  if (setupStatus?.is_complete) {
    router.push('/modules/reviews/dashboard');
    return null;
  }

  return (
    <AuthGuard>
      <V2AppShell showSidebar={false}>
        <div 
          style={{ 
            maxWidth: '800px', 
            margin: '0 auto',
            padding: 'calc(var(--padding-base) * 2) var(--padding-base)',
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          {/* Header */}
          <div className="mb-8">
            <Link 
              href="/dashboard"
              className="text-sm mb-4 inline-block flex items-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Modules
            </Link>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
              Set Up Tavari AI Review Reply
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              We'll guide you through a quick setup. This only takes 2 minutes.
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[...Array(TOTAL_STEPS)].map((_, index) => {
                const stepNum = index + 1;
                // A step is only "completed" if it's before the current step
                // This removes green checkmarks when going backward
                const isCompleted = stepNum < currentStep;
                const isCurrent = currentStep === stepNum;
                
                return (
                  <div key={stepNum} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isCurrent
                            ? 'bg-blue-600 text-white'
                            : isCompleted
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {isCompleted && !isCurrent ? <Check className="w-5 h-5" /> : stepNum}
                      </div>
                    </div>
                    {stepNum < TOTAL_STEPS && (
                      <div
                        className={`h-1 flex-1 mx-2 ${
                          // Connector is green only if this step is completed (before current step)
                          stepNum < currentStep ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              Step {currentStep} of {TOTAL_STEPS}
            </p>
          </div>

          {/* Step Content */}
          <div 
            className="bg-white rounded-lg shadow-lg p-8 mb-6"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Business Information
                </h2>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.step1.business_name || ''}
                    onChange={(e) => updateFormData('step1', 'business_name', e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder={existingData?.business_name || 'Your Business Name'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Business Website (Optional)
                  </label>
                  <input
                    type="url"
                    value={formData.step1.business_website || ''}
                    onChange={(e) => updateFormData('step1', 'business_website', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder={existingData?.business_website || 'https://example.com'}
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Industry & Social Media
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Help us understand your business better by providing your industry and social media links. 
                  Our AI will analyze these to write more accurate, business-specific responses.
                </p>

                {/* Show website from Step 1 (read-only) */}
                {formData.step1.business_website && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                      Business Website (from Step 1):
                    </p>
                    <p className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                      {formData.step1.business_website}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      We'll analyze this website to understand your business, products, and services for better AI responses.
                    </p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Industry (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.step2.industry || ''}
                    onChange={(e) => updateFormData('step2', 'industry', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder={existingData?.industry || 'e.g., Restaurant, Retail, Services'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Social Media URLs (Optional)
                  </label>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                    Providing social media links helps the AI understand your brand voice and communication style.
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Facebook
                      </label>
                      <input
                        type="url"
                        value={formData.step2.facebook_url || ''}
                        onChange={(e) => updateFormData('step2', 'facebook_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://facebook.com/yourbusiness"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Instagram
                      </label>
                      <input
                        type="url"
                        value={formData.step2.instagram_url || ''}
                        onChange={(e) => updateFormData('step2', 'instagram_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://instagram.com/yourbusiness"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        TikTok
                      </label>
                      <input
                        type="url"
                        value={formData.step2.tiktok_url || ''}
                        onChange={(e) => updateFormData('step2', 'tiktok_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://tiktok.com/@yourbusiness"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Contact Method (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.step2.contact_method || ''}
                    onChange={(e) => updateFormData('step2', 'contact_method', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder={existingData?.contact_method || 'Email or phone number'}
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Default Tone & Style Preferences
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Choose the default tone for generated review replies. You can override this for individual reviews.
                </p>
                
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Default Tone <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.step3.default_tone || 'professional'}
                    onChange={(e) => updateFormData('step3', 'default_tone', e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 mb-3"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    <option value="calm">Calm</option>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="firm">Firm</option>
                  </select>
                  
                  {/* Tone Examples */}
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>
                      Tone Examples (for a 3-star review):
                    </p>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-semibold">Calm: </span>
                        <span style={{ color: 'var(--color-text-main)' }}>
                          "Thank you for your feedback. We appreciate you taking the time to share your experience..."
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Friendly: </span>
                        <span style={{ color: 'var(--color-text-main)' }}>
                          "Hey! Thanks so much for your review. We're sorry things didn't meet your expectations..."
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Professional: </span>
                        <span style={{ color: 'var(--color-text-main)' }}>
                          "Thank you for your review. We take all feedback seriously and would like to address your concerns..."
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Firm: </span>
                        <span style={{ color: 'var(--color-text-main)' }}>
                          "Thank you for your feedback. We understand your concerns and take this matter seriously..."
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tone Preference Examples */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                    Which style feels more like your brand? (Optional)
                  </label>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                    Select the example responses that best match how you'd want to reply. This helps train the AI to your preference.
                  </p>
                  
                  <div className="space-y-3">
                    {/* Example 1 */}
                    <div className="p-3 border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                        Example: Customer complains about slow service
                      </p>
                      <div className="space-y-2">
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="radio"
                            name="tone_example_1"
                            value="a"
                            checked={formData.step3.tone_preferences?.example_1 === 'a'}
                            onChange={(e) => {
                              const prefs = formData.step3.tone_preferences || {};
                              updateFormData('step3', 'tone_preferences', { ...prefs, example_1: 'a' });
                            }}
                            className="mt-1 mr-2"
                          />
                          <div className="flex-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>Option A:</span>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-main)' }}>
                              "Thank you for your feedback. We sincerely apologize for the wait time you experienced. 
                              We're working to improve our service speed and would appreciate another opportunity to serve you better."
                            </p>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="radio"
                            name="tone_example_1"
                            value="b"
                            checked={formData.step3.tone_preferences?.example_1 === 'b'}
                            onChange={(e) => {
                              const prefs = formData.step3.tone_preferences || {};
                              updateFormData('step3', 'tone_preferences', { ...prefs, example_1: 'b' });
                            }}
                            className="mt-1 mr-2"
                          />
                          <div className="flex-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>Option B:</span>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-main)' }}>
                              "Thanks for the review! We're sorry to hear about the wait. We've been training new staff 
                              and improving our processes. We'd love to make it right next time - please reach out directly!"
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Example 2 */}
                    <div className="p-3 border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                        Example: Customer gives 5 stars but mentions a small issue
                      </p>
                      <div className="space-y-2">
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="radio"
                            name="tone_example_2"
                            value="a"
                            checked={formData.step3.tone_preferences?.example_2 === 'a'}
                            onChange={(e) => {
                              const prefs = formData.step3.tone_preferences || {};
                              updateFormData('step3', 'tone_preferences', { ...prefs, example_2: 'a' });
                            }}
                            className="mt-1 mr-2"
                          />
                          <div className="flex-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>Option A:</span>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-main)' }}>
                              "Thank you so much for the 5-star review! We're thrilled you enjoyed your experience. 
                              We've noted your feedback about [issue] and will address it. We look forward to serving you again!"
                            </p>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="radio"
                            name="tone_example_2"
                            value="b"
                            checked={formData.step3.tone_preferences?.example_2 === 'b'}
                            onChange={(e) => {
                              const prefs = formData.step3.tone_preferences || {};
                              updateFormData('step3', 'tone_preferences', { ...prefs, example_2: 'b' });
                            }}
                            className="mt-1 mr-2"
                          />
                          <div className="flex-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-main)' }}>Option B:</span>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-main)' }}>
                              "Awesome! Thanks for the great review. We really appreciate it. 
                              We've already talked to the team about [issue] - thanks for letting us know. Come back soon!"
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                    Your selections will help the AI learn your communication style. This is optional but recommended.
                  </p>
                </div>

                {/* Brand Voice Profile */}
                <div className="border-t pt-6 mt-6" style={{ borderColor: 'var(--color-border)' }}>
                  <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                    Brand Voice Profile
                  </h3>

                  {/* Emoji Usage */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Emoji Usage Preference
                    </label>
                    <select
                      value={formData.step3.emoji_usage || 'none'}
                      onChange={(e) => updateFormData('step3', 'emoji_usage', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <option value="none">None</option>
                      <option value="light">Light (sparingly, 0-1 per response)</option>
                      <option value="moderate">Moderate (1-2 per response)</option>
                    </select>
                  </div>

                  {/* Sentence Length Preference */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Sentence Length Preference
                    </label>
                    <select
                      value={formData.step3.sentence_length || 'medium'}
                      onChange={(e) => updateFormData('step3', 'sentence_length', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </div>

                  {/* Perspective Preference */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Perspective Preference
                    </label>
                    <select
                      value={formData.step3.perspective || 'we'}
                      onChange={(e) => updateFormData('step3', 'perspective', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <option value="we">"We" (team perspective)</option>
                      <option value="I">"I" (personal perspective)</option>
                    </select>
                  </div>

                  {/* Sign-off Options */}
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Sign-off Options
                    </label>
                    <select
                      value={formData.step3.sign_off || 'none'}
                      onChange={(e) => {
                        updateFormData('step3', 'sign_off', e.target.value);
                        if (e.target.value !== 'custom') {
                          updateFormData('step3', 'custom_sign_off', '');
                        }
                      }}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 mb-2"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <option value="none">None</option>
                      <option value="business_team">"— The [Business Name] Team"</option>
                      <option value="custom">Custom text</option>
                    </select>
                    {formData.step3.sign_off === 'custom' && (
                      <input
                        type="text"
                        value={formData.step3.custom_sign_off || ''}
                        onChange={(e) => updateFormData('step3', 'custom_sign_off', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 mt-2"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="e.g., — Best, The Team"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Legal & Risk Guardrails
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Configure legal protections and risk management for your review responses.
                </p>

                {/* Legal Sensitivity */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Legal Sensitivity Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.step4.legal_sensitivity || 'medium'}
                    onChange={(e) => {
                      updateFormData('step4', 'legal_sensitivity', e.target.value);
                    }}
                    onFocus={() => {
                      // Ensure default is set if not already
                      if (!formData.step4.legal_sensitivity) {
                        updateFormData('step4', 'legal_sensitivity', 'medium');
                      }
                      if (!formData.step4.apology_behavior) {
                        updateFormData('step4', 'apology_behavior', 'apologize');
                      }
                    }}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    High sensitivity: Extra caution with legal language. Low: Standard business language.
                  </p>
                </div>

                {/* Forbidden Phrases */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Forbidden Phrases (One per line)
                  </label>
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Phrases the AI should NEVER use in responses (e.g., "refund", "fault", "we messed up")
                  </p>
                  <textarea
                    value={Array.isArray(formData.step4.forbidden_phrases) 
                      ? formData.step4.forbidden_phrases.join('\n')
                      : (formData.step4.forbidden_phrases || '')}
                    onChange={(e) => {
                      const phrases = e.target.value.split('\n').filter(p => p.trim());
                      updateFormData('step4', 'forbidden_phrases', phrases);
                    }}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder="refund&#10;fault&#10;we messed up&#10;we're wrong"
                  />
                </div>

                {/* Preferred Phrases */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Preferred Phrases (One per line)
                  </label>
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Phrases the AI should use when appropriate (e.g., "we take feedback seriously")
                  </p>
                  <textarea
                    value={Array.isArray(formData.step4.preferred_phrases) 
                      ? formData.step4.preferred_phrases.join('\n')
                      : (formData.step4.preferred_phrases || '')}
                    onChange={(e) => {
                      const phrases = e.target.value.split('\n').filter(p => p.trim());
                      updateFormData('step4', 'preferred_phrases', phrases);
                    }}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder="we take feedback seriously&#10;thank you for bringing this to our attention"
                  />
                </div>

                {/* Apology Behavior Default */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                    Default Apology Behavior <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="apology_behavior"
                        value="apologize"
                        checked={formData.step4.apology_behavior === 'apologize' || !formData.step4.apology_behavior}
                        onChange={(e) => updateFormData('step4', 'apology_behavior', 'apologize')}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        <strong>Apologize:</strong> Use apologetic language ("We sincerely apologize")
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="apology_behavior"
                        value="neutral"
                        checked={formData.step4.apology_behavior === 'neutral'}
                        onChange={(e) => updateFormData('step4', 'apology_behavior', 'neutral')}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        <strong>Neutral Acknowledgment:</strong> Acknowledge without apologizing
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="apology_behavior"
                        value="non_committal"
                        checked={formData.step4.apology_behavior === 'non_committal'}
                        onChange={(e) => updateFormData('step4', 'apology_behavior', 'non_committal')}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        <strong>Non-Committal:</strong> Generic response, avoid specific commitments
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Review Reply Strategy
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Configure default strategies and automatic detection features for review responses.
                </p>

                {/* Default Reply Goal */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Default Reply Goal <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.step5.default_reply_goal || 'professional'}
                    onChange={(e) => updateFormData('step5', 'default_reply_goal', e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    <option value="de_escalate">De-escalate</option>
                    <option value="encourage_return">Encourage return</option>
                    <option value="professional">Professional public image</option>
                    <option value="redirect_offline">Redirect offline</option>
                  </select>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Primary objective for most review responses
                  </p>
                </div>

                {/* Auto Severity Detection */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoSeverity"
                    checked={formData.step5.auto_severity_detection !== false}
                    onChange={(e) => updateFormData('step5', 'auto_severity_detection', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="autoSeverity" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                    Enable auto severity detection (ON by default)
                  </label>
                </div>
                <p className="text-xs ml-6 mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Automatically detect review severity and adjust response tone accordingly
                </p>

                {/* Crisis Mode Auto-Activation */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="crisisMode"
                    checked={formData.step5.crisis_mode_auto_activation !== false}
                    onChange={(e) => updateFormData('step5', 'crisis_mode_auto_activation', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="crisisMode" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                    Enable crisis mode auto-activation (ON by default)
                  </label>
                </div>
                <p className="text-xs ml-6" style={{ color: 'var(--color-text-muted)' }}>
                  Automatically activate crisis handling for high-risk reviews (legal concerns, safety issues, threats)
                </p>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  AI Customization & Style
                </h2>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
                  Customize how the AI writes review replies to match your business style and legal requirements.
                </p>

                {/* Reply Opening Options */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                    How should replies start? <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_openings?.includes('thank') || false}
                        onChange={(e) => {
                          const openings = formData.step6.reply_openings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_openings', [...openings, 'thank']);
                          } else {
                            updateFormData('step6', 'reply_openings', openings.filter(o => o !== 'thank'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Start with "Thank you" (for all reviews)
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_openings?.includes('business_name') || false}
                        onChange={(e) => {
                          const openings = formData.step6.reply_openings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_openings', [...openings, 'business_name']);
                          } else {
                            updateFormData('step6', 'reply_openings', openings.filter(o => o !== 'business_name'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Include business name in opening
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_openings?.includes('customer_name') || false}
                        onChange={(e) => {
                          const openings = formData.step6.reply_openings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_openings', [...openings, 'customer_name']);
                          } else {
                            updateFormData('step6', 'reply_openings', openings.filter(o => o !== 'customer_name'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Personalize with customer name (when available)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Reply Closing Options */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                    How should replies end? <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_closings?.includes('contact_info') || false}
                        onChange={(e) => {
                          const closings = formData.step6.reply_closings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_closings', [...closings, 'contact_info']);
                          } else {
                            updateFormData('step6', 'reply_closings', closings.filter(c => c !== 'contact_info'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Include contact information
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_closings?.includes('invite_back') || false}
                        onChange={(e) => {
                          const closings = formData.step6.reply_closings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_closings', [...closings, 'invite_back']);
                          } else {
                            updateFormData('step6', 'reply_closings', closings.filter(c => c !== 'invite_back'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Invite customer to return ("We hope to serve you again")
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.step6.reply_closings?.includes('business_name') || false}
                        onChange={(e) => {
                          const closings = formData.step6.reply_closings || [];
                          if (e.target.checked) {
                            updateFormData('step6', 'reply_closings', [...closings, 'business_name']);
                          } else {
                            updateFormData('step6', 'reply_closings', closings.filter(c => c !== 'business_name'));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Sign with business name
                      </span>
                    </label>
                  </div>
                </div>

                {/* Apology Tone */}
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                    Apology Style for Negative Reviews <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="apology_tone"
                        value="apologetic"
                        checked={formData.step6.apology_tone === 'apologetic' || !formData.step6.apology_tone}
                        onChange={(e) => updateFormData('step6', 'apology_tone', 'apologetic')}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        <strong>Apologetic:</strong> "We sincerely apologize for your experience" (admits responsibility)
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="apology_tone"
                        value="non_admitting"
                        checked={formData.step6.apology_tone === 'non_admitting'}
                        onChange={(e) => updateFormData('step6', 'apology_tone', 'non_admitting')}
                        className="mr-2"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        <strong>Non-Admitting:</strong> "Sorry for the experience that you have described" (acknowledges without admitting fault)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Legal Awareness */}
                <div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step6.legal_awareness_enabled !== false}
                      onChange={(e) => updateFormData('step6', 'legal_awareness_enabled', e.target.checked)}
                      className="mr-2"
                    />
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                        Enable legal/jurisdiction awareness
                      </span>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        AI will be mindful of legal implications and avoid language that could create liability. 
                        Particularly important for regulated industries or businesses in multiple jurisdictions.
                      </p>
                    </div>
                  </label>
                </div>

                {formData.step6.legal_awareness_enabled !== false && (
                  <div className="ml-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Business Jurisdiction/Region (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.step6.jurisdiction || ''}
                      onChange={(e) => updateFormData('step6', 'jurisdiction', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'white',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-main)',
                        borderRadius: 'var(--button-radius)',
                      }}
                      placeholder="e.g., United States, California, EU, etc."
                    />
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                      Specify regions/jurisdictions where your business operates to ensure compliance with local laws.
                    </p>
                  </div>
                )}
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Review Reminders
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Set up automatic reminders for unresponded reviews to help you stay on top of customer feedback.
                </p>

                {/* Enable Reminders */}
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="enableReminders"
                    checked={formData.step7?.reminders_enabled === true}
                    onChange={(e) => updateFormData('step7', 'reminders_enabled', e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="enableReminders" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                    Enable review reminders
                  </label>
                  <p className="text-xs ml-4" style={{ color: 'var(--color-text-muted)' }}>
                    (Optional - You can configure this later in settings)
                  </p>
                </div>

                {formData.step7?.reminders_enabled === true && (
                  <div className="ml-6 space-y-4 p-4 bg-gray-50 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                    {/* Frequency */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Reminder Frequency
                      </label>
                      <select
                        value={formData.step7?.reminder_frequency || 'daily'}
                        onChange={(e) => {
                          updateFormData('step7', 'reminder_frequency', e.target.value);
                          if (e.target.value === 'daily') {
                            updateFormData('step7', 'reminder_day_of_week', '');
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>

                    {/* Day of Week (if weekly) */}
                    {formData.step7.reminder_frequency === 'weekly' && (
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                          Day of Week
                        </label>
                        <select
                          value={formData.step7?.reminder_day_of_week || 'monday'}
                          onChange={(e) => updateFormData('step7', 'reminder_day_of_week', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                          style={{
                            backgroundColor: 'white',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-main)',
                            borderRadius: 'var(--button-radius)',
                          }}
                        >
                          <option value="monday">Monday</option>
                          <option value="tuesday">Tuesday</option>
                          <option value="wednesday">Wednesday</option>
                          <option value="thursday">Thursday</option>
                          <option value="friday">Friday</option>
                          <option value="saturday">Saturday</option>
                          <option value="sunday">Sunday</option>
                        </select>
                      </div>
                    )}

                    {/* Time of Day */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Time of Day
                      </label>
                      <input
                        type="time"
                        value={formData.step7?.reminder_time || '09:00'}
                        onChange={(e) => updateFormData('step7', 'reminder_time', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      />
                    </div>

                    {/* Delivery Method */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Delivery Method
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.step7?.reminder_delivery?.includes('email') || false}
                            onChange={(e) => {
                              const delivery = formData.step7?.reminder_delivery || [];
                              if (e.target.checked) {
                                updateFormData('step7', 'reminder_delivery', [...delivery, 'email']);
                              } else {
                                updateFormData('step7', 'reminder_delivery', delivery.filter(d => d !== 'email'));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>Email</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.step7?.reminder_delivery?.includes('sms') || false}
                            onChange={(e) => {
                              const delivery = formData.step7?.reminder_delivery || [];
                              if (e.target.checked) {
                                updateFormData('step7', 'reminder_delivery', [...delivery, 'sms']);
                              } else {
                                updateFormData('step7', 'reminder_delivery', delivery.filter(d => d !== 'sms'));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>SMS</span>
                        </label>
                      </div>
                    </div>

                    {/* Reminder Recipient */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Reminder Recipient
                      </label>
                      <select
                        value={formData.step7?.reminder_recipient || 'owner'}
                        onChange={(e) => updateFormData('step7', 'reminder_recipient', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="owner">Owner</option>
                        <option value="selected_users">Selected users (configure later in settings)</option>
                      </select>
                    </div>

                    {/* Reminder Message Template */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Reminder Message Template
                      </label>
                      <textarea
                        value={formData.step7?.reminder_template || 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.'}
                        onChange={(e) => updateFormData('step7', 'reminder_template', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="Reminder message template. Use {count} for number of unresponded reviews."
                      />
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Use {'{count}'} as a placeholder for the number of unresponded reviews
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 8 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Confirmation
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Please review your settings and confirm to complete setup.
                </p>
                <div className="space-y-3 text-sm" style={{ color: 'var(--color-text-main)' }}>
                  <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-semibold mb-2">Business Information</h3>
                    <p><strong>Business Name:</strong> {formData.step1.business_name || 'N/A'}</p>
                    {formData.step1.business_website && (
                      <p><strong>Website:</strong> {formData.step1.business_website}</p>
                    )}
                    {formData.step2.industry && (
                      <p><strong>Industry:</strong> {formData.step2.industry}</p>
                    )}
                    {(formData.step2.facebook_url || formData.step2.instagram_url || formData.step2.tiktok_url) && (
                      <p><strong>Social Media:</strong> {
                        [formData.step2.facebook_url && 'Facebook', formData.step2.instagram_url && 'Instagram', formData.step2.tiktok_url && 'TikTok'].filter(Boolean).join(', ')
                      }</p>
                    )}
                  </div>

                  <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-semibold mb-2">Brand Voice</h3>
                    <p><strong>Default Tone:</strong> {formData.step3.default_tone || 'Professional'}</p>
                    {formData.step3.emoji_usage && (
                      <p><strong>Emoji Usage:</strong> {formData.step3.emoji_usage}</p>
                    )}
                    {formData.step3.perspective && (
                      <p><strong>Perspective:</strong> {formData.step3.perspective === 'I' ? '"I" (personal)' : '"We" (team)'}</p>
                    )}
                    {formData.step3.sign_off && formData.step3.sign_off !== 'none' && (
                      <p><strong>Sign-off:</strong> {
                        formData.step3.sign_off === 'business_team' ? 'Business Team' :
                        formData.step3.sign_off === 'custom' ? formData.step3.custom_sign_off : 'None'
                      }</p>
                    )}
                  </div>

                  <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-semibold mb-2">Legal & Risk</h3>
                    <p><strong>Legal Sensitivity:</strong> {formData.step4.legal_sensitivity || 'Medium'}</p>
                    {formData.step4.forbidden_phrases && formData.step4.forbidden_phrases.length > 0 && (
                      <p><strong>Forbidden Phrases:</strong> {Array.isArray(formData.step4.forbidden_phrases) ? formData.step4.forbidden_phrases.length : 0} configured</p>
                    )}
                    <p><strong>Apology Behavior:</strong> {formData.step4.apology_behavior || 'Apologize'}</p>
                  </div>

                  <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-semibold mb-2">Reply Strategy</h3>
                    <p><strong>Default Goal:</strong> {formData.step5.default_reply_goal || 'Professional'}</p>
                    <p><strong>Auto Severity Detection:</strong> {formData.step5.auto_severity_detection !== false ? 'Enabled' : 'Disabled'}</p>
                    <p><strong>Crisis Mode:</strong> {formData.step5.crisis_mode_auto_activation !== false ? 'Enabled' : 'Disabled'}</p>
                  </div>

                  <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-semibold mb-2">AI Customization</h3>
                    {formData.step6.reply_openings?.length > 0 && (
                      <p><strong>Reply Openings:</strong> {formData.step6.reply_openings.join(', ')}</p>
                    )}
                    {formData.step6.reply_closings?.length > 0 && (
                      <p><strong>Reply Closings:</strong> {formData.step6.reply_closings.join(', ')}</p>
                    )}
                    <p><strong>Apology Style:</strong> {formData.step6.apology_tone === 'non_admitting' ? 'Non-Admitting' : 'Apologetic'}</p>
                    {formData.step6.legal_awareness_enabled !== false && (
                      <p><strong>Legal Awareness:</strong> Enabled{formData.step6.jurisdiction ? ` (${formData.step6.jurisdiction})` : ''}</p>
                    )}
                  </div>

                  {formData.step7.reminders_enabled !== false && (
                    <div className="p-3 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                      <h3 className="font-semibold mb-2">Review Reminders</h3>
                      <p><strong>Frequency:</strong> {formData.step7.reminder_frequency || 'Daily'}</p>
                      {formData.step7.reminder_frequency === 'weekly' && formData.step7.reminder_day_of_week && (
                        <p><strong>Day:</strong> {formData.step7.reminder_day_of_week}</p>
                      )}
                      {formData.step7.reminder_time && (
                        <p><strong>Time:</strong> {formData.step7.reminder_time}</p>
                      )}
                      {formData.step7.reminder_delivery?.length > 0 && (
                        <p><strong>Delivery:</strong> {formData.step7.reminder_delivery.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center mt-6">
                  <input
                    type="checkbox"
                    id="confirmation"
                    checked={formData.step8?.confirmation === true}
                    onChange={(e) => updateFormData('step8', 'confirmation', e.target.checked)}
                    className="mr-2"
                    required
                  />
                  <label htmlFor="confirmation" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                    I confirm the above information is correct <span className="text-red-500">*</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 1 || saving}
              className="px-6 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-main)',
                borderRadius: 'var(--button-radius)'
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>

            <div className="flex gap-2">
              {/* Skip button (if step is optional) */}
              {currentStep === 2 && (
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="px-6 py-2 border rounded-md disabled:opacity-50"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-muted)',
                    borderRadius: 'var(--button-radius)'
                  }}
                >
                  Skip
                </button>
              )}

              <button
                onClick={handleNext}
                disabled={!validateStep(currentStep) || saving}
                className="px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'white',
                  borderRadius: 'var(--button-radius)'
                }}
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : currentStep === TOTAL_STEPS ? (
                  'Complete Setup'
                ) : (
                  <>
                    Next <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default ReviewsSetupWizard;

