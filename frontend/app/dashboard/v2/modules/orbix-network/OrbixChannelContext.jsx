'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { orbixNetworkAPI } from '@/lib/api';

const STORAGE_KEY = 'orbix_selected_channel_id';

const OrbixChannelContext = createContext(null);

export function OrbixChannelProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [currentChannelId, setCurrentChannelIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setCurrentChannelId = useCallback((id) => {
    setCurrentChannelIdState(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refetchChannels = useCallback(async () => {
    try {
      const res = await orbixNetworkAPI.getChannels();
      const list = res.data?.channels ?? [];
      setChannels(list);
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const validStored = stored && list.some((c) => c.id === stored);
      if (list.length > 0) {
        setCurrentChannelIdState(validStored ? stored : list[0].id);
        if (!validStored && typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, list[0].id);
      } else {
        setCurrentChannelIdState(null);
      }
    } catch (e) {
      console.error('[OrbixChannel] Failed to fetch channels:', e);
      setChannels([]);
      setCurrentChannelIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchChannels();
  }, [refetchChannels]);

  const value = {
    channels,
    currentChannelId,
    setCurrentChannelId,
    refetchChannels,
    loading,
    apiParams: () => (currentChannelId ? { channel_id: currentChannelId } : {}),
    apiBody: () => (currentChannelId ? { channel_id: currentChannelId } : {}),
  };

  return (
    <OrbixChannelContext.Provider value={value}>
      {children}
    </OrbixChannelContext.Provider>
  );
}

export function useOrbixChannel() {
  const ctx = useContext(OrbixChannelContext);
  if (!ctx) throw new Error('useOrbixChannel must be used within OrbixChannelProvider');
  return ctx;
}
