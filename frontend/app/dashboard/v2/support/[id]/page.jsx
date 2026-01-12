'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { supportAPI } from '@/lib/api';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { ArrowLeft, User, MessageSquare } from 'lucide-react';

function SupportTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const ticketId = params.id;
  
  const [ticket, setTicket] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responseText, setResponseText] = useState('');

  useEffect(() => {
    loadTicket();
    loadModules();
  }, [ticketId]);

  const loadModules = async () => {
    try {
      // Try the simpler list endpoint first (no business context required)
      const response = await api.get('/v2/modules/list');
      setModules(response.data?.modules || []);
    } catch (error) {
      console.error('Failed to load modules:', error);
      // If that fails, try the full endpoint (requires business context)
      try {
        const response = await api.get('/v2/modules');
        setModules(response.data?.modules || []);
      } catch (fallbackError) {
        console.error('Failed to load modules (fallback):', fallbackError);
        // Keep modules as empty array - getModuleName will just show the key or "General"
      }
    }
  };

  const loadTicket = async () => {
    try {
      setLoading(true);
      const response = await supportAPI.getTicket(ticketId);
      setTicket(response.data.ticket);
    } catch (error) {
      console.error('Failed to load ticket:', error);
      showError('Failed to load ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddResponse = async () => {
    if (!responseText.trim()) {
      showError('Please enter a response');
      return;
    }

    setSubmitting(true);
    try {
      await supportAPI.addResponse(ticketId, responseText);
      success('Your response has been sent!');
      setResponseText('');
      await loadTicket(); // Reload to show new response
    } catch (error) {
      console.error('Failed to add response:', error);
      showError(error.response?.data?.error || 'Failed to add response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'low':
        return 'bg-gray-100 text-gray-800';
      case 'normal':
        return 'bg-blue-100 text-blue-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'urgent':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getModuleName = (moduleKey) => {
    if (!moduleKey) return 'General';
    const module = modules.find(m => m.key === moduleKey);
    return module ? module.name : moduleKey;
  };

  // Parse resolution notes to show conversation thread
  const parseConversation = (notes) => {
    if (!notes) return [];
    
    const lines = notes.split('\n');
    const conversations = [];
    let currentEntry = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this is a new entry header (starts with "---")
      if (line.startsWith('---')) {
        // Save previous entry if exists
        if (currentEntry) {
          conversations.push(currentEntry);
        }
        
        // Parse header: "--- Response from Name (timestamp) ---"
        const match = line.match(/---\s*Response from\s+(.+?)\s+\((.+?)\)\s*---/);
        if (match) {
          currentEntry = {
            author: match[1],
            timestamp: match[2],
            text: '',
            isAdmin: !match[1].includes('@') && match[1] !== 'Customer', // Simple heuristic
          };
        }
      } else if (currentEntry && line.trim()) {
        // Add line to current entry
        currentEntry.text += (currentEntry.text ? '\n' : '') + line;
      }
    }
    
    // Add last entry
    if (currentEntry) {
      conversations.push(currentEntry);
    }
    
    return conversations;
  };

  if (loading) {
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
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-lg">Loading ticket...</div>
            </div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  if (!ticket) {
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
            <div className="container mx-auto px-4 py-8 max-w-6xl">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Ticket Not Found</h1>
                <Link href="/dashboard/v2/support" className="text-blue-600 hover:text-blue-800">
                  Back to Tickets
                </Link>
              </div>
            </div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  const conversations = parseConversation(ticket.resolution_notes);

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
              <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-6">
                  <Link href="/dashboard/v2/support" className="text-blue-600 hover:text-blue-800 mb-4 inline-flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Tickets
                  </Link>
                </div>

            {/* Ticket Header */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Ticket #{ticket.id.substring(0, 8)}
                  </h1>
                  <div className="flex gap-2 mb-2">
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace('-', ' ')}
                    </span>
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getUrgencyColor(ticket.urgency)}`}>
                      {ticket.urgency} urgency
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>Created: {formatDate(ticket.created_at)}</div>
                  {ticket.resolved_at && (
                    <div>Resolved: {formatDate(ticket.resolved_at)}</div>
                  )}
                </div>
              </div>

              {/* Issue Details */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-900 mb-2">Issue Details</h3>
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-600">Module:</span>{' '}
                  <span className="text-gray-900">{getModuleName(ticket.module_key)}</span>
                </div>
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-600">Issue Type:</span>{' '}
                  <span className="text-gray-900 capitalize">{ticket.issue_type.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600 block mb-2">Description:</span>
                  <div className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap text-gray-900">
                    {ticket.description}
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Thread */}
            {conversations.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Conversation</h3>
                <div className="space-y-4">
                  {conversations.map((entry, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        entry.isAdmin
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'bg-gray-50 border-l-4 border-gray-400'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-gray-900 flex items-center gap-2">
                          {entry.isAdmin ? (
                            <>
                              <User className="w-4 h-4" />
                              Support Team
                            </>
                          ) : (
                            <>
                              <MessageSquare className="w-4 h-4" />
                              You
                            </>
                          )}
                        </span>
                        <span className="text-sm text-gray-500">{entry.timestamp}</span>
                      </div>
                      <div className="text-gray-900 whitespace-pre-wrap">{entry.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Response */}
            {ticket.status !== 'closed' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Add Response</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {ticket.status === 'resolved' 
                    ? 'This ticket has been resolved. You can still add a response if you need further assistance.'
                    : 'Add a response or provide additional information about your issue.'}
                </p>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-gray-900 bg-white"
                />
                <button
                  onClick={handleAddResponse}
                  disabled={submitting || !responseText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {submitting ? 'Sending...' : 'Send Response'}
                </button>
              </div>
            )}

            {ticket.status === 'closed' && (
              <div className="bg-gray-50 rounded-lg shadow p-6 text-center">
                <p className="text-gray-600">This ticket has been closed and no further responses can be added.</p>
              </div>
            )}
          </main>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default SupportTicketDetailPage;

