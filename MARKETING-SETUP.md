# Signalmap — Marketing Automation Setup

Everything runs automatically once you add these credentials. Total one-time setup: ~30 minutes.

---

## What runs automatically after setup

| When | What |
|------|------|
| Every hour | Scraper updates job listings |
| Every day 7am UTC | Email drip sequence + prediction tracker |
| Every Monday 8am UTC | Weekly newsletter (auto-email edge function) |
| Every Monday 9am UTC | Twitter thread posted |
| Every Monday 9am UTC | Reddit post submitted |
| Every Monday 9am UTC | LinkedIn update posted |

---

## Step 1: Resend (email — REQUIRED FIRST)

Without Resend, no emails go out. Set this up before anything else.

1. Go to [resend.com](https://resend.com) and create an account
2. Add your domain `signalmap.live` → add the DNS records it shows you in Namecheap
3. Create an API key (Sending Access)
4. In Supabase Dashboard → Edge Functions → Secrets → Add:
   - Key: `RESEND_API_KEY`
   - Value: `re_xxxxxxxxxxxx`
5. Also add `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API → service_role key)

**Deploy the edge functions:**
```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref ufrscgfutnjzfsvaxzmf

# Deploy email drip
supabase functions deploy email-drip --no-verify-jwt

# Deploy prediction tracker
supabase functions deploy prediction-tracker --no-verify-jwt
```

**Test the drip (dry run):**
```
curl "https://ufrscgfutnjzfsvaxzmf.supabase.co/functions/v1/email-drip?dry_run=true" \
  -H "Authorization: Bearer <anon_key>"
```

---

## Step 2: Twitter / X (fully automated threads every Monday)

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Create a new App (or use existing). Make sure it has **Read and Write** permissions
3. Under **Keys and Tokens** → generate:
   - API Key & Secret
   - Access Token & Secret (for your account)
4. In GitHub → repo Settings → Secrets and Variables → Actions → New repository secret:

| Secret Name | Value |
|-------------|-------|
| `TWITTER_APP_KEY` | Your API Key |
| `TWITTER_APP_SECRET` | Your API Key Secret |
| `TWITTER_ACCESS_TOKEN` | Access Token |
| `TWITTER_ACCESS_SECRET` | Access Token Secret |

**Test manually:**
Go to Actions tab → "Signalmap Weekly Marketing" → Run workflow → channels: `twitter`

---

## Step 3: Reddit (weekly data posts)

1. Go to [reddit.com/prefs/apps](https://reddit.com/prefs/apps)
2. Create a new app → type: **script**
3. Name: `signalmap-poster`, redirect: `http://localhost:8080`
4. Note your `client_id` (under app name) and `client_secret`
5. Add to GitHub Secrets:

| Secret Name | Value |
|-------------|-------|
| `REDDIT_CLIENT_ID` | App client_id |
| `REDDIT_CLIENT_SECRET` | App client_secret |
| `REDDIT_USERNAME` | Your Reddit username |
| `REDDIT_PASSWORD` | Your Reddit password |

**Important notes:**
- Reddit account must be 30+ days old to post in large subs
- r/CryptoCurrency requires verified email
- Post at most once per week to avoid spam detection
- First few posts: manually verify in r/CryptoCurrency that flairs/rules are correct

---

## Step 4: LinkedIn (company page or personal)

LinkedIn has the most complex auth. Two options:

### Option A: Personal profile (simpler)
1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/) → Create App
2. Products: add "Share on LinkedIn" and "Sign In with LinkedIn"
3. Auth → OAuth 2.0 → get Access Token with scope `w_member_social`
4. Get your URN: call `GET https://api.linkedin.com/v2/me` → copy `id` → your URN is `urn:li:person:{id}`
5. Add to GitHub Secrets:

| Secret Name | Value |
|-------------|-------|
| `LINKEDIN_ACCESS_TOKEN` | OAuth access token |
| `LINKEDIN_AUTHOR_URN` | `urn:li:person:XXXXXXX` |

### Option B: Company page (recommended for brand)
Same as above but use `urn:li:organization:{orgId}` and get `w_organization_social` scope.

**Note:** LinkedIn OAuth tokens expire after 60 days. Set a reminder to refresh every 2 months.

---

## Step 5: Add GitHub Actions secrets for Supabase

These are needed for the daily email workflow trigger:

| Secret Name | Value |
|-------------|-------|
| `SUPABASE_ANON_KEY` | From Supabase → Settings → API → anon key |

(SUPABASE_URL and SUPABASE_SERVICE_KEY should already be set for the scraper)

---

## Verification checklist

- [ ] Resend domain verified (check DNS in Resend dashboard)
- [ ] `RESEND_API_KEY` added to Supabase Edge Function secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to Supabase Edge Function secrets
- [ ] `email-drip` function deployed to Supabase
- [ ] `prediction-tracker` function deployed to Supabase
- [ ] Twitter credentials in GitHub Secrets (4 values)
- [ ] Reddit credentials in GitHub Secrets (4 values)
- [ ] LinkedIn credentials in GitHub Secrets (2 values)
- [ ] `SUPABASE_ANON_KEY` in GitHub Secrets
- [ ] Ran weekly marketing workflow manually (channels: `all`) — verify posts appeared
- [ ] Ran email drip with `dry_run=true` — verify output looks correct

---

## Troubleshooting

**Emails not sending:** Check Resend dashboard → Logs. Common issue: domain not verified yet.

**Twitter 403:** API app doesn't have Write permission. Enable in Twitter Developer Portal → App Settings → User authentication settings.

**Reddit 403:** Account too new, or post violates sub rules. Check r/CryptoCurrency rules.

**LinkedIn 401:** Token expired (60-day limit). Re-generate and update secret.

**Drip function 500:** `SUPABASE_SERVICE_ROLE_KEY` not set. Add it in Supabase → Edge Functions → Secrets.
