/**
 * Orbix Network Scraper Service
 * Scrapes news from RSS feeds and HTML sources
 */

import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const RSS_PARSER = new Parser({
  timeout: 10000,
  maxRedirects: 5
});

/**
 * Scrape a single source (RSS or HTML)
 * @param {Object} source - Source object from database
 * @returns {Promise<Array>} Array of scraped items
 */
export async function scrapeSource(source) {
  try {
    console.log(`[Orbix Scraper] Scraping source: ${source.name} (${source.type})`);
    
    if (source.type === 'RSS') {
      return await scrapeRSSSource(source);
    } else if (source.type === 'HTML') {
      return await scrapeHTMLSource(source);
    } else if (source.type === 'WIKIPEDIA') {
      return await scrapeWikipediaSource(source);
    } else if (source.type === 'TRIVIA_GENERATOR') {
      return await scrapeTriviaSource(source);
    } else if (source.type === 'WIKIDATA_FACTS') {
      return await scrapeFactsSource(source);
    } else if (source.type === 'RIDDLE_GENERATOR') {
      return await scrapeRiddleSource(source);
    } else if (source.type === 'MIND_TEASER_GENERATOR') {
      return await scrapeMindTeaserSource(source);
    } else if (source.type === 'DAD_JOKE_GENERATOR') {
      return await scrapeDadJokeSource(source);
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }
  } catch (error) {
    console.error(`[Orbix Scraper] Error scraping source ${source.name}:`, error.message);
    throw error;
  }
}

/**
 * Scrape RSS feed
 */
async function scrapeRSSSource(source) {
  try {
    console.log(`[Orbix Scraper] Fetching RSS feed: ${source.url}`);
    const feed = await RSS_PARSER.parseURL(source.url);
    const items = [];
    
    console.log(`[Orbix Scraper] RSS feed ${source.name}: Feed has ${feed.items?.length || 0} items available`);
    
    // Process all items from the feed (RSS feeds typically return 10-50 most recent items)
    for (const item of feed.items || []) {
      // Extract first paragraph as snippet
      const snippet = extractSnippet(item.contentSnippet || item.content || item.description || '');
      
      items.push({
        url: item.link || '',
        title: item.title || 'Untitled',
        snippet: snippet,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        source_id: source.id
      });
    }
    
    console.log(`[Orbix Scraper] RSS feed ${source.name}: Processed ${items.length} items from feed`);
    return items;
  } catch (error) {
    console.error(`[Orbix Scraper] RSS parsing error for ${source.url}:`, error.message);
    console.error(`[Orbix Scraper] Error details:`, error);
    throw error;
  }
}

/**
 * Scrape HTML source (headlines + first paragraph)
 */
async function scrapeHTMLSource(source) {
  try {
    const response = await axios.get(source.url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OrbixNetworkBot/1.0)'
      }
    });
    
    const $ = cheerio.load(response.data);
    const items = [];
    
    // Try common article selectors
    const articleSelectors = [
      'article',
      '.article',
      '.post',
      '.story',
      '[role="article"]'
    ];
    
    $(articleSelectors.join(', ')).each((i, elem) => {
      if (i >= 10) return false; // Limit to first 10 articles
      
      const $elem = $(elem);
      const title = $elem.find('h1, h2, h3, .title, .headline').first().text().trim();
      const link = $elem.find('a').first().attr('href');
      const snippet = extractSnippet($elem.text());
      
      if (title && link) {
        // Resolve relative URLs
        const absoluteUrl = new URL(link, source.url).href;
        
        items.push({
          url: absoluteUrl,
          title: title,
          snippet: snippet,
          published_at: new Date().toISOString(), // HTML scraping doesn't always have dates
          source_id: source.id
        });
      }
    });
    
    console.log(`[Orbix Scraper] HTML source ${source.name}: ${items.length} items`);
    return items;
  } catch (error) {
    console.error(`[Orbix Scraper] HTML scraping error for ${source.url}:`, error.message);
    throw error;
  }
}

const WIKI_PSYCHOLOGY_CATEGORIES = [
  'Category:Cognitive_biases',
  'Category:Social_psychology',
  'Category:Heuristics',
  'Category:Memory_biases'
];
const WIKI_MONEY_CATEGORIES = [
  'Category:Behavioral_economics',
  'Category:Personal_finance',
  'Category:Investing',
  'Category:Financial_psychology',
  'Category:Economic_concepts'
];
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const WIKI_MIN_SUMMARY_CHARS = 200;

/**
 * Fetch page titles from a Wikipedia category
 */
async function fetchWikiCategoryTitles(cmtitle, limit = 200) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle,
    cmlimit: String(limit),
    format: 'json',
    origin: '*'
  });
  const { data } = await axios.get(`${WIKI_API}?${params}`, {
    timeout: 15000,
    headers: { 'User-Agent': 'OrbixNetworkBot/1.0 (Psychology content)' }
  });
  const pages = data?.query?.categorymembers || [];
  return pages
    .filter((p) => p.ns === 0 && p.title && !p.title.startsWith('List of'))
    .map((p) => p.title);
}

/**
 * Fetch summary for a Wikipedia page; returns { title, extract, url } or null if skip
 */
async function fetchWikiSummary(title) {
  try {
    const encoded = encodeURIComponent(title);
    const { data } = await axios.get(`${WIKI_REST_SUMMARY}/${encoded}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'OrbixNetworkBot/1.0 (Psychology content)' }
    });
    if (data.type === 'disambiguation') return null;
    const extract = data.extract || data.description || '';
    if (extract.length < WIKI_MIN_SUMMARY_CHARS) return null;
    const url = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded.replace(/%2F/g, '_')}`;
    return { title: data.title || title, snippet: extract, url };
  } catch (err) {
    return null;
  }
}

/**
 * Scrape Wikipedia categories: psychology or money branch by source.category_hint.
 * Returns raw-item-shaped objects with content_type/category and default shock_score.
 */
async function scrapeWikipediaSource(source) {
  try {
    const isMoney = (source.category_hint || '').toLowerCase() === 'money';
    const defaultCategories = isMoney ? WIKI_MONEY_CATEGORIES : WIKI_PSYCHOLOGY_CATEGORIES;
    const branch = isMoney ? 'money' : 'psychology';

    const urlTrim = (source.url || '').trim();
    const categoryList = (urlTrim && urlTrim.includes('Category:'))
      ? urlTrim.split(',').map((s) => s.trim()).filter(Boolean)
      : defaultCategories;
    const allTitles = new Set();
    for (const cmtitle of categoryList.slice(0, 6)) {
      const titles = await fetchWikiCategoryTitles(cmtitle, 150);
      titles.forEach((t) => allTitles.add(t));
    }
    const titles = Array.from(allTitles).slice(0, 80);
    console.log(`[Orbix Scraper] Wikipedia ${source.name} (${branch}): ${titles.length} topic titles`);
    const items = [];
    for (const title of titles) {
      const summary = await fetchWikiSummary(title);
      if (summary) {
        items.push({
          source_id: source.id,
          title: summary.title,
          snippet: summary.snippet,
          url: summary.url,
          published_at: new Date().toISOString(),
          content_type: branch,
          category: branch,
          shock_score: 70
        });
      }
      if (items.length >= 50) break;
    }
    console.log(`[Orbix Scraper] Wikipedia ${source.name}: ${items.length} items with summaries`);
    return items;
  } catch (error) {
    console.error(`[Orbix Scraper] Wikipedia scraping error:`, error.message);
    throw error;
  }
}

/**
 * Generate trivia via LLM (TRIVIA_GENERATOR source type).
 * Returns raw-item-shaped objects with content_fingerprint for dedup.
 */
async function scrapeTriviaSource(source) {
  try {
    const { generateAndValidateTrivia } = await import('./trivia-generator.js');
    const businessId = source.business_id;
    const channelId = source.channel_id;
    if (!businessId || !channelId) {
      console.warn('[Orbix Scraper] Trivia source missing business_id or channel_id');
      return [];
    }
    // Get next episode number from existing trivia for this channel
    const { count } = await supabaseClient
      .from('orbix_raw_items')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'trivia');
    const episodeNumber = (count || 0) + 1;
    const trivia = await generateAndValidateTrivia(businessId, channelId, { episodeNumber });
    if (!trivia) {
      console.log('[Orbix Scraper] Trivia generator produced no valid question');
      return [];
    }
    const title = `Trivia #${String(episodeNumber).padStart(2, '0')} - ${trivia.category}`;
    const url = `trivia://${trivia.content_fingerprint}`;
    const snippet = JSON.stringify({
      hook: trivia.hook,
      category: trivia.category,
      _bucket: trivia._bucket || null, // bucket key (GEOGRAPHY, WORLD_EVENTS, etc.) — used for mix-model history
      topic: trivia.topic || null,
      question: trivia.question,
      option_a: trivia.option_a,
      option_b: trivia.option_b,
      option_c: trivia.option_c,
      correct_answer: trivia.correct_answer,
      voice_script: trivia.voice_script,
      episode_number: trivia.episode_number
    });
    return [{
      source_id: source.id,
      channel_id: channelId,
      title,
      snippet,
      url,
      published_at: new Date().toISOString(),
      content_type: 'trivia',
      category: 'trivia',
      shock_score: 70,
      content_fingerprint: trivia.content_fingerprint,
      factors_json: { source: 'trivia_generator' }
    }];
  } catch (error) {
    console.error('[Orbix Scraper] Trivia source error:', error.message);
    throw error;
  }
}

/**
 * Scrape one fact from Wikidata (WIKIDATA_FACTS source type).
 * Returns raw-item-shaped objects with content_fingerprint for dedup.
 */
async function scrapeFactsSource(source) {
  try {
    const { fetchOneFact } = await import('./wikidata-facts.js');
    const businessId = source.business_id;
    const channelId = source.channel_id;
    if (!businessId || !channelId) {
      console.warn('[Orbix Scraper] Facts source missing business_id or channel_id');
      return [];
    }
    const fact = await fetchOneFact(source);
    if (!fact) {
      console.log('[Orbix Scraper] Facts source produced no fact');
      return [];
    }
    const title = fact.title || `Fact: ${fact.fact_text?.slice(0, 50) || 'Wikidata'}`;
    const url = `facts://${fact.entity_id}`;
    const snippet = JSON.stringify({
      title: fact.title,
      fact_text: fact.fact_text,
      tts_script: fact.tts_script,
      entity_id: fact.entity_id,
      property_id: fact.property_id
    });
    return [{
      source_id: source.id,
      channel_id: channelId,
      title,
      snippet,
      url,
      published_at: new Date().toISOString(),
      content_type: 'facts',
      category: 'facts',
      shock_score: 70,
      content_fingerprint: fact.content_fingerprint,
      factors_json: { source: 'wikidata_facts' }
    }];
  } catch (error) {
    console.error('[Orbix Scraper] Facts source error:', error.message);
    throw error;
  }
}

/**
 * Generate one riddle via the Riddle Generator (RIDDLE_GENERATOR source type).
 * Returns raw-item-shaped objects with content_fingerprint for dedup.
 */
async function scrapeRiddleSource(source) {
  try {
    const { generateAndValidateRiddle } = await import('./riddle-generator.js');
    const businessId = source.business_id;
    const channelId = source.channel_id;
    if (!businessId || !channelId) {
      console.warn('[Orbix Scraper] Riddle source missing business_id or channel_id');
      return [];
    }
    // Episode number from existing riddles for this channel
    const { count } = await supabaseClient
      .from('orbix_raw_items')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'riddle');
    const episodeNumber = (count || 0) + 1;
    const riddle = await generateAndValidateRiddle(businessId, channelId, { episodeNumber });
    if (!riddle) {
      console.log('[Orbix Scraper] Riddle generator produced no valid riddle');
      return [];
    }
    const title = `Riddle #${String(episodeNumber).padStart(2, '0')} - ${riddle.category}`;
    const url = `riddle://${riddle.content_fingerprint}`;
    const snippet = JSON.stringify({
      hook: riddle.hook,
      category: riddle.category,
      _category: riddle._category || null,
      riddle_text: riddle.riddle_text,
      answer_text: riddle.answer_text,
      voice_script: riddle.voice_script,
      episode_number: riddle.episode_number
    });
    return [{
      source_id: source.id,
      channel_id: channelId,
      title,
      snippet,
      url,
      published_at: new Date().toISOString(),
      content_type: 'riddle',
      category: 'riddle',
      shock_score: 70,
      content_fingerprint: riddle.content_fingerprint,
      factors_json: { source: 'riddle_generator' }
    }];
  } catch (error) {
    console.error('[Orbix Scraper] Riddle source error:', error.message);
    throw error;
  }
}

/**
 * Generate one mind teaser via Mind Teaser Generator (MIND_TEASER_GENERATOR source type).
 * Returns raw-item-shaped objects with content_fingerprint for dedup.
 */
async function scrapeMindTeaserSource(source) {
  try {
    const { generateAndValidateMindTeaser } = await import('./mindteaser-generator.js');
    const businessId = source.business_id;
    const channelId = source.channel_id;
    if (!businessId || !channelId) {
      console.warn('[Orbix Scraper] Mind teaser source missing business_id or channel_id');
      return [];
    }
    const { count } = await supabaseClient
      .from('orbix_raw_items')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'mindteaser');
    const episodeNumber = (count || 0) + 1;
    const teaser = await generateAndValidateMindTeaser(businessId, channelId, { episodeNumber });
    if (!teaser) {
      console.log('[Orbix Scraper] Mind teaser generator produced no valid puzzle');
      return [];
    }
    const title = `Mind Teaser #${String(episodeNumber).padStart(2, '0')} - ${teaser.type}`;
    const url = `mindteaser://${teaser.content_fingerprint}`;
    const snippet = JSON.stringify({
      hook: teaser.hook,
      type: teaser.type,
      family: teaser.family,
      question: teaser.question,
      answer: teaser.answer,
      difficulty: teaser.difficulty,
      voice_script: teaser.voice_script,
      episode_number: teaser.episode_number
    });
    return [{
      source_id: source.id,
      channel_id: channelId,
      title,
      snippet,
      url,
      published_at: new Date().toISOString(),
      content_type: 'mindteaser',
      category: 'mindteaser',
      shock_score: 70,
      content_fingerprint: teaser.content_fingerprint,
      factors_json: { source: 'mindteaser_generator' }
    }];
  } catch (error) {
    console.error('[Orbix Scraper] Mind teaser source error:', error.message);
    throw error;
  }
}

/**
 * Generate one dad joke via Dad Joke Generator (DAD_JOKE_GENERATOR source type).
 * Returns raw-item-shaped objects with content_fingerprint for dedup.
 */
async function scrapeDadJokeSource(source) {
  try {
    const { generateAndValidateDadJoke } = await import('./dad-joke-generator.js');
    const businessId = source.business_id;
    const channelId = source.channel_id;
    if (!businessId || !channelId) {
      console.warn('[Orbix Scraper] Dad joke source missing business_id or channel_id');
      return [];
    }
    const { count } = await supabaseClient
      .from('orbix_raw_items')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'dadjoke');
    const episodeNumber = (count || 0) + 1;
    const joke = await generateAndValidateDadJoke(businessId, channelId, { episodeNumber });
    if (!joke) {
      console.log('[Orbix Scraper] Dad joke generator produced no valid joke');
      return [];
    }
    const title = `Dad Joke #${String(episodeNumber).padStart(2, '0')}`;
    const url = `dadjoke://${joke.content_fingerprint}`;
    const snippet = JSON.stringify({
      hook: joke.hook,
      setup: joke.setup,
      punchline: joke.punchline,
      voice_script: joke.voice_script,
      episode_number: joke.episode_number
    });
    return [{
      source_id: source.id,
      channel_id: channelId,
      title,
      snippet,
      url,
      published_at: new Date().toISOString(),
      content_type: 'dadjoke',
      category: 'dadjoke',
      shock_score: 70,
      content_fingerprint: joke.content_fingerprint,
      factors_json: { source: 'dad_joke_generator' }
    }];
  } catch (error) {
    console.error('[Orbix Scraper] Dad joke source error:', error.message);
    throw error;
  }
}

/**
 * Extract first paragraph/snippet from text
 */
function extractSnippet(text) {
  if (!text) return '';
  
  // Remove HTML tags if present
  const cleanText = text.replace(/<[^>]*>/g, ' ').trim();
  
  // Get first 200 characters
  const snippet = cleanText.substring(0, 200).trim();
  
  // Try to end at sentence boundary
  const lastPeriod = snippet.lastIndexOf('.');
  if (lastPeriod > 100) {
    return snippet.substring(0, lastPeriod + 1);
  }
  
  return snippet || '';
}

/**
 * Generate hash for deduplication
 */
export function generateHash(url, title) {
  const content = `${url}|${title}`.toLowerCase();
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if item already exists (deduplication).
 * DB unique constraint is (business_id, url), so we check by URL first regardless of channel.
 * For trivia: also check content_fingerprint scoped by channel (catches semantic duplicates).
 */
export async function deduplicateItem(businessId, url, hash, channelId = null, contentFingerprint = null) {
  try {
    // Match DB unique constraint: same URL for same business is always a duplicate
    const { data: byUrl, error: urlError } = await supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('business_id', businessId)
      .eq('url', url)
      .maybeSingle();

    if (urlError) throw urlError;
    if (byUrl) return true;

    // For trivia: check content_fingerprint (catches same Q+A with different URL due to wording)
    if (contentFingerprint && channelId) {
      const { data: byFingerprint, error: fpError } = await supabaseClient
        .from('orbix_raw_items')
        .select('id')
        .eq('business_id', businessId)
        .eq('channel_id', channelId)
        .eq('content_fingerprint', contentFingerprint)
        .maybeSingle();
      if (!fpError && byFingerprint) return true;
    }

    // Also check by hash (same content, different URL) scoped by channel when provided
    let hashQuery = supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('business_id', businessId)
      .eq('hash', hash);
    if (channelId != null) {
      hashQuery = hashQuery.eq('channel_id', channelId);
    }
    const { data: byHash, error: hashError } = await hashQuery.maybeSingle();

    if (hashError) throw hashError;
    return !!byHash;
  } catch (error) {
    console.error('[Orbix Scraper] Deduplication check error:', error);
    return false;
  }
}

/**
 * Save raw item to database. item.channel_id from source is used when present.
 */
export async function saveRawItem(businessId, item) {
  try {
    const hash = generateHash(item.url, item.title);
    const channelId = item.channel_id ?? null;
    const contentFingerprint = item.content_fingerprint ?? null;

    const isDuplicate = await deduplicateItem(businessId, item.url, hash, channelId, contentFingerprint);
    if (isDuplicate) {
      if (Math.random() < 0.1) {
        console.log(`[Orbix Scraper] Skipping duplicate: ${item.title.substring(0, 60)}...`);
      }
      return null;
    }

    const isEvergreen = item.content_type === 'psychology' || item.category === 'psychology' ||
      item.content_type === 'money' || item.category === 'money' ||
      item.content_type === 'trivia' || item.category === 'trivia' ||
      item.content_type === 'facts' || item.category === 'facts' ||
      item.content_type === 'riddle' || item.category === 'riddle' ||
      item.content_type === 'mindteaser' || item.category === 'mindteaser' ||
      item.content_type === 'dadjoke' || item.category === 'dadjoke';
    const insertPayload = {
      business_id: businessId,
      channel_id: channelId,
      source_id: item.source_id,
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      published_at: item.published_at,
      hash: hash,
      status: 'NEW'
    };
    if (item.content_fingerprint) {
      insertPayload.content_fingerprint = item.content_fingerprint;
    }
    if (isEvergreen && item.category && (item.shock_score != null || item.category === 'dadjoke')) {
      insertPayload.category = item.category;
      insertPayload.shock_score = item.shock_score ?? (item.category === 'dadjoke' ? 70 : null);
      insertPayload.factors_json = item.factors_json || (
        item.category === 'trivia' ? { source: 'trivia_generator' } :
        item.category === 'facts' ? { source: 'wikidata_facts' } :
        item.category === 'riddle' ? { source: 'riddle_generator' } :
        item.category === 'mindteaser' ? { source: 'mindteaser_generator' } :
        item.category === 'dadjoke' ? { source: 'dad_joke_generator' } :
        item.category === 'money' ? { source: 'wikipedia_money' } : { source: 'wikipedia_psychology' }
      );
    }
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Orbix Scraper] Saved raw item: ${item.title}`);

    if (!isEvergreen) {
      // Calculate shock score asynchronously for news (don't block scraping)
      (async () => {
        try {
          const { classifyStory, scoreShock } = await import('./classifier.js');
          const category = await classifyStory({
            title: item.title,
            snippet: item.snippet,
            url: item.url
          });
          if (category && category !== 'REJECT') {
            const scoreResult = await scoreShock({
              category,
              title: item.title,
              snippet: item.snippet,
              url: item.url
            });
            await supabaseClient
              .from('orbix_raw_items')
              .update({
                category: category,
                shock_score: scoreResult.score,
                factors_json: scoreResult.factors
              })
              .eq('id', data.id);
            console.log(`[Orbix Scraper] Scored item: ${item.title.substring(0, 50)}... - Category: ${category}, Score: ${scoreResult.score}`);
          } else {
            console.log(`[Orbix Scraper] Item rejected by classifier: ${item.title.substring(0, 50)}...`);
          }
        } catch (scoringError) {
          console.error(`[Orbix Scraper] Error calculating shock score for "${item.title}":`, scoringError.message);
        }
      })().catch(err => {
        console.error(`[Orbix Scraper] Background scoring error for "${item.title}":`, err.message);
      });
    }

    return data;
  } catch (error) {
    // Unique constraint (business_id, url) - treat as duplicate and skip
    if (error?.code === '23505') {
      if (Math.random() < 0.1) {
        console.log(`[Orbix Scraper] Skipping duplicate (race): ${item.title.substring(0, 50)}...`);
      }
      return null;
    }
    console.error('[Orbix Scraper] Error saving raw item:', error);
    throw error;
  }
}

/**
 * Scrape all enabled sources for a business, optionally limited to one channel.
 * @param {string} businessId
 * @param {string|null} [channelId] - If set, only scrape sources for this channel.
 */
export async function scrapeAllSources(businessId, channelId = null) {
  try {
    let query = supabaseClient
      .from('orbix_sources')
      .select('*')
      .eq('business_id', businessId)
      .eq('enabled', true);
    if (channelId) {
      query = query.eq('channel_id', channelId);
    }
    const { data: rawSources, error } = await query;

    if (error) throw error;

    // When scraping a specific channel, use its sources as-is (user explicitly asked to scrape that channel).
    // When scraping all (no channelId), skip sources in disabled channels (orbix_channels.enabled = false).
    let sources;
    if (channelId) {
      sources = rawSources || [];
    } else {
      const { data: enabledChannels } = await supabaseClient
        .from('orbix_channels')
        .select('id')
        .eq('business_id', businessId)
        .or('enabled.eq.true,enabled.is.null');
      const enabledChannelIds = new Set((enabledChannels || []).map(c => c.id));
      sources = (rawSources || []).filter(
        s => s.channel_id == null || enabledChannelIds.has(s.channel_id)
      );
    }
    
    console.log(`[Orbix Scraper] ========== SCRAPING START ==========`);
    console.log(`[Orbix Scraper] Business ID: ${businessId}`);
    console.log(`[Orbix Scraper] Enabled sources found: ${sources?.length || 0}`);
    
    if (!sources || sources.length === 0) {
      console.log(`[Orbix Scraper] ⚠️  No enabled sources for business ${businessId}`);
      console.log(`[Orbix Scraper] Please add and enable sources in the dashboard`);
      return { scraped: 0, saved: 0, sources_processed: 0 };
    }
    
    // Log source details
    sources.forEach((source, index) => {
      console.log(`[Orbix Scraper] Source ${index + 1}: ${source.name} (${source.type}) - ${source.url}`);
    });
    
    let totalScraped = 0;
    let totalSaved = 0;
    
    for (const source of sources) {
      try {
        console.log(`[Orbix Scraper] Processing source: ${source.name} (${source.type}) - ${source.url}`);
        const items = await scrapeSource(source);
        console.log(`[Orbix Scraper] Source ${source.name}: Found ${items.length} items from feed`);
        totalScraped += items.length;
        
        // Save each item
        let savedCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        
        for (const item of items) {
          try {
            item.channel_id = source.channel_id ?? null;
            const saved = await saveRawItem(businessId, item);
            if (saved) {
              totalSaved++;
              savedCount++;
            } else {
              duplicateCount++;
            }
          } catch (saveError) {
            errorCount++;
            console.error(`[Orbix Scraper] Error saving item from ${source.name}:`, saveError.message);
            // Continue with next item
          }
        }
        
        console.log(`[Orbix Scraper] Source ${source.name} Summary:`);
        console.log(`[Orbix Scraper]   - Found: ${items.length} items`);
        console.log(`[Orbix Scraper]   - Saved: ${savedCount} new items`);
        console.log(`[Orbix Scraper]   - Duplicates skipped: ${duplicateCount}`);
        if (errorCount > 0) {
          console.log(`[Orbix Scraper]   - Errors: ${errorCount}`);
        }
        
        // Update last_fetched_at
        await supabaseClient
          .from('orbix_sources')
          .update({ last_fetched_at: new Date().toISOString() })
          .eq('id', source.id);
        
      } catch (sourceError) {
        console.error(`[Orbix Scraper] ❌ Error scraping source ${source.name} (${source.url}):`, sourceError.message);
        console.error(`[Orbix Scraper] Error stack:`, sourceError.stack);
        // Continue with next source
      }
    }
    
    console.log(`[Orbix Scraper] ========== SCRAPE JOB SUMMARY ==========`);
    console.log(`[Orbix Scraper] Business ${businessId}:`);
    console.log(`[Orbix Scraper]   - Total items found: ${totalScraped}`);
    console.log(`[Orbix Scraper]   - New items saved: ${totalSaved}`);
    console.log(`[Orbix Scraper]   - Duplicates skipped: ${totalScraped - totalSaved}`);
    console.log(`[Orbix Scraper] =========================================`);
    
    return { 
      scraped: totalScraped, 
      saved: totalSaved,
      duplicates_skipped: totalScraped - totalSaved,
      sources_processed: sources.length
    };
  } catch (error) {
    console.error('[Orbix Scraper] Error scraping all sources:', error);
    throw error;
  }
}

