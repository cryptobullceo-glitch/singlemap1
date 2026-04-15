/**
 * blog-seo.js — Netlify Edge Function
 *
 * Intercepts every /blog/:slug request and injects correct <title>,
 * <meta description>, og:title, og:description, og:url, canonical,
 * and Article JSON-LD into the initial HTML response.
 *
 * Flow:
 *   1. Extract slug from URL path
 *   2. Fetch post metadata from Supabase (concurrently with post.html)
 *   3. Replace placeholder tags in the HTML
 *   4. Return modified HTML — Google sees real tags, JS still runs normally
 */

const SB_URL  = 'https://ufrscgfutnjzfsvaxzmf.supabase.co';
const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcnNjZ2Z1dG5qemZzdmF4em1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTg2MzgsImV4cCI6MjA4ODQzNDYzOH0.Zg-1zbFuPBmjUJBKNG-IuZR_lAb7ld9Ot4EXR8G3ISk';
const SITE    = 'https://signalmap.live';

export default async function handler(request, context) {
  const url  = new URL(request.url);
  const slug = url.pathname.replace(/^\/blog\//, '').split('/')[0];

  // Pass through /blog index page — no slug
  if (!slug || url.pathname === '/blog' || url.pathname === '/blog/') {
    return context.next();
  }

  // Fetch post metadata and the post.html template concurrently
  const [post, htmlResponse] = await Promise.all([
    fetchPost(slug),
    context.next(),
  ]);

  // If post not found or Supabase failed, return the original HTML
  // (client-side JS will show the "post not found" state)
  if (!post) {
    return htmlResponse;
  }

  const html     = await htmlResponse.text();
  const modified = injectMeta(html, post, slug);

  const headers = new Headers(htmlResponse.headers);
  headers.set('content-type', 'text/html; charset=UTF-8');
  // Allow CDN to cache rendered pages for 5 minutes
  headers.set('cache-control', 'public, max-age=300, stale-while-revalidate=60');

  return new Response(modified, { status: 200, headers });
}

// ─── Supabase fetch ────────────────────────────────────────────────────────────

async function fetchPost(slug) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/blog_posts` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&published=eq.true` +
      `&select=title,meta_description,content,tags,created_at` +
      `&limit=1`,
      {
        headers: {
          apikey:        SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch {
    return null;
  }
}

// ─── Meta injection ────────────────────────────────────────────────────────────

function injectMeta(html, post, slug) {
  const canonical = `${SITE}/blog/${slug}`;
  const rawDesc   = post.meta_description || stripTags(post.content || '').slice(0, 200).trimEnd();
  const title     = esc(`${post.title} | Signalmap`);
  const ogTitle   = esc(post.title);
  const desc      = esc(rawDesc);
  const href      = esc(canonical);

  // Article + BreadcrumbList structured data
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type':            'Article',
        headline:           post.title,
        description:        rawDesc,
        url:                canonical,
        mainEntityOfPage:   { '@type': 'WebPage', '@id': canonical },
        publisher:          { '@type': 'Organization', name: 'Signalmap', url: SITE },
        author:             { '@type': 'Organization', name: 'Signalmap', url: SITE },
        datePublished:      post.created_at,
        dateModified:       post.created_at,
        keywords:           (post.tags || []).join(', '),
        articleSection:     'Crypto Exchange Intelligence',
        inLanguage:         'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Blog',    item: `${SITE}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
        ],
      },
    ],
  });

  return html
    // Title
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    // Meta description
    .replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${desc}">`
    )
    // OG tags
    .replace(
      /<meta property="og:title" content="[^"]*">/,
      `<meta property="og:title" content="${ogTitle}">`
    )
    .replace(
      /<meta property="og:description" content="[^"]*">/,
      `<meta property="og:description" content="${desc}">`
    )
    .replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${href}">`
    )
    // Twitter (add if missing, replace if present)
    .replace(
      /<meta name="twitter:card" content="[^"]*">/,
      `<meta name="twitter:card" content="summary_large_image">` +
      `<meta name="twitter:title" content="${ogTitle}">` +
      `<meta name="twitter:description" content="${desc}">`
    )
    // Canonical
    .replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${href}">`
    )
    // JSON-LD — replace the empty placeholder script tag
    .replace(
      /<script type="application\/ld\+json" id="json-ld"><\/script>/,
      `<script type="application/ld+json" id="json-ld">${jsonLd}</script>`
    );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
