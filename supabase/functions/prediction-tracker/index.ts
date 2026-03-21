// ============================================================
// SIGNALMAP PREDICTION TRACKER
// Runs daily. Sends alert emails when:
//   - A prediction deadline is 7 days away (urgency alert)
//   - A prediction is marked resolved (outcome alert → viral moment)
// Also updates prediction status based on deadline
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL     = 'Signalmap <signal@signalmap.live>';
const SITE_URL       = 'https://signalmap.live';
const STRIPE_MONTHLY = 'https://buy.stripe.com/eVqaEX9n27ee4CH22R8k800';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Prediction {
  id: string;
  exchange_id: string;
  title: string;
  rationale: string;
  confidence: number;
  horizon: string;
  status: string;
  issued_at: string;
  deadline?: string;
}

interface Subscriber {
  email: string;
}

// ── Email sending ─────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .c{max-width:600px;margin:0 auto;padding:40px 20px}
  .logo{font-size:18px;font-weight:700;color:#059669;letter-spacing:.05em;margin-bottom:32px}
  .logo span{font-weight:300}
  h1{font-size:26px;font-weight:700;color:#09090B;line-height:1.3;margin:0 0 16px}
  p{font-size:16px;line-height:1.7;color:#3F3F46;margin:0 0 16px}
  .card{background:#fff;border:1px solid #E4E4E7;border-radius:12px;padding:20px 24px;margin:24px 0}
  .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#71716A;margin-bottom:8px}
  .cta{display:inline-block;background:#059669;color:#fff!important;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0}
  .conf{font-size:32px;font-weight:700;color:#059669}
  .hit{background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:20px 24px;margin:24px 0}
  hr{border:none;border-top:1px solid #E4E4E7;margin:32px 0}
  .footer{font-size:13px;color:#A1A1AA;line-height:1.6}
  .footer a{color:#A1A1AA}
</style></head><body>
<div class="c">
  <div class="logo">SIGNAL<span>MAP</span></div>
  ${content}
  <hr>
  <div class="footer">
    <p>You're receiving this because you subscribed at <a href="${SITE_URL}">signalmap.live</a>.<br>
    <a href="${SITE_URL}/unsubscribe?email={{email}}">Unsubscribe</a></p>
  </div>
</div></body></html>`;
}

// ── Deadline approaching email (free subscribers) ─────────────
function deadlineEmail(p: Prediction, daysLeft: number): string {
  return emailWrapper(`
    <h1>A Signalmap prediction expires in ${daysLeft} days.</h1>
    <p>Back in ${new Date(p.issued_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, we published a prediction about <strong>${p.exchange_id}</strong>:</p>
    <div class="card">
      <div class="label">${p.exchange_id} · ${daysLeft} days remaining</div>
      <div style="font-size:20px;font-weight:700;color:#09090B;margin-bottom:8px;">"${p.title}"</div>
      <div class="conf">${p.confidence}% confidence</div>
      <p style="font-size:14px;color:#71716A;margin-top:8px;">${p.rationale}</p>
    </div>
    <p>Pro subscribers can see the full predictions tab — all active predictions with confidence scores, rationale, and outcome tracking.</p>
    <p><a href="${STRIPE_MONTHLY}" class="cta">See all predictions — $79/mo →</a></p>
  `);
}

// ── Prediction hit email (all subscribers — viral moment) ──────
function predictionHitEmail(p: Prediction): string {
  return emailWrapper(`
    <div class="hit">
      <div class="label">✓ Prediction confirmed</div>
      <h1 style="margin:8px 0;">${p.exchange_id}: "${p.title}"</h1>
      <p style="color:#065F46;">We called it ${Math.floor((Date.now() - new Date(p.issued_at).getTime()) / (1000 * 60 * 60 * 24))} days ago with ${p.confidence}% confidence.</p>
    </div>
    <p>Here's the rationale we published when we made this prediction:</p>
    <div class="card">
      <div class="label">Original analysis</div>
      <p style="margin:0;font-size:15px;color:#3F3F46;">${p.rationale}</p>
    </div>
    <p>We make these predictions public because the methodology works. Hiring data is one of the most reliable leading indicators in crypto — it moves months before press releases.</p>
    <p>We currently have ${'{active_count}'} more active predictions. Pro subscribers see them all.</p>
    <p><a href="${STRIPE_MONTHLY}" class="cta">Upgrade to Pro — $79/mo →</a></p>
    <p style="font-size:14px;color:#71716A;margin-top:8px;">Or share this signal: <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`@signalmap called it: ${p.exchange_id} — "${p.title}" — ${p.confidence}% confidence prediction confirmed. signalmap.live`)}" style="color:#059669;">Post on Twitter →</a></p>
  `);
}

// ── Prediction miss email (builds trust) ──────────────────────
function predictionMissEmail(p: Prediction): string {
  return emailWrapper(`
    <h1>We got one wrong. Here's the full breakdown.</h1>
    <p>Transparency is core to what we do. Our prediction about <strong>${p.exchange_id}</strong> expired without resolving:</p>
    <div class="card">
      <div class="label">${p.exchange_id} · expired</div>
      <div style="font-size:18px;font-weight:700;color:#09090B;margin-bottom:8px;">"${p.title}"</div>
      <div style="font-size:22px;font-weight:700;color:#DC2626;">${p.confidence}% confidence → did not resolve</div>
    </div>
    <p>Our analysis was based on ${p.rationale.toLowerCase()} — but the hiring signals didn't translate to the expected outcome within the timeframe. We'll publish a post-mortem analysis on the blog.</p>
    <p>Our overall prediction accuracy is tracked publicly on the <a href="${SITE_URL}/scorecard.html" style="color:#059669;">prediction scorecard</a>.</p>
    <p style="font-size:14px;color:#71716A;">Being wrong builds better models. We track every prediction publicly so you can judge the methodology over time.</p>
  `);
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  // Fetch all active predictions
  const { data: predictions, error: predErr } = await supabase
    .from('predictions')
    .select('*')
    .eq('status', 'active');

  if (predErr) {
    return new Response(JSON.stringify({ error: predErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch all active subscribers
  const { data: subscribers } = await supabase
    .from('subscribers')
    .select('email')
    .eq('status', 'active');

  const allEmails = (subscribers || []).map((s: Subscriber) => s.email);
  const now       = Date.now();
  const actions: string[] = [];

  for (const pred of (predictions || []) as Prediction[]) {
    // Calculate deadline from issued_at + horizon (e.g., "90 days")
    const issuedMs  = new Date(pred.issued_at).getTime();
    const horizonDays = parseInt(pred.horizon) || 90;
    const deadlineMs  = issuedMs + horizonDays * 24 * 60 * 60 * 1000;
    const daysLeft    = Math.floor((deadlineMs - now) / (1000 * 60 * 60 * 24));

    // Mark expired predictions
    if (daysLeft < 0 && pred.status === 'active') {
      if (!dryRun) {
        await supabase.from('predictions').update({ status: 'expired' }).eq('id', pred.id);
      }
      actions.push(`Marked expired: ${pred.exchange_id} — "${pred.title}"`);

      // Send miss email to all subscribers
      const subject = `Signalmap prediction expired: ${pred.exchange_id} — "${pred.title}"`;
      const logKey  = `prediction_miss_${pred.id}`;
      const { count } = await supabase
        .from('email_log')
        .select('*', { count: 'exact', head: true })
        .eq('subject', subject);

      if ((count ?? 0) === 0 && !dryRun) {
        for (const email of allEmails) {
          const html = predictionMissEmail(pred).replace('{{email}}', email);
          await sendEmail(email, subject, html);
          await new Promise(r => setTimeout(r, 100)); // rate limit
        }
        await supabase.from('email_log').insert({
          subscriber_email: 'broadcast',
          subject,
          status: 'sent',
        });
      }
      continue;
    }

    // 7-day deadline warning
    if (daysLeft === 7) {
      actions.push(`7-day warning: ${pred.exchange_id} — "${pred.title}"`);
      const subject = `${pred.exchange_id} prediction expires in 7 days — ${pred.confidence}% confidence`;
      const { count } = await supabase
        .from('email_log')
        .select('*', { count: 'exact', head: true })
        .eq('subject', subject);

      if ((count ?? 0) === 0 && !dryRun) {
        for (const email of allEmails) {
          const html = deadlineEmail(pred, 7).replace('{{email}}', email);
          await sendEmail(email, subject, html);
          await new Promise(r => setTimeout(r, 100));
        }
        await supabase.from('email_log').insert({
          subscriber_email: 'broadcast',
          subject,
          status: 'sent',
        });
      }
    }
  }

  // Check for newly resolved predictions (status = 'correct')
  const { data: resolvedPreds } = await supabase
    .from('predictions')
    .select('*')
    .eq('status', 'correct');

  const { count: activeCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  for (const pred of (resolvedPreds || []) as Prediction[]) {
    const subject = `✓ Called it: ${pred.exchange_id} — "${pred.title}" (${pred.confidence}% confidence)`;
    const { count } = await supabase
      .from('email_log')
      .select('*', { count: 'exact', head: true })
      .eq('subject', subject);

    if ((count ?? 0) === 0) {
      actions.push(`Sending hit email: ${pred.exchange_id} — "${pred.title}"`);
      if (!dryRun) {
        for (const email of allEmails) {
          const html = predictionHitEmail(pred)
            .replace('{{email}}', email)
            .replace('{active_count}', String(activeCount || 0));
          await sendEmail(email, subject, html);
          await new Promise(r => setTimeout(r, 100));
        }
        await supabase.from('email_log').insert({
          subscriber_email: 'broadcast',
          subject,
          status: 'sent',
        });
        // Mark as announced
        await supabase.from('predictions').update({ status: 'announced' }).eq('id', pred.id);
      }
    }
  }

  return new Response(JSON.stringify({
    status:      'ok',
    dry_run:     dryRun,
    predictions: (predictions || []).length,
    subscribers: allEmails.length,
    actions,
  }), { headers: { 'Content-Type': 'application/json' } });
});
