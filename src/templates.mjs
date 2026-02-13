import { existsSync, readFileSync } from 'node:fs';
import { config, text404 } from './routes.mjs';
import paintSource from './source-rewrites.mjs';
export { loadTemplates, tryReadFile, preloaded404 };

const __dirname = '../views/pages/misc/deobf',
  getLineHeads = /^/gm,
  regExpEscape2 = /[-[\]{}()*+?.,\\^$|#\s]/g,
  isImage = /\.(?:ico|png|jpg|jpeg)$/,
  templateNames = [
    'anti-exfil',
    'head-content',
    'header',
    'footer',
    'docs',
    'faq',
    'tos',
    'settings',
    'proxnav-settings',
  ],
  readTemplate = (identifier) =>
    readFileSync(
      new URL(__dirname + `/${identifier}.html`, import.meta.url),
      'utf8'
    ),
  locateTemplate = (key) =>
    new RegExp(
      `([^\\S\\n\\r]*)<!--(${key.replace(regExpEscape2, '\\$&')})-->`,
      'gm'
    ),
  preserveIndentation = (template) => (line, leadingSpaces) =>
    template.replace(getLineHeads, leadingSpaces),
  templates = templateNames.map((name) => [
    locateTemplate(name.toUpperCase()),
    preserveIndentation(readTemplate(name).replace(/\s+$/, '')),
  ]),
  loadTemplates = (str) =>
    templates.reduce(
      (updatedStr, [key, template]) => updatedStr.replace(key, template),
      str
    ),
  preformatted404 = paintSource(loadTemplates(text404)),
  preloaded404 = config.disguiseFiles
    ? Buffer.from(
      await new Response(
        new Blob([preformatted404])
          .stream()
          .pipeThrough(new CompressionStream('gzip'))
      ).arrayBuffer()
    )
    : preformatted404,
  // Disk IO on small hosted environments is noticeably slower than local.
  // Cache static file reads in-memory for production to reduce latency.
  cacheEnabled =
    String(process.env.WUBU_DISABLE_FILE_CACHE || '').toLowerCase() !== 'true' &&
    (process.env.NODE_ENV === 'production' || !!config.production),
  fileCache = new Map(),
  // Grab the text content of a file. Use the root directory if no base is supplied.
  tryReadFile = (
    file,
    baseUrl = new URL('../', import.meta.url),
    isBuffer = config.disguiseFiles
  ) => {
    file = new URL(file, baseUrl);

    // Key includes whether we're returning a Buffer or utf8 string.
    const cacheKey = cacheEnabled ? `${file.href}|${isBuffer ? 'b' : 't'}` : null;
    if (cacheEnabled && fileCache.has(cacheKey)) return fileCache.get(cacheKey);

    const data = existsSync(file)
      ? readFileSync(file, isImage.test(file) || isBuffer ? undefined : 'utf8')
      : preloaded404;

    if (cacheEnabled && data !== preloaded404) fileCache.set(cacheKey, data);
    return data;
  };
