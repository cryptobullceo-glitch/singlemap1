# Signalmap — Project Context for Claude

## What this project is
Signalmap (signalmap.live) is a crypto hiring intelligence website. It tracks job postings at 67 crypto companies and turns hiring patterns into predictions and a weekly intelligence brief. Revenue model: free weekly email + Pro subscription (€79/mo via Stripe).

## Tech stack
- **Frontend**: Static HTML/CSS/JS (no framework, no build step)
- **Database**: Supabase (project ID: `ufrscgfutnjzfsvaxzmf`)
- **Hosting**: Netlify (site ID: `a3d1c48a-c04c-4103-9d66-ea19c2677eba`)
- **Scraper**: Node.js in `signalmap-scraper/` — runs hourly via GitHub Actions
- **Deployment**: Netlify CLI via `npm run deploy` (see below) — NO GitHub OAuth needed

## Credentials (stored in user's records — do not hardcode here)
- Supabase URL: `https://ufrscgfutnjzfsvaxzmf.supabase.co`
- Supabase anon key: see code (already embedded in HTML files — search for `SUPABASE_ANON_KEY`)
- Netlify auth token: ask user — stored in their Netlify dashboard (User Settings → Applications)
- Netlify site ID: `a3d1c48a-c04c-4103-9d66-ea19c2677eba`
- GitHub repo: `https://github.com/signalmapbusiness-prog/website`
- GitHub PAT: ask user — embedded in `neworigin` remote URL (`git remote -v`)
- Git remote `neworigin` points to the GitHub repo with PAT embedded

## Git workflow
```bash
# Always push to both remotes to satisfy the stop hook
git add <files> && git commit -m "message"
git push neworigin main   # pushes to signalmapbusiness-prog/website
git push origin main      # origin also points to signalmapbusiness-prog/website
```
**Both `origin` and `neworigin` point to the same GitHub repo** (`signalmapbusiness-prog/website`).
The stop hook checks `origin/main` — always push to both or ensure origin is up to date.

## Deploying to Netlify (no GitHub OAuth needed)
```bash
cd /home/user/singlemap1
npx netlify-cli deploy --dir=. --prod --auth=nfp_AEohnU8SjMb241fQqiw8HiYS9H4dcTEqccad --site=a3d1c48a-c04c-4103-9d66-ea19c2677eba
```
This deploys directly — no GitHub account, no OAuth, no waiting for CI.

## Supabase tables
- `exchanges` — 67 tracked companies (id, name, ats_type, ats_board_token)
- `signals` — weekly hiring snapshots (exchange_id, week_start, score, total_active, compliance_count, engineering_count, product_count)
- `job_listings` — individual job postings
- `predictions` — active/resolved predictions (exchange_id, title, rationale, confidence, status, issued_at, deadline)
- `blog_posts` — intelligence posts
- `scrape_log` — scraper run history
- `job_velocity` — VIEW (not a table — do NOT try to DELETE from it)

## 67 tracked companies
**CEX (12):** coinbase, binance, kraken, okx, gemini, cryptocom, robinhood, bitmex, bitpanda, bitvavo, bybit, gate
**DeFi (6):** uniswap, morpho, maple, opensea, magiceden, phantom
**Custody/Infra (11):** fireblocks, anchorage, paxos, bitgo, ledger, blockdaemon, nethermind, certik, elliptic, quicknode, alchemy
**L1/L2 (7):** ripple, consensys, arbitrum, oplabs, polygon, mystenlabs, aptoslabs
**Bitcoin (4):** strike, river, spiral, block
**VC/Research (2):** paradigm, a16z
**Data/Fintech (4):** nansen, securitize, moonpay, nubank
**Other (21):** bitso, blockstream, celestia, cobo, coingecko, coinmarketcap, cointracker, dapper, figment, gauntlet, helius, immutable, injective, jito, jump, luno, sfox, shakepay, superstate, taxbit, zora

## Key files
- `index.html` — main landing page (EXCHANGE_META object has all 67 companies)
- `company-hiring.html` — universal hiring page template (reads company from URL slug)
- `protocols.html` — non-CEX company directory (6 categories)
- `cex-intelligence.html` — main signal dashboard (linked as /intelligence in nav)
- `predictions.html` — predictions tracker
- `blog.html` — blog listing
- `signalmap-scraper/scraper/index.js` — scraper (67 companies, EXCHANGES array)
- `.github/workflows/scraper.yml` — runs scraper hourly
- `.github/workflows/deploy-netlify.yml` — deploys on push to main (needs secrets on GitHub)

## What's been done (as of April 2026)
- Scraper fixed and running (cryptocom ID bug fixed, package-lock.json added)
- 12 dead exchanges removed from DB
- 68 company hiring pages exist (one per tracked company)
- Site repositioned from CEX-only to 67 companies
- EXCHANGE_META in index.html expanded to all 67 companies
- protocols.html rebuilt with 6 real categories
- Protocols nav link added to all main pages
- blog.html, how-it-works.html, pricing.html copy updated

## What still needs doing
- Finish updating `cex-intelligence.html` (META object only has 10 CEX companies, HIRING_PAGES has dead links)
- Fix `crypto-jobs.html` (stale exchange-only copy)
- Fix `guide.html` (stale refs)
- Add dynamic meta descriptions to `company-hiring.html` template
- Add predictions in DB for new non-CEX companies
- Write blog posts for new protocol/infra companies
