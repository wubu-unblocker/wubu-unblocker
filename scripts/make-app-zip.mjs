import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal zip writer (deflate) to avoid relying on external tools.
// Usage: node scripts/make-app-zip.mjs [outZipAbsoluteOrRelative]

const ROOT = process.cwd();
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, 'app.zip');

const EXCLUDE_DIR_PREFIXES = [
  'node_modules/',
  '.git/',
  '.git.bak/',
  'views/dist/',
  'views/archive/',
  'blooket-data/',
  'GAMESFORCHEATS/',
  'Holy-Unblocker/',
  'ORIGINAL/',
  'Blooket-Proxy/',
  'V1/',
  '.idea/',
  '.vscode/',
];

const EXCLUDE_ANYWHERE_DIR_NAMES = new Set(['node_modules', 'blooket-data']);

const EXCLUDE_FILE_BASENAMES = new Set(['debug.log', 'app.zip']);

function shouldExclude(relPosix, isDir) {
  // Normalize to posix with trailing slash for dirs.
  let rp = relPosix;
  if (isDir && !rp.endsWith('/')) rp += '/';

  // Quick prefix exclusions for top-level bulky dirs.
  for (const p of EXCLUDE_DIR_PREFIXES) {
    if (rp.startsWith(p)) return true;
  }

  // Exclude Rammerhead runtime data anywhere (vendored copies too).
  if (rp.includes('/lib/rammerhead/sessions/')) return true;
  if (rp.includes('/lib/rammerhead/cache-js/')) return true;

  if (!isDir) {
    const base = path.posix.basename(rp);
    if (EXCLUDE_FILE_BASENAMES.has(base)) return true;
    if (base.endsWith('.log')) return true;
    if (base === '.shutdown' && rp.endsWith('src/.shutdown')) return true;
    if (base.endsWith('.rhfsession')) return true;
    // Firebase creds
    if (/^wubu-issues-firebase-adminsdk-.*\.json$/i.test(base)) return true;
  }

  return false;
}

function walk(dirAbs, relPosixBase = '') {
  const out = [];
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dirAbs, ent.name);
    const relPosix = (relPosixBase ? relPosixBase + '/' : '') + ent.name;
    const relPosixNorm = relPosix.split(path.sep).join('/');

    if (ent.isDirectory()) {
      if (EXCLUDE_ANYWHERE_DIR_NAMES.has(ent.name)) continue;
      if (shouldExclude(relPosixNorm, true)) continue;
      out.push(...walk(abs, relPosixNorm));
      continue;
    }
    if (!ent.isFile()) continue;
    if (shouldExclude(relPosixNorm, false)) continue;
    out.push({ abs, relPosix: relPosixNorm });
  }
  return out;
}

// CRC32 (standard polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(ms) {
  const d = new Date(ms);
  let year = d.getFullYear();
  if (year < 1980) year = 1980;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const secs = Math.floor(d.getSeconds() / 2);
  const dosTime = (hours << 11) | (mins << 5) | secs;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function u16(n) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n & 0xFFFF, 0);
  return b;
}
function u32(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function writeAll(fd, buf) {
  let off = 0;
  while (off < buf.length) {
    off += fs.writeSync(fd, buf, off, buf.length - off);
  }
}

const files = walk(ROOT);
files.sort((a, b) => a.relPosix.localeCompare(b.relPosix));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.rmSync(OUT);

const fd = fs.openSync(OUT, 'w');
let offset = 0;
const central = [];

try {
  for (const f of files) {
    const nameBuf = Buffer.from(f.relPosix, 'utf8');
    const st = fs.statSync(f.abs);
    const { dosTime, dosDate } = dosDateTime(st.mtimeMs);
    const raw = fs.readFileSync(f.abs);

    // Deflate (raw) for smaller zips. If deflate doesn't help, store.
    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    const useStore = deflated.length >= raw.length;
    const method = useStore ? 0 : 8;
    const data = useStore ? raw : deflated;

    const crc = crc32(raw);
    const csize = data.length >>> 0;
    const usize = raw.length >>> 0;

    // Local file header
    const localHeader = Buffer.concat([
      u32(0x04034b50),          // signature
      u16(20),                  // version needed
      u16(0x0800),              // general purpose bit flag (UTF-8)
      u16(method),              // compression method
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(csize),
      u32(usize),
      u16(nameBuf.length),
      u16(0),                   // extra length
      nameBuf,
    ]);

    writeAll(fd, localHeader);
    writeAll(fd, data);

    const localHeaderOffset = offset;
    offset += localHeader.length + data.length;

    // Central directory header
    const centralHeader = Buffer.concat([
      u32(0x02014b50),          // signature
      u16(20),                  // version made by
      u16(20),                  // version needed
      u16(0x0800),              // flags UTF-8
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(csize),
      u32(usize),
      u16(nameBuf.length),
      u16(0),                   // extra
      u16(0),                   // comment
      u16(0),                   // disk number start
      u16(0),                   // internal attrs
      u32(0),                   // external attrs
      u32(localHeaderOffset),
      nameBuf,
    ]);
    central.push(centralHeader);
  }

  const centralStart = offset;
  for (const c of central) {
    writeAll(fd, c);
    offset += c.length;
  }
  const centralSize = offset - centralStart;

  const eocd = Buffer.concat([
    u32(0x06054b50),            // signature
    u16(0),                     // disk
    u16(0),                     // disk where central starts
    u16(central.length),        // entries on disk
    u16(central.length),        // total entries
    u32(centralSize),
    u32(centralStart),
    u16(0),                     // comment length
  ]);
  writeAll(fd, eocd);
} finally {
  fs.closeSync(fd);
}

const outStat = fs.statSync(OUT);
process.stdout.write(`Wrote ${OUT} (${outStat.size} bytes)\\n`);

