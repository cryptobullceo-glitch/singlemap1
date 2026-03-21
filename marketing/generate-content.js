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
function generateTwitterThread(data) {
  const { signals, predictions, totalActive, recentVelocity } = data;
  const date = weekLabel();
  const top3 = signals?.slice(0, 3) || [];
  const topVelocity = recentVelocity?.[0];
  const topPrediction = predictions?.[0];

  const tweets = [];

  // Tweet 1: Hook
  tweets.push(
    `🚨 Crypto exchange hiring data — week of ${date}\n\n` +
    `We tracked ${(totalActive || 0).toLocaleString()} active job listings across 10 exchanges.\n\n` +
    `Here's what the data is signaling 🧵`
  );

  // Tweet 2-4: Top exchanges
  for (const s of top3) {
    const name = s.exchange_id.toUpperCase();
    const compPct = s.total_active > 0
      ? ((s.compliance_count / s.total_active) * 100).toFixed(1)
      : 0;
    const delta = s.week_delta > 0 ? `+${s.week_delta}` : String(s.week_delta || 0);
    tweets.push(
      `📊 ${name}\n\n` +
      `• ${s.total_active} active roles\n` +
      `• ${s.compliance_count} compliance (${compPct}%)\n` +
      `• ${s.engineering_count} engineering\n` +
      `• ${s.product_count} product\n` +
      `• Week delta: ${delta}\n\n` +
      `Signal: ${s.signal_text || 'Stable hiring pace'}`
    );
  }

  // Tweet 5: Velocity spike
  if (topVelocity?.week_delta > 0) {
    const name = topVelocity.exchange_id.toUpperCase();
    tweets.push(
      `⚡ Biggest hiring surge this week: ${name}\n\n` +
      `+${topVelocity.week_delta} new listings vs 4-week average\n\n` +
      `Compliance roles: ${topVelocity.compliance_count}\n\n` +
      `This pattern typically precedes a regulatory announcement by 60–90 days.`
    );
  }

  // Tweet 6: Prediction
  if (topPrediction) {
    const name = topPrediction.exchange_id.toUpperCase();
    tweets.push(
      `🔮 Live prediction: ${name}\n\n` +
      `"${topPrediction.title}"\n\n` +
      `Confidence: ${topPrediction.confidence}%\n` +
      `Horizon: ${topPrediction.horizon} days\n\n` +
      `Based on: ${topPrediction.rationale?.slice(0, 120)}...`
    );
  }

  // Tweet 7: CTA
  tweets.push(
    `Full dashboard is free → signalmap.live\n\n` +
    `Pro tier ($79/mo) unlocks:\n` +
    `• Weekly email brief\n` +
    `• All predictions + rationale\n` +
    `• Data source breakdown\n\n` +
    `Founding rate, 50 spots. About half are gone.\n\n` +
    `#crypto #bitcoin #hiring #compliance #web3`
  );

  return tweets;
}

// ── Generate Reddit post ──────────────────────────────────────
function generateRedditPost(data) {
  const { signals, totalActive, recentVelocity, predictions } = data;
  const date = weekLabel();
  const top5 = signals?.slice(0, 5) || [];
  const topVelocity = recentVelocity?.[0];

  let body = `I run a tool that scrapes job listings from every major crypto exchange hourly and looks for hiring signals. Here's what stood out this week (${date}):\n\n`;

  body += `**Overview:** ${(totalActive || 0).toLocaleString()} active listings across 10 exchanges\n\n`;
  body += `---\n\n`;

  body += `**Exchange breakdown:**\n\n`;
  body += `| Exchange | Total | Compliance | Engineering | Product | Signal |\n`;
  body += `|----------|-------|-----------|-------------|---------|--------|\n`;
  for (const s of top5) {
    const name = s.exchange_id.charAt(0).toUpperCase() + s.exchange_id.slice(1);
    const delta = s.week_delta > 0 ? `↑${s.week_delta}` : s.week_delta < 0 ? `↓${Math.abs(s.week_delta)}` : '→';
    body += `| ${name} | ${s.total_active} | ${s.compliance_count} | ${s.engineering_count} | ${s.product_count} | ${delta} |\n`;
  }

  body += `\n---\n\n`;

  if (topVelocity?.week_delta > 2) {
    const name = topVelocity.exchange_id.charAt(0).toUpperCase() + topVelocity.exchange_id.slice(1);
    body += `**Most interesting signal this week:** ${name} is seeing an unusual spike in hiring velocity (+${topVelocity.week_delta} vs 4-week average). `;
    body += `Compliance hiring specifically is at ${topVelocity.compliance_count} active roles. This pattern has historically preceded regulatory announcements by 60–90 days.\n\n`;
  }

  if (predictions?.length > 0) {
    body += `**Active predictions (things we're on record saying will happen):**\n\n`;
    for (const p of predictions.slice(0, 2)) {
      const name = p.exchange_id.charAt(0).toUpperCase() + p.exchange_id.slice(1);
      body += `- **${name}:** "${p.title}" — ${p.confidence}% confidence\n`;
    }
    body += `\n`;
  }

  body += `---\n\n`;
  body += `Full dashboard is free at [signalmap.live](https://signalmap.live) — updated hourly. Pro tier adds the weekly brief and predictions tab if you want the analysis layer.\n\n`;
  body += `Happy to answer questions about methodology or what specific signals mean.`;

  return {
    subreddit: 'CryptoCurrency',
    title:     `I tracked ${(totalActive || 0).toLocaleString()} crypto job listings this week. Here's what the hiring data signals. [${date}]`,
    body,
  };
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
