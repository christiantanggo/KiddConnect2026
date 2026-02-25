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
import { google } from 'googleapis';

const router = express.Router();
const MODULE_KEY = 'kidquiz';

router.use(authenticate);
router.use(requireBusinessContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isYouTubeConfigured() {
  return !!(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REDIRECT_URI
  );
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

router.get('/youtube/auth-url', async (req, res) => {
  try {
    if (!isYouTubeConfigured()) {
      return res.status(400).json({ error: 'YouTube OAuth not configured on the server.' });
    }
    const businessId = req.active_business_id;
    const raw = process.env.YOUTUBE_REDIRECT_URI || '';
    // Use the kidquiz callback URL
    const baseRedirect = raw.replace(/orbix-network\/youtube\/callback/, 'kidquiz/youtube/callback');
    const redirectUri = baseRedirect.startsWith('http') ? baseRedirect : `https://${baseRedirect}`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri
    );
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
      state: businessId,
      prompt: 'consent'
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const yt = moduleSettings?.settings?.youtube;
    res.json({
      connected: !!(yt?.access_token),
      channel_title: yt?.channel_title || null,
      channel_id: yt?.channel_id || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/youtube/disconnect', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings ? { ...moduleSettings.settings } : {};
    delete settings.youtube;
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

    const OpenAI = (await import('openai')).default;
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

    const project = await getProjectOrFail(res, project_id, businessId);
    if (!project) return;

    const full = await getProjectFull(project_id);
    const question = full.questions?.[0];
    const answers = question?.answers || [];
    const correctAnswer = answers.find(a => a.is_correct);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OPENAI_API_KEY not configured' });
    }

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
You are creating YouTube Shorts metadata for a kid-friendly trivia quiz video.

Topic: ${project.topic}
Category: ${project.category}
Question: ${question?.question_text || '(no question yet)'}
Answer options: ${answers.map(a => `${a.label}) ${a.answer_text}`).join(', ')}
Correct answer: ${correctAnswer ? `${correctAnswer.label}) ${correctAnswer.answer_text}` : 'unknown'}

Generate:
1. hook_text: One punchy sentence for the first second of the video (e.g. "Only 1 in 10 kids gets this right…"). Max 10 words.
2. title: YouTube Short title. Max 60 chars. Kid-friendly, fun, emoji optional.
3. description: 2-3 sentences. Friendly, encourages engagement.
4. hashtags: Array of 5-8 relevant hashtags (no # symbol, lowercase).

Respond ONLY with valid JSON: { "hook_text": "...", "title": "...", "description": "...", "hashtags": ["..."] }
`;

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
    await supabaseClient
      .from('kidquiz_projects')
      .update({
        hook_text: meta.hook_text || project.hook_text,
        generated_title: meta.title || project.generated_title,
        generated_description: meta.description || project.generated_description,
        generated_hashtags: meta.hashtags || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', project_id);

    res.json({ hookText: meta.hook_text, title: meta.title, description: meta.description, hashtags: meta.hashtags || [] });
  } catch (err) {
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
      .then(mod => mod.publishKidQuizVideo(pub, render, project))
      .catch(err => {
        console.error('[KidQuiz Upload] Failed:', err.message);
        supabaseClient.from('kidquiz_publishes')
          .update({ publish_status: 'FAILED', error_message: err.message })
          .eq('id', pub.id);
        supabaseClient.from('kidquiz_projects')
          .update({ status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', req.params.id);
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
