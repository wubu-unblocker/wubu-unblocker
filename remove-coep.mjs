import fs from 'fs';
let content = fs.readFileSync('src/server.mjs', 'utf8');
content = content.replace(/res\.setHeader\("Cross-Origin-Opener-Policy", "same-origin"\);\r?\n\s*/g, '');
content = content.replace(/res\.setHeader\("Cross-Origin-Embedder-Policy", "require-corp"\);\r?\n\s*/g, '');
fs.writeFileSync('src/server.mjs', content);
console.log('Removed COOP/COEP headers from server.mjs');
