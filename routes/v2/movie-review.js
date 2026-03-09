/**
 * Movie Review Studio — API Routes
 * Mounted at /api/v2/movie-review
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { google } from 'googleapis';
import OpenAI from 'openai';
import multer from 'multer';
import { randomUUID } from 'crypto';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = express.Router();
const MODULE_KEY = 'movie-review';

const VOICE_BUCKET  = 'movie-review-voices';
const IMAGE_BUCKET  = 'movie-review-images';
const RENDER_BUCKET = 'movie-review-renders';
const MUSIC_BUCKET_OWN    = 'movie-review-music';
const MUSIC_BUCKET_SHARED = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_MUSIC || 'orbix-network-music';
const MUSIC_EXT = /\.(mp3|m4a|aac|wav|ogg)$/i;

// ─── Public YouTube OAuth callback is handled by orbix-network-youtube-callback.js ───

router.use(authenticate);
router.use(requireBusinessContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeader(req) {
  return {
    Authorization: req.headers.authorization,
    'X-Active-Business-Id': req.active_business_id,
  };
}

async function getProject(projectId, businessId) {
  const { data, error } = await supabaseClient
    .from('movie_review_projects')
    .select('*')
    .eq('id', projectId)
    .eq('business_id', businessId)
    .single();
  if (error || !data) return null;
  return data;
}

function isYouTubeConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);
}

function clientIdPreview(id) {
  if (!id || typeof id !== 'string') return null;
  const t = id.trim();
  if (t.length <= 12) return t ? '***' : null;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

// ─── Settings ────────────────────────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = ms?.settings || {};
    res.json({
      settings: {
        max_duration_seconds: settings.max_duration_seconds ?? 50,
        enable_ai: settings.enable_ai ?? true,
        default_privacy: settings.default_privacy ?? 'PUBLIC',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { max_duration_seconds, enable_ai, default_privacy } = req.body;
    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const existing = ms?.settings || {};
    const updated = {
      ...existing,
      max_duration_seconds: max_duration_seconds ?? existing.max_duration_seconds ?? 50,
      enable_ai: enable_ai ?? existing.enable_ai ?? true,
      default_privacy: default_privacy ?? existing.default_privacy ?? 'PUBLIC',
    };
    await ModuleSettings.update(businessId, MODULE_KEY, updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── YouTube OAuth (Custom + Manual, same pattern as Kid Quiz / Orbix) ─────────

router.get('/youtube/auth-url', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const usageManual = (req.query.usage || '').toLowerCase() === 'manual';
    const raw = process.env.YOUTUBE_REDIRECT_URI || '';
    const redirectUri = raw.startsWith('http') ? raw : `https://${raw}`;

    if (usageManual) {
      const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const ytManual = ms?.settings?.youtube_manual || {};
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
        state: `${businessId}:movie-review:manual`,
        prompt: 'consent',
      });
      return res.json({ url, redirect_uri: redirectUri });
    }

    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const yt = ms?.settings?.youtube || {};
    const customId = (yt.client_id || '').trim();
    const customSecret = (yt.client_secret || '').trim();
    const useCustom = customId && customSecret;
    const clientId = useCustom ? customId : process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = useCustom ? customSecret : process.env.YOUTUBE_CLIENT_SECRET;
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
      state: `${businessId}:movie-review`,
      prompt: 'consent',
    });
    res.json({ url, redirect_uri: redirectUri });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/youtube/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = ms?.settings || {};
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
      manual_client_id_preview: clientIdPreview(ytManual.manual_client_id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /youtube/custom-oauth — save OAuth client id/secret. Body: { client_id, client_secret, usage: 'auto'|'manual' }. */
router.post('/youtube/custom-oauth', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const usage = (req.body?.usage || 'auto').toLowerCase();
    const isManual = usage === 'manual';
    const clientId = (req.body?.client_id ?? '').trim();
    const clientSecret = (req.body?.client_secret ?? '').trim();

    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = ms?.settings ? { ...ms.settings } : {};

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

    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    if (!ms) return res.json({ success: true });

    const settings = ms.settings ? { ...ms.settings } : {};
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

// ─── Projects CRUD ───────────────────────────────────────────────────────────

router.get('/projects', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data, error } = await supabaseClient
      .from('movie_review_projects')
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
    const { movie_title, content_type, notes_text, tmdb_movie_id, tmdb_poster_url } = req.body;
    if (!movie_title?.trim()) return res.status(400).json({ error: 'Movie title is required' });

    // Get max_duration from settings
    const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const maxDuration = ms?.settings?.max_duration_seconds ?? 50;
    const defaultPrivacy = ms?.settings?.default_privacy ?? 'PUBLIC';

    const { data, error } = await supabaseClient
      .from('movie_review_projects')
      .insert({
        business_id: businessId,
        movie_title: movie_title.trim(),
        content_type: content_type || 'review',
        notes_text: notes_text || null,
        tmdb_movie_id: tmdb_movie_id || null,
        tmdb_poster_url: tmdb_poster_url || null,
        max_duration_seconds: maxDuration,
        privacy: defaultPrivacy,
        status: 'DRAFT',
      })
      .select()
      .single();
    if (error) throw error;

    // If TMDB poster provided, create an image asset for it
    if (tmdb_poster_url && tmdb_movie_id) {
      await supabaseClient.from('movie_review_assets').insert({
        business_id: businessId,
        project_id: data.id,
        type: 'IMAGE',
        storage_bucket: 'tmdb',
        storage_path: `tmdb/${tmdb_movie_id}`,
        public_url: tmdb_poster_url,
        original_name: `${movie_title}-poster.jpg`,
        order_index: 0,
      });
    }

    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id, req.active_business_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Attach assets and timeline
    const [{ data: assets }, { data: timeline }] = await Promise.all([
      supabaseClient.from('movie_review_assets').select('*').eq('project_id', project.id).order('order_index'),
      supabaseClient.from('movie_review_timeline_items').select('*').eq('project_id', project.id).order('order_index'),
    ]);

    res.json({ project: { ...project, assets: assets || [], timeline: timeline || [] } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const allowed = [
      'movie_title','content_type','notes_text','script_text','hook_text','tagline_text',
      'yt_title','yt_description','yt_hashtags','voice_asset_id','music_asset_id',
      'max_duration_seconds','privacy','status',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from('movie_review_projects')
      .update(updates)
      .eq('id', project.id)
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
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await supabaseClient.from('movie_review_projects').delete().eq('id', project.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Voice Recording ──────────────────────────────────────────────────────────

router.post('/projects/:id/voice', upload.single('voice'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const audioBuffer = req.file.buffer;
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Uploaded audio file is empty' });
    }

    console.log(`[MovieReview Voice] Received ${audioBuffer.length} bytes, mimetype=${req.file.mimetype}, name=${req.file.originalname}`);

    // Delete old voice asset if exists
    if (project.voice_asset_id) {
      const { data: oldAsset } = await supabaseClient
        .from('movie_review_assets')
        .select('storage_bucket,storage_path')
        .eq('id', project.voice_asset_id)
        .single();
      if (oldAsset) {
        await supabaseClient.storage.from(oldAsset.storage_bucket).remove([oldAsset.storage_path]);
        await supabaseClient.from('movie_review_assets').delete().eq('id', project.voice_asset_id);
      }
    }

    const inExt = req.file.originalname.split('.').pop() || 'webm';
    const contentType = req.file.mimetype || 'audio/webm';
    const fileName = `${businessId}/${project.id}/voice-${Date.now()}.${inExt}`;

    // Get actual duration via ffprobe before uploading
    let durationSeconds = null;
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { writeFile, unlink } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      const execAsync = promisify(exec);
      const writeAsync = promisify(writeFile);
      const unlinkAsync = promisify(unlink);
      const tmpIn = join(tmpdir(), `mr-probe-${randomUUID()}.${inExt}`);
      await writeAsync(tmpIn, audioBuffer);
      const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${tmpIn}"`);
      unlinkAsync(tmpIn).catch(() => {});
      const info = JSON.parse(stdout);
      const stream = info.streams?.find(s => s.codec_type === 'audio');
      if (stream?.duration) durationSeconds = parseFloat(stream.duration);
    } catch (_) {}

    const { error: uploadErr } = await supabaseClient.storage
      .from(VOICE_BUCKET)
      .upload(fileName, audioBuffer, { contentType, upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabaseClient.storage.from(VOICE_BUCKET).getPublicUrl(fileName);

    const { data: asset, error: assetErr } = await supabaseClient
      .from('movie_review_assets')
      .insert({
        business_id: businessId,
        project_id: project.id,
        type: 'AUDIO_VOICE',
        storage_bucket: VOICE_BUCKET,
        storage_path: fileName,
        public_url: publicUrl,
        original_name: req.file.originalname,
        duration_seconds: durationSeconds,
        order_index: 0,
      })
      .select()
      .single();
    if (assetErr) throw assetErr;

    await supabaseClient
      .from('movie_review_projects')
      .update({ voice_asset_id: asset.id, updated_at: new Date().toISOString() })
      .eq('id', project.id);

    console.log(`[MovieReview Voice] Saved ${inExt} ${audioBuffer.length} bytes, est. duration=${durationSeconds}s`);
    res.json({ asset });
  } catch (err) {
    console.error('[MovieReview Voice] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Voice Effect Transform ────────────────────────────────────────────────────

const VOICE_EFFECTS = {
  normal:   null, // no processing
  deep:     'asetrate=44100*0.75,aresample=44100,atempo=1.333',
  chipmunk: 'asetrate=44100*1.4,aresample=44100,atempo=0.714',
  robotic:  'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75',
  radio:    'highpass=f=400,lowpass=f=3400,acompressor=threshold=0.05:ratio=4:attack=5:release=50',
  echo:     'aecho=0.8:0.88:80:0.4',
};

router.post('/projects/:id/voice/transform', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.voice_asset_id) return res.status(400).json({ error: 'No voice recording to transform' });

    const { effect } = req.body;
    if (!effect || !(effect in VOICE_EFFECTS)) {
      return res.status(400).json({ error: `Unknown effect. Valid: ${Object.keys(VOICE_EFFECTS).join(', ')}` });
    }

    const filter = VOICE_EFFECTS[effect];

    // Load current voice asset
    const { data: asset, error: assetErr } = await supabaseClient
      .from('movie_review_assets')
      .select('*')
      .eq('id', project.voice_asset_id)
      .single();
    if (assetErr || !asset) return res.status(404).json({ error: 'Voice asset not found' });

    // Download original audio from Supabase Storage
    const { data: fileData, error: dlErr } = await supabaseClient.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);
    if (dlErr) throw new Error(`Download failed: ${dlErr.message}`);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { writeFile, readFile, unlink } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const execAsync = promisify(exec);
    const writeAsync = promisify(writeFile);
    const readAsync = promisify(readFile);
    const unlinkAsync = promisify(unlink);

    const inExt = asset.storage_path.split('.').pop() || 'webm';
    const tmpIn  = join(tmpdir(), `mr-fx-in-${randomUUID()}.${inExt}`);
    const tmpOut = join(tmpdir(), `mr-fx-out-${randomUUID()}.webm`);

    const origBuffer = Buffer.from(await fileData.arrayBuffer());
    await writeAsync(tmpIn, origBuffer);

    // If normal (no filter), just re-probe duration — nothing to do
    if (!filter) {
      await unlinkAsync(tmpIn).catch(() => {});
      // Restore original: store the original asset's path and url as the "effect" version
      return res.json({ asset });
    }

    // Run FFmpeg with the effect filter, output as webm/opus for small file size
    const ffmpegCmd = `ffmpeg -y -i "${tmpIn}" -af "${filter}" -c:a libopus -b:a 96k "${tmpOut}"`;
    console.log(`[MovieReview Voice Transform] effect=${effect} cmd=${ffmpegCmd}`);
    await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
    await unlinkAsync(tmpIn).catch(() => {});

    const outBuffer = await readAsync(tmpOut);
    await unlinkAsync(tmpOut).catch(() => {});

    // Get duration of transformed audio
    let durationSeconds = asset.duration_seconds;
    try {
      const tmpProbe = join(tmpdir(), `mr-probe-${randomUUID()}.webm`);
      await writeAsync(tmpProbe, outBuffer);
      const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${tmpProbe}"`);
      await unlinkAsync(tmpProbe).catch(() => {});
      const info = JSON.parse(stdout);
      const stream = info.streams?.find(s => s.codec_type === 'audio');
      if (stream?.duration) durationSeconds = parseFloat(stream.duration);
    } catch (_) {}

    // Upload transformed file, replacing old one
    const newFileName = `${businessId}/${project.id}/voice-${Date.now()}.webm`;
    const { error: uploadErr } = await supabaseClient.storage
      .from(VOICE_BUCKET)
      .upload(newFileName, outBuffer, { contentType: 'audio/webm', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // Remove old file from storage
    await supabaseClient.storage.from(asset.storage_bucket).remove([asset.storage_path]).catch(() => {});

    const { data: { publicUrl } } = supabaseClient.storage.from(VOICE_BUCKET).getPublicUrl(newFileName);

    // Update asset row
    const { data: updatedAsset, error: updateErr } = await supabaseClient
      .from('movie_review_assets')
      .update({
        storage_path: newFileName,
        public_url: publicUrl,
        original_name: `voice-${effect}.webm`,
        duration_seconds: durationSeconds,
      })
      .eq('id', asset.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await supabaseClient
      .from('movie_review_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', project.id);

    console.log(`[MovieReview Voice Transform] effect=${effect} done, duration=${durationSeconds}s`);
    res.json({ asset: updatedAsset });
  } catch (err) {
    console.error('[MovieReview Voice Transform] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Voice TTS ─────────────────────────────────────────────────────────────

const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

router.post('/projects/:id/voice/tts', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'AI not configured' });
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { script_text, voice = 'nova' } = req.body;
    if (!script_text?.trim()) return res.status(400).json({ error: 'script_text is required' });
    if (!TTS_VOICES.includes(voice)) return res.status(400).json({ error: `Invalid voice. Valid: ${TTS_VOICES.join(', ')}` });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log(`[MovieReview TTS] Generating speech voice=${voice} chars=${script_text.length}`);

    // Generate TTS audio via OpenAI
    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: script_text.trim(),
      response_format: 'mp3',
      speed: 1.0,
    });

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    // Get duration via ffprobe
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { writeFile, unlink } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const execAsync = promisify(exec);
    const writeAsync = promisify(writeFile);
    const unlinkAsync = promisify(unlink);

    let durationSeconds = null;
    const tmpPath = join(tmpdir(), `mr-tts-${randomUUID()}.mp3`);
    try {
      await writeAsync(tmpPath, audioBuffer);
      const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${tmpPath}"`);
      const info = JSON.parse(stdout);
      const stream = info.streams?.find(s => s.codec_type === 'audio');
      if (stream?.duration) durationSeconds = parseFloat(stream.duration);
    } catch (_) {}
    await unlinkAsync(tmpPath).catch(() => {});

    // Delete old voice asset if exists
    if (project.voice_asset_id) {
      const { data: oldAsset } = await supabaseClient
        .from('movie_review_assets')
        .select('storage_bucket,storage_path')
        .eq('id', project.voice_asset_id)
        .single();
      if (oldAsset) {
        await supabaseClient.storage.from(oldAsset.storage_bucket).remove([oldAsset.storage_path]).catch(() => {});
        await supabaseClient.from('movie_review_assets').delete().eq('id', project.voice_asset_id);
      }
    }

    // Upload to Supabase Storage
    const fileName = `${businessId}/${project.id}/voice-tts-${Date.now()}.mp3`;
    const { error: uploadErr } = await supabaseClient.storage
      .from(VOICE_BUCKET)
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabaseClient.storage.from(VOICE_BUCKET).getPublicUrl(fileName);

    // Insert asset row
    const { data: asset, error: assetErr } = await supabaseClient
      .from('movie_review_assets')
      .insert({
        project_id: project.id,
        business_id: businessId,
        type: 'AUDIO_VOICE',
        storage_bucket: VOICE_BUCKET,
        storage_path: fileName,
        public_url: publicUrl,
        original_name: `ai-voice-${voice}.mp3`,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();
    if (assetErr) throw assetErr;

    // Link to project
    await supabaseClient
      .from('movie_review_projects')
      .update({ voice_asset_id: asset.id, updated_at: new Date().toISOString() })
      .eq('id', project.id);

    console.log(`[MovieReview TTS] Done voice=${voice} duration=${durationSeconds}s`);
    res.json({ asset });
  } catch (err) {
    console.error('[MovieReview TTS] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id/voice', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.voice_asset_id) return res.json({ success: true });

    const { data: asset } = await supabaseClient
      .from('movie_review_assets')
      .select('*')
      .eq('id', project.voice_asset_id)
      .single();
    if (asset) {
      await supabaseClient.storage.from(asset.storage_bucket).remove([asset.storage_path]);
      await supabaseClient.from('movie_review_assets').delete().eq('id', asset.id);
    }
    await supabaseClient
      .from('movie_review_projects')
      .update({ voice_asset_id: null, updated_at: new Date().toISOString() })
      .eq('id', project.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Images ───────────────────────────────────────────────────────────────────

router.post('/projects/:id/images', upload.array('images', 20), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });

    // Find current max order_index for this project's images
    const { data: existing } = await supabaseClient
      .from('movie_review_assets')
      .select('order_index')
      .eq('project_id', project.id)
      .eq('type', 'IMAGE')
      .order('order_index', { ascending: false })
      .limit(1);
    let nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

    const created = [];
    for (const file of req.files) {
      const ext = file.originalname.split('.').pop() || 'jpg';
      const fileName = `${businessId}/${project.id}/${randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabaseClient.storage
        .from(IMAGE_BUCKET)
        .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadErr) throw new Error(`Image upload failed: ${uploadErr.message}`);
      const { data: { publicUrl } } = supabaseClient.storage.from(IMAGE_BUCKET).getPublicUrl(fileName);
      const { data: asset } = await supabaseClient
        .from('movie_review_assets')
        .insert({
          business_id: businessId,
          project_id: project.id,
          type: 'IMAGE',
          storage_bucket: IMAGE_BUCKET,
          storage_path: fileName,
          public_url: publicUrl,
          original_name: file.originalname,
          order_index: nextOrder++,
        })
        .select()
        .single();
      created.push(asset);
    }

    res.json({ assets: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add TMDB poster as image asset
router.post('/projects/:id/images/tmdb', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { tmdb_movie_id, poster_url, title } = req.body;
    if (!poster_url) return res.status(400).json({ error: 'poster_url required' });

    const { data: existing } = await supabaseClient
      .from('movie_review_assets')
      .select('order_index')
      .eq('project_id', project.id)
      .eq('type', 'IMAGE')
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

    const { data: asset, error } = await supabaseClient
      .from('movie_review_assets')
      .insert({
        business_id: businessId,
        project_id: project.id,
        type: 'IMAGE',
        storage_bucket: 'tmdb',
        storage_path: `tmdb/${tmdb_movie_id || 0}`,
        public_url: poster_url,
        original_name: `${title || 'poster'}.jpg`,
        order_index: nextOrder,
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ asset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/assets/:assetId', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: asset } = await supabaseClient
      .from('movie_review_assets')
      .select('*')
      .eq('id', req.params.assetId)
      .eq('business_id', businessId)
      .single();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Remove from storage (not for tmdb bucket references)
    if (asset.storage_bucket !== 'tmdb') {
      await supabaseClient.storage.from(asset.storage_bucket).remove([asset.storage_path]);
    }
    await supabaseClient.from('movie_review_assets').delete().eq('id', asset.id);

    // If this was the project's voice asset, clear the reference
    if (asset.type === 'AUDIO_VOICE' && asset.project_id) {
      await supabaseClient
        .from('movie_review_projects')
        .update({ voice_asset_id: null, updated_at: new Date().toISOString() })
        .eq('id', asset.project_id)
        .eq('voice_asset_id', asset.id);
    }
    if (asset.type === 'AUDIO_MUSIC' && asset.project_id) {
      await supabaseClient
        .from('movie_review_projects')
        .update({ music_asset_id: null, updated_at: new Date().toISOString() })
        .eq('id', asset.project_id)
        .eq('music_asset_id', asset.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder images
router.put('/projects/:id/images/reorder', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { order } = req.body; // array of asset IDs in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of asset IDs' });

    for (let i = 0; i < order.length; i++) {
      await supabaseClient
        .from('movie_review_assets')
        .update({ order_index: i })
        .eq('id', order[i])
        .eq('business_id', businessId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TMDB Proxy ───────────────────────────────────────────────────────────────

router.get('/tmdb/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ results: [] });
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });

    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(q)}&include_adult=false&language=en-US&page=1`;
    const resp = await fetch(url);
    const data = await resp.json();

    const results = (data.results || []).slice(0, 8).map(m => ({
      id: m.id,
      title: m.title,
      year: m.release_date?.slice(0, 4) || '',
      poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      overview: m.overview,
    }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tmdb/movie/:tmdbId', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
    const url = `https://api.themoviedb.org/3/movie/${req.params.tmdbId}?api_key=${apiKey}&language=en-US`;
    const resp = await fetch(url);
    const m = await resp.json();
    res.json({
      id: m.id,
      title: m.title,
      year: m.release_date?.slice(0, 4) || '',
      poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
      overview: m.overview,
      genres: (m.genres || []).map(g => g.name),
      runtime: m.runtime,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Music ────────────────────────────────────────────────────────────────────

router.get('/music', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const tracks = [];

    // Own module music
    const { data: ownFiles } = await supabaseClient.storage
      .from(MUSIC_BUCKET_OWN)
      .list(businessId, { limit: 100 });
    if (ownFiles) {
      for (const f of ownFiles) {
        if (f.name && MUSIC_EXT.test(f.name)) {
          const path = `${businessId}/${f.name}`;
          const { data } = supabaseClient.storage.from(MUSIC_BUCKET_OWN).getPublicUrl(path);
          tracks.push({ id: `own:${path}`, name: f.name, bucket: MUSIC_BUCKET_OWN, path, url: data.publicUrl, source: 'own' });
        }
      }
    }

    // Shared orbix-network music — traverse businessId/channelId/file structure
    const { data: sharedFolders } = await supabaseClient.storage
      .from(MUSIC_BUCKET_SHARED)
      .list(businessId, { limit: 50 });
    if (sharedFolders) {
      for (const folder of sharedFolders) {
        if (!folder.name) continue;
        const prefix = `${businessId}/${folder.name}`;
        const { data: files } = await supabaseClient.storage
          .from(MUSIC_BUCKET_SHARED)
          .list(prefix, { limit: 100 });
        if (!files) continue;
        for (const f of files) {
          if (f.name && MUSIC_EXT.test(f.name)) {
            const path = `${prefix}/${f.name}`;
            const { data } = supabaseClient.storage.from(MUSIC_BUCKET_SHARED).getPublicUrl(path);
            tracks.push({ id: `shared:${path}`, name: f.name, bucket: MUSIC_BUCKET_SHARED, path, url: data.publicUrl, source: 'shared' });
          }
        }
      }
    }

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/music', upload.single('music'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!req.file) return res.status(400).json({ error: 'No music file uploaded' });
    const ext = req.file.originalname.split('.').pop() || 'mp3';
    const fileName = `${businessId}/${randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabaseClient.storage
      .from(MUSIC_BUCKET_OWN)
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: { publicUrl } } = supabaseClient.storage.from(MUSIC_BUCKET_OWN).getPublicUrl(fileName);
    res.json({ track: { id: `own:${fileName}`, name: req.file.originalname, bucket: MUSIC_BUCKET_OWN, path: fileName, url: publicUrl, source: 'own' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Timeline ─────────────────────────────────────────────────────────────────

router.get('/projects/:id/timeline', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { data, error } = await supabaseClient
      .from('movie_review_timeline_items')
      .select('*')
      .eq('project_id', project.id)
      .order('order_index');
    if (error) throw error;
    res.json({ timeline: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id/timeline', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { items } = req.body; // full array of timeline items
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    // Delete all existing and re-insert
    await supabaseClient.from('movie_review_timeline_items').delete().eq('project_id', project.id);

    if (items.length > 0) {
      const rows = items.map((item, i) => ({
        id: item.id || randomUUID(),
        project_id: project.id,
        type: item.type,
        asset_id: item.asset_id || null,
        text_content: item.text_content || null,
        start_time: item.start_time ?? 0,
        end_time: item.end_time ?? 5,
        position_preset: item.position_preset || 'CENTER',
        motion_preset: item.motion_preset || 'ZOOM_IN',
        order_index: i,
      }));
      const { error } = await supabaseClient.from('movie_review_timeline_items').insert(rows);
      if (error) throw error;
    }

    await supabaseClient
      .from('movie_review_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', project.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI — Metadata Generation ─────────────────────────────────────────────────

router.post('/projects/:id/ai/metadata', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'AI not configured' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const contentTypeLabel = {
      review: 'movie review',
      facts: 'movie facts',
      theory: 'movie theory',
      ranking: 'movie ranking',
      other: 'movie content',
    }[project.content_type] || 'movie content';

    const prompt = `You are helping a 12-year-old create a YouTube Short about ${project.movie_title}.
Content type: ${contentTypeLabel}
${project.notes_text ? `Their notes: ${project.notes_text}` : ''}

Generate the following for this YouTube Short (max 50 seconds, vertical format):
1. A hook (1-2 punchy sentences to grab attention in the first 2 seconds)
2. A tagline (short memorable line, max 10 words)
3. A YouTube title (max 60 characters, engaging and searchable)
4. A YouTube description (2-3 sentences, conversational, end with "Like and subscribe!")
5. 10 relevant hashtags (without the # symbol)

Respond ONLY with valid JSON in this exact format:
{
  "hook": "...",
  "tagline": "...",
  "yt_title": "...",
  "yt_description": "...",
  "yt_hashtags": ["...", "..."]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    // Save to project
    await supabaseClient
      .from('movie_review_projects')
      .update({
        hook_text: result.hook || null,
        tagline_text: result.tagline || null,
        yt_title: result.yt_title || null,
        yt_description: result.yt_description || null,
        yt_hashtags: result.yt_hashtags || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id);

    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI — Open Chat (fact check / Q&A) ───────────────────────────────────────

router.post('/ai/chat', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'AI not configured' });
    const { messages, movie_title } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const systemPrompt = `You are a friendly movie expert helping a 12-year-old create YouTube content about ${movie_title || 'movies'}. 
Keep your answers clear, fun, and accurate. If asked about facts, be honest about what you know and don't know.
Keep responses concise — under 150 words unless more detail is needed.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 400,
    });

    res.json({ message: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI — Polish Metadata (spell-check, capitalisation, grammar) ──────────────

router.post('/projects/:id/ai/polish', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'AI not configured' });
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { yt_title, yt_description, yt_hashtags } = req.body;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are a YouTube metadata editor. Fix spelling, grammar, and capitalisation in the fields below. Follow these rules:
- Titles: Title Case (capitalise every major word)
- Description: Proper sentence capitalisation and punctuation
- Hashtags: Each tag should start with # and be CamelCase (e.g. #MovieReview, #HorrorMovie). Remove spaces inside tags. Keep them relevant.
- Do NOT change the meaning, remove content, or rewrite creatively — only fix errors
- Return valid JSON only with keys: yt_title, yt_description, yt_hashtags (array of strings with # prefix)

Input:
Title: ${yt_title || ''}
Description: ${yt_description || ''}
Hashtags: ${Array.isArray(yt_hashtags) ? yt_hashtags.join(', ') : (yt_hashtags || '')}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content?.trim() || '{}';
    const polished = JSON.parse(raw);

    // Ensure hashtags have # prefix
    if (Array.isArray(polished.yt_hashtags)) {
      polished.yt_hashtags = polished.yt_hashtags.map(t =>
        t.startsWith('#') ? t : `#${t}`
      );
    }

    // Save polished values back to project
    const updates = {};
    if (polished.yt_title)       updates.yt_title = polished.yt_title;
    if (polished.yt_description) updates.yt_description = polished.yt_description;
    if (polished.yt_hashtags)    updates.yt_hashtags = polished.yt_hashtags;
    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      await supabaseClient.from('movie_review_projects').update(updates).eq('id', project.id);
    }

    console.log(`[MovieReview Polish] project=${project.id} polished metadata`);
    res.json({ yt_title: polished.yt_title, yt_description: polished.yt_description, yt_hashtags: polished.yt_hashtags });
  } catch (err) {
    console.error('[MovieReview Polish] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI — Script Generator ────────────────────────────────────────────────────

router.post('/projects/:id/ai/script', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'AI not configured' });
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { chat_messages } = req.body; // optional: recent fact-check chat history to incorporate
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const contentTypeLabel = {
      review: 'movie review', facts: 'movie facts video', theory: 'fan theory',
      ranking: 'movie ranking', other: 'movie video',
    }[project.content_type] || 'movie video';

    // Build context from notes and chat messages
    const notesContext = project.notes_text
      ? `\nTheir notes and talking points:\n${project.notes_text}`
      : '';

    const chatContext = Array.isArray(chat_messages) && chat_messages.length > 1
      ? `\nKey facts they researched in their fact-check chat:\n${
          chat_messages
            .filter(m => m.role === 'assistant')
            .slice(-6)
            .map(m => `- ${m.content}`)
            .join('\n')
        }`
      : '';

    const systemPrompt = `You are a YouTube Shorts script writer helping a 12-year-old creator make a ${contentTypeLabel} about "${project.movie_title}".

The script will be read aloud on camera by a kid. Write it so it sounds like a real kid talking — not a professional presenter.

Rules you MUST follow:
- Use simple, everyday words a 12-year-old would naturally say. No big vocabulary words.
- Keep every sentence SHORT — 8 words or fewer if possible. One idea per sentence.
- NEVER use actor names or director names. Instead say things like "the director", "the actor who played [character name]", "the guy who made it", "the actor who plays the villain", etc.
- NEVER use words that are hard to pronounce or spell.
- Be 30–50 seconds when read at a natural pace (roughly 80–120 words).
- Start with a punchy one-sentence hook that grabs attention instantly.
- Flow naturally — like the kid is talking to a friend, NOT reading an essay.
- End with a fun call to action ("Drop a comment!", "Like if you agree!", "Subscribe for more!", etc.)
- Be energetic and fun — short bursts of excitement, not long flowing sentences.

Return ONLY the script text. No labels, no stage directions, no "Script:" prefix. Just the exact words they speak.`;

    const userPrompt = `Write a YouTube Shorts script for a ${contentTypeLabel} about ${project.movie_title}.${notesContext}${chatContext}

Remember: simple words, short sentences, no real names of actors or directors — just describe them by their role or character. Ready to read aloud by a 12-year-old.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const scriptText = completion.choices[0].message.content?.trim() || '';

    // Save script to project
    await supabaseClient
      .from('movie_review_projects')
      .update({ script_text: scriptText, updated_at: new Date().toISOString() })
      .eq('id', project.id);

    res.json({ script_text: scriptText });
  } catch (err) {
    console.error('[MovieReview AI Script] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Render ───────────────────────────────────────────────────────────────────

router.post('/projects/:id/render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.voice_asset_id) {
      return res.status(400).json({ error: 'Record your voice first before rendering' });
    }

    // Create render record
    const { data: render, error: renderErr } = await supabaseClient
      .from('movie_review_renders')
      .insert({
        project_id: project.id,
        business_id: businessId,
        status: 'PENDING',
        progress: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (renderErr) throw renderErr;

    // Update project status
    await supabaseClient
      .from('movie_review_projects')
      .update({ status: 'RENDERING', updated_at: new Date().toISOString() })
      .eq('id', project.id);

    // Kick off async render (don't await)
    import('../../services/movie-review/renderer.js').then(({ renderMovieReviewShort }) => {
      renderMovieReviewShort(render.id, project.id, businessId).catch(err => {
        console.error('[MovieReview Render] Async render failed:', err.message);
      });
    }).catch(err => {
      console.error('[MovieReview Render] Import failed:', err.message);
    });

    res.json({ render_id: render.id, status: 'PENDING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id/render-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { data: render } = await supabaseClient
      .from('movie_review_renders')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      project_status: project.status,
      render: render || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── YouTube Upload ───────────────────────────────────────────────────────────

router.post('/projects/:id/upload', async (req, res) => {
  const projectId = req.params.id;
  const businessId = req.active_business_id;
  try {
    const project = await getProject(projectId, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.render_url) return res.status(400).json({ error: 'Render the video first' });

    await supabaseClient
      .from('movie_review_projects')
      .update({ status: 'UPLOADING', upload_error: null, updated_at: new Date().toISOString() })
      .eq('id', project.id);

    const { publishMovieReview } = await import('../../services/movie-review/publisher.js');
    await publishMovieReview(project, businessId);

    const updated = await getProject(projectId, businessId);
    res.json({ project: updated });
  } catch (err) {
    const updated = await getProject(projectId, businessId).catch(() => null);
    if (updated) res.json({ project: updated });
    else res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id/upload-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project, publish: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/cancel-upload', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const project = await getProject(req.params.id, businessId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== 'UPLOADING') {
      return res.status(400).json({ error: 'Project is not uploading' });
    }
    const { data, error } = await supabaseClient
      .from('movie_review_projects')
      .update({ status: 'DONE', upload_error: null, updated_at: new Date().toISOString() })
      .eq('id', project.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
