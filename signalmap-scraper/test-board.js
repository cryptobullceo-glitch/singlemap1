// Quick test: verify an ATS board slug resolves and returns jobs
// Usage: node test-board.js <source> <board>
// Examples:
//   node test-board.js greenhouse uniswap
//   node test-board.js lever uniswap
//   node test-board.js ashby uniswap

import fetch from 'node-fetch';

const [,, source, board] = process.argv;
if (!source || !board) {
  console.error('Usage: node test-board.js <greenhouse|lever|ashby> <board-slug>');
  process.exit(1);
}

async function test() {
  let url, options = { headers: { 'User-Agent': 'SignalmapBot/1.0' }, timeout: 10000 };
  let jobs = [];

  if (source === 'greenhouse') {
    url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
    const res = await fetch(url, options);
    if (!res.ok) { console.error(`HTTP ${res.status} — board '${board}' not found on Greenhouse`); process.exit(1); }
    const data = await res.json();
    jobs = data.jobs || [];
  } else if (source === 'lever') {
    url = `https://api.lever.co/v0/postings/${board}?mode=json`;
    const res = await fetch(url, options);
    if (!res.ok) { console.error(`HTTP ${res.status} — board '${board}' not found on Lever`); process.exit(1); }
    const data = await res.json();
    jobs = Array.isArray(data) ? data : [];
  } else if (source === 'ashby') {
    url = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams';
    const res = await fetch(url, {
      ...options, method: 'POST',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: board },
        query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
          jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
            jobPostings { id title teamName locationName jobPostingState }
          }
        }`
      }),
    });
    const data = await res.json();
    if (data.errors?.length) { console.error('GraphQL error:', data.errors[0].message); process.exit(1); }
    jobs = (data?.data?.jobBoard?.jobPostings || []).filter(j => j.jobPostingState === 'Published');
  } else {
    console.error('Unknown source. Use: greenhouse | lever | ashby');
    process.exit(1);
  }

  console.log(`✓ ${source}/${board} → ${jobs.length} jobs found`);
  jobs.slice(0, 5).forEach(j => console.log(`  - ${j.title || j.text}`));
  if (jobs.length > 5) console.log(`  ... and ${jobs.length - 5} more`);
}

test().catch(err => { console.error('Error:', err.message); process.exit(1); });
