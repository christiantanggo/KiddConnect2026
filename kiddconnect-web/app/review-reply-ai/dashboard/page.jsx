'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { reviewsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Copy, Check, Star, AlertCircle, Loader, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';

export default function ReviewsDashboard() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [usage, setUsage] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  
  // Form state
  const [reviewText, setReviewText] = useState('');
  const [starRating, setStarRating] = useState(5);
  const [customerName, setCustomerName] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [responsePosture, setResponsePosture] = useState('neutral');
  const [toneSlider, setToneSlider] = useState(3);
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState('medium');
  const [includeResolutionStep, setIncludeResolutionStep] = useState(true);
  const [reviewDate, setReviewDate] = useState('');
  
  // Results state
  const [results, setResults] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(null);

  useEffect(() => {
    checkSetupAndLoadData();
  }, []);

  const checkSetupAndLoadData = async () => {
    try {
      setLoading(true);
      
      // Check setup status
      const setupRes = await reviewsAPI.getSetupStatus();
      setSetupStatus(setupRes.data.setup_status);
      
      // If setup not complete, redirect to setup
      if (!setupRes.data.setup_status.is_complete) {
        router.push('/modules/reviews/setup');
        return;
      }
      
      // Load usage data
      await loadUsage();
    } catch (error) {
      console.error('Failed to check setup:', error);
      const errorInfo = handleAPIError(error);
      if (errorInfo.code === 'TERMS_NOT_ACCEPTED') {
        router.push('/accept-terms');
        return;
      }
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
        return;
      }
      showErrorToast(errorInfo.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const loadUsage = async () => {
    try {
      const response = await reviewsAPI.getUsage();
      setUsage(response.data.usage);
    } catch (error) {
      console.error('Failed to load usage:', error);
      // Don't block dashboard if usage fails
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    
    if (!reviewText.trim() || reviewText.trim().length < 10) {
      showErrorToast('Review text must be at least 10 characters');
      return;
    }
    
    setGenerating(true);
    try {
      const response = await reviewsAPI.generate({
        review_text: reviewText.trim(),
        star_rating: starRating,
        customer_name: customerName.trim() || undefined,
        context_notes: contextNotes.trim() || undefined,
        response_posture: responsePosture,
        tone_slider: toneSlider,
        tone,
        length,
        include_resolution_step: includeResolutionStep,
        review_date: reviewDate || undefined
      });
      
      setResults(response.data);
      success('Review replies generated successfully!');
      
      // Refresh usage
      await loadUsage();
      
      // Clear form (keep settings)
      setReviewText('');
      setCustomerName('');
      setContextNotes('');
      setReviewDate('');
      
    } catch (error) {
      console.error('Failed to generate replies:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to generate replies');
      if (errorInfo.code === 'USAGE_LIMIT_REACHED' || errorInfo.code === 'SUBSCRIPTION_INACTIVE') {
        // Reload usage to show updated status
        await loadUsage();
      }
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text, optionLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(optionLabel);
      success('Copied to clipboard!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      showErrorToast('Failed to copy to clipboard');
    }
  };

  const handleFeedback = async (feedbackType, adjustmentType = null, selectedReplyOption = null) => {
    if (!results?.output_id) return;
    
    setFeedbackLoading(feedbackType);
    try {
      await reviewsAPI.submitFeedback(results.output_id, feedbackType, adjustmentType, selectedReplyOption);
      success(feedbackType === 'like' ? 'Feedback recorded! The AI will learn from your preference.' : 'Feedback recorded! Generating new response...');
      
      // If regenerate, trigger new generation
      if (feedbackType === 'regenerate') {
        await handleGenerate({ preventDefault: () => {} });
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      showErrorToast('Failed to record feedback');
    } finally {
      setFeedbackLoading(null);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

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
          {/* Header */}
          <div className="mb-8">
            <Link 
              href="/dashboard/v2"
              className="text-sm mb-4 inline-block flex items-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
              Tavari AI Review Reply
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Generate professional, tone-safe responses to Google reviews
            </p>
          </div>

          {/* Usage Widget */}
          {usage && usage.limit && (
            <div 
              className="mb-8 p-4 rounded-lg border"
              style={{ 
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                  Usage This Month
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {usage.used} / {usage.limit} generations
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    backgroundColor: usage.percent_used >= 100 ? 'var(--color-error, #ef4444)' :
                                   usage.percent_used >= 80 ? 'var(--color-warning, #f59e0b)' :
                                   'var(--color-accent)',
                    width: `${Math.min(usage.percent_used, 100)}%`
                  }}
                />
              </div>
              {usage.remaining !== null && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {usage.remaining} generations remaining. Resets on {new Date(usage.reset_date).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {/* Main Content - Single Column Layout: Stars → Review → Context → Generate → Responses */}
          <div className="space-y-8">
            {/* Input Form - Full Width */}
            <div 
              className="p-6 rounded-lg border"
              style={{ 
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)'
              }}
            >
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Generate Review Reply
              </h2>
              
              <form onSubmit={handleGenerate} className="space-y-4">
                {/* Star Rating - MOVED TO TOP */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Star Rating <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setStarRating(rating)}
                        className={`p-2 rounded-md border transition-colors ${
                          starRating === rating ? 'border-yellow-400' : ''
                        }`}
                        style={{
                          backgroundColor: starRating === rating ? 'rgba(250, 204, 21, 0.1)' : 'var(--color-surface)',
                          borderColor: starRating === rating ? '#facc15' : 'var(--color-border)',
                        }}
                      >
                        <Star 
                          className={`w-5 h-5 ${
                            starRating >= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review Text */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Review Text <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={6}
                    required
                    maxLength={5000}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder="Paste the review text here..."
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {reviewText.length} / 5000 characters
                  </p>
                </div>

                {/* Review Date (Optional) */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Review Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  />
                </div>

                {/* Customer Name (Optional) */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder="Customer name (if known)"
                  />
                </div>

                {/* Response Posture */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Response Posture
                  </label>
                  <select
                    value={responsePosture}
                    onChange={(e) => setResponsePosture(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    <option value="apologetic">Apologetic</option>
                    <option value="neutral">Neutral / Factual</option>
                    <option value="corrective">Corrective (review is incorrect)</option>
                  </select>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    How should the AI approach this review?
                  </p>
                </div>

                {/* Tone Slider */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Tone Intensity: {toneSlider === 1 ? 'Very Friendly' : toneSlider === 3 ? 'Professional' : toneSlider === 5 ? 'Firm / Corrective' : (toneSlider + '/5')}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={toneSlider}
                    onChange={(e) => setToneSlider(parseInt(e.target.value))}
                    className="w-full"
                    style={{
                      accentColor: 'var(--color-accent)',
                    }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Friendly</span>
                    <span>Professional</span>
                    <span>Firm</span>
                  </div>
                </div>

                {/* Context Notes - Prominent - MOVED BELOW REVIEW */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Important Context / Additional Information
                    <span className="text-xs font-normal ml-2" style={{ color: 'var(--color-text-muted)' }}>
                      (Highly Recommended)
                    </span>
                  </label>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                    Add specific details about the situation to help the AI provide accurate, business-specific responses. 
                    For example: "The plate in the photo is 9 inches, our pizza is 7 inches, not 5 inches" or 
                    "Customer ordered at 2pm, we close at 3pm on Sundays."
                  </p>
                  <textarea
                    value={contextNotes}
                    onChange={(e) => setContextNotes(e.target.value)}
                    rows={5}
                    maxLength={1000}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'white',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    placeholder="Example: The plate in the photo is 9 inches, our pizza is 7 inches (not 5 inches). Customer's order was ready within 15 minutes..."
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {contextNotes.length} / 1000 characters
                  </p>
                </div>

                {/* Tone Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
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
                </div>

                {/* Length Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Reply Length
                  </label>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    <option value="short">Short (50-75 words)</option>
                    <option value="medium">Medium (100-150 words)</option>
                    <option value="long">Long (200-250 words)</option>
                  </select>
                </div>

                {/* Include Resolution Step */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="includeResolution"
                    checked={includeResolutionStep}
                    onChange={(e) => setIncludeResolutionStep(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="includeResolution" className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                    Include resolution step (contact information)
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={generating || !reviewText.trim() || reviewText.trim().length < 10}
                  className="w-full px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'white',
                    borderRadius: 'var(--button-radius)',
                  }}
                >
                  {generating ? (
                    <span className="flex items-center justify-center">
                      <Loader className="w-4 h-4 mr-2 animate-spin" /> Generating...
                    </span>
                  ) : (
                    'Generate Replies'
                  )}
                </button>
              </form>
            </div>

            {/* Results - Below Form */}
            {results && (
              <div 
                className="p-6 rounded-lg border"
                style={{ 
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                  Generated Replies
                </h2>
                
                {/* Analysis Badges */}
                {results.analysis && (
                  <div className="mb-4 flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-medium" style={{
                      backgroundColor: results.analysis.sentiment === 'positive' ? 'rgba(34, 197, 94, 0.1)' : 
                                      results.analysis.sentiment === 'negative' ? 'rgba(239, 68, 68, 0.1)' : 
                                      'rgba(156, 163, 175, 0.1)',
                      color: results.analysis.sentiment === 'positive' ? '#22c55e' : 
                            results.analysis.sentiment === 'negative' ? '#ef4444' : '#9ca3af'
                    }}>
                      {results.analysis.sentiment}
                    </span>
                    {results.analysis.risk_level !== 'low' && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium" style={{
                        backgroundColor: results.analysis.risk_level === 'legal' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: results.analysis.risk_level === 'legal' ? '#ef4444' : '#f59e0b'
                      }}>
                        {results.analysis.risk_level} risk
                      </span>
                    )}
                    {results.analysis.crisis_detected && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        ⚠️ Crisis Detected
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {results.reply_options?.map((option) => (
                    <div
                      key={option.label}
                      className="p-4 rounded-md border"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
                          {option.label}
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopy(option.text, option.label)}
                            className="p-1 rounded hover:bg-gray-100 transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedId === option.label ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'var(--color-text-main)' }}>
                        {option.text}
                      </p>
                      
                      {/* Feedback Buttons */}
                      <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <button
                          onClick={() => handleFeedback('like', null, option.label)}
                          disabled={feedbackLoading !== null}
                          className="flex items-center gap-1 px-3 py-1 text-xs rounded transition-colors disabled:opacity-50"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            color: '#22c55e',
                          }}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          Like
                        </button>
                        <button
                          onClick={() => {
                            const adjustment = prompt('Adjustment needed:\n1. More friendly\n2. More professional\n3. More firm\n4. Shorter\n5. More detailed\n\nEnter number (1-5):');
                            if (adjustment && ['1', '2', '3', '4', '5'].includes(adjustment)) {
                              const adjustments = {
                                '1': 'more_friendly',
                                '2': 'more_professional',
                                '3': 'more_firm',
                                '4': 'shorter',
                                '5': 'more_detailed'
                              };
                              handleFeedback('regenerate', adjustments[adjustment]);
                            }
                          }}
                          disabled={feedbackLoading !== null}
                          className="flex items-center gap-1 px-3 py-1 text-xs rounded transition-colors disabled:opacity-50"
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            color: '#f59e0b',
                          }}
                        >
                          <RefreshCw className={`w-3 h-3 ${feedbackLoading === 'regenerate' ? 'animate-spin' : ''}`} />
                          Regenerate
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {results.internal_notes && (
                    <div className="mt-6 p-4 rounded-md border" style={{ borderColor: 'var(--color-border)' }}>
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                        Internal Notes
                      </h4>
                      {results.internal_notes.risk_flags?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                            Risk Flags:
                          </p>
                          <ul className="list-disc list-inside text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {results.internal_notes.risk_flags.map((flag, idx) => (
                              <li key={idx}>{flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {results.internal_notes.suggested_next_step && (
                        <div>
                          <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                            Suggested Next Step:
                          </p>
                          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {results.internal_notes.suggested_next_step}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Action Links */}
          <div className="mt-8 flex gap-4">
            <Link
              href="/review-reply-ai/dashboard/history"
              className="px-4 py-2 rounded-md border transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-main)',
                borderRadius: 'var(--button-radius)',
              }}
            >
              View History
            </Link>
            <Link
              href="/review-reply-ai/dashboard/settings"
              className="px-4 py-2 rounded-md border transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-main)',
                borderRadius: 'var(--button-radius)',
              }}
            >
              Settings
            </Link>
          </div>
        </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

