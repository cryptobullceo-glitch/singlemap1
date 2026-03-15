import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DEPT_KEYWORDS = {
  compliance: ['compliance','aml','kyc','regulatory','sanctions','bsa','mlro','fiu','mica','esma','finra','money laundering','financial crime','risk and compliance'],
  legal: ['legal','counsel','attorney','lawyer','litigation','privacy','gdpr','policy','government affairs','public policy'],
  product: ['product manager','product owner','head of product','vp product','chief product','product lead','product director','product analyst'],
  engineering: ['engineer','developer','backend','frontend','fullstack','devops','sre','blockchain','smart contract','solidity','rust','infrastructure','platform','security engineer','data engineer','machine learning','ml engineer','ai engineer'],
  finance: ['cfo','finance','treasury','accounting','controller','risk','quant','trader','analyst','financial planning'],
  marketing: ['marketing','growth','brand','content','seo','social media','communications','community','pr ','public relations'],
  sales: ['sales','business development','bd ','account executive','partnerships','institutional','relationship manager','account manager','client'],
  operations: ['operations','ops','support','customer success','hr ','people','recruiting','talent','workplace','office','executive assistant','project manager'],
  design: ['design','ux','ui','creative','graphic','visual','illustration','motion'],
};

function classifyDept(title = '', dept = '') {
  const text = (title + ' ' + dept).toLowerCase();
  for (const [key, keywords] of Object.entries(DEPT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return key;
  }
  return 'other';
}

// ═══════════════════════════════════════════════════════════════
// VERIFIED EXCHANGES — all tested with real API responses
// Last verified: March 2026
// ═══════════════════════════════════════════════════════════════
const EXCHANGES = [
  // ── GREENHOUSE (Public JSON API) ──────────────────────────
  // API: https://boards-api.greenhouse.io/v1/boards/{board}/jobs
  { id: 'coinbase',   source: 'greenhouse', board: 'coinbase' },    // VERIFIED: 225 jobs
  { id: 'gemini',     source: 'greenhouse', board: 'gemini' },      // VERIFIED: 8 jobs
  { id: 'robinhood',  source: 'greenhouse', board: 'robinhood' },   // VERIFIED: job-boards.greenhouse.io/robinhood
  { id: 'okx',        source: 'greenhouse', board: 'okx' },         // VERIFIED: job-boards.greenhouse.io/okx
  { id: 'bitmex',     source: 'greenhouse', board: 'bitmex' },      // VERIFIED: job-boards.greenhouse.io/bitmex

  // ── GREENHOUSE EU (different API domain) ──────────────────
  // API: https://boards-api.eu.greenhouse.io/v1/boards/{board}/jobs
  { id: 'bitpanda',   source: 'greenhouse-eu', board: 'bitpanda' }, // VERIFIED: job-boards.eu.greenhouse.io/bitpanda

  // ── LEVER (Public JSON API) ───────────────────────────────
  // API: https://api.lever.co/v0/postings/{board}?mode=json
  { id: 'binance',    source: 'lever', board: 'binance' },          // VERIFIED: jobs.lever.co/binance

  // ── ASHBY (Public GraphQL API) ────────────────────────────
  // API: https://jobs.ashbyhq.com/api/non-user-graphql
  { id: 'kraken',     source: 'ashby', board: 'kraken.com' },       // VERIFIED: jobs.ashbyhq.com/kraken.com
  { id: 'cryptocom',  source: 'ashby', board: 'crypto.com' },       // VERIFIED: jobs.ashbyhq.com/crypto.com
  { id: 'bitvavo',    source: 'ashby', board: 'bitvavo' },          // VERIFIED: jobs.ashbyhq.com/bitvavo
];

// ═══════════════════════════════════════════════════════════════
// SCRAPERS
// ═══════════════════════════════════════════════════════════════

async function scrapeGreenhouse(exchange) {
  const domain = exchange.source === 'greenhouse-eu'
    ? 'boards-api.eu.greenhouse.io'
    : 'boards-api.greenhouse.io';
  const url = `https://${domain}/v1/boards/${exchange.board}/jobs?content=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalmapBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(job => ({
    external_id: String(job.id),
    title: job.title,
    department: classifyDept(job.title, job.departments?.[0]?.name || ''),
    location: job.location?.name || '',
    url: job.absolute_url,
    source: exchange.source,
  }));
}

async function scrapeLever(exchange) {
  const url = `https://api.lever.co/v0/postings/${exchange.board}?mode=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalmapBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(job => ({
    external_id: job.id,
    title: job.text,
    department: classifyDept(job.text, job.categories?.team || ''),
    location: job.categories?.location || '',
    url: job.hostedUrl,
    source: 'lever',
  }));
}

async function scrapeAshby(exchange) {
  const url = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SignalmapBot/1.0' },
    body: JSON.stringify({
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: exchange.board },
      query: 'query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName teamName jobPostingState externalLink } } }'
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const postings = data?.data?.jobBoard?.jobPostings || [];
  return postings.filter(j => j.jobPostingState === 'Published').map(job => ({
    external_id: job.id,
    title: job.title,
    department: classifyDept(job.title, job.teamName || ''),
    location: job.locationName || '',
    url: job.externalLink || `https://jobs.ashbyhq.com/${exchange.board}/${job.id}`,
    source: 'ashby',
  }));
}

// ═══════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════

async function upsertListings(exchangeId, listings) {
  if (!listings.length) return { newCount: 0, total: 0 };
  await supabase.from('job_listings').update({ is_active: false }).eq('exchange_id', exchangeId).eq('is_active', true);
  const rows = listings.map(l => ({
    exchange_id: exchangeId, external_id: l.external_id, title: l.title,
    department: l.department, location: l.location, url: l.url,
    source: l.source, is_active: true, last_seen: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('job_listings').upsert(rows.slice(i, i + 100), { onConflict: 'exchange_id,external_id', ignoreDuplicates: false });
    if (error) throw error;
  }
  const { count } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).eq('exchange_id', exchangeId).gte('first_seen', new Date(Date.now() - 7200000).toISOString());
  return { newCount: count || 0, total: listings.length };
}

async function recalculateScore(exchangeId) {
  const { data: jobs } = await supabase.from('job_listings').select('department').eq('exchange_id', exchangeId).eq('is_active', true);
  const total = jobs?.length || 0;
  const deptCounts = {};
  for (const j of (jobs || [])) {
    deptCounts[j.department] = (deptCounts[j.department] || 0) + 1;
  }
  const compliance = deptCounts.compliance || 0;
  const engineering = deptCounts.engineering || 0;
  const product = deptCounts.product || 0;
  const compPct = total > 0 ? (compliance / total) * 100 : 0;
  const compScore = Math.min(40, compPct * 2);
  const sizeScore = Math.min(20, total / 25);
  const score = Math.round(compScore + 20 + sizeScore);
  const parts = [];
  if (compliance > 0) parts.push(`${compliance} compliance`);
  if (engineering > 0) parts.push(`${engineering} engineering`);
  if (product > 0) parts.push(`${product} product`);
  parts.push(`${total} total active`);
  const signalText = parts.join(' · ');
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  await supabase.from('signals').upsert({
    exchange_id: exchangeId, week_start: weekStart.toISOString().split('T')[0],
    total_active: total, compliance_count: compliance, engineering_count: engineering,
    product_count: product, signal_text: signalText, score,
  }, { onConflict: 'exchange_id,week_start' });
  await supabase.from('exchanges').update({ score, updated_at: new Date().toISOString() }).eq('id', exchangeId);
  return score;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`Signalmap scraper — ${new Date().toISOString()}`);
  console.log(`${EXCHANGES.length} exchanges with verified API sources\n`);
  const results = [];
  for (const exchange of EXCHANGES) {
    console.log(`  → ${exchange.id} (${exchange.source})`);
    let listings = [];
    let status = 'ok';
    let errorMsg = null;
    try {
      if (exchange.source === 'greenhouse' || exchange.source === 'greenhouse-eu') {
        listings = await scrapeGreenhouse(exchange);
      } else if (exchange.source === 'lever') {
        listings = await scrapeLever(exchange);
      } else if (exchange.source === 'ashby') {
        listings = await scrapeAshby(exchange);
      }
      const { newCount, total } = await upsertListings(exchange.id, listings);
      const score = await recalculateScore(exchange.id);
      console.log(`     OK: ${total} listings (${newCount} new) score=${score}`);
      results.push({ exchange: exchange.id, total, new: newCount, score, status: 'ok' });
    } catch (err) {
      status = 'error';
      errorMsg = err.message;
      console.log(`     FAIL: ${errorMsg}`);
      results.push({ exchange: exchange.id, status, error: errorMsg });
    }
    await supabase.from('scrape_log').insert({
      source: exchange.source, exchange_id: exchange.id,
      listings_found: listings.length, listings_new: 0, status, error_msg: errorMsg,
    });
    await new Promise(r => setTimeout(r, 2000));
  }
  const ok = results.filter(r => r.status === 'ok').length;
  const totalJobs = results.reduce((s, r) => s + (r.total || 0), 0);
  console.log(`\nDone: ${ok}/${results.length} sources · ${totalJobs} total listings`);
}

main().catch(err => { console.error(err); process.exit(1); });
