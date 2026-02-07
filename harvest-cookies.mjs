/**
 * Blooket Cookie Harvester
 * 
 * This script connects to a Chrome browser running with remote debugging,
 * guides you through logging into Blooket, and harvests fresh cookies.
 * 
 * Usage:
 * 1. Run harvest-cookies.bat (which starts Chrome with debugging)
 * 2. This script will automatically connect and guide you
 * 3. Log into Blooket when prompted
 * 4. The script will save fresh cookies to blooket-cookies.json
 */

import http from 'node:http';
import https from 'node:https';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = join(__dirname, 'blooket-data', 'blooket-cookies.json');
const CDP_PORT = 9222;

// Helper to make HTTP requests
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Invalid JSON from ${url}: ${data.slice(0, 100)}`));
                }
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

// Simple WebSocket implementation for CDP
class CDPWebSocket {
    constructor(url) {
        this.url = url;
        this.messageId = 1;
        this.pending = new Map();
        this.ws = null;
    }

    async connect() {
        const WebSocket = (await import('ws')).default;
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);
            this.ws.on('open', () => resolve());
            this.ws.on('error', reject);
            this.ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id && this.pending.has(msg.id)) {
                    const { resolve, reject } = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    if (msg.error) reject(new Error(msg.error.message));
                    else resolve(msg.result);
                }
            });
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

// Wait for user input
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Wait for Chrome to be ready
async function waitForChrome(maxAttempts = 30) {
    console.log('⏳ Waiting for Chrome to start...');
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
            console.log('✅ Chrome is ready!');
            return true;
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('Chrome did not start in time');
}

// Launch Chrome with debugging
function launchChrome() {
    console.log('🚀 Launching Chrome with remote debugging...');

    // Common Chrome paths on Windows
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];

    let chromePath = null;
    for (const p of chromePaths) {
        if (existsSync(p)) {
            chromePath = p;
            break;
        }
    }

    if (!chromePath) {
        console.error('❌ Chrome not found. Please install Chrome or specify the path.');
        process.exit(1);
    }

    const userDataDir = join(__dirname, 'blooket-data', 'chrome-profile');

    const args = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'https://play.blooket.com/play'
    ];

    const chrome = spawn(chromePath, args, {
        detached: true,
        stdio: 'ignore'
    });
    chrome.unref();

    return chrome;
}

// Get all cookies from Chrome
async function getCookies(cdp) {
    console.log('🍪 Harvesting cookies...');

    // Get all cookies (not just for current domain)
    const { cookies } = await cdp.send('Network.getAllCookies');

    // Filter for Blooket-related domains
    const blooketDomains = [
        'blooket.com',
        '.blooket.com',
        'play.blooket.com',
        'firebaseio.com',
        '.firebaseio.com',
        'firebaseapp.com',
        '.firebaseapp.com',
        'googleapis.com',
        '.googleapis.com'
    ];

    const blooketCookies = cookies.filter(cookie => {
        const domain = cookie.domain.toLowerCase();
        return blooketDomains.some(d => domain.includes(d.replace(/^\./, '')));
    });

    console.log(`📦 Found ${blooketCookies.length} Blooket-related cookies`);
    return blooketCookies;
}

// Get localStorage and sessionStorage
async function getStorage(cdp) {
    console.log('📁 Harvesting localStorage...');

    try {
        // Execute script to get localStorage
        const { result } = await cdp.send('Runtime.evaluate', {
            expression: `JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`,
            returnByValue: true
        });

        const localStorage = JSON.parse(result.value || '{}');

        // Get sessionStorage too
        const { result: sessionResult } = await cdp.send('Runtime.evaluate', {
            expression: `JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))`,
            returnByValue: true
        });

        const sessionStorage = JSON.parse(sessionResult.value || '{}');

        console.log(`📦 Found ${Object.keys(localStorage).length} localStorage items`);
        return { localStorage, sessionStorage };
    } catch (e) {
        console.warn('⚠️ Could not get storage:', e.message);
        return { localStorage: {}, sessionStorage: {} };
    }
}

// Main function
async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║         🎮 Blooket Cookie Harvester for Holy Unblocker    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Launch Chrome
    launchChrome();

    // Wait for Chrome to be ready
    await waitForChrome();

    // Get the list of open pages
    const pages = await httpGet(`http://127.0.0.1:${CDP_PORT}/json`);

    // Find the Blooket page
    let blooketPage = pages.find(p => p.url.includes('blooket.com'));

    if (!blooketPage) {
        console.log('📄 Opening Blooket...');
        // Create a new page
        blooketPage = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/new?https://play.blooket.com/play`);
        await new Promise(r => setTimeout(r, 3000));

        // Refresh page list
        const newPages = await httpGet(`http://127.0.0.1:${CDP_PORT}/json`);
        blooketPage = newPages.find(p => p.url.includes('blooket.com')) || blooketPage;
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📋 INSTRUCTIONS:');
    console.log('');
    console.log('   1. A Chrome window should have opened with Blooket');
    console.log('   2. If you need to LOG IN, do so now');
    console.log('   3. Navigate to a game or join a game session');
    console.log('   4. Make sure you can see the "Enter Game ID" or "Enter Nickname" page');
    console.log('   5. Once ready, come back here and press ENTER');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    await prompt('Press ENTER when you are ready to harvest cookies... ');

    // Refresh page list to get the current state
    const currentPages = await httpGet(`http://127.0.0.1:${CDP_PORT}/json`);
    blooketPage = currentPages.find(p => p.url.includes('blooket.com'));

    if (!blooketPage) {
        console.error('❌ No Blooket page found. Please make sure Blooket is open in Chrome.');
        process.exit(1);
    }

    console.log(`🔗 Connected to: ${blooketPage.url}`);

    // Connect via WebSocket
    const cdp = new CDPWebSocket(blooketPage.webSocketDebuggerUrl);
    await cdp.connect();

    // Enable Network domain for cookies
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');

    // Get cookies
    const cookies = await getCookies(cdp);

    // Get storage
    const storage = await getStorage(cdp);

    // Close CDP connection
    cdp.close();

    // Check if we got the critical cookies
    const hasCfBm = cookies.some(c => c.name === '__cf_bm');
    const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');
    const hasBsid = cookies.some(c => c.name === 'bsid');

    console.log('');
    console.log('🔍 Cookie Analysis:');
    console.log(`   __cf_bm (Cloudflare Bot): ${hasCfBm ? '✅ Found' : '⚠️ Missing'}`);
    console.log(`   cf_clearance (Cloudflare): ${hasCfClearance ? '✅ Found' : '⚠️ Missing'}`);
    console.log(`   bsid (Blooket Session): ${hasBsid ? '✅ Found' : '⚠️ Missing'}`);

    // Prepare the data to save
    const harvestData = {
        cookies: cookies,
        localStorage: storage.localStorage,
        sessionStorage: storage.sessionStorage,
        harvestedAt: new Date().toISOString(),
        harvestedFrom: blooketPage.url
    };

    // Save to file
    writeFileSync(COOKIES_PATH, JSON.stringify(harvestData, null, 2));

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`✅ SUCCESS! Cookies saved to:`);
    console.log(`   ${COOKIES_PATH}`);
    console.log('');
    console.log('📝 Next Steps:');
    console.log('   1. You can close the Chrome window');
    console.log('   2. Restart the Holy Unblocker server: npm run dev');
    console.log('   3. Try accessing Blooket through the proxy');
    console.log('');
    console.log('💡 Note: The __cf_bm cookie expires in ~30 minutes.');
    console.log('   Run this script again if you encounter issues after that time.');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

    // Check for ws module
    try {
        await import('ws');
    } catch (e) {
        console.log('');
        console.log('⚠️ The "ws" module was not found. Installing it now...');
    }
}

// Run
main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
