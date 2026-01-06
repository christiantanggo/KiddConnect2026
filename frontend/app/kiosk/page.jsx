'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createKioskAPI } from '@/lib/api';

function KioskPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [activeView, setActiveView] = useState('active'); // 'active', 'history', 'settings'
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acknowledgedOrders, setAcknowledgedOrders] = useState([]);
  const [newOrderIds, setNewOrderIds] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10000); // 10 seconds (default)
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Memoize kioskAPI to prevent recreation on every render
  const kioskAPI = useMemo(() => {
    return token ? createKioskAPI(token) : null;
  }, [token]);
  const previousOrderIdsRef = useRef(new Set());
  const refreshIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Create beep sound using Web Audio API as fallback
  const playBeep = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // 800 Hz beep
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Could not play beep sound:', error);
    }
  }, []);

  // Load settings (only once on mount)
  useEffect(() => {
    if (!kioskAPI) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      try {
        const res = await kioskAPI.getSettings();
        if (isMounted) {
          setSettings(res.data.settings);
        }
      } catch (error) {
        // Only log if it's not a rate limit error (429)
        if (error.response?.status !== 429) {
          console.error('Failed to load settings:', error);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [token]); // Only depend on token, not kioskAPI (which changes on every render)

  // Load orders
  const loadOrders = useCallback(async () => {
    if (!kioskAPI) return;

    try {
      const res = await kioskAPI.getActiveOrders();
      const newOrders = res.data.orders || [];
      
      // Detect new orders
      const currentOrderIds = new Set(newOrders.map(o => o.id));
      const previousOrderIds = previousOrderIdsRef.current;
      
      // Find newly added orders (only "pending" orders should flash)
      const newlyAdded = newOrders
        .filter(order => !previousOrderIds.has(order.id) && order.status === 'pending')
        .map(order => order.id);
      
      if (newlyAdded.length > 0) {
        setNewOrderIds(prev => [...prev, ...newlyAdded]);
        // Play sound if enabled
        if (soundEnabled) {
          playBeep();
        }
      }
      
      // Remove orders from newOrderIds if they're no longer "pending" or no longer exist
      setNewOrderIds(prev => prev.filter(id => {
        const order = newOrders.find(o => o.id === id);
        // Only keep if order exists and is still "pending"
        // (acknowledged orders are already filtered by shouldFlash function)
        return order && order.status === 'pending';
      }));
      
      previousOrderIdsRef.current = currentOrderIds;
      setOrders(newOrders);
      setLastRefreshTime(new Date());
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  }, [kioskAPI, soundEnabled]);

  // Load order history
  const loadHistory = useCallback(async () => {
    if (!kioskAPI) return;

    try {
      const res = await kioskAPI.getOrderHistory({ limit: 50 });
      setHistoryOrders(res.data.orders || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, [kioskAPI]);

  // Store latest functions in refs to avoid dependency issues
  const loadOrdersRef = useRef(loadOrders);
  const loadHistoryRef = useRef(loadHistory);
  const activeViewRef = useRef(activeView);

  // Update refs when values change
  useEffect(() => {
    loadOrdersRef.current = loadOrders;
    loadHistoryRef.current = loadHistory;
    activeViewRef.current = activeView;
  }, [loadOrders, loadHistory, activeView]);

  // Initial load and setup refresh
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Load data based on current view
    if (activeView === 'history') {
      loadHistory();
    } else {
      loadOrders();
    }

    // Set up auto-refresh
    refreshIntervalRef.current = setInterval(() => {
      if (activeViewRef.current === 'history') {
        loadHistoryRef.current();
      } else {
        loadOrdersRef.current();
      }
    }, refreshInterval);

    // Update current time every second for countdown timers
    countdownIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [token, refreshInterval, activeView]); // Include activeView to reload when switching views

  // Handle order tap (acknowledge)
  const handleOrderTap = (orderId) => {
    setAcknowledgedOrders(prev => [...prev, orderId]);
    setNewOrderIds(prev => prev.filter(id => id !== orderId));
  };

  // Update order status
  const updateStatus = async (orderId, status) => {
    if (!kioskAPI) return;

    try {
      await kioskAPI.updateOrderStatus(orderId, status);
      // Automatically acknowledge the order when status changes (stops flashing)
      if (status !== 'pending') {
        setAcknowledgedOrders(prev => [...prev, orderId]);
        setNewOrderIds(prev => prev.filter(id => id !== orderId));
      }
      // Reload orders
      await loadOrders();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update order status');
    }
  };

  // Print receipt
  const printReceipt = async (orderId) => {
    if (!kioskAPI) return;

    try {
      const res = await kioskAPI.getReceipt(orderId);
      const receipt = res.data.receipt;
      
      // Format the date in business timezone before inserting into template
      // Use formatDateTime if available, otherwise fallback to default formatting
      const formattedDate = formatDateTime 
        ? formatDateTime(receipt.order.created_at)
        : new Date(receipt.order.created_at).toLocaleString();
      
      // Open print window
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Receipt - ${receipt.order.order_number}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 20px; }
              .order-info { margin-bottom: 15px; }
              .items { margin: 15px 0; }
              .item { margin: 10px 0; padding: 10px; border-bottom: 1px solid #eee; }
              .totals { margin-top: 20px; padding-top: 15px; border-top: 2px solid #000; }
              .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
              .total-final { font-weight: bold; font-size: 1.2em; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${receipt.business.name}</h1>
              ${receipt.business.address ? `<p>${receipt.business.address}</p>` : ''}
              ${receipt.business.phone ? `<p>${receipt.business.phone}</p>` : ''}
            </div>
            <div class="order-info">
              <p><strong>Order #:</strong> ${receipt.order.order_number}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              ${receipt.order.customer_name ? `<p><strong>Customer:</strong> ${receipt.order.customer_name}</p>` : ''}
              <p><strong>Phone:</strong> ${receipt.order.customer_phone}</p>
            </div>
            <div class="items">
              <h3>Items:</h3>
              ${receipt.order.items.map(item => `
                <div class="item">
                  <div><strong>${item.item_name}</strong> x${item.quantity}</div>
                  ${item.modifications ? `<div style="font-size: 0.9em; color: #666; margin-left: 20px;">${item.modifications}</div>` : ''}
                  <div style="text-align: right;">$${parseFloat(item.item_total).toFixed(2)}</div>
                </div>
              `).join('')}
            </div>
            <div class="totals">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>$${parseFloat(receipt.order.subtotal).toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span>Tax:</span>
                <span>$${parseFloat(receipt.order.tax).toFixed(2)}</span>
              </div>
              <div class="total-row total-final">
                <span>Total:</span>
                <span>$${parseFloat(receipt.order.total).toFixed(2)}</span>
              </div>
            </div>
            ${receipt.order.special_instructions ? `<p style="margin-top: 20px;"><strong>Special Instructions:</strong> ${receipt.order.special_instructions}</p>` : ''}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    } catch (error) {
      console.error('Failed to print receipt:', error);
      alert('Failed to load receipt');
    }
  };

  // Calculate countdown timer (uses currentTime state for real-time updates)
  // ALWAYS calculates from order.created_at (when order was placed), not from page load time
  const getCountdown = useCallback((order) => {
    if (!settings || !order.created_at) return null;
    
    // Parse created_at - handle timezone correctly
    // Supabase returns timestamps in ISO format, but we need to ensure proper parsing
    let created;
    if (typeof order.created_at === 'string') {
      // Supabase typically returns ISO strings with 'Z' (UTC) or timezone offset
      // If it has timezone info, parse as-is
      if (order.created_at.includes('Z') || order.created_at.match(/[+-]\d{2}:\d{2}$/)) {
        created = new Date(order.created_at);
      } else {
        // No timezone info - PostgreSQL timestamps are typically in UTC
        // Add 'Z' to indicate UTC, then JavaScript will convert to local time
        created = new Date(order.created_at.replace(' ', 'T') + 'Z');
      }
    } else {
      created = new Date(order.created_at);
    }
    
    // Ensure we have a valid date
    if (isNaN(created.getTime())) {
      console.error('[Countdown] Invalid date:', order.created_at);
      return null;
    }
    
    // Get prep time from settings (should be 30 minutes)
    const estimatedMinutes = parseInt(settings?.takeout_estimated_ready_minutes, 10);
    
    // Validate prep time
    let prepTimeMinutes = 30; // Default fallback
    if (!isNaN(estimatedMinutes) && estimatedMinutes > 0 && estimatedMinutes <= 120) {
      prepTimeMinutes = estimatedMinutes;
    }
    
    // ALWAYS calculate from created_at + prep time (ignore estimated_ready_time from DB)
    // This ensures countdown is based on when order was placed, not when SQL was run
    const estimatedReady = new Date(created.getTime() + prepTimeMinutes * 60 * 1000);
    
    // Use currentTime state (updates every second) for real-time countdown
    const now = currentTime instanceof Date ? currentTime : new Date();
    const diffMs = estimatedReady.getTime() - now.getTime();
    
    // Debug logging to help diagnose timezone issues
    if (Math.abs(diffMs) > 120 * 60 * 1000) { // More than 2 hours difference
      console.warn('[Countdown] Large time difference detected:', {
        created_at: order.created_at,
        created_parsed: created.toISOString(),
        prepTimeMinutes,
        estimatedReady: estimatedReady.toISOString(),
        now: now.toISOString(),
        diffMs,
        diffMinutes: Math.floor(diffMs / 60000)
      });
    }
    
    if (diffMs <= 0) {
      const overdueMs = Math.abs(diffMs);
      const overdueMinutes = Math.floor(overdueMs / 60000);
      const overdueSeconds = Math.floor((overdueMs % 60000) / 1000);
      return {
        text: `Overdue: ${overdueMinutes}:${overdueSeconds.toString().padStart(2, '0')}`,
        color: 'red',
        isOverdue: true,
      };
    }
    
    // Calculate total seconds first, then convert to minutes and seconds
    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Ensure we don't show negative values
    const displayMinutes = Math.max(0, minutes);
    const displaySeconds = Math.max(0, seconds);
    
    let color = 'green';
    if (displayMinutes < 5) color = 'red';
    else if (displayMinutes < 10) color = 'orange';
    
    return {
      text: `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')}`,
      color,
      isOverdue: false,
    };
  }, [settings, currentTime]);

  // Check if order should flash
  // Only flash if: order is new, not acknowledged, AND status is still "pending"
  const shouldFlash = (orderId) => {
    const order = orders.find(o => o.id === orderId);
    // Don't flash if order is acknowledged or if status is not "pending"
    if (acknowledgedOrders.includes(orderId) || (order && order.status !== 'pending')) {
      return false;
    }
    return newOrderIds.includes(orderId);
  };

  // Format date/time in business timezone
  const formatDateTime = useCallback((dateString, options = {}) => {
    if (!dateString || !settings?.timezone) {
      // Fallback to browser timezone if settings not loaded
      return new Date(dateString).toLocaleString();
    }

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      const defaultOptions = {
        timeZone: settings.timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...options,
      };

      return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return new Date(dateString).toLocaleString();
    }
  }, [settings]);

  // Format time only in business timezone
  const formatTime = useCallback((dateString) => {
    return formatDateTime(dateString, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, [formatDateTime]);

  // Format date only in business timezone
  const formatDate = useCallback((dateString) => {
    return formatDateTime(dateString, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [formatDateTime]);

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Kiosk Access Required</h1>
          <p className="text-gray-700">A valid kiosk token is required to access this page.</p>
          <p className="text-sm text-gray-500 mt-2">Please contact your administrator for the kiosk URL.</p>
        </div>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl">Loading kiosk...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Audio notifications are handled via Web Audio API (playBeep function) */}

      {/* Sidebar Navigation */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Kitchen Kiosk</h2>
          {settings && <p className="text-sm text-gray-400">{settings.business_name}</p>}
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveView('active')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeView === 'active' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            Active Orders ({orders.length})
          </button>
          <button
            onClick={() => {
              setActiveView('history');
              loadHistory();
            }}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeView === 'history' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            Order History
          </button>
          <button
            onClick={() => setActiveView('settings')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeView === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            Settings
          </button>
        </nav>

        <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
          {lastRefreshTime && (
            <div>Last refresh: {lastRefreshTime ? formatTime(lastRefreshTime.toISOString()) : 'Never'}</div>
          )}
          <div className="mt-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="rounded"
              />
              <span>Sound Alerts</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto relative">
        {/* Flash border for new orders */}
        {newOrderIds.some(id => !acknowledgedOrders.includes(id)) && (
          <div className="absolute inset-0 pointer-events-none z-50">
            <div className="flash-border"></div>
          </div>
        )}

        {activeView === 'active' && (
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Active Orders</h1>
              <p className="text-gray-600">Tap an order to acknowledge new order notifications</p>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-xl text-gray-500">No active orders</p>
              </div>
            ) : (() => {
              // Sort orders by created_at (newest first)
              const sortedOrders = [...orders].sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
              );
              const newestOrder = sortedOrders[0];
              const olderOrders = sortedOrders.slice(1);
              
              const renderOrderCard = (order, isLarge = false) => {
                const countdown = getCountdown(order);
                const isNew = shouldFlash(order.id);
                
                return (
                  <div
                    key={order.id}
                    onClick={() => handleOrderTap(order.id)}
                    className={`bg-white rounded-lg shadow-lg cursor-pointer transition-all relative ${
                      isLarge ? 'p-8' : 'p-4'
                    } ${
                      isNew ? 'ring-4 ring-red-500 animate-pulse' : 'hover:shadow-xl'
                    }`}
                  >
                      {isNew && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                          NEW
                        </div>
                      )}
                      
                      <div className="mb-4">
                        <div className="flex justify-between items-start mb-2">
                          <h2 className={`font-bold text-gray-900 ${isLarge ? 'text-2xl' : 'text-lg'}`}>#{order.order_number}</h2>
                          <div className="flex flex-col items-end gap-2">
                            {countdown && (
                              <div 
                                key={`countdown-${order.id}-${Math.floor(currentTime.getTime() / 1000)}`}
                                className={`font-bold ${isLarge ? 'text-4xl' : 'text-2xl'} ${
                                  countdown.color === 'red' ? 'text-red-600' :
                                  countdown.color === 'orange' ? 'text-orange-600' :
                                  'text-green-600'
                                }`}
                              >
                                {countdown.text}
                              </div>
                            )}
                            <span className={`px-3 py-1 rounded-full font-semibold ${isLarge ? 'text-base' : 'text-xs'} ${
                              order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                              order.status === 'preparing' ? 'bg-orange-100 text-orange-800' :
                              order.status === 'ready' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`mb-4 space-y-2 ${isLarge ? 'text-lg' : 'text-sm'}`}>
                        {order.customer_name && (
                          <p className="text-gray-700"><strong>Customer:</strong> {order.customer_name}</p>
                        )}
                        <p className="text-gray-700"><strong>Phone:</strong> {order.customer_phone}</p>
                        <p className={`text-gray-500 ${isLarge ? 'text-base' : 'text-xs'}`}>
                          Placed: {formatTime(order.created_at)}
                        </p>
                      </div>

                      <div className="mb-4">
                        <h3 className={`font-semibold text-gray-900 mb-3 ${isLarge ? 'text-3xl' : 'text-2xl'}`}>Items:</h3>
                        <ul className={`space-y-3 ${isLarge ? 'text-2xl' : 'text-xl'}`}>
                          {order.items?.map((item, idx) => (
                            <li key={idx} className="text-gray-700">
                              <div className="flex justify-between">
                                <span className="font-medium">{item.item_name} x{item.quantity}</span>
                                <span className="font-semibold">${parseFloat(item.item_total).toFixed(2)}</span>
                              </div>
                              {item.modifications && (
                                <div className={`text-gray-600 ml-4 mt-1 ${isLarge ? 'text-lg' : 'text-base'}`}>Mods: {item.modifications}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {order.special_instructions && (
                        <div className={`mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 ${isLarge ? 'text-base' : 'text-sm'}`}>
                          <p className="text-gray-700">
                            <strong>Special Instructions:</strong> {order.special_instructions}
                          </p>
                        </div>
                      )}

                      <div className="mb-4 text-right">
                        <p className={`font-bold text-gray-900 ${isLarge ? 'text-2xl' : 'text-lg'}`}>
                          Total: ${parseFloat(order.total).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(order.id, 'confirmed');
                            }}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                          >
                            Confirm
                          </button>
                        )}
                        {order.status === 'confirmed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(order.id, 'preparing');
                            }}
                            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold"
                          >
                            Start Preparing
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(order.id, 'ready');
                            }}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                          >
                            Mark Ready
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(order.id, 'completed');
                            }}
                            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            printReceipt(order.id);
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
                        >
                          Print
                        </button>
                      </div>
                    </div>
                  );
              };
              
              return (
                <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 120px)' }}>
                  {/* Newest Order - Full Width, Top Half */}
                  {newestOrder && (
                    <div className="w-full mb-4 flex-shrink-0" style={{ height: '50%', minHeight: '500px' }}>
                      {renderOrderCard(newestOrder, true)}
                    </div>
                  )}
                  
                  {/* Older Orders - Bottom Half, 1/3 Width Each */}
                  {olderOrders.length > 0 && (
                    <div className="w-full grid grid-cols-3 gap-4 flex-shrink-0" style={{ height: '50%', minHeight: '500px' }}>
                      {olderOrders.slice(0, 3).map((order) => (
                        <div key={order.id} className="h-full">
                          {renderOrderCard(order, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeView === 'history' && (
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Order History</h1>
            </div>

            {historyOrders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-xl text-gray-500">No order history</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold">#{order.order_number}</h3>
                        <p className="text-sm text-gray-500">
                          {formatDateTime(order.created_at)}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        order.status === 'completed' ? 'bg-green-100 text-green-800' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p><strong>Customer:</strong> {order.customer_name || 'N/A'}</p>
                        <p><strong>Phone:</strong> {order.customer_phone}</p>
                      </div>
                      <div className="text-right">
                        <p><strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}</p>
                        <p><strong>Items:</strong> {order.items?.length || 0}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => printReceipt(order.id)}
                      className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Print Receipt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'settings' && (
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            </div>

            <div className="bg-white rounded-lg shadow p-6 space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={refreshInterval / 1000}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value) * 1000)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-sm text-gray-500 mt-1">
                  How often to check for new orders (3-60 seconds)
                </p>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable Sound Notifications</span>
                </label>
              </div>

              {settings && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Business Settings</h3>
                  <p className="text-sm text-gray-600">
                    Estimated Ready Time: {settings.takeout_estimated_ready_minutes} minutes
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse-border {
          0%, 100% {
            border-color: rgba(239, 68, 68, 0.5);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          50% {
            border-color: rgba(239, 68, 68, 1);
            box-shadow: 0 0 0 30px rgba(239, 68, 68, 0);
          }
        }
        
        .flash-border {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border: 12px solid rgba(239, 68, 68, 1);
          animation: pulse-border 1s ease-in-out infinite;
          pointer-events: none;
          z-index: 50;
        }
      `}</style>
    </div>
  );
}

export default KioskPage;

