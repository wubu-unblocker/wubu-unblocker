importScripts('{{route}}{{/uv/uv.bundle.js}}');
importScripts('{{route}}{{/uv/uv.config.js}}');
importScripts(self['{{__uv$config}}'].sw || '{{route}}{{/uv/uv.sw.js}}');

const uv = new UVServiceWorker();

// Make updates apply quickly without requiring multiple hard refreshes.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Maps TLD -> regex for its left-hand-side patterns.
 * @type {Record<string, RegExp>}
 */
const compiled = Object.create(null);

fetch('{{route}}{{/assets/json/blacklist.json}}')
  .then((r) => r.json())
  .then((list) => {
    /** @type {Record<string, string[]>} */
    const byTld = Object.create(null);
    for (const entry of list) {
      const tld = entry.replace(/.+(?=\.\w)/, '');
      if (!Object.prototype.hasOwnProperty.call(byTld, tld)) byTld[tld] = [];

      byTld[tld].push(
        encodeURIComponent(entry.slice(0, -tld.length))
          .replace(/([()])/g, '\\$1')
          .replace(/(\*\.)|\./g, (match, firstExpression) =>
            firstExpression ? '(?:.+\\.)?' : '\\' + match
          )
      );
    }

    for (const [tld, parts] of Object.entries(byTld)) {
      compiled[tld] = new RegExp(`^(?:${parts.join('|')})$`);
    }
    Object.freeze(compiled);
  })
  .catch(() => {
    Object.freeze(compiled);
  });

function tryGetRemoteHostname(requestUrl) {
  try {
    const u = new URL(requestUrl);
    const prefixPath = new URL(uv.config.prefix, location.origin).pathname;
    if (!u.pathname.startsWith(prefixPath)) return null;

    const encoded = u.pathname.slice(prefixPath.length);
    if (!encoded) return null;

    const decoded = uv.config.decodeUrl(encoded);
    if (!decoded) return null;

    return new URL(decoded).hostname || null;
  } catch {
    return null;
  }
}

self.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      if (!uv.route(event)) return await fetch(event.request);

      // Only block when decoding succeeds. Some scripts/modules can generate
      // relative URLs under the UV prefix; those must not crash the SW.
      const host = tryGetRemoteHostname(event.request.url);
      if (host) {
        const tld = host.replace(/.+(?=\.\w)/, '');
        if (Object.prototype.hasOwnProperty.call(compiled, tld)) {
          const left = host.slice(0, -tld.length);
          if (compiled[tld].test(left)) {
            return new Response(new Blob(), { status: 406 });
          }
        }
      }

      return await uv.fetch(event);
    })()
  );
});

