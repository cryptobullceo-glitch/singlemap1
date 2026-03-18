// ============================================================
// SIGNALMAP LINKEDIN AUTO-POSTER
// Posts weekly content to a LinkedIn company page or personal profile
// Uses LinkedIn Marketing API (OAuth2)
//
// Required GitHub Secrets:
//   LINKEDIN_ACCESS_TOKEN — OAuth2 token (see MARKETING-SETUP.md)
//   LINKEDIN_AUTHOR_URN   — e.g., "urn:li:person:XXXX" or "urn:li:organization:XXXX"
// ============================================================

import fetch       from 'node-fetch';
import { readFileSync } from 'fs';

const LINKEDIN_TOKEN      = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_AUTHOR_URN = process.env.LINKEDIN_AUTHOR_URN;
const SITE_URL            = 'https://signalmap.live';

// ── Post to LinkedIn ──────────────────────────────────────────
async function postToLinkedIn(text, url = null) {
  const body = {
    author:         LINKEDIN_AUTHOR_URN,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary:   { text },
        shareMediaCategory: url ? 'ARTICLE' : 'NONE',
        ...(url ? {
          media: [{
            status:      'READY',
            description: { text: 'Real-time crypto exchange hiring intelligence' },
            originalUrl: url,
            title:       { text: 'Signalmap — Crypto Hiring Intelligence' },
          }]
        } : {}),
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method:  'POST',
    headers: {
      'Authorization':       `Bearer ${LINKEDIN_TOKEN}`,
      'Content-Type':        'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function main() {
  if (!LINKEDIN_TOKEN || !LINKEDIN_AUTHOR_URN) {
    console.error('Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN');
    console.error('See MARKETING-SETUP.md for instructions.');
    process.exit(1);
  }

  let content;
  try {
    content = JSON.parse(readFileSync('/tmp/marketing-content.json', 'utf8'));
  } catch {
    console.error('No content file found. Run generate-content.js first.');
    process.exit(1);
  }

  const postText = content.linkedin_post;
  if (!postText) {
    console.error('No linkedin post in content file');
    process.exit(1);
  }

  console.log('Posting to LinkedIn...');
  console.log(`Preview: ${postText.slice(0, 100)}...\n`);

  const postId = await postToLinkedIn(postText, SITE_URL);
  console.log(`✓ Posted to LinkedIn: ${postId}`);
}

main().catch(err => {
  console.error('LinkedIn post failed:', err.message);
  process.exit(0); // Don't fail CI
});
