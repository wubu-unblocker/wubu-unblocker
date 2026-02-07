import Fastify from 'fastify';
import { createServer } from 'node:http';
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import createRammerhead from '../lib/rammerhead/src/server/index.js';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import admin from 'firebase-admin';
import {
  config,
  serverUrl,
  pages,
  externalPages,
  getAltPrefix,
} from './routes.mjs';
import { tryReadFile, preloaded404 } from './templates.mjs';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { setupBlooketService } from './blooket-service.mjs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/* Record the server's location as a URL object, including its host and port.
 * The host can be modified at /src/config.json, whereas the ports can be modified
 * at /ecosystem.config.js.
 */
console.log('Server URL:', serverUrl);

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js
logging.set_level(logging.NONE);
wisp.options.allow_udp_streams = false;
wisp.options.allow_loopback_ips = true;

// For security reasons only allow these ports.
// wisp.options.port_whitelist = [
//   80,
//   443,
//   9050,
//   7000,
//   7001
// ];

// The server will check for the existence of this file when a shutdown is requested.
const shutdown = fileURLToPath(new URL('./.shutdown', import.meta.url));

// Initialize Rammerhead
const rh = createRammerhead();
const rammerheadScopes = [
  '/rammerhead.js',
  '/hammerhead.js',
  '/transport-worker.js',
  '/task.js',
  '/iframe-task.js',
  '/worker-hammerhead.js',
  '/messaging',
  '/sessionexists',
  '/deletesession',
  '/newsession',
  '/editsession',
  '/needpassword',
  '/syncLocalStorage',
  '/api/shuffleDict',
  '/mainport',
].map((pathname) => pathname.replace('/', serverUrl.pathname));

const rammerheadSession = new RegExp(
  `^${serverUrl.pathname.replaceAll('.', '\\.')}[a-z0-9]{32}`
),
  shouldRouteRh = (req) => {
    try {
      const url = new URL(req.url, serverUrl);
      return (
        rammerheadScopes.includes(url.pathname) ||
        rammerheadSession.test(url.pathname)
      );
    } catch (e) {
      return false;
    }
  },
  routeRhRequest = (req, res) => {
    req.url = req.url.slice(serverUrl.pathname.length - 1);
    rh.emit('request', req, res);
  },
  routeRhUpgrade = (req, socket, head) => {
    req.url = req.url.slice(serverUrl.pathname.length - 1);
    rh.emit('upgrade', req, socket, head);
  };

// Initialize Blooket Service (Puppeteer-based streaming for Blooket)
const { wss: blooketWss, startBrowser: startBlooketBrowser } = setupBlooketService();

// Start the browser immediately
startBlooketBrowser().catch((err) => console.error('Failed to start Blooket Browser:', err));

// Create a server factory for Rammerhead, Wisp, and Blooket
const serverFactory = (handler) => {
  return createServer()
    .on('request', (req, res) => {
      if (shouldRouteRh(req)) routeRhRequest(req, res);
      else handler(req, res);
    })
    .on('upgrade', (req, socket, head) => {
      console.log('[WebSocket Upgrade] Incoming URL:', req.url);

      // Blooket WebSocket - Use the streaming proxy for Blooket
      const blooketWsPath = serverUrl.pathname + 'blooket-ws';
      if (req.url === blooketWsPath || req.url === '/blooket-ws') {
        console.log('[WebSocket] Routing to Blooket service');
        blooketWss.handleUpgrade(req, socket, head, (ws) => {
          blooketWss.emit('connection', ws, req);
        });
        return;
      }

      // Rammerhead WebSocket
      if (shouldRouteRh(req)) {
        routeRhUpgrade(req, socket, head);
        return;
      }

      // Wisp WebSocket - for BareMux proxy connections
      const wispPath = getAltPrefix('wisp', serverUrl.pathname); // /cron/
      if (req.url.startsWith(wispPath) || req.url === '/cron/' || req.url.startsWith('/cron')) {
        console.log('[WebSocket] Routing to Wisp service');
        wisp.routeRequest(req, socket, head);
        return;
      }

      // Unknown WebSocket - close connection
      console.log('[WebSocket] Unknown upgrade path:', req.url);
      socket.destroy();
    });
};

// Set logger to true for logs.
const app = Fastify({
  routerOptions: {
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
  },
  logger: false,
  connectionTimeout: 30000,
  keepAliveTimeout: 10000,
  bodyLimit: 1048576 * 50, // 50MB body limit
  serverFactory: serverFactory,
});

// Apply Helmet middleware for security.
app.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Disable CSP
  xPoweredBy: false,
});

// Multipart for image uploads (Issues page).
app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per image
    files: 6,
  },
});

// All entries in the dist folder are created with source rewrites.
// Minified scripts are also served here, if minification is enabled.
[
  'uv',
  'scram',
  'epoxy',
  'libcurl',
  'baremux',
  'chii',
].forEach((prefix) => {
  app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../views/dist/' + prefix, import.meta.url)),
    prefix: getAltPrefix(prefix, serverUrl.pathname),
    decorateReply: false,
    maxAge: '7d',
    immutable: true,
    cacheControl: true,
  });
});

// Primary static handler for assets and pages
app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../views/dist', import.meta.url)),
  prefix: serverUrl.pathname,
  decorateReply: false,
  maxAge: '1h',
  cacheControl: true,
});

// ========================
// ISSUES API (FIREBASE)
// ========================

let issuesFirebase;

function initIssuesFirebase() {
  if (issuesFirebase) return issuesFirebase;

  let serviceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    join(process.cwd(), 'wubu-issues-firebase-adminsdk-fbsvc-ce52cdd6d1.json');

  if (raw) {
    serviceAccount = JSON.parse(raw);
  } else if (existsSync(path)) {
    serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
  } else {
    throw new Error(
      'Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.'
    );
  }

  const projectId = serviceAccount.project_id;
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  issuesFirebase = Object.freeze({
    db: admin.firestore(),
    bucket: admin.storage().bucket(bucketName),
    bucketName,
  });

  return issuesFirebase;
}

function getVisitorId(req) {
  // Client sends a UUID in x-visitor-id. Sanitize to a safe Firestore doc id.
  const raw = String(req.headers['x-visitor-id'] || '');
  const safe = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
  return safe.length >= 8 ? safe : null;
}

function rankFor(score, updatedAt) {
  // Single-field sort (avoids composite index): higher score then newer updates.
  // Keep within IEEE-754 safe integer range.
  return score * 1e12 + updatedAt;
}

app.get(serverUrl.pathname + 'api/issues', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const limit = Math.min(Number(req.query?.limit || 30) || 30, 50);

  const snap = await fb.db
    .collection('issues')
    .orderBy('rank', 'desc')
    .limit(limit)
    .get();

  const issues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return reply.send({ issues });
});

app.post(serverUrl.pathname + 'api/issues', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const imageUrls = Array.isArray(req.body?.imageUrls) ? req.body.imageUrls : [];

  if (title.length < 3 || title.length > 120) {
    return reply.code(400).send({ error: 'Invalid title length.' });
  }
  if (body.length < 3 || body.length > 6000) {
    return reply.code(400).send({ error: 'Invalid body length.' });
  }
  if (imageUrls.length > 6) {
    return reply.code(400).send({ error: 'Too many images.' });
  }

  const now = Date.now();
  const doc = {
    title,
    body,
    imageUrls,
    createdAt: now,
    updatedAt: now,
    likes: 0,
    dislikes: 0,
    score: 0,
    commentCount: 0,
    rank: rankFor(0, now),
  };

  const ref = await fb.db.collection('issues').add(doc);
  return reply.send({ id: ref.id });
});

app.get(serverUrl.pathname + 'api/issues/:id', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const id = String(req.params.id || '').trim();
  const issueRef = fb.db.collection('issues').doc(id);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) return reply.code(404).send({ error: 'Not found.' });

  const commentsSnap = await issueRef
    .collection('comments')
    .orderBy('createdAt', 'asc')
    .limit(300)
    .get();

  const comments = commentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return reply.send({ issue: { id, ...issueSnap.data() }, comments });
});

app.post(serverUrl.pathname + 'api/issues/:id/comments', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const id = String(req.params.id || '').trim();
  const body = String(req.body?.body || '').trim();
  const parentId = req.body?.parentId ? String(req.body.parentId) : null;
  const imageUrls = Array.isArray(req.body?.imageUrls) ? req.body.imageUrls : [];

  if (body.length < 1 || body.length > 6000) {
    return reply.code(400).send({ error: 'Invalid comment length.' });
  }
  if (imageUrls.length > 6) {
    return reply.code(400).send({ error: 'Too many images.' });
  }

  const now = Date.now();
  const issueRef = fb.db.collection('issues').doc(id);

  await fb.db.runTransaction(async (tx) => {
    const issueSnap = await tx.get(issueRef);
    if (!issueSnap.exists) throw new Error('NOT_FOUND');
    const issue = issueSnap.data();

    tx.set(issueRef.collection('comments').doc(), {
      body,
      parentId,
      imageUrls,
      createdAt: now,
    });

    const nextCount = Number(issue.commentCount || 0) + 1;
    const nextUpdated = now;
    const nextScore = Number(issue.score || 0);
    tx.update(issueRef, {
      commentCount: nextCount,
      updatedAt: nextUpdated,
      rank: rankFor(nextScore, nextUpdated),
    });
  });

  return reply.send({ ok: true });
});

app.post(serverUrl.pathname + 'api/issues/:id/reaction', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const visitorId = getVisitorId(req);
  if (!visitorId) return reply.code(400).send({ error: 'Missing visitor id.' });

  const id = String(req.params.id || '').trim();
  const incoming = Number(req.body?.value);
  if (![1, -1].includes(incoming)) return reply.code(400).send({ error: 'Bad value.' });

  const issueRef = fb.db.collection('issues').doc(id);
  const reactRef = issueRef.collection('reactions').doc(visitorId);

  await fb.db.runTransaction(async (tx) => {
    const [issueSnap, reactSnap] = await Promise.all([tx.get(issueRef), tx.get(reactRef)]);
    if (!issueSnap.exists) throw new Error('NOT_FOUND');

    const issue = issueSnap.data();
    const prev = reactSnap.exists ? Number(reactSnap.data().value || 0) : 0;
    const next = prev === incoming ? 0 : incoming;
    const delta = next - prev;

    const prevLikes = Number(issue.likes || 0);
    const prevDislikes = Number(issue.dislikes || 0);
    const prevScore = Number(issue.score || 0);

    const nextScore = prevScore + delta;

    const likeDelta = (prev === 1 ? -1 : 0) + (next === 1 ? 1 : 0);
    const dislikeDelta = (prev === -1 ? -1 : 0) + (next === -1 ? 1 : 0);

    const now = Date.now();

    tx.update(issueRef, {
      likes: prevLikes + likeDelta,
      dislikes: prevDislikes + dislikeDelta,
      score: nextScore,
      updatedAt: now,
      rank: rankFor(nextScore, now),
    });

    if (next === 0) tx.delete(reactRef);
    else tx.set(reactRef, { value: next, updatedAt: now }, { merge: true });
  });

  return reply.send({ ok: true });
});

app.post(serverUrl.pathname + 'api/issues/upload', async (req, reply) => {
  let fb;
  try {
    fb = initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const urls = [];
  const parts = req.files();

  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (!part.mimetype || !part.mimetype.startsWith('image/')) continue;

    const buf = await part.toBuffer();
    const token = randomUUID();
    const ext = (part.filename || '').split('.').pop()?.slice(0, 10) || 'img';
    const objectPath = `issues/${Date.now()}-${token}.${ext}`;
    const file = fb.bucket.file(objectPath);

    await file.save(buf, {
      contentType: part.mimetype,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      resumable: false,
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(fb.bucketName)}` +
      `/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
    urls.push(url);

    if (urls.length >= 6) break;
  }

  return reply.send({ urls });
});

app.register(fastifyStatic, {
  root: fileURLToPath(
    new URL('../views/dist/archive/gfiles/rarch', import.meta.url)
  ),
  prefix: getAltPrefix('serving', serverUrl.pathname),
  decorateReply: false,
});

// You should NEVER commit roms, due to piracy concerns.
['cores', 'info', 'roms'].forEach((prefix) => {
  app.register(fastifyStatic, {
    root: fileURLToPath(
      new URL('../views/dist/archive/gfiles/rarch/' + prefix, import.meta.url)
    ),
    prefix: getAltPrefix(prefix, serverUrl.pathname),
    decorateReply: false,
  });
});

app.register(fastifyStatic, {
  root: fileURLToPath(
    new URL('../views/dist/archive/gfiles/rarch/cores', import.meta.url)
  ),
  prefix: getAltPrefix('uauth', serverUrl.pathname),
  decorateReply: false,
});

// Serve GAMESFORCHEATS (Local Games)
app.register(fastifyStatic, {
  root: join(__dirname, '../GAMESFORCHEATS'),
  prefix: '/GAMESFORCHEATS/',
  decorateReply: false,
});

// Serve Scripts (Cheats)
app.register(fastifyStatic, {
  root: join(__dirname, '../scripts'),
  prefix: '/scripts/',
  decorateReply: false,
});

/* If you are trying to add pages or assets in the root folder and
 * NOT entire folders, check ./src/routes.mjs and add it manually.
 *
 * All website files are stored in the /views directory.
 */

const supportedTypes = {
  default: config.disguiseFiles ? 'image/vnd.microsoft.icon' : 'text/html',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  wasm: 'application/wasm',
  txt: 'text/plain',
  xml: 'application/xml',
  ico: 'image/vnd.microsoft.icon',
},
  disguise = 'ico';

if (config.disguiseFiles) {
  const getActualPath = (path) =>
    path.slice(0, path.length - 1 - disguise.length),
    shouldNotHandle = new RegExp(`\\.(?!html$|${disguise}$)[\\w-]+$`, 'i'),
    loaderFile = tryReadFile(
      '../views/dist/pages/misc/deobf/loader.html',
      import.meta.url,
      false
    );
  let exemptDirs = [
    'assets',
    'uv',
    'scram',
    'epoxy',
    'libcurl',
    'baremux',
    'wisp',
    'chii',
  ].map((dir) => getAltPrefix(dir, serverUrl.pathname).slice(1, -1)),
    exemptPages = ['login', 'test-shutdown', 'favicon.ico', 'blooket', 'blooket-loader', 'blooket-ws', 'stuff', 'games'];

  // Always exempt API endpoints from the disguise/loader behavior.
  exemptDirs.push('api');
  for (const [key, value] of Object.entries(externalPages))
    if ('string' === typeof value) exemptPages.push(key);
    else exemptDirs.push(key);
  for (const path of rammerheadScopes)
    if (!shouldNotHandle.test(path)) exemptDirs.push(path.slice(1));
  exemptPages = exemptPages.concat(exemptDirs);
  if (pages.default === 'login') exemptPages.push('');

  app.addHook('preHandler', (req, reply, done) => {
    if (req.params.modified) return done();
    const reqPath = new URL(req.url, serverUrl).pathname.slice(
      serverUrl.pathname.length
    );
    if (
      shouldNotHandle.test(reqPath) ||
      exemptDirs.some((dir) => reqPath.indexOf(dir + '/') === 0) ||
      exemptPages.includes(reqPath) ||
      rammerheadSession.test(serverUrl.pathname + reqPath)
    )
      return done();

    if (!reqPath.endsWith('.' + disguise)) {
      reply.type(supportedTypes.html).send(loaderFile);
      reply.hijack();
      return done();
    } else if (!(reqPath in pages) && !reqPath.endsWith('favicon.ico')) {
      req.params.modified = true;
      req.raw.url = getActualPath(req.raw.url);
      if (req.params.path) req.params.path = getActualPath(req.params.path);
      if (req.params['*']) req.params['*'] = getActualPath(req.params['*']);
      reply.type(supportedTypes[disguise]);
      reply.header('Access-Control-Allow-Origin', 'null');
    }
    return done();
  });
}

// ========================
// WUBU CUSTOM ROUTES
// ========================

// Root route - Redirect to /stuff
if (serverUrl.pathname === '/') {
  app.get('/', (req, reply) => {
    reply.redirect('/stuff');
  });
}

// Stuff Route - Serve custom Wubu hub page
app.get(serverUrl.pathname + 'stuff', (req, reply) => {
  const pagePath = join(__dirname, '../views/stuff.html');
  try {
    const content = readFileSync(pagePath, 'utf-8');
    reply.type('text/html').send(content);
  } catch (e) {
    reply.code(404).send('Stuff page not found');
  }
});

// Browsing Route - Serve the Holy Unblocker surf page (uses UV/Scramjet proxy)
app.get(serverUrl.pathname + 'browsing', (req, reply) => {
  try {
    const content = tryReadFile('../views/dist/pages/surf.html', import.meta.url);
    reply.type('text/html').send(content);
  } catch (e) {
    reply.code(404).send('Browsing page not found');
  }
});

// Blooket Loader Endpoint (serves cheat scripts)
app.get(serverUrl.pathname + 'blooket-loader', (req, reply) => {
  const scriptPath = join(__dirname, '../blooket-cheats/master.js');
  try {
    const scriptContent = readFileSync(scriptPath, 'utf-8');
    return reply
      .header('Content-Type', 'text/html')
      .header('Access-Control-Allow-Origin', '*')
      .send(`<!DOCTYPE html><html><body><pre>${scriptContent}</pre></body></html>`);
  } catch (e) {
    return reply.code(404).send('Script not found');
  }
});

// Blooket Page Route - Uses Puppeteer streaming proxy for Blooket
app.get(serverUrl.pathname + 'blooket', (req, reply) => {
  const pagePath = join(__dirname, '../views/pages/blooket.html');
  try {
    const content = readFileSync(pagePath, 'utf-8');
    reply.type('text/html').send(content);
  } catch (e) {
    reply.code(404).send('Blooket Page Not Found');
  }
});

// Games Route - Serve the Games library
app.get(serverUrl.pathname + 'games', (req, reply) => {
  // Try dist first, then source
  let pagePath = join(__dirname, '../views/dist/pages/games.html');
  if (!existsSync(pagePath)) {
    pagePath = join(__dirname, '../views/pages/games.html');
  }

  try {
    const content = readFileSync(pagePath, 'utf-8');
    reply.type('text/html').send(content);
  } catch (e) {
    console.error('Failed to load games page:', e);
    reply.code(404).send('Games Page Not Found');
  }
});

// Game Proxy Route - Injects Scripts
app.get(serverUrl.pathname + 'game-proxy', async (req, reply) => {
  const url = req.query.url;
  const scriptName = req.query.script;

  if (!url) return reply.code(400).send('Missing URL');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch');
    const text = await response.text();

    // Determine script path
    let scriptContent = '';
    if (scriptName === 'tag') {
      const p = join(__dirname, '../scripts/tag-ai.js');
      if (existsSync(p)) scriptContent = readFileSync(p, 'utf-8');
    } else if (scriptName === 'dino') {
      const p = join(__dirname, '../scripts/dino-cheats.js');
      if (existsSync(p)) scriptContent = readFileSync(p, 'utf-8');
    }

    // Inject <base> to make relative links work
    const origin = new URL(url).origin;

    // Fix: If the URL looks like a directory (no file extension) but lacks a trailing slash,
    // add it for the base tag.
    let baseRef = url;
    const lastSegment = url.split('/').pop();
    if (!lastSegment.includes('.')) {
      if (!baseRef.endsWith('/')) baseRef += '/';
    } else {
      // It's a file, strip the filename
      baseRef = url.substring(0, url.lastIndexOf('/') + 1);
    }

    let modified = text.replace('<head>', `<head><base href="${baseRef}">`);

    // Inject Script
    const injection = `<script>${scriptContent}</script>`;
    modified = modified.replace('</body>', `${injection}</body>`);

    reply.type('text/html').send(modified);
  } catch (e) {
    reply.code(500).send('Proxy Error: ' + e.message);
  }
});

// ========================
// ORIGINAL HOLY UNBLOCKER ROUTES
// ========================

app.get(serverUrl.pathname + ':path', (req, reply) => {
  const reqPath = req.params.path;

  // Ignore browsers' automatic requests to favicon.ico
  if (reqPath === 'favicon.ico') {
    reply.send();
    return reply.hijack();
  }



  // Original Header check...
  if (reqPath in externalPages) {
    if (req.params.modified)
      return reply.code(404).type(supportedTypes.html).send(preloaded404);
    let externalRoute = externalPages[reqPath];
    if (typeof externalRoute !== 'string')
      externalRoute = externalRoute.default;
    return reply.redirect(externalRoute);
  }

  // Shutdown test endpoint
  if (reqPath === 'test-shutdown' && existsSync(shutdown)) {
    console.log('Holy Unblocker is shutting down.');
    app.close();
    unlinkSync(shutdown);
    process.exitCode = 0;
  }

  // Return the error page if the query is not found in routes.mjs.
  if (reqPath && !(reqPath in pages))
    return reply.code(404).type(supportedTypes.default).send(preloaded404);

  // Serve the default page if the path is the default path.
  const fileName = reqPath ? pages[reqPath] : pages[pages.default],
    type =
      supportedTypes[fileName.slice(fileName.lastIndexOf('.') + 1)] ||
      supportedTypes.default;

  if (req.params.modified) reply.type(supportedTypes[disguise]);
  else reply.type(type);
  reply.send(tryReadFile('../views/dist/' + fileName, import.meta.url));
});

app.get(serverUrl.pathname + 'github/:redirect', (req, reply) => {
  if (req.params.redirect in externalPages.github)
    reply.redirect(externalPages.github[req.params.redirect]);
  else reply.code(404).type(supportedTypes.default).send(preloaded404);
});

if (serverUrl.pathname === '/')
  // Set an error page for invalid paths outside the query string system.
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).type(supportedTypes.default).send(preloaded404);
  });
else {
  // Apply patch if the server URL has a prefix.
  app.get(serverUrl.pathname, (req, reply) => {
    reply
      .type(supportedTypes.default)
      .send(tryReadFile('../views/dist/' + pages.index, import.meta.url));
  });
}

// ========================
// START SERVER
// ========================

app.listen({ port: serverUrl.port, host: serverUrl.hostname });
console.log(`Wubu Unblocker is listening on port ${serverUrl.port}.`);
console.log(`
=================================================
  WUBU UNIFIED PROXY
=================================================
  - Blooket: Uses Puppeteer streaming proxy
  - Other sites: Uses Rammerhead/UV/Scramjet
  
  Visit /stuff for the main hub
  Visit /blooket for enhanced Blooket experience
  Visit /browsing for other proxy options
=================================================
`);
if (config.disguiseFiles)
  console.log(
    'disguiseFiles is enabled. Visit src/routes.mjs to see the entry point, listed within the pages variable.'
  );
