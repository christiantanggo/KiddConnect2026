'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Vapi from '@vapi-ai/web';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

export default function DemoPage() {
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
  const [vapiReady, setVapiReady] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [summaryEmailSent, setSummaryEmailSent] = useState(false);

  const buildingTexts = [
    'Building your AI assistant…',
    'Applying your business info…',
    'Configuring voice…',
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBuildAgent = async () => {
    if (!formData.businessName || !formData.faq1 || !formData.answer1 || !formData.email) {
      alert('Please fill in all required fields: Business Name, FAQ #1, Answer #1, and Email');
      return;
    }

    setBuilding(true);
    setBuildingText(buildingTexts[0]);
    let textIndex = 0;

    // Rotate building text
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
      console.log('[Demo] Assistant created:', data);
      setAssistantId(data.assistantId);
      setBusinessName(data.businessName);
      setOpeningGreeting(data.openingGreeting);
      setDemoReady(true);
      setBuilding(false);
      
      // Store assistantId in sessionStorage as backup
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demoAssistantId', data.assistantId);
      }

      // Track analytics
      if (typeof window !== 'undefined' && window.gtag) {
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
    // Get assistantId from state or sessionStorage
    const currentAssistantId = assistantId || (typeof window !== 'undefined' ? sessionStorage.getItem('demoAssistantId') : null);
    
    if (!currentAssistantId) {
      setCallError('No assistant ID found. Please create a new demo.');
      return;
    }

    setPlaying(true);
    setCallError(null);

    console.log('[Demo] Starting call with assistantId:', currentAssistantId);

    try {
      // Create a web call via the server to get connection info
      const response = await fetch(`${API_URL}/api/demo/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: currentAssistantId,
          email: formData.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create demo call');
      }

      const data = await response.json();
      
      console.log('[Demo] Response data:', data);
      
      // If we got a webCallUrl, embed it in an iframe
      if (data.webCallUrl) {
        console.log('[Demo] ✅ Web call URL received:', data.webCallUrl);
        // Embed the web call URL
        await connectWithVapiSDK(assistantId, data.webCallUrl);
      } else if (data.success && data.assistantId) {
        // Assistant validated - use VAPI SDK to start the call
        console.log('[Demo] ✅ Assistant validated, starting call with VAPI SDK');
        await connectWithVapiSDK(data.assistantId);
      } else if (data.callId) {
        // If we have a call ID but no webCallUrl, try to use VAPI SDK directly
        console.log('[Demo] Call ID received but no webCallUrl, trying VAPI SDK:', data.callId);
        await connectWithVapiSDK(assistantId);
      } else {
        // No call created - show error
        setCallError(data.error || 'Failed to create web call. Please try again.');
        setPlaying(false);
        console.error('[Demo] ❌ No webCallUrl or callId in response');
      }

      // Track analytics
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'demo_played', {
          event_category: 'demo',
          event_label: 'browser_call',
        });
      }
    } catch (error) {
      console.error('[Demo] Failed to start call:', error);
      setCallError(error.message || 'Failed to start demo call');
      setPlaying(false);
    }
  };

  async function connectWithVapiSDK(assistantId, webCallUrl = null) {
    try {
      if (webCallUrl) {
        // Embed the web call URL in an iframe for seamless experience
        console.log('[Demo] Embedding web call:', webCallUrl);
        
        // Find the demo container
        const container = document.querySelector('.bg-gray-50.rounded-lg.p-6');
        if (container) {
          // Remove existing iframe if any
          const existingIframe = container.querySelector('iframe');
          if (existingIframe) existingIframe.remove();
          
          // Remove the button and other content, replace with iframe
          const button = container.querySelector('button');
          const errorMsg = container.querySelector('.text-red-600');
          const successMsg = container.querySelector('.text-green-600');
          
          if (button) button.style.display = 'none';
          if (errorMsg) errorMsg.style.display = 'none';
          if (successMsg) successMsg.style.display = 'none';
          
          // Create iframe
          const iframe = document.createElement('iframe');
          iframe.src = webCallUrl;
          iframe.style.width = '100%';
          iframe.style.height = '600px';
          iframe.style.border = 'none';
          iframe.style.borderRadius = '8px';
          iframe.style.marginTop = '16px';
          iframe.allow = 'microphone; camera';
          iframe.title = 'AI Assistant Demo Call';
          
          container.appendChild(iframe);
          
          setPlaying(false);
          // Don't set callCompleted yet - wait for call to actually complete
          console.log('[Demo] ✅ Web call iframe embedded');
        } else {
          // Fallback: open in new window
          window.open(webCallUrl, '_blank', 'width=800,height=600');
          setPlaying(false);
        }
        return;
      }

      // If no webCallUrl, try using VAPI SDK directly
      // Get public key from server
      console.log('[Demo] Fetching public key from:', `${API_URL}/api/demo/public-key`);
      const keyResponse = await fetch(`${API_URL}/api/demo/public-key`);
      
      if (!keyResponse.ok) {
        throw new Error(`Failed to fetch public key: ${keyResponse.status} ${keyResponse.statusText}`);
      }
      
      const keyData = await keyResponse.json();
      console.log('[Demo] Public key response:', { hasPublicKey: !!keyData.publicKey, message: keyData.message });
      
      const publicKey = keyData.publicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
      
      if (!publicKey) {
        console.error('[Demo] ❌ No public key found');
        console.error('[Demo] Server response:', keyData);
        throw new Error('VAPI public key not configured. Please set VAPI_PUBLIC_KEY in your .env file and restart the server, or set NEXT_PUBLIC_VAPI_PUBLIC_KEY in the frontend environment.');
      }
      
      console.log('[Demo] ✅ Public key retrieved, length:', publicKey.length);

      // Initialize VAPI SDK with public key
      const vapi = new Vapi(publicKey);
      
      // Set up event handlers
      vapi.on('call-start', () => {
        console.log('[Demo] Call started');
        setPlaying(false); // Stop loading spinner
        setCallActive(true); // Mark call as active
      });

      vapi.on('call-end', async (data) => {
        console.log('[Demo] Call ended', data);
        setCallCompleted(true);
        setCallActive(false); // Mark call as inactive
        
        // Prevent duplicate email sends
        if (summaryEmailSent) {
          console.log('[Demo] Summary email already sent, skipping call-end handler');
          setVapiCall(null);
          return;
        }
        
        // Get call ID if available - check multiple possible locations
        let callId = data?.call?.id || data?.id || data?.callId || null;
        
        // If not in event data, try to get from VAPI instance
        if (!callId && vapiCall) {
          try {
            // VAPI SDK might store call info differently - check various properties
            callId = vapiCall.call?.id || vapiCall._call?.id || vapiCall.callId || null;
            console.log('[Demo] Trying to get call ID from vapi instance:', callId);
          } catch (e) {
            console.log('[Demo] Could not extract call ID from vapi instance:', e.message);
          }
        }
        
        console.log('[Demo] Call ID from event:', callId);
        console.log('[Demo] Full call-end data:', JSON.stringify(data, null, 2));
        console.log('[Demo] VapiCall object keys:', vapiCall ? Object.keys(vapiCall) : 'null');
        
        // Send summary email (backend handles waiting and retries)
        try {
          const summaryResponse = await fetch(`${API_URL}/api/demo/send-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              assistantId: assistantId,
              callId: callId,
              email: formData.email,
            }),
          });
          
          if (summaryResponse.ok) {
            const result = await summaryResponse.json();
            console.log('[Demo] ✅ Summary email request sent:', result);
            setSummaryEmailSent(true); // Mark as sent to prevent duplicates
          } else {
            const error = await summaryResponse.json().catch(() => ({}));
            console.error('[Demo] Failed to send summary email request:', error);
          }
        } catch (emailError) {
          console.error('[Demo] Error sending summary email request:', emailError);
        }
        
        setVapiCall(null); // Clear VAPI instance
      });

      vapi.on('error', (error) => {
        console.error('[Demo] VAPI error:', error);
        setCallError(error.message || 'Call error occurred');
        setPlaying(false);
        setCallActive(false);
      });

      // Start the call with assistant ID
      await vapi.start(assistantId);
      setVapiCall(vapi);
      console.log('[Demo] ✅ Browser call started with VAPI SDK');
      
    } catch (error) {
      console.error('[Demo] Failed to connect with VAPI SDK:', error);
      setCallError(error.message || 'Failed to connect to call. Please try again.');
      setPlaying(false);
    }
  }

  const handleEndCall = async () => {
    try {
      if (vapiCall) {
        console.log('[Demo] Ending call...');
        
        // Stop the call using VAPI SDK
        // The call-end event will fire automatically and handle the email
        await vapiCall.stop();
        setCallActive(false);
        setCallCompleted(true);
        
        // Don't send email here - let the call-end event handler do it
        // This prevents duplicate emails
        
        setVapiCall(null);
        console.log('[Demo] ✅ Call ended');
      }
    } catch (error) {
      console.error('[Demo] Error ending call:', error);
      // Even if stop() fails, clear the state
      setCallActive(false);
      setVapiCall(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/tavari-logo.png"
                alt="Tavari AI"
                width={400}
                height={114}
                className="h-28 w-auto"
                style={{ width: 'auto', height: '7rem' }}
                priority
              />
            </Link>
            <div className="flex items-center space-x-6">
              <Link href="/login" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Login
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-sm hover:shadow-md"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Above the Fold */}
        <div className="grid md:grid-cols-2 gap-12 mb-16">
          {/* Left: Messaging + Trust */}
          <div className="space-y-6">
            <h1 className="text-5xl font-bold text-gray-900 leading-tight">
              Who's answering your phone when you're closed?
            </h1>
            <h2 className="text-2xl text-gray-700">
              Hear our AI answer your phone — as your business — in 10 seconds.
            </h2>
            <div className="space-y-2 text-gray-600">
              <p className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                No signup
              </p>
              <p className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                No credit card
              </p>
              <p className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Live instantly
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Built for real businesses. No scripts. No setup calls.
            </p>
          </div>

          {/* Right: Interactive Demo Builder */}
          <div className="bg-white rounded-lg shadow-xl p-8">
            {!demoReady ? (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">
                  Try it now — build your AI phone assistant
                </h3>
                
                {!building ? (
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
                        Answer #1
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
                        Answer #2 (optional)
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
                      className="w-full px-6 py-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Build My Agent (10 seconds)
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700">{buildingText}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Your AI assistant is ready
                  </h3>
                </div>

                {/* Audio Playback Section */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-center space-y-4">
                    <p className="text-gray-700 font-medium">
                      <strong>{businessName}</strong>
                    </p>
                    <p className="text-sm text-gray-600 italic">
                      "{openingGreeting}"
                    </p>
                    
                    {/* Browser-based audio call - no phone needed! */}
                    <p className="text-xs text-gray-500 mb-2">
                      Click play to talk to the AI assistant directly in your browser
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
                            Talk to AI Assistant
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

                {/* Post-Demo Conversion CTA */}
                {callCompleted && (
                  <div className="border-t pt-6 mt-6">
                    <h4 className="text-xl font-bold text-gray-900 mb-4 text-center">
                      Want this answering your real phone?
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link
                        href="/signup"
                        className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-center"
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
                        className="flex-1 px-6 py-4 border-2 border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 font-semibold text-center"
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

        {/* Social Proof Section */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Built for businesses that miss calls
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Answers calls 24/7</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Sends call summaries automatically</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Flags urgent calls instantly</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Live in minutes, not days</p>
            </div>
          </div>
        </div>

        {/* Setup Differentiator */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Live in 10 Minutes. No Setup Calls.
          </h2>
          <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              'Business info',
              'Hours',
              'Holidays',
              'Services',
              'FAQs',
              'Escalation rules',
              'Notifications',
              'Voice',
              'Go live',
            ].map((step, index) => (
              <div key={index} className="flex items-center space-x-2 p-3 bg-gray-50 rounded">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
                <span className="text-gray-700 font-medium">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Net Section */}
        <div className="bg-blue-50 rounded-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
            If the AI isn't sure, it never guesses
          </h2>
          <p className="text-gray-700 text-center max-w-2xl mx-auto">
            When the assistant doesn't have an answer, it takes a message and alerts your staff instantly.
          </p>
        </div>

        {/* Footer CTA */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-12 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Stop missing calls today</h2>
          <Link
            href="/signup"
            className="inline-block px-8 py-4 bg-white text-blue-600 rounded-md hover:bg-gray-100 font-semibold text-lg"
            onClick={() => {
              if (typeof window !== 'undefined' && window.gtag) {
                window.gtag('event', 'go_live_clicked', {
                  event_category: 'demo',
                  event_label: 'footer_cta',
                });
              }
            }}
          >
            Go Live in 10 Minutes
          </Link>
        </div>
      </main>
    </div>
  );
}

