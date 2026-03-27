'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { bulkSMSAPI, contactsAPI, authAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

function SMSPage() {
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState('send');
  const [loading, setLoading] = useState(false);
  
  // Send Campaign Tab
  const [campaignName, setCampaignName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [selectedContactsForCampaign, setSelectedContactsForCampaign] = useState([]);
  const [selectedListsForCampaign, setSelectedListsForCampaign] = useState([]);
  const [sendToAllContacts, setSendToAllContacts] = useState(false);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [excludeSentToday, setExcludeSentToday] = useState(false);
  const [totalContactsCount, setTotalContactsCount] = useState(null);
  const [excludedContactsCount, setExcludedContactsCount] = useState(null);
  const [eligibleContactsCount, setEligibleContactsCount] = useState(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  
  // Campaigns Tab
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [failedRecipients, setFailedRecipients] = useState([]);
  const [loadingFailedRecipients, setLoadingFailedRecipients] = useState(false);
  const [sentRecipients, setSentRecipients] = useState([]);
  const [loadingSentRecipients, setLoadingSentRecipients] = useState(false);
  
  // Numbers Tab
  const [availableNumbers, setAvailableNumbers] = useState([]);
  
  // Opt-Outs Tab
  const [optOuts, setOptOuts] = useState([]);
  
  // Contracts Tab
  const [contacts, setContacts] = useState([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsPageSize] = useState(100); // Show 100 contacts per page
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [listContacts, setListContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newContact, setNewContact] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    notes: '',
  });
  const [newList, setNewList] = useState({ name: '', description: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [smsConsent, setSmsConsent] = useState(false); // TCPA/CASL compliance - consent required
  const [selectedContactsForList, setSelectedContactsForList] = useState([]);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [businessTimezone, setBusinessTimezone] = useState('America/New_York'); // Business timezone for date formatting

  useEffect(() => {
    loadBusinessTimezone();
    loadData();
  }, []);

  // Fetch contact counts when "Send to All Contacts" is selected
  useEffect(() => {
    if (sendToAllContacts) {
      loadContactCounts();
    } else {
      // Reset counts when deselected
      setTotalContactsCount(null);
      setExcludedContactsCount(null);
      setEligibleContactsCount(null);
    }
  }, [sendToAllContacts, excludeSentToday]);

  const loadContactCounts = async () => {
    setLoadingCounts(true);
    try {
      const res = await contactsAPI.getContacts({
        count_only: true,
        exclude_sent_today: excludeSentToday,
      });
      
      setTotalContactsCount(res.data.total || 0);
      setEligibleContactsCount(res.data.eligible || 0);
      setExcludedContactsCount(res.data.excluded || 0);
    } catch (error) {
      console.error('Failed to load contact counts:', error);
      setTotalContactsCount(null);
      setExcludedContactsCount(null);
      setEligibleContactsCount(null);
    } finally {
      setLoadingCounts(false);
    }
  };

  const loadBusinessTimezone = async () => {
    try {
      const userRes = await authAPI.getMe();
      const timezone = userRes.data?.business?.sms_timezone || 
                      userRes.data?.business?.timezone || 
                      'America/New_York';
      setBusinessTimezone(timezone);
    } catch (error) {
      console.error('Failed to load business timezone:', error);
      // Default to America/New_York if fetch fails
      setBusinessTimezone('America/New_York');
    }
  };

  // Format date in business timezone (not browser timezone)
  const formatDateInBusinessTimezone = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      // Parse the date string (assume UTC if no timezone info)
      let date;
      if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
        // Already has timezone info
        date = new Date(dateString);
      } else {
        // Assume UTC if no timezone specified (database timestamps are typically UTC)
        date = new Date(dateString + 'Z');
      }
      
      // Format in business timezone
      return date.toLocaleString('en-US', {
        timeZone: businessTimezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };
  
  useEffect(() => {
    if (selectedList) {
      loadListContacts(selectedList.id);
    } else {
      setListContacts([]);
    }
  }, [selectedList]);

  // Load contacts page when switching to contracts tab or when search changes
  useEffect(() => {
    if (activeTab === 'contracts' && !selectedList) {
      const timer = setTimeout(() => {
        setContactsPage(1);
        loadContactsPage(1);
      }, searchQuery ? 500 : 0); // Debounce search
      return () => clearTimeout(timer);
    }
  }, [searchQuery, activeTab, selectedList]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Only load contacts if we're on the contracts tab, otherwise skip to save performance
      const shouldLoadContacts = activeTab === 'contracts' || activeTab === 'send';
      
      const promises = [
        bulkSMSAPI.getCampaigns().catch(() => ({ data: { campaigns: [] } })),
        bulkSMSAPI.getNumbers().catch(() => ({ data: { numbers: [] } })),
        bulkSMSAPI.getOptOuts().catch(() => ({ data: { optOuts: [] } })),
        contactsAPI.getLists().catch(() => ({ data: { lists: [] } })),
      ];
      
      if (shouldLoadContacts) {
        promises.push(
          contactsAPI.getContacts({ limit: contactsPageSize, offset: 0 }).catch(() => ({ data: { contacts: [], total: 0 } }))
        );
      } else {
        promises.push(Promise.resolve({ data: { contacts: [], total: 0 } }));
      }
      
      const [campaignsRes, numbersRes, optOutsRes, listsRes, contactsRes] = await Promise.all(promises);
      
      setCampaigns(campaignsRes.data.campaigns || []);
      const numbers = numbersRes.data.numbers || [];
      setAvailableNumbers(numbers);
      // Default to selecting all numbers
      if (selectedNumbers.length === 0) {
        setSelectedNumbers(numbers);
      }
      setOptOuts(optOutsRes.data.optOuts || []);
      
      if (shouldLoadContacts) {
        // Deduplicate contacts by ID to prevent duplicate key warnings
        const contactsData = contactsRes.data.contacts || [];
        const uniqueContacts = Array.from(
          new Map(contactsData.map(contact => [contact.id, contact])).values()
        );
        setContacts(uniqueContacts);
        setContactsTotal(contactsRes.data.total || uniqueContacts.length);
      }
      
      setLists(listsRes.data.lists || []);
    } catch (error) {
      console.error('Failed to load SMS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignName || !messageText) {
      showError('Please fill in campaign name and message text');
      return;
    }
    
    if (!sendToAllContacts && selectedContactsForCampaign.length === 0 && selectedListsForCampaign.length === 0) {
      showError('Please select at least one contact or list to send to, or enable "Send to All Contacts"');
      return;
    }
    
    setLoading(true);
    try {
      const res = await bulkSMSAPI.createCampaign({
        name: campaignName,
        message_text: messageText,
        contact_ids: sendToAllContacts ? [] : selectedContactsForCampaign,
        list_ids: sendToAllContacts ? [] : selectedListsForCampaign,
        send_to_all: sendToAllContacts,
        exclude_sent_today: excludeSentToday,
      });
      
      success(`Campaign "${campaignName}" created! Sending ${res.data.campaign.total_recipients} messages...`);
      
      // Reset form
      setCampaignName('');
      setMessageText('');
      setSelectedContactsForCampaign([]);
      setSelectedListsForCampaign([]);
      setSendToAllContacts(false);
      
      // Switch to campaigns tab and reload
      setActiveTab('campaigns');
      await loadData();
    } catch (error) {
      console.error('Create campaign error:', error);
      showError(error.response?.data?.error || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) {
      return;
    }
    
    try {
      await bulkSMSAPI.cancelCampaign(campaignId);
      success('Campaign cancelled');
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to cancel campaign');
    }
  };

  const handleViewCampaign = async (campaignId) => {
    try {
      const res = await bulkSMSAPI.getCampaign(campaignId);
      setSelectedCampaign(res.data.campaign);
      
      // Load failed recipients if there are any
      if (res.data.campaign.failed_count > 0) {
        loadFailedRecipients(campaignId);
      } else {
        setFailedRecipients([]);
      }
      
      // Load sent recipients
      if (res.data.campaign.sent_count > 0) {
        loadSentRecipients(campaignId);
      } else {
        setSentRecipients([]);
      }
      
      // Scroll to details section
      setTimeout(() => {
        const detailsElement = document.getElementById('campaign-details');
        if (detailsElement) {
          detailsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      showError('Failed to load campaign details');
    }
  };

  const loadFailedRecipients = async (campaignId) => {
    setLoadingFailedRecipients(true);
    try {
      const res = await bulkSMSAPI.getRecipients(campaignId, 'failed');
      setFailedRecipients(res.data.recipients || []);
    } catch (error) {
      console.error('Failed to load failed recipients:', error);
      setFailedRecipients([]);
    } finally {
      setLoadingFailedRecipients(false);
    }
  };

  const loadSentRecipients = async (campaignId) => {
    setLoadingSentRecipients(true);
    try {
      const res = await bulkSMSAPI.getRecipients(campaignId, 'sent');
      setSentRecipients(res.data.recipients || []);
    } catch (error) {
      console.error('Failed to load sent recipients:', error);
      setSentRecipients([]);
    } finally {
      setLoadingSentRecipients(false);
    }
  };

  const handleResendFailedRecipients = async (campaignId, recipientIds) => {
    if (!confirm(`Resend to ${recipientIds.length} failed recipient(s)?`)) {
      return;
    }
    
    try {
      await bulkSMSAPI.resendRecipients(campaignId, recipientIds);
      success(`Resending to ${recipientIds.length} recipient(s)...`);
      
      // Reload campaign and failed recipients
      await handleViewCampaign(campaignId);
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to resend to recipients');
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      await bulkSMSAPI.deleteCampaign(campaignId);
      success('Campaign deleted');
      if (selectedCampaign?.id === campaignId) {
        setSelectedCampaign(null);
      }
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to delete campaign');
    }
  };

  const handlePauseCampaign = async (campaignId) => {
    try {
      await bulkSMSAPI.pauseCampaign(campaignId);
      success('Campaign paused');
      await loadData();
      if (selectedCampaign?.id === campaignId) {
        const res = await bulkSMSAPI.getCampaign(campaignId);
        setSelectedCampaign(res.data.campaign);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to pause campaign');
    }
  };

  const handleRestartCampaign = async (campaignId) => {
    if (!confirm('Restart this campaign? This will reset the progress and resend all messages.')) {
      return;
    }

    try {
      await bulkSMSAPI.restartCampaign(campaignId);
      success('Campaign restarted');
      await loadData();
      if (selectedCampaign?.id === campaignId) {
        const res = await bulkSMSAPI.getCampaign(campaignId);
        setSelectedCampaign(res.data.campaign);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to restart campaign');
    }
  };

  const handleResendCampaign = async (campaignId) => {
    if (!confirm('Create a new campaign with the same message and recipients?')) {
      return;
    }

    try {
      await bulkSMSAPI.resendCampaign(campaignId);
      success('New campaign created and sending started');
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to resend campaign');
    }
  };

  const loadListContacts = async (listId) => {
    try {
      const res = await contactsAPI.getList(listId);
      const contactsData = res.data.contacts || [];
      // Deduplicate contacts by ID to prevent duplicate key warnings
      const uniqueContacts = Array.from(
        new Map(contactsData.map(contact => [contact.id, contact])).values()
      );
      setListContacts(uniqueContacts);
    } catch (error) {
      console.error('Failed to load list contacts:', error);
    }
  };

  const loadContactsPage = async (page = contactsPage) => {
    setLoading(true);
    try {
      const offset = (page - 1) * contactsPageSize;
      const res = await contactsAPI.getContacts({ 
        limit: contactsPageSize, 
        offset: offset,
        search: searchQuery || undefined,
      });
      const contactsData = res.data.contacts || [];
      const uniqueContacts = Array.from(
        new Map(contactsData.map(contact => [contact.id, contact])).values()
      );
      setContacts(uniqueContacts);
      setContactsTotal(res.data.total || uniqueContacts.length);
    } catch (error) {
      console.error('Failed to load contacts page:', error);
      showError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async () => {
    if (!newContact.phone_number) {
      showError('Phone number is required');
      return;
    }
    
    setLoading(true);
    try {
      await contactsAPI.createContact(newContact);
      success('Contact created successfully!');
      setNewContact({
        email: '',
        first_name: '',
        last_name: '',
        phone_number: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        notes: '',
      });
      setShowAddContact(false);
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newList.name) {
      showError('List name is required');
      return;
    }
    
    setLoading(true);
    try {
      await contactsAPI.createList(newList);
      success('List created successfully!');
      setNewList({ name: '', description: '' });
      setShowCreateList(false);
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadContacts = async () => {
    if (!uploadFile) {
      showError('Please select a CSV file');
      return;
    }
    
    // TCPA/CASL compliance - require explicit consent
    if (!smsConsent) {
      showError('SMS consent is required for TCPA (US) and CASL (Canada) compliance. Please confirm that all contacts in the CSV have provided express consent to receive SMS messages.');
      return;
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('csv', uploadFile);
      formData.append('sms_consent', 'true'); // Required for compliance
      formData.append('sms_consent_method', 'csv_upload');
      formData.append('sms_consent_source', 'SMS Dashboard - CSV Upload');
      
      const res = await contactsAPI.uploadContacts(formData);
      success(`Successfully imported ${res.data.imported} contact(s) out of ${res.data.total} total with SMS consent!`);
      setUploadFile(null);
      setSmsConsent(false); // Reset consent checkbox
      await loadData();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to upload contacts';
      if (error.response?.data?.requires_consent) {
        showError(errorMessage);
      } else {
        showError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) {
      return;
    }
    
    try {
      await contactsAPI.deleteContact(id);
      success('Contact deleted');
      await loadData();
      if (selectedList) {
        loadListContacts(selectedList.id);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to delete contact');
    }
  };

  const handleDeleteList = async (id) => {
    if (!confirm('Are you sure you want to delete this list? Contacts will not be deleted.')) {
      return;
    }
    
    try {
      await contactsAPI.deleteList(id);
      success('List deleted');
      if (selectedList?.id === id) {
        setSelectedList(null);
        setListContacts([]);
      }
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to delete list');
    }
  };

  const handleAddContactsToList = async (listId) => {
    if (selectedContactsForList.length === 0) {
      showError('Please select at least one contact');
      return;
    }
    
    setLoading(true);
    try {
      // Filter out contacts that might already be in the list to avoid errors
      const results = await Promise.allSettled(
        selectedContactsForList.map(contactId => 
          contactsAPI.addContactToList(listId, contactId)
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => {
        if (r.status === 'rejected') {
          // Check if it's a connection error
          const error = r.reason;
          if (!error.response) {
            // Network/connection error
            console.error('Connection error:', error);
            return true;
          }
          // Check if it's a duplicate (already in list) or other error
          const status = error.response?.status;
          return status !== 400 && status !== 409; // 400/409 might be "already exists"
        }
        return false;
      }).length;
      
      // Check for connection errors
      const connectionErrors = results.filter(r => 
        r.status === 'rejected' && !r.reason?.response
      ).length;
      
      if (connectionErrors > 0) {
        showError('Cannot connect to server. Please make sure the backend is running.');
        setLoading(false);
        return;
      }
      
      if (successful > 0) {
        success(`Added ${successful} contact(s) to list${failed > 0 ? ` (${failed} already in list or failed)` : ''}`);
        setSelectedContactsForList([]);
        setShowAddToListModal(false);
        if (selectedList?.id === listId) {
          loadListContacts(listId);
        }
        // Only reload data if we had successful additions
        try {
          await loadData();
        } catch (loadError) {
          console.error('Failed to reload data:', loadError);
          // Don't show error for reload failure
        }
      } else if (failed > 0) {
        const errorMessages = results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason?.response?.data?.error || r.reason?.message)
          .filter(Boolean);
        
        if (errorMessages.some(msg => msg.includes('already') || msg.includes('duplicate'))) {
          showError('All selected contacts are already in this list');
        } else {
          showError(errorMessages[0] || 'Failed to add contacts to list');
        }
      }
    } catch (error) {
      console.error('Add contacts to list error:', error);
      if (!error.response) {
        showError('Cannot connect to server. Please make sure the backend is running.');
      } else {
        showError(error.response?.data?.error || 'Failed to add contacts to list');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOptOut = async (contactId, currentStatus) => {
    try {
      await contactsAPI.toggleOptOut(contactId, !currentStatus);
      success(`Contact ${!currentStatus ? 'opted out' : 'opted in'}`);
      await loadData();
      if (selectedList) {
        loadListContacts(selectedList.id);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to update opt-out status');
    }
  };

  const handleSyncOptOuts = async () => {
    setLoading(true);
    try {
      const res = await contactsAPI.syncOptOuts();
      success(`Synced ${res.data.synced} contact(s)`);
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to sync opt-out status');
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnose = async () => {
    setLoading(true);
    try {
      const res = await bulkSMSAPI.diagnose();
      console.log('Diagnostic Info:', res.data);
      alert(`Diagnostic Info:\n\nBusiness: ${res.data.business?.name || 'N/A'}\nPhone: ${res.data.business?.vapi_phone_number || res.data.business?.telnyx_number || 'Not configured'}\nBusiness Lookup: ${res.data.businessLookupTest?.found ? '✅ Working' : '❌ Failed'}\nOpt-Outs: ${res.data.optOuts?.count || 0}\n\nCheck console for full details.`);
      success('Diagnostic complete - check console for details');
    } catch (error) {
      console.error('Diagnostic error:', error);
      showError(error.response?.data?.error || 'Failed to run diagnostic');
    } finally {
      setLoading(false);
    }
  };

  const messageLength = messageText.length;
  const messageCount = Math.ceil(messageLength / 160);
  
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  const handleTestSMS = async () => {
    if (!testPhoneNumber || !messageText) {
      showError('Please enter a phone number and message text');
      return;
    }
    
    setSendingTest(true);
    try {
      const res = await bulkSMSAPI.testSMS({
        phone_number: testPhoneNumber,
        message: messageText,
      });
      success(`Test SMS sent successfully to ${testPhoneNumber}! Check your phone.`);
    } catch (error) {
      console.error('Test SMS error:', error);
      showError(error.response?.data?.error || 'Failed to send test SMS');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <AuthGuard>
      <DashboardHeader />
      
      {/* Loading Modal for Campaign Creation */}
      {loading && sendToAllContacts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading All Contacts</h3>
              <p className="text-sm text-gray-600 mb-4">
                We're loading all contacts from your database and checking compliance requirements...
              </p>
              <p className="text-xs text-gray-500">
                This may take a moment if you have many contacts.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">SMS Campaigns</h1>
        
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'send', label: 'Send Campaign' },
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'contracts', label: 'Contacts' },
              { id: 'numbers', label: 'Numbers' },
              { id: 'optouts', label: 'Opt-Outs' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedCampaign(null);
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Send Campaign Tab */}
          {activeTab === 'send' && (
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Day Camp Promotion"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message Text
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Enter your SMS message here..."
                  rows={6}
                  maxLength={1600}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-1 text-sm text-gray-500">
                  {messageLength} / 1600 characters ({messageCount} SMS message{messageCount !== 1 ? 's' : ''})
                </div>
              </div>

              {/* Send to All Contacts Option */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={sendToAllContacts}
                    onChange={(e) => {
                      setSendToAllContacts(e.target.checked);
                      if (e.target.checked) {
                        // Clear individual selections when "Send to All" is enabled
                        setSelectedContactsForCampaign([]);
                        setSelectedListsForCampaign([]);
                      }
                    }}
                    className="mr-2"
                  />
                  <div>
                    <span className="text-sm font-medium text-blue-900">Send to All Contacts</span>
                    <p className="text-xs text-blue-700 mt-1">
                      Send this campaign to all contacts in your database (excluding opted-out contacts and those without consent)
                    </p>
                  </div>
                </label>
                
                {sendToAllContacts && (
                  <>
                    <label className="flex items-center mt-3 ml-6">
                      <input
                        type="checkbox"
                        checked={excludeSentToday}
                        onChange={(e) => setExcludeSentToday(e.target.checked)}
                        className="mr-2"
                      />
                      <div>
                        <span className="text-sm font-medium text-blue-900">Exclude contacts who received a message today</span>
                        <p className="text-xs text-blue-700 mt-1">
                          Skip contacts who already received an SMS today to avoid sending twice in one day
                        </p>
                      </div>
                    </label>
                    
                    {/* Contact Counts Display */}
                    {loadingCounts ? (
                      <div className="mt-4 ml-6 text-sm text-blue-700">
                        Loading contact counts...
                      </div>
                    ) : totalContactsCount !== null && (
                      <div className="mt-4 ml-6 space-y-2 p-3 bg-white rounded border border-blue-200">
                        <div className="text-sm">
                          <span className="font-medium text-blue-900">Total Contacts: </span>
                          <span className="text-blue-700">{totalContactsCount.toLocaleString()}</span>
                        </div>
                        {excludeSentToday && excludedContactsCount !== null && (
                          <div className="text-sm">
                            <span className="font-medium text-orange-600">Excluded (sent today): </span>
                            <span className="text-orange-700">{excludedContactsCount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="text-sm pt-2 border-t border-blue-200">
                          <span className="font-bold text-green-700">Total SMS to Send: </span>
                          <span className="text-green-800 font-semibold text-base">
                            {eligibleContactsCount !== null 
                              ? eligibleContactsCount.toLocaleString()
                              : totalContactsCount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Select Contacts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Select Specific Contacts to Send To
                </label>
                <div className="border border-gray-300 rounded-md p-4 max-h-60 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <p className="text-sm text-gray-500">No contacts available. Add contacts in the Contacts tab.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={!sendToAllContacts && selectedContactsForCampaign.length === contacts.filter(c => !c.opted_out).length && contacts.filter(c => !c.opted_out).length > 0}
                            disabled={sendToAllContacts}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContactsForCampaign(contacts.filter(c => !c.opted_out).map(c => c.id));
                              } else {
                                setSelectedContactsForCampaign([]);
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm font-medium">Select All ({contacts.filter(c => !c.opted_out).length} available)</span>
                        </div>
                        {contactsTotal > contacts.length && (
                          <button
                            type="button"
                            onClick={async () => {
                              setLoadingAllContacts(true);
                              try {
                                const res = await contactsAPI.getContacts({ all: true });
                                const allContacts = res.data.contacts || [];
                                setContacts(allContacts);
                                setContactsTotal(allContacts.length);
                                // Auto-select all if not sending to all
                                if (!sendToAllContacts) {
                                  setSelectedContactsForCampaign(allContacts.filter(c => !c.opted_out).map(c => c.id));
                                }
                              } catch (error) {
                                console.error('Failed to load all contacts:', error);
                                showError('Failed to load all contacts. Please try again.');
                              } finally {
                                setLoadingAllContacts(false);
                              }
                            }}
                            disabled={loadingAllContacts || sendToAllContacts}
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                          >
                            {loadingAllContacts ? 'Loading...' : `Load All (${contactsTotal} total)`}
                          </button>
                        )}
                      </div>
                      {contacts.filter(c => !c.opted_out).map((contact) => (
                        <label key={contact.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedContactsForCampaign.includes(contact.id)}
                            disabled={sendToAllContacts}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContactsForCampaign([...selectedContactsForCampaign, contact.id]);
                              } else {
                                setSelectedContactsForCampaign(selectedContactsForCampaign.filter(id => id !== contact.id));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className={`text-sm ${sendToAllContacts ? 'text-gray-400' : ''}`}>
                            {contact.first_name} {contact.last_name} - {contact.phone_number}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {(selectedContactsForCampaign.length > 0 || sendToAllContacts) && (
                  <p className="mt-2 text-sm text-gray-600">
                    {sendToAllContacts 
                      ? `Will send to all contacts (${contactsTotal} total, excluding opted-out and no-consent contacts)`
                      : `${selectedContactsForCampaign.length} contact(s) selected`
                    }
                  </p>
                )}
              </div>

              {/* Select Lists */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Select Lists to Send To
                </label>
                <div className="border border-gray-300 rounded-md p-4">
                  {lists.length === 0 ? (
                    <p className="text-sm text-gray-500">No lists available. Create lists in the Contacts tab.</p>
                  ) : (
                    <div className="space-y-2">
                      {lists.map((list) => (
                        <label key={list.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedListsForCampaign.includes(list.id)}
                            disabled={sendToAllContacts}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedListsForCampaign([...selectedListsForCampaign, list.id]);
                              } else {
                                setSelectedListsForCampaign(selectedListsForCampaign.filter(id => id !== list.id));
                              }
                            }}
                            className="mr-2"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">{list.name}</span>
                            {list.description && (
                              <p className="text-xs text-gray-500">{list.description}</p>
                            )}
                            <p className="text-xs text-gray-400">{list.contact_count || 0} contacts</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {selectedListsForCampaign.length > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    {selectedListsForCampaign.length} list(s) selected
                  </p>
                )}
              </div>

              {availableNumbers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Send From (Select Numbers)
                  </label>
                  <div className="space-y-2">
                    {availableNumbers.map((num) => (
                      <label key={num.phone_number} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedNumbers.some(n => n.phone_number === num.phone_number)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNumbers([...selectedNumbers, num]);
                            } else {
                              setSelectedNumbers(selectedNumbers.filter(n => n.phone_number !== num.phone_number));
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">
                          {num.phone_number} ({num.type}, {num.rateLimit} msg/min)
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedNumbers.length > 0 && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-md text-sm">
                      <p className="font-medium">Total Throughput:</p>
                      <p className="text-gray-600">
                        {selectedNumbers.reduce((sum, n) => sum + (n.rateLimit || 0), 0)} messages/minute
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Test SMS Section */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">🧪 Test SMS Sending</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Send a test SMS to verify your setup is working before creating a campaign.
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <button
                    onClick={handleTestSMS}
                    disabled={sendingTest || !testPhoneNumber || !messageText || selectedNumbers.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {sendingTest ? 'Sending...' : 'Test SMS'}
                  </button>
                </div>
                {selectedNumbers.length === 0 && availableNumbers.length > 0 && (
                  <p className="text-xs text-yellow-600 mt-2">
                    ⚠️ Please select at least one phone number to send from
                  </p>
                )}
              </div>
              
              <button
                onClick={handleCreateCampaign}
                disabled={loading || !campaignName || !messageText || (!sendToAllContacts && selectedContactsForCampaign.length === 0 && selectedListsForCampaign.length === 0)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed mt-4"
              >
                {loading ? (sendToAllContacts ? 'Loading All Contacts...' : 'Creating Campaign...') : 'Create Campaign'}
              </button>
              {selectedNumbers.length === 0 && availableNumbers.length === 0 && (
                <p className="text-sm text-yellow-600 mt-2">
                  ⚠️ No SMS numbers available. The campaign will be created but cannot send until a phone number is configured.
                </p>
              )}
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No campaigns yet. Create your first campaign in the "Send Campaign" tab.
                </div>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{campaign.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Created: {formatDateInBusinessTimezone(campaign.created_at)}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            campaign.status === 'completed' ? 'bg-green-100 text-green-800' :
                            campaign.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            campaign.status === 'failed' ? 'bg-red-100 text-red-800' :
                            campaign.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {campaign.status}
                          </span>
                          {campaign.status === 'processing' && (
                            <button
                              onClick={() => handleCancelCampaign(campaign.id)}
                              className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Progress</span>
                          <span>{campaign.stats?.sent || 0} / {campaign.total_recipients} sent</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${campaign.progress || 0}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Total:</span>
                          <span className="ml-2 font-medium">{campaign.total_recipients}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Sent:</span>
                          <span className="ml-2 font-medium text-green-600">{campaign.stats?.sent || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Failed:</span>
                          <span className="ml-2 font-medium text-red-600">{campaign.stats?.failed || 0}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleViewCampaign(campaign.id)}
                        className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                      >
                        View Details →
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Campaign Details Modal */}
              {selectedCampaign && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCampaign(null)}>
                  <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Campaign Details: {selectedCampaign.name}</h3>
                      <button
                        onClick={() => setSelectedCampaign(null)}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <strong className="text-gray-700">Message:</strong>
                        <p className="mt-1 text-gray-900">{selectedCampaign.message_text}</p>
                      </div>
                      <div>
                        <strong className="text-gray-700">Status:</strong>
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                          selectedCampaign.status === 'completed' ? 'bg-green-100 text-green-800' :
                          selectedCampaign.status === 'failed' ? 'bg-red-100 text-red-800' :
                          selectedCampaign.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                          selectedCampaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {selectedCampaign.status}
                        </span>
                      </div>
                      <div>
                        <strong className="text-gray-700">Total Recipients:</strong>
                        <span className="ml-2">{selectedCampaign.total_recipients}</span>
                      </div>
                      <div>
                        <strong className="text-gray-700">Sent:</strong>
                        <span className="ml-2 text-green-600">{selectedCampaign.sent_count || 0}</span>
                      </div>
                      <div>
                        <strong className="text-gray-700">Failed:</strong>
                        <span className="ml-2 text-red-600">{selectedCampaign.failed_count || 0}</span>
                      </div>
                      
                      {/* Sent Recipients Section */}
                      {selectedCampaign.sent_count > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex justify-between items-center mb-3">
                            <strong className="text-gray-700">Sent Recipients ({selectedCampaign.sent_count}):</strong>
                          </div>
                          {loadingSentRecipients ? (
                            <p className="text-sm text-gray-500">Loading sent recipients...</p>
                          ) : sentRecipients.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {sentRecipients.map((recipient) => (
                                <div key={recipient.id} className="p-3 bg-green-50 rounded-md border border-green-200">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-gray-900">
                                        {recipient.first_name && recipient.last_name 
                                          ? `${recipient.first_name} ${recipient.last_name}`
                                          : recipient.email || 'Unknown'
                                        }
                                      </div>
                                      <div className="text-sm text-gray-600 mt-1">
                                        📱 {recipient.phone_number}
                                      </div>
                                      {recipient.sent_at && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Sent: {formatDateInBusinessTimezone(recipient.sent_at)}
                                        </div>
                                      )}
                                    </div>
                                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                      ✓ Sent
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No sent recipients found</p>
                          )}
                        </div>
                      )}
                      
                      {/* Failed Recipients Section */}
                      {selectedCampaign.failed_count > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex justify-between items-center mb-3">
                            <strong className="text-gray-700">Failed Recipients:</strong>
                            {failedRecipients.length > 0 && (
                              <button
                                onClick={() => handleResendFailedRecipients(selectedCampaign.id, failedRecipients.map(r => r.id))}
                                className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                              >
                                Resend All ({failedRecipients.length})
                              </button>
                            )}
                          </div>
                          {loadingFailedRecipients ? (
                            <p className="text-sm text-gray-500">Loading failed recipients...</p>
                          ) : failedRecipients.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {failedRecipients.map((recipient) => (
                                <div key={recipient.id} className="p-3 bg-red-50 rounded-md border border-red-200">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-gray-900">
                                        {recipient.first_name && recipient.last_name 
                                          ? `${recipient.first_name} ${recipient.last_name}`
                                          : recipient.email || 'Unknown'
                                        }
                                      </div>
                                      <div className="text-sm text-gray-600 mt-1">
                                        {recipient.phone_number}
                                      </div>
                                      {(recipient.error_message || recipient.status === 'failed') && (
                                        <div className="text-xs text-red-700 mt-2 p-2 bg-red-100 rounded">
                                          <strong>Error:</strong> {recipient.error_message || 'Message failed to send (no error details available)'}
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleResendFailedRecipients(selectedCampaign.id, [recipient.id])}
                                      className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                                    >
                                      Resend
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No failed recipients found</p>
                          )}
                        </div>
                      )}
                      
                      <div>
                        <strong className="text-gray-700">Created:</strong>
                        <span className="ml-2">{formatDateInBusinessTimezone(selectedCampaign.created_at)}</span>
                      </div>
                      {selectedCampaign.started_at && (
                        <div>
                          <strong className="text-gray-700">Started:</strong>
                          <span className="ml-2">{formatDateInBusinessTimezone(selectedCampaign.started_at)}</span>
                        </div>
                      )}
                      {selectedCampaign.completed_at && (
                        <div>
                          <strong className="text-gray-700">Completed:</strong>
                          <span className="ml-2">{formatDateInBusinessTimezone(selectedCampaign.completed_at)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex space-x-2">
                      {(selectedCampaign.status === 'pending' || selectedCampaign.status === 'processing') && (
                        <>
                          {selectedCampaign.status === 'processing' && (
                            <>
                              <button
                                onClick={async () => {
                                  setLoading(true);
                                  try {
                                    const res = await bulkSMSAPI.diagnoseCampaign(selectedCampaign.id);
                                    const diag = res.data;
                                    const message = `Diagnostics:
• Status: ${diag.campaign.status}
• Running: ${diag.campaign.running_duration_minutes} minutes
• Campaign shows: ${diag.campaign.sent_count} sent, ${diag.campaign.failed_count} failed
• Actually: ${diag.actualCounts.sent} sent, ${diag.actualCounts.failed} failed, ${diag.actualCounts.pending} pending
• Pending recipients: ${diag.pendingRecipientsCount}
• Queued recipients: ${diag.queuedRecipientsCount}
${diag.discrepancies.sentCountMismatch ? `⚠️ Sent count mismatch: ${diag.discrepancies.sentCountDiff > 0 ? '+' : ''}${diag.discrepancies.sentCountDiff}` : ''}
${diag.discrepancies.failedCountMismatch ? `⚠️ Failed count mismatch: ${diag.discrepancies.failedCountDiff > 0 ? '+' : ''}${diag.discrepancies.failedCountDiff}` : ''}`;
                                    alert(message);
                                  } catch (error) {
                                    console.error('Diagnose campaign error:', error);
                                    showError(error.response?.data?.error || 'Failed to diagnose campaign');
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                              >
                                Diagnose
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Resume sending to pending recipients? This will continue sending messages that haven\'t been sent yet.')) {
                                    return;
                                  }
                                  setLoading(true);
                                  try {
                                    const res = await bulkSMSAPI.resumeCampaign(selectedCampaign.id);
                                    success(res.data.message || 'Campaign resume started - messages will continue sending');
                                    // Refresh after a delay to see progress
                                    setTimeout(async () => {
                                      await handleViewCampaign(selectedCampaign.id);
                                      await loadData();
                                    }, 2000);
                                  } catch (error) {
                                    console.error('Resume campaign error:', error);
                                    showError(error.response?.data?.error || 'Failed to resume campaign');
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                              >
                                Resume Sending
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Recover this stuck campaign? This will check actual recipient statuses and update the campaign status accordingly.')) {
                                    return;
                                  }
                                  setLoading(true);
                                  try {
                                    const res = await bulkSMSAPI.recoverCampaign(selectedCampaign.id);
                                    if (res.data.success) {
                                      success(res.data.message || 'Campaign recovered successfully');
                                      await handleViewCampaign(selectedCampaign.id);
                                      await loadData();
                                    } else {
                                      showError(res.data.message || 'Campaign is still processing');
                                    }
                                  } catch (error) {
                                    console.error('Recover campaign error:', error);
                                    showError(error.response?.data?.error || 'Failed to recover campaign');
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700"
                              >
                                Recover
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Force complete this campaign? This will mark it as completed based on current recipient statuses, even if not all messages are processed. Use this if messages were sent but the campaign status is stuck.')) {
                                    return;
                                  }
                                  setLoading(true);
                                  try {
                                    const res = await bulkSMSAPI.recoverCampaign(selectedCampaign.id, { force: true });
                                    if (res.data.success) {
                                      success(res.data.message || 'Campaign force completed successfully');
                                      await handleViewCampaign(selectedCampaign.id);
                                      await loadData();
                                    } else {
                                      showError(res.data.message || 'Failed to force complete campaign');
                                    }
                                  } catch (error) {
                                    console.error('Force recover campaign error:', error);
                                    showError(error.response?.data?.error || 'Failed to force complete campaign');
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                              >
                                Force Complete
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handlePauseCampaign(selectedCampaign.id)}
                            className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                          >
                            Pause Campaign
                          </button>
                          <button
                            onClick={() => handleCancelCampaign(selectedCampaign.id)}
                            className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                          >
                            Cancel Campaign
                          </button>
                        </>
                      )}
                      {selectedCampaign.status === 'paused' && (
                        <button
                          onClick={() => handleRestartCampaign(selectedCampaign.id)}
                          className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Restart Campaign
                        </button>
                      )}
                      {(selectedCampaign.status === 'completed' || selectedCampaign.status === 'failed' || selectedCampaign.status === 'cancelled') && (
                        <button
                          onClick={() => handleResendCampaign(selectedCampaign.id)}
                          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                        >
                          Resend Campaign
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCampaign(selectedCampaign.id)}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Delete Campaign
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Numbers Tab */}
          {activeTab === 'numbers' && (
            <div className="bg-white rounded-lg shadow p-6">
              {loading ? (
                <div className="text-center py-8">Loading numbers...</div>
              ) : availableNumbers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No SMS-capable numbers found. Please add a phone number in Settings.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">Available Numbers</h3>
                    <p className="text-sm text-gray-600">
                      Total Throughput: {availableNumbers.reduce((sum, n) => sum + (n.rateLimit || 0), 0)} messages/minute
                    </p>
                  </div>
                  
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate Limit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availableNumbers.map((num) => (
                        <tr key={num.phone_number}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{num.phone_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{num.type}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{num.country}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{num.rateLimit} msg/min</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              num.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {num.verified ? 'Verified' : 'Unverified'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Contracts Tab */}
          {activeTab === 'contracts' && (
            <div className="space-y-6">
              {/* Header Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Contacts ({contactsTotal || contacts.length})</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setShowCreateList(true)}
                      className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Create List
                    </button>
                    <button
                      onClick={() => setShowAddContact(true)}
                      className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Add Contact
                    </button>
                    <label className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
                      Upload CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setUploadFile(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                
                {uploadFile && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-gray-700 mb-2">Selected: {uploadFile.name}</p>
                    <button
                      onClick={handleUploadContacts}
                      disabled={loading}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Uploading...' : 'Upload Contacts'}
                    </button>
                  </div>
                )}
                
                {/* Search */}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setContactsPage(1);
                        loadContactsPage(1);
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      setContactsPage(1);
                      loadContactsPage(1);
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Search
                  </button>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setContactsPage(1);
                        loadContactsPage(1);
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Lists Section */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-3">
                    {selectedList && (
                      <button
                        onClick={() => {
                          setSelectedList(null);
                          setSelectedContactsForList([]);
                          setListContacts([]);
                        }}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center space-x-1"
                        title="Back to All Contacts"
                      >
                        <span>←</span>
                        <span>Back</span>
                      </button>
                    )}
                    <h3 className="text-lg font-semibold">Lists ({lists.length})</h3>
                  </div>
                  <button
                    onClick={() => setShowCreateList(true)}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    + Create New List
                  </button>
                </div>
                {lists.length === 0 ? (
                  <p className="text-gray-500 text-sm">No lists yet. Create one to organize your contacts.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lists.map((list) => (
                      <div
                        key={list.id}
                        className={`p-4 border rounded-md ${
                          selectedList?.id === list.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => {
                              setSelectedList(list);
                              loadListContacts(list.id);
                            }}
                          >
                            <h4 className="font-medium">{list.name}</h4>
                            {list.description && (
                              <p className="text-sm text-gray-500 mt-1">{list.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">{list.contact_count || 0} contacts</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteList(list.id);
                            }}
                            className="text-red-600 hover:text-red-800 text-sm ml-2"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="flex space-x-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedList(list);
                              loadListContacts(list.id);
                            }}
                            className="flex-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                          >
                            View
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Select all contacts and add them to this list
                              if (contacts.length === 0) {
                                showError('No contacts available to add');
                                return;
                              }
                              setSelectedContactsForList(contacts.map(c => c.id));
                              await handleAddContactsToList(list.id);
                            }}
                            className="flex-1 px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                          >
                            Add All Contacts
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contacts Table */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-3">
                    {selectedList && (
                      <button
                        onClick={() => {
                          setSelectedList(null);
                          setSelectedContactsForList([]);
                          setListContacts([]);
                        }}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center space-x-1 font-medium"
                        title="Back to All Contacts"
                      >
                        <span>←</span>
                        <span>Back</span>
                      </button>
                    )}
                    <h3 className="text-lg font-semibold">
                      {selectedList ? `Contacts in "${selectedList.name}"` : 'All Contacts'}
                    </h3>
                  </div>
                  <div className="flex space-x-2">
                    {!selectedList && (
                      <>
                        {selectedContactsForList.length > 0 && (
                          <button
                            onClick={() => setShowAddToListModal(true)}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          >
                            Add {selectedContactsForList.length} Selected to List
                          </button>
                        )}
                        {contacts.length > 0 && (
                          <button
                            onClick={() => {
                              setSelectedContactsForList(contacts.map(c => c.id));
                              setShowAddToListModal(true);
                            }}
                            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                          >
                            Add All to List
                          </button>
                        )}
                        <button
                          onClick={handleSyncOptOuts}
                          disabled={loading}
                          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                        >
                          Sync Opt-Outs
                        </button>
                      </>
                    )}
                    {selectedList && (
                      <button
                        onClick={() => {
                          setSelectedList(null);
                          setSelectedContactsForList([]);
                          setListContacts([]);
                        }}
                        className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                      >
                        View All Contacts
                      </button>
                    )}
                  </div>
                </div>
                {loading ? (
                  <div className="text-center py-8">Loading contacts...</div>
                ) : (selectedList ? listContacts : contacts).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {selectedList ? 'No contacts in this list' : 'No contacts yet. Add or upload contacts to get started.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {!selectedList && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              <input
                                type="checkbox"
                                checked={selectedContactsForList.length === (selectedList ? listContacts : contacts).filter(contact => {
                                  if (!searchQuery) return true;
                                  const query = searchQuery.toLowerCase();
                                  return (
                                    contact.first_name?.toLowerCase().includes(query) ||
                                    contact.last_name?.toLowerCase().includes(query) ||
                                    contact.phone_number?.includes(query) ||
                                    contact.email?.toLowerCase().includes(query)
                                  );
                                }).length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const filtered = (selectedList ? listContacts : contacts).filter(contact => {
                                      if (!searchQuery) return true;
                                      const query = searchQuery.toLowerCase();
                                      return (
                                        contact.first_name?.toLowerCase().includes(query) ||
                                        contact.last_name?.toLowerCase().includes(query) ||
                                        contact.phone_number?.includes(query) ||
                                        contact.email?.toLowerCase().includes(query)
                                      );
                                    });
                                    setSelectedContactsForList(filtered.map(c => c.id));
                                  } else {
                                    setSelectedContactsForList([]);
                                  }
                                }}
                                className="rounded"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opt-Out</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(selectedList ? listContacts : contacts)
                          .filter(contact => {
                            if (!searchQuery) return true;
                            const query = searchQuery.toLowerCase();
                            return (
                              contact.first_name?.toLowerCase().includes(query) ||
                              contact.last_name?.toLowerCase().includes(query) ||
                              contact.phone_number?.includes(query) ||
                              contact.email?.toLowerCase().includes(query)
                            );
                          })
                          .map((contact) => (
                            <tr key={contact.id} className={contact.opted_out ? 'bg-red-50' : ''}>
                              {!selectedList && (
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedContactsForList.includes(contact.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedContactsForList([...selectedContactsForList, contact.id]);
                                      } else {
                                        setSelectedContactsForList(selectedContactsForList.filter(id => id !== contact.id));
                                      }
                                    }}
                                    className="rounded"
                                  />
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {contact.first_name} {contact.last_name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contact.phone_number}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contact.email || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() => handleToggleOptOut(contact.id, contact.opted_out)}
                                  className={`px-2 py-1 text-xs rounded-full ${
                                    contact.opted_out
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-green-100 text-green-800'
                                  }`}
                                >
                                  {contact.opted_out ? 'Opted Out' : 'Opted In'}
                                </button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <button
                                  onClick={() => handleDeleteContact(contact.id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Pagination */}
                {!selectedList && contactsTotal > contactsPageSize && (
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <div className="text-sm text-gray-700">
                      Showing {((contactsPage - 1) * contactsPageSize) + 1} to {Math.min(contactsPage * contactsPageSize, contactsTotal)} of {contactsTotal} contacts
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const newPage = contactsPage - 1;
                          if (newPage >= 1) {
                            setContactsPage(newPage);
                            loadContactsPage(newPage);
                          }
                        }}
                        disabled={contactsPage === 1 || loading}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm">
                        Page {contactsPage} of {Math.ceil(contactsTotal / contactsPageSize)}
                      </span>
                      <button
                        onClick={() => {
                          const newPage = contactsPage + 1;
                          if (newPage <= Math.ceil(contactsTotal / contactsPageSize)) {
                            setContactsPage(newPage);
                            loadContactsPage(newPage);
                          }
                        }}
                        disabled={contactsPage >= Math.ceil(contactsTotal / contactsPageSize) || loading}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Opt-Outs Tab */}
          {activeTab === 'optouts' && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4 flex gap-2">
                <button
                  onClick={handleSyncOptOuts}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Sync Opt-Outs
                </button>
                <button
                  onClick={handleDiagnose}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  Run Diagnostic
                </button>
              </div>
              {loading ? (
                <div className="text-center py-8">Loading opt-outs...</div>
              ) : optOuts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No opt-outs yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold mb-4">Opted-Out Numbers ({optOuts.length})</h3>
                  <div className="space-y-2">
                    {optOuts.map((optOut) => (
                      <div key={optOut.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div>
                          <p className="font-medium">{optOut.phone_number}</p>
                          <p className="text-sm text-gray-500">
                            Opted out: {new Date(optOut.opted_out_at).toLocaleString()}
                            {optOut.reason && ` (${optOut.reason})`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Contact Modal */}
        {showAddContact && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Add New Contact</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    value={newContact.phone_number}
                    onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newContact.first_name}
                    onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newContact.last_name}
                    onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleCreateContact}
                    disabled={loading || !newContact.phone_number}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddContact(false);
                      setNewContact({
                        email: '',
                        first_name: '',
                        last_name: '',
                        phone_number: '',
                        address: '',
                        city: '',
                        state: '',
                        zip_code: '',
                        notes: '',
                      });
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create List Modal */}
        {showCreateList && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create New List</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">List Name *</label>
                  <input
                    type="text"
                    value={newList.name}
                    onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newList.description}
                    onChange={(e) => setNewList({ ...newList, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleCreateList}
                    disabled={loading || !newList.name}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateList(false);
                      setNewList({ name: '', description: '' });
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add to List Modal */}
        {showAddToListModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">
                Add {selectedContactsForList.length} Contact(s) to List
              </h3>
              <div className="space-y-4">
                {lists.length === 0 ? (
                  <div>
                    <p className="text-gray-500 text-sm mb-4">No lists available. Create a list first.</p>
                    <button
                      onClick={() => {
                        setShowAddToListModal(false);
                        setShowCreateList(true);
                      }}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Create New List
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {lists.map((list) => (
                        <button
                          key={list.id}
                          onClick={() => {
                            handleAddContactsToList(list.id);
                          }}
                          disabled={loading}
                          className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <div className="font-medium">{list.name}</div>
                          {list.description && (
                            <div className="text-sm text-gray-500">{list.description}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">{list.contact_count || 0} contacts</div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setShowAddToListModal(false);
                        setShowCreateList(true);
                      }}
                      className="w-full px-4 py-2 text-sm bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                    >
                      + Create New List
                    </button>
                  </>
                )}
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setShowAddToListModal(false);
                      setSelectedContactsForList([]);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

export default SMSPage;

