'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = enter email, 2 = enter code and password

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      console.log('[Reset Password] Requesting code for:', email);
      await authAPI.forgotPassword(email);
      console.log('[Reset Password] Code request successful');
      setStep(2);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000); // Hide success message after 5 seconds
    } catch (err) {
      console.error('Request code error:', err);
      console.error('Error response:', err.response);
      setError(err.response?.data?.error || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);

    try {
      console.log('[Reset Password] Resetting password for:', email);
      await authAPI.resetPassword({ code, email, password });
      console.log('[Reset Password] Password reset successful');
      setStep(3);
      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      console.error('Reset password error:', err);
      console.error('Error response:', err.response);
      setError(err.response?.data?.error || 'Failed to reset password. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">Reset Password</h1>
        
        {step === 3 ? (
          <div className="space-y-4">
            <div className="bg-green-50 border-2 border-green-300 text-green-700 px-4 py-3 rounded mb-4 font-medium">
              Password has been reset successfully! Redirecting to login...
            </div>
            <Link
              href="/login"
              className="block w-full text-center bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
            >
              Go to Login
            </Link>
          </div>
        ) : step === 1 ? (
          <>
            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded mb-4 font-medium">
                {error}
              </div>
            )}

            <p className="text-sm text-gray-600 mb-4 text-center">
              Enter your email address and we'll send you a code to reset your password.
            </p>

            <form onSubmit={handleSendCode} className="space-y-4">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending Code...' : 'Send Reset Code'}
              </button>
            </form>
          </>
        ) : step === 2 ? (
          <>
            {success && (
              <div className="bg-green-50 border-2 border-green-300 text-green-700 px-4 py-3 rounded mb-4 font-medium">
                Reset code sent! Check your email.
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded mb-4 font-medium">
                {error}
              </div>
            )}

            <p className="text-sm text-gray-600 mb-4 text-center">
              Enter the 6-digit code sent to <strong>{email}</strong> and your new password.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="email-display" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email-display"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Reset Code
                </label>
                <input
                  type="text"
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-center text-2xl tracking-widest font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code from your email</p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setCode('');
                  setPassword('');
                  setConfirmPassword('');
                  setError('');
                  setSuccess(false);
                }}
                className="w-full text-sm text-gray-600 hover:text-gray-800 py-2"
              >
                Use a different email
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-600">
              <Link href="/login" className="text-blue-600 hover:underline">
                Back to Login
              </Link>
            </p>
          </>
        ) : null}
      </div>
      
      {/* Deployment date indicator */}
      <div style={{ position: 'fixed', bottom: '16px', left: '16px', fontSize: '12px', color: '#6b7280', backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: '4px 8px', borderRadius: '4px', zIndex: 9999 }}>
        Deployed March 31 2026 V1
      </div>
    </div>
  );
}
