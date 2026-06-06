const app = require('./server.js');
const http = require('http');

const PORT = 4567;
const BASE_URL = `http://localhost:${PORT}`;

function runTest(name, fn) {
  return new Promise(async (resolve) => {
    console.log(`[TEST] Running: ${name}...`);
    try {
      await fn();
      console.log(`[PASS] ${name}\n`);
      resolve(true);
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message}\n`);
      resolve(false);
    }
  });
}

async function main() {
  // Start server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server listening on port ${PORT}\n`);

  const results = [];

  // Test 1: API Seasons list
  results.push(await runTest('API - Seasons List', async () => {
    const res = await fetch(`${BASE_URL}/api/seasons`);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Expected response to be an array');
    }
    if (data.length === 0) {
      throw new Error('Expected at least one season');
    }
    const firstSeason = data[0];
    if (firstSeason.seasonNumber !== 1 || !firstSeason.label || !firstSeason.urlPath) {
      throw new Error(`Invalid season object structure: ${JSON.stringify(firstSeason)}`);
    }
    console.log(`       Found ${data.length} seasons.`);
  }));

  // Test 2: API Season 1 Episodes
  results.push(await runTest('API - Season 1 Episodes', async () => {
    const res = await fetch(`${BASE_URL}/api/seasons/1`);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Expected response to be an array');
    }
    if (data.length === 0) {
      throw new Error('Expected at least one episode in Season 1');
    }
    const firstEp = data[0];
    if (!firstEp.id || !firstEp.name || !firstEp.url || !firstEp.episodeNumber) {
      throw new Error(`Invalid episode object structure: ${JSON.stringify(firstEp)}`);
    }
    console.log(`       Found ${data.length} episodes in Season 1.`);
    console.log(`       First episode: "${firstEp.name}"`);
  }));

  // Test 3: Proxy - Main Site Homepage & Header Stripping
  results.push(await runTest('Proxy - Main Site & Header Stripping', async () => {
    const res = await fetch(`${BASE_URL}/proxy/seasons/south-park`);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
    
    // Check if iframe headers are stripped
    const xFrameOptions = res.headers.get('x-frame-options');
    const csp = res.headers.get('content-security-policy');
    
    if (xFrameOptions && xFrameOptions.toLowerCase() === 'sameorigin') {
      throw new Error('X-Frame-Options is still SAMEORIGIN (headers not stripped)');
    }
    if (csp) {
      throw new Error('Content-Security-Policy is still active on proxy response (not stripped)');
    }

    const html = await res.text();
    if (!html.includes('window.__DATA__')) {
      throw new Error('Expected proxied page to contain window.__DATA__');
    }
    
    // Verify rewriting worked
    if (html.includes('https://southpark.cc.com')) {
      throw new Error('Found unreplaced "https://southpark.cc.com" URLs in proxied page');
    }
    if (!html.includes('/proxy') && !html.includes('/proxy-topaz')) {
      throw new Error('Could not find proxy replacements (/proxy or /proxy-topaz)');
    }

    console.log('       X-Frame-Options and CSP successfully removed!');
    console.log('       Domains successfully rewritten to proxy routes.');
  }));

  // Test 4: Proxy - Topaz API (Streaming Manifest Configuration)
  results.push(await runTest('Proxy - Topaz API Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/proxy-topaz/topaz/api/mgid:arc:episode:shared.southpark.us.en:5fb8887e-ecfd-11e0-aca6-0026b9414f30/mica.json?clientPlatform=web&deviceType=desktop`);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.documentid && !data.error) {
      throw new Error(`Expected topaz API JSON response, got: ${JSON.stringify(data).substring(0, 100)}`);
    }
    console.log('       Topaz API successfully reached and forwarded.');
    console.log(`       Response schema: ${data['$schema'] || 'none'}`);
  }));

  // Shutdown server
  server.close();
  console.log('Test server closed.\n');

  // Print Summary
  const passed = results.filter(Boolean).length;
  console.log('==================================================');
  console.log(`  TEST RESULTS: ${passed}/${results.length} PASSED`);
  console.log('==================================================');

  if (passed === results.length) {
    console.log('  🎉 All tests passed successfully!');
    process.exit(0);
  } else {
    console.error('  ❌ Some tests failed.');
    process.exit(1);
  }
}

main();
