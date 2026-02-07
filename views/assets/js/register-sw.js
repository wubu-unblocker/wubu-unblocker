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
  uv: ['{{route}}{{/uv/networking.sw.js}}', '{{route}}{{/uv/sw-blacklist.js}}'],
  sj: ['{{route}}{{/scram/working.sw.js}}', '{{route}}{{/scram/working.sw-blacklist.js}}'],
};
const swAllowedHostnames = ['localhost', '127.0.0.1'];
// Use /cron/ which is the aliased wisp endpoint
const wispUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/cron/';
// Public fallback Wisp server in case local one has network restrictions
const publicWispUrl = 'wss://wisp.mercurywork.shop/';

const transports = {
  'epoxy': '{{route}}{{/epoxy/index.mjs}}',
  'libcurl': '{{route}}{{/libcurl/index.mjs}}',
};

// Share the same settings storage bucket as the settings UI (csel.js),
// otherwise user-selected transports/PublicWisp never apply.
const storageId = '{{hu-lts}}-storage';
const getStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(storageId)) || {};
  } catch {
    return {};
  }
};
const readStorage = (name) => getStorage()[name];

// Default to libcurl (more compatible with strict TLS/CDN targets like YouTube/Discord).
const defaultTransport = 'libcurl';

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

  const transportMode = transports[readStorage('Transport')] || transports[defaultTransport];
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

  // Register Scramjet
  const sjSW = swRoutes.sj[hideAds ? 1 : 0];
  console.log('Registering Scramjet service worker:', sjSW);
  const sjReg = await navigator.serviceWorker.register(sjSW, { scope: '/worker/' });
  console.log('Scramjet service worker registered:', sjReg.scope);

  // Small delay to allow SWs to start activating
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('Service workers registration call complete');
}

async function initialize() {
  console.log('=== Proxy Initialization Starting ===');

  try {
    // Do this early so Scramjet doesn't crash the wrapper UI due to stale IndexedDB schema.
    await ensureScramjetDbSchema();

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
