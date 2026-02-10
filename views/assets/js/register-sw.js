// register-sw.js - Fixed version with proper BareMux initialization order

const waitForBareMux = () => {
  return new Promise((resolve, reject) => {
    if (typeof BareMux !== 'undefined' && BareMux.BareMuxConnection) {
      console.log('BareMux already available');
      resolve();
      return;
    }

    let attempts = 0;
    const maxAttempts = 100; // 5 seconds total

    const check = setInterval(() => {
      attempts++;
      if (typeof BareMux !== 'undefined' && BareMux.BareMuxConnection) {
        clearInterval(check);
        console.log('BareMux became available after', attempts * 50, 'ms');
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(check);
        reject(new Error('BareMux did not load within 5 seconds'));
      }
    }, 50);
  });
};

const swRoutes = {
  // The actual SW entrypoints are sw.js / sw-blacklist.js (networking.sw.js is imported by them).
  uv: ['{{route}}{{/uv/sw.js}}', '{{route}}{{/uv/sw-blacklist.js}}'],
  sj: ['{{route}}{{/scram/working.sw.js}}', '{{route}}{{/scram/working.sw-blacklist.js}}'],
};
const swAllowedHostnames = ['localhost', '127.0.0.1'];
// Use /cron/ which is the aliased wisp endpoint
const wispUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/cron/';
// Public fallback Wisp server in case local one has network restrictions
const publicWispUrl = 'wss://wisp.mercurywork.shop/';

// Transport keys are historically inconsistent across UIs:
// - Some pages store 'unix'/'epoch' (SEO/aliased prefixes)
// - Some store 'libcurl'/'epoxy' (canonical names)
// Support both so the user's selection actually applies.
const transports = {
  epoxy: '{{route}}{{/epoxy/index.mjs}}',
  libcurl: '{{route}}{{/libcurl/index.mjs}}',
  epoch: '{{route}}{{/epoxy/index.mjs}}',
  unix: '{{route}}{{/libcurl/index.mjs}}',
};

// Share the same settings storage bucket as the settings UI (csel.js) and the dist build.
const storageId = 'net-time-storage';
const getStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(storageId)) || {};
  } catch {
    return {};
  }
};
const readStorage = (name) => getStorage()[name];

// Default to Epoxy for Chromium/WebKit (faster), and libcurl for Firefox (compat).
const defaultTransport = /firefox/i.test(navigator.userAgent) ? 'unix' : 'epoch';

let bareMuxConnection = null;

async function ensureScramjetDbSchema() {
  // Scramjet sometimes changes its IDB schema; stale DBs can throw:
  // "Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found."
  // If schema looks wrong, delete it so Scramjet can recreate it cleanly.
  try {
    if (!('indexedDB' in self)) return;

    const expectedStores = ['cookies', 'config'];
    const dbName = '$scramjet';

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const hasAll =
      expectedStores.every((s) => db.objectStoreNames && db.objectStoreNames.contains(s));
    db.close();

    if (hasAll) return;

    console.warn('Scramjet IDB schema mismatch; resetting', { dbName });
    await new Promise((resolve) => {
      const del = indexedDB.deleteDatabase(dbName);
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
    });
  } catch (e) {
    console.warn('ensureScramjetDbSchema failed (ignored):', e);
  }
}

async function initializeBareMux() {
  console.log('Initializing BareMux connection...');

  // Determine which Wisp server to use. Prefer local for speed, fall back to public for reliability.
  let usedWispUrl = wispUrl;

  // If user explicitly chose one, use it. Otherwise, use local.
  const storedPublic = readStorage('PublicWisp');
  if (storedPublic === true) {
    usedWispUrl = publicWispUrl;
  } else if (storedPublic === false) {
    usedWispUrl = wispUrl;
  } else {
    // Default to public Wisp on hosted/cloud deployments, since some hosts restrict egress.
    usedWispUrl = swAllowedHostnames.includes(location.hostname) ? wispUrl : publicWispUrl;
  }

  const transportMode =
    transports[readStorage('Transport')] ||
    transports[defaultTransport] ||
    transports['unix'];
  const transportOptions = { wisp: usedWispUrl };

  console.log('Transport mode:', transportMode);
  console.log('Wisp URL:', usedWispUrl);

  try {
    // Create the connection - this sets up the SharedWorker and message listeners
    // Use /gmt/ which is the aliased path for baremux
    // Store in localStorage for BareMux fallback mechanism
    const workerPath = '{{route}}{{/baremux/worker.js}}';
    localStorage.setItem('bare-mux-path', workerPath);
    console.log('Set bare-mux-path in localStorage:', workerPath);

    bareMuxConnection = new BareMux.BareMuxConnection(workerPath);
    console.log('BareMux connection object created');

    // Set the transport - this stores the transport in the SharedWorker
    console.log('Setting transport...');

    // If using libcurl, we must ensure it's loaded first
    if (transportMode.includes('libcurl')) {
      console.log('Ensuring libcurl is loaded...');
      if (typeof libcurl !== 'undefined' && libcurl.load_wasm) {
        await libcurl.load_wasm();
      }
    }

    await bareMuxConnection.setTransport(transportMode, [transportOptions]);
    console.log('Transport set successfully!');

    return true;
  } catch (err) {
    console.error('BareMux initialization failed:', err);
    return false;
  }
}

async function registerServiceWorker() {
  if (!navigator.serviceWorker) {
    if (location.protocol !== 'https:' && !swAllowedHostnames.includes(location.hostname)) {
      throw new Error('Service workers require HTTPS (except on localhost)');
    }
    throw new Error("Your browser doesn't support service workers");
  }

  // Determine which SW to use (blacklist version hides ads)
  const hideAds = readStorage('HideAds') !== false;
  const usedSW = swRoutes.uv[hideAds ? 1 : 0];

  console.log('Registering service worker:', usedSW);

  // Unregister any old service workers with different paths
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    if (registration.active) {
      const currentPath = new URL(registration.active.scriptURL).pathname;
      const targetPath = new URL(usedSW, location.origin).pathname;
      if (currentPath !== targetPath) {
        console.log('Unregistering old SW:', currentPath);
        await registration.unregister();
      }
    }
  }

  // Register Ultraviolet
  console.log('Registering UV service worker:', usedSW);
  const uvReg = await navigator.serviceWorker.register(usedSW, { scope: '/network/' });
  console.log('UV service worker registered:', uvReg.scope);

  // Wait for the SW to activate so the first iframe navigation doesn't race and land on about:blank.
  await new Promise((resolve) => {
    const reg = uvReg;
    const sw = reg.active || reg.installing || reg.waiting;
    if (!sw) return resolve();
    if (sw.state === 'activated') return resolve();
    const onChange = () => {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', onChange);
        resolve();
      }
    };
    sw.addEventListener('statechange', onChange);
    setTimeout(() => {
      try { sw.removeEventListener('statechange', onChange); } catch { }
      resolve();
    }, 4000);
  });

  // Scramjet is disabled by default because its IndexedDB schema breaks frequently and slows the app.
  const enableScramjet = readStorage('EnableScramjet') === true;
  if (enableScramjet) {
    const sjSW = swRoutes.sj[hideAds ? 1 : 0];
    console.log('Registering Scramjet service worker:', sjSW);
    const sjReg = await navigator.serviceWorker.register(sjSW, { scope: '/worker/' });
    console.log('Scramjet service worker registered:', sjReg.scope);
  } else {
    // Clean up any previously-registered Scramjet worker so it can't keep breaking pages.
    const registrations2 = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations2) {
      try {
        if (registration.scope && new URL(registration.scope).pathname.startsWith('/worker/')) {
          console.log('Unregistering Scramjet SW (disabled):', registration.scope);
          await registration.unregister();
        }
      } catch { }
    }
  }

  // Small delay to allow SWs to start activating
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('Service workers registration call complete');
}

async function initialize() {
  console.log('=== Proxy Initialization Starting ===');

  try {
    // Only touch Scramjet IDB if the user explicitly enabled Scramjet.
    if (readStorage('EnableScramjet') === true) {
      await ensureScramjetDbSchema();
    }

    // Step 1: Wait for BareMux library to load
    await waitForBareMux();

    // Step 2: Initialize BareMux (sets up SharedWorker and transport)
    console.log('Step 2: Initializing BareMux...');
    let bareMuxReady = await initializeBareMux();

    if (!bareMuxReady) {
      console.warn('Local BareMux failed, trying Public Wisp fallback for reliability...');
      // Set PublicWisp to true in memory for this session and try again
      const storage = getStorage();
      storage['PublicWisp'] = true;
      localStorage.setItem(storageId, JSON.stringify(storage));
      bareMuxReady = await initializeBareMux();
    }

    if (!bareMuxReady) {
      console.error('CRITICAL: All proxy transport initialization attempts failed.');
    }

    // Step 3: Small delay to ensure SharedWorker is fully operational
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Register the service worker
    await registerServiceWorker();

    console.log('=== Proxy Initialization Complete ===');
  } catch (err) {
    console.error('=== Proxy Initialization Failed ===', err);
  }
}

// Start initialization and expose a global promise for other scripts to wait on
window.proxyReady = initialize();
