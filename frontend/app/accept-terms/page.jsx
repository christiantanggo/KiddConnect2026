'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

export default function AcceptTermsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState({
    terms: false,
    privacy: false,
  });
  const [termsVersion, setTermsVersion] = useState(null);

  useEffect(() => {
    // Get current terms version from environment or API
    loadTermsVersion();
  }, []);

  const loadTermsVersion = async () => {
    // In a real app, this would fetch from API
    // For now, use default from env or hardcode
    setTermsVersion(process.env.NEXT_PUBLIC_TERMS_VERSION || '1.0.0');
  };

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const handleAccept = async () => {
    if (!accepted.terms || !accepted.privacy) {
      setError('Please accept both the Terms of Service and Privacy Policy to continue');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/auth/accept-terms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          terms_version: termsVersion,
        }),
      });

      if (res.ok) {
        // Redirect to dashboard
        const returnUrl = new URLSearchParams(window.location.search).get('return') || '/dashboard/v2';
        router.push(returnUrl);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to accept terms. Please try again.');
      }
    } catch (err) {
      console.error('[AcceptTerms] Error:', err);
      setError('Failed to accept terms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)', padding: 'var(--padding-base)' }}>
      <div 
        className="w-full max-w-2xl shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          padding: 'var(--padding-base)',
        }}
      >
        <h1 className="text-3xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
          Terms of Service & Privacy Policy
        </h1>
        
        <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Please review and accept our Terms of Service and Privacy Policy to continue using Tavari AI.
        </p>

        {termsVersion && (
          <p className="mb-6 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Version: {termsVersion}
          </p>
        )}

        {error && (
          <div 
            className="px-4 py-3 mb-6"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--card-radius)',
            }}
          >
            {error}
          </div>
        )}

        {/* Terms of Service */}
        <div 
          className="mb-6 p-4 border"
          style={{
            borderColor: 'var(--color-border)',
            borderRadius: 'var(--card-radius)',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>
            Terms of Service
          </h2>
          <div className="text-sm space-y-3" style={{ color: 'var(--color-text-muted)' }}>
            <p>
              By using Tavari AI, you agree to the following terms and conditions. Please read them carefully.
            </p>
            <p>
              <strong>1. Service Description:</strong> Tavari AI provides AI-powered communication and automation services for businesses.
            </p>
            <p>
              <strong>2. User Responsibilities:</strong> You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.
            </p>
            <p>
              <strong>3. Acceptable Use:</strong> You agree not to use the service for any unlawful purpose or in any way that could damage, disable, or impair the service.
            </p>
            <p>
              <strong>4. Payment Terms:</strong> Subscription fees are billed in advance. Refunds are handled according to our refund policy.
            </p>
            <p>
              <strong>5. Termination:</strong> We reserve the right to terminate or suspend your account at any time for violations of these terms.
            </p>
            <p className="text-xs mt-4">
              For the complete Terms of Service, please visit: <Link href="/terms" className="underline" style={{ color: 'var(--color-accent)' }}>Full Terms</Link>
            </p>
          </div>
        </div>

        {/* Privacy Policy */}
        <div 
          className="mb-6 p-4 border"
          style={{
            borderColor: 'var(--color-border)',
            borderRadius: 'var(--card-radius)',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>
            Privacy Policy
          </h2>
          <div className="text-sm space-y-3" style={{ color: 'var(--color-text-muted)' }}>
            <p>
              We are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.
            </p>
            <p>
              <strong>1. Information We Collect:</strong> We collect information you provide directly, usage data, and technical information about your device.
            </p>
            <p>
              <strong>2. How We Use Your Information:</strong> We use your information to provide, maintain, and improve our services, process payments, and communicate with you.
            </p>
            <p>
              <strong>3. Information Sharing:</strong> We do not sell your personal information. We may share information with service providers who assist us in operating our services.
            </p>
            <p>
              <strong>4. Data Security:</strong> We implement appropriate technical and organizational measures to protect your personal information.
            </p>
            <p>
              <strong>5. Your Rights:</strong> You have the right to access, update, or delete your personal information at any time.
            </p>
            <p className="text-xs mt-4">
              For the complete Privacy Policy, please visit: <Link href="/privacy" className="underline" style={{ color: 'var(--color-accent)' }}>Full Privacy Policy</Link>
            </p>
          </div>
        </div>

        {/* Acceptance Checkboxes */}
        <div className="space-y-4 mb-6">
          <label className="flex items-start cursor-pointer">
            <input
              type="checkbox"
              checked={accepted.terms}
              onChange={(e) => setAccepted(prev => ({ ...prev, terms: e.target.checked }))}
              className="mt-1 mr-3"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              I have read and agree to the <strong>Terms of Service</strong>
            </span>
          </label>

          <label className="flex items-start cursor-pointer">
            <input
              type="checkbox"
              checked={accepted.privacy}
              onChange={(e) => setAccepted(prev => ({ ...prev, privacy: e.target.checked }))}
              className="mt-1 mr-3"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              I have read and agree to the <strong>Privacy Policy</strong>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={loading || !accepted.terms || !accepted.privacy}
            className="flex-1 px-6 py-3 text-white font-medium transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderRadius: 'var(--button-radius)',
              height: 'var(--input-height)',
            }}
          >
            {loading ? 'Processing...' : 'Accept & Continue'}
          </button>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-main)',
              borderRadius: 'var(--button-radius)',
              height: 'var(--input-height)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}





