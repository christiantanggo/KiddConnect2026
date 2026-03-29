'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, agentsAPI } from '@/lib/api';
import Link from 'next/link';
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
        router.push('/dashboard?refresh=' + Date.now());
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
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  const usedFaqs = faqs.filter(faq => faq.question && faq.answer).length;
  const canAddMore = usedFaqs < faqLimit;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Manage FAQs</h1>
            <div className="space-x-4">
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h2>
                <p className="text-sm text-gray-600">
                  Add questions and answers that your AI can respond to during calls. Keep answers clear and informative (max 1000 characters).
                </p>
              </div>
            </div>

            {/* FAQ Limit Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    FAQs: {usedFaqs} / {faqLimit} used
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {user?.business?.plan_tier || 'Tier 1'} Plan
                  </p>
                </div>
                {!canAddMore && (
                  <Link
                    href="/dashboard/billing"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Upgrade Plan
                  </Link>
                )}
              </div>
            </div>

            {/* FAQ List */}
            <div className="space-y-4 mb-6">
              {faqs.map((faq, index) => (
                <div key={index} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">FAQ #{index + 1}</h3>
                    <button
                      onClick={() => removeFaq(index)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Question *
                      </label>
                      <input
                        type="text"
                        value={faq.question || ''}
                        onChange={(e) => handleFaqChange(index, 'question', e.target.value)}
                        placeholder="e.g., Do you offer delivery?"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Answer * (max 1000 characters)
                      </label>
                      <textarea
                        value={faq.answer || ''}
                        onChange={(e) => handleFaqChange(index, 'answer', e.target.value)}
                        placeholder="e.g., Yes, we offer delivery within a 5-mile radius. Delivery fee is $3.99."
                        rows={4}
                        maxLength={1000}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-xs text-gray-500">
                          Keep answers clear and informative.
                        </p>
                        <p className="text-xs text-gray-500">
                          {(faq.answer || '').length} / 1000 characters
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {faqs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No FAQs added yet. Click "Add FAQ" below to get started.</p>
                </div>
              )}
            </div>

            {/* Add FAQ Button */}
            {canAddMore && (
              <button
                onClick={addFaq}
                className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 font-medium mb-6"
              >
                + Add FAQ
              </button>
            )}

            {/* Save Button */}
            <div className="flex justify-end space-x-4">
              <Link
                href="/dashboard"
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save FAQs'}
              </button>
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Tips for Effective FAQs:</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Keep questions clear and specific</li>
              <li>Answers should be clear and informative (max 1000 characters)</li>
              <li>Focus on common customer questions (hours, location, services, pricing)</li>
              <li>Include relevant details that customers frequently ask about</li>
              <li>Test your FAQs to ensure the AI responds correctly</li>
            </ul>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default FAQsPage;

