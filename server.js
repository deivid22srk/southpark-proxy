const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Caches
let cachedSeasons = null;
let seasonsCacheTime = 0;
const cachedEpisodes = new Map(); // seasonNumber -> { episodes, time }
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

// Helper to fetch season list dynamically
async function getSeasonsList() {
  const now = Date.now();
  if (cachedSeasons && (now - seasonsCacheTime < CACHE_DURATION)) {
    return cachedSeasons;
  }

  const url = 'https://southpark.cc.com/seasons/south-park';
  console.log(`[API] Fetching seasons dynamically from ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const match = html.match(/window\.__DATA__\s*=\s*({.*?});/);
  if (!match) {
    throw new Error('Could not find window.__DATA__ on seasons page');
  }

  const data = JSON.parse(match[1]);
  const mainContainer = data.children.find(c => c && c.type === 'MainContainer');
  if (!mainContainer) {
    throw new Error('No MainContainer found');
  }

  const seasonSelector = mainContainer.children.find(c => c && c.type === 'SeasonSelector');
  if (!seasonSelector) {
    throw new Error('No SeasonSelector found');
  }

  const seasons = seasonSelector.props.items.map(item => ({
    seasonNumber: item.seasonNumber,
    label: item.label,
    urlPath: item.url || '/seasons/south-park' // Season 1 is null, means default page
  }));

  // Sort by season number
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  cachedSeasons = seasons;
  seasonsCacheTime = now;
  return seasons;
}

// Helper to fetch all episodes of a season
async function getSeasonEpisodes(seasonNumber) {
  const now = Date.now();
  const cached = cachedEpisodes.get(seasonNumber);
  if (cached && (now - cached.time < CACHE_DURATION)) {
    return cached.episodes;
  }

  const seasons = await getSeasonsList();
  const season = seasons.find(s => s.seasonNumber === parseInt(seasonNumber));
  if (!season) {
    throw new Error(`Season ${seasonNumber} not found`);
  }

  const rootUrl = 'https://southpark.cc.com';
  // Season 1 URL path is "/seasons/south-park" (or default page)
  const urlPath = season.urlPath === '/seasons/south-park' ? '/seasons/south-park' : season.urlPath;
  const url = `${rootUrl}${urlPath}`;

  console.log(`[API] Fetching episodes for Season ${seasonNumber} from ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const match = html.match(/window\.__DATA__\s*=\s*({.*?});/);
  if (!match) {
    throw new Error(`Could not find window.__DATA__ for season ${seasonNumber}`);
  }

  const data = JSON.parse(match[1]);
  const mainContainer = data.children.find(c => c && c.type === 'MainContainer');
  if (!mainContainer) {
    throw new Error('No MainContainer found');
  }

  const episodeList = mainContainer.children.find(c => c && c.type === 'LineList' && c.props && c.props.isEpisodes);
  if (!episodeList) {
    return [];
  }

  let episodes = [...episodeList.props.items];
  let loadMore = episodeList.props.loadMore;

  // Follow pagination links to get all episodes in the season
  while (loadMore && loadMore.url) {
    const nextUrl = `${rootUrl}${loadMore.url}`;
    console.log(`[API] Fetching next episodes page for Season ${seasonNumber}: ${nextUrl}`);
    const nextRes = await fetch(nextUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const nextData = await nextRes.json();
    if (nextData && nextData.items) {
      episodes = episodes.concat(nextData.items);
    }
    loadMore = nextData.loadMore;
  }

  // Format and simplify episodes
  const formattedEpisodes = episodes.map(ep => {
    const titleText = ep.meta?.header?.title?.text || ep.title?.text || '';
    const name = ep.meta?.subHeader || ep.title || '';
    const desc = ep.meta?.description || ep.description || '';
    const imgUrl = ep.media?.image?.url || '';
    const epUrl = ep.url || '';
    const id = ep.id || '';
    
    // Extract episode and season numbers from title text like "S1 • E1"
    let epNum = '';
    const epMatch = titleText.match(/E(\d+)/);
    if (epMatch) {
      epNum = parseInt(epMatch[1]);
    }

    return {
      id,
      title: titleText,
      episodeNumber: epNum,
      name,
      description: desc,
      imageUrl: imgUrl,
      url: epUrl
    };
  });

  // Sort episodes by episode number
  formattedEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

  cachedEpisodes.set(seasonNumber, { episodes: formattedEpisodes, time: now });
  return formattedEpisodes;
}

// Proxy implementation
async function handleProxy(req, res, targetHost, urlPrefixToRemove) {
  // Extract path and query
  const fullPath = req.url;
  const relativePath = fullPath.replace(urlPrefixToRemove, '');
  const targetUrl = `https://${targetHost}${relativePath}`;

  console.log(`[PROXY] Forwarding: ${req.method} ${fullPath} -> ${targetUrl}`);

  // Prepare headers - strip forwarding headers to bypass client-based geo-blocking
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['accept-encoding']; // Ask for identity/uncompressed content to easily rewrite text
  delete headers['x-forwarded-for'];
  delete headers['x-real-ip'];
  delete headers['x-forwarded-proto'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-port'];

  try {
    const options = {
      method: req.method,
      headers: headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Forward body for POST/PUT/etc.
      // Need express.raw() or raw body handling if we want to support heavy requests, 
      // but GET is sufficient for browsing/streaming here.
      options.body = req.body;
    }

    const response = await fetch(targetUrl, options);
    
    // Copy response headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Strip framing, compression and connection headers
      if (
        lowerKey !== 'content-security-policy' &&
        lowerKey !== 'x-frame-options' &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'transfer-encoding' &&
        lowerKey !== 'connection' &&
        lowerKey !== 'content-encoding' &&
        lowerKey !== 'keep-alive'
      ) {
        res.setHeader(key, value);
      }
    });

    // Explicitly allow embedding and disable client caching to prevent stale/un-rewritten files
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(response.status);

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html') || contentType.includes('application/javascript') || contentType.includes('text/css') || contentType.includes('application/json')) {
      let bodyText = await response.text();
      
      if (contentType.includes('text/html')) {
        const interceptorScript = `
<script>
  (function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      if (typeof url === 'string') {
        if (url.includes('topaz.paramount.tech')) {
          url = url.replace(/https?:\\/\\/topaz\\.paramount\\.tech/g, window.location.origin + '/proxy-topaz');
        } else if (url.includes('api.neutron.paramount.tech')) {
          url = url.replace(/https?:\\/\\/api\\.neutron\\.paramount\\.tech/g, window.location.origin + '/proxy-neutron');
        }
      } else if (url && typeof url === 'object' && url.href) {
        let href = url.href;
        if (href.includes('topaz.paramount.tech')) {
          url = new URL(href.replace(/https?:\\/\\/topaz\\.paramount\\.tech/g, window.location.origin + '/proxy-topaz'));
        } else if (href.includes('api.neutron.paramount.tech')) {
          url = new URL(href.replace(/https?:\\/\\/api\\.neutron\\.paramount\\.tech/g, window.location.origin + '/proxy-neutron'));
        }
      }
      return originalFetch(url, options);
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (typeof url === 'string') {
        if (url.includes('topaz.paramount.tech')) {
          url = url.replace(/https?:\\/\\/topaz\\.paramount\\.tech/g, window.location.origin + '/proxy-topaz');
        } else if (url.includes('api.neutron.paramount.tech')) {
          url = url.replace(/https?:\\/\\/api\\.neutron\\.paramount\\.tech/g, window.location.origin + '/proxy-neutron');
        }
      }
      return originalXHR.apply(this, [method, url, ...args]);
    };
  })();
</script>
`;
        bodyText = bodyText.replace(/<head>/i, '<head>' + interceptorScript);
      }
      
      // Rewrite links and domains so they go through our proxy instead of original domains
      // 1. South Park domain links
      bodyText = bodyText.replace(/https:(\/|\\\/|\\u002F){2}southpark\.cc\.com/gi, '/proxy');
      bodyText = bodyText.replace(/https:(\/|\\\/|\\u002F){2}www\.southparkstudios\.com\.br/gi, '/proxy');
      
      // 2. Topaz API links (streaming metadata)
      bodyText = bodyText.replace(/https:(\/|\\\/|\\u002F){2}topaz\.paramount\.tech/gi, '/proxy-topaz');

      // 3. Neutron API links (metadata properties)
      bodyText = bodyText.replace(/https:(\/|\\\/|\\u002F){2}api\.neutron\.paramount\.tech/gi, '/proxy-neutron');
      bodyText = bodyText.replace(/http:(\/|\\\/|\\u002F){2}api\.neutron\.paramount\.tech/gi, '/proxy-neutron');
      
      res.send(bodyText);
    } else {
      // Binary data (images, media, etc.)
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    }
  } catch (err) {
    console.error(`[PROXY] Error forwarding to ${targetUrl}:`, err);
    res.status(500).send(`Proxy Error: ${err.message}`);
  }
}

// 1. API - Get seasons list
app.get('/api/seasons', async (req, res) => {
  try {
    const seasons = await getSeasonsList();
    res.json(seasons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. API - Get episodes of a season
app.get('/api/seasons/:seasonNum', async (req, res) => {
  try {
    const episodes = await getSeasonEpisodes(req.params.seasonNum);
    res.json(episodes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. API - Proxy verification test endpoint
app.get('/api/proxy-test', async (req, res) => {
  try {
    // Check if we can reach southpark.cc.com
    const startTime = Date.now();
    const testRes = await fetch('https://southpark.cc.com/seasons/south-park', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const duration = Date.now() - startTime;
    res.json({
      status: 'ok',
      connection: 'success',
      target: 'https://southpark.cc.com',
      statusCode: testRes.status,
      responseTimeMs: duration,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      connection: 'failed',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 4. Proxy middleware for routing proxy paths
app.use((req, res, next) => {
  if (req.path.startsWith('/proxy-topaz')) {
    handleProxy(req, res, 'topaz.paramount.tech', '/proxy-topaz');
  } else if (req.path.startsWith('/proxy-neutron')) {
    handleProxy(req, res, 'api.neutron.paramount.tech', '/proxy-neutron');
  } else if (req.path.startsWith('/proxy')) {
    handleProxy(req, res, 'southpark.cc.com', '/proxy');
  } else {
    next();
  }
});


// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all asset proxy handler: if a request doesn't match our static files or APIs,
// but has a file extension or matches asset paths (like vendor.*.js or southpark.*.js),
// we proxy it to southpark.cc.com. This makes asset loading completely transparent!
app.use((req, res, next) => {
  const isAsset = req.path.includes('.') || 
                  req.path.startsWith('/vendor.') || 
                  req.path.startsWith('/runtime.') || 
                  req.path.startsWith('/southpark.') ||
                  /^\/\d+\..*js$/.test(req.path); // matches chunks like /839.8e67...js
  
  if (isAsset) {
    handleProxy(req, res, 'southpark.cc.com', '');
  } else {
    // Fallback to serving the index.html for Single Page Application routing if needed,
    // or just return 404. Here we return index.html so refreshing works!
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  SOUTH PARK PROXY SERVER RUNNING ON PORT ${PORT}`);
    console.log(`  Access dashboard: http://localhost:${PORT}`);
    console.log(`  Access transparent proxy: http://localhost:${PORT}/proxy/seasons/south-park`);
    console.log(`==================================================`);
  });
}

module.exports = app;

