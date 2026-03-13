'use client';

import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Loader, CheckCircle2, XCircle, Clock, AlertCircle, AlertTriangle, Play, Youtube, Download } from 'lucide-react';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { useOrbixChannel } from '../OrbixChannelContext';

export default function VideoDetailModal({ item, isOpen, onClose, onRestart, onForceProcess, uploadPollingForItem, onClearUploadPolling }) {
  const { success, error: showErrorToast } = useToast();
  const { apiParams, currentChannelId } = useOrbixChannel();
  const [loading, setLoading] = useState(false);
  const [uploadingYouTube, setUploadingYouTube] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const [details, setDetails] = useState(null);
  const [logs, setLogs] = useState([]);
  /** After upload completes: { uploads_last_24h, remaining, limit } to show in modal */
  const [uploadSuccessModal, setUploadSuccessModal] = useState(null);
  const uploadPollRef = useRef(null);
  /** Trivia edit: when true show form; form values for question, option_a, option_b, option_c, correct_answer */
  const [editingTrivia, setEditingTrivia] = useState(false);
  const [triviaEdit, setTriviaEdit] = useState({ question: '', option_a: '', option_b: '', option_c: '', correct_answer: 'A' });
  const [savingTrivia, setSavingTrivia] = useState(false);
  /** Riddle edit: when true show form; form values for riddle_text, answer_text, hook, category */
  const [editingRiddle, setEditingRiddle] = useState(false);
  const [riddleEdit, setRiddleEdit] = useState({ riddle_text: '', answer_text: '', hook: '', category: '' });
  const [savingRiddle, setSavingRiddle] = useState(false);

  // Check if this is a raw item (has raw_item_id but no story_id)
  const isRawItem = item.raw_item_id && !item.story_id;

  useEffect(() => {
    if (isOpen && item) {
      setDetails(null);
      setLogs([]);
      setEditingTrivia(false);
      setEditingRiddle(false);
      loadDetails();
    }
  }, [isOpen, item]);

  useEffect(() => {
    return () => {
      if (uploadPollRef.current) clearInterval(uploadPollRef.current);
    };
  }, []);

  // When modal opened after Force upload from pipeline card: poll until upload completes, then show count modal
  useEffect(() => {
    if (!isOpen || !item?.render_id || !currentChannelId || !uploadPollingForItem || uploadPollingForItem.render_id !== item.render_id) return;
    const startedAt = Date.now();
    const pollMs = 2000;
    const maxMs = 90000;
    const tick = async () => {
      if (Date.now() - startedAt > maxMs) {
        if (uploadPollRef.current) clearInterval(uploadPollRef.current);
        uploadPollRef.current = null;
        if (onClearUploadPolling) onClearUploadPolling();
        return;
      }
      try {
        const res = await orbixNetworkAPI.getRender(item.render_id, apiParams());
        const status = res.data?.render?.render_status;
        if (status === 'COMPLETED') {
          if (uploadPollRef.current) clearInterval(uploadPollRef.current);
          uploadPollRef.current = null;
          if (onClearUploadPolling) onClearUploadPolling();
          if (onForceProcess) onForceProcess();
          await loadDetails();
          try {
            const countRes = await orbixNetworkAPI.getUploadCountLast24h({ channel_id: currentChannelId });
            const d = countRes.data;
            setUploadSuccessModal({
              uploads_last_24h: d.uploads_last_24h ?? 0,
              remaining: d.remaining ?? 0,
              limit: d.limit ?? 7
            });
          } catch (e) {
            setUploadSuccessModal({ uploads_last_24h: 1, remaining: 6, limit: 7 });
          }
          return;
        }
        if (status === 'FAILED' || status === 'STEP_FAILED') {
          if (uploadPollRef.current) clearInterval(uploadPollRef.current);
          uploadPollRef.current = null;
          if (onClearUploadPolling) onClearUploadPolling();
          if (onForceProcess) onForceProcess();
          await loadDetails();
        }
      } catch (e) { /* ignore */ }
    };
    tick();
    uploadPollRef.current = setInterval(tick, pollMs);
    return () => {
      if (uploadPollRef.current) clearInterval(uploadPollRef.current);
    };
  }, [isOpen, item?.render_id, currentChannelId, uploadPollingForItem?.render_id]);

  const loadDetails = async () => {
    if (isRawItem) {
      setDetails(item);
      setLogs([]);
      return;
    }

    if (!item.render_id) {
      if (item.story_id) {
        try {
          setLoading(true);
          const response = await orbixNetworkAPI.getStory(item.story_id, apiParams());
          setDetails(response.data.story);
        } catch (error) {
          console.error('Error loading story details:', error);
          setDetails(item);
        } finally {
          setLoading(false);
        }
      } else {
        setDetails(item);
      }
      setLogs([]);
      return;
    }

    try {
      setLoading(true);
      const [renderRes, storyRes] = await Promise.all([
        orbixNetworkAPI.getRender(item.render_id, apiParams()),
        item.story_id ? orbixNetworkAPI.getStory(item.story_id, apiParams()) : null
      ]);
      const render = renderRes.data.render;
      const story = storyRes?.data?.story;
      setLogs(render.step_logs || []);
      setDetails({
        ...render,
        orbix_scripts: story?.orbix_scripts ?? render.orbix_scripts
      });
    } catch (error) {
      console.error('Error loading render details:', error);
      showErrorToast('Failed to load render details');
    } finally {
      setLoading(false);
    }
  };

  const handleForceProcess = async () => {
    if (!isRawItem || !item.raw_item_id) return;
    
    try {
      setLoading(true);
      await orbixNetworkAPI.forceProcessRawItem(item.raw_item_id, apiParams());
      success('Raw item processed into story successfully');
      onClose(); // Close modal immediately
      if (onForceProcess) {
        // Reload data after a brief delay to ensure story is in database
        setTimeout(() => {
          onForceProcess();
        }, 500);
      }
    } catch (error) {
      console.error('Error force processing raw item:', error);
      showErrorToast(error.response?.data?.error || 'Failed to process raw item');
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!item.story_id) {
      console.error('[Modal] handleGenerateScript: No story_id provided');
      return;
    }
    
    console.log('[Modal] ========== handleGenerateScript START ==========');
    console.log('[Modal] Story ID:', item.story_id);
    
    try {
      setLoading(true);
      console.log('[Modal] Calling API: generateScriptForStory');
      const startTime = Date.now();
      const response = await orbixNetworkAPI.generateScriptForStory(item.story_id, apiParams());
      const duration = Date.now() - startTime;
      console.log(`[Modal] API call completed in ${duration}ms:`, response.data);
      
      const isTrickQuestion = (item.story_category || '').toLowerCase() === 'trickquestion';
      const isDadJoke = (item.story_category || '').toLowerCase() === 'dadjoke';
      if (isTrickQuestion) success('Trick question updated to new format. Question and answer are ready.');
      else if (isDadJoke) success('New joke generated. Setup and punchline updated.');
      else success('Script generated successfully');
      
      // Reload details to show updated script status
      console.log('[Modal] Reloading story details...');
      await loadDetails();
      console.log('[Modal] Details reloaded');
      
      if (onForceProcess) {
        console.log('[Modal] Triggering pipeline reload in 1 second...');
        // Also reload the pipeline
        setTimeout(() => {
          console.log('[Modal] Executing pipeline reload callback');
          onForceProcess();
        }, 1000);
      }
      
      console.log('[Modal] ========== handleGenerateScript SUCCESS ==========');
    } catch (error) {
      console.error('[Modal] ========== handleGenerateScript ERROR ==========');
      console.error('[Modal] Error:', error);
      console.error('[Modal] Error response:', error.response?.data);
      console.error('[Modal] Error stack:', error.stack);
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to generate script');
    } finally {
      setLoading(false);
      console.log('[Modal] Loading state reset');
    }
  };

  const handleStartRender = async () => {
    if (!item.story_id) return;
    
    console.log('[Modal] ========== handleStartRender START ==========');
    console.log('[Modal] Story ID:', item.story_id);
    
    try {
      setLoading(true);
      console.log('[Modal] Calling API: startRenderForStory');
      const startTime = Date.now();
      const response = await orbixNetworkAPI.startRenderForStory(item.story_id, apiParams());
      const duration = Date.now() - startTime;
      console.log(`[Modal] API call completed in ${duration}ms:`, response.data);
      
      success('Render started successfully');
      
      // Close modal and reload pipeline
      onClose();
      if (onForceProcess) {
        console.log('[Modal] Triggering pipeline reload in 1 second...');
        setTimeout(() => {
          console.log('[Modal] Executing pipeline reload callback');
          onForceProcess();
        }, 1000);
      }
      
      console.log('[Modal] ========== handleStartRender SUCCESS ==========');
    } catch (error) {
      console.error('[Modal] ========== handleStartRender ERROR ==========');
      console.error('[Modal] Error:', error);
      console.error('[Modal] Error response:', error.response?.data);
      console.error('[Modal] Error stack:', error.stack);
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to start render');
    } finally {
      setLoading(false);
      console.log('[Modal] Loading state reset');
    }
  };

  const handleForceRenderPipeline = async () => {
    if (!item.story_id) return;
    try {
      setLoading(true);
      await orbixNetworkAPI.forceRenderStory(item.story_id, apiParams());
      success('Render pipeline started');
      onClose();
      if (onForceProcess) {
        setTimeout(() => onForceProcess(), 1000);
      }
    } catch (error) {
      console.error('Error forcing render pipeline:', error);
      showErrorToast(error?.response?.data?.error || 'Failed to force render pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!item.render_id) return;
    
    try {
      setLoading(true);
      await orbixNetworkAPI.restartRender(item.render_id, apiParams(), item.story_id);
      success('Render restarted successfully');
      if (onRestart) {
        onRestart();
      }
      // Reload details after restart
      setTimeout(() => {
        loadDetails();
      }, 1000);
    } catch (error) {
      console.error('Error restarting render:', error);
      showErrorToast('Failed to restart render');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRender = async () => {
    if (!item.render_id) return;
    
    if (!confirm('Are you sure you want to cancel this render? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      await orbixNetworkAPI.cancelRender(item.render_id, apiParams());
      success('Render cancelled successfully');
      onClose();
      if (onForceProcess) {
        // Reload pipeline after cancellation
        setTimeout(() => {
          onForceProcess();
        }, 500);
      }
    } catch (error) {
      console.error('Error cancelling render:', error);
      showErrorToast(error.response?.data?.error || 'Failed to cancel render');
    } finally {
      setLoading(false);
    }
  };

  const handleForceUploadYouTube = async () => {
    if (!item.render_id) return;
    console.log('[Modal] ========== handleForceUploadYouTube START ==========');
    console.log('[Modal] render_id=', item.render_id);
    try {
      setUploadingYouTube(true);
      setUploadSuccessModal(null);
      console.log('[Modal] Calling API: uploadRenderToYoutube');
      const startTime = Date.now();
      const response = await orbixNetworkAPI.uploadRenderToYoutube(item.render_id, apiParams());
      const duration = Date.now() - startTime;
      console.log('[Modal] uploadRenderToYoutube completed in', duration, 'ms', response.data);
      success('Upload started — you\'ll see a summary when it finishes.');
      await loadDetails();
      if (onForceProcess) onForceProcess();

      // Poll until upload completes, then show "X of 7 used, Y remaining" modal
      if (currentChannelId) {
        const startedAt = Date.now();
        const pollMs = 2000;
        const maxMs = 90000;
        uploadPollRef.current = setInterval(async () => {
          if (Date.now() - startedAt > maxMs) {
            if (uploadPollRef.current) clearInterval(uploadPollRef.current);
            uploadPollRef.current = null;
            setUploadingYouTube(false);
            return;
          }
          try {
            const res = await orbixNetworkAPI.getRender(item.render_id, apiParams());
            const status = res.data?.render?.render_status;
            if (status === 'COMPLETED') {
              if (uploadPollRef.current) clearInterval(uploadPollRef.current);
              uploadPollRef.current = null;
              setUploadingYouTube(false);
              await loadDetails();
              if (onForceProcess) onForceProcess();
              try {
                const countRes = await orbixNetworkAPI.getUploadCountLast24h({ channel_id: currentChannelId });
                const d = countRes.data;
                setUploadSuccessModal({
                  uploads_last_24h: d.uploads_last_24h ?? 0,
                  remaining: d.remaining ?? 0,
                  limit: d.limit ?? 7
                });
              } catch (e) {
                setUploadSuccessModal({ uploads_last_24h: 1, remaining: 6, limit: 7 });
              }
              return;
            }
            if (status === 'FAILED' || status === 'STEP_FAILED') {
              if (uploadPollRef.current) clearInterval(uploadPollRef.current);
              uploadPollRef.current = null;
              setUploadingYouTube(false);
              await loadDetails();
              if (onForceProcess) onForceProcess();
            }
          } catch (e) {
            // ignore poll errors
          }
        }, pollMs);
      } else {
        setUploadingYouTube(false);
      }
      console.log('[Modal] ========== handleForceUploadYouTube SUCCESS ==========');
    } catch (error) {
      console.error('[Modal] ========== handleForceUploadYouTube ERROR ==========');
      console.error('[Modal] Error:', error?.message, error?.response?.data);
      const data = error?.response?.data || {};
      const msg = data.message || data.error || 'Failed to upload to YouTube';
      showErrorToast(msg);
      setUploadingYouTube(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!item.render_id) return;
    try {
      setDownloadingVideo(true);
      const res = await orbixNetworkAPI.downloadVideo(item.render_id, apiParams());
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbix-video-${item.render_id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success('Video downloaded.');
    } catch (error) {
      console.error('Error downloading video:', error);
      showErrorToast(error?.response?.data?.error || 'Failed to download video');
    } finally {
      setDownloadingVideo(false);
    }
  };

  const getStepName = (step) => {
    const stepNames = {
      'PENDING': 'Waiting to start',
      'STEP_3_BACKGROUND': 'Step 3: Background',
      'STEP_4_VOICE': 'Step 4: Voice',
      'STEP_5_HOOK_TEXT': 'Step 5: Hook Text',
      'STEP_6_CAPTIONS': 'Step 6: Captions',
      'STEP_7_METADATA': 'Step 7: Metadata',
      'STEP_8_YOUTUBE_UPLOAD': 'Step 8: YouTube Upload',
      'COMPLETED': 'Completed',
      'FAILED': 'Failed'
    };
    return stepNames[step] || step || 'Unknown';
  };

  const getStatusIcon = (status) => {
    if (status === 'COMPLETED') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (status === 'FAILED' || status === 'STEP_FAILED') return <XCircle className="w-5 h-5 text-red-600" />;
    // READY_FOR_UPLOAD + step_error = YouTube upload failed; video viewable, can retry
    if (status === 'READY_FOR_UPLOAD' && (details?.step_error || item?.step_error)) {
      return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    }
    if (status === 'PROCESSING' || status === 'READY_FOR_UPLOAD') return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
    return <Clock className="w-5 h-5 text-gray-400" />;
  };

  if (!isOpen || !item) return null;

  const currentStep = details?.render_step || item.render_step;
  let stepProgress = details?.step_progress !== undefined ? details.step_progress : item.step_progress;
  // Don't show step number (e.g. 8) as % for Step 8: single-digit 1-9 is likely step index, not 0-100
  if (currentStep === 'STEP_8_YOUTUBE_UPLOAD' && stepProgress != null && stepProgress >= 1 && stepProgress <= 9) stepProgress = 0;
  const renderStatus = details?.render_status || item.render_status;
  const isFailed = renderStatus === 'FAILED' || renderStatus === 'STEP_FAILED';
  // Video exists and user can Force upload / Re-Render: completed, ready-for-upload, or failed at Step 8 (upload limit) or upload_failed
  const canForceUploadOrRerender = renderStatus === 'COMPLETED' || renderStatus === 'READY_FOR_UPLOAD' || renderStatus === 'UPLOAD_FAILED' || (renderStatus === 'STEP_FAILED' && currentStep === 'STEP_8_YOUTUBE_UPLOAD');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{item.story_title?.trim() || item.story_category || 'Untitled'}</h2>
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                {item.story_category}
              </span>
              {item.render_id && (
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                  Render #{item.render_id.substring(0, 8)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isRawItem && details === null && loading && (
            <div className="flex justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
          {/* Story content (question/answer, script) when item is a story — so content is visible while waiting for render */}
          {!isRawItem && item.story_id && (item.snippet || details?.orbix_scripts?.length > 0) && (
            <div className="space-y-4">
              {item.story_category === 'trickquestion' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Trick Question Content</h4>
                  {(() => {
                    try {
                      let setup = '';
                      let punchline = '';
                      let hook = '';
                      if (item.snippet) {
                        const t = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                        setup = t.setup || '';
                        punchline = t.punchline || '';
                        hook = t.hook || '';
                      }
                      if ((!setup || !punchline) && details?.orbix_scripts?.length > 0) {
                        const scripts = [...(details.orbix_scripts || [])].sort((a, b) =>
                          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
                        );
                        const script = scripts[0];
                        if (script) {
                          const cj = script.content_json
                            ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                            : {};
                          if (!setup) setup = (cj.setup || script.what_happened || '').trim();
                          if (!punchline) punchline = (cj.punchline || script.why_it_matters || '').trim();
                          if (!hook) hook = (script.cta_line || cj.hook || '').trim();
                        }
                      }
                      return (
                        <div className="space-y-3 text-sm">
                          {(!setup && !punchline) ? (
                            <p className="text-gray-500 text-sm">Tap <strong>Rewrite</strong> (in Story Script below) to generate a new question and answer.</p>
                          ) : (
                            <>
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Question</p>
                                <p className="font-medium text-gray-900">{setup || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-green-700 uppercase mb-1">Answer</p>
                                <p className="font-semibold text-green-900">{punchline || '—'}</p>
                              </div>
                              {hook && <p className="text-gray-500 text-xs">{hook}</p>}
                            </>
                          )}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse content.</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'dadjoke' && (item.snippet || (details?.orbix_scripts?.length > 0)) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Dad Joke</h4>
                  {(() => {
                    try {
                      let setup = '';
                      let punchline = '';
                      if (item.snippet) {
                        const d = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                        setup = d.setup || '';
                        punchline = d.punchline || '';
                      }
                      if ((!setup || !punchline) && details?.orbix_scripts?.length > 0) {
                        const scripts = [...(details.orbix_scripts || [])].sort((a, b) =>
                          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
                        );
                        const script = scripts[0];
                        if (script) {
                          const cj = script.content_json ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json) : {};
                          if (!setup) setup = (cj.setup || script.what_happened || '').trim();
                          if (!punchline) punchline = (cj.punchline || script.why_it_matters || '').trim();
                        }
                      }
                      return (
                        <div className="space-y-3 text-sm">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Setup</p>
                            <p className="font-medium text-gray-900">{setup || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Punchline</p>
                            <p className="font-semibold text-amber-900">{punchline || '—'}</p>
                          </div>
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse content.</p>;
                    }
                  })()}
                </div>
              )}
              {/* Trivia story: show content + Edit so you can fix wrong answers even when no script was created yet */}
              {item.story_category === 'trivia' && (item.snippet || details?.orbix_scripts?.length > 0 || editingTrivia) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Trivia Content</h4>
                  {(() => {
                    const fromScript = details?.orbix_scripts?.length > 0
                      ? (details.orbix_scripts[0].content_json
                          ? (typeof details.orbix_scripts[0].content_json === 'string' ? JSON.parse(details.orbix_scripts[0].content_json) : details.orbix_scripts[0].content_json)
                          : {})
                      : null;
                    let fromSnippet = null;
                    if (item.snippet) {
                      try {
                        fromSnippet = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      } catch (_) { /* ignore */ }
                    }
                    const cj = fromScript || fromSnippet || {};
                    const display = editingTrivia ? triviaEdit : { question: cj.question ?? '', option_a: cj.option_a ?? '', option_b: cj.option_b ?? '', option_c: cj.option_c ?? '', correct_answer: (cj.correct_answer || 'A').toUpperCase().charAt(0) };
                    const handleSaveTriviaStandalone = async () => {
                      if (!item.story_id) return;
                      setSavingTrivia(true);
                      try {
                        await orbixNetworkAPI.editTriviaContent(item.story_id, {
                          question: triviaEdit.question,
                          option_a: triviaEdit.option_a,
                          option_b: triviaEdit.option_b,
                          option_c: triviaEdit.option_c,
                          correct_answer: triviaEdit.correct_answer
                        }, apiParams());
                        success('Trivia updated');
                        setEditingTrivia(false);
                        await loadDetails();
                      } catch (err) {
                        showErrorToast(err?.response?.data?.error || err?.message || 'Failed to save trivia');
                      } finally {
                        setSavingTrivia(false);
                      }
                    };
                    if (editingTrivia) {
                      return (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Question</span>
                            <input type="text" value={triviaEdit.question} onChange={(e) => setTriviaEdit((p) => ({ ...p, question: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={500} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Option A</span>
                            <input type="text" value={triviaEdit.option_a} onChange={(e) => setTriviaEdit((p) => ({ ...p, option_a: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={200} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Option B</span>
                            <input type="text" value={triviaEdit.option_b} onChange={(e) => setTriviaEdit((p) => ({ ...p, option_b: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={200} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Option C</span>
                            <input type="text" value={triviaEdit.option_c} onChange={(e) => setTriviaEdit((p) => ({ ...p, option_c: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={200} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Correct answer</span>
                            <select value={triviaEdit.correct_answer} onChange={(e) => setTriviaEdit((p) => ({ ...p, correct_answer: e.target.value }))} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                              <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                            </select>
                          </label>
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={handleSaveTriviaStandalone} disabled={savingTrivia} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">{savingTrivia ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setEditingTrivia(false)} className="px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-100">Cancel</button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2 text-sm">
                        {display.question && <p className="font-medium text-gray-900">{display.question}</p>}
                        <ul className="space-y-1 text-gray-700">
                          {display.option_a && <li>A) {display.option_a}</li>}
                          {display.option_b && <li>B) {display.option_b}</li>}
                          {display.option_c && <li>C) {display.option_c}</li>}
                        </ul>
                        <p className="text-green-700 font-medium pt-1">Correct: {display.correct_answer}</p>
                        <button type="button" onClick={() => { setTriviaEdit({ question: (cj.question ?? '').toString(), option_a: (cj.option_a ?? '').toString(), option_b: (cj.option_b ?? '').toString(), option_c: (cj.option_c ?? '').toString(), correct_answer: ((cj.correct_answer || 'A').toUpperCase().charAt(0)) }); setEditingTrivia(true); }} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Edit trivia</button>
                      </div>
                    );
                  })()}
                </div>
              )}
              {/* Riddle story: show content + Edit so you can fix wrong riddle/answer (same pattern as trivia) */}
              {item.story_category === 'riddle' && (item.snippet || details?.orbix_scripts?.length > 0 || editingRiddle) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Riddle Content</h4>
                  {(() => {
                    const fromScript = details?.orbix_scripts?.length > 0
                      ? (details.orbix_scripts[0].content_json
                          ? (typeof details.orbix_scripts[0].content_json === 'string' ? JSON.parse(details.orbix_scripts[0].content_json) : details.orbix_scripts[0].content_json)
                          : {})
                      : null;
                    let fromSnippet = null;
                    if (item.snippet) {
                      try {
                        fromSnippet = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      } catch (_) { /* ignore */ }
                    }
                    const cj = fromScript || fromSnippet || {};
                    const display = editingRiddle ? riddleEdit : { riddle_text: cj.riddle_text ?? '', answer_text: cj.answer_text ?? '', hook: cj.hook ?? '', category: cj.category ?? '' };
                    const handleSaveRiddleStandalone = async () => {
                      if (!item.story_id) return;
                      setSavingRiddle(true);
                      try {
                        await orbixNetworkAPI.editRiddleContent(item.story_id, {
                          riddle_text: riddleEdit.riddle_text,
                          answer_text: riddleEdit.answer_text,
                          hook: riddleEdit.hook,
                          category: riddleEdit.category
                        }, apiParams());
                        success('Riddle updated');
                        setEditingRiddle(false);
                        await loadDetails();
                      } catch (err) {
                        showErrorToast(err?.response?.data?.error || err?.message || 'Failed to save riddle');
                      } finally {
                        setSavingRiddle(false);
                      }
                    };
                    if (editingRiddle) {
                      return (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Riddle</span>
                            <textarea value={riddleEdit.riddle_text} onChange={(e) => setRiddleEdit((p) => ({ ...p, riddle_text: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm min-h-[80px]" maxLength={1000} rows={3} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Answer</span>
                            <input type="text" value={riddleEdit.answer_text} onChange={(e) => setRiddleEdit((p) => ({ ...p, answer_text: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={500} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Hook (optional)</span>
                            <input type="text" value={riddleEdit.hook} onChange={(e) => setRiddleEdit((p) => ({ ...p, hook: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={200} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-600 block mb-1">Category (optional)</span>
                            <input type="text" value={riddleEdit.category} onChange={(e) => setRiddleEdit((p) => ({ ...p, category: e.target.value }))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" maxLength={50} />
                          </label>
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={handleSaveRiddleStandalone} disabled={savingRiddle} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">{savingRiddle ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setEditingRiddle(false)} className="px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-100">Cancel</button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2 text-sm">
                        {display.hook && <p className="text-gray-600 italic">&quot;{display.hook}&quot;</p>}
                        {display.riddle_text && <p className="font-medium text-gray-900">{display.riddle_text}</p>}
                        {display.answer_text && <p className="text-green-700 font-semibold">Answer: {display.answer_text}</p>}
                        {display.category && <p className="text-gray-400 text-xs">Category: {display.category}</p>}
                        <button type="button" onClick={() => { setRiddleEdit({ riddle_text: (cj.riddle_text ?? '').toString(), answer_text: (cj.answer_text ?? '').toString(), hook: (cj.hook ?? '').toString(), category: (cj.category ?? '').toString() }); setEditingRiddle(true); }} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Edit riddle</button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          {/* Raw Item Info */}
          {isRawItem && (
            <div className="space-y-4">
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-semibold">Raw Item - Ready to Process</h3>
                  <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded font-semibold">
                    Score: {item.story_shock_score || 'N/A'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  This item has a shock score of {item.story_shock_score} and is ready to be processed into a story.
                  Click &quot;Force Process into Story&quot; to create a story from this raw item.
                </p>
              </div>
              {item.story_category === 'facts' && item.snippet && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Scraped fact (story for video)</h4>
                  {(() => {
                    try {
                      const f = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      return (
                        <div className="space-y-2 text-sm">
                          {f.title && <p className="font-medium text-gray-900">{f.title}</p>}
                          {f.fact_text && <p className="text-gray-800">{f.fact_text}</p>}
                          {f.tts_script && f.tts_script !== f.fact_text && (
                            <p className="text-gray-600 italic border-t border-gray-200 pt-2 mt-2">TTS: {f.tts_script}</p>
                          )}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse facts content</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'trivia' && item.snippet && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Trivia Content</h4>
                  {(() => {
                    try {
                      const t = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      return (
                        <div className="space-y-2 text-sm">
                          {t.hook && <p className="text-gray-600 italic">&quot;{t.hook}&quot;</p>}
                          <p className="font-medium text-gray-900">{t.question}</p>
                          <ul className="space-y-1 text-gray-700">
                            {t.option_a && <li>A) {t.option_a}</li>}
                            {t.option_b && <li>B) {t.option_b}</li>}
                            {t.option_c && <li>C) {t.option_c}</li>}
                          </ul>
                          <p className="text-green-700 font-medium pt-2">Correct: {t.correct_answer}) {t[`option_${(t.correct_answer || 'A').toLowerCase()}`]}</p>
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse trivia content</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'riddle' && item.snippet && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Riddle Content</h4>
                  {(() => {
                    try {
                      const r = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      return (
                        <div className="space-y-3 text-sm">
                          {r.hook && <p className="text-gray-600 italic">&quot;{r.hook}&quot;</p>}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Riddle</p>
                            <p className="font-medium text-gray-900">{r.riddle_text}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Answer</p>
                            <p className="text-green-700 font-semibold">{r.answer_text}</p>
                          </div>
                          {r.category && <p className="text-gray-400 text-xs">Category: {r.category}</p>}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse riddle content</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'mindteaser' && item.snippet && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Mind Teaser Content</h4>
                  {(() => {
                    try {
                      const m = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      return (
                        <div className="space-y-3 text-sm">
                          {m.hook && <p className="text-gray-600 italic">&quot;{m.hook}&quot;</p>}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Question</p>
                            <p className="font-medium text-gray-900">{m.question}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Answer</p>
                            <p className="text-green-700 font-semibold">{m.answer}</p>
                          </div>
                          {(m.type || m.family) && <p className="text-gray-400 text-xs">Type: {m.type}{m.family ? ` · ${m.family}` : ''}</p>}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse mind teaser content</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'dadjoke' && item.snippet && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Dad Joke Content</h4>
                  {(() => {
                    try {
                      const d = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                      return (
                        <div className="space-y-3 text-sm">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Setup</p>
                            <p className="font-medium text-gray-900">{d.setup}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Punchline</p>
                            <p className="text-amber-700 font-semibold">{d.punchline}</p>
                          </div>
                          {d.hook && <p className="text-gray-500 text-xs">{d.hook}</p>}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse dad joke content</p>;
                    }
                  })()}
                </div>
              )}
              {item.story_category === 'trickquestion' && (item.snippet || (details?.orbix_scripts?.length > 0) || (item.story_id && !isRawItem)) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-gray-800">Trick Question Content</h4>
                    {item.story_id && !isRawItem && (
                      <button
                        type="button"
                        onClick={handleGenerateScript}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generate new question + answer in the new format and update script"
                      >
                        {loading ? (
                          <Loader className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            Rewrite
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {(() => {
                    try {
                      let setup = '';
                      let punchline = '';
                      let hook = '';
                      if (item.snippet) {
                        const t = typeof item.snippet === 'string' ? JSON.parse(item.snippet) : item.snippet;
                        setup = t.setup || '';
                        punchline = t.punchline || '';
                        hook = t.hook || '';
                      }
                      if ((!setup || !punchline) && details?.orbix_scripts?.length > 0) {
                        const scripts = [...(details.orbix_scripts || [])].sort((a, b) =>
                          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
                        );
                        const script = scripts[0];
                        if (script) {
                          const cj = script.content_json
                            ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                            : {};
                          if (!setup) setup = (cj.setup || script.what_happened || '').trim();
                          if (!punchline) punchline = (cj.punchline || script.why_it_matters || '').trim();
                          if (!hook) hook = (script.cta_line || cj.hook || '').trim();
                        }
                      }
                      return (
                        <div className="space-y-3 text-sm">
                          {(!setup && !punchline) ? (
                            <p className="text-gray-500 text-sm">Tap <strong>Rewrite</strong> above to generate a new question and answer in the new format.</p>
                          ) : (
                            <>
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Question</p>
                                <p className="font-medium text-gray-900">{setup || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-green-700 uppercase mb-1">Answer</p>
                                <p className="font-semibold text-green-900">{punchline || '—'}</p>
                              </div>
                              {hook && <p className="text-gray-500 text-xs">{hook}</p>}
                            </>
                          )}
                        </div>
                      );
                    } catch {
                      return <p className="text-gray-500 text-sm">Could not parse trick question content</p>;
                    }
                  })()}
                </div>
              )}
            </div>
          )}
          
          {/* Step 2: Story Creation Info (PENDING stories without renders) */}
          {!item.render_id && item.story_status === 'PENDING' && (details != null || !item.story_id) && (
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold">Story Creation - Waiting for Script Generation</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                This story is in the creation phase. It needs a script to be generated before it can proceed to rendering.
              </p>
              {details?.orbix_scripts && details.orbix_scripts.length > 0 ? (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-800 mb-3">
                    ✓ Script has been generated (ID: {details.orbix_scripts[0].id?.substring(0, 8)}...)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleStartRender}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {loading ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Start Render
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleGenerateScript}
                      disabled={loading}
                      className="px-4 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      title="Regenerate the script with new copy"
                    >
                      {loading ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Rewriting...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Rewrite
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-800 mb-2">
                    ⚠ Script has NOT been generated yet. This may be why the story is stuck.
                  </p>
                  <button
                    onClick={handleGenerateScript}
                    disabled={loading}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-3 h-3 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Force Generate Script
                      </>
                    )}
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button
                  onClick={handleForceRenderPipeline}
                  disabled={loading}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  title="Start the render pipeline for this story"
                >
                  {loading ? (
                    <>
                      <Loader className="w-3 h-3 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      Force Render Pipeline
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-yellow-200">
                <p className="text-xs text-gray-500">
                  Status: {item.story_status} | Story ID: {item.story_id?.substring(0, 8)}...
                </p>
              </div>
            </div>
          )}
          
          {/* Current Step Info */}
          {item.render_id && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Current Step</h3>
                  {getStatusIcon(renderStatus)}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Progress</p>
                  <p className="text-2xl font-bold">{stepProgress || 0}%</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium">{getStepName(currentStep)}</p>
                
                {/* Progress Bar */}
                {(renderStatus === 'PENDING' || renderStatus === 'PROCESSING' || renderStatus === 'READY_FOR_UPLOAD') && (
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${stepProgress || 0}%` }}
                    />
                  </div>
                )}
                
                {/* Error Message */}
                {isFailed && (details?.step_error || item.step_error) && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800">Error</p>
                        <p className="text-sm text-red-700">{details?.step_error || item.step_error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step Logs */}
          {logs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Step Logs</h3>
              <div className="bg-gray-900 text-green-400 font-mono text-sm rounded-lg p-4 max-h-96 overflow-y-auto">
                {logs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {' '}
                    <span className={`
                      ${log.event === 'ERROR' ? 'text-red-400' : ''}
                      ${log.event === 'COMPLETE' ? 'text-green-400' : ''}
                      ${log.event === 'PROGRESS' ? 'text-blue-400' : ''}
                    `}>
                      [{log.event}] {log.message}
                    </span>
                    {log.data && (
                      <div className="text-gray-400 text-xs ml-4 mt-1">
                        {JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Story Script Content */}
          {details?.orbix_scripts && details.orbix_scripts.length > 0 && item.story_id && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-lg font-semibold">{(item.story_category || '').toLowerCase() === 'dadjoke' ? 'Joke' : (item.story_category || '').toLowerCase() === 'trickquestion' ? 'Trick Question' : 'Story Script'}</h3>
                {!isRawItem && (
                  <button
                    onClick={handleGenerateScript}
                    disabled={loading}
                    className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    title="Regenerate the script"
                  >
                    {loading ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Rewrite
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                {(() => {
                  const cat = (item.story_category || '').toLowerCase();
                  const isPsychology = cat === 'psychology';
                  const isConceptFirst = isPsychology;
                  const isShortsNative = isConceptFirst || cat === 'facts';
                  const labelTwist = isShortsNative ? 'Twist' : 'What Happened';
                  const labelPayoff = isShortsNative ? 'Payoff' : 'Why It Matters';
                  const labelLoop = isShortsNative ? 'Loop' : 'What Happens Next';
                  // Use latest script (newest first) so we match what the render pipeline uses
                  const scripts = Array.isArray(details.orbix_scripts) ? [...details.orbix_scripts] : [];
                  const byNewest = scripts.sort((a, b) => {
                    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return tb - ta;
                  });
                  const script = byNewest[0];
                  if (!script) return null;
                  if (cat === 'riddle') {
                    // Riddle: show riddle text + answer from content_json
                    const cj = script.content_json
                      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                      : {};
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        {(script.hook || cj.hook) && (
                          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-600 mb-1">1 · Hook <span className="font-normal">(spoken)</span></p>
                            <p className="text-base text-blue-900 font-medium">{script.hook || cj.hook}</p>
                          </div>
                        )}
                        {cj.riddle_text && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">2 · Riddle <span className="font-normal">(on screen + spoken)</span></p>
                            <p className="text-base text-gray-900 font-medium">{cj.riddle_text}</p>
                          </div>
                        )}
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-center">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">3 · 3-2-1 Countdown</p>
                        </div>
                        {cj.answer_text && (
                          <div className="rounded-md bg-green-50 border border-green-300 p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">4 · Answer Flash <span className="font-normal">(0.5s on screen)</span></p>
                            <p className="text-base text-green-900 font-bold">{cj.answer_text}</p>
                          </div>
                        )}
                        {cj.category && <p className="text-gray-400 text-xs">Category: {cj.category}</p>}
                      </div>
                    );
                  }
                  if (cat === 'trivia') {
                    const cj = script.content_json
                      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                      : {};
                    const display = editingTrivia ? triviaEdit : {
                      question: cj.question ?? '',
                      option_a: cj.option_a ?? '',
                      option_b: cj.option_b ?? '',
                      option_c: cj.option_c ?? '',
                      correct_answer: (cj.correct_answer || 'A').toUpperCase().charAt(0)
                    };
                    const handleSaveTrivia = async () => {
                      if (!item.story_id) return;
                      setSavingTrivia(true);
                      try {
                        await orbixNetworkAPI.editTriviaContent(item.story_id, {
                          question: triviaEdit.question,
                          option_a: triviaEdit.option_a,
                          option_b: triviaEdit.option_b,
                          option_c: triviaEdit.option_c,
                          correct_answer: triviaEdit.correct_answer
                        }, apiParams());
                        success('Trivia updated');
                        setEditingTrivia(false);
                        await loadDetails();
                      } catch (err) {
                        showErrorToast(err?.response?.data?.error || err?.message || 'Failed to save trivia');
                      } finally {
                        setSavingTrivia(false);
                      }
                    };
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        {(script.hook || cj.hook) && !editingTrivia && (
                          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-600 mb-1">1 · Hook <span className="font-normal">(optional)</span></p>
                            <p className="text-base text-blue-900 font-medium">{script.hook || cj.hook}</p>
                          </div>
                        )}
                        {!editingTrivia ? (
                          <>
                            {display.question && (
                              <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                                <p className="text-xs font-semibold text-gray-500 mb-1">2 · Question <span className="font-normal">(on screen + TTS)</span></p>
                                <p className="text-base text-gray-900 font-medium">{display.question}</p>
                              </div>
                            )}
                            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-center">
                              <p className="text-xs font-semibold text-yellow-700 mb-1">3 · 3-2-1 Countdown</p>
                            </div>
                            <div className="rounded-md bg-gray-100 border border-gray-200 p-3 space-y-1">
                              <p className="text-xs font-semibold text-gray-500 mb-1">4 · Options</p>
                              {display.option_a && <p className="text-sm text-gray-800">A) {display.option_a}</p>}
                              {display.option_b && <p className="text-sm text-gray-800">B) {display.option_b}</p>}
                              {display.option_c && <p className="text-sm text-gray-800">C) {display.option_c}</p>}
                              <p className="text-green-700 font-medium pt-1">Correct: {display.correct_answer}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTriviaEdit({
                                  question: (cj.question ?? '').toString(),
                                  option_a: (cj.option_a ?? '').toString(),
                                  option_b: (cj.option_b ?? '').toString(),
                                  option_c: (cj.option_c ?? '').toString(),
                                  correct_answer: ((cj.correct_answer || 'A').toUpperCase().charAt(0))
                                });
                                setEditingTrivia(true);
                              }}
                              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Edit trivia
                            </button>
                          </>
                        ) : (
                          <div className="space-y-3 rounded-md bg-gray-50 border border-gray-200 p-3">
                            <label className="block">
                              <span className="text-xs font-semibold text-gray-600 block mb-1">Question</span>
                              <input
                                type="text"
                                value={triviaEdit.question}
                                onChange={(e) => setTriviaEdit((prev) => ({ ...prev, question: e.target.value }))}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                                maxLength={500}
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold text-gray-600 block mb-1">Option A</span>
                              <input
                                type="text"
                                value={triviaEdit.option_a}
                                onChange={(e) => setTriviaEdit((prev) => ({ ...prev, option_a: e.target.value }))}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                                maxLength={200}
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold text-gray-600 block mb-1">Option B</span>
                              <input
                                type="text"
                                value={triviaEdit.option_b}
                                onChange={(e) => setTriviaEdit((prev) => ({ ...prev, option_b: e.target.value }))}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                                maxLength={200}
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold text-gray-600 block mb-1">Option C</span>
                              <input
                                type="text"
                                value={triviaEdit.option_c}
                                onChange={(e) => setTriviaEdit((prev) => ({ ...prev, option_c: e.target.value }))}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                                maxLength={200}
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold text-gray-600 block mb-1">Correct answer</span>
                              <select
                                value={triviaEdit.correct_answer}
                                onChange={(e) => setTriviaEdit((prev) => ({ ...prev, correct_answer: e.target.value }))}
                                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                              >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                            </label>
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSaveTrivia}
                                disabled={savingTrivia}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {savingTrivia ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTrivia(false)}
                                className="px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (cat === 'mindteaser') {
                    const cj = script.content_json
                      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                      : {};
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        {(script.hook || cj.hook) && (
                          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-600 mb-1">1 · Hook <span className="font-normal">(optional)</span></p>
                            <p className="text-base text-blue-900 font-medium">{script.hook || cj.hook}</p>
                          </div>
                        )}
                        {cj.question && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">2 · Question <span className="font-normal">(on screen + TTS)</span></p>
                            <p className="text-base text-gray-900 font-medium">{cj.question}</p>
                          </div>
                        )}
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-center">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">3 · 1s pause · 3-2-1 Countdown</p>
                        </div>
                        {cj.answer && (
                          <div className="rounded-md bg-green-50 border border-green-300 p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">4 · Answer Flash <span className="font-normal">(0.5s + TTS)</span></p>
                            <p className="text-base text-green-900 font-bold">{cj.answer}</p>
                          </div>
                        )}
                        {(cj.type || cj.family) && <p className="text-gray-400 text-xs">Type: {cj.type}{cj.family ? ` · ${cj.family}` : ''}</p>}
                      </div>
                    );
                  }
                  if (cat === 'dadjoke') {
                    const cj = script.content_json
                      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                      : {};
                    const setup = cj.setup || script.hook || script.what_happened || '';
                    const punchline = cj.punchline || script.why_it_matters || '';
                    const endCta = script.cta_line || cj.hook || '';
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        {setup && (
                          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-600 mb-1">1 · Setup <span className="font-normal">(on screen + TTS)</span></p>
                            <p className="text-base text-blue-900 font-medium">{setup}</p>
                          </div>
                        )}
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-center">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">2 · 3-2-1 Countdown</p>
                        </div>
                        {punchline && (
                          <div className="rounded-md bg-green-50 border border-green-300 p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">3 · Punchline <span className="font-normal">(on screen)</span></p>
                            <p className="text-base text-green-900 font-bold">{punchline}</p>
                          </div>
                        )}
                        {endCta && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">4 · End card</p>
                            <p className="text-base text-gray-900">{endCta}</p>
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (cat === 'trickquestion') {
                    let cj = {};
                    try {
                      cj = script.content_json
                        ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
                        : {};
                    } catch (_) { /* ignore */ }
                    const setup = (cj.setup || script.what_happened || '').trim();
                    const answer = (cj.punchline || script.why_it_matters || '').trim();
                    const endCta = (script.cta_line || cj.hook || '').trim();
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                          <p className="text-xs font-semibold text-blue-600 mb-1">1 · Question <span className="font-normal">(on screen + TTS)</span></p>
                          <p className="text-base text-blue-900 font-medium">{setup || '—'}</p>
                        </div>
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-center">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">2 · 3-2-1 Countdown</p>
                        </div>
                        <div className="rounded-md bg-green-50 border border-green-300 p-3">
                          <p className="text-xs font-semibold text-green-700 mb-1">3 · Answer <span className="font-normal">(on screen)</span></p>
                          <p className="text-base text-green-900 font-bold">{answer || '—'}</p>
                        </div>
                        {endCta ? (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">4 · End card</p>
                            <p className="text-base text-gray-900">{endCta}</p>
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  if (isConceptFirst) {
                    // Psychology: show fields in exact video playback order
                    const question = (script.what_happens_next || '').trim();
                    const bodyLines = (script.what_happened || '').split('\n').map(l => l.trim()).filter(Boolean);
                    const conceptName = bodyLines[0] || '';
                    const likeWhen = bodyLines[1] || '';
                    const payoff = (script.why_it_matters || '').trim();
                    const label2 = 'Concept Name';
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Video plays in this order ↓</p>
                        {question && (
                          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-600 mb-1">1 · Opening Question <span className="font-normal">(spoken + on screen)</span></p>
                            <p className="text-base text-blue-900 font-medium">{question}</p>
                          </div>
                        )}
                        {conceptName && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">2 · {label2} <span className="font-normal">(spoken)</span></p>
                            <p className="text-base text-gray-900">{conceptName}</p>
                          </div>
                        )}
                        {likeWhen && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">3 · Relatable Example <span className="font-normal">(spoken)</span></p>
                            <p className="text-base text-gray-900">{likeWhen}</p>
                          </div>
                        )}
                        {payoff && (
                          <div className="rounded-md bg-gray-100 border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">4 · Payoff <span className="font-normal">(spoken)</span></p>
                            <p className="text-base text-gray-900">{payoff}</p>
                          </div>
                        )}
                        {question && (
                          <div className="rounded-md bg-blue-50 border border-blue-100 p-2 text-center">
                            <p className="text-xs text-blue-500">↩ Loops back to opening question</p>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <>
                      {script.hook && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">Hook</p>
                          <p className="text-base text-gray-900">{script.hook}</p>
                        </div>
                      )}
                      {script.what_happened && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">{labelTwist}</p>
                          <p className="text-base text-gray-900">{script.what_happened}</p>
                        </div>
                      )}
                      {script.why_it_matters && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">{labelPayoff}</p>
                          <p className="text-base text-gray-900">{script.why_it_matters}</p>
                        </div>
                      )}
                      {script.what_happens_next && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">{labelLoop}</p>
                          <p className="text-base text-gray-900">{script.what_happens_next}</p>
                        </div>
                      )}
                      {script.cta_line && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">Call to Action</p>
                          <p className="text-base text-gray-900">{script.cta_line}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Story Info */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Story Information</h3>
            <div className="grid grid-cols-2 gap-4">
              {(() => {
                const cat = (item.story_category || '').toLowerCase();
                const isEvergreen = ['dadjoke', 'trivia', 'facts', 'riddle', 'mindteaser', 'psychology'].includes(cat);
                return (
                  <>
                    <div>
                      <p className="text-sm text-gray-600">{isEvergreen ? 'Score' : 'Shock Score'}</p>
                      <p className="text-xl font-bold">{isEvergreen && cat === 'dadjoke' ? '—' : `${item.story_shock_score ?? 0}/100`}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <p className="text-lg font-medium">{item.story_status}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Category</p>
                      <p className="text-lg font-medium">{item.story_category}</p>
                    </div>
                    {item.render_id && (
                      <div>
                        <p className="text-sm text-gray-600">Render Status</p>
                        <p className="text-lg font-medium">{renderStatus}</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Output Video - COMPLETED or READY_FOR_UPLOAD (video in storage; YouTube upload may have failed) */}
          {(renderStatus === 'COMPLETED' || renderStatus === 'READY_FOR_UPLOAD') && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Output Video</h3>
              {(details?.output_url || item?.output_url) ? (
                <a
                  href={`${details?.output_url || item?.output_url}${(details?.output_url || item?.output_url).includes('?') ? '&' : '?'}v=${encodeURIComponent(details?.updated_at || item?.updated_at || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  View Video →
                </a>
              ) : (
                <p className="text-sm text-gray-600">View link not saved for this render. Use <strong>View Render</strong> below to open if available, or <strong>Restart Render</strong> to generate a new video with a link.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
          
          <div className="flex gap-2">
            {/* Render Actions - only show if render exists */}
            {item.render_id && (
              <>
                {/* View Render - when video exists (completed, ready-for-upload, or failed at step 8 / upload_failed) */}
                {canForceUploadOrRerender && (
                  (details?.output_url || item?.output_url) ? (
                    <a
                      href={`${details?.output_url || item?.output_url}${(details?.output_url || item?.output_url).includes('?') ? '&' : '?'}v=${encodeURIComponent(details?.updated_at || item?.updated_at || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      View Render
                    </a>
                  ) : renderStatus === 'COMPLETED' && canForceUploadOrRerender ? (
                    <button
                      onClick={handleRestart}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                      {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      View Render (restart to generate link)
                    </button>
                  ) : null
                )}
                
                {/* Re-Render - when video exists (completed, ready-for-upload, failed at step 8, or upload_failed) */}
                {canForceUploadOrRerender && (
                  <button
                    onClick={handleRestart}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Re-rendering...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Re-Render
                      </>
                    )}
                  </button>
                )}
                {/* Download video to computer - when video has rendered (same visibility as Re-Render / Force YouTube) */}
                {canForceUploadOrRerender && (
                  <button
                    onClick={handleDownloadVideo}
                    disabled={downloadingVideo || loading}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
                  >
                    {downloadingVideo ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download
                      </>
                    )}
                  </button>
                )}
                {/* Force upload to YouTube - when video exists (retry after upload limit / quota or any step 8 failure) */}
                {canForceUploadOrRerender && (
                  <button
                    onClick={handleForceUploadYouTube}
                    disabled={uploadingYouTube || loading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                  >
                    {uploadingYouTube ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Youtube className="w-4 h-4" />
                        Force upload to YouTube
                      </>
                    )}
                  </button>
                )}
                
                {/* Restart Render - show if failed or processing */}
                {(renderStatus === 'FAILED' || renderStatus === 'PROCESSING') && (
                  <button
                    onClick={handleRestart}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Restarting...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Restart Render
                      </>
                    )}
                  </button>
                )}
                
                {/* Cancel Render - show if PENDING or PROCESSING (not READY_FOR_UPLOAD: video is done, use View/Force upload) */}
                {(renderStatus === 'PENDING' || renderStatus === 'PROCESSING') && (
                  <button
                    onClick={handleCancelRender}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        Cancel Render
                      </>
                    )}
                  </button>
                )}
              </>
            )}
            
            {/* Raw Item Action */}
            {isRawItem && (
              <button
                onClick={handleForceProcess}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Force Process into Story
                  </>
                )}
              </button>
            )}

            {/* Story Creation: Force Render Pipeline (no render yet) */}
            {!isRawItem && item.story_id && !item.render_id && (
              <button
                onClick={handleForceRenderPipeline}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                title="Start the render pipeline for this story"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Force Render Pipeline
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Post-upload: how many uploads left in the last 24h for this channel */}
      {uploadSuccessModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 rounded-lg" onClick={() => setUploadSuccessModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-green-700 mb-3">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-semibold">Upload complete</h3>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              This channel has used <strong>{uploadSuccessModal.uploads_last_24h} of {uploadSuccessModal.limit}</strong> uploads in the last 24 hours (YouTube&apos;s rolling limit).
            </p>
            <p className="text-sm font-medium text-gray-800 mb-4">
              <strong>{uploadSuccessModal.remaining} upload{uploadSuccessModal.remaining !== 1 ? 's' : ''}</strong> remaining for this channel in the next 24 hours.
            </p>
            <button
              type="button"
              onClick={() => setUploadSuccessModal(null)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

