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
    const feed = await RSS_PARSER.parseURL(source.url);
    const items = [];
    
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
    
    console.log(`[Orbix Scraper] RSS feed ${source.name}: ${items.length} items`);
    return items;
  } catch (error) {
    console.error(`[Orbix Scraper] RSS parsing error for ${source.url}:`, error.message);
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
 * Check if item already exists (deduplication)
 */
export async function deduplicateItem(businessId, url, hash) {
  try {
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('business_id', businessId)
      .or(`url.eq.${url},hash.eq.${hash}`)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }
    
    return !!data; // Returns true if item exists
  } catch (error) {
    console.error('[Orbix Scraper] Deduplication check error:', error);
    return false; // On error, assume not duplicate (better to process than skip)
  }
}

/**
 * Save raw item to database
 */
export async function saveRawItem(businessId, item) {
  try {
    const hash = generateHash(item.url, item.title);
    
    // Check for duplicates
    const isDuplicate = await deduplicateItem(businessId, item.url, hash);
    if (isDuplicate) {
      console.log(`[Orbix Scraper] Skipping duplicate: ${item.title}`);
      return null;
    }
    
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .insert({
        business_id: businessId,
        source_id: item.source_id,
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        published_at: item.published_at,
        hash: hash,
        status: 'NEW'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`[Orbix Scraper] Saved raw item: ${item.title}`);
    return data;
  } catch (error) {
    console.error('[Orbix Scraper] Error saving raw item:', error);
    throw error;
  }
}

/**
 * Scrape all enabled sources for a business
 */
export async function scrapeAllSources(businessId) {
  try {
    // Get all enabled sources for this business
    const { data: sources, error } = await supabaseClient
      .from('orbix_sources')
      .select('*')
      .eq('business_id', businessId)
      .eq('enabled', true);
    
    if (error) throw error;
    
    if (!sources || sources.length === 0) {
      console.log(`[Orbix Scraper] No enabled sources for business ${businessId}`);
      return { scraped: 0, saved: 0 };
    }
    
    let totalScraped = 0;
    let totalSaved = 0;
    
    for (const source of sources) {
      try {
        console.log(`[Orbix Scraper] Processing source: ${source.name} (${source.type}) - ${source.url}`);
        const items = await scrapeSource(source);
        console.log(`[Orbix Scraper] Source ${source.name}: Found ${items.length} items`);
        totalScraped += items.length;
        
        // Save each item
        let savedCount = 0;
        for (const item of items) {
          try {
            const saved = await saveRawItem(businessId, item);
            if (saved) {
              totalSaved++;
              savedCount++;
            }
          } catch (saveError) {
            console.error(`[Orbix Scraper] Error saving item from ${source.name}:`, saveError.message);
            // Continue with next item
          }
        }
        
        console.log(`[Orbix Scraper] Source ${source.name}: Saved ${savedCount} items`);
        
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
    
    console.log(`[Orbix Scraper] Business ${businessId}: ${totalScraped} scraped, ${totalSaved} saved`);
    return { scraped: totalScraped, saved: totalSaved };
  } catch (error) {
    console.error('[Orbix Scraper] Error scraping all sources:', error);
    throw error;
  }
}

