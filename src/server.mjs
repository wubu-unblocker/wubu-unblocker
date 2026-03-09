import Fastify from 'fastify';
import { createServer } from 'node:http';
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import ytSearch from 'yt-search';
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
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const wuTubeDistRoot = join(__dirname, '../YouTube-Clone/dist');
const wuTubeIndexPath = join(wuTubeDistRoot, 'index.html');
const wuTubeViteIconPath = join(wuTubeDistRoot, 'vite.svg');
let firebaseAdminPromise;
let blooketServicePromise;

/* Record the server's location as a URL object, including its host and port.
 * The host can be modified at /src/config.json, whereas the ports can be modified
 * at /ecosystem.config.js.
 */
console.log('Server URL:', serverUrl);

const WS_DEBUG = String(process.env.WUBU_WS_DEBUG || '').toLowerCase() === 'true';

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

async function getFirebaseAdmin() {
  if (!firebaseAdminPromise) {
    firebaseAdminPromise = import('firebase-admin').then(
      (module) => module.default || module
    );
  }
  return await firebaseAdminPromise;
}

async function getBlooketService() {
  if (!blooketServicePromise) {
    blooketServicePromise = import('./blooket-service.mjs').then(
      ({ setupBlooketService }) => setupBlooketService()
    );
  }
  return await blooketServicePromise;
}

// Puppeteer/Chromium startup is expensive on small hosts (HF Spaces) and can cause large
// latency spikes for all requests if we pre-warm at boot. Default to lazy-start on the
// first Blooket websocket connection. Opt-in prewarm via env.
if (String(process.env.BLOOKET_PREWARM || '').toLowerCase() === 'true') {
  // Defer a bit so the HTTP server can come up first.
  setTimeout(() => {
    void getBlooketService()
      .then(({ startBrowser }) => startBrowser())
      .catch((err) => console.error('Failed to prewarm Blooket Browser:', err));
  }, 1500);
}

// Create a server factory for Rammerhead, Wisp, and Blooket
const serverFactory = (handler) => {
  // Some modern sites (notably Google/YouTube) can accumulate very large Cookie headers
  // when proxied, which may exceed Node's default 16KB header limit and cause HTTP 431.
  // Keep this bounded to reduce DoS risk while avoiding common breakage.
  return createServer({ maxHeaderSize: 64 * 1024 })
    .on('request', (req, res) => {
      handler(req, res);
    })
    .on('upgrade', (req, socket, head) => {
      // Avoid console logging here by default: UV/Scramjet/BareMux can open lots of
      // websocket connections and stdout logging will absolutely crush throughput
      // on hosted platforms.
      if (WS_DEBUG) console.log('[WebSocket Upgrade] Incoming URL:', req.url);

      // Blooket WebSocket - Use the streaming proxy for Blooket
      const blooketWsPath = serverUrl.pathname + 'blooket-ws';
      if (req.url === blooketWsPath || req.url === '/blooket-ws') {
        if (WS_DEBUG) console.log('[WebSocket] Routing to Blooket service');
        void getBlooketService()
          .then(({ wss }) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req);
            });
          })
          .catch((err) => {
            console.error('[WebSocket] Failed to initialize Blooket service:', err);
            socket.destroy();
          });
        return;
      }

      // Wisp WebSocket - for BareMux proxy connections
      const wispPath = getAltPrefix('wisp', serverUrl.pathname); // /cron/
      if (
        req.url.startsWith(wispPath) ||
        req.url === '/cron/' ||
        req.url.startsWith('/cron') ||
        req.url === '/wisp/' ||
        req.url.startsWith('/wisp')
      ) {
        if (WS_DEBUG) console.log('[WebSocket] Routing to Wisp service');
        wisp.routeRequest(req, socket, head);
        return;
      }

      // Unknown WebSocket - close connection
      if (WS_DEBUG) console.log('[WebSocket] Unknown upgrade path:', req.url);
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

app.get('/healthz', (req, reply) => {
  reply
    .header('Cache-Control', 'no-store, max-age=0')
    .type('text/plain; charset=utf-8')
    .send('ok');
});

app.get('/_hf/ready', (req, reply) => {
  reply
    .header('Cache-Control', 'no-store, max-age=0')
    .type('text/plain; charset=utf-8')
    .send('ok');
});

// Apply Helmet middleware for security.
app.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Disable CSP
  xPoweredBy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
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
    // Service worker scripts must not be cached as immutable or updates will be delayed/stuck.
    // This also helps reduce "random" proxy breakage after updates.
    setHeaders: (res, pathName) => {
      const p = String(pathName || '').toLowerCase();
      if (p.endsWith('sw.js') || p.endsWith('sw-blacklist.js')) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return;
      }

      // BareMux client/worker scripts should not be immutable cached.
      // Mismatched versions can produce "port is dead" / ping timeout loops.
      if (prefix === 'baremux' && (p.endsWith('/index.js') || p.endsWith('/worker.js'))) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      }
    },
  });
});

// Primary static handler for assets and pages
app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../views/dist', import.meta.url)),
  prefix: serverUrl.pathname,
  decorateReply: false,
  maxAge: '1h',
  cacheControl: true,
  setHeaders: (res, pathName) => {
    const p = String(pathName || '').toLowerCase();
    // Always serve latest proxy bootstrap script to prevent stale init logic.
    if (p.endsWith('/assets/js/register-sw.js')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  },
});

// ========================
// ISSUES API (FIREBASE)
// ========================

let issuesFirebase;

function tryParseServiceAccountJson(raw, sourceLabel) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // HF Secrets sometimes get pasted as JSON, sometimes as base64. Accept both.
  try {
    return JSON.parse(trimmed);
  } catch (e1) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      return JSON.parse(decoded);
    } catch (e2) {
      const msg =
        `Invalid Firebase credentials in ${sourceLabel}. ` +
        `Provide FIREBASE_SERVICE_ACCOUNT_JSON as raw JSON, or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 as base64(JSON).`;
      const err = new Error(msg);
      err.cause = e2;
      throw err;
    }
  }
}

async function initIssuesFirebase() {
  if (issuesFirebase) return issuesFirebase;
  const admin = await getFirebaseAdmin();

  let serviceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    join(process.cwd(), 'wubu-issues-firebase-adminsdk-fbsvc-ce52cdd6d1.json');

  if (raw) {
    serviceAccount = tryParseServiceAccountJson(raw, 'FIREBASE_SERVICE_ACCOUNT_JSON');
  } else if (rawB64) {
    serviceAccount = tryParseServiceAccountJson(rawB64, 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64');
  } else if (existsSync(path)) {
    serviceAccount = tryParseServiceAccountJson(readFileSync(path, 'utf8'), `FIREBASE_SERVICE_ACCOUNT_PATH (${path})`);
  } else {
    throw new Error(
      'Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) in HuggingFace Space Secrets.'
    );
  }

  const projectId = String(serviceAccount?.project_id || '').trim();
  if (!projectId) {
    throw new Error(
      'Firebase credentials are missing project_id. Re-download the service account JSON from Firebase/Google Cloud.'
    );
  }

  // Default bucket naming varies across Firebase projects; allow override.
  // Most projects use "<projectId>.appspot.com". Some newer projects use "<projectId>.firebasestorage.app".
  const bucketName = String(
    process.env.FIREBASE_STORAGE_BUCKET ||
      `${projectId}.appspot.com`
  ).trim();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  // Be explicit about runtime behavior and avoid weird undefined merges.
  try {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() can only be called once; ignore if already configured.
  }

  issuesFirebase = Object.freeze({
    db: admin.firestore(),
    bucket: admin.storage().bucket(bucketName),
    bucketName,
    projectId,
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
    fb = await initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const limit = Math.min(Number(req.query?.limit || 30) || 30, 50);

  let snap;
  try {
    snap = await fb.db
      .collection('issues')
      .orderBy('rank', 'desc')
      .limit(limit)
      .get();
  } catch (e) {
    console.error('[api/issues] Firestore query failed:', e);
    return reply.code(500).send({
      error:
        'Firestore query failed. Ensure Firestore is enabled for this Firebase project and the service account has access.',
      detail: String(e.message || e),
    });
  }

  const issues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return reply.send({ issues });
});

// Debug endpoint to quickly verify Firebase init on HF.
app.get(serverUrl.pathname + 'api/issues/health', async (req, reply) => {
  try {
    const fb = await initIssuesFirebase();
    return reply.send({
      ok: true,
      projectId: fb.projectId,
      bucketName: fb.bucketName,
    });
  } catch (e) {
    return reply.code(503).send({ ok: false, error: String(e.message || e) });
  }
});

app.post(serverUrl.pathname + 'api/issues', async (req, reply) => {
  let fb;
  try {
    fb = await initIssuesFirebase();
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

  try {
    const ref = await fb.db.collection('issues').add(doc);
    return reply.send({ id: ref.id });
  } catch (e) {
    console.error('[api/issues POST] Firestore add failed:', e);
    return reply.code(500).send({
      error:
        'Failed to create issue in Firestore. Ensure Firestore is enabled and the service account has permission.',
      detail: String(e.message || e),
    });
  }
});

app.get(serverUrl.pathname + 'api/issues/:id', async (req, reply) => {
  let fb;
  try {
    fb = await initIssuesFirebase();
  } catch (e) {
    return reply.code(503).send({ error: String(e.message || e) });
  }

  const id = String(req.params.id || '').trim();
  const issueRef = fb.db.collection('issues').doc(id);
  let issueSnap;
  try {
    issueSnap = await issueRef.get();
  } catch (e) {
    console.error('[api/issues/:id] Firestore get failed:', e);
    return reply.code(500).send({
      error: 'Failed to load issue from Firestore.',
      detail: String(e.message || e),
    });
  }
  if (!issueSnap.exists) return reply.code(404).send({ error: 'Not found.' });

  let commentsSnap;
  try {
    commentsSnap = await issueRef
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .limit(300)
      .get();
  } catch (e) {
    console.error('[api/issues/:id] Firestore comments query failed:', e);
    return reply.code(500).send({
      error: 'Failed to load comments from Firestore.',
      detail: String(e.message || e),
    });
  }

  const comments = commentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return reply.send({ issue: { id, ...issueSnap.data() }, comments });
});

app.post(serverUrl.pathname + 'api/issues/:id/comments', async (req, reply) => {
  let fb;
  try {
    fb = await initIssuesFirebase();
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

  try {
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
  } catch (e) {
    if (String(e.message || e) === 'NOT_FOUND') {
      return reply.code(404).send({ error: 'Not found.' });
    }
    console.error('[api/issues/:id/comments] Transaction failed:', e);
    return reply.code(500).send({
      error: 'Failed to post reply.',
      detail: String(e.message || e),
    });
  }

  return reply.send({ ok: true });
});

app.post(serverUrl.pathname + 'api/issues/:id/reaction', async (req, reply) => {
  let fb;
  try {
    fb = await initIssuesFirebase();
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

  try {
    await fb.db.runTransaction(async (tx) => {
      const [issueSnap, reactSnap] = await Promise.all([
        tx.get(issueRef),
        tx.get(reactRef),
      ]);
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
  } catch (e) {
    if (String(e.message || e) === 'NOT_FOUND') {
      return reply.code(404).send({ error: 'Not found.' });
    }
    console.error('[api/issues/:id/reaction] Transaction failed:', e);
    return reply.code(500).send({
      error: 'Failed to save reaction.',
      detail: String(e.message || e),
    });
  }

  return reply.send({ ok: true });
});

app.post(serverUrl.pathname + 'api/issues/upload', async (req, reply) => {
  let fb;
  try {
    fb = await initIssuesFirebase();
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

    try {
      await file.save(buf, {
        contentType: part.mimetype,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
        resumable: false,
      });
    } catch (e) {
      // Common HF misconfig: bucket name mismatch or Storage not enabled.
      const msg =
        'Upload failed. Check FIREBASE_STORAGE_BUCKET (if set) and ensure Firebase Storage is enabled for this project.';
      console.error('[issues/upload] Storage save failed:', e);
      return reply.code(500).send({ error: msg });
    }

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
    'youtube',
  ].map((dir) => getAltPrefix(dir, serverUrl.pathname).slice(1, -1)),
    exemptPages = ['login', 'test-shutdown', 'favicon.ico', 'blooket', 'blooket-loader', 'blooket-ws', 'home', 'games', 'youtube', 'wiki'];

  // Always exempt API endpoints from the disguise/loader behavior.
  exemptDirs.push('api');
  for (const [key, value] of Object.entries(externalPages))
    if ('string' === typeof value) exemptPages.push(key);
    else exemptDirs.push(key);
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
      exemptPages.includes(reqPath) 
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

const wuTubeHomeQueries = [
  { title: 'Trending now', query: 'trending videos today' },
  { title: 'Music picks', query: 'official music video new releases' },
  { title: 'Gaming live', query: 'gaming highlights 2026' },
  { title: 'Build mode', query: 'coding tutorials web development' },
];

function wuTubeText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  if (typeof value.text === 'string') return value.text;
  return String(value);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function wuTubeThumbnail(thumbnails, fallbackId = '') {
  const best = Array.isArray(thumbnails) && thumbnails.length ? thumbnails[0].url : '';
  return best || (fallbackId ? `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg` : '');
}

function wuTubeViews(value) {
  if (typeof value === 'number') return value;
  const digits = wuTubeText(value).replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function wuTubeTimestamp(lengthText, seconds) {
  if (wuTubeText(lengthText)) return wuTubeText(lengthText);
  if (!seconds) return 'Live';
  const total = Number(seconds);
  const parts = [];
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  if (hours) parts.push(String(hours));
  parts.push(String(minutes).padStart(hours ? 2 : 1, '0'));
  parts.push(String(remaining).padStart(2, '0'));
  return parts.join(':');
}

function normalizeWuTubeSearchVideo(video) {
  return {
    videoId: video.videoId || video.video_id,
    url: video.url || `https://youtube.com/watch?v=${video.videoId || video.video_id}`,
    title: wuTubeText(video.title) || 'Untitled video',
    description: wuTubeText(video.description || video.description_snippet),
    thumbnail: wuTubeThumbnail(
      video.thumbnail ? [{ url: video.thumbnail }] : video.thumbnails,
      video.videoId || video.video_id
    ),
    views: wuTubeViews(video.views || video.view_count || video.short_view_count),
    timestamp: wuTubeTimestamp(video.timestamp || video.length_text, video.seconds),
    seconds: Number(video.seconds) || 0,
    ago: wuTubeText(video.ago || video.published),
    uploadDate: wuTubeText(video.uploadDate || video.published),
    author: {
      name: wuTubeText(video.author?.name || video.author) || 'Unknown creator',
      url: wuTubeText(video.author?.url),
    },
  };
}

function normalizeWuTubeInfo(info, videoId) {
  return {
    videoId,
    url: `https://youtube.com/watch?v=${videoId}`,
    title: wuTubeText(info.title) || 'Untitled video',
    description: wuTubeText(info.description),
    thumbnail: wuTubeThumbnail(
      info.thumbnail ? [{ url: info.thumbnail }] : info.thumbnails,
      videoId
    ),
    views: wuTubeViews(info.views),
    timestamp: wuTubeTimestamp(info.timestamp, info.seconds),
    seconds: Number(info.seconds) || 0,
    ago: wuTubeText(info.ago),
    uploadDate: wuTubeText(info.uploadDate),
    author: {
      name: wuTubeText(info.author?.name || info.author) || 'Unknown creator',
      url: wuTubeText(info.author?.url),
    },
  };
}

async function searchWuTubeVideos(query, limit = 12) {
  const result = await withTimeout(ytSearch(query), 12000, `WuTube search (${query})`);
  return (result?.videos || []).slice(0, limit).map(normalizeWuTubeSearchVideo);
}

async function loadWuTubeVideo(videoId) {
  const result = await withTimeout(ytSearch({ videoId }), 12000, `WuTube video (${videoId})`);
  return normalizeWuTubeInfo(result, videoId);
}

function sendWuTubeIndex(reply) {
  reply.type('text/html').send(readFileSync(wuTubeIndexPath, 'utf-8'));
}

// Root route - Redirect to /stuff
if (serverUrl.pathname === '/') {
  app.get('/', (req, reply) => {
    try {
      const content = tryReadFile('../views/home.html', import.meta.url, false);
      reply.type('text/html').send(content);
    } catch (e) {
      reply.code(404).send('Home page not found');
    }
  });
}

// Home Route - Serve custom Wubu hub page
app.get(serverUrl.pathname + 'home', (req, reply) => {
  try {
    const content = tryReadFile('../views/home.html', import.meta.url, false);
    reply.type('text/html').send(content);
  } catch (e) {
    reply.code(404).send('Home page not found');
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

app.register(fastifyStatic, {
  root: join(wuTubeDistRoot, 'assets'),
  prefix: serverUrl.pathname + 'youtube/assets/',
  decorateReply: false,
});

app.get(serverUrl.pathname + 'youtube/vite.svg', (req, reply) => {
  reply.type('image/svg+xml').send(readFileSync(wuTubeViteIconPath, 'utf-8'));
});

app.get(serverUrl.pathname + 'youtube/api/home', async (req, reply) => {
  const settled = await Promise.allSettled(
    wuTubeHomeQueries.map(async (section) => ({
      ...section,
      videos: await searchWuTubeVideos(section.query, 8),
    }))
  );

  const sections = settled
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((section) => section && section.videos.length);

  if (!sections.length) {
    console.error(
      '[WuTube] Home feed failed:',
      settled.map((result) => (result.status === 'rejected' ? result.reason : null)).filter(Boolean)
    );
    return reply.code(500).send({ error: 'Failed to load home feed.' });
  }

  return reply.send({
    sections,
    degraded: sections.length !== wuTubeHomeQueries.length,
  });
});

app.get(serverUrl.pathname + 'youtube/api/search', async (req, reply) => {
  const query = String(req.query?.q || '').trim();
  if (!query) return reply.code(400).send({ error: 'Missing query.' });

  try {
    const videos = await searchWuTubeVideos(query, 18);
    return reply.send({ query, videos });
  } catch (e) {
    console.error('[WuTube] Search failed:', e);
    return reply.code(500).send({ error: 'Search failed.' });
  }
});

app.get(serverUrl.pathname + 'youtube/api/video/:id', async (req, reply) => {
  try {
    const video = await loadWuTubeVideo(req.params.id);
    const relatedQuery = `${video.author.name} ${video.title}`.trim();
    const related = (await searchWuTubeVideos(relatedQuery, 10)).filter(
      (candidate) => candidate.videoId !== video.videoId
    );

    return reply.send({ video, related });
  } catch (e) {
    console.error('[WuTube] Video load failed:', e);
    return reply.code(500).send({ error: 'Video load failed.' });
  }
});

app.get(serverUrl.pathname + 'youtube', (req, reply) => {
  sendWuTubeIndex(reply);
});

app.get(serverUrl.pathname + 'youtube/*', (req, reply) => {
  sendWuTubeIndex(reply);
});

// Legacy WuTube alias from the prior bad SEO mapping.
app.get(serverUrl.pathname + 'wiki', (req, reply) => {
  reply.redirect(serverUrl.pathname + 'youtube');
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
  try {
    const content = tryReadFile('../views/pages/blooket.html', import.meta.url, false);
    reply.type('text/html').send(content);
  } catch (e) {
    reply.code(404).send('Blooket Page Not Found');
  }
});

// Games Route - Serve the Games library
app.get(serverUrl.pathname + 'games', (req, reply) => {
  try {
    // Try dist first, then source.
    let content = tryReadFile('../views/dist/pages/games.html', import.meta.url, false);
    if (content === preloaded404) {
      content = tryReadFile('../views/pages/games.html', import.meta.url, false);
    }
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

if (serverUrl.pathname === '/') {
  // If a proxied page generates root-relative asset URLs (e.g. "/cdn/..."),
  // the browser will request them outside the UV SW scope and get our HTML 404.
  // Detect that case via Referer and redirect into the UV service prefix so the SW can proxy it.
  const uvServicePrefix = getAltPrefix('uv', serverUrl.pathname) + 'service/';

  const xorTransform = (str) =>
    String(str || '')
      .split('')
      .map((ch, i) =>
        i % 2 ? String.fromCharCode(ch.charCodeAt(0) ^ 2) : ch
      )
      .join('');

  const xorEncode = (str) => encodeURIComponent(xorTransform(str));
  const xorDecode = (str) => xorTransform(decodeURIComponent(String(str || '')));

  const decodeUvFromUrl = (url) => {
    try {
      const u = new URL(url);
      if (!u.pathname.startsWith(uvServicePrefix)) return null;
      const encoded = u.pathname.slice(uvServicePrefix.length);
      if (!encoded) return null;
      return xorDecode(encoded);
    } catch {
      return null;
    }
  };

  const allowedAssetExts = new Set([
    'css',
    'js',
    'mjs',
    'json',
    'wasm',
    'map',
    // Game / app payloads often use these and may request them as root-relative assets.
    'txt',
    'csv',
    'tsv',
    'dat',
    'bin',
    'pak',
    'zip',
    'unityweb',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'webp',
    'ico',
    'mp3',
    'wav',
    'ogg',
    'm4a',
    'aac',
    'mp4',
    'webm',
    'm3u8',
    'mpd',
    'vtt',
    'srt',
    'woff',
    'woff2',
    'ttf',
    'ttc',
    'otf',
    'eot',
  ]);

  const internalPrefixes = [
    getAltPrefix('uv', serverUrl.pathname),
    getAltPrefix('scram', serverUrl.pathname),
    getAltPrefix('baremux', serverUrl.pathname),
    getAltPrefix('wisp', serverUrl.pathname),
    serverUrl.pathname + 'assets/',
    serverUrl.pathname + 'api/',
    serverUrl.pathname + 'youtube/assets/',
    serverUrl.pathname + 'youtube/api/',
    serverUrl.pathname + 'scripts/',
    '/GAMESFORCHEATS/',
  ];

  // Set an error page for invalid paths outside the query string system.
  app.setNotFoundHandler((req, reply) => {
    try {
      const u = new URL(req.url, 'http://local.invalid');
      const pathname = u.pathname || '';

      // Never interfere with our own internal routes/prefixes.
      if (!internalPrefixes.some((p) => pathname.startsWith(p))) {
        const ext = (pathname.split('.').pop() || '').toLowerCase();
        if (ext && allowedAssetExts.has(ext)) {
          const referer = String(req.headers.referer || '');
          const remoteRef = decodeUvFromUrl(referer);
          if (remoteRef) {
            const remoteOrigin = new URL(remoteRef).origin;
            const targetRemote = new URL(pathname + (u.search || ''), remoteOrigin).href;
            const redirectTo = uvServicePrefix + xorEncode(targetRemote);
            reply.redirect(redirectTo);
            return reply;
          }
        }
      }
    } catch {
      // Fall through to the default 404 page.
    }

    reply.code(404).type(supportedTypes.default).send(preloaded404);
  });
} else {
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

try {
  await app.listen({ port: serverUrl.port, host: serverUrl.hostname });
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

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
