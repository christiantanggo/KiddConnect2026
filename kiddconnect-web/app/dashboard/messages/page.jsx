'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { messagesAPI } from '@/lib/api';

function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new'); // 'new', 'read', 'follow_up'

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const res = await messagesAPI.list({ limit: 100 });
      setMessages(res.data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await messagesAPI.markRead(messageId);
      setMessages((prev) =>
        prev.map((msg) => 
          msg.id === messageId 
            ? { ...msg, is_read: true, status: 'read' } 
            : msg
        )
      );
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  const markAsFollowUp = async (messageId) => {
    try {
      await messagesAPI.markFollowUp(messageId);
      setMessages((prev) =>
        prev.map((msg) => 
          msg.id === messageId 
            ? { ...msg, status: 'follow_up' } 
            : msg
        )
      );
    } catch (error) {
      console.error('Failed to mark message as follow up:', error);
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

  // Filter messages based on active tab
  const filteredMessages = messages.filter((message) => {
    if (activeTab === 'new') {
      return !message.is_read && message.status !== 'follow_up';
    } else if (activeTab === 'read') {
      return message.is_read || message.status === 'read';
    } else if (activeTab === 'follow_up') {
      return message.status === 'follow_up';
    }
    return true;
  });

  // Count messages for each tab
  const newCount = messages.filter(m => !m.is_read && m.status !== 'follow_up').length;
  const readCount = messages.filter(m => m.is_read || m.status === 'read').length;
  const followUpCount = messages.filter(m => m.status === 'follow_up').length;

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />

        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow">
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('new')}
                  className={`
                    px-6 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeTab === 'new'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  New Messages
                  {newCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {newCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('read')}
                  className={`
                    px-6 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeTab === 'read'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  Read
                  {readCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                      {readCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('follow_up')}
                  className={`
                    px-6 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeTab === 'follow_up'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  Follow Up
                  {followUpCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      {followUpCount}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Messages List */}
            {filteredMessages.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-600">
                  {activeTab === 'new' && 'No new messages.'}
                  {activeTab === 'read' && 'No read messages.'}
                  {activeTab === 'follow_up' && 'No messages marked for follow up.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-6 ${
                      activeTab === 'new' ? 'bg-blue-50' : 
                      activeTab === 'follow_up' ? 'bg-yellow-50' : 
                      'bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {message.caller_name || 'Unknown Caller'}
                          </h3>
                          {activeTab === 'new' && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-600 text-white">
                              New
                            </span>
                          )}
                          {activeTab === 'follow_up' && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-600 text-white">
                              Follow Up
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-gray-600 mb-3">
                          {message.caller_phone && (
                            <p>
                              <span className="font-medium">Phone:</span> {message.caller_phone}
                            </p>
                          )}
                          {message.caller_email && (
                            <p>
                              <span className="font-medium">Email:</span> {message.caller_email}
                            </p>
                          )}
                          <p>
                            <span className="font-medium">Date:</span> {formatDate(message.created_at)}
                          </p>
                        </div>
                        {message.reason && (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-gray-700 mb-1">Reason for calling:</p>
                            <p className="text-gray-900">{message.reason}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">Message:</p>
                          <p className="text-gray-900 whitespace-pre-wrap">{message.message_text}</p>
                        </div>
                      </div>
                      <div className="ml-4 flex flex-col space-y-2">
                        {activeTab === 'new' && (
                          <>
                            <button
                              onClick={() => markAsRead(message.id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
                            >
                              Mark as Read
                            </button>
                            <button
                              onClick={() => markAsFollowUp(message.id)}
                              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium whitespace-nowrap"
                            >
                              Follow Up
                            </button>
                          </>
                        )}
                        {activeTab === 'follow_up' && (
                          <button
                            onClick={() => markAsRead(message.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
                          >
                            Mark as Read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default MessagesPage;
