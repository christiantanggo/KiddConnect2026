'use client';

import { useState, useEffect, useRef } from 'react';

export default function HelcimPaymentForm({ customerId, onSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const helcimJsLoaded = useRef(false);

  useEffect(() => {
    // Check if Helcim.js is already loaded
    if (typeof window !== 'undefined' && window.HelcimPay) {
      helcimJsLoaded.current = true;
      setScriptLoading(false);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="helcim.js"]');
    if (existingScript) {
      // Wait for existing script to load
      existingScript.addEventListener('load', () => {
        helcimJsLoaded.current = true;
        setScriptLoading(false);
      });
      existingScript.addEventListener('error', () => {
        setError('Failed to load Helcim.js. Please refresh the page.');
        setScriptLoading(false);
      });
      return;
    }

    // Load Helcim.js script
    if (typeof window !== 'undefined' && !helcimJsLoaded.current) {
      console.log('[HelcimPaymentForm] Loading Helcim.js script...');
      const script = document.createElement('script');
      // Try different Helcim.js URLs - the versioned one might not work
      // Try without version first, then fallback to versioned
      script.src = 'https://secure.helcim.com/helcim.js';
      script.async = true;
      // Don't set crossOrigin - let browser handle it naturally
      console.log('[HelcimPaymentForm] Script src:', script.src);
      
      script.onload = () => {
        console.log('[HelcimPaymentForm] Script onload fired');
        // Wait a bit for HelcimPay to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        const checkHelcim = setInterval(() => {
          attempts++;
          console.log(`[HelcimPaymentForm] Checking for HelcimPay (attempt ${attempts}/${maxAttempts})...`);
          console.log('[HelcimPaymentForm] window.HelcimPay:', typeof window.HelcimPay);
          console.log('[HelcimPaymentForm] window keys:', Object.keys(window).filter(k => k.toLowerCase().includes('helcim')));
          
          if (window.HelcimPay) {
            console.log('[HelcimPaymentForm] ✅ HelcimPay found!');
            helcimJsLoaded.current = true;
            setScriptLoading(false);
            clearInterval(checkHelcim);
          } else if (attempts >= maxAttempts) {
            console.error('[HelcimPaymentForm] ❌ HelcimPay not found after 5 seconds');
            clearInterval(checkHelcim);
            setError('Helcim.js loaded but HelcimPay object is not available. Please check that NEXT_PUBLIC_HELCIM_JS_TOKEN is set correctly in Vercel.');
            setScriptLoading(false);
          }
        }, 100);
      };
      
      script.onerror = (error) => {
        console.error('[HelcimPaymentForm] ❌ Script load error for:', script.src);
        console.error('[HelcimPaymentForm] Error details:', error);
        
        // Try fallback URL with version
        if (script.src.includes('/helcim.js') && !script.src.includes('/version/')) {
          console.log('[HelcimPaymentForm] Trying fallback URL with version...');
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://secure.helcim.com/js/version/2.1.0/helcim.js';
          fallbackScript.async = true;
          fallbackScript.onload = () => {
            console.log('[HelcimPaymentForm] ✅ Fallback script loaded');
            // Check for HelcimPay
            let attempts = 0;
            const checkHelcim = setInterval(() => {
              attempts++;
              if (window.HelcimPay) {
                console.log('[HelcimPaymentForm] ✅ HelcimPay found via fallback!');
                helcimJsLoaded.current = true;
                setScriptLoading(false);
                clearInterval(checkHelcim);
              } else if (attempts >= 50) {
                clearInterval(checkHelcim);
                setError('Helcim.js loaded but HelcimPay object is not available. Please check that NEXT_PUBLIC_HELCIM_JS_TOKEN is set correctly in Vercel.');
                setScriptLoading(false);
              }
            }, 100);
          };
          fallbackScript.onerror = () => {
            console.error('[HelcimPaymentForm] ❌ Fallback script also failed');
            setError('Unable to load Helcim.js payment library. Helcim\'s CDN appears to be unavailable (Error 522). Please try again in a few minutes, or contact Helcim support if the issue persists.');
            setScriptLoading(false);
          };
          document.head.appendChild(fallbackScript);
        } else {
          setError('Failed to load Helcim.js script. Please check your internet connection and try again.');
          setScriptLoading(false);
        }
      };
      
      // Try loading in head first (better for external scripts)
      document.head.appendChild(script);
      console.log('[HelcimPaymentForm] Script tag added to document head');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check if Helcim.js is loaded
      if (scriptLoading) {
        throw new Error('Helcim.js is still loading. Please wait a moment and try again.');
      }
      
      if (typeof window === 'undefined' || !window.HelcimPay) {
        throw new Error('Helcim.js is not loaded. Please refresh the page.');
      }

      // Get form data
      const formData = new FormData(e.target);
      const cardData = {
        cardNumber: formData.get('cardNumber').replace(/\s/g, ''),
        cardExpiry: formData.get('cardExpiry'),
        cardCVV: formData.get('cardCVV'),
        cardHolderName: formData.get('cardHolderName'),
      };

      // Tokenize card with Helcim.js
      const helcimJsToken = process.env.NEXT_PUBLIC_HELCIM_JS_TOKEN;
      if (!helcimJsToken) {
        throw new Error('Helcim.js token is not configured. Please contact support.');
      }

      const tokenResponse = await window.HelcimPay.tokenize({
        token: helcimJsToken,
        cardNumber: cardData.cardNumber,
        cardExpiry: cardData.cardExpiry,
        cardCVV: cardData.cardCVV,
        cardHolderName: cardData.cardHolderName,
      });

      if (!tokenResponse || !tokenResponse.token) {
        throw new Error('Failed to tokenize card. Please check your card details.');
      }

      // Send token to backend to save payment method
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com';
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];

      const response = await fetch(`${API_URL}/api/billing/payment-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: customerId,
          paymentToken: tokenResponse.token,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save payment method');
      }

      const result = await response.json();
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Failed to add payment method. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Debug logging
  useEffect(() => {
    console.log('[HelcimPaymentForm] Component mounted');
    console.log('[HelcimPaymentForm] customerId:', customerId);
    console.log('[HelcimPaymentForm] scriptLoading:', scriptLoading);
    console.log('[HelcimPaymentForm] error:', error);
  }, [customerId, scriptLoading, error]);

  if (!customerId) {
    console.warn('[HelcimPaymentForm] No customerId provided');
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Add Payment Method</h2>
        
        {scriptLoading && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">Loading Helcim.js payment library...</p>
            <p className="text-xs mt-1">This may take a few seconds. Please wait.</p>
            <p className="text-xs mt-1 text-blue-600">If this takes too long, check the browser console for errors.</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">{error}</p>
            {(error.includes('522') || error.includes('CDN') || error.includes('unavailable')) && (
              <div className="mt-2 text-sm">
                <p className="mb-1">This appears to be a temporary issue with Helcim's servers.</p>
                <p className="mb-1"><strong>What you can do:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Wait a few minutes and try again</li>
                  <li>Contact Helcim support at support@helcim.com</li>
                  <li>Check Helcim's status page for service updates</li>
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cardholder Name
              </label>
              <input
                type="text"
                name="cardHolderName"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card Number
              </label>
              <input
                type="text"
                name="cardNumber"
                required
                maxLength="19"
                pattern="[0-9\s]{13,19}"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="1234 5678 9012 3456"
                onChange={(e) => {
                  // Format card number with spaces
                  const value = e.target.value.replace(/\s/g, '');
                  const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
                  e.target.value = formatted;
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry (MM/YY)
                </label>
                <input
                  type="text"
                  name="cardExpiry"
                  required
                  maxLength="5"
                  pattern="[0-9]{2}/[0-9]{2}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="12/25"
                  onChange={(e) => {
                    // Format expiry
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length >= 2) {
                      value = value.substring(0, 2) + '/' + value.substring(2, 4);
                    }
                    e.target.value = value;
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CVV
                </label>
                <input
                  type="text"
                  name="cardCVV"
                  required
                  maxLength="4"
                  pattern="[0-9]{3,4}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="123"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || scriptLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : scriptLoading ? 'Loading...' : 'Add Payment Method'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

