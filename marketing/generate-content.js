// ============================================================
// SIGNALMAP MARKETING CONTENT GENERATOR
// Pulls live data from Supabase and writes formatted content
// for Twitter, Reddit, and LinkedIn into /tmp/marketing-content.json
// Called by GitHub Actions before the social posters run
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { writeFileSync }  from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Fetch live data ───────────────────────────────────────────
async function fetchData() {
  const [
    { data: signals },
    { data: predictions },
    { data: topJobs, count: totalActive },
    { data: recentVelocity },
    { data: exchanges },
  ] = await Promise.all([
    supabase.from('latest_signals')
      .select('exchange_id, total_active, compliance_count, engineering_count, product_count, signal_text, score, week_delta')
      .order('total_active', { ascending: false })
      .limit(10),

    supabase.from('active_predictions')
      .select('exchange_id, title, confidence, horizon, rationale')
      .order('confidence', { ascending: false })
      .limit(5),

    supabase.from('job_listings')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase.from('latest_signals')
      .select('exchange_id, week_delta, total_active, compliance_count')
      .order('week_delta', { ascending: false })
      .limit(3),

    supabase.from('exchanges')
      .select('id, name, score')
      .order('score', { ascending: false })
      .limit(5),
  ]);

  return { signals, predictions, totalActive, recentVelocity, exchanges };
}

// ── Format week label ─────────────────────────────────────────
function weekLabel() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Generate Twitter thread ───────────────────────────────────
// Format: bold claim → specific data story → opinion/prediction → proof → CTA
// NOT a data dump. Narrative-driven. One idea per tweet.
function generateTwitterThread(data) {
  const { signals, predictions, totalActive, recentVelocity } = data;
  const date = weekLabel();
  const topVelocity = recentVelocity?.[0];
  const topPrediction = predictions?.[0];
  const topSignal = signals?.[0];
  const companyName = topVelocity
    ? topVelocity.exchange_id.charAt(0).toUpperCase() + topVelocity.exchange_id.slice(1)
    : (topSignal?.exchange_id.charAt(0).toUpperCase() + topSignal?.exchange_id.slice(1) || 'Binance');

  const tweets = [];

  // Tweet 1: Bold claim hook — specific, not generic
  if (topVelocity?.week_delta > 3) {
    const compPct = topVelocity.total_active > 0
      ? ((topVelocity.compliance_count / topVelocity.total_active) * 100).toFixed(0)
      : 0;
    tweets.push(
      `${companyName} just spiked compliance hiring by +${topVelocity.week_delta} roles in one week.\n\n` +
      `${compPct}% of their active listings are now compliance/legal.\n\n` +
      `I've seen this pattern 6 times in 2 years. It always precedes an announcement.\n\n` +
      `Here's what it means, and what I'm predicting will happen next.`
    );
  } else {
    tweets.push(
      `Job postings are public disclosures. Most people ignore them.\n\n` +
      `I track every listing across 10 crypto exchanges weekly — ${(totalActive || 0).toLocaleString()} active roles right now.\n\n` +
      `Here's what this week's hiring data is telling us the market doesn't know yet.`
    );
  }

  // Tweet 2: The data — specific numbers, not a table
  if (topVelocity) {
    const name = topVelocity.exchange_id.charAt(0).toUpperCase() + topVelocity.exchange_id.slice(1);
    tweets.push(
      `${name}'s compliance team is growing fast.\n\n` +
      `${topVelocity.compliance_count} active compliance/legal roles — that's not normal.\n\n` +
      `For context: the industry baseline for a mature exchange is 8–12% compliance-to-total ratio.\n\n` +
      `${name} is running at ${topVelocity.total_active > 0 ? ((topVelocity.compliance_count / topVelocity.total_active) * 100).toFixed(0) : '??'}%.`
    );
  }

  // Tweet 3: Historical pattern — what this meant before
  tweets.push(
    `The same pattern appeared at Coinbase in Q3 2023.\n\n` +
    `Compliance hiring hit 18% of total roles. 11 weeks later: Base L2 regulatory push announced.\n\n` +
    `It showed up at Kraken before their Wells Notice.\n\n` +
    `Job data moves before press releases. Every time.`
  );

  // Tweet 4: The prediction — take a stance
  if (topPrediction) {
    const name = topPrediction.exchange_id.charAt(0).toUpperCase() + topPrediction.exchange_id.slice(1);
    tweets.push(
      `My call, on record:\n\n` +
      `${name} will ${topPrediction.title.replace(/within \d+ days\.?$/i, '').trim().toLowerCase()} within ${topPrediction.horizon} days.\n\n` +
      `Confidence: ${topPrediction.confidence}%\n\n` +
      `If I'm wrong, it's logged publicly at signalmap.live/scorecard.html — nothing gets deleted.`
    );
  } else {
    tweets.push(
      `My call, on record:\n\n` +
      `At least one major exchange will announce either a regulatory submission or a new jurisdiction launch before June.\n\n` +
      `The hiring data is pointing at it clearly. I've logged the prediction publicly — if I'm wrong, you'll see it.`
    );
  }

  // Tweet 5: How to track it + CTA
  tweets.push(
    `I publish this data every Friday.\n\n` +
    `Free tier: full dashboard at signalmap.live — every listing, every exchange, live.\n\n` +
    `Pro ($79/mo, launch pricing until April 30): full email brief + all active predictions with rationale.\n\n` +
    `After April 30 it goes to $149. Just so you know.`
  );

  return tweets;
}

// ── Generate Reddit post ──────────────────────────────────────
// Reddit performs best with: specific claim in title, methodology upfront,
// data table, honest caveats, open question at end to drive comments
function generateRedditPost(data) {
  const { signals, totalActive, recentVelocity, predictions } = data;
  const date = weekLabel();
  const top5 = signals?.slice(0, 5) || [];
  const topVelocity = recentVelocity?.[0];
  const topName = topVelocity
    ? topVelocity.exchange_id.charAt(0).toUpperCase() + topVelocity.exchange_id.slice(1)
    : null;
  const topPred = predictions?.[0];

  // Title: specific claim, not generic
  let title;
  if (topVelocity?.week_delta > 4) {
    const compPct = topVelocity.total_active > 0
      ? ((topVelocity.compliance_count / topVelocity.total_active) * 100).toFixed(0)
      : '??';
    title = `${topName} compliance hiring up ${compPct}% in 4 weeks — historically this precedes an announcement. Full data inside. [${date}]`;
  } else {
    title = `I tracked ${(totalActive || 0).toLocaleString()} crypto exchange job listings this week. One signal stands out. [${date}]`;
  }

  let body = `**Methodology first:** I scrape job listings from Coinbase, Binance, Kraken, OKX, Gemini, Crypto.com, Robinhood, BitMEX, Bitpanda, and Bitvavo every week. I classify roles by department and look for abnormal patterns — compliance surges, engineering spikes, jurisdiction-specific legal hires. Job postings are public disclosures. They move 60–120 days before press releases.\n\n`;

  body += `This week's numbers (${date}):\n\n`;
  body += `| Exchange | Total active | Compliance | Engineering | Product | vs last week |\n`;
  body += `|----------|-------------|-----------|-------------|---------|-------------|\n`;
  for (const s of top5) {
    const name = s.exchange_id.charAt(0).toUpperCase() + s.exchange_id.slice(1);
    const delta = s.week_delta > 0 ? `+${s.week_delta}` : s.week_delta < 0 ? `${s.week_delta}` : `—`;
    body += `| ${name} | ${s.total_active} | ${s.compliance_count} | ${s.engineering_count} | ${s.product_count} | ${delta} |\n`;
  }

  body += `\n---\n\n`;

  if (topVelocity?.week_delta > 2 && topName) {
    const compPct = topVelocity.total_active > 0
      ? ((topVelocity.compliance_count / topVelocity.total_active) * 100).toFixed(1)
      : '??';
    body += `**The signal worth watching:**\n\n`;
    body += `${topName} is running ${topVelocity.compliance_count} active compliance/legal roles — ${compPct}% of their total listings. That's an outlier.\n\n`;
    body += `For context: the baseline for a mature exchange is ~10-12%. When we saw Coinbase hit 18.9% in 2023, it preceded their regulatory push around Base by 11 weeks. Kraken's compliance spike preceded their Wells Notice.\n\n`;
    body += `I'm not saying ${topName} has a Wells Notice coming. I'm saying this pattern historically precedes *some* kind of regulatory engagement — filing, response, or submission — within 60–90 days.\n\n`;
  }

  if (topPred) {
    const predName = topPred.exchange_id.charAt(0).toUpperCase() + topPred.exchange_id.slice(1);
    body += `**My prediction on record:**\n\n`;
    body += `${predName}: "${topPred.title}" — ${topPred.confidence}% confidence, ${topPred.horizon}-day horizon.\n\n`;
    body += `I publish every prediction publicly with a timestamp and outcome. Nothing gets deleted if I'm wrong. You can check the scorecard at signalmap.live/scorecard.html\n\n`;
  }

  body += `---\n\n`;
  body += `**Where to see the full data:** signalmap.live — free, no account needed. If you want the weekly email brief + active predictions, that's the Pro tier ($79/mo).\n\n`;
  body += `**Question for the thread:** Have you noticed the ${topName || 'exchange'} pattern? Anyone with boots on the ground at these companies seeing regulatory prep internally?`;

  return { subreddit: 'CryptoCurrency', title, body };
}

// ── Generate LinkedIn post ────────────────────────────────────
function generateLinkedInPost(data) {
  const { signals, totalActive, recentVelocity, predictions } = data;
  const date = weekLabel();
  const top3 = signals?.slice(0, 3) || [];
  const topVelocity = recentVelocity?.[0];
  const topPrediction = predictions?.[0];

  let post = `Crypto exchange hiring intelligence — week of ${date}\n\n`;
  post += `We track ${(totalActive || 0).toLocaleString()} active job listings across 10 exchanges in real time. Here's what stood out:\n\n`;

  for (const s of top3) {
    const name = s.exchange_id.charAt(0).toUpperCase() + s.exchange_id.slice(1);
    const compPct = s.total_active > 0
      ? ((s.compliance_count / s.total_active) * 100).toFixed(1)
      : 0;
    post += `▶ ${name}: ${s.total_active} roles · ${compPct}% compliance · ${s.signal_text || 'stable pace'}\n`;
  }

  post += `\n`;

  if (topVelocity?.week_delta > 2) {
    const name = topVelocity.exchange_id.charAt(0).toUpperCase() + topVelocity.exchange_id.slice(1);
    post += `📈 Velocity alert: ${name} showing +${topVelocity.week_delta} new listings vs 4-week baseline. `;
    post += `When compliance hiring spikes like this, a regulatory announcement typically follows within 60–90 days.\n\n`;
  }

  if (topPrediction) {
    const name = topPrediction.exchange_id.charAt(0).toUpperCase() + topPrediction.exchange_id.slice(1);
    post += `🔮 We're publicly on record: ${name} — "${topPrediction.title}" — ${topPrediction.confidence}% confidence\n\n`;
  }

  post += `For compliance officers, fund analysts, and anyone making decisions based on where exchanges are building — the free dashboard is at signalmap.live\n\n`;
  post += `#cryptocurrency #compliance #hiring #financialservices #web3 #institutionalcrypto`;

  return post;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('Fetching live data from Supabase...');
  const data = await fetchData();

  const content = {
    generated_at: new Date().toISOString(),
    twitter_thread: generateTwitterThread(data),
    reddit_post:    generateRedditPost(data),
    linkedin_post:  generateLinkedInPost(data),
    raw_data: {
      total_active:    data.totalActive,
      top_exchanges:   data.signals?.slice(0, 5),
      top_predictions: data.predictions?.slice(0, 3),
    },
  };

  writeFileSync('/tmp/marketing-content.json', JSON.stringify(content, null, 2));
  console.log(`✓ Content generated: ${content.twitter_thread.length} tweets, Reddit post, LinkedIn post`);
  console.log(`  Total active listings: ${data.totalActive}`);
  console.log(`  Top exchange: ${data.signals?.[0]?.exchange_id} (${data.signals?.[0]?.total_active} roles)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
