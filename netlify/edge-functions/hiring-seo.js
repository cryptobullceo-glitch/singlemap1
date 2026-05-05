/**
 * hiring-seo.js — Netlify Edge Function
 *
 * Intercepts every /*-hiring request and injects company-specific <title>,
 * <meta description>, og: tags, canonical, and JSON-LD into the initial HTML.
 * This lets Google see real metadata without waiting for client-side JS.
 */

const SITE = 'https://signalmap.live';

const COMPANIES = {
  // CEX
  coinbase:      { name: 'Coinbase',       sector: 'US crypto exchange' },
  binance:       { name: 'Binance',        sector: 'global crypto exchange' },
  kraken:        { name: 'Kraken',         sector: 'US crypto exchange' },
  okx:           { name: 'OKX',            sector: 'global crypto exchange' },
  gemini:        { name: 'Gemini',         sector: 'US crypto exchange' },
  cryptocom:     { name: 'Crypto.com',     sector: 'global crypto exchange' },
  robinhood:     { name: 'Robinhood',      sector: 'US trading platform' },
  bitmex:        { name: 'BitMEX',         sector: 'crypto derivatives exchange' },
  bitpanda:      { name: 'Bitpanda',       sector: 'European crypto exchange' },
  bitvavo:       { name: 'Bitvavo',        sector: 'Dutch crypto exchange' },
  bybit:         { name: 'Bybit',          sector: 'global crypto exchange' },
  gate:          { name: 'Gate.io',        sector: 'global crypto exchange' },
  // DeFi
  uniswap:       { name: 'Uniswap',        sector: 'DeFi protocol' },
  morpho:        { name: 'Morpho',         sector: 'DeFi lending protocol' },
  maple:         { name: 'Maple Finance',  sector: 'DeFi credit protocol' },
  opensea:       { name: 'OpenSea',        sector: 'NFT marketplace' },
  magiceden:     { name: 'Magic Eden',     sector: 'NFT marketplace' },
  phantom:       { name: 'Phantom',        sector: 'crypto wallet' },
  // Custody / Infra
  fireblocks:    { name: 'Fireblocks',     sector: 'crypto custody & infra' },
  anchorage:     { name: 'Anchorage',      sector: 'crypto custody bank' },
  paxos:         { name: 'Paxos',          sector: 'blockchain infrastructure' },
  bitgo:         { name: 'BitGo',          sector: 'institutional crypto custody' },
  ledger:        { name: 'Ledger',         sector: 'hardware wallet' },
  blockdaemon:   { name: 'Blockdaemon',    sector: 'blockchain infrastructure' },
  nethermind:    { name: 'Nethermind',     sector: 'Ethereum client & research' },
  certik:        { name: 'CertiK',         sector: 'blockchain security' },
  elliptic:      { name: 'Elliptic',       sector: 'crypto compliance analytics' },
  quicknode:     { name: 'QuickNode',      sector: 'blockchain infrastructure' },
  alchemy:       { name: 'Alchemy',        sector: 'Web3 developer platform' },
  // L1 / L2
  ripple:        { name: 'Ripple',         sector: 'XRP & cross-border payments' },
  consensys:     { name: 'Consensys',      sector: 'Ethereum developer tools' },
  arbitrum:      { name: 'Arbitrum',       sector: 'Ethereum L2 network' },
  oplabs:        { name: 'OP Labs',        sector: 'Optimism L2 network' },
  polygon:       { name: 'Polygon',        sector: 'Ethereum L2 network' },
  mystenlabs:    { name: 'Mysten Labs',    sector: 'Sui blockchain' },
  aptoslabs:     { name: 'Aptos Labs',     sector: 'Aptos L1 blockchain' },
  // Bitcoin
  strike:        { name: 'Strike',         sector: 'Bitcoin payments' },
  river:         { name: 'River',          sector: 'Bitcoin financial services' },
  spiral:        { name: 'Spiral',         sector: 'Bitcoin open-source dev' },
  block:         { name: 'Block',          sector: 'Bitcoin & fintech' },
  // VC / Research
  paradigm:      { name: 'Paradigm',       sector: 'crypto venture capital' },
  a16z:          { name: 'a16z Crypto',    sector: 'crypto venture capital' },
  // Data / Fintech
  nansen:        { name: 'Nansen',         sector: 'on-chain analytics' },
  securitize:    { name: 'Securitize',     sector: 'digital securities' },
  moonpay:       { name: 'MoonPay',        sector: 'crypto fiat on-ramp' },
  nubank:        { name: 'Nubank',         sector: 'digital banking & crypto' },
  // Other
  bitso:         { name: 'Bitso',          sector: 'Latin American crypto exchange' },
  blockstream:   { name: 'Blockstream',    sector: 'Bitcoin infrastructure' },
  celestia:      { name: 'Celestia',       sector: 'modular blockchain' },
  cobo:          { name: 'Cobo',           sector: 'crypto custody & wallet' },
  coingecko:     { name: 'CoinGecko',      sector: 'crypto data aggregator' },
  coinmarketcap: { name: 'CoinMarketCap',  sector: 'crypto data aggregator' },
  cointracker:   { name: 'CoinTracker',    sector: 'crypto tax & portfolio' },
  dapper:        { name: 'Dapper Labs',    sector: 'NFT & blockchain gaming' },
  figment:       { name: 'Figment',        sector: 'blockchain staking' },
  gauntlet:      { name: 'Gauntlet',       sector: 'DeFi risk management' },
  helius:        { name: 'Helius',         sector: 'Solana developer infra' },
  immutable:     { name: 'Immutable',      sector: 'Web3 gaming' },
  injective:     { name: 'Injective',      sector: 'DeFi L1 blockchain' },
  jito:          { name: 'Jito',           sector: 'Solana MEV & staking' },
  jump:          { name: 'Jump Crypto',    sector: 'crypto trading & research' },
  luno:          { name: 'Luno',           sector: 'African crypto exchange' },
  sfox:          { name: 'sFOX',           sector: 'institutional crypto prime' },
  shakepay:      { name: 'Shakepay',       sector: 'Canadian crypto exchange' },
  superstate:    { name: 'Superstate',     sector: 'tokenized fund management' },
  taxbit:        { name: 'TaxBit',         sector: 'crypto tax & accounting' },
  zora:          { name: 'Zora',           sector: 'NFT protocol & marketplace' },
};

function injectMeta(html, company, slug) {
  const { name, sector } = company;
  const title       = `${name} Hiring Intelligence 2026 — Signal Score & Job Trends | Signalmap`;
  const description = `Track ${name} hiring signals in real-time. Live Signal Score, open role count, compliance vs engineering mix, and analyst predictions for the ${sector}. Updated weekly.`;
  const canonical   = `${SITE}/${slug}-hiring`;
  const jsonLd      = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${name} Hiring Intelligence`,
    description,
    url: canonical,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Signalmap', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Hiring Intelligence', item: `${SITE}/intelligence` },
        { '@type': 'ListItem', position: 3, name: `${name}`, item: canonical },
      ],
    },
  });

  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}">`)
    .replace('</head>', `  <script type="application/ld+json">${jsonLd}</script>\n</head>`);
}

export default async function handler(request, context) {
  const url  = new URL(request.url);
  const slug = url.pathname.replace(/^\//, '').replace(/-hiring$/, '');

  const company = COMPANIES[slug];
  if (!company) return context.next();

  const htmlResponse = await context.next();
  if (!htmlResponse.ok) return htmlResponse;

  const html     = await htmlResponse.text();
  const modified = injectMeta(html, company, slug);

  return new Response(modified, {
    status:  htmlResponse.status,
    headers: { ...Object.fromEntries(htmlResponse.headers), 'content-type': 'text/html; charset=utf-8' },
  });
}

export const config = { path: '/*-hiring' };
