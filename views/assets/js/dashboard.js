
document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('searchInput');
    const goBtn = document.getElementById('searchBtn');
    const abToggle = document.getElementById('abToggle');

    // Load AB Setting
    let useAb = localStorage.getItem('ab_enabled') === 'true';
    if (useAb && abToggle) abToggle.classList.add('active');

    if (abToggle) {
        abToggle.addEventListener('click', () => {
            useAb = !useAb;
            abToggle.classList.toggle('active', useAb);
            localStorage.setItem('ab_enabled', useAb);
        });
    }

    // Search
    const trigger = () => {
        if (input && input.value.trim()) goProx(input.value.trim(), useAb);
    };
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') trigger(); });
    if (goBtn) goBtn.addEventListener('click', trigger);

    // Shortcuts
    window.quickLink = (url) => goProx(url, useAb);

    // Panic
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') {
            window.location.replace('https://google.com');
        }
    });

    // Wait for Service Workers (similar to common.js logic)
    waitForWorkers();
});

async function waitForWorkers() {
    if (!navigator.serviceWorker) return;
    if (navigator.serviceWorker.controller) return; // Already controlled

    // Register-sw.js handles registration. We just wait.
    await navigator.serviceWorker.ready;
    console.log("SW Ready");
}

/* --- LOGIC FROM COMMON.JS --- */

// Search/URL Parser
function search(input) {
    try {
        return new URL(input) + '';
    } catch (e) { }
    try {
        const url = new URL(`http://${input}`);
        if (url.hostname.indexOf('.') != -1) return url + '';
    } catch (e) { }
    return `https://google.com/search?q=${encodeURIComponent(input)}`;
}

const SCRAM_PREFIX = '{{route}}{{/scram/network/}}';
const SCRAM_FILES = {
    wasm: '{{route}}{{/scram/working.wasm.wasm}}',
    all: '{{route}}{{/scram/working.all.js}}',
    sync: '{{route}}{{/scram/working.sync.js}}',
};
let scramControllerPromise = null;

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout")), ms);
        Promise.resolve(promise).then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); }
        );
    });
}

async function getScramjetController() {
    if (scramControllerPromise) return scramControllerPromise;

    scramControllerPromise = (async () => {
        if (window.proxyReady) {
            try {
                await withTimeout(window.proxyReady, 7000);
            } catch { }
        }
        if (!self['$scramjetLoadController']) return null;
        const { ScramjetController } = await self['$scramjetLoadController']();
        const controller = new ScramjetController({ prefix: SCRAM_PREFIX, files: SCRAM_FILES });
        if (typeof controller.init === 'function') {
            try { await controller.init(); } catch { }
        }
        return controller;
    })().catch((e) => {
        scramControllerPromise = null;
        throw e;
    });

    return scramControllerPromise;
}

async function goProx(url, useAb) {
    // Determine UV Config using the placeholder common.js used
    // standard build often replaces {{__uv$config}} with the obfuscated name
    const uvConfig = self['__uv$config'] || self['{{__uv$config}}'];
    let dest = "";

    // Try Scramjet first for normal proxying.
    try {
        const controller = await getScramjetController();
        if (controller) {
            console.log("Using Scramjet");
            const encoded = String(controller.encodeUrl(search(url)) || "");
            const proxyPath = encoded.startsWith('/') ? encoded : (SCRAM_PREFIX + encoded);
            dest = window.location.origin + proxyPath;
        }
    } catch (e) {
        console.error("Scramjet Error", e);
    }
    // Compatibility fallback to __uv$config if Scramjet loader isn't available yet.
    if (!dest && uvConfig) {
        try {
            console.log("Using UV compatibility config", uvConfig);
            dest = window.location.origin + uvConfig.prefix + uvConfig.encodeUrl(search(url));
        } catch (e) {
            console.error("UV Encode Error", e);
        }
    }

    if (!dest) {
        alert("Proxies loading... Try again in 2s.");
        return;
    }

    if (useAb) {
        const win = window.open();
        if (!win) return alert("Popups blocked.");
        const iframe = win.document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100vh';
        iframe.style.border = 'none';
        iframe.style.background = '#fff';
        iframe.src = dest;
        win.document.body.style.margin = '0';
        win.document.body.appendChild(iframe);
    } else {
        window.location.href = dest;
    }
}
