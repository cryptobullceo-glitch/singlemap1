# Signalmap Scraper

Hourly job listing scraper for [Signalmap](https://signalmap.io) — crypto exchange hiring intelligence.

## Sources

| Exchange | ATS Platform | API |
|----------|-------------|-----|
| Coinbase | Greenhouse | Public JSON |
| Kraken | Greenhouse | Public JSON |
| Gemini | Greenhouse | Public JSON |
| Deribit | Greenhouse | Public JSON |
| Robinhood | Lever | Public JSON |
| Bitget | Lever | Public JSON |
| Bitstamp | Lever | Public JSON |
| Crypto.com | Ashby | Public GraphQL |

## Setup

1. Add GitHub Secrets:
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_KEY` — your Supabase service role key

2. The scraper runs automatically every hour via GitHub Actions.

3. To run manually: Actions → Signalmap Scraper → Run workflow

## How it works

1. Polls each ATS API for current job listings
2. Classifies each role by department (compliance, engineering, product, etc.)
3. Upserts to Supabase (new listings created, removed listings marked inactive)
4. Recalculates exchange "signal scores" based on hiring velocity
5. Logs results to `scrape_log` table
