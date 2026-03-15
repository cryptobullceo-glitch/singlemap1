import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DEPT_KEYWORDS = {
  compliance: ['compliance','aml','kyc','regulatory','sanctions','bsa','mlro','fiu','mica','esma','finra','money laundering'],
  legal: ['legal','counsel','attorney','lawyer','litigation','privacy','gdpr','policy'],
  product: ['product manager','product owner','head of product','vp product','chief product'],
  engineering: ['engineer','developer','backend','frontend','fullstack','devops','sre','blockchain','smart contract','solidity','rust'],
  finance: ['cfo','finance','treasury','accounting','controller','risk','quant','trader','analyst'],
  marketing: ['marketing','growth','brand','content','seo','social media','communications'],
  sales: ['sales','business development','account executive','partnerships','institutional'],
  operations: ['operations','ops','support','customer success','hr ','people','recruiting','talent'],
};

function classifyDept(title = '', dept = '') {
  const text = (title + ' ' + dept).toLowerCase();
  for (const [key, keywords] of Object.entries(DEPT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return key;
  }
  return 'other';
}

const EXCHANGES = [
  { id: 'coinbase', source: 'greenhouse', board: 'coinbase' },
  { id: 'kraken', source: 'greenhouse', board: 'kraken' },
  { id: 'gemini', source: 'greenhouse', board: 'gemini' },
  { id: 'deribit', source: 'greenhouse', board: 'deribit' },
  { id: 'robinhood', source: 'lever', board: 'robinhood' },
  { id: 'bitget', source: 'lever', board: 'bitget' },
  { id: 'bitstamp', source: 'lever', board: 'bitstamp' },
  { id: 'cryptocom', source: 'ashby', board: 'crypto.com' },
];

async function scrapeGreenhouse(exchange) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${exchange.board}/jobs?content=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalmapBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(job => ({
    external_id: String(job.id),
    title: job.title,
    department: classifyDept(job.title, job.departments?.[0]?.name || ''),
    location: job.location?.name || '',
    url: job.absolute_url,
    source: 'greenhouse',
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
  const compliance = jobs?.filter(j => j.department === 'compliance').length || 0;
  const engineering = jobs?.filter(j => j.department === 'engineering').length || 0;
  const product = jobs?.filter(j => j.department === 'product').length || 0;
  const compPct = total > 0 ? (compliance / total) * 100 : 0;
  const compScore = Math.min(40, compPct * 2);
  const sizeScore = Math.min(20, total / 25);
  const score = Math.round(compScore + 20 + sizeScore);
  const signalText = [
    compliance > 0 ? `${compliance} compliance roles` : null,
    engineering > 0 ? `${engineering} engineering roles` : null,
    product > 0 ? `${product} product roles` : null,
    `${total} total active`,
  ].filter(Boolean).join(' · ');
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

async function main() {
  console.log('Signalmap scraper started');
  for (const exchange of EXCHANGES) {
    console.log(`  → ${exchange.id} (${exchange.source})`);
    let listings = [];
    let status = 'ok';
    let errorMsg = null;
    try {
      if (exchange.source === 'greenhouse') listings = await scrapeGreenhouse(exchange);
      else if (exchange.source === 'lever') listings = await scrapeLever(exchange);
      else if (exchange.source === 'ashby') listings = await scrapeAshby(exchange);
      const { newCount, total } = await upsertListings(exchange.id, listings);
      const score = await recalculateScore(exchange.id);
      console.log(`     OK: ${total} listings (${newCount} new) score=${score}`);
    } catch (err) {
      status = 'error';
      errorMsg = err.message;
      console.log(`     FAIL: ${errorMsg}`);
    }
    await supabase.from('scrape_log').insert({
      source: exchange.source, exchange_id: exchange.id,
      listings_found: listings.length, listings_new: 0, status, error_msg: errorMsg,
    });
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Done');
}

main().catch(err => { console.error(err); process.exit(1); });
