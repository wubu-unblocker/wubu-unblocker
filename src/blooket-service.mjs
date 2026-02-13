import { WebSocketServer, WebSocket } from 'ws';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'blooket-data');
let dataDirOk = true;

// Ensure data directories exist
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
    // Some hosts mount the repo read-only; fall back to a temp dir.
    // Puppeteer profile data is optional for basic operation.
    console.warn('[Blooket] Failed to create data dir, falling back to OS temp:', e?.message || e);
    dataDirOk = false;
}

puppeteer.use(StealthPlugin());

// --- CONSTANTS ---
// Defaults are intentionally conservative for hosted environments.
// Override via env if you have the CPU/RAM locally.
const VIEWPORT_WIDTH = Math.max(320, Number(process.env.BLOOKET_VIEWPORT_WIDTH || 1280) || 1280);
const VIEWPORT_HEIGHT = Math.max(240, Number(process.env.BLOOKET_VIEWPORT_HEIGHT || 720) || 720);
const FRAME_THROTTLE_MS = Math.max(0, Number(process.env.BLOOKET_FRAME_THROTTLE_MS || 33) || 33); // ~30 FPS
const MAX_SESSIONS = Math.max(1, Number(process.env.BLOOKET_MAX_SESSIONS || 4) || 4);
const JPEG_QUALITY = Math.min(100, Math.max(1, Number(process.env.BLOOKET_JPEG_QUALITY || 40) || 40));

let browser = null;
let browserStartingPromise = null;
const sessions = new Map();

// Chrome Path Logic
function getChromeExecutablePath() {
    const platform = os.platform();
    if (platform === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];
        for (const p of paths) if (fs.existsSync(p)) return p;
        return paths[0];
    } else if (platform === 'darwin') {
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
        const paths = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser'];
        for (const p of paths) if (fs.existsSync(p)) return p;
        return 'google-chrome';
    }
}
const CHROME_EXECUTABLE_PATH = getChromeExecutablePath();
const USER_DATA_DIR = dataDirOk
    ? path.join(DATA_DIR, 'chrome-profile')
    : path.join(os.tmpdir(), 'wubu-blooket-profile');

class ClientSession {
    constructor(ws) {
        this.ws = ws;
        this.context = null;
        this.page = null;
        this.cdp = null;
        this.quality = JPEG_QUALITY;
        this.lastFrameTime = 0;
        this.isReady = false;

        this.cleanup = this.cleanup.bind(this);
    }
    // ... (skipping context/page creation to focus on viewport update in init)
    // ...

    async init() {
        console.log('[Session] Initializing...');
        if (!browser) await startBrowser();
        if (!browser) {
            console.error('[Session] Browser failed to start!');
            this.ws.close(1011, 'Browser failed');
            return;
        }

        try {
            console.log('[Session] Creating New Page (Global Context)...');
            this.page = await browser.newPage();

            await this.page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

            // Setup Page
            await this.page.evaluateOnNewDocument(() => {
                window.showOpenFilePicker = () => { throw new Error('Blocked'); };
                window.addEventListener('contextmenu', e => e.preventDefault());
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });
            this.page.on('dialog', async d => { await d.dismiss(); });

            // CDP
            console.log('[Session] Starting Screencast...');
            this.cdp = await this.page.createCDPSession();
            await this.cdp.send('Page.enable');

            this.cdp.on('Page.screencastFrame', async (frame) => {
                const { data, sessionId } = frame;
                const now = Date.now();

                // Ack immediately to keep stream flowing
                try { await this.cdp.send('Page.screencastFrameAck', { sessionId }); } catch (e) { }

                if (this.ws.readyState === WebSocket.OPEN) {
                    if (now - this.lastFrameTime >= FRAME_THROTTLE_MS) {
                        this.lastFrameTime = now;
                        this.ws.send(JSON.stringify({ type: 'frame', data }));
                    }
                }
            });

            await this.cdp.send('Page.startScreencast', {
                format: 'jpeg',
                quality: this.quality,
                maxWidth: VIEWPORT_WIDTH,
                maxHeight: VIEWPORT_HEIGHT
            });

            console.log('[Session] Navigating...');
            await this.page.goto('https://play.blooket.com/play', { waitUntil: 'domcontentloaded' }).catch(e => console.error('Nav error:', e.message));

            this.isReady = true;
            this.send({ type: 'ready', url: this.page.url() });
            console.log('[Session] Ready!');

        } catch (e) {
            console.error('[Session] Init Error:', e);
            this.cleanup();
        }
    }

    send(msg) {
        if (this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(msg)); } catch (e) { }
        }
    }

    async handleMessage(msg) {
        if (!this.isReady || !this.cdp) return;
        try {
            switch (msg.type) {
                case 'mousedown':
                    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: msg.x, y: msg.y, button: msg.button, clickCount: 1 });
                    break;
                case 'mouseup':
                    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: msg.x, y: msg.y, button: msg.button, clickCount: 1 });
                    break;
                case 'mousemove':
                    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: msg.x, y: msg.y });
                    break;
                case 'keydown':
                    const keyParams = {
                        type: 'keyDown',
                        key: msg.key,
                        code: msg.code,
                        nativeVirtualKeyCode: msg.keyCode,
                        windowsVirtualKeyCode: msg.keyCode,
                        modifiers: msg.modifiers
                    };
                    if (msg.key.length === 1) {
                        keyParams.text = msg.key;
                        keyParams.unmodifiedText = msg.key;
                    }
                    await this.cdp.send('Input.dispatchKeyEvent', keyParams);
                    break;
                case 'keyup':
                    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: msg.key, code: msg.code, nativeVirtualKeyCode: msg.keyCode, windowsVirtualKeyCode: msg.keyCode });
                    break;
                case 'navigate':
                    if (msg.url) await this.page.goto(msg.url).catch(() => { });
                    break;
                case 'refresh': await this.page.reload().catch(() => { }); break;
                case 'goBack': await this.page.goBack().catch(() => { }); break;
                case 'goForward': await this.page.goForward().catch(() => { }); break;
                case 'injectCheats':
                    const script = loadFullCheatScript();
                    await this.page.evaluate(script).catch(() => { });
                    this.send({ type: 'cheatsInjected' });
                    break;
                case 'toggleCheats':
                    await this.page.evaluate(() => {
                        const el = document.querySelector('#blooket-cheat-gui') || document.querySelector('[style*="z-index: 99999"]');
                        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                    }).catch(() => { });
                    break;
            }
        } catch (e) { }
    }

    async cleanup() {
        console.log('[Session] Cleaning up...');
        try { if (this.cdp) await this.cdp.detach(); } catch (e) { }
        try { if (this.page) await this.page.close(); } catch (e) { }
        try { if (this.context) await this.context.close(); } catch (e) { }
        sessions.delete(this.ws);
    }
}

// --- CHEAT SCRIPT ---
function loadFullCheatScript() {
    // Priority: gui.js in root or blooket-cheats
    const potentialPaths = [
        path.join(ROOT_DIR, 'gui.js'),
        path.join(ROOT_DIR, 'blooket-cheats', 'gui.js'),
        path.join(ROOT_DIR, 'scripts', 'master.js'),
        path.join(ROOT_DIR, 'blooket-cheats', 'master.js')
    ];

    let combined = '';

    for (const p of potentialPaths) {
        try {
            if (fs.existsSync(p)) {
                console.log(`[Blooket] Loading cheats from ${p}`);
                combined = fs.readFileSync(p, 'utf-8');
                break; // Found one, use it
            }
        } catch (e) {
            console.error(`Failed to load cheat ${p}:`, e);
        }
    }

    if (!combined) {
        return `
            const el = document.createElement('div');
            el.style.cssText = "position:fixed;top:10px;left:10px;z-index:999999;background:red;color:white;padding:10px;";
            el.innerText = "Cheats not found on server (checked gui.js, master.js).";
            document.body.appendChild(el);
        `;
    }
    return combined;
}

// --- MAIN FUNCTIONS ---
export async function startBrowser() {
    if (browser) return browser;
    if (browserStartingPromise) return browserStartingPromise;

    browserStartingPromise = (async () => {
        console.log('Starting Blooket Host Browser (Headless New)...');
        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            `--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
            '--disable-blink-features=AutomationControlled',
            // Performance optimizations
            '--disable-frame-rate-limit',
            '--disable-gpu-vsync',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ];

        try {
            const b = await puppeteer.launch({
                executablePath: CHROME_EXECUTABLE_PATH,
                userDataDir: USER_DATA_DIR,
                headless: 'new',
                defaultViewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
                args: [
                    ...launchArgs,
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                ignoreDefaultArgs: ["--enable-automation"],
                ignoreHTTPSErrors: true
            });

            b.on('disconnected', () => {
                console.log('Host browser disconnected!');
                browser = null;
                browserStartingPromise = null;
                sessions.forEach(s => s.cleanup());
                sessions.clear();
            });

            browser = b;
            return b;
        } catch (e) {
            console.error('Failed to start host browser:', e);

            if (e.message.includes('browser is already running')) {
                console.log('Detected stale browser lock. Cleaning up...');
                try {
                    const lockPath = path.join(USER_DATA_DIR, 'SingletonLock');
                    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
                    console.log('Lock file removed. Retrying...');

                    // Retry launch once
                    browser = await puppeteer.launch({
                        executablePath: CHROME_EXECUTABLE_PATH,
                        userDataDir: USER_DATA_DIR,
                        headless: 'new',
                        defaultViewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
                        args: [
                            ...launchArgs,
                            '--disable-features=IsolateOrigins,site-per-process'
                        ],
                        ignoreDefaultArgs: ["--enable-automation"],
                        ignoreHTTPSErrors: true
                    });

                    configureBrowserEvents(browser);
                    return browser;
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }

            browserStartingPromise = null;
            return null;
        }
    })();
    return browserStartingPromise;
}

function configureBrowserEvents(b) {
    b.on('disconnected', () => {
        console.log('Host browser disconnected!');
        browser = null;
        browserStartingPromise = null;
        sessions.forEach(s => s.cleanup());
        sessions.clear();
    });
}

export function setupBlooketService() {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', async (ws) => {
        console.log(`[Blooket] New connection. Current sessions: ${sessions.size}/${MAX_SESSIONS}`);

        if (sessions.size >= MAX_SESSIONS) {
            console.log('[Blooket] Server full - rejecting connection');
            ws.send(JSON.stringify({ type: 'error', message: 'Server full. Please try again later.' }));
            ws.close();
            return;
        }

        const session = new ClientSession(ws);
        sessions.set(ws, session);
        await session.init();

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                session.handleMessage(msg);
            } catch (e) { }
        });

        ws.on('close', () => {
            console.log(`[Blooket] Connection closed. Sessions before cleanup: ${sessions.size}`);
            session.cleanup();
            console.log(`[Blooket] Sessions after cleanup: ${sessions.size}`);
        });
        ws.on('error', () => session.cleanup());
    });

    // Don't pre-warm browser - let it start on first connection
    // startBrowser();

    return { wss, startBrowser };
}

