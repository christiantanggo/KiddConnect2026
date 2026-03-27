'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { reviewsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Save, ChevronDown, ChevronUp } from 'lucide-react';

export default function ReviewsSettings() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    business: true,
    industry: false,
    tone: true,
    legal: false,
    strategy: false,
    customization: false,
    reminders: false
  });
  const [settings, setSettings] = useState({
    // Step 1: Business Information
    business_name: '',
    business_website: '',
    // Step 2: Industry & Social Media
    industry: '',
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
    contact_method: '',
    // Step 3: Default Tone & Style
    default_tone: 'professional',
    tone_preferences: {},
    emoji_usage: 'none',
    default_length: 'medium',
    perspective: 'we',
    sign_off: 'none',
    custom_sign_off: '',
    // Step 4: Legal & Risk Guardrails
    legal_sensitivity: 'medium',
    forbidden_phrases: [],
    preferred_phrases: [],
    apology_behavior: 'apologize',
    // Step 5: Review Reply Strategy
    default_reply_goal: 'professional',
    auto_severity_detection: true,
    crisis_mode_auto_activation: true,
    // Step 6: AI Customization
    reply_openings: ['thank'],
    reply_closings: ['contact_info'],
    apology_tone: 'apologetic',
    legal_awareness_enabled: false,
    jurisdiction: '',
    // Step 7: Review Reminders
    reminders_enabled: false,
    reminder_frequency: 'daily',
    reminder_day_of_week: '',
    reminder_time: '09:00',
    reminder_delivery: ['email'],
    reminder_recipient: 'owner',
    reminder_template: 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.',
    // Legacy/Additional settings
    include_resolution_by_default: true,
    risk_detection_enabled: true
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await reviewsAPI.getSettings();
      if (res.data?.settings) {
        const s = res.data.settings;
        setSettings({
          business_name: s.business_name || '',
          business_website: s.business_website || '',
          industry: s.industry || '',
          facebook_url: s.facebook_url || '',
          instagram_url: s.instagram_url || '',
          tiktok_url: s.tiktok_url || '',
          contact_method: s.contact_method || '',
          default_tone: s.default_tone || 'professional',
          tone_preferences: s.tone_preferences || {},
          emoji_usage: s.emoji_usage || 'none',
          default_length: s.default_length || 'medium',
          perspective: s.perspective || 'we',
          sign_off: s.sign_off || 'none',
          custom_sign_off: s.custom_sign_off || '',
          legal_sensitivity: s.legal_sensitivity || 'medium',
          forbidden_phrases: Array.isArray(s.forbidden_phrases) ? s.forbidden_phrases : [],
          preferred_phrases: Array.isArray(s.preferred_phrases) ? s.preferred_phrases : [],
          apology_behavior: s.apology_behavior || 'apologize',
          default_reply_goal: s.default_reply_goal || 'professional',
          auto_severity_detection: s.auto_severity_detection !== false,
          crisis_mode_auto_activation: s.crisis_mode_auto_activation !== false,
          reply_openings: Array.isArray(s.reply_openings) ? s.reply_openings : ['thank'],
          reply_closings: Array.isArray(s.reply_closings) ? s.reply_closings : ['contact_info'],
          apology_tone: s.apology_tone || 'apologetic',
          legal_awareness_enabled: s.legal_awareness_enabled === true,
          jurisdiction: s.jurisdiction || '',
          reminders_enabled: s.reminders_enabled === true,
          reminder_frequency: s.reminder_frequency || 'daily',
          reminder_day_of_week: s.reminder_day_of_week || '',
          reminder_time: s.reminder_time || '09:00',
          reminder_delivery: Array.isArray(s.reminder_delivery) ? s.reminder_delivery : ['email'],
          reminder_recipient: s.reminder_recipient || 'owner',
          reminder_template: s.reminder_template || 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.',
          include_resolution_by_default: s.include_resolution_by_default !== false,
          risk_detection_enabled: s.risk_detection_enabled !== false
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      const errorInfo = handleAPIError(error);
      if (errorInfo.code === 'TERMS_NOT_ACCEPTED') {
        router.push('/accept-terms');
        return;
      }
      showErrorToast(errorInfo.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await reviewsAPI.updateSettings(settings);
      success('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayItem = (key, value) => {
    setSettings(prev => {
      const arr = prev[key] || [];
      const index = arr.indexOf(value);
      if (index > -1) {
        return { ...prev, [key]: arr.filter(item => item !== value) };
      } else {
        return { ...prev, [key]: [...arr, value] };
      }
    });
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="animate-spin" size={24} style={{ color: 'var(--color-accent)' }} />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ padding: 'var(--spacing-lg)', maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <Link
              href="/review-reply-ai/dashboard"
              className="inline-flex items-center gap-2 mb-4"
              style={{ color: 'var(--color-text-main)' }}
            >
              <ArrowLeft size={20} />
              <span>Back to Dashboard</span>
            </Link>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', color: 'var(--color-text-main)' }}>
              Reviews Module Settings
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--spacing-sm)' }}>
              Configure all settings for review reply generation. These settings were initially set during the setup wizard.
            </p>
          </div>

          <form onSubmit={handleSave}>
            <div className="space-y-4">
              {/* Section 1: Business Information */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('business')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">1. Business Information</h2>
                  {expandedSections.business ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.business && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Business Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={settings.business_name}
                        onChange={(e) => updateSetting('business_name', e.target.value)}
                        required
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Business Website
                      </label>
                      <input
                        type="url"
                        value={settings.business_website}
                        onChange={(e) => updateSetting('business_website', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Industry & Social Media */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('industry')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">2. Industry & Social Media</h2>
                  {expandedSections.industry ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.industry && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Industry
                      </label>
                      <input
                        type="text"
                        value={settings.industry}
                        onChange={(e) => updateSetting('industry', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="e.g., Restaurant, Retail, Services"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Facebook URL
                      </label>
                      <input
                        type="url"
                        value={settings.facebook_url}
                        onChange={(e) => updateSetting('facebook_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://facebook.com/yourbusiness"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Instagram URL
                      </label>
                      <input
                        type="url"
                        value={settings.instagram_url}
                        onChange={(e) => updateSetting('instagram_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://instagram.com/yourbusiness"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        TikTok URL
                      </label>
                      <input
                        type="url"
                        value={settings.tiktok_url}
                        onChange={(e) => updateSetting('tiktok_url', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="https://tiktok.com/@yourbusiness"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Contact Method
                      </label>
                      <input
                        type="text"
                        value={settings.contact_method}
                        onChange={(e) => updateSetting('contact_method', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="Email or phone number"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Default Tone & Style */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('tone')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">3. Default Tone & Style Preferences</h2>
                  {expandedSections.tone ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.tone && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Default Tone <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={settings.default_tone}
                        onChange={(e) => updateSetting('default_tone', e.target.value)}
                        required
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Default Reply Length
                      </label>
                      <select
                        value={settings.default_length}
                        onChange={(e) => updateSetting('default_length', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="short">Short (50-75 words)</option>
                        <option value="medium">Medium (100-150 words)</option>
                        <option value="detailed">Detailed (200-250 words)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Perspective Preference
                      </label>
                      <select
                        value={settings.perspective}
                        onChange={(e) => updateSetting('perspective', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="we">"We" (team perspective)</option>
                        <option value="I">"I" (personal perspective)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Emoji Usage
                      </label>
                      <select
                        value={settings.emoji_usage}
                        onChange={(e) => updateSetting('emoji_usage', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
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
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Sign-off Options
                      </label>
                      <select
                        value={settings.sign_off}
                        onChange={(e) => {
                          updateSetting('sign_off', e.target.value);
                          if (e.target.value !== 'custom') {
                            updateSetting('custom_sign_off', '');
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="none">None</option>
                        <option value="business_team">"— The [Business Name] Team"</option>
                        <option value="custom">Custom text</option>
                      </select>
                      {settings.sign_off === 'custom' && (
                        <input
                          type="text"
                          value={settings.custom_sign_off}
                          onChange={(e) => updateSetting('custom_sign_off', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md mt-2"
                          style={{
                            backgroundColor: 'white',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-main)',
                            borderRadius: 'var(--button-radius)',
                          }}
                          placeholder="e.g., — Best, The Team"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Legal & Risk Guardrails */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('legal')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">4. Legal & Risk Guardrails</h2>
                  {expandedSections.legal ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.legal && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Legal Sensitivity Level
                      </label>
                      <select
                        value={settings.legal_sensitivity}
                        onChange={(e) => updateSetting('legal_sensitivity', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Forbidden Phrases (One per line)
                      </label>
                      <textarea
                        value={settings.forbidden_phrases.join('\n')}
                        onChange={(e) => {
                          const phrases = e.target.value.split('\n').filter(p => p.trim());
                          updateSetting('forbidden_phrases', phrases);
                        }}
                        rows={4}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="refund&#10;fault&#10;we messed up"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Preferred Phrases (One per line)
                      </label>
                      <textarea
                        value={settings.preferred_phrases.join('\n')}
                        onChange={(e) => {
                          const phrases = e.target.value.split('\n').filter(p => p.trim());
                          updateSetting('preferred_phrases', phrases);
                        }}
                        rows={4}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-main)',
                          borderRadius: 'var(--button-radius)',
                        }}
                        placeholder="we take feedback seriously"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                        Default Apology Behavior
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="apology_behavior"
                            value="apologize"
                            checked={settings.apology_behavior === 'apologize'}
                            onChange={(e) => updateSetting('apology_behavior', e.target.value)}
                            className="mr-2"
                          />
                          <span className="text-sm">Apologize: Use apologetic language</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="apology_behavior"
                            value="neutral"
                            checked={settings.apology_behavior === 'neutral'}
                            onChange={(e) => updateSetting('apology_behavior', e.target.value)}
                            className="mr-2"
                          />
                          <span className="text-sm">Neutral: Acknowledge without apologizing</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="apology_behavior"
                            value="non_committal"
                            checked={settings.apology_behavior === 'non_committal'}
                            onChange={(e) => updateSetting('apology_behavior', e.target.value)}
                            className="mr-2"
                          />
                          <span className="text-sm">Non-Committal: Generic response</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 5: Review Reply Strategy */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('strategy')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">5. Review Reply Strategy</h2>
                  {expandedSections.strategy ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.strategy && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Default Reply Goal
                      </label>
                      <select
                        value={settings.default_reply_goal}
                        onChange={(e) => updateSetting('default_reply_goal', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                        style={{
                          backgroundColor: 'white',
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
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoSeverity"
                        checked={settings.auto_severity_detection}
                        onChange={(e) => updateSetting('auto_severity_detection', e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="autoSeverity" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Enable auto severity detection
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="crisisMode"
                        checked={settings.crisis_mode_auto_activation}
                        onChange={(e) => updateSetting('crisis_mode_auto_activation', e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="crisisMode" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Enable crisis mode auto-activation
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 6: AI Customization */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('customization')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">6. AI Customization & Style</h2>
                  {expandedSections.customization ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.customization && (
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Reply Opening Options
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_openings.includes('thank')}
                            onChange={() => toggleArrayItem('reply_openings', 'thank')}
                            className="mr-2"
                          />
                          <span className="text-sm">Start with "Thank you"</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_openings.includes('business_name')}
                            onChange={() => toggleArrayItem('reply_openings', 'business_name')}
                            className="mr-2"
                          />
                          <span className="text-sm">Include business name in opening</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_openings.includes('customer_name')}
                            onChange={() => toggleArrayItem('reply_openings', 'customer_name')}
                            className="mr-2"
                          />
                          <span className="text-sm">Personalize with customer name</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Reply Closing Options
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_closings.includes('contact_info')}
                            onChange={() => toggleArrayItem('reply_closings', 'contact_info')}
                            className="mr-2"
                          />
                          <span className="text-sm">Include contact information</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_closings.includes('invite_back')}
                            onChange={() => toggleArrayItem('reply_closings', 'invite_back')}
                            className="mr-2"
                          />
                          <span className="text-sm">Invite customer to return</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.reply_closings.includes('business_name')}
                            onChange={() => toggleArrayItem('reply_closings', 'business_name')}
                            className="mr-2"
                          />
                          <span className="text-sm">Sign with business name</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-main)' }}>
                        Apology Style for Negative Reviews
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="apology_tone"
                            value="apologetic"
                            checked={settings.apology_tone === 'apologetic'}
                            onChange={(e) => updateSetting('apology_tone', e.target.value)}
                            className="mr-2"
                          />
                          <span className="text-sm">Apologetic: Admits responsibility</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="apology_tone"
                            value="non_admitting"
                            checked={settings.apology_tone === 'non_admitting'}
                            onChange={(e) => updateSetting('apology_tone', e.target.value)}
                            className="mr-2"
                          />
                          <span className="text-sm">Non-Admitting: Acknowledges without admitting fault</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="legalAwareness"
                        checked={settings.legal_awareness_enabled}
                        onChange={(e) => updateSetting('legal_awareness_enabled', e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="legalAwareness" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                        Enable legal/jurisdiction awareness
                      </label>
                    </div>
                    {settings.legal_awareness_enabled && (
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                          Business Jurisdiction/Region
                        </label>
                        <input
                          type="text"
                          value={settings.jurisdiction}
                          onChange={(e) => updateSetting('jurisdiction', e.target.value)}
                          className="w-full px-3 py-2 border rounded-md"
                          style={{
                            backgroundColor: 'white',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-main)',
                            borderRadius: 'var(--button-radius)',
                          }}
                          placeholder="e.g., United States, California, EU"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 7: Review Reminders */}
              <div className="rounded-md border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => toggleSection('reminders')}
                  className="w-full p-4 flex items-center justify-between text-left"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  <h2 className="text-lg font-semibold">7. Review Reminders</h2>
                  {expandedSections.reminders ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.reminders && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="enableReminders"
                        checked={settings.reminders_enabled}
                        onChange={(e) => updateSetting('reminders_enabled', e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="enableReminders" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                        Enable review reminders
                      </label>
                    </div>
                    {settings.reminders_enabled && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                            Reminder Frequency
                          </label>
                          <select
                            value={settings.reminder_frequency}
                            onChange={(e) => {
                              updateSetting('reminder_frequency', e.target.value);
                              if (e.target.value === 'daily') {
                                updateSetting('reminder_day_of_week', '');
                              }
                            }}
                            className="w-full px-3 py-2 border rounded-md"
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
                        {settings.reminder_frequency === 'weekly' && (
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                              Day of Week
                            </label>
                            <select
                              value={settings.reminder_day_of_week}
                              onChange={(e) => updateSetting('reminder_day_of_week', e.target.value)}
                              className="w-full px-3 py-2 border rounded-md"
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
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                            Time of Day
                          </label>
                          <input
                            type="time"
                            value={settings.reminder_time}
                            onChange={(e) => updateSetting('reminder_time', e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                            style={{
                              backgroundColor: 'white',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-main)',
                              borderRadius: 'var(--button-radius)',
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                            Delivery Method
                          </label>
                          <div className="space-y-2">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={settings.reminder_delivery.includes('email')}
                                onChange={() => toggleArrayItem('reminder_delivery', 'email')}
                                className="mr-2"
                              />
                              <span className="text-sm">Email</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={settings.reminder_delivery.includes('sms')}
                                onChange={() => toggleArrayItem('reminder_delivery', 'sms')}
                                className="mr-2"
                              />
                              <span className="text-sm">SMS</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                            Reminder Recipient
                          </label>
                          <select
                            value={settings.reminder_recipient}
                            onChange={(e) => updateSetting('reminder_recipient', e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                            style={{
                              backgroundColor: 'white',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-main)',
                              borderRadius: 'var(--button-radius)',
                            }}
                          >
                            <option value="owner">Owner</option>
                            <option value="selected_users">Selected users</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                            Reminder Message Template
                          </label>
                          <textarea
                            value={settings.reminder_template}
                            onChange={(e) => updateSetting('reminder_template', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border rounded-md"
                            style={{
                              backgroundColor: 'white',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-main)',
                              borderRadius: 'var(--button-radius)',
                            }}
                            placeholder="Use {count} as a placeholder for the number of unresponded reviews"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-4 pt-4">
                <Link
                  href="/review-reply-ai/dashboard"
                  className="px-4 py-2 rounded-md border transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-main)',
                    borderRadius: 'var(--button-radius)',
                  }}
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'white',
                    borderRadius: 'var(--button-radius)',
                  }}
                >
                  {saving ? (
                    <>
                      <Loader className="animate-spin" size={16} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
