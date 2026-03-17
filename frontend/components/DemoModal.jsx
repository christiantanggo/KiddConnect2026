'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Vapi from '@vapi-ai/web';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

export default function DemoModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    businessName: '',
    faq1: '',
    answer1: '',
    faq2: '',
    answer2: '',
    email: '',
    marketingConsent: true, // Auto-checked by default
  });
  const [building, setBuilding] = useState(false);
  const [buildingText, setBuildingText] = useState('');
  const [demoReady, setDemoReady] = useState(false);
  const [assistantId, setAssistantId] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [openingGreeting, setOpeningGreeting] = useState('');
  const [playing, setPlaying] = useState(false);
  const [callCompleted, setCallCompleted] = useState(false);
  const [callError, setCallError] = useState(null);
  const [vapiCall, setVapiCall] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [summaryEmailSent, setSummaryEmailSent] = useState(false);

  const buildingTexts = [
    'Building your assistant…',
    'Applying your business info…',
    'Configuring voice…',
  ];

  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = () => {
    // Clear demo state
    setBuilding(false);
    setDemoReady(false);
    setCallCompleted(false);
    setCallError(null);
    setCallActive(false);
    setPlaying(false);
    if (vapiCall) {
      try {
        vapiCall.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
      setVapiCall(null);
    }
    // Reset form
    setFormData({
      businessName: '',
      faq1: '',
      answer1: '',
      faq2: '',
      answer2: '',
      email: '',
      marketingConsent: true, // Auto-checked by default
    });
    setAssistantId(null);
    setBusinessName('');
    setOpeningGreeting('');
    setSummaryEmailSent(false);
    onClose();
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBuildAgent = async () => {
    if (!formData.businessName || !formData.faq1 || !formData.answer1 || !formData.email) {
      alert('Please fill in all required fields: Business Name, FAQ #1, Answer #1, and Email');
      return;
    }

    // Track analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'demo_started', {
        event_category: 'demo',
        event_label: 'modal',
      });
    }

    setBuilding(true);
    setBuildingText(buildingTexts[0]);
    let textIndex = 0;

    const textInterval = setInterval(() => {
      textIndex = (textIndex + 1) % buildingTexts.length;
      setBuildingText(buildingTexts[textIndex]);
    }, 2000);

    try {
      const response = await fetch(`${API_URL}/api/demo/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessName: formData.businessName,
          faq1: formData.faq1,
          answer1: formData.answer1,
          faq2: formData.faq2 || null,
          answer2: formData.answer2 || null,
          email: formData.email,
          marketingConsent: formData.marketingConsent,
        }),
      });

      clearInterval(textInterval);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create demo assistant');
      }

      const data = await response.json();
      setAssistantId(data.assistantId);
      setBusinessName(data.businessName);
      setOpeningGreeting(data.openingGreeting);
      setDemoReady(true);
      setBuilding(false);
      
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demoAssistantId', data.assistantId);
        window.gtag('event', 'demo_built', {
          event_category: 'demo',
          event_label: 'assistant_created',
        });
      }
    } catch (error) {
      clearInterval(textInterval);
      setBuilding(false);
      alert(`Failed to create demo: ${error.message}`);
    }
  };

  const handlePlayDemo = async () => {
    const currentAssistantId = assistantId || (typeof window !== 'undefined' ? sessionStorage.getItem('demoAssistantId') : null);
    
    if (!currentAssistantId) {
      setCallError('No assistant ID found. Please create a new demo.');
      return;
    }

    setPlaying(true);
    setCallError(null);

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'demo_played', {
        event_category: 'demo',
        event_label: 'audio_played',
      });
    }

    try {
      const keyResponse = await fetch(`${API_URL}/api/demo/public-key`);
      if (!keyResponse.ok) {
        throw new Error(`Failed to fetch public key: ${keyResponse.status}`);
      }
      const keyData = await keyResponse.json();
      const publicKey = keyData.publicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
      
      if (!publicKey) {
        throw new Error('VAPI public key not configured');
      }

      const vapi = new Vapi(publicKey);
      
      vapi.on('call-start', () => {
        setPlaying(false);
        setCallActive(true);
      });

      vapi.on('call-end', async (data) => {
        setCallCompleted(true);
        setCallActive(false);
        
        if (summaryEmailSent) {
          setVapiCall(null);
          return;
        }
        
        let callId = data?.call?.id || data?.id || data?.callId || null;
        
        try {
          const summaryResponse = await fetch(`${API_URL}/api/demo/send-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assistantId: currentAssistantId,
              callId: callId,
              email: formData.email,
            }),
          });
          
          if (summaryResponse.ok) {
            setSummaryEmailSent(true);
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'email_sent', {
                event_category: 'demo',
                event_label: 'summary_email',
              });
            }
          }
        } catch (emailError) {
          console.error('[Demo] Error sending summary email:', emailError);
        }
        
        setVapiCall(null);
      });

      vapi.on('error', (error) => {
        setCallError(error.message || 'Call error occurred');
        setPlaying(false);
        setCallActive(false);
      });

      await vapi.start(currentAssistantId);
      setVapiCall(vapi);
    } catch (error) {
      setCallError(error.message || 'Failed to connect to call');
      setPlaying(false);
    }
  };

  const handleEndCall = async () => {
    try {
      if (vapiCall) {
        await vapiCall.stop();
        setCallActive(false);
        setCallCompleted(true);
        setVapiCall(null);
      }
    } catch (error) {
      setCallActive(false);
      setVapiCall(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-8">
            {!demoReady ? (
              <>
                {/* Form State */}
                {!building ? (
                  <>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                      Build Your AI Phone Assistant
                    </h2>
                    <p className="text-gray-600 mb-8">
                      Answer a few questions. Hear it answer your phone in seconds.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Business Name
                        </label>
                        <input
                          type="text"
                          value={formData.businessName}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value.length <= 40) {
                              handleInputChange('businessName', value);
                            }
                          }}
                          placeholder="e.g. Smith Plumbing"
                          maxLength={40}
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.businessName.length}/40 characters
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Common Question #1
                        </label>
                        <input
                          type="text"
                          value={formData.faq1}
                          onChange={(e) => handleInputChange('faq1', e.target.value)}
                          placeholder="Do you offer emergency service?"
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Answer
                        </label>
                        <textarea
                          value={formData.answer1}
                          onChange={(e) => handleInputChange('answer1', e.target.value)}
                          placeholder="Yes, we offer 24/7 emergency service."
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Common Question #2 (optional)
                        </label>
                        <input
                          type="text"
                          value={formData.faq2}
                          onChange={(e) => handleInputChange('faq2', e.target.value)}
                          placeholder="Optional second question"
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Answer (optional)
                        </label>
                        <textarea
                          value={formData.answer2}
                          onChange={(e) => handleInputChange('answer2', e.target.value)}
                          placeholder="Answer to second question (optional)"
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Email for Call Summary
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="you@yourbusiness.com"
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          We'll send you the call summary from this demo — just like a real customer call.
                        </p>
                      </div>

                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="marketingConsent"
                          checked={formData.marketingConsent}
                          onChange={(e) => handleInputChange('marketingConsent', e.target.checked)}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="marketingConsent" className="ml-2 text-sm text-gray-700">
                          I agree to receive marketing materials and updates from Tavari
                        </label>
                      </div>

                      <button
                        onClick={handleBuildAgent}
                        disabled={building}
                        className="w-full px-6 py-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        Build My Assistant (10 Seconds)
                      </button>
                    </div>
                  </>
                ) : (
                  /* Loading State */
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700">{buildingText}</p>
                  </div>
                )}
              </>
            ) : (
              /* Demo Ready State */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Your AI assistant is ready
                  </h2>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-center space-y-4">
                    <p className="text-gray-700 font-medium">
                      <strong>{businessName}</strong>
                    </p>
                    <p className="text-sm text-gray-600 italic">
                      "{openingGreeting}"
                    </p>
                    
                    {!callActive ? (
                      <button
                        onClick={handlePlayDemo}
                        disabled={playing || callCompleted}
                        className="px-8 py-4 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                      >
                        {playing ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            Connecting to AI...
                          </>
                        ) : callCompleted ? (
                          <span className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Demo Completed
                          </span>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                            Play Demo Call
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>
                          <span className="font-medium">Call Active</span>
                        </div>
                        <button
                          onClick={handleEndCall}
                          className="px-8 py-4 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold text-lg flex items-center justify-center gap-2 mx-auto"
                        >
                          <div className="w-3 h-3 bg-white rounded-full"></div>
                          End Call
                        </button>
                      </div>
                    )}
                    
                    {callError && (
                      <p className="text-sm text-red-600 font-medium flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {callError}
                      </p>
                    )}
                    
                    {!callCompleted && !callError && (
                      <p className="text-sm text-gray-600">
                        Your call summary will be emailed to you automatically.
                      </p>
                    )}
                    
                    {callCompleted && !callError && (
                      <p className="text-sm text-green-600 font-medium flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Call summary sent to {formData.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Post-Demo CTA */}
                {callCompleted && (
                  <div className="border-t-2 border-gray-300 pt-8 mt-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                      Want this answering your real phone?
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link
                        href="/signup"
                        className="flex-1 px-8 py-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-lg text-center transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                        onClick={() => {
                          if (typeof window !== 'undefined' && window.gtag) {
                            window.gtag('event', 'go_live_clicked', {
                              event_category: 'demo',
                              event_label: 'conversion_cta',
                            });
                          }
                        }}
                      >
                        Go Live in 10 Minutes
                      </Link>
                      <Link
                        href="/signup"
                        className="flex-1 px-8 py-5 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-lg text-center transition-all"
                        onClick={() => {
                          if (typeof window !== 'undefined' && window.gtag) {
                            window.gtag('event', 'try_on_phone_clicked', {
                              event_category: 'demo',
                              event_label: 'conversion_cta',
                            });
                          }
                        }}
                      >
                        Try It on My Phone Number
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
