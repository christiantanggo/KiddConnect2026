/**
 * Dad Joke Studio — resolve background + music URLs from module assets only (no Orbix library).
 */

const BG_TYPES = ['background', 'image'];
const MUSIC_TYPES = ['music'];

export function isAssetEligibleForRender(asset, contentType, formatKey) {
  if (!asset || asset.deleted_at || asset.enabled === false) return false;
  const scope = asset.usage_scope || 'global';
  if (scope === 'global') return true;
  if (scope === 'shorts') return contentType === 'shorts';
  if (scope === 'long_form') return contentType === 'long_form';
  if (scope === 'formats') {
    let keys = asset.format_keys;
    if (typeof keys === 'string') {
      try {
        keys = JSON.parse(keys);
      } catch {
        keys = [];
      }
    }
    if (!Array.isArray(keys)) keys = [];
    return keys.includes(formatKey);
  }
  return false;
}

function publicUrlForRow(supabaseClient, bucket, row) {
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(row.storage_path);
  return data?.publicUrl || null;
}

/**
 * Stable pick so dashboard preview and FFmpeg render use the same background/music
 * when the user leaves “Random” selected (matches frontend deterministicAssetIndex).
 */
function pickDeterministicByContentId(rows, contentId) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const s = String(contentId ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return sorted[h % sorted.length];
}

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {string} opts.assetsBucket
 * @param {string} opts.businessId
 * @param {object} opts.content - dadjoke_studio_generated_content row
 * @returns {Promise<{ background_public_url: string, music_public_url: string|null, background_asset_id: string|null, music_asset_id: string|null }>}
 */
export async function resolveDadJokeStudioRenderMedia(opts) {
  const { supabaseClient, assetsBucket, businessId, content } = opts;
  const contentType = content.content_type;
  const formatKey = content.format_key;
  const snap = content.asset_snapshot && typeof content.asset_snapshot === 'object' ? content.asset_snapshot : {};

  const { data: allAssets, error } = await supabaseClient
    .from('dadjoke_studio_assets')
    .select('*')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .eq('enabled', true);

  if (error) throw error;
  const assets = allAssets || [];

  const eligibleBg = assets.filter(
    (a) => BG_TYPES.includes(a.asset_type) && isAssetEligibleForRender(a, contentType, formatKey)
  );
  const eligibleMusic = assets.filter(
    (a) => MUSIC_TYPES.includes(a.asset_type) && isAssetEligibleForRender(a, contentType, formatKey)
  );

  let background_public_url = null;
  let background_asset_id = null;
  const bgPick = snap.background_asset_id || null;

  if (bgPick) {
    const row = assets.find((a) => a.id === bgPick);
    if (!row) throw new Error('Selected background asset was not found. Pick another or upload a new image.');
    if (!BG_TYPES.includes(row.asset_type)) {
      throw new Error('That asset cannot be used as a video background (use image or background type).');
    }
    if (!isAssetEligibleForRender(row, contentType, formatKey)) {
      throw new Error('That background is not scoped for this video type/format. Change the asset scope or pick another.');
    }
    background_public_url = publicUrlForRow(supabaseClient, assetsBucket, row);
    background_asset_id = row.id;
  } else if (snap.background_public_url && String(snap.background_public_url).trim()) {
    background_public_url = String(snap.background_public_url).trim();
  } else {
    const row = pickDeterministicByContentId(eligibleBg, content.id);
    if (!row) {
      throw new Error(
        'No Dad Joke Studio background is available for this format. Upload an image/background asset with scope Global, matching Shorts/Long form, or this format — then render again.'
      );
    }
    background_public_url = publicUrlForRow(supabaseClient, assetsBucket, row);
    background_asset_id = row.id;
  }

  if (!background_public_url) {
    throw new Error('Could not resolve a background image URL from Dad Joke Studio assets.');
  }

  let music_public_url = null;
  let music_asset_id = null;
  const muPick = snap.music_asset_id || null;

  if (muPick) {
    const row = assets.find((a) => a.id === muPick);
    if (!row) throw new Error('Selected music asset was not found.');
    if (!MUSIC_TYPES.includes(row.asset_type)) {
      throw new Error('That asset is not an audio/music file.');
    }
    if (!isAssetEligibleForRender(row, contentType, formatKey)) {
      throw new Error('That music track is not scoped for this video type/format.');
    }
    music_public_url = publicUrlForRow(supabaseClient, assetsBucket, row);
    music_asset_id = row.id;
  } else {
    const row = pickDeterministicByContentId(eligibleMusic, content.id);
    if (row) {
      music_public_url = publicUrlForRow(supabaseClient, assetsBucket, row);
      music_asset_id = row.id;
    }
  }

  return {
    background_public_url,
    music_public_url,
    background_asset_id,
    music_asset_id,
  };
}
