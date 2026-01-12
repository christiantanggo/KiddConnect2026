'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';
import { callsAPI } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

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
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      date = new Date(dateString);
    } else {
      date = new Date(dateString + 'Z');
    }
    
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
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  if (error || !call) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div 
            className="px-4 py-3 mb-6"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--card-radius)',
            }}
          >
            <p>{error || 'Call not found'}</p>
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
          {/* Module Action Cards */}
          <PhoneAgentV2ActionCards />
          
          <div className="mb-6">
            <Link 
              href="/tavari-ai-phone/dashboard/calls"
              className="text-sm"
              style={{ color: 'var(--color-accent)' }}
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Calls
            </Link>
          </div>

          <div 
            className="shadow-lg"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--padding-base)',
            }}
          >
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text-main)' }}>Call Details</h1>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Caller</label>
                <p className="text-lg" style={{ color: 'var(--color-text-main)' }}>{call.caller_number || 'Unknown'}</p>
              </div>
              
              <div>
                <label className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Date & Time</label>
                <p style={{ color: 'var(--color-text-main)' }}>{formatDate(call.started_at)}</p>
              </div>
              
              <div>
                <label className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Duration</label>
                <p style={{ color: 'var(--color-text-main)' }}>{formatDuration(call.duration_seconds)}</p>
              </div>
              
              <div>
                <label className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                <p style={{ color: 'var(--color-text-main)' }} className="capitalize">{call.status || 'Unknown'}</p>
              </div>
              
              {call.message_taken && (
                <div 
                  className="p-4"
                  style={{
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    borderRadius: 'var(--card-radius)',
                  }}
                >
                  <label className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>Message Taken</label>
                  <p className="mt-2" style={{ color: 'var(--color-text-main)' }}>{call.message_text || 'No message text available'}</p>
                </div>
              )}
              
              {call.transcript && (
                <div>
                  <label className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Transcript</label>
                  <div 
                    className="p-4 mt-2"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      borderRadius: 'var(--card-radius)',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    <p className="whitespace-pre-wrap" style={{ color: 'var(--color-text-main)' }}>{call.transcript}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default CallDetailPage;

