const fs = require('fs');
let lines = fs.readFileSync('src/server.mjs', 'utf8').split('\n');

// 1. Remove createRammerhead import
lines = lines.filter(line => !line.includes('import createRammerhead from'));

// 2. Remove Initialize Rammerhead block.
// Find indices
let idxInitRh = lines.findIndex(line => line.includes('// Initialize Rammerhead'));
let idxBlooketServ = lines.findIndex(line => line.includes('// Initialize Blooket Service'));
if (idxInitRh !== -1 && idxBlooketServ !== -1) {
    lines.splice(idxInitRh, idxBlooketServ - idxInitRh);
}

// 3. Update serverFactory
let reqIdx = lines.findIndex(line => line.includes('if (shouldRouteRh(req)) routeRhRequest(req, res);'));
if (reqIdx !== -1) {
    lines[reqIdx] = '      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");\n      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");\n      handler(req, res);';
    lines[reqIdx + 1] = ''; // clear "else handler(req, res);"
}

// 4. Remove Rammerhead WebSocket
let wsIdx = lines.findIndex(line => line.includes('// Rammerhead WebSocket'));
if (wsIdx !== -1) {
    lines.splice(wsIdx, 5); // remove 5 lines of Rammerhead websocket block
}

// 5. Update disguiseFiles exemptPages
let exemptIdx = lines.findIndex(line => line.includes('for (const path of rammerheadScopes)'));
if (exemptIdx !== -1) {
    lines.splice(exemptIdx, 2); // Remove the loop adding rammerheadScopes
}

fs.writeFileSync('src/server.mjs', lines.join('\n'));
console.log('Fixed src/server.mjs successfully');
