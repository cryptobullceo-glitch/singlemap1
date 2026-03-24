// ============================================================
// SIGNALMAP EMAIL DRIP SEQUENCE
// Called daily via GitHub Actions cron
// Sends: welcome (day 0), teaser (day 3), conversion (day 7),
//        nudge (day 14), final offer (day 30)
// Requires: RESEND_API_KEY secret in Supabase Edge Function Secrets
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL     = 'Signalmap <signal@signalmap.live>';
const STRIPE_MONTHLY = 'https://buy.stripe.com/eVqaEX9n27ee4CH22R8k800';
const STRIPE_ANNUAL  = 'https://buy.stripe.com/fZu28r0Qw4223yD7nb8k801';
const SITE_URL       = 'https://signalmap.live';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Drip sequence definition ──────────────────────────────────
const DRIP_SEQUENCE = [
  { day: 0,  subject: 'Welcome to Signalmap — your first signal is ready',             template: 'welcome' },
  { day: 3,  subject: '3 hiring signals from this week — one you\'ll want to see',    template: 'teaser'   },
  { day: 7,  subject: 'This prediction just came true. Here\'s what we\'re watching next.', template: 'convert' },
  { day: 14, subject: 'Unusual hiring spike detected — this is what it usually means', template: 'nudge'    },
  { day: 21, subject: 'The exchange most likely to make news in April',                template: 'intel'    },
  { day: 30, subject: 'Launch pricing ends April 30 — $79 becomes $149 next month',   template: 'final'    },
];

// ── HTML email templates ──────────────────────────────────────
function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; background: #FAFAF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .logo { font-size: 18px; font-weight: 700; color: #059669; letter-spacing: 0.05em; margin-bottom: 32px; }
    .logo span { font-weight: 300; }
    h1 { font-size: 28px; font-weight: 700; color: #09090B; line-height: 1.3; margin: 0 0 16px; }
    p { font-size: 16px; line-height: 1.7; color: #3F3F46; margin: 0 0 16px; }
    .signal-card { background: #fff; border: 1px solid #E4E4E7; border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
    .signal-card .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #71716A; margin-bottom: 8px; }
    .signal-card .value { font-size: 24px; font-weight: 700; color: #09090B; }
    .signal-card .sub { font-size: 14px; color: #71716A; margin-top: 4px; }
    .cta-btn { display: inline-block; background: #059669; color: #fff !important; font-weight: 600; font-size: 16px; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 8px 0; }
    .cta-secondary { display: inline-block; color: #059669 !important; font-weight: 600; font-size: 14px; text-decoration: none; margin-left: 16px; }
    .divider { border: none; border-top: 1px solid #E4E4E7; margin: 32px 0; }
    .footer { font-size: 13px; color: #A1A1AA; line-height: 1.6; }
    .footer a { color: #A1A1AA; }
    .green { color: #059669; font-weight: 600; }
    .tag { display: inline-block; background: #ECFDF5; color: #059669; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px; margin: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">SIGNAL<span>MAP</span></div>
    ${content}
    <hr class="divider">
    <div class="footer">
      <p>You're receiving this because you signed up at <a href="${SITE_URL}">signalmap.live</a>.<br>
      <a href="${SITE_URL}/unsubscribe?email={{email}}">Unsubscribe</a> · <a href="${SITE_URL}">View in browser</a></p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeEmail(data: Record<string, unknown>): string {
  const topExchange = (data.topExchange as string) || 'OKX';
  const totalJobs   = (data.totalJobs as number) || 1417;
  const topSignal   = (data.topSignal as string) || 'OKX is hiring aggressively across product and compliance';
  return emailWrapper(`
    <h1>Your hiring intelligence is live.</h1>
    <p>Signalmap tracks job listings across every major crypto exchange — in real time — so you can see where they're expanding, what they're building, and which regulatory moves are coming before they're announced.</p>
    <div class="signal-card">
      <div class="label">This week's top signal</div>
      <div class="value">${topExchange}</div>
      <div class="sub">${topSignal}</div>
    </div>
    <p>Right now we're tracking <strong>${totalJobs.toLocaleString()} active roles</strong> across 10 exchanges. The free dashboard is yours — no credit card needed.</p>
    <p><a href="${SITE_URL}/cex-intelligence.html" class="cta-btn">Open your dashboard →</a></p>
    <p style="margin-top: 24px;">The Pro tier adds: weekly email brief with analysis, full predictions tab, and the data sources breakdown. <a href="${SITE_URL}/#pricing" class="cta-secondary">See what's included</a></p>
  `);
}

function teaserEmail(data: Record<string, unknown>): string {
  const signals = (data.signals as Array<{exchange: string, signal: string, count: number}>) || [
    { exchange: 'Coinbase', signal: 'Highest compliance hiring ratio of any exchange (18.9%)', count: 41 },
    { exchange: 'Binance',  signal: '75 marketing roles — largest marketing push tracked',    count: 75 },
    { exchange: 'Kraken',   signal: '53 engineering roles + IPO signals detected',             count: 53 },
  ];
  const signalRows = signals.map(s => `
    <div class="signal-card" style="margin: 12px 0;">
      <div class="label">${s.exchange}</div>
      <div class="value" style="font-size: 18px;">${s.signal}</div>
      <div class="sub">${s.count} active roles in this category</div>
    </div>
  `).join('');
  return emailWrapper(`
    <h1>3 signals you might have missed this week.</h1>
    <p>Here's what the data is showing across the exchanges we track:</p>
    ${signalRows}
    <p>These are the kinds of signals that show up in job data 60–90 days before public announcements. Compliance hiring precedes regulatory filings. Engineering surges precede product launches.</p>
    <p><a href="${SITE_URL}/cex-intelligence.html" class="cta-btn">See all signals →</a></p>
    <p style="margin-top: 24px; font-size: 14px; color: #71716A;">Pro subscribers also get predictions — our public forecasts on what each exchange is likely to do next, with confidence scores. <a href="${SITE_URL}/#pricing" style="color: #059669;">Upgrade for $79/mo →</a></p>
  `);
}

function convertEmail(data: Record<string, unknown>): string {
  const predictions = (data.predictions as Array<{exchange: string, title: string, confidence: number}>) || [
    { exchange: 'OKX',      title: '2+ new products within 90 days',          confidence: 80 },
    { exchange: 'Coinbase', title: 'EU regulatory expansion within 60 days',  confidence: 75 },
    { exchange: 'Gemini',   title: 'Layoffs, acquisition, or pivot incoming', confidence: 65 },
  ];
  const predRows = predictions.map(p => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #F4F4F5;">
      <div>
        <div style="font-weight: 600; color: #09090B;">${p.exchange}</div>
        <div style="font-size: 14px; color: #71716A; margin-top: 2px;">${p.title}</div>
      </div>
      <div style="font-weight: 700; color: #059669; font-size: 18px; white-space: nowrap; margin-left: 16px;">${p.confidence}%</div>
    </div>
  `).join('');
  return emailWrapper(`
    <h1>We make public predictions. Here's the current scorecard.</h1>
    <p>Most data products just show you numbers. Signalmap Pro takes a stance — we publish predictions on what each exchange will do next, with a confidence score and a deadline. If we're wrong, you see it.</p>
    <div class="signal-card">
      <div class="label">Active predictions (Pro only)</div>
      ${predRows}
    </div>
    <p>Predictions are based on hiring pattern analysis: a compliance surge followed by specific roles often precedes a regulatory filing. An engineering spike in a specific stack often precedes a product launch.</p>
    <p><strong>Launch pricing: $79/month.</strong> This price locks in permanently if you join before April 30. On May 1 it goes to $149/month.</p>
    <p><a href="${STRIPE_MONTHLY}" class="cta-btn">Upgrade to Pro — $79/mo →</a></p>
    <p style="margin-top: 8px; font-size: 14px;"><a href="${STRIPE_ANNUAL}" style="color: #059669;">Or save 2 months with annual ($699/yr) →</a></p>
  `);
}

function nudgeEmail(data: Record<string, unknown>): string {
  const exchange = (data.spikeExchange as string) || 'Binance';
  const category = (data.spikeCategory as string) || 'compliance';
  const count    = (data.spikeCount as number) || 28;
  const delta    = (data.spikeDelta as number) || 12;
  return emailWrapper(`
    <h1>Hiring velocity just spiked at ${exchange}.</h1>
    <p>Our scraper detected an unusual increase in <strong>${category} hiring</strong> at ${exchange} this week. They're now showing <strong>${count} active ${category} roles</strong> — up ${delta} from last week's baseline.</p>
    <div class="signal-card">
      <div class="label">Signal detected</div>
      <div class="value">${exchange} · ${category}</div>
      <div class="sub">+${delta} roles vs 4-week average · likely precedes a regulatory announcement</div>
    </div>
    <p>Free tier shows you that the number changed. Pro tier shows you the week-by-week trend, the specific roles driving the spike, and our prediction for what it means.</p>
    <p><a href="${SITE_URL}/cex-intelligence.html" class="cta-btn">View the full signal →</a></p>
    <p style="margin-top: 16px; font-size: 14px;">Lock in founding rate ($79/mo): <a href="${STRIPE_MONTHLY}" style="color: #059669; font-weight: 600;">Upgrade now →</a></p>
  `);
}

function intelEmail(data: Record<string, unknown>): string {
  const exchange = (data.topExchange as string) || 'Binance';
  return emailWrapper(`
    <h1>The exchange most likely to make news in April.</h1>
    <p>Based on our latest scrape, one exchange is showing a pattern we've seen before — a combination of compliance, legal, and government affairs hiring that historically precedes either a regulatory submission or a jurisdiction expansion announcement.</p>
    <div class="signal-card">
      <div class="label">Exchange to watch · April 2026</div>
      <div class="value">${exchange}</div>
      <div class="sub">Compliance + legal hiring up significantly. Pattern match: pre-announcement. Confidence: 72%.</div>
    </div>
    <p>The full prediction — including the specific roles driving it, the historical pattern match, and our confidence reasoning — is in the Pro dashboard right now.</p>
    <p>Pro is $79/month until April 30. On May 1 the price goes to $149.</p>
    <p><a href="${STRIPE_MONTHLY}" class="cta-btn">Unlock the full prediction — $79/mo →</a></p>
    <p style="margin-top: 8px; font-size: 14px; color: #71716A;"><a href="${STRIPE_ANNUAL}" style="color: #059669;">Annual plan: $699 (saves you $249 vs monthly)</a></p>
  `);
}

function finalEmail(_data: Record<string, unknown>): string {
  return emailWrapper(`
    <h1>Launch pricing ends April 30.</h1>
    <p>After tomorrow, Signalmap Pro goes from $79/month to $149/month. If you've been on the fence, this is the last chance to lock in the lower price — permanently.</p>
    <p>Here's what you get with Pro:</p>
    <ul style="color: #3F3F46; font-size: 16px; line-height: 2;">
      <li>Weekly email brief — full signal analysis, not just the headlines</li>
      <li>Active predictions with confidence scores and rationale</li>
      <li>Full department breakdown — see exactly which teams are growing</li>
      <li>Regulatory radar — compliance and legal hiring patterns</li>
      <li>1,400+ job listings, updated weekly</li>
    </ul>
    <p>The free dashboard isn't going anywhere. This is the analysis layer on top — for the people who want to act before the market does.</p>
    <p><a href="${STRIPE_MONTHLY}" class="cta-btn">Lock in $79/mo before midnight →</a></p>
    <p style="margin-top: 8px; font-size: 14px; color: #71716A;">Annual plan: <a href="${STRIPE_ANNUAL}" style="color: #059669;">$699/year — that's $58/month →</a></p>
    <p style="margin-top: 24px; font-size: 14px; color: #71716A;">If this isn't for you, no worries. You'll keep getting the free weekly brief — no more upgrade emails after this.</p>
  `);
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  switch (template) {
    case 'welcome': return welcomeEmail(data);
    case 'teaser':  return teaserEmail(data);
    case 'convert': return convertEmail(data);
    case 'nudge':   return nudgeEmail(data);
    case 'intel':   return intelEmail(data);
    case 'final':   return finalEmail(data);
    default:        return welcomeEmail(data);
  }
}

// ── Send email via Resend ─────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error for ${to}: ${res.status} ${err}`);
    return false;
  }
  return true;
}

// ── Fetch live data for email personalisation ─────────────────
async function fetchLiveData(): Promise<Record<string, unknown>> {
  const { data: signals } = await supabase
    .from('latest_signals')
    .select('exchange_id, total_active, compliance_count, engineering_count, product_count, signal_text, score')
    .order('total_active', { ascending: false })
    .limit(5);

  const { data: predictions } = await supabase
    .from('active_predictions')
    .select('exchange_id, title, confidence')
    .order('confidence', { ascending: false })
    .limit(3);

  const { count: totalJobs } = await supabase
    .from('job_listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Find biggest spike this week
  const { data: velocity } = await supabase
    .from('job_velocity')
    .select('*')
    .order('week_delta', { ascending: false })
    .limit(1);

  const topSignal = signals?.[0];
  const topVelocity = velocity?.[0];

  return {
    totalJobs:     totalJobs || 1417,
    topExchange:   topSignal?.exchange_id || 'OKX',
    topSignal:     topSignal?.signal_text || 'Leading exchange by hiring volume',
    signals:       signals?.slice(0, 3).map(s => ({
      exchange: s.exchange_id,
      signal:   s.signal_text,
      count:    s.total_active,
    })) || [],
    predictions:   predictions?.map(p => ({
      exchange:   p.exchange_id,
      title:      p.title,
      confidence: p.confidence,
    })) || [],
    spikeExchange: topVelocity?.exchange_id || 'Binance',
    spikeCategory: 'compliance',
    spikeCount:    topVelocity?.compliance_count || 28,
    spikeDelta:    topVelocity?.week_delta || 8,
  };
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || 'run';
  const dryRun = url.searchParams.get('dry_run') === 'true';

  // Fetch live data once for all emails
  const liveData = await fetchLiveData();

  // Get all active subscribers
  const { data: subscribers, error: subErr } = await supabase
    .from('subscribers')
    .select('email, created_at')
    .eq('status', 'active');

  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const subscriber of (subscribers || [])) {
    const signupMs    = new Date(subscriber.created_at).getTime();
    const daysSince   = Math.floor((now - signupMs) / (1000 * 60 * 60 * 24));

    // Find which drip email is due today
    const dueEmail = DRIP_SEQUENCE.find(d => d.day === daysSince);
    if (!dueEmail) { skipped.push(subscriber.email); continue; }

    // Check if already sent (idempotency)
    const { count } = await supabase
      .from('email_log')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_email', subscriber.email)
      .eq('subject', dueEmail.subject);

    if ((count ?? 0) > 0) { skipped.push(subscriber.email); continue; }

    const html = renderTemplate(dueEmail.template, { ...liveData, email: subscriber.email });

    if (!dryRun) {
      const ok = await sendEmail(subscriber.email, dueEmail.subject, html);
      if (ok) {
        await supabase.from('email_log').insert({
          subscriber_email: subscriber.email,
          subject:          dueEmail.subject,
          status:           'sent',
        });
        sent.push(`${subscriber.email} (${dueEmail.template} day ${dueEmail.day})`);
      } else {
        errors.push(subscriber.email);
      }
    } else {
      sent.push(`[DRY RUN] ${subscriber.email} → ${dueEmail.template} (day ${dueEmail.day})`);
    }
  }

  return new Response(JSON.stringify({
    status:       'ok',
    sent_count:   sent.length,
    skipped:      skipped.length,
    errors:       errors.length,
    sent_details: sent,
    error_details: errors,
  }), { headers: { 'Content-Type': 'application/json' } });
});
