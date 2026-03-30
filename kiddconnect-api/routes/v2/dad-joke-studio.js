/**
 * Dad Joke Studio — API (/api/v2/dad-joke-studio)
 */
import express from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';
import { google } from 'googleapis';
import {
  withYouTubeLoginHint,
  YOUTUBE_OAUTH_PROMPT,
  oauthHintMergeFromRequest,
} from '../../utils/google-oauth-url-options.js';
import {
  STYLE_OPTIONS,
  analyzeStyleRecipe,
  smartRandomRecipe,
  generateIdeasList,
  generateShortsScript,
  generateLongFormScript,
  generatePlaceholderLongForm,
} from '../../services/dadjoke-studio/ai.js';
import { isAssetEligibleForRender } from '../../services/dadjoke-studio/asset-resolver.js';

const MODULE_KEY = 'dad-joke-studio';
const ASSETS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_DADJOKE_STUDIO_ASSETS || 'dadjoke-studio-assets';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 22 * 1024 * 1024 },
});

const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

router.use(async (req, res, next) => {
  try {
    const m = await OrganizationUser.findByUserAndBusiness(req.user.id, req.active_business_id);
    req.orgRole = m?.role || req.user.role || 'owner';
    next();
  } catch (e) {
    next(e);
  }
});

function requireOwnerOrAdmin(req, res, next) {
  const role = req.orgRole || 'staff';
  if (!['owner', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only organization owner or admin can change format availability.' });
  }
  next();
}

async function ensureBusinessFormats(businessId) {
  const { data: formats } = await supabaseClient
    .from('dadjoke_studio_formats')
    .select('id')
    .is('deleted_at', null);
  if (!formats?.length) return;
  const rows = formats.map((f) => ({
    business_id: businessId,
    format_id: f.id,
    enabled: true,
    updated_at: new Date().toISOString(),
  }));
  await supabaseClient.from('dadjoke_studio_business_formats').upsert(rows, {
    onConflict: 'business_id,format_id',
    ignoreDuplicates: false,
  });
}

async function isFormatEnabledForBusiness(businessId, formatId) {
  const { data: row } = await supabaseClient
    .from('dadjoke_studio_business_formats')
    .select('enabled')
    .eq('business_id', businessId)
    .eq('format_id', formatId)
    .maybeSingle();
  if (!row) return true;
  return row.enabled !== false;
}

const MIN_SCHEDULE_MS = 15 * 60 * 1000;

function assertScheduleUtc(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new Error('Invalid schedule time.');
  if (t < Date.now() + MIN_SCHEDULE_MS) {
    throw new Error(`Scheduled publish must be at least ${MIN_SCHEDULE_MS / 60000} minutes in the future (UTC).`);
  }
  return new Date(t).toISOString();
}

async function clearDownstreamOnRegenerate(contentId, businessId) {
  await supabaseClient
    .from('dadjoke_studio_publish_queue')
    .delete()
    .eq('generated_content_id', contentId)
    .eq('business_id', businessId)
    .in('publish_status', ['PENDING', 'FAILED']);
  await supabaseClient
    .from('dadjoke_studio_generated_content')
    .update({
      status: 'DRAFT',
      approved_at: null,
      approved_by_user_id: null,
      current_render_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentId)
    .eq('business_id', businessId);
}

// ─── Formats ────────────────────────────────────────────────────────────────

router.get('/formats', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    await ensureBusinessFormats(businessId);
    const { data: formats } = await supabaseClient
      .from('dadjoke_studio_formats')
      .select('*')
      .is('deleted_at', null)
      .order('content_type')
      .order('name');
    const { data: bf } = await supabaseClient
      .from('dadjoke_studio_business_formats')
      .select('*')
      .eq('business_id', businessId);
    const map = Object.fromEntries((bf || []).map((x) => [x.format_id, x]));
    const role = req.orgRole || 'staff';
    const canSeeDisabled = ['owner', 'admin'].includes(role);
    const out = (formats || [])
      .map((f) => {
        const b = map[f.id];
        const enabled = b ? b.enabled !== false : true;
        return { ...f, business_enabled: enabled, overrides: b?.overrides || {} };
      })
      .filter((f) => canSeeDisabled || f.business_enabled);
    res.json({ formats: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/formats/:formatId', requireOwnerOrAdmin, async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { formatId } = req.params;
    const { enabled, overrides } = req.body;
    await ensureBusinessFormats(businessId);
    const payload = {
      business_id: businessId,
      format_id: formatId,
      updated_at: new Date().toISOString(),
    };
    if (typeof enabled === 'boolean') payload.enabled = enabled;
    if (overrides && typeof overrides === 'object') payload.overrides = overrides;
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_business_formats')
      .upsert(payload, { onConflict: 'business_id,format_id' })
      .select()
      .single();
    if (error) throw error;
    res.json({ business_format: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── YouTube OAuth (mirror Kid Quiz) ─────────────────────────────────────────

async function dadJokeStudioYouTubeAuthUrlHandler(req, res) {
  try {
    const businessId = req.active_business_id;
    const hintSrc = oauthHintMergeFromRequest(req);
    const usageManual = String(hintSrc.usage || '').toLowerCase() === 'manual';
    const raw = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5000/api/v2/orbix-network/youtube/callback';
    const baseUrl = raw.replace(/\/api\/v2\/.+$/, '');
    const redirectUri = `${baseUrl}/api/v2/dad-joke-studio/youtube/callback`;

    if (usageManual) {
      const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const ytManual = moduleSettings?.settings?.youtube_manual || {};
      const clientId = (ytManual.manual_client_id || '').trim();
      const clientSecret = (ytManual.manual_client_secret || '').trim();
      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'Manual OAuth not set. Enter Client ID and Secret, save in module settings, then connect.',
          configured: false,
        });
      }
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const url = oauth2Client.generateAuthUrl(
        withYouTubeLoginHint(
          {
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
            state: `${businessId}:dad-joke-studio:manual`,
            prompt: YOUTUBE_OAUTH_PROMPT,
          },
          hintSrc
        )
      );
      return res.json({ url, redirect_uri: redirectUri });
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const yt = moduleSettings?.settings?.youtube || {};
    const customId = (yt.client_id || '').trim();
    const customSecret = (yt.client_secret || '').trim();
    const useCustom = customId && customSecret;
    const clientId = useCustom ? customId : process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = useCustom ? customSecret : process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'YouTube OAuth not configured. Add Client ID and Secret in module settings or env.',
        configured: false,
      });
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oauth2Client.generateAuthUrl(
      withYouTubeLoginHint(
        {
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
          state: `${businessId}:dad-joke-studio`,
          prompt: YOUTUBE_OAUTH_PROMPT,
        },
        hintSrc
      )
    );
    res.json({ url, redirect_uri: redirectUri });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/youtube/auth-url', dadJokeStudioYouTubeAuthUrlHandler);
router.post('/youtube/auth-url', express.json(), dadJokeStudioYouTubeAuthUrlHandler);

router.get('/youtube/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings || {};
    const yt = settings.youtube || {};
    const ytManual = settings.youtube_manual || {};
    res.json({
      connected: !!(yt.access_token),
      connected_manual: !!(ytManual.manual_access_token),
      channel_title: yt.channel_title || ytManual.manual_channel_title || null,
      custom_oauth: !!(yt.client_id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Style engine ─────────────────────────────────────────────────────────────

router.get('/style-options', (req, res) => {
  res.json({ categories: STYLE_OPTIONS });
});

router.post('/style-engine/analyze', (req, res) => {
  try {
    const { recipe } = req.body;
    res.json(analyzeStyleRecipe(recipe || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/style-engine/random', (req, res) => {
  try {
    const { mode = 'safe', locked = {}, seed } = req.body;
    const m = ['safe', 'creative', 'wild'].includes(mode) ? mode : 'safe';
    res.json({ recipe: smartRandomRecipe(m, locked, seed) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Presets ──────────────────────────────────────────────────────────────────

router.get('/presets', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: built } = await supabaseClient
      .from('dadjoke_studio_presets')
      .select('*')
      .eq('built_in', true)
      .is('deleted_at', null);
    const { data: custom } = await supabaseClient
      .from('dadjoke_studio_presets')
      .select('*')
      .eq('business_id', businessId)
      .eq('built_in', false)
      .is('deleted_at', null);
    res.json({ presets: [...(built || []), ...(custom || [])] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/presets', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { name, description, category, recipe_embed } = req.body;
    if (!name || !recipe_embed) return res.status(400).json({ error: 'name and recipe_embed required' });
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_presets')
      .insert({
        business_id: businessId,
        name,
        description: description || null,
        category: category || 'custom',
        built_in: false,
        scope: 'business',
        recipe_embed,
        metadata: {},
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ preset: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/presets/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: row } = await supabaseClient
      .from('dadjoke_studio_presets')
      .select('id, built_in, business_id')
      .eq('id', req.params.id)
      .single();
    if (!row || row.built_in) return res.status(400).json({ error: 'Cannot delete built-in preset' });
    if (row.business_id !== businessId) return res.status(403).json({ error: 'Forbidden' });
    await supabaseClient
      .from('dadjoke_studio_presets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Assets ───────────────────────────────────────────────────────────────────

router.get('/assets', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const type = req.query.type;
    const forContentType = req.query.for_content_type;
    const forFormatKey = req.query.for_format_key;
    let q = supabaseClient
      .from('dadjoke_studio_assets')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (type) q = q.eq('asset_type', type);
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (forContentType && forFormatKey) {
      rows = rows.filter((a) => isAssetEligibleForRender(a, forContentType, forFormatKey));
    }
    const withUrls = rows.map((a) => {
      const { data: pub } = supabaseClient.storage.from(ASSETS_BUCKET).getPublicUrl(a.storage_path);
      const public_url = pub?.publicUrl || pub?.publicURL || null;
      return { ...a, public_url };
    });
    res.json({ assets: withUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseAssetScopeBody(body) {
  let usage_scope = String(body?.usage_scope || 'global').toLowerCase();
  if (!['global', 'shorts', 'long_form', 'formats'].includes(usage_scope)) usage_scope = 'global';
  let format_keys = [];
  if (body?.format_keys != null) {
    try {
      format_keys =
        typeof body.format_keys === 'string' ? JSON.parse(body.format_keys) : body.format_keys;
    } catch {
      format_keys = [];
    }
  }
  if (!Array.isArray(format_keys)) format_keys = [];
  format_keys = format_keys.map((k) => String(k).trim()).filter(Boolean);
  return { usage_scope, format_keys };
}

router.post('/assets', upload.single('file'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const assetType = req.body.asset_type || 'image';
    const { usage_scope, format_keys } = parseAssetScopeBody(req.body);
    if (usage_scope === 'formats' && format_keys.length === 0) {
      return res.status(400).json({ error: 'Scope "formats" requires at least one format selected (format_keys).' });
    }
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const allowed = {
      music: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'],
      image: ['image/jpeg', 'image/png', 'image/webp'],
      background: ['image/jpeg', 'image/png', 'image/webp'],
      thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
    };
    const list = allowed[assetType] || allowed.image;
    if (!list.includes(req.file.mimetype)) {
      return res.status(400).json({ error: `Invalid file type for ${assetType}` });
    }
    const ext = req.file.originalname?.split('.').pop() || 'bin';
    const path = `${businessId}/${assetType}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabaseClient.storage
      .from(ASSETS_BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: row, error: insErr } = await supabaseClient
      .from('dadjoke_studio_assets')
      .insert({
        business_id: businessId,
        asset_type: assetType === 'background' ? 'background' : assetType,
        display_name: req.body.display_name || req.file.originalname,
        storage_path: path,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
        enabled: true,
        usage_scope,
        format_keys,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    const { data: pub } = supabaseClient.storage.from(ASSETS_BUCKET).getPublicUrl(path);
    res.json({ asset: { ...row, public_url: pub?.publicUrl || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/assets/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: existing } = await supabaseClient
      .from('dadjoke_studio_assets')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .single();
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { usage_scope, format_keys } = parseAssetScopeBody({ ...existing, ...req.body });
    if (usage_scope === 'formats' && format_keys.length === 0) {
      return res.status(400).json({ error: 'Scope "formats" requires at least one format_key.' });
    }
    const patch = {
      usage_scope,
      format_keys,
      updated_at: new Date().toISOString(),
    };
    if (typeof req.body.display_name === 'string') patch.display_name = req.body.display_name.slice(0, 255);
    const { data: row, error } = await supabaseClient
      .from('dadjoke_studio_assets')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    const { data: pub } = supabaseClient.storage.from(ASSETS_BUCKET).getPublicUrl(row.storage_path);
    res.json({ asset: { ...row, public_url: pub?.publicUrl || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: row } = await supabaseClient
      .from('dadjoke_studio_assets')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!row) return res.status(404).json({ error: 'Not found' });
    await supabaseClient.storage.from(ASSETS_BUCKET).remove([row.storage_path]).catch(() => {});
    await supabaseClient
      .from('dadjoke_studio_assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Ideas ────────────────────────────────────────────────────────────────────

router.get('/ideas', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_ideas')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ ideas: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ideas/generate', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { prompt, count = 8, mode = 'manual' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const { ideas } = await generateIdeasList(prompt, Math.min(20, Number(count) || 8));
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_ideas')
      .insert({
        business_id: businessId,
        prompt,
        mode,
        results_json: ideas,
        status: 'draft',
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ idea: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/ideas/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { selected_index, status, downstream_content_type, downstream_format_key } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (selected_index !== undefined) patch.selected_index = selected_index;
    if (status) patch.status = status;
    if (downstream_content_type) patch.downstream_content_type = downstream_content_type;
    if (downstream_format_key) patch.downstream_format_key = downstream_format_key;
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_ideas')
      .update(patch)
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .select()
      .single();
    if (error) throw error;
    res.json({ idea: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Generated content ────────────────────────────────────────────────────────

router.get('/content', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { content_type, format_key, status, from, to } = req.query;
    let q = supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (content_type) q = q.eq('content_type', content_type);
    if (format_key) q = q.eq('format_key', format_key);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { content_type, format_key, asset_snapshot, ai_mode, ai_prompt } = req.body;
    if (!content_type || !format_key) return res.status(400).json({ error: 'content_type and format_key required' });
    const { data: formatRow } = await supabaseClient
      .from('dadjoke_studio_formats')
      .select('*')
      .eq('format_key', format_key)
      .single();
    if (!formatRow) return res.status(404).json({ error: 'Unknown format' });
    if (!(await isFormatEnabledForBusiness(businessId, formatRow.id))) {
      return res.status(403).json({ error: 'Format disabled for this business' });
    }
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .insert({
        business_id: businessId,
        module_key: MODULE_KEY,
        content_type,
        format_id: formatRow.id,
        format_key,
        orientation: formatRow.orientation,
        asset_snapshot: asset_snapshot && typeof asset_snapshot === 'object' ? asset_snapshot : {},
        script_text: '',
        storyboard_json: [],
        content_json: {},
        ai_mode: ai_mode || 'manual',
        ai_prompt: ai_prompt || null,
        status: 'DRAFT',
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/content/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    const { data: render } = await supabaseClient
      .from('dadjoke_studio_rendered_outputs')
      .select('*')
      .eq('id', data.current_render_id)
      .maybeSingle();
    const { data: publishes } = await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .select('*')
      .eq('generated_content_id', data.id)
      .order('created_at', { ascending: false })
      .limit(5);
    res.json({ item: data, current_render: render, publish_rows: publishes || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/content/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: existing } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const body = req.body;
    const patch = { updated_at: new Date().toISOString() };
    const fields = [
      'script_text',
      'storyboard_json',
      'content_json',
      'asset_snapshot',
      'summary',
      'title',
      'upload_title',
      'upload_description',
      'upload_tags',
      'ai_mode',
      'ai_prompt',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) patch[f] = body[f];
    }

    const scriptChanged =
      body.script_text !== undefined && body.script_text !== existing.script_text;
    const regenFields = ['storyboard_json', 'content_json', 'asset_snapshot', 'ai_prompt', 'ai_mode', 'style_recipe_snapshot'];
    const shouldReset = scriptChanged || regenFields.some((f) => body[f] !== undefined);

    if (shouldReset && ['APPROVED', 'RENDERING', 'RENDERED', 'UPLOAD_QUEUED', 'UPLOADING', 'SCHEDULED', 'PUBLISHED'].includes(existing.status)) {
      await clearDownstreamOnRegenerate(req.params.id, businessId);
      patch.status = 'DRAFT';
      patch.approved_at = null;
      patch.approved_by_user_id = null;
      patch.current_render_id = null;
    }

    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content/:id/generate', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: existing } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await clearDownstreamOnRegenerate(req.params.id, businessId);

    const body = req.body;
    let gen;
    if (existing.content_type === 'shorts') {
      gen = await generateShortsScript({
        formatKey: existing.format_key,
        aiMode: body.ai_mode || existing.ai_mode || 'manual',
        aiPrompt: body.ai_prompt || existing.ai_prompt,
        extra: body,
      });
    } else if (existing.format_key === 'long_style_engine') {
      gen = await generateLongFormScript({
        aiMode: body.ai_mode || existing.ai_mode || 'manual',
        aiPrompt: body.ai_prompt || existing.ai_prompt,
        title: body.title,
        topic: body.topic,
        scenario: body.scenario,
        endingJoke: body.ending_joke,
        cta: body.cta,
        styleRecipe: body.style_recipe || existing.style_recipe_snapshot || {},
      });
    } else {
      gen = await generatePlaceholderLongForm(existing.format_key, body.ai_prompt || existing.ai_prompt);
    }

    const storyboard = Array.isArray(gen.storyboard) ? gen.storyboard : [];
    let contentJson = existing.content_json && typeof existing.content_json === 'object' ? { ...existing.content_json } : {};
    if (gen.content_json && typeof gen.content_json === 'object') {
      contentJson = { ...contentJson, ...gen.content_json };
    }
    if (existing.format_key === 'shorts_classic_loop' && gen.setup && gen.punchline) {
      contentJson = {
        ...contentJson,
        setup: gen.setup,
        punchline: gen.punchline,
        voice_script: gen.voice_script || gen.setup,
        hook: gen.hook || contentJson.hook,
      };
    }
    const patch = {
      script_text: gen.script_text || '',
      storyboard_json: storyboard,
      content_json: contentJson,
      summary: gen.summary || null,
      title: gen.suggested_title || existing.title,
      style_recipe_snapshot: body.style_recipe || existing.style_recipe_snapshot,
      status: 'DRAFT',
      approved_at: null,
      approved_by_user_id: null,
      current_render_id: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content/:id/submit-review', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ status: 'PENDING_APPROVAL', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .select()
      .single();
    if (error || !data) return res.status(400).json({ error: 'Update failed' });
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content/:id/approve', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({
        status: 'APPROVED',
        approved_at: now,
        approved_by_user_id: req.user.id,
        updated_at: now,
      })
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .in('status', ['DRAFT', 'PENDING_APPROVAL'])
      .select()
      .single();
    if (error || !data) return res.status(400).json({ error: 'Only draft or pending items can be approved' });
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/content/:id/render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: content } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!content) return res.status(404).json({ error: 'Not found' });
    if (content.status === 'FAILED') {
      await supabaseClient
        .from('dadjoke_studio_generated_content')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', content.id);
      content.status = 'APPROVED';
    }
    if (content.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Content must be APPROVED before rendering (or retry after a render failure).' });
    }
    if (!(content.script_text || '').trim()) return res.status(400).json({ error: 'Script is empty.' });

    const { data: renderRow, error: rErr } = await supabaseClient
      .from('dadjoke_studio_rendered_outputs')
      .insert({
        generated_content_id: content.id,
        business_id: businessId,
        render_status: 'PENDING',
      })
      .select()
      .single();
    if (rErr) throw rErr;

    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({
        status: 'RENDERING',
        current_render_id: renderRow.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', content.id);

    import('../../services/dadjoke-studio/renderer.js')
      .then((mod) => mod.processDadJokeStudioRender(renderRow.id))
      .catch((err) => {
        console.error('[DadJokeStudio Render] async fail:', err.message);
      });

    res.json({ render_id: renderRow.id, status: 'RENDERING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/content/:id/render-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: content } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('current_render_id')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!content?.current_render_id) return res.json({ render: null });
    const { data: render } = await supabaseClient
      .from('dadjoke_studio_rendered_outputs')
      .select('*')
      .eq('id', content.current_render_id)
      .single();
    res.json({ render });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/content/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: row, error: fetchErr } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('id, status, deleted_at')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row || row.deleted_at) return res.status(404).json({ error: 'Not found' });
    if (['RENDERING', 'UPLOADING'].includes(row.status)) {
      return res.status(409).json({
        error: 'Cannot delete while a render or YouTube upload is in progress. Wait for it to finish or fail.',
      });
    }
    const { error: upErr } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .is('deleted_at', null);
    if (upErr) throw upErr;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Publish ──────────────────────────────────────────────────────────────────

router.post('/publish-queue', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const {
      generated_content_id,
      rendered_output_id,
      title,
      description,
      tags,
      privacy_status,
      self_declared_made_for_kids,
      category_id,
      thumbnail_storage_path,
      schedule_publish_at_utc,
    } = req.body;
    if (!generated_content_id || !rendered_output_id || !title) {
      return res.status(400).json({ error: 'generated_content_id, rendered_output_id, title required' });
    }

    const { data: content } = await supabaseClient
      .from('dadjoke_studio_generated_content')
      .select('*')
      .eq('id', generated_content_id)
      .eq('business_id', businessId)
      .single();
    if (!content) return res.status(404).json({ error: 'Content not found' });
    if (content.status !== 'RENDERED') {
      return res.status(400).json({ error: 'Content must be rendered (status RENDERED) before upload.' });
    }

    const { data: render } = await supabaseClient
      .from('dadjoke_studio_rendered_outputs')
      .select('*')
      .eq('id', rendered_output_id)
      .eq('generated_content_id', generated_content_id)
      .single();
    if (!render || render.render_status !== 'READY') {
      return res.status(400).json({ error: 'Render not ready.' });
    }

    let scheduleIso = null;
    if (schedule_publish_at_utc) {
      scheduleIso = assertScheduleUtc(schedule_publish_at_utc);
    }

    const { data: pubRow, error: pErr } = await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .insert({
        generated_content_id,
        rendered_output_id,
        business_id: businessId,
        title,
        description: description || '',
        tags: Array.isArray(tags) ? tags : [],
        privacy_status: (privacy_status || 'public').toLowerCase(),
        self_declared_made_for_kids: !!self_declared_made_for_kids,
        category_id: category_id || '23',
        thumbnail_storage_path: thumbnail_storage_path || null,
        schedule_publish_at_utc: scheduleIso,
        publish_status: 'PENDING',
      })
      .select()
      .single();
    if (pErr) throw pErr;

    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ status: 'UPLOAD_QUEUED', updated_at: new Date().toISOString() })
      .eq('id', generated_content_id);

    import('../../services/dadjoke-studio/publisher.js')
      .then((mod) => mod.publishDadJokeStudioVideo(pubRow, render, content))
      .catch((err) => {
        console.error('[DadJokeStudio Publish] async fail:', err.message);
      });

    res.json({ publish: pubRow, status: 'UPLOADING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/publish-queue/:id/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data } = await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', businessId)
      .single();
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ publish: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/business/timezone', async (req, res) => {
  try {
    const tz = req.business?.timezone || 'America/New_York';
    res.json({ timezone: tz });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
