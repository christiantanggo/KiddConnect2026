'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signup } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '', // Business name
    termsAccepted: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activationStatus, setActivationStatus] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // Validate required fields
    if (!formData.email || !formData.password || !formData.name) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }
    
    // Validate password length
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }
    
    // Validate terms acceptance
    if (!formData.termsAccepted) {
      setError('You must agree to the Terms of Service and Privacy Policy to create an account');
      setLoading(false);
      return;
    }
    
    try {
      // Only send minimal required data - rest will be collected in setup wizard
      const response = await signup({
        email: formData.email,
        password: formData.password,
        name: formData.name, // Business name
        first_name: '',
        last_name: '',
        phone: '',
        public_phone_number: '',
        address: '',
        timezone: 'America/New_York', // Default, can be changed in wizard
        business_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
          wednesday: { open: '09:00', close: '17:00', closed: false },
          thursday: { open: '09:00', close: '17:00', closed: false },
          friday: { open: '09:00', close: '17:00', closed: false },
          saturday: { closed: true },
          sunday: { closed: true },
        },
        contact_email: formData.email,
        terms_accepted: true, // User has accepted terms (validated above)
      });

      // Check if signup succeeded (we got a token)
      if (response?.token) {
        // Account was created successfully - redirect to AI marketplace
        setActivationStatus('success');
        // Redirect to marketplace after a brief delay
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        // Signup failed
        setActivationStatus('error');
        setError(response?.error || 'Signup failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Signup failed';
      const errorCode = err.response?.data?.code;
      
      // If account already exists, redirect to login
      if (errorCode === 'ACCOUNT_EXISTS' || (errorMessage.includes('already exists') && errorMessage.includes('log in'))) {
        setError(errorMessage);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Success screen - redirecting to setup wizard
  if (activationStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h1>
          <p className="text-gray-600 mb-4">Redirecting to AI marketplace...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Simple signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">Sign Up</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          Create your account to get started. You'll complete the full setup in the next step.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Minimum 8 characters"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Business Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Your Business Name"
            />
          </div>

          {/* Terms Acceptance */}
          <div className="space-y-2">
            <label className="flex items-start">
              <input
                type="checkbox"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                required
                className="mt-1 mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link href="/privacy" target="_blank" className="text-blue-600 hover:underline font-medium">
                  Privacy Policy
                </Link>
                {' '}*
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              By creating an account, you acknowledge that you have read, understood, and agree to be bound by our Terms of Service 
              and Privacy Policy, including our AI disclaimer and limitation of liability provisions.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !formData.termsAccepted}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
