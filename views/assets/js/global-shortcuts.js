(() => {
  const PANIC_URL_KEY = 'wubu-panic-url';
  const PANIC_KEYBIND_KEY = 'wubu-panic-keybind';
  const LAST_SESSION_URL_KEY = 'wubu-last-session-url';
  const PENDING_GAME_SEARCH_KEY = 'wubu-pending-game-search';
  const DEFAULT_PANIC_URL = 'https://www.clever.com';
  const DEFAULT_PANIC_KEYBIND = 'Ctrl+Shift+X';

  const state = {
    gameIndex: null,
    gameIndexPromise: null,
    open: false,
    selected: 0,
    results: [],
  };

  const normalizeUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_PANIC_URL;
    try {
      return new URL(raw).toString();
    } catch {
      try {
        return new URL(`https://${raw}`).toString();
      } catch {
        return DEFAULT_PANIC_URL;
      }
    }
  };

  const looksLikeUrl = (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/^https?:\/\//i.test(text)) return true;
    if (text.includes(' ') || text.startsWith('/')) return false;
    return text.includes('.');
  };

  const parseKeybind = (value) => {
    const parts = String(value || DEFAULT_PANIC_KEYBIND)
      .split('+')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const key = parts.find((p) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'command'].includes(p)) || 'x';
    return {
      ctrl: parts.includes('ctrl') || parts.includes('control'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
      key: key.length === 1 ? key : key.toLowerCase(),
    };
  };

  const keybindMatches = (event, keybind) => {
    const eventKey = String(event.key || '').toLowerCase();
    return (
      event.ctrlKey === keybind.ctrl &&
      event.shiftKey === keybind.shift &&
      event.altKey === keybind.alt &&
      event.metaKey === keybind.meta &&
      eventKey === keybind.key
    );
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      return true;
    } catch {
      return false;
    }
  };

  const escapeHtml = (value) =>
    String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const faviconForUrl = (url) => {
    try {
      const parsed = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
    } catch {
      return '/assets/ico/favicon-32x32.png';
    }
  };

  const applyProxyQuery = (query) => {
    const value = String(query || '').trim();
    if (!value) return;

    if (typeof window.goProx === 'function') {
      window.goProx(value);
      return;
    }

    const input = document.querySelector('#uv-address, #startInput, #urlInput, .search-box input');
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const button = document.querySelector('#uv-search-btn, .search-btn');
      if (button && typeof button.click === 'function') {
        button.click();
        return;
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return;
    }

    try {
      sessionStorage.setItem('pendingUrl', value);
    } catch {}
    window.location.href = '/browsing';
  };

  const applyGameSearch = (query) => {
    const value = String(query || '').trim();
    if (!value) return;
    const gameInput = document.getElementById('game-search');
    if (gameInput) {
      gameInput.focus();
      gameInput.value = value;
      gameInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    try {
      sessionStorage.setItem(PENDING_GAME_SEARCH_KEY, value);
    } catch {}
    window.location.href = '/games';
  };

  const loadJson = async (path) => {
    const res = await fetch(path, { cache: 'force-cache' });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  };

  const buildGameIndex = (items) => {
    const dedup = new Map();
    items.forEach((item) => {
      const name = String(item?.name || item?.title || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!dedup.has(key)) {
        dedup.set(key, { name, description: String(item?.description || item?.desc || '').trim() });
      }
    });
    return [...dedup.values()];
  };

  const ensureGameIndex = async () => {
    if (state.gameIndex) return state.gameIndex;
    if (state.gameIndexPromise) return state.gameIndexPromise;

    state.gameIndexPromise = (async () => {
      const sources = await Promise.all([
        loadJson('/assets/json/h5-nav.json'),
        loadJson('/assets/json/par-nav.json'),
        loadJson('/assets/json/emu-nav.json'),
      ]);
      const merged = sources.flat();
      state.gameIndex = buildGameIndex(merged);
      return state.gameIndex;
    })().catch(() => {
      state.gameIndex = [];
      return state.gameIndex;
    });

    return state.gameIndexPromise;
  };

  const ensurePalette = () => {
    if (document.getElementById('wubu-command-palette')) return;
    const style = document.createElement('style');
    style.textContent = `
      #wubu-command-palette {
        position: fixed;
        inset: 0;
        z-index: 4000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        background: rgba(9, 10, 14, 0.45);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding-top: 10vh;
      }
      #wubu-command-palette.open { display: flex; }
      .wubu-cmd-modal {
        width: min(780px, calc(100vw - 28px));
        border-radius: 18px;
        border: 1px solid rgba(138, 43, 226, 0.3);
        background: var(--nav-bg, rgba(18, 20, 26, 0.95));
        box-shadow: 0 22px 65px rgba(0, 0, 0, 0.35);
        overflow: hidden;
      }
      .wubu-cmd-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
      }
      .wubu-cmd-head i { color: #c77dff; }
      #wubu-command-input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text-main, #fff);
        font: 500 1.02rem 'Outfit', sans-serif;
      }
      #wubu-command-input::placeholder { color: var(--text-secondary, #9ca3af); }
      .wubu-cmd-hint {
        margin-left: auto;
        color: var(--text-secondary, #9ca3af);
        font-size: 0.78rem;
      }
      #wubu-command-list {
        list-style: none;
        margin: 0;
        padding: 8px;
        max-height: 430px;
        overflow: auto;
      }
      .wubu-cmd-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        color: var(--text-main, #fff);
        cursor: pointer;
        border: 1px solid transparent;
      }
      .wubu-cmd-item .wubu-cmd-icon {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        flex: 0 0 auto;
      }
      .wubu-cmd-item .wubu-cmd-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .wubu-cmd-item .wubu-cmd-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .wubu-cmd-item .wubu-cmd-subtitle {
        color: var(--text-secondary, #9ca3af);
        font-size: 0.76rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .wubu-cmd-item .wubu-cmd-kind {
        margin-left: auto;
        color: var(--text-secondary, #9ca3af);
        font-size: 0.74rem;
        flex: 0 0 auto;
      }
      .wubu-cmd-item.active {
        background: rgba(157, 78, 221, 0.22);
        border-color: rgba(199, 125, 255, 0.35);
      }
      .wubu-cmd-empty {
        padding: 18px 14px;
        color: var(--text-secondary, #9ca3af);
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'wubu-command-palette';
    root.innerHTML = `
      <div class="wubu-cmd-modal">
        <div class="wubu-cmd-head">
          <i class="fas fa-terminal" aria-hidden="true"></i>
          <input id="wubu-command-input" type="text" autocomplete="off" placeholder="Search everything: games, URLs, web queries..." />
          <span class="wubu-cmd-hint">Enter to run</span>
        </div>
        <ul id="wubu-command-list"></ul>
      </div>
    `;
    document.body.appendChild(root);
  };

  const buildProxyResults = (query) => {
    const q = String(query || '').trim();
    if (!q) return [];

    if (looksLikeUrl(q)) {
      const target = normalizeUrl(q);
      return [{
        title: target,
        subtitle: target,
        icon: faviconForUrl(target),
        kind: 'Proxy URL',
        run: () => applyProxyQuery(target),
      }];
    }

    const ddg = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    const google = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    return [
      {
        title: `DuckDuckGo: ${q}`,
        subtitle: ddg,
        icon: faviconForUrl(ddg),
        kind: 'Proxy Search',
        run: () => applyProxyQuery(q),
      },
      {
        title: `Google: ${q}`,
        subtitle: google,
        icon: faviconForUrl(google),
        kind: 'Proxy Search',
        run: () => applyProxyQuery(q),
      },
    ];
  };

  const buildGameResults = (query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const index = state.gameIndex || [];
    const matches = index
      .filter((game) => game.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((game) => ({
        title: game.name,
        subtitle: game.description || 'Open in Games tab',
        icon: '/assets/ico/favicon-32x32.png',
        kind: 'Game',
        run: () => applyGameSearch(game.name),
      }));

    if (!matches.length) {
      return [{
        title: `Search games for "${query}"`,
        subtitle: 'No exact matches yet. Open Games search.',
        icon: '/assets/ico/favicon-32x32.png',
        kind: 'Game',
        run: () => applyGameSearch(query),
      }];
    }
    return matches;
  };

  const buildResults = (query) => {
    const q = String(query || '').trim();
    if (!q) {
      return [
        { title: 'Go to Home', subtitle: '/home', icon: '/assets/ico/favicon-32x32.png', kind: 'Page', run: () => (window.location.href = '/home') },
        { title: 'Go to Games', subtitle: '/games', icon: '/assets/ico/favicon-32x32.png', kind: 'Page', run: () => (window.location.href = '/games') },
        { title: 'Go to Proxies', subtitle: '/browsing', icon: '/assets/ico/favicon-32x32.png', kind: 'Page', run: () => (window.location.href = '/browsing') },
      ];
    }

    return [...buildGameResults(q), ...buildProxyResults(q)];
  };

  const renderPalette = () => {
    const input = document.getElementById('wubu-command-input');
    const list = document.getElementById('wubu-command-list');
    if (!input || !list) return;

    state.results = buildResults(input.value);
    if (state.selected >= state.results.length) {
      state.selected = Math.max(0, state.results.length - 1);
    }

    if (!state.results.length) {
      list.innerHTML = `<li class="wubu-cmd-empty">Type something to search.</li>`;
      return;
    }

    list.innerHTML = state.results
      .map((result, index) => {
        const active = index === state.selected ? 'active' : '';
        return `<li class="wubu-cmd-item ${active}" data-cmd-index="${index}">
          <img class="wubu-cmd-icon" src="${escapeHtml(result.icon)}" alt="" loading="lazy" />
          <span class="wubu-cmd-info">
            <span class="wubu-cmd-title">${escapeHtml(result.title)}</span>
            <span class="wubu-cmd-subtitle">${escapeHtml(result.subtitle)}</span>
          </span>
          <span class="wubu-cmd-kind">${escapeHtml(result.kind)}</span>
        </li>`;
      })
      .join('');
  };

  const openPalette = () => {
    ensurePalette();
    const root = document.getElementById('wubu-command-palette');
    const input = document.getElementById('wubu-command-input');
    if (!root || !input) return;

    state.open = true;
    state.selected = 0;
    root.classList.add('open');
    input.value = '';
    renderPalette();
    input.focus();

    ensureGameIndex().then(() => {
      if (state.open) renderPalette();
    });
  };

  const closePalette = () => {
    const root = document.getElementById('wubu-command-palette');
    if (!root) return;
    state.open = false;
    root.classList.remove('open');
  };

  const runSelected = () => {
    const result = state.results[state.selected];
    if (!result || typeof result.run !== 'function') return;
    closePalette();
    result.run();
  };

  document.addEventListener('click', (event) => {
    const root = document.getElementById('wubu-command-palette');
    if (!root || !state.open) return;
    if (event.target === root) {
      closePalette();
      return;
    }
    const item = event.target.closest('.wubu-cmd-item');
    if (!item) return;
    const index = Number(item.getAttribute('data-cmd-index'));
    if (Number.isNaN(index)) return;
    state.selected = index;
    runSelected();
  });

  document.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'wubu-command-input') {
      state.selected = 0;
      renderPalette();
    }
  });

  document.addEventListener('keydown', async (event) => {
    if (event.defaultPrevented) return;

    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      if (state.open) closePalette();
      else openPalette();
      return;
    }

    if (state.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.selected = (state.selected + 1) % Math.max(1, state.results.length);
        renderPalette();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const total = Math.max(1, state.results.length);
        state.selected = (state.selected - 1 + total) % total;
        renderPalette();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runSelected();
      }
      return;
    }

    const panicKeybind = parseKeybind(localStorage.getItem(PANIC_KEYBIND_KEY) || DEFAULT_PANIC_KEYBIND);
    if (!keybindMatches(event, panicKeybind)) return;

    event.preventDefault();
    const currentUrl = window.location.href;
    localStorage.setItem(LAST_SESSION_URL_KEY, currentUrl);
    await copyToClipboard(currentUrl);
    window.location.href = normalizeUrl(localStorage.getItem(PANIC_URL_KEY) || DEFAULT_PANIC_URL);
  });
})();
