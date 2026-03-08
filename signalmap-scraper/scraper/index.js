// ============================================================
// SIGNALMAP SCRAPER — PRODUCTION
// Only targets sources with real public APIs
// Greenhouse, Lever, Ashby = reliable, free, no auth
// ============================================================

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Department classifier ─────────────────────────────────────
const DEPT_KEYWORDS = {
  compliance: ['compliance', 'aml', 'kyc', 'regulatory', 'sanctions', 'bsa', 'mlro', 'fiu', 'mica', 'esma', 'finra', 'sec filing', 'money laundering'],
  legal:      ['legal', 'counsel', 'attorney', 'lawyer', 'litigation', 'privacy', 'gdpr', 'policy'],
  product:    ['product manager', 'product owner', 'pm ', ' pm,', 'head of product', 'vp product', 'chief product'],
  engineering:['engineer', 'developer', 'backend', 'frontend', 'fullstack', 'devops', 'sre', 'blockchain', 'smart contract', 'solidity', 'rust'],
  finance:    ['cfo', 'finance', 'treasury', 'accounting', 'controller', 'risk', 'quant', 'trader', 'analyst'],
  marketing:  ['marketing', 'growth', 'brand', 'content', 'seo', 'social media', 'pr ', 'communications'],
  sales:      ['sales', 'business development', 'bd ', 'account executive', 'partnerships', 'institutional'],
  operations: ['operations', 'ops', 'support', 'customer success', 'hr ', 'people', 'recruiting', 'talent'],
};

function classifyDept(title = '', dept = '') {
  const text = (title + ' ' + dept).toLowerCase();
  for (const [key, keywords] of Object.entries(DEPT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return key;
  }
  return 'other';
}

// ── Exchange config ───────────────────────────────────────────
// ONLY sources with real, tested public APIs
const EXCHANGES = [
  // Greenhouse ATS (public JSON API — no auth needed)
  { id: 'coinbase',  source: 'greenhouse', board: 'coinbase'    },
  { id: 'kraken',    source: 'greenhouse', board: 'kraken'      },
  { id: 'gemini',    source: 'greenhouse', board: 'gemini'      },
  { id: 'deribit',   source: 'greenhouse', board: 'deribit'     },

  // Lever ATS (public JSON API — no auth needed)
  { id: 'robinhood', source: 'lever',      board: 'robinhood'   },
  { id: 'bitget',    source: 'lever',      board: 'bitget'      },
  { id: 'bitstamp',  source: 'lever',      board: 'bitstamp'    },

  // Ashby ATS (public GraphQL API)
  { id: 'cryptocom', source: 'ashby',      board: 'crypto.com'  },
];

// ── Greenhouse scraper ────────────────────────────────────────
async function scrapeGreenhouse(exchange) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${exchange.board}/jobs?content=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalmapBot/1.0' }, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(job => ({
    external_id: String(job.id),
    title:       job.title,
    department:  classifyDept(job.title, job.departments?.[0]?.name || ''),
    location:    job.location?.name || '',
    url:         job.absolute_url,
    source:      'greenhouse',
  }));
}

// ── Lever scraper ─────────────────────────────────────────────
async function scrapeLever(exchange) {
  const url = `https://api.lever.co/v0/postings/${exchange.board}?mode=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalmapBot/1.0' }, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(job => ({
    external_id: job.id,
    title:       job.text,
    department:  classifyDept(job.text, job.categories?.team || ''),
    location:    job.categories?.location || job.workplaceType || '',
    url:         job.hostedUrl,
    source:      'lever',
  }));
}

// ── Ashby scraper ─────────────────────────────────────────────
async function scrapeAshby(exchange) {
  const url = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SignalmapBot/1.0' },
    body: JSON.stringify({
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: exchange.board },
      query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
          jobPostings { id title locationName teamName jobPostingState externalLink }
        }
      }`
    }),
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const postings = data?.data?.jobBoard?.jobPostings || [];
  return postings.filter(j => j.jobPostingState === 'Published').map(job => ({
    external_id: job.id,
    title:       job.title,
    department:  classifyDept(job.title, job.teamName || ''),
    location:    job.locationName || '',
    url:         job.externalLink || `https://jobs.ashbyhq.com/${exchange.board}/${job.id}`,
    source:      'ashby',
  }));
}

// ── Upsert listings to Supabase ───────────────────────────────
async function upsertListings(exchangeId, listings) {
  if (!listings.length) return { new: 0, total: 0 };

  // Mark all current listings as potentially inactive
  await supabase
    .from('job_listings')
    .update({ is_active: false })
    .eq('exchange_id', exchangeId)
    .eq('is_active', true);

  // Upsert all scraped listings
  const rows = listings.map(l => ({
    exchange_id: exchangeId,
    external_id: l.external_id,
    title:       l.title,
    department:  l.department,
    location:    l.location,
    url:         l.url,
    source:      l.source,
    is_active:   true,
    last_seen:   new Date().toISOString(),
  }));

  // Upsert in batches of 100 to avoid payload limits
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('job_listings')
      .upsert(batch, { onConflict: 'exchange_id,external_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Count new listings (first_seen within last 2 hours)
  const { count } = await supabase
    .from('job_listings')
    .select('*', { count: 'exact', head: true })
    .eq('exchange_id', exchangeId)
    .gte('first_seen', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  return { new: count || 0, total: listings.length };
}

// ── Recalculate exchange score ────────────────────────────────
async function recalculateScore(exchangeId) {
  // Get counts directly since the view might not update immediately
  const { data: activeJobs } = await supabase
    .from('job_listings')
    .select('department', { count: 'exact' })
    .eq('exchange_id', exchangeId)
    .eq('is_active', true);

  const total = activeJobs?.length || 0;
  const compliance = activeJobs?.filter(j => j.department === 'compliance').length || 0;
  const engineering = activeJobs?.filter(j => j.department === 'engineering').length || 0;
  const product = activeJobs?.filter(j => j.department === 'product').length || 0;

  // Count new this week
  const { count: newThisWeek } = await supabase
    .from('job_listings')
    .select('*', { count: 'exact', head: true })
    .eq('exchange_id', exchangeId)
    .gte('first_seen', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // 4-week average
  const { count: last28 } = await supabase
    .from('job_listings')
    .select('*', { count: 'exact', head: true })
    .eq('exchange_id', exchangeId)
    .gte('first_seen', new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString());

  const avgPerWeek = (last28 || 0) / 4;
  const weekDelta = (newThisWeek || 0) - avgPerWeek;

  const compPct = total > 0 ? (compliance / total) * 100 : 0;

  // Score: compliance health (40) + momentum (40) + size (20)
  const compScore     = Math.min(40, compPct * 2);
  const momentumScore = Math.min(40, Math.max(0, 20 + weekDelta * 2));
  const sizeScore     = Math.min(20, total / 25);
  const score         = Math.round(compScore + momentumScore + sizeScore);

  // Build signal text
  const signals = [];
  if (compliance > 0) signals.push(`${compliance} active compliance roles`);
  if (newThisWeek > 0) signals.push(`${newThisWeek} new listings this week`);
  if (weekDelta > 3) signals.push(`hiring velocity ↑${Math.round(weekDelta)} vs avg`);
  if (weekDelta < -3) signals.push(`hiring velocity ↓${Math.abs(Math.round(weekDelta))} vs avg`);
  const signalText = signals.join(' · ') || `${total} active listings`;

  // Write signal row
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);

  await supabase.from('signals').upsert({
    exchange_id:       exchangeId,
    week_start:        weekStart.toISOString().split('T')[0],
    total_active:      total,
    compliance_count:  compliance,
    engineering_count: engineering,
    product_count:     product,
    week_delta:        Math.round(weekDelta),
    signal_text:       signalText,
    score,
  }, { onConflict: 'exchange_id,week_start' });

  // Update exchange score
  await supabase
    .from('exchanges')
    .update({ score, updated_at: new Date().toISOString() })
    .eq('id', exchangeId);

  return score;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`Signalmap scraper started at ${new Date().toISOString()}`);
  console.log(`Targeting ${EXCHANGES.length} exchanges with verified API sources\n`);
  const results = [];

  for (const exchange of EXCHANGES) {
    console.log(`  → ${exchange.id} (${exchange.source})`);
    const start = Date.now();
    let listings = [];
    let status = 'ok';
    let errorMsg = null;

    try {
      if (exchange.source === 'greenhouse') listings = await scrapeGreenhouse(exchange);
      else if (exchange.source === 'lever')  listings = await scrapeLever(exchange);
      else if (exchange.source === 'ashby')  listings = await scrapeAshby(exchange);

      const { new: newCount, total } = await upsertListings(exchange.id, listings);
      const score = await recalculateScore(exchange.id);

      console.log(`     ✓ ${total} listings (${newCount} new) · score ${score} · ${Date.now() - start}ms`);
      results.push({ exchange: exchange.id, total, new: newCount, score, status: 'ok' });

    } catch (err) {
      status = err.message?.includes('429') || err.message?.includes('rate') ? 'rate_limited' : 'error';
      errorMsg = err.message;
      console.log(`     ✗ ${status}: ${errorMsg}`);
      results.push({ exchange: exchange.id, status, error: errorMsg });
    }

    // Log to scrape_log
    await supabase.from('scrape_log').insert({
      source:       exchange.source,
      exchange_id:  exchange.id,
      listings_found: listings.length,
      listings_new:  results[results.length - 1]?.new || 0,
      status,
      error_msg:    errorMsg,
    });

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  const ok    = results.filter(r => r.status === 'ok').length;
  const total = results.reduce((s, r) => s + (r.total || 0), 0);
  const newJobs = results.reduce((s, r) => s + (r.new || 0), 0);
  console.log(`\nDone: ${ok}/${results.length} sources · ${total} listings · ${newJobs} new`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
