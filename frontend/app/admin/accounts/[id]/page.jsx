'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { adminPhoneNumbersAPI, adminSMSNumbersAPI } from '@/lib/api';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function AdminAccountDetailPage() {
  const params = useParams();
  const { success, error: showError } = useToast();
  const accountId = params.id;
  const [account, setAccount] = useState(null);
  const [usage, setUsage] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [bonusMinutes, setBonusMinutes] = useState('');
  const [customMonthly, setCustomMonthly] = useState('');
  const [customOverage, setCustomOverage] = useState('');
  const [showPhoneSelector, setShowPhoneSelector] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState({ unassigned: [], available: [] });
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [assigningNumber, setAssigningNumber] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');
  const [purchaseNew, setPurchaseNew] = useState(false);
  const [changingNumber, setChangingNumber] = useState(false);
  const [isVAPIAssignment, setIsVAPIAssignment] = useState(true);
  const [businessPhoneNumbers, setBusinessPhoneNumbers] = useState([]);
  const [loadingPhoneNumbers, setLoadingPhoneNumbers] = useState(false);
  const [removingNumber, setRemovingNumber] = useState(null);
  const [rebuildingAssistant, setRebuildingAssistant] = useState(false);
  const [agentData, setAgentData] = useState(null);
  const [savingAgent, setSavingAgent] = useState(false);
  
  // Agent editing state
  const [editingFAQs, setEditingFAQs] = useState([]);
  const [editingBusinessHours, setEditingBusinessHours] = useState({});
  const [editingGreetings, setEditingGreetings] = useState({ opening_greeting: '', ending_greeting: '' });
  const [editingHolidayHours, setEditingHolidayHours] = useState([]);

  useEffect(() => {
    if (accountId) {
      loadAccount();
    }
  }, [accountId]);

  const loadAccount = async () => {
    try {
      const token = getAdminToken();
      const [accountRes, usageRes, activityRes, agentRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/accounts/${accountId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/admin/accounts/${accountId}/usage`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${API_URL}/api/admin/accounts/${accountId}/activity`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${API_URL}/api/admin/accounts/${accountId}/agent`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => null),
      ]);
      
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccount(accountData.business);
        setBonusMinutes(accountData.business.bonus_minutes || '');
        setCustomMonthly(accountData.business.custom_pricing_monthly || '');
        setCustomOverage(accountData.business.custom_pricing_overage || '');
        await loadBusinessPhoneNumbers(); // Load phone numbers after account loads
      }
      
      if (usageRes && usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData.usage);
      }
      
      if (activityRes && activityRes.ok) {
        const activityData = await activityRes.json();
        setActivity(activityData.logs || []);
      }
      
      if (agentRes && agentRes.ok) {
        const agentData = await agentRes.json();
        setAgentData(agentData.agent);
        // Initialize editing state
        if (agentData.agent) {
          setEditingFAQs(agentData.agent.faqs || []);
          setEditingBusinessHours(agentData.agent.business_hours || {});
          setEditingGreetings({
            opening_greeting: agentData.agent.opening_greeting || '',
            ending_greeting: agentData.agent.ending_greeting || '',
          });
          setEditingHolidayHours(agentData.agent.holiday_hours || []);
        } else {
          // No agent data - initialize with empty defaults
          setEditingFAQs([]);
          setEditingBusinessHours({
            monday: { open: '09:00', close: '17:00', closed: false },
            tuesday: { open: '09:00', close: '17:00', closed: false },
            wednesday: { open: '09:00', close: '17:00', closed: false },
            thursday: { open: '09:00', close: '17:00', closed: false },
            friday: { open: '09:00', close: '17:00', closed: false },
            saturday: { closed: true },
            sunday: { closed: true },
          });
          setEditingGreetings({ opening_greeting: '', ending_greeting: '' });
          setEditingHolidayHours([]);
        }
      }
    } catch (error) {
      console.error('Failed to load account:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMinutes = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/minutes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minutes: parseInt(bonusMinutes) }),
      });

      if (response.ok) {
        success('Bonus minutes added successfully');
        await loadAccount();
      } else {
        showError('Failed to add minutes');
      }
    } catch (error) {
      showError('Failed to add minutes');
    }
  };

  const handleSetPricing = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/pricing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          monthly: customMonthly ? parseFloat(customMonthly) : null,
          overage: customOverage ? parseFloat(customOverage) : null,
        }),
      });

      if (response.ok) {
        success('Custom pricing set successfully');
        await loadAccount();
      } else {
        showError('Failed to set pricing');
      }
    } catch (error) {
      showError('Failed to set pricing');
    }
  };

  const handleRetryActivation = async () => {
    if (!confirm('Retry activation? This will create a new VAPI assistant and phone number.')) {
      return;
    }

    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/retry-activation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        success('Activation retried successfully');
        await loadAccount();
      } else {
        showError('Failed to retry activation');
      }
    } catch (error) {
      showError('Failed to retry activation');
    }
  };

  const handleSyncVAPI = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/sync-vapi`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        success('VAPI assistant synced successfully');
      } else {
        showError('Failed to sync VAPI');
      }
    } catch (error) {
      showError('Failed to sync VAPI');
    }
  };

  const handleRebuildAssistant = async () => {
    if (!confirm('Rebuild this business\'s AI assistant? This will apply the latest settings and prompt updates.')) {
      return;
    }

    setRebuildingAssistant(true);
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/rebuild-assistant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        success(data.message || 'Assistant rebuilt successfully');
        await loadAccount(); // Reload to get updated timestamp
      } else {
        const errorData = await response.json().catch(() => ({}));
        showError(errorData.error || 'Failed to rebuild assistant');
      }
    } catch (error) {
      showError('Failed to rebuild assistant');
    } finally {
      setRebuildingAssistant(false);
    }
  };

  const handleSaveAgentData = async () => {
    setSavingAgent(true);
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/agent`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_hours: editingBusinessHours,
          faqs: editingFAQs,
          opening_greeting: editingGreetings.opening_greeting,
          ending_greeting: editingGreetings.ending_greeting,
          holiday_hours: editingHolidayHours,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        success(data.message || 'Agent data saved successfully');
        await loadAccount(); // Reload to get updated data
      } else {
        const errorData = await response.json().catch(() => ({}));
        showError(errorData.error || 'Failed to save agent data');
      }
    } catch (error) {
      showError('Failed to save agent data');
    } finally {
      setSavingAgent(false);
    }
  };

  const loadAvailableNumbers = async (areaCode = null) => {
    setLoadingNumbers(true);
    try {
      const response = await adminPhoneNumbersAPI.getAvailable(areaCode);
      setAvailableNumbers(response.data);
    } catch (error) {
      console.error('Failed to load available numbers:', error);
      showError('Failed to load available phone numbers');
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleAssignPhoneNumber = async () => {
    if (!selectedPhoneNumber) {
      showError('Please select a phone number');
      return;
    }

    setAssigningNumber(true);
    try {
      const response = await adminSMSNumbersAPI.assignSMS(accountId, selectedPhoneNumber, false);
      if (response.data.success) {
        success(`Phone number ${response.data.phone_number} assigned successfully!`);
        setShowPhoneSelector(false);
        setSelectedPhoneNumber('');
        setPurchaseNew(false);
        await loadBusinessPhoneNumbers();
        await loadAccount();
      } else {
        showError('Failed to assign phone number');
      }
    } catch (error) {
      console.error('Assign phone number error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to assign phone number';
      showError(`Failed to assign phone number: ${errorMessage}`);
    } finally {
      setAssigningNumber(false);
    }
  };

  const handleChangePhoneNumber = async () => {
    if (!selectedPhoneNumber) {
      showError('Please select a phone number');
      return;
    }

    setChangingNumber(true);
    try {
      const response = await adminPhoneNumbersAPI.change(accountId, selectedPhoneNumber, purchaseNew);
      if (response.data.success) {
        let message = `Phone number changed from ${response.data.old_phone_number} to ${response.data.new_phone_number}`;
        if (response.data.warning) {
          // If warning contains "CRITICAL" or "WILL NOT", show as error instead of info
          if (response.data.warning.includes('CRITICAL') || response.data.warning.includes('WILL NOT')) {
            showError(response.data.warning);
          } else {
            message += `. Note: ${response.data.warning}`;
            info(response.data.warning);
          }
        }
        success(message);
        setShowPhoneSelector(false);
        setSelectedPhoneNumber('');
        setPurchaseNew(false);
        await loadAccount();
      } else {
        showError('Failed to change phone number');
      }
    } catch (error) {
      console.error('Change phone number error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to change phone number';
      
      // Check if it's a credential error - provide helpful message
      if (errorMessage.includes('Credential') || errorMessage.includes('credential')) {
        showError(`⚠️ CRITICAL: VAPI credential not configured. THE AI AGENT WILL NOT ANSWER CALLS. Please set VAPI_TELNYX_CREDENTIAL_ID in your .env file. See VAPI_CREDENTIAL_SETUP.md for instructions.`);
      } else {
        showError(`Failed to change phone number: ${errorMessage}`);
      }
    } finally {
      setChangingNumber(false);
    }
  };

  const handleAssignVAPIPhoneNumber = async () => {
    if (!selectedPhoneNumber) {
      showError('Please select a phone number');
      return;
    }

    setAssigningNumber(true);
    try {
      const response = await adminPhoneNumbersAPI.assign(accountId, selectedPhoneNumber, purchaseNew);
      if (response.data.success) {
        success(`VAPI phone number ${response.data.phone_number} assigned successfully!`);
        setShowPhoneSelector(false);
        setSelectedPhoneNumber('');
        setPurchaseNew(false);
        await loadAccount();
      } else {
        showError('Failed to assign VAPI phone number');
      }
    } catch (error) {
      console.error('Assign VAPI phone number error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to assign VAPI phone number';
      showError(`Failed to assign VAPI phone number: ${errorMessage}`);
    } finally {
      setAssigningNumber(false);
    }
  };

  const loadBusinessPhoneNumbers = async () => {
    setLoadingPhoneNumbers(true);
    try {
      const numbers = await adminSMSNumbersAPI.getBusinessNumbers(accountId);
      setBusinessPhoneNumbers(numbers.data?.numbers || []);
    } catch (error) {
      console.error('Failed to load business phone numbers:', error);
      // If table doesn't exist yet, that's okay - just show empty list
      setBusinessPhoneNumbers([]);
    } finally {
      setLoadingPhoneNumbers(false);
    }
  };

  const handleRemoveNumber = async (phoneNumberId) => {
    if (!confirm('Are you sure you want to remove this phone number from this business?')) {
      return;
    }

    setRemovingNumber(phoneNumberId);
    try {
      await adminSMSNumbersAPI.removeNumber(accountId, phoneNumberId);
      success('Phone number removed successfully');
      await loadBusinessPhoneNumbers();
      await loadAccount(); // Reload account to update telnyx_number if needed
    } catch (error) {
      console.error('Failed to remove phone number:', error);
      showError(error.response?.data?.error || 'Failed to remove phone number');
    } finally {
      setRemovingNumber(null);
    }
  };

  const openPhoneSelector = async (isChange = false, isVAPI = true) => {
    await loadAvailableNumbers();
    setShowPhoneSelector(true);
    setChangingNumber(isChange);
    setIsVAPIAssignment(isVAPI);
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

  if (!account) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Account not found</p>
            <Link href="/admin/accounts" className="text-blue-600 hover:underline mt-4 inline-block">
              Back to Accounts
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
            <h1 className="text-xl font-bold text-blue-600">{account.name}</h1>
            <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
              Back to Accounts
            </Link>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('usage')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'usage'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Usage
                </button>
                <button
                  onClick={() => setActiveTab('actions')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'actions'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Actions
                </button>
                <button
                  onClick={() => setActiveTab('agent')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'agent'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  AI Agent
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Activity Log
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Business Name</label>
                      <p className="mt-1 text-gray-900">{account.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="mt-1 text-gray-900">{account.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Public Phone</label>
                      <p className="mt-1 text-gray-900">{account.public_phone_number || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tavari Phone</label>
                      <p className="mt-1 text-gray-900">{account.vapi_phone_number || 'Not provisioned'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Plan Tier</label>
                      <p className="mt-1 text-gray-900 capitalize">{account.plan_tier || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">AI Enabled</label>
                      <p className="mt-1">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          account.ai_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {account.ai_enabled ? 'Yes' : 'No'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">VAPI Assistant ID</label>
                      <p className="mt-1 text-gray-900 font-mono text-sm">{account.vapi_assistant_id || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Last Rebuilt</label>
                      <p className="mt-1 text-gray-900">
                        {account.vapi_assistant_rebuilt_at 
                          ? new Date(account.vapi_assistant_rebuilt_at).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Created</label>
                      <p className="mt-1 text-gray-900">
                        {new Date(account.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {account.vapi_assistant_id && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rebuild Assistant</label>
                        <button
                          onClick={handleRebuildAssistant}
                          disabled={rebuildingAssistant}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {rebuildingAssistant ? 'Rebuilding...' : 'Rebuild AI Assistant'}
                        </button>
                        <p className="mt-1 text-xs text-gray-500">
                          Rebuild this business's AI assistant to apply the latest settings and prompt updates.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'usage' && usage && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Minutes Used This Cycle</label>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {usage.minutes_used || 0} / {usage.minutes_total || 0}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bonus Minutes</label>
                    <p className="mt-1 text-gray-900">{account.bonus_minutes || 0}</p>
                  </div>
                  {usage.billing_cycle_start && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Billing Cycle</label>
                      <p className="mt-1 text-gray-900">
                        {new Date(usage.billing_cycle_start).toLocaleDateString()} - {new Date(usage.billing_cycle_end).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'actions' && (
                <div className="space-y-6">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">Phone Number Assignment (Calls & SMS)</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Assign a toll-free number for the AI agent. <strong>Toll-free numbers can handle both incoming calls and SMS messages.</strong> The same number can be used for both.
                    </p>
                    <div className="space-y-3">
                      <div className="p-3 bg-gray-50 rounded border">
                        <div className="text-sm font-medium text-gray-700">Current Phone Number</div>
                        <div className="text-lg font-mono text-gray-900 mt-1">
                          {account.vapi_phone_number || 'Not assigned'}
                        </div>
                        {account.vapi_phone_number && (
                          <div className="text-xs text-gray-500 mt-2">
                            This number can be used for both calls (VAPI) and SMS messaging
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openPhoneSelector(false, true)}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                      >
                        {account.vapi_phone_number ? 'Change Phone Number' : 'Assign Phone Number'}
                      </button>
                      {account.vapi_phone_number && (
                        <>
                          <button
                            onClick={async () => {
                              // Check if this number is also used for SMS
                              const isUsedForSMS = businessPhoneNumbers.some(n => 
                                n.phone_number === account.vapi_phone_number || 
                                n.phone_number === account.vapi_phone_number.replace(/[^0-9+]/g, '')
                              );
                              
                              if (isUsedForSMS) {
                                if (!confirm(`This phone number is also used for SMS. Removing it will disable both calling and SMS. Are you sure?`)) {
                                  return;
                                }
                              } else {
                                if (!confirm(`Are you sure you want to remove the phone number ${account.vapi_phone_number}? This will disable the AI agent.`)) {
                                  return;
                                }
                              }
                              
                              try {
                                const token = getAdminToken();
                                const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/remove-phone`, {
                                  method: 'POST',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                  },
                                });
                                if (response.ok) {
                                  success('Phone number removed successfully');
                                  await loadAccount();
                                  await loadBusinessPhoneNumbers();
                                } else {
                                  showError('Failed to remove phone number');
                                }
                              } catch (error) {
                                showError('Failed to remove phone number');
                              }
                            }}
                            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
                          >
                            Remove Phone Number
                          </button>
                          {!businessPhoneNumbers.some(n => 
                            n.phone_number === account.vapi_phone_number || 
                            n.phone_number === account.vapi_phone_number.replace(/[^0-9+]/g, '')
                          ) && (
                            <button
                              onClick={async () => {
                                try {
                                  const response = await adminSMSNumbersAPI.assignSMS(accountId, account.vapi_phone_number, true);
                                  if (response.data.success) {
                                    success('Phone number also enabled for SMS messaging');
                                    await loadBusinessPhoneNumbers();
                                  } else {
                                    showError('Failed to enable SMS for this number');
                                  }
                                } catch (error) {
                                  showError(error.response?.data?.error || 'Failed to enable SMS');
                                }
                              }}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                            >
                              Also Enable SMS for This Number
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">Add Bonus Minutes</h3>
                    <div className="flex gap-4">
                      <input
                        type="number"
                        value={bonusMinutes}
                        onChange={(e) => setBonusMinutes(e.target.value)}
                        placeholder="Minutes to add"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddMinutes}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Add Minutes
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">Set Custom Pricing</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
                        <input
                          type="number"
                          value={customMonthly}
                          onChange={(e) => setCustomMonthly(e.target.value)}
                          placeholder="Leave empty for default"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Overage Rate (per minute)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={customOverage}
                          onChange={(e) => setCustomOverage(e.target.value)}
                          placeholder="Leave empty for default"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={handleSetPricing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Set Pricing
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">SMS Phone Numbers</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => openPhoneSelector(false, false)}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Add SMS Phone Number
                      </button>
                      
                      {loadingPhoneNumbers ? (
                        <p className="text-sm text-gray-500">Loading phone numbers...</p>
                      ) : businessPhoneNumbers.length === 0 ? (
                        <p className="text-sm text-gray-500">No phone numbers assigned</p>
                      ) : (
                        <div className="space-y-2">
                          {businessPhoneNumbers.map((number) => (
                            <div
                              key={number.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold">{number.phone_number}</span>
                                {number.is_primary && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Primary</span>
                                )}
                                {!number.is_active && (
                                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">Inactive</span>
                                )}
                              </div>
                              {number.is_active && (
                                <button
                                  onClick={() => handleRemoveNumber(number.id)}
                                  disabled={removingNumber === number.id}
                                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                                >
                                  {removingNumber === number.id ? 'Removing...' : 'Remove'}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">VAPI Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={handleRetryActivation}
                        className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                      >
                        Retry Activation
                      </button>
                      <button
                        onClick={handleSyncVAPI}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Sync VAPI Assistant
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'agent' && (
                <div className="space-y-6">
                  {!agentData && !loading ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">No agent data found for this business.</p>
                      <button
                        onClick={handleSaveAgentData}
                        disabled={savingAgent}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingAgent ? 'Creating...' : 'Create Agent Data'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Business Hours */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-4">Business Hours</h3>
                        <div className="space-y-2">
                          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                            const dayHours = editingBusinessHours[day] || { closed: true, open: '09:00', close: '17:00' };
                            return (
                              <div key={day} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                                <div className="w-24 font-medium text-gray-700 capitalize">{day}</div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={!dayHours.closed}
                                    onChange={(e) => {
                                      setEditingBusinessHours({
                                        ...editingBusinessHours,
                                        [day]: { ...dayHours, closed: !e.target.checked },
                                      });
                                    }}
                                    className="rounded"
                                  />
                                  <span className="text-sm text-gray-700">Open</span>
                                </label>
                                {!dayHours.closed && (
                                  <>
                                    <input
                                      type="time"
                                      value={dayHours.open || '09:00'}
                                      onChange={(e) => {
                                        setEditingBusinessHours({
                                          ...editingBusinessHours,
                                          [day]: { ...dayHours, open: e.target.value },
                                        });
                                      }}
                                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                    <span className="text-gray-500">to</span>
                                    <input
                                      type="time"
                                      value={dayHours.close || '17:00'}
                                      onChange={(e) => {
                                        setEditingBusinessHours({
                                          ...editingBusinessHours,
                                          [day]: { ...dayHours, close: e.target.value },
                                        });
                                      }}
                                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Greetings */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-4">Greetings</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Opening Greeting</label>
                            <textarea
                              value={editingGreetings.opening_greeting}
                              onChange={(e) => setEditingGreetings({ ...editingGreetings, opening_greeting: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={3}
                              placeholder="Hello! Thanks for calling..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ending Greeting</label>
                            <textarea
                              value={editingGreetings.ending_greeting}
                              onChange={(e) => setEditingGreetings({ ...editingGreetings, ending_greeting: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={2}
                              placeholder="Thank you for calling..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* FAQs */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">FAQs ({editingFAQs.length})</h3>
                          <button
                            onClick={() => setEditingFAQs([...editingFAQs, { question: '', answer: '' }])}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Add FAQ
                          </button>
                        </div>
                        <div className="space-y-4">
                          {editingFAQs.length === 0 ? (
                            <p className="text-gray-500 text-sm">No FAQs configured</p>
                          ) : (
                            editingFAQs.map((faq, index) => (
                              <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-sm font-medium text-gray-700">FAQ #{index + 1}</span>
                                  <button
                                    onClick={() => setEditingFAQs(editingFAQs.filter((_, i) => i !== index))}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={faq.question || ''}
                                    onChange={(e) => {
                                      const newFAQs = [...editingFAQs];
                                      newFAQs[index] = { ...faq, question: e.target.value };
                                      setEditingFAQs(newFAQs);
                                    }}
                                    placeholder="Question"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                  <textarea
                                    value={faq.answer || ''}
                                    onChange={(e) => {
                                      const newFAQs = [...editingFAQs];
                                      newFAQs[index] = { ...faq, answer: e.target.value };
                                      setEditingFAQs(newFAQs);
                                    }}
                                    placeholder="Answer"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    rows={3}
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Holiday Hours */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">Holiday Hours ({editingHolidayHours.length})</h3>
                          <button
                            onClick={() => setEditingHolidayHours([...editingHolidayHours, { name: '', date: '', closed: true }])}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Add Holiday
                          </button>
                        </div>
                        <div className="space-y-3">
                          {editingHolidayHours.length === 0 ? (
                            <p className="text-gray-500 text-sm">No holiday hours configured</p>
                          ) : (
                            editingHolidayHours.map((holiday, index) => (
                              <div key={index} className="p-3 bg-gray-50 rounded-lg border">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-sm font-medium text-gray-700">Holiday #{index + 1}</span>
                                  <button
                                    onClick={() => setEditingHolidayHours(editingHolidayHours.filter((_, i) => i !== index))}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <input
                                    type="text"
                                    value={holiday.name || ''}
                                    onChange={(e) => {
                                      const newHolidays = [...editingHolidayHours];
                                      newHolidays[index] = { ...holiday, name: e.target.value };
                                      setEditingHolidayHours(newHolidays);
                                    }}
                                    placeholder="Holiday name"
                                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                  <input
                                    type="date"
                                    value={holiday.date || ''}
                                    onChange={(e) => {
                                      const newHolidays = [...editingHolidayHours];
                                      newHolidays[index] = { ...holiday, date: e.target.value };
                                      setEditingHolidayHours(newHolidays);
                                    }}
                                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                  <label className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={holiday.closed}
                                      onChange={(e) => {
                                        const newHolidays = [...editingHolidayHours];
                                        newHolidays[index] = { ...holiday, closed: e.target.checked };
                                        setEditingHolidayHours(newHolidays);
                                      }}
                                      className="rounded"
                                    />
                                    <span className="text-sm text-gray-700">Closed</span>
                                  </label>
                                </div>
                                {!holiday.closed && (
                                  <div className="grid grid-cols-2 gap-3 mt-3">
                                    <input
                                      type="time"
                                      value={holiday.open || '09:00'}
                                      onChange={(e) => {
                                        const newHolidays = [...editingHolidayHours];
                                        newHolidays[index] = { ...holiday, open: e.target.value };
                                        setEditingHolidayHours(newHolidays);
                                      }}
                                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                    <input
                                      type="time"
                                      value={holiday.close || '17:00'}
                                      onChange={(e) => {
                                        const newHolidays = [...editingHolidayHours];
                                        newHolidays[index] = { ...holiday, close: e.target.value };
                                        setEditingHolidayHours(newHolidays);
                                      }}
                                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Save Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveAgentData}
                          disabled={savingAgent}
                          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {savingAgent ? 'Saving...' : 'Save Agent Data'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-2">
                  {activity.length === 0 ? (
                    <p className="text-gray-500">No activity logs</p>
                  ) : (
                    activity.map((log) => (
                      <div key={log.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{log.action.replace('_', ' ')}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(log.created_at).toLocaleString()}
                            </p>
                          </div>
                          {log.details && (
                            <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Phone Number Selector Modal */}
          {showPhoneSelector && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    {isVAPIAssignment
                      ? (changingNumber || account.vapi_phone_number
                          ? 'Change VAPI Phone Number'
                          : 'Assign VAPI Phone Number')
                      : 'Assign SMS Phone Number'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowPhoneSelector(false);
                      setSelectedPhoneNumber('');
                      setPurchaseNew(false);
                      setChangingNumber(false);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                {loadingNumbers ? (
                  <div className="text-center py-8">Loading available numbers...</div>
                ) : (
                  <>
                    {/* Unassigned Numbers (Already Purchased - All Types) */}
                    {availableNumbers.unassigned && availableNumbers.unassigned.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Available Numbers (Already Purchased - Included in Subscription)</h4>
                        <p className="text-xs text-gray-500 mb-3">All purchased numbers (toll-free and local) that are not assigned to any business.</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {availableNumbers.unassigned
                            .sort((a, b) => {
                              // Sort toll-free numbers first
                              if (a.is_toll_free && !b.is_toll_free) return -1;
                              if (!a.is_toll_free && b.is_toll_free) return 1;
                              return 0;
                            })
                            .map((num, idx) => (
                            <label
                              key={idx}
                              className={`flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
                                selectedPhoneNumber === num.phone_number ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="phoneNumber"
                                value={num.phone_number}
                                checked={selectedPhoneNumber === num.phone_number}
                                onChange={(e) => {
                                  setSelectedPhoneNumber(e.target.value);
                                  setPurchaseNew(false);
                                }}
                                className="mr-3"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{num.phone_number}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="text-xs text-green-600 font-medium">Included in subscription</div>
                                  {num.is_toll_free && (
                                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Toll-Free</span>
                                  )}
                                  {!num.is_toll_free && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded">Local</span>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Available to Purchase (Toll-Free Only) */}
                    {availableNumbers.available && availableNumbers.available.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Available Toll-Free Numbers to Purchase</h4>
                        <p className="text-xs text-gray-500 mb-3">Only toll-free numbers can be purchased. The first number is included in subscription.</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {availableNumbers.available.map((num, idx) => (
                            <label
                              key={idx}
                              className={`flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
                                selectedPhoneNumber === num.phone_number ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="phoneNumber"
                                value={num.phone_number}
                                checked={selectedPhoneNumber === num.phone_number}
                                onChange={(e) => {
                                  setSelectedPhoneNumber(e.target.value);
                                  setPurchaseNew(true);
                                }}
                                className="mr-3"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{num.phone_number}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="text-xs text-green-600 font-medium">Included in subscription</div>
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Toll-Free</span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {availableNumbers.unassigned?.length === 0 && availableNumbers.available?.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No phone numbers available at this time. Please try again later.
                      </div>
                    )}

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => {
                          if (changingNumber || (isVAPIAssignment && account.vapi_phone_number)) {
                            // Changing existing VAPI number
                            handleChangePhoneNumber();
                          } else if (isVAPIAssignment) {
                            // Assigning new VAPI number
                            handleAssignVAPIPhoneNumber();
                          } else {
                            // Assigning SMS number
                            handleAssignPhoneNumber();
                          }
                        }}
                        disabled={!selectedPhoneNumber || assigningNumber || changingNumber}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {assigningNumber
                          ? (isVAPIAssignment ? 'Assigning VAPI...' : 'Assigning SMS...')
                          : changingNumber
                          ? 'Changing...'
                          : isVAPIAssignment
                          ? (account.vapi_phone_number ? 'Change VAPI Number' : 'Assign VAPI Number')
                          : 'Assign SMS Number'
                        }
                      </button>
                      <button
                        onClick={() => {
                          setShowPhoneSelector(false);
                          setSelectedPhoneNumber('');
                          setPurchaseNew(false);
                          setChangingNumber(false);
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </AdminGuard>
  );

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default AdminAccountDetailPage;

