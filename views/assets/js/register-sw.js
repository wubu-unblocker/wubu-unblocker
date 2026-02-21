// Scramjet-first proxy bootstrap for Wubu UI.
// Keeps existing UI flows intact while replacing UV bootstrap logic.

const swAllowedHostnames = ["localhost", "127.0.0.1"];
const storageId = "{{hu-lts}}-storage";

const getStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(storageId)) || {};
  } catch {
    return {};
  }
};

const readStorage = (name) => getStorage()[name];

const transports = {
  epoxy: "{{route}}{{/epoxy/index.mjs}}",
  libcurl: "{{route}}{{/libcurl/index.mjs}}",
  epoch: "{{route}}{{/epoxy/index.mjs}}",
  unix: "{{route}}{{/libcurl/index.mjs}}",
};

const defaultTransport = "epoch";
const hostedOnHf = /\.hf\.space$/i.test(location.hostname);
const defaultWisp = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "{{route}}{{/wisp/}}";
const fallbackWisp = "wss://wisp.mercurywork.shop/";
const scramPrefix = "{{route}}{{/scram/network/}}";
const scramFiles = {
  wasm: "{{route}}{{/scram/working.wasm.wasm}}",
  all: "{{route}}{{/scram/working.all.js}}",
  sync: "{{route}}{{/scram/working.sync.js}}",
};
let lastTransportSelection = null;
let recoveringTransport = false;

function makeWispCandidates() {
  const localCron = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "{{route}}{{/cron/}}";
  const localWisp = defaultWisp;
  const storedPublic = readStorage("PublicWisp");

  // Respect explicit user choice if present.
  if (storedPublic === true) return [fallbackWisp, localWisp, localCron];
  if (storedPublic === false) return [localWisp, localCron, fallbackWisp];

  // HF Spaces often have unreliable local websocket proxying under load.
  // Prefer public Wisp there; elsewhere keep local-first for latency.
  if (hostedOnHf) return [fallbackWisp, localWisp, localCron];
  return [localWisp, localCron, fallbackWisp];
}

function makeTransportCandidates() {
  const configured = readStorage("Transport");
  const list = [];
  const pushMode = (mode) => {
    const transportPath = transports[mode];
    if (!transportPath) return;
    if (!list.find((entry) => entry.mode === mode)) list.push({ mode, transportPath });
  };

  // On HF, libcurl frequently fails TLS handshakes. Bias toward epoxy.
  if (hostedOnHf) {
    pushMode("epoch");
    // Only use libcurl as a final fallback when explicitly selected.
    if (configured === "unix" || configured === "libcurl") pushMode("unix");
  } else {
    pushMode(configured);
    pushMode(defaultTransport);
    pushMode("epoch");
    pushMode("unix");
  }

  return list;
}

async function verifyTransport(connection) {
  // BareMux performs a ping on getTransport(); this catches dead SharedWorker ports
  // before users hit a site and get random 500s.
  const transportPath = await connection.getTransport();
  if (!transportPath) throw new Error("Transport verification failed.");
  return transportPath;
}

async function setBestTransport() {
  if (typeof BareMux === "undefined" || !BareMux.BareMuxConnection) {
    throw new Error("BareMux is not loaded.");
  }

  const workerPath = "{{route}}{{/baremux/worker.js}}";
  localStorage.setItem("bare-mux-path", workerPath);

  let connection = new BareMux.BareMuxConnection(workerPath);
  const wispCandidates = makeWispCandidates();
  const transportCandidates = makeTransportCandidates();

  let lastErr = null;
  for (const { mode, transportPath } of transportCandidates) {
    for (const wsUrl of wispCandidates) {
      try {
        // Support both option names used across bare transports.
        await connection.setTransport(transportPath, [{ websocket: wsUrl, wisp: wsUrl }]);
        await verifyTransport(connection);
        return { mode, transportPath, wsUrl, workerPath };
      } catch (e) {
        lastErr = e;
        // Recreate connection in case port died between attempts.
        connection = new BareMux.BareMuxConnection(workerPath);
      }
    }
  }

  throw lastErr || new Error("Failed to initialize transport.");
}

async function recoverTransport(reason = "unknown") {
  if (recoveringTransport) return false;
  recoveringTransport = true;
  try {
    console.warn("Attempting transport recovery. Reason:", reason);
    const selected = await setBestTransport();
    lastTransportSelection = selected;
    console.log("Transport recovered:", selected.transportPath, selected.wsUrl);
    return true;
  } catch (e) {
    console.error("Transport recovery failed:", e);
    return false;
  } finally {
    recoveringTransport = false;
  }
}

function deleteIndexedDb(name) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function initScramjetController(controller) {
  if (!controller || typeof controller.init !== "function") return;
  try {
    await controller.init();
  } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    const isSchemaError =
      msg.includes("object stores") ||
      msg.includes("notfounderror") ||
      msg.includes("idbdatabase");
    if (!isSchemaError) throw e;

    // Heal corrupted/outdated Scramjet schema automatically.
    await Promise.all([deleteIndexedDb("$scramjet"), deleteIndexedDb("scramjet")]);
    await controller.init();
  }
}

async function installUvCompatShim() {
  // A lot of existing Wubu UI code expects __uv$config. Map it to Scramjet.
  if (!self.$scramjetLoadController) return false;

  try {
    const { ScramjetController } = self.$scramjetLoadController();
    const prefix = scramPrefix;
    const controller = new ScramjetController({ prefix, files: scramFiles });
    await initScramjetController(controller);
    if (typeof controller.modifyConfig === "function") {
      await controller.modifyConfig({ prefix, files: scramFiles });
    }

    const stripPrefix = (value) => {
      const text = String(value || "");
      if (text.startsWith(prefix)) return text.slice(prefix.length);
      if (text.startsWith(location.origin + prefix)) return text.slice((location.origin + prefix).length);
      return text;
    };

    self.__uv$config = {
      prefix,
      // UV callers append prefix themselves. Scramjet encodeUrl already includes it.
      encodeUrl: (url) => stripPrefix(controller.encodeUrl(url)),
      decodeUrl: (url) => {
        const text = String(url || "");
        const withPrefix = text.startsWith(prefix) ? text : prefix + text;
        return controller.decodeUrl(withPrefix);
      },
      // Keep fields for compatibility with older callers.
      bundle: "{{route}}{{/scram/scramjet.bundle.js}}",
      config: "{{route}}{{/scram/working.sync.js}}",
      sw: "{{route}}{{/scram/working.sw.js}}",
    };
    return true;
  } catch (e) {
    console.warn("Failed to initialize Scramjet compatibility shim:", e);
    return false;
  }
}

async function registerScramjetSw() {
  if (!navigator.serviceWorker) {
    if (location.protocol !== "https:" && !swAllowedHostnames.includes(location.hostname)) {
      throw new Error("Service workers require HTTPS (except localhost).");
    }
    throw new Error("This browser does not support service workers.");
  }

  const targetSw = "{{route}}{{/scram/working.sw.js}}";
  const targetScope = "{{route}}{{/scram/}}";
  const uvScope = "{{route}}{{/uv/}}";
  const registrations = await navigator.serviceWorker.getRegistrations();

  // Remove conflicting UV registrations to avoid mixed routing behavior.
  for (const reg of registrations) {
    try {
      const scopePath = new URL(reg.scope).pathname;
      if (scopePath.startsWith(uvScope)) await reg.unregister();
    } catch {
      // ignore
    }
  }

  await navigator.serviceWorker.register(targetSw, { scope: targetScope });
}

async function initialize() {
  console.log("=== Proxy Initialization Starting ===");

  try {
    await installUvCompatShim();
    const selected = await setBestTransport();
    lastTransportSelection = selected;
    console.log("Transport mode:", selected.mode);
    console.log("Transport path:", selected.transportPath);
    console.log("Wisp URL:", selected.wsUrl);

    await registerScramjetSw();
    console.log("=== Proxy Initialization Complete ===");
  } catch (e) {
    console.error("Proxy initialization failed:", e);
  }
}

function installAutoRecoveryHooks() {
  const shouldRecover = (message) =>
    /bare-mux/i.test(message) ||
    /ping response/i.test(message) ||
    /port is dead/i.test(message) ||
    /transport verification failed/i.test(message);

  window.addEventListener("error", (event) => {
    const message = `${event?.message || ""} ${event?.error?.message || ""}`.toLowerCase();
    if (shouldRecover(message)) recoverTransport(message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = `${event?.reason?.message || event?.reason || ""}`.toLowerCase();
    if (shouldRecover(message)) recoverTransport(message);
  });

  // Lightweight periodic health check to heal stale/dead worker ports automatically.
  setInterval(async () => {
    if (!lastTransportSelection || recoveringTransport) return;
    try {
      const connection = new BareMux.BareMuxConnection(lastTransportSelection.workerPath);
      await verifyTransport(connection);
    } catch (e) {
      recoverTransport(`periodic-check: ${e?.message || e}`);
    }
  }, hostedOnHf ? 10000 : 15000);
}

installAutoRecoveryHooks();
window.proxyReady = initialize();
