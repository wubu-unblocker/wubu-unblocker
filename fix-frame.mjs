import fs from 'fs';
let code = fs.readFileSync('views/pages/frame.html', 'utf8');

// Just forcefully replace getProxyUrlAsync
let proxyAsync = `    async function getProxyUrlAsync(target, opts = {}) {
      return { engine: 'scramjet', url: await getProxyUrl(target) };
    }`;

code = code.replace(/    async function getProxyUrlAsync\(target, opts = \{\}\) \{[\s\S]*?return \{ engine: 'scramjet', url: await getProxyUrl\(target\) \};\n    \}/m, proxyAsync);

// Strip shouldUseRammerheadFor, getRammerheadProxyUrl
code = code.replace(/    function shouldUseRammerheadFor\(urlStr\) \{[\s\S]*?\}/g, '');
code = code.replace(/    async function getRammerheadProxyUrl\(target\) \{[\s\S]*?\}/g, '');
code = code.replace(/    async function rhFetchText\(pathname\) \{[\s\S]*?\}/g, '');
code = code.replace(/    class RhStrShuffler \{[\s\S]*?\}/g, '');
code = code.replace(/    async function getOrCreateRammerheadSessionId\(\) \{[\s\S]*?\}/g, '');

fs.writeFileSync('views/pages/frame.html', code);
fs.writeFileSync('views/dist/pages/frame.html', code);
console.log('Fixed frame.html');
