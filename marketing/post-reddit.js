// ============================================================
// SIGNALMAP REDDIT AUTO-POSTER
// Reads /tmp/marketing-content.json and posts to r/CryptoCurrency
// Uses Reddit API (OAuth2 script app)
//
// Required GitHub Secrets:
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET,
//   REDDIT_USERNAME, REDDIT_PASSWORD
//
// Notes:
//   - Reddit requires account to be 30+ days old to post in large subs
//   - r/CryptoCurrency requires verified email on account
//   - Post max 1x per week per subreddit to avoid spam flags
// ============================================================

import fetch       from 'node-fetch';
import { readFileSync } from 'fs';

const REDDIT_CLIENT_ID     = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USERNAME      = process.env.REDDIT_USERNAME;
const REDDIT_PASSWORD      = process.env.REDDIT_PASSWORD;
const USER_AGENT           = 'SignalmapBot/1.0 (by /u/signalmap)';

// ── Reddit auth ───────────────────────────────────────────────
async function getAccessToken() {
  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'User-Agent':     USER_AGENT,
      'Content-Type':   'application/x-www-form-urlencoded',
    },
    body: `grant_type=password&username=${encodeURIComponent(REDDIT_USERNAME)}&password=${encodeURIComponent(REDDIT_PASSWORD)}`,
  });

  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (data.error) throw new Error(`Auth error: ${data.error}`);
  return data.access_token;
}

// ── Submit post ───────────────────────────────────────────────
async function submitPost(token, subreddit, title, text) {
  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent':     USER_AGENT,
      'Content-Type':   'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      api_type: 'json',
      kind:     'self',
      sr:       subreddit,
      title,
      text,
      nsfw:     'false',
      spoiler:  'false',
    }).toString(),
  });

  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  const data = await res.json();

  if (data.json?.errors?.length) {
    throw new Error(`Reddit errors: ${JSON.stringify(data.json.errors)}`);
  }

  return data.json?.data?.url || 'unknown';
}

// ── Also post to smaller subs for reach ──────────────────────
const SUBREDDITS = [
  { sub: 'CryptoCurrency',   flair: null },
  { sub: 'CryptoMarkets',    flair: null },
  { sub: 'BitcoinMarkets',   flair: null },
];

async function main() {
  const required = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing credentials: ${missing.join(', ')}`);
    console.error('Add these to GitHub Secrets. See MARKETING-SETUP.md.');
    process.exit(1);
  }

  let content;
  try {
    content = JSON.parse(readFileSync('/tmp/marketing-content.json', 'utf8'));
  } catch {
    console.error('No content file found. Run generate-content.js first.');
    process.exit(1);
  }

  const { reddit_post } = content;
  if (!reddit_post) {
    console.error('No reddit post in content file');
    process.exit(1);
  }

  console.log('Authenticating with Reddit...');
  const token = await getAccessToken();
  console.log('✓ Auth successful\n');

  // Post to primary subreddit only (to avoid spam detection)
  const target = SUBREDDITS[0];
  console.log(`Posting to r/${target.sub}...`);
  console.log(`Title: ${reddit_post.title}`);

  try {
    const url = await submitPost(token, target.sub, reddit_post.title, reddit_post.body);
    console.log(`✓ Posted: ${url}`);
  } catch (err) {
    console.error(`Failed r/${target.sub}: ${err.message}`);
    // Try backup sub
    try {
      console.log(`Trying r/${SUBREDDITS[1].sub}...`);
      const url = await submitPost(token, SUBREDDITS[1].sub, reddit_post.title, reddit_post.body);
      console.log(`✓ Posted to backup: ${url}`);
    } catch (err2) {
      console.error(`Backup also failed: ${err2.message}`);
    }
  }
}

main().catch(err => {
  console.error('Reddit post failed:', err.message);
  process.exit(0); // Don't fail CI on marketing errors
});
