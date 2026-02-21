import fs from 'fs';
let content = fs.readFileSync('src/server.mjs', 'utf8');
content = content.replace(
    'app.register(fastifyHelmet, {\r\n  contentSecurityPolicy: false, // Disable CSP\r\n  xPoweredBy: false,\r\n});',
    'app.register(fastifyHelmet, {\r\n  contentSecurityPolicy: false, // Disable CSP\r\n  xPoweredBy: false,\r\n  crossOriginEmbedderPolicy: false,\r\n  crossOriginOpenerPolicy: false,\r\n});'
);
content = content.replace(
    'app.register(fastifyHelmet, {\n  contentSecurityPolicy: false, // Disable CSP\n  xPoweredBy: false,\n});',
    'app.register(fastifyHelmet, {\n  contentSecurityPolicy: false, // Disable CSP\n  xPoweredBy: false,\n  crossOriginEmbedderPolicy: false,\n  crossOriginOpenerPolicy: false,\n});'
);
fs.writeFileSync('src/server.mjs', content);
console.log('Disabled COOP and COEP in helmet.');
