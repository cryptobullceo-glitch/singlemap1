// job-alerts/index.ts
// Deployed via Supabase MCP — runs daily via pg_cron at 07:00 UTC
// POST body: { lookback_hours?: number }   GET: preview mode (no emails sent)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'alerts@signalmap.live';

const EXCHANGE_META: Record<string, { name: string; color: string; context: string; page: string }> = {
  binance:   { name:'Binance',   color:'#F3BA2F', context:'World\'s largest exchange by volume. Hiring signals often precede product launches in new regions.', page:'/binance-hiring' },
  coinbase:  { name:'Coinbase',  color:'#0052FF', context:'US-listed, heavily regulated. Compliance and legal hires often foreshadow regulatory filings.', page:'/coinbase-hiring' },
  okx:       { name:'OKX',      color:'#121212', context:'Major global exchange expanding into Western markets. Product hires signal new verticals.', page:'/okx-hiring' },
  bybit:     { name:'Bybit',    color:'#F7A600', context:'Derivatives-focused exchange. Engineering hires often tie to new trading infrastructure.', page:'/bybit-hiring' },
  kraken:    { name:'Kraken',   color:'#5741D9', context:'Long-standing exchange with strong compliance posture. Regulatory hires are high-signal.', page:'/kraken-hiring' },
  kucoin:    { name:'KuCoin',   color:'#24AE8F', context:'Global retail exchange. Marketing hires often precede major growth campaigns.', page:'/kucoin-hiring' },
  gemini:    { name:'Gemini',   color:'#00DCFA', context:'NY-licensed exchange. Legal/compliance hires closely track regulatory engagement.', page:'/gemini-hiring' },
  bitget:    { name:'Bitget',   color:'#00F0FF', context:'Copy-trading focused. Product hires often signal new social trading features.', page:'/bitget-hiring' },
  htx:       { name:'HTX',      color:'#1E80FF', context:'Huobi rebranded. Global footprint, active in Asia and Middle East expansion.', page:'/htx-hiring' },
  gate:      { name:'Gate.io',  color:'#2354E6', context:'Wide token listings. Engineering hires often relate to new chain integrations.', page:'/gate-hiring' },
  mexc:      { name:'MEXC',     color:'#2B6AFF', context:'Fast listing exchange. Operations hires signal scaling for new market makers.', page:'/mexc-hiring' },
  cryptocom: { name:'Crypto.com', color:'#103F68', context:'Consumer brand focus. Marketing hires tend to precede major ad campaigns.', page:'/cryptocom-hiring' },
};

const DEPT_ANALYSIS: Record<string, string> = {
  compliance: 'Compliance hiring is a leading indicator of regulatory expansion — new jurisdictions, license applications, or regulatory response.',
  engineering: 'Engineering growth signals product velocity. Look at seniority and specialisation for clues on the tech roadmap.',
  product: 'Product hires reveal feature direction. Senior PMs joining often precede a major launch cycle.',
  marketing: 'Marketing scale-up typically precedes a user acquisition push — watch for new regional or demographic targeting.',
  operations: 'Operations hires signal volume growth expectations or geographic expansion into new markets.',
  legal: 'Legal hiring, distinct from compliance, often means M&A activity, licensing deals, or litigation preparation.',
  finance: 'Finance team growth can mean IPO preparation, treasury expansion, or new revenue line accounting.',
  sales: 'Sales/BD hires signal B2B expansion — new institutional clients, exchange partnerships, or OTC desks.',
  security: 'Security hiring after an incident is reactive; proactive security hires signal maturity or custody product launch.',
  risk: 'Risk team expansion often precedes new derivatives products or leverage offering changes.',
  data: 'Data/analytics hiring signals investment in internal intelligence — often a precursor to algo trading or risk models.',
};

const SENIORITY_RANK: Record<string, number> = { any:0, senior:1, vp_head:2, c_suite:3 };

function getSeniority(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cpo|chief)\b/.test(t)) return 'c_suite';
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return 'vp_head';
  if (/\bsenior\b|sr\.?\s|\blead\b|\bprincipal\b|\bstaff\b/.test(t)) return 'senior';
  return 'mid';
}

function matchesAlert(job: any, alert: any): boolean {
  if (alert.exchange_id && job.exchange_id !== alert.exchange_id) return false;
  if (alert.department && job.department !== alert.department) return false;
  if (alert.min_seniority && alert.min_seniority !== 'any') {
    const jobRank   = SENIORITY_RANK[getSeniority(job.title)] ?? 0;
    const alertRank = SENIORITY_RANK[alert.min_seniority] ?? 0;
    if (jobRank < alertRank) return false;
  }
  if (alert.keyword) {
    const needle = alert.keyword.toLowerCase();
    const haystack = `${job.title} ${job.department ?? ''} ${job.location ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildEmail(job: any, alert: any): string {
  const ex   = EXCHANGE_META[job.exchange_id] ?? { name: job.exchange_id, color: '#059669', context: '', page: '/intelligence' };
  const dept = DEPT_ANALYSIS[job.department ?? ''] ?? 'This hire is worth tracking as part of the broader talent movement at this exchange.';
  const seniority = getSeniority(job.title);
  const seniorityLabel: Record<string, string> = { mid:'Mid-level', senior:'Senior', vp_head:'VP / Head', c_suite:'C-Suite' };

  return `
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F4;font-family:'Inter',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="https://signalmap.live" style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:800;color:#059669;text-decoration:none;letter-spacing:.05em;">SIGNALMAP</a>
    <p style="font-size:12px;color:#6B7280;margin:4px 0 0;">Job alert fired</p>
  </div>

  <!-- Job Card -->
  <div style="background:#fff;border:1.5px solid #E4E4E1;border-radius:16px;overflow:hidden;margin-bottom:20px;">
    <div style="border-left:4px solid ${ex.color};padding:20px 24px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6B7280;margin-bottom:6px;">${ex.name}</div>
      <div style="font-size:1.15rem;font-weight:700;color:#0A0A0B;margin-bottom:8px;">${job.title}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        ${job.department ? `<span style="font-size:12px;padding:3px 10px;background:#EFF6FF;color:#1D4ED8;border-radius:100px;font-weight:600;">${job.department}</span>` : ''}
        ${job.location   ? `<span style="font-size:12px;padding:3px 10px;background:#F7F7F4;color:#6B7280;border-radius:100px;">${job.location}</span>` : ''}
        <span style="font-size:12px;padding:3px 10px;background:#FAF5FF;color:#7C3AED;border-radius:100px;font-weight:600;">${seniorityLabel[seniority] ?? 'Unknown'}</span>
      </div>
      ${job.url ? `<a href="${job.url}" style="display:inline-block;background:#0A0A0B;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;">View job posting →</a>` : ''}
    </div>
  </div>

  <!-- Analysis -->
  <div style="background:#ECFDF5;border:1px solid rgba(5,150,105,.2);border-radius:12px;padding:18px 20px;margin-bottom:16px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#059669;margin-bottom:6px;">What this hire signals</div>
    <p style="font-size:14px;color:#065F46;line-height:1.6;margin:0;">${dept}</p>
  </div>

  <!-- Exchange Context -->
  ${ex.context ? `
  <div style="background:#fff;border:1.5px solid #E4E4E1;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6B7280;margin-bottom:6px;">${ex.name} context</div>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0;">${ex.context}</p>
  </div>` : ''}

  <!-- CTA Row -->
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px;">
    <a href="https://signalmap.live${ex.page}" style="flex:1;min-width:140px;display:block;text-align:center;background:#059669;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700;font-size:14px;">${ex.name} hiring intel →</a>
    <a href="https://signalmap.live/predictions" style="flex:1;min-width:140px;display:block;text-align:center;background:#F7F7F4;color:#0A0A0B;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;border:1.5px solid #E4E4E1;">View predictions →</a>
  </div>

  <!-- Alert footer -->
  <div style="border-top:1px solid #E4E4E1;padding-top:20px;text-align:center;">
    <p style="font-size:12px;color:#9CA3AF;margin:0 0 6px;">You're receiving this because you set up a job alert on Signalmap.</p>
    <a href="https://signalmap.live/alerts" style="font-size:12px;color:#059669;text-decoration:none;font-weight:600;">Manage your alerts →</a>
  </div>
</div>
</body></html>`;
}

async function processAlerts(supabase: any, lookbackHours = 25, preview = false) {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

  const { data: jobs, error: jobErr } = await supabase
    .from('job_listings')
    .select('id,exchange_id,title,department,location,url,first_seen')
    .gte('first_seen', since)
    .eq('is_active', true);
  if (jobErr) throw jobErr;

  const { data: alerts, error: alertErr } = await supabase
    .from('alerts')
    .select('*')
    .eq('active', true);
  if (alertErr) throw alertErr;

  const results: any[] = [];

  for (const alert of alerts ?? []) {
    const matches = (jobs ?? []).filter((j: any) => matchesAlert(j, alert));
    for (const job of matches) {
      // Deduplication check
      const { data: existing } = await supabase
        .from('alert_log')
        .select('id')
        .eq('alert_id', alert.id)
        .eq('job_listing_id', job.id)
        .maybeSingle();
      if (existing) continue;

      if (!preview) {
        // Send email via Resend
        const emailBody = buildEmail(job, alert);
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: alert.email,
            subject: `Signal: ${EXCHANGE_META[job.exchange_id]?.name ?? job.exchange_id} is hiring ${job.title}`,
            html: emailBody,
          }),
        });
        if (!res.ok) { console.error('Resend error', await res.text()); continue; }

        // Log it
        await supabase.from('alert_log').insert({ alert_id: alert.id, job_listing_id: job.id });
        await supabase.from('alerts').update({ last_triggered_at: new Date().toISOString() }).eq('id', alert.id);
      }

      results.push({ alert_id: alert.id, email: alert.email, job_id: job.id, job_title: job.title, exchange: job.exchange_id });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  const supabase = createClient(SB_URL, SB_KEY);
  const preview  = req.method === 'GET';

  let lookbackHours = 25;
  if (!preview) {
    try { const b = await req.json(); lookbackHours = b.lookback_hours ?? 25; } catch (_) {}
  }

  try {
    const results = await processAlerts(supabase, lookbackHours, preview);
    return new Response(JSON.stringify({ ok: true, preview, matched: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
