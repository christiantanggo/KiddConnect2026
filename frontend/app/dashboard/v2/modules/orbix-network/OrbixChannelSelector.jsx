'use client';

import { useState } from 'react';
import { useOrbixChannel } from './OrbixChannelContext';
import { orbixNetworkAPI } from '@/lib/api';
import { handleAPIError } from '@/lib/errorHandler';
import { useToast } from '@/components/ToastProvider';
import { ChevronDown, Plus, Loader2, Trash2 } from 'lucide-react';

export default function OrbixChannelSelector() {
  const { channels, currentChannelId, setCurrentChannelId, refetchChannels, loading } = useOrbixChannel();
  const { success, error: showError } = useToast();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const current = channels.find((c) => c.id === currentChannelId);

  const handleDelete = async (e, ch) => {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId || !ch?.id) return;
    if (!confirm(`Delete channel "${ch.name}"? This will remove the channel and all its sources, stories, and renders. This cannot be undone.`)) return;
    setDeletingId(ch.id);
    try {
      await orbixNetworkAPI.deleteChannel(ch.id);
      await refetchChannels();
      if (currentChannelId === ch.id) {
        const remaining = channels.filter((c) => c.id !== ch.id);
        setCurrentChannelId(remaining.length > 0 ? remaining[0].id : null);
      }
      setOpen(false);
      success('Channel deleted');
    } catch (err) {
      const info = handleAPIError(err);
      showError(info.message || 'Failed to delete channel');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await orbixNetworkAPI.createChannel({ name: newName.trim() });
      const ch = res.data?.channel;
      if (ch) {
        await refetchChannels();
        setCurrentChannelId(ch.id);
        setCreateOpen(false);
        setNewName('');
        success('Channel created');
      }
    } catch (err) {
      const info = handleAPIError(err);
      showError(info.message || 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Channels…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
      >
        <span className="font-medium text-gray-800">
          {current ? current.name : channels.length === 0 ? 'No channel' : 'Select channel'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center justify-between gap-2 group px-3 py-2 text-sm hover:bg-gray-100 ${
                  ch.id === currentChannelId ? 'bg-gray-100 font-medium' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCurrentChannelId(ch.id);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 text-left truncate"
                >
                  {ch.name}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, ch)}
                  disabled={deletingId !== null}
                  title="Delete channel"
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deletingId === ch.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" />
              Create channel
            </button>
          </div>
        </>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">New channel</h3>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Channel name"
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setNewName('');
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
