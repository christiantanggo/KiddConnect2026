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
          shock_score: 55
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
 * Check if item already exists (deduplication). Scoped by channel when channel_id present.
 */
export async function deduplicateItem(businessId, url, hash, channelId = null) {
  try {
    let query = supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('business_id', businessId)
      .or(`url.eq.${url},hash.eq.${hash}`);
    if (channelId) {
      query = query.eq('channel_id', channelId);
    }
    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return !!data;
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

    const isDuplicate = await deduplicateItem(businessId, item.url, hash, channelId);
    if (isDuplicate) {
      if (Math.random() < 0.1) {
        console.log(`[Orbix Scraper] Skipping duplicate: ${item.title.substring(0, 60)}...`);
      }
      return null;
    }

    const isEvergreen = item.content_type === 'psychology' || item.category === 'psychology' ||
      item.content_type === 'money' || item.category === 'money';
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
    if (isEvergreen && item.category && item.shock_score != null) {
      insertPayload.category = item.category;
      insertPayload.shock_score = item.shock_score;
      insertPayload.factors_json = item.factors_json || { source: item.category === 'money' ? 'wikipedia_money' : 'wikipedia_psychology' };
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
    const { data: sources, error } = await query;

    if (error) throw error;
    
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

