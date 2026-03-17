'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginResponse = await login(email, password);
      const onboardingComplete = loginResponse?.business?.onboarding_complete;
      
      // If onboarding is not complete, redirect to setup wizard
      if (!onboardingComplete) {
        // Check which module they have to determine which setup wizard to use
        const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
        const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
        
        try {
          const modulesRes = await fetch(`${API_URL}/api/v2/modules`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (modulesRes.ok) {
            const modulesData = await modulesRes.json();
            const modules = modulesData.modules || [];
            
            // Check if they have an active reviews module
            const reviewsModule = modules.find(m => m.key === 'reviews' && m.subscription?.status === 'active');
            
            if (reviewsModule) {
              // Redirect to Review Reply setup wizard
              router.push('/modules/reviews/setup');
              return;
            }
          }
        } catch (modulesError) {
          console.error('Error fetching modules:', modulesError);
          // Fall through to phone agent setup if we can't determine module
        }
        
        // Default to phone agent setup wizard
        router.push('/dashboard/setup');
      } else {
        // Onboarding complete, go to dashboard
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      console.error('Login error response:', err.response);
      console.error('Login error message:', err.message);
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';
      console.error('Setting error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">Login</h1>
        
        {error && (
          <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded mb-4 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
        
        <p className="mt-2 text-center text-sm">
          <Link href="/reset-password" className="text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </p>
      </div>
      
      {/* Deployment date indicator */}
      <div style={{ position: 'fixed', bottom: '16px', left: '16px', fontSize: '12px', color: '#6b7280', backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: '4px 8px', borderRadius: '4px', zIndex: 9999 }}>
        Deployed December 19 2025 v1
      </div>
    </div>
  );
}

