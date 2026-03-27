/**
 * Kid Quiz Studio — API Routes
 * All routes authenticated. Completely separate from orbix-network.
 * Mounted at /api/v2/kidquiz
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { defaultOrbixYoutubeCallbackUrl } from '../../config/public-urls.js';
import { google } from 'googleapis';
import OpenAI from 'openai';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();
const MODULE_KEY = 'kidquiz';

router.use(authenticate);
router.use(requireBusinessContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isYouTubeConfigured() {
  const id = process.env.KIDQUIZ_YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.KIDQUIZ_YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;
  return !!(id && secret && (process.env.YOUTUBE_REDIRECT_URI || process.env.YOUTUBE_CLIENT_ID));
}

async function getProjectOrFail(res, projectId, businessId) {
  const { data, error } = await supabaseClient
    .from('kidquiz_projects')
    .select('*')
    .eq('id', projectId)
    .eq('business_id', businessId)
    .single();
  if (error || !data) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return data;
}

async function getProjectFull(projectId) {
  const { data: project } = await supabaseClient
    .from('kidquiz_projects')
    .select('*')
    .eq('id', projectId)
    .single();
  if (!project) return null;

  const { data: questions } = await supabaseClient
    .from('kidquiz_questions')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index');

  const questionIds = (questions || []).map(q => q.id);
  let answers = [];
  if (questionIds.length > 0) {
    const { data } = await supabaseClient
      .from('kidquiz_answer_options')
      .select('*')
      .in('question_id', questionIds);
    answers = data || [];
  }

  const questionsWithAnswers = (questions || []).map(q => ({
    ...q,
    answers: answers.filter(a => a.question_id === q.id).sort((a, b) => a.label.localeCompare(b.label))
  }));

  return { ...project, questions: questionsWithAnswers };
}

// ─── Settings ────────────────────────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data } = await supabaseClient
      .from('kidquiz_settings')
      .select('*')
      .eq('business_id', businessId)
      .single();
    res.json({ settings: data || { timer_seconds: 6, enable_auto_correct: true, enable_auto_metadata: true } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { timer_seconds, enable_auto_correct, enable_auto_metadata } = req.body;

    const existing = await supabaseClient
      .from('kidquiz_settings')
      .select('id')
      .eq('business_id', businessId)
      .single();

    const payload = {
      business_id: businessId,
      timer_seconds: timer_seconds ?? 6,
      enable_auto_correct: enable_auto_correct ?? true,
      enable_auto_metadata: enable_auto_metadata ?? true,
      updated_at: new Date().toISOString()
    };

    if (existing.data) {
      await supabaseClient.from('kidquiz_settings').update(payload).eq('id', existing.data.id);
    } else {
      await supabaseClient.from('kidquiz_settings').insert(payload);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── YouTube OAuth ────────────────────────────────────────────────────────────

function clientIdPreview(id) {
  if (!id || typeof id !== 'string') return null;
  const t = id.trim();
  if (t.length <= 12) return t ? '***' : null;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

router.get('/youtube/auth-url', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const usageManual = (req.query.usage || '').toLowerCase() === 'manual';
    const raw = process.env.YOUTUBE_REDIRECT_URI || defaultOrbixYoutubeCallbackUrl();
    const baseUrl = raw.replace(/\/api\/v2\/.+$/, '');
    const redirectUri = `${baseUrl}/api/v2/kidquiz/youtube/callback`;

    if (usageManual) {
      const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const ytManual = moduleSettings?.settings?.youtube_manual || {};
      const clientId = (ytManual.manual_client_id || '').trim();
      const clientSecret = (ytManual.manual_client_secret || '').trim();
      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'Manual OAuth not set. Enter Client ID and Secret in the Manual-upload OAuth section and click Save, then try Connect again.',
          configured: false
        });
      }
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
        state: `${businessId}:kidquiz:manual`,
        prompt: 'consent'
      });
      return res.json({ url, redirect_uri: redirectUri });
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const yt = moduleSettings?.settings?.youtube || {};
    const customId = (yt.client_id || '').trim();
    const customSecret = (yt.client_secret || '').trim();
    const useCustom = customId && customSecret;

    const clientId = useCustom ? customId : (process.env.KIDQUIZ_YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID);
    const clientSecret = useCustom ? customSecret : (process.env.KIDQUIZ_YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'YouTube OAuth not configured. Add Client ID and Secret in the Upload OAuth app section above and click Save, or set YOUTUBE_CLIENT_ID/SECRET on the server.',
        configured: false
      });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
      state: `${businessId}:kidquiz`,
      prompt: 'consent'
    });
    res.json({ url, redirect_uri: redirectUri });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings || {};
    const yt = settings.youtube || {};
    const ytManual = settings.youtube_manual || {};

    const connected = !!(yt.access_token);
    const connected_manual = !!(ytManual.manual_access_token);
    const custom_oauth = !!(yt.client_id);
    const manual_custom_oauth = !!(ytManual.manual_client_id);
    const channel_manual = connected_manual && ytManual.manual_channel_id
      ? { id: ytManual.manual_channel_id, title: ytManual.manual_channel_title || '' }
      : null;
    const credentials_source = custom_oauth ? 'custom_oauth' : 'global';

    res.json({
      connected,
      channel_title: yt.channel_title || null,
      channel_id: yt.channel_id || null,
      custom_oauth,
      credentials_source,
      client_id_preview: clientIdPreview(yt.client_id),
      connected_manual,
      channel_manual,
      manual_custom_oauth,
      manual_client_id_preview: clientIdPreview(ytManual.manual_client_id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /youtube/custom-oauth — save OAuth client id/secret. Body: { client_id, client_secret, usage: 'auto'|'manual' }. Same as Orbix: auto = main uploads, manual = manual slot. */
router.post('/youtube/custom-oauth', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const usage = (req.body?.usage || 'auto').toLowerCase();
    const isManual = usage === 'manual';
    const clientId = (req.body?.client_id ?? '').trim();
    const clientSecret = (req.body?.client_secret ?? '').trim();

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings ? { ...moduleSettings.settings } : {};

    if (isManual) {
      settings.youtube_manual = settings.youtube_manual || {};
      const existing = settings.youtube_manual;
      if (!clientId) {
        delete existing.manual_client_id;
        delete existing.manual_client_secret;
        existing.manual_access_token = '';
        existing.manual_refresh_token = '';
        existing.manual_channel_id = '';
        existing.manual_channel_title = '';
        existing.manual_token_expiry = null;
      } else {
        existing.manual_client_id = clientId;
        if (clientSecret) existing.manual_client_secret = clientSecret;
      }
      settings.youtube_manual = { ...existing };
      await ModuleSettings.update(businessId, MODULE_KEY, settings);
      return res.json({
        success: true,
        manual_custom_oauth: !!clientId,
        message: clientId ? 'Manual OAuth app saved. Use "Connect YouTube (manual)" to authorize.' : 'Manual OAuth cleared.'
      });
    }

    settings.youtube = settings.youtube || {};
    const existing = settings.youtube;
    if (!clientId) {
      delete existing.client_id;
      delete existing.client_secret;
      existing.access_token = '';
      existing.refresh_token = '';
      existing.channel_id = '';
      existing.channel_title = '';
      existing.token_expiry = null;
    } else {
      existing.client_id = clientId;
      if (clientSecret) existing.client_secret = clientSecret;
    }
    settings.youtube = { ...existing };
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    res.json({
      success: true,
      custom_oauth: !!clientId,
      message: clientId ? 'Upload OAuth app saved. Use "Connect YouTube account" to authorize.' : 'Upload OAuth cleared; server env will be used if set.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/disconnect', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const usage = (req.body?.usage || req.query?.usage || '').toLowerCase() === 'manual' ? 'manual' : 'auto';

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    if (!moduleSettings) return res.json({ success: true });

    const settings = moduleSettings.settings ? { ...moduleSettings.settings } : {};
    if (usage === 'manual') {
      settings.youtube_manual = settings.youtube_manual || {};
      const ex = settings.youtube_manual;
      settings.youtube_manual = {
        ...(ex.manual_client_id && { manual_client_id: ex.manual_client_id }),
        ...(ex.manual_client_secret && { manual_client_secret: ex.manual_client_secret }),
        manual_access_token: '',
        manual_refresh_token: '',
        manual_channel_id: '',
        manual_channel_title: '',
        manual_token_expiry: null
      };
    } else {
      const ex = settings.youtube || {};
      settings.youtube = {
        ...(ex.client_id && { client_id: ex.client_id }),
        ...(ex.client_secret && { client_secret: ex.client_secret }),
        access_token: '',
        refresh_token: '',
        channel_id: '',
        channel_title: '',
        token_expiry: null
      };
    }
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Text clean ──────────────────────────────────────────────────────────────

router.post('/text/clean', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.json({ cleanedText: text || '' });

    if (!process.env.OPENAI_API_KEY) {
      // Fallback: basic capitalisation only
      const cleaned = text.trim().replace(/^\w/, c => c.toUpperCase());
      return res.json({ cleanedText: cleaned });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a friendly spelling and grammar assistant for a 9-year-old.
Fix spelling mistakes, capitalize sentences correctly, and fix punctuation.
NEVER change the meaning of facts or the actual trivia content.
Return ONLY the corrected text — no explanation, no quotes.`
        },
        { role: 'user', content: text }
      ],
      max_tokens: 500,
      temperature: 0
    });
    const cleanedText = completion.choices[0]?.message?.content?.trim() || text;
    res.json({ cleanedText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Metadata generation ──────────────────────────────────────────────────

router.post('/ai/generate-metadata', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OPENAI_API_KEY not configured on the server' });
    }

    const project = await getProjectOrFail(res, project_id, businessId);
    if (!project) return;

    const full = await getProjectFull(project_id);
    if (!full) return res.status(404).json({ error: 'Project data not found' });

    const question = full.questions?.[0];
    const answers = question?.answers || [];
    const correctAnswer = answers.find(a => a.is_correct);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are creating YouTube Shorts metadata for a kid-friendly trivia quiz video.

Topic: ${project.topic}
Category: ${project.category}
Question: ${question?.question_text || '(no question yet)'}
Answer options: ${answers.map(a => `${a.label}) ${a.answer_text}`).join(', ')}
Correct answer: ${correctAnswer ? `${correctAnswer.label}) ${correctAnswer.answer_text}` : 'unknown'}

Generate:
1. hook_text: One punchy sentence for the first second of the video (e.g. "Only 1 in 10 kids gets this right"). Max 10 words.
2. title: YouTube Short title. Max 60 chars. Kid-friendly and fun.
3. description: 2-3 sentences. Friendly, encourages engagement.
4. hashtags: Array of 5-8 relevant hashtags (no # symbol, lowercase).

Respond ONLY with valid JSON: { "hook_text": "...", "title": "...", "description": "...", "hashtags": ["..."] }`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let meta;
    try { meta = JSON.parse(raw); } catch { meta = {}; }

    // Save to project
    const { error: updateErr } = await supabaseClient
      .from('kidquiz_projects')
      .update({
        hook_text: meta.hook_text || project.hook_text,
        generated_title: meta.title || project.generated_title,
        generated_description: meta.description || project.generated_description,
        generated_hashtags: meta.hashtags || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', project_id);

    if (updateErr) {
      console.error('[kidquiz/ai/generate-metadata] DB update error:', updateErr.message);
    }

    res.json({ hookText: meta.hook_text, title: meta.title, description: meta.description, hashtags: meta.hashtags || [] });
  } catch (err) {
    console.error('[kidquiz/ai/generate-metadata] Error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ─── Projects CRUD ───────────────────────────────────────────────────────────

router.get('/projects', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data, error } = await supabaseClient
      .from('kidquiz_projects')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ projects: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { topic, category = 'general' } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const { data, error } = await supabaseClient
      .from('kidquiz_projects')
      .insert({ business_id: businessId, topic, category, status: 'DRAFT' })
      .select()
      .single();
    if (error) throw error;
    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;
    const full = await getProjectFull(req.params.id);
    res.json({ project: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    const allowed = ['topic', 'category', 'hook_text', 'generated_title', 'generated_description', 'generated_hashtags', 'privacy'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from('kidquiz_projects')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;
    await supabaseClient.from('kidquiz_projects').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Parent submit for approval ──────────────────────────────────────────────

router.post('/projects/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const storagePath = `${businessId}/${req.params.id}/photo.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_KIDQUIZ_PHOTOS || 'kidquiz-photos';

    const { error: uploadErr } = await supabaseClient.storage
      .from(bucket)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(storagePath);
    const photoUrl = urlData?.publicUrl;

    await supabaseClient
      .from('kidquiz_projects')
      .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ photo_url: photoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id/photo', authenticate, requireBusinessContext, async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    await supabaseClient
      .from('kidquiz_projects')
      .update({ photo_url: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/submit', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'PENDING_APPROVAL', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/approve', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;
    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Questions ───────────────────────────────────────────────────────────────

router.post('/projects/:id/questions', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    const { question_text, timer_seconds = 6, explanation_text, answers = [] } = req.body;
    if (!question_text) return res.status(400).json({ error: 'question_text required' });

    // Shorts = 1 question max, delete existing first
    await supabaseClient.from('kidquiz_questions').delete().eq('project_id', req.params.id);

    const { data: question, error } = await supabaseClient
      .from('kidquiz_questions')
      .insert({ project_id: req.params.id, question_text, timer_seconds, explanation_text, order_index: 0 })
      .select()
      .single();
    if (error) throw error;

    // Upsert answers
    if (answers.length > 0) {
      const answerRows = answers.map(a => ({
        question_id: question.id,
        label: a.label,
        answer_text: a.answer_text,
        is_correct: a.is_correct || false
      }));
      await supabaseClient.from('kidquiz_answer_options').insert(answerRows);
    }

    const full = await getProjectFull(req.params.id);
    res.json({ project: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Render ──────────────────────────────────────────────────────────────────

router.post('/projects/:id/render-reset', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;
    await supabaseClient.from('kidquiz_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    await supabaseClient.from('kidquiz_renders')
      .update({ render_status: 'FAILED', step_error: 'Manually reset', updated_at: new Date().toISOString() })
      .eq('project_id', req.params.id)
      .in('render_status', ['RENDERING', 'PENDING', 'READY_FOR_UPLOAD']);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    if (!['APPROVED', 'FAILED'].includes(project.status)) {
      return res.status(400).json({ error: 'Project must be APPROVED before rendering.' });
    }

    const full = await getProjectFull(req.params.id);
    const question = full.questions?.[0];
    if (!question) return res.status(400).json({ error: 'No question found. Add a question first.' });
    const answers = question.answers || [];
    if (answers.length < 2) return res.status(400).json({ error: 'At least 2 answer options required.' });
    if (!answers.some(a => a.is_correct)) return res.status(400).json({ error: 'Mark one answer as correct.' });

    // Create render record
    const { data: render, error: renderErr } = await supabaseClient
      .from('kidquiz_renders')
      .insert({ project_id: req.params.id, business_id: businessId, render_status: 'PENDING' })
      .select()
      .single();
    if (renderErr) throw renderErr;

    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'RENDERING', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    // Fire render async (don't await)
    import('../../services/kidquiz/renderer.js')
      .then(mod => mod.renderKidQuizShort(render, full))
      .catch(err => {
        console.error('[KidQuiz Render] Failed:', err.message);
        supabaseClient.from('kidquiz_renders')
          .update({ render_status: 'FAILED', step_error: err.message })
          .eq('id', render.id);
        supabaseClient.from('kidquiz_projects')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', req.params.id);
      });

    res.json({ render_id: render.id, status: 'RENDERING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id/render-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    const { data: renders } = await supabaseClient
      .from('kidquiz_renders')
      .select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(1);

    res.json({ render: renders?.[0] || null, project_status: project.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload ──────────────────────────────────────────────────────────────────

router.post('/projects/:id/upload', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    const { data: renders } = await supabaseClient
      .from('kidquiz_renders')
      .select('*')
      .eq('project_id', req.params.id)
      .eq('render_status', 'READY_FOR_UPLOAD')
      .order('created_at', { ascending: false })
      .limit(1);

    const render = renders?.[0];
    if (!render) return res.status(400).json({ error: 'No completed render found. Render the video first.' });

    const { data: pub, error: pubErr } = await supabaseClient
      .from('kidquiz_publishes')
      .insert({ project_id: req.params.id, render_id: render.id, business_id: businessId, publish_status: 'PENDING' })
      .select()
      .single();
    if (pubErr) throw pubErr;

    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'UPLOADING', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    import('../../services/kidquiz/publisher.js')
      .then((mod) => mod.publishKidQuizVideo(pub, render, project))
      .catch(async (err) => {
        console.error('[KidQuiz Upload] Failed:', err.message);
        const em = (err.message || 'Upload failed').slice(0, 2000);
        const { data: pubRow } = await supabaseClient
          .from('kidquiz_publishes')
          .select('publish_status, youtube_video_id')
          .eq('id', pub.id)
          .maybeSingle();
        if (pubRow?.publish_status === 'PUBLISHED' && pubRow?.youtube_video_id) {
          const { error: p2 } = await supabaseClient
            .from('kidquiz_projects')
            .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
          if (p2) console.error('[KidQuiz Upload] Could not sync project PUBLISHED after YouTube success:', p2.message);
          return;
        }
        const { error: p1 } = await supabaseClient
          .from('kidquiz_publishes')
          .update({
            publish_status: 'FAILED',
            error_message: em,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pub.id);
        if (p1) console.error('[KidQuiz Upload] Failed to mark publish FAILED:', p1.message);
        const { error: p2 } = await supabaseClient
          .from('kidquiz_projects')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', req.params.id);
        if (p2) console.error('[KidQuiz Upload] Failed to mark project FAILED:', p2.message);
      });

    res.json({ publish_id: pub.id, status: 'UPLOADING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id/upload-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProjectOrFail(res, req.params.id, businessId);
    if (!project) return;

    const { data: publishes } = await supabaseClient
      .from('kidquiz_publishes')
      .select('*')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(1);

    res.json({ publish: publishes?.[0] || null, project_status: project.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
