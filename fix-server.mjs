import fs from 'fs';
let lines = fs.readFileSync('src/server.mjs', 'utf8').split('\n');

lines = lines.filter(line => !line.includes('import createRammerhead from'));

let idxInitRh = lines.findIndex(line => line.includes('// Initialize Rammerhead'));
let idxBlooketServ = lines.findIndex(line => line.includes('// Initialize Blooket Service'));
if (idxInitRh !== -1 && idxBlooketServ !== -1) {
    lines.splice(idxInitRh, idxBlooketServ - idxInitRh);
}

let reqIdx = lines.findIndex(line => line.includes('if (shouldRouteRh(req)) routeRhRequest(req, res);'));
if (reqIdx !== -1) {
    lines[reqIdx] = '      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");\n      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");\n      handler(req, res);';
    lines.splice(reqIdx + 1, 1); // Remove else handler(req, res);
}

let wsIdx = lines.findIndex(line => line.includes('// Rammerhead WebSocket'));
if (wsIdx !== -1) {
    lines.splice(wsIdx, 6);
}

let exemptIdx = lines.findIndex(line => line.includes('for (const path of rammerheadScopes)'));
if (exemptIdx !== -1) {
    lines.splice(exemptIdx, 2);
}

// Ensure session cleanup is gone from routes logic too
let sessRegIdx = lines.findIndex(line => line.includes('rammerheadSession.test(serverUrl.pathname + reqPath)'));
if (sessRegIdx !== -1) {
    lines[sessRegIdx] = lines[sessRegIdx].replace('||', ''); // The end parenthesis usually handles it, but let's just replace the whole line carefully.
    // Actually, wait, the line before it ends in `||`.
    lines[sessRegIdx - 1] = lines[sessRegIdx - 1].replace('||', '');
    lines.splice(sessRegIdx, 1);
}

fs.writeFileSync('src/server.mjs', lines.join('\n'));
console.log('Fixed src/server.mjs');
