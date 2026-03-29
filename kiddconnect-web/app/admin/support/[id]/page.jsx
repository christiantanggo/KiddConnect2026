'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

function AdminSupportTicketPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id;
  
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  // Debug: Log when ticket changes
  useEffect(() => {
    if (ticket) {
      console.log('Ticket state updated:', ticket);
      console.log('Businesses in ticket:', ticket.businesses);
    }
  }, [ticket]);

  const loadTicket = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/support/tickets/${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Ticket data received:', data);
      console.log('Business data:', data.ticket?.businesses);
      console.log('Business name:', data.ticket?.businesses?.name);
      console.log('Full ticket object:', JSON.stringify(data.ticket, null, 2));
      
      if (data.ticket) {
        // Ensure businesses is properly set
        const ticketData = {
          ...data.ticket,
          businesses: data.ticket.businesses || null,
        };
        console.log('Setting ticket with businesses:', ticketData.businesses);
        setTicket(ticketData);
        setNewStatus(data.ticket.status);
        setResolutionNotes(data.ticket.resolution_notes || '');
      } else {
        console.error('No ticket data in response');
      }
    } catch (error) {
      console.error('Failed to load ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddResponse = async () => {
    if (!responseText.trim()) {
      alert('Please enter a response');
      return;
    }

    setUpdating(true);
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/support/tickets/${ticketId}/response`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response_text: responseText }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setResponseText('');
      await loadTicket(); // Reload to show new response
    } catch (error) {
      console.error('Failed to add response:', error);
      alert('Failed to add response. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus) {
      alert('Please select a status');
      return;
    }

    setUpdating(true);
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/support/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: newStatus,
          resolution_notes: resolutionNotes 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      await loadTicket(); // Reload to show updated status
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  function getAdminToken() {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }

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
        return 'bg-red-100 text-red-800';
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

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AdminGuard>
    );
  }

  if (!ticket) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Ticket Not Found</h1>
            <Link href="/admin/support" className="text-blue-600 hover:text-blue-800">
              Back to Tickets
            </Link>
          </div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Support Ticket</h1>
            <div className="flex gap-4 items-center">
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                ← Back to Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin-dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/pricing" className="text-gray-700 hover:text-blue-600">
                Pricing
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/settings" className="text-gray-700 hover:text-blue-600">
                Settings
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/website-analytics" className="text-gray-700 hover:text-blue-600">
                Website Analytics
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/support" className="text-blue-600 font-medium">
                Support Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => {
                  document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                  window.location.href = '/admin/login';
                }}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Ticket Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Ticket #{ticket.id.substring(0, 8)}</h2>
                <div className="flex gap-2 mb-2">
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    ticket.urgency === 'high' ? 'bg-red-100 text-red-800' :
                    ticket.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
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

            {/* Business Info */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold text-gray-900 mb-2">Business Information</h3>
              {ticket.business_id && !ticket.businesses && (
                <div className="mb-2 text-sm text-yellow-600">
                  ⚠️ Business ID exists ({ticket.business_id.substring(0, 8)}...) but business data not loaded
                </div>
              )}
              {!ticket.business_id && (
                <div className="mb-2 text-sm text-red-600">
                  ⚠️ This ticket has no business_id
                </div>
              )}
              {ticket.businesses && (
                <div className="mb-2 text-xs text-green-600">
                  ✓ Business data loaded: {ticket.businesses.name || 'Unknown'}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Business:</span>{' '}
                  <span className="font-medium text-gray-900">
                    {ticket.businesses?.name || (ticket.business_id ? 'Loading...' : 'N/A')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Email:</span>{' '}
                  <span className="font-medium text-gray-900">
                    {ticket.businesses?.email || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Phone:</span>{' '}
                  <span className="font-medium text-gray-900">
                    {ticket.businesses?.phone || 'N/A'}
                  </span>
                </div>
                {ticket.businesses?.vapi_phone_number && (
                  <div>
                    <span className="text-gray-600">AI Number:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {ticket.businesses.vapi_phone_number}
                    </span>
                  </div>
                )}
              </div>
              {ticket.businesses?.id && (
                <div className="mt-2">
                  <Link
                    href={`/admin/accounts/${ticket.businesses.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View Business Account →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Ticket Details */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Issue Details</h3>
            <div className="mb-4">
              <span className="text-sm font-medium text-gray-600">Issue Type:</span>{' '}
              <span className="text-gray-900 capitalize">{ticket.issue_type?.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600 block mb-2">Description:</span>
              <div className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap text-gray-900">
                {ticket.description}
              </div>
            </div>
          </div>

          {/* Resolution Notes / Responses */}
          {ticket.resolution_notes && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Resolution Notes & Responses</h3>
              <div className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap text-gray-900">
                {ticket.resolution_notes}
              </div>
            </div>
          )}

          {/* Add Response */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add Response</h3>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Type your response to the customer..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-gray-900 bg-white"
            />
            <button
              onClick={handleAddResponse}
              disabled={updating || !responseText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? 'Adding...' : 'Add Response'}
            </button>
          </div>

          {/* Update Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Update Status</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="open" className="text-gray-900">Open</option>
                  <option value="in-progress" className="text-gray-900">In Progress</option>
                  <option value="resolved" className="text-gray-900">Resolved</option>
                  <option value="closed" className="text-gray-900">Closed</option>
                </select>
              </div>
              {(newStatus === 'resolved' || newStatus === 'closed') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resolution Notes (optional)
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Add resolution notes..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
              )}
              <button
                onClick={handleUpdateStatus}
                disabled={updating || newStatus === ticket.status}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default AdminSupportTicketPage;

