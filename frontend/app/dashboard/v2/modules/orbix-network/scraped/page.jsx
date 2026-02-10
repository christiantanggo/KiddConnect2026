'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Play, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { useOrbixChannel } from '../OrbixChannelContext';

export default function OrbixNetworkScrapedPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const { currentChannelId, apiBody } = useOrbixChannel();
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [rawItemsBySource, setRawItemsBySource] = useState({});
  const [runningScrape, setRunningScrape] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [timeRange, setTimeRange] = useState('all'); // 'all' | '30' | '7'

  useEffect(() => {
    if (!currentChannelId) {
      setLoading(false);
      setSources([]);
      setRawItemsBySource({});
      return;
    }
    loadData();
  }, [timeRange, currentChannelId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = { limit: 2000 };
      if (timeRange !== 'all') params.days = timeRange;
      const [sourcesRes, rawItemsRes] = await Promise.all([
        orbixNetworkAPI.getSources(),
        orbixNetworkAPI.getRawItems(params)
      ]);
      
      const sourcesList = sourcesRes.data.sources || [];
      setSources(sourcesList);
      
      // Group raw items by source_id
      const items = rawItemsRes.data.raw_items || [];
      const grouped = {};
      
      for (const item of items) {
        const sourceId = item.source_id || 'unknown';
        if (!grouped[sourceId]) {
          grouped[sourceId] = [];
        }
        grouped[sourceId].push(item);
      }
      
      setRawItemsBySource(grouped);
    } catch (error) {
      console.error('Failed to load scraped data:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load scraped data');
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    try {
      setRunningScrape(true);
      const response = await orbixNetworkAPI.triggerScrapeJob(apiBody());
      const msg = response.data?.message || 'Scrape completed.';
      if (response.data?.success === false) {
        showErrorToast(response.data?.error || msg);
      } else {
        success(msg);
      }
      await loadData();
    } catch (error) {
      console.error('Failed to trigger scrape:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to trigger scrape job');
    } finally {
      setRunningScrape(false);
    }
  };

  const getSourceName = (sourceId) => {
    if (sourceId === 'unknown' || !sourceId) return 'Unknown Source';
    const source = sources.find(s => s.id === sourceId);
    return source?.name || 'Unknown Source';
  };

  const getSourceInfo = (sourceId) => {
    if (sourceId === 'unknown' || !sourceId) return null;
    return sources.find(s => s.id === sourceId);
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'NEW': 'bg-yellow-100 text-yellow-800',
      'PROCESSED': 'bg-green-100 text-green-800',
      'DISCARDED': 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const formatItemDate = (item) => {
    const dateStr = item.published_at || item.created_at;
    if (!dateStr) return null;
    let date;
    if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)) {
      date = new Date(dateStr);
    } else {
      date = new Date(dateStr + 'Z');
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  const sourceIds = Object.keys(rawItemsBySource);
  const totalItems = Object.values(rawItemsBySource).reduce((sum, items) => sum + items.length, 0);

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <Link
                href="/dashboard/v2/modules/orbix-network/dashboard"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold mb-2">Scraped Items</h1>
              <p className="text-gray-600">News items scraped from your sources, grouped by source</p>
            </div>
            <button
              onClick={handleScrape}
              disabled={runningScrape}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runningScrape ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Scrape
                </>
              )}
            </button>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Scraped Items</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Sources with Items</p>
                <p className="text-2xl font-bold">{sourceIds.length}</p>
              </div>
            </div>
          </div>

          {/* Items Grouped by Source */}
          {sourceIds.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Scraped Items</h3>
              <p className="text-gray-600 mb-6">
                Run the scrape job to fetch news items from your configured sources.
              </p>
              <button
                onClick={handleScrape}
                disabled={runningScrape}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {runningScrape ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Scrape Job
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {sourceIds.map((sourceId) => {
                const items = rawItemsBySource[sourceId];
                const source = getSourceInfo(sourceId);
                const newCount = items.filter(i => i.status === 'NEW').length;
                const processedCount = items.filter(i => i.status === 'PROCESSED').length;
                const discardedCount = items.filter(i => i.status === 'DISCARDED').length;

                return (
                  <div key={sourceId} className="bg-white rounded-lg shadow">
                    {/* Source Header */}
                    <div className="p-6 border-b border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-xl font-semibold">{getSourceName(sourceId)}</h2>
                            {source && (
                              <>
                                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  {source.type}
                                </span>
                                {source.enabled ? (
                                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                    Enabled
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                                    Disabled
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {source && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                              {source.url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm text-gray-600">Total Items</p>
                          <p className="text-2xl font-bold">{items.length}</p>
                          <div className="flex gap-2 mt-2 text-xs">
                            <span className="text-yellow-600">{newCount} new</span>
                            <span className="text-green-600">{processedCount} processed</span>
                            {discardedCount > 0 && <span className="text-red-600">{discardedCount} discarded</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="p-6">
                      <div className="space-y-4">
                        {items.slice(0, 20).map((item) => (
                          <div key={item.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex flex-col">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <p className="font-medium text-sm flex-1 line-clamp-2">{item.title || 'Untitled'}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {formatItemDate(item) && (
                                    <span className="text-xs text-gray-600 whitespace-nowrap" title={item.published_at ? 'Article publish date' : 'When we scraped this item'}>
                                      {item.published_at ? 'Published' : 'Scraped'}: {formatItemDate(item)}
                                    </span>
                                  )}
                                  {getStatusBadge(item.status)}
                                </div>
                              </div>
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-700 break-all flex items-center gap-1"
                                  title={item.url}
                                >
                                  {item.url}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              )}
                              {item.snippet && (
                                <p className="text-xs text-gray-600 mt-2 line-clamp-2">{item.snippet}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {items.length > 20 && (
                          <p className="text-sm text-gray-500 text-center pt-4">
                            Showing 20 of {items.length} items
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

