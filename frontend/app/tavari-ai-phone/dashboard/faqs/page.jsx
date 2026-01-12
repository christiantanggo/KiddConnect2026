'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';
import { authAPI, agentsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

function FAQsPage() {
  const router = useRouter();
  const { success, error: showError, warning } = useToast();
  const [user, setUser] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [faqs, setFaqs] = useState([]);
  const [faqLimit, setFaqLimit] = useState(5);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, agentRes] = await Promise.all([
        authAPI.getMe(),
        agentsAPI.get().catch(() => ({ data: null })),
      ]);
      setUser(userRes.data);
      setAgent(agentRes.data);
      
      // Set FAQs from agent
      if (agentRes.data?.agent?.faqs) {
        setFaqs(agentRes.data.agent.faqs);
      }
      
      // Get FAQ limit based on plan tier
      const planTier = userRes.data?.business?.plan_tier || 'starter';
      // Map tier names to limits (handle both 'Tier 1' and 'starter' formats)
      const tierMap = {
        'Tier 1': 'starter',
        'Tier 2': 'core',
        'Tier 3': 'pro',
        'starter': 'starter',
        'core': 'core',
        'pro': 'pro',
      };
      const normalizedTier = tierMap[planTier] || 'starter';
      const limits = {
        'starter': 5,
        'core': 10,
        'pro': 20,
      };
      setFaqLimit(limits[normalizedTier] || 5);
    } catch (error) {
      console.error('Failed to load FAQ data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFaqChange = (index, field, value) => {
    const newFaqs = [...faqs];
    if (!newFaqs[index]) {
      newFaqs[index] = { question: '', answer: '' };
    }
    newFaqs[index][field] = value;
    setFaqs(newFaqs);
  };

  const addFaq = () => {
    if (faqs.length >= faqLimit) {
      warning(`You've reached your FAQ limit of ${faqLimit}. Please upgrade your plan to add more FAQs.`);
      return;
    }
    setFaqs([...faqs, { question: '', answer: '' }]);
  };

  const removeFaq = (index) => {
    const newFaqs = faqs.filter((_, i) => i !== index);
    setFaqs(newFaqs);
  };

  const handleSave = async () => {
    // Validate FAQs
    const validFaqs = faqs.filter(faq => faq.question && faq.answer);
    
    if (validFaqs.length !== faqs.length) {
      if (!confirm('Some FAQs are incomplete. Only complete FAQs will be saved. Continue?')) {
        return;
      }
    }

    if (validFaqs.length > faqLimit) {
      warning(`You can only have ${faqLimit} FAQs on your current plan. Please remove ${validFaqs.length - faqLimit} FAQ(s) or upgrade your plan.`);
      return;
    }

    setSaving(true);
    try {
      const response = await agentsAPI.update({ faqs: validFaqs });
      
      if (response.data?.agent) {
        setAgent(response.data.agent);
        setFaqs(validFaqs);
        success('FAQs saved successfully!');
        // Use router.push with a timestamp to force refresh
        router.push('/tavari-ai-phone/dashboard?refresh=' + Date.now());
      } else {
        showError('Failed to save FAQs');
      }
    } catch (error) {
      console.error('Save error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to save FAQs';
      showError(`Failed to save FAQs: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  const usedFaqs = faqs.filter(faq => faq.question && faq.answer).length;
  const canAddMore = usedFaqs < faqLimit;

  return (
    <AuthGuard>
      <V2AppShell>
        <div 
          style={{ 
            maxWidth: 'var(--max-content-width)', 
            margin: '0 auto',
            padding: 'calc(var(--padding-base) * 1.5) var(--padding-base)',
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          {/* Module Action Cards */}
          <PhoneAgentV2ActionCards />

          <div 
            className="shadow mb-6"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--padding-base)',
            }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Frequently Asked Questions</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Add questions and answers that your AI can respond to during calls. Keep answers clear and informative (max 1000 characters).
              </p>
            </div>

            {/* FAQ Limit Display */}
            <div 
              className="mb-6 p-4"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>
                    FAQs: {usedFaqs} / {faqLimit} used
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {user?.business?.plan_tier || 'Tier 1'} Plan
                  </p>
                </div>
                {!canAddMore && (
                  <button
                    onClick={() => router.push('/dashboard/v2/settings/billing')}
                    className="px-4 py-2 text-white font-medium transition-opacity"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Upgrade Plan
                  </button>
                )}
              </div>
            </div>

            {/* FAQ List */}
            <div className="space-y-4 mb-6">
              {faqs.map((faq, index) => (
                <div 
                  key={index} 
                  className="p-4"
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--card-radius)',
                    backgroundColor: 'var(--color-background)',
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>FAQ #{index + 1}</h3>
                    <button
                      onClick={() => removeFaq(index)}
                      className="text-sm font-medium transition-colors"
                      style={{ color: 'var(--color-danger)' }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Question *
                      </label>
                      <input
                        type="text"
                        value={faq.question || ''}
                        onChange={(e) => handleFaqChange(index, 'question', e.target.value)}
                        placeholder="e.g., Do you offer delivery?"
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                          focusRingColor: 'var(--color-accent)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Answer * (max 1000 characters)
                      </label>
                      <textarea
                        value={faq.answer || ''}
                        onChange={(e) => handleFaqChange(index, 'answer', e.target.value)}
                        placeholder="e.g., Yes, we offer delivery within a 5-mile radius. Delivery fee is $3.99."
                        rows={4}
                        maxLength={1000}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          focusRingColor: 'var(--color-accent)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                      />
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Keep answers clear and informative.
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {(faq.answer || '').length} / 1000 characters
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {faqs.length === 0 && (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                  <p>No FAQs added yet. Click "Add FAQ" below to get started.</p>
                </div>
              )}
            </div>

            {/* Add FAQ Button */}
            {canAddMore && (
              <button
                onClick={addFaq}
                className="w-full py-2 px-4 border-2 border-dashed font-medium mb-6 transition-colors"
                style={{
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--button-radius)',
                  color: 'var(--color-text-muted)',
                  height: 'var(--input-height)',
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = 'var(--color-accent)';
                  e.target.style.color = 'var(--color-accent)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = 'var(--color-border)';
                  e.target.style.color = 'var(--color-text-muted)';
                }}
              >
                + Add FAQ
              </button>
            )}

            {/* Save Button */}
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => router.push('/tavari-ai-phone/dashboard')}
                className="px-6 py-2 border font-medium transition-opacity"
                style={{
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--button-radius)',
                  color: 'var(--color-text-main)',
                  height: 'var(--input-height)',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-white font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderRadius: 'var(--button-radius)',
                  height: 'var(--input-height)',
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.target.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.opacity = '1';
                }}
              >
                {saving ? 'Saving...' : 'Save FAQs'}
              </button>
            </div>
          </div>

          {/* Help Text */}
          <div 
            className="shadow p-4"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
            }}
          >
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Tips for Effective FAQs:</h3>
            <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: 'var(--color-text-muted)' }}>
              <li>Keep questions clear and specific</li>
              <li>Answers should be clear and informative (max 1000 characters)</li>
              <li>Focus on common customer questions (hours, location, services, pricing)</li>
              <li>Include relevant details that customers frequently ask about</li>
              <li>Test your FAQs to ensure the AI responds correctly</li>
            </ul>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default FAQsPage;

