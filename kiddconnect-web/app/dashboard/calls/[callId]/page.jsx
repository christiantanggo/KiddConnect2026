'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { callsAPI } from '@/lib/api';

function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params.callId;
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (callId) {
      loadCall();
    }
  }, [callId]);

  const loadCall = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await callsAPI.get(callId);
      setCall(res.data.call);
    } catch (error) {
      console.error('Failed to load call:', error);
      setError('Failed to load call details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // Ensure the date string is treated as UTC if it doesn't have timezone info
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      // Already has timezone info
      date = new Date(dateString);
    } else {
      // Assume UTC if no timezone specified (database timestamps are typically UTC)
      date = new Date(dateString + 'Z');
    }
    
    // Convert to local timezone for display
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg">Loading call details...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error || !call) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader />
          <main className="container mx-auto px-4 py-8">
            <div className="bg-white rounded-lg shadow p-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Call Not Found</h2>
                <p className="text-gray-600 mb-6">{error || 'The call you are looking for does not exist.'}</p>
                <Link
                  href="/dashboard/calls"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Back to Calls
                </Link>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-4">
            <Link
              href="/dashboard/calls"
              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
            >
              ← Back to Calls
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">Call Details</h1>
            </div>

            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Call Information */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Call Information</h2>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Call ID</dt>
                      <dd className="mt-1 text-sm text-gray-900 font-mono">{call.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="mt-1">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            call.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : call.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {call.status || 'unknown'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Started At</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {formatDate(call.started_at || call.created_at)}
                      </dd>
                    </div>
                    {call.ended_at && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Ended At</dt>
                        <dd className="mt-1 text-sm text-gray-900">{formatDate(call.ended_at)}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Duration</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {formatDuration(call.duration_seconds)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Caller Information */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Caller Information</h2>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone Number</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {call.caller_number || 'Unknown'}
                      </dd>
                    </div>
                    {call.caller_name && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Name</dt>
                        <dd className="mt-1 text-sm text-gray-900">{call.caller_name}</dd>
                      </div>
                    )}
                    {call.vapi_call_id && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">VAPI Call ID</dt>
                        <dd className="mt-1 text-sm text-gray-900 font-mono break-all">
                          {call.vapi_call_id}
                        </dd>
                      </div>
                    )}
                    {call.voximplant_call_id && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Voximplant Call ID</dt>
                        <dd className="mt-1 text-sm text-gray-900 font-mono break-all">
                          {call.voximplant_call_id}
                        </dd>
                      </div>
                    )}
                    {call.transfer_attempted !== undefined && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Transfer Attempted</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {call.transfer_attempted ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* Transcript */}
              {call.transcript && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Transcript</h2>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans">
                      {call.transcript}
                    </pre>
                  </div>
                </div>
              )}

              {/* Summary */}
              {call.summary && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{call.summary}</p>
                  </div>
                </div>
              )}

              {/* Intent */}
              {call.intent && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Intent</h2>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <span className="px-3 py-1 inline-flex text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                      {call.intent}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default CallDetailPage;

