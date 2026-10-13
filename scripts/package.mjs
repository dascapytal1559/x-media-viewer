import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync } from 'fflate';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'manifest.json',
  'background.js',
  'bridge.js',
  'viewer.js',
  'README.md',
  'PRIVACY.md',
  'LICENSE',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];
const entries = {};
for (const name of files) {
  const data = await readFile(path.join(root, 'outputs/x-media-viewer', name));
  entries[`x-media-viewer/${name}`] = [
    new Uint8Array(data),
    { mtime: new Date('2020-01-01T00:00:00Z') },
  ];
}
const archive = zipSync(entries, { level: 9 });
const unpacked = unzipSync(archive);
for (const [name, [data]] of Object.entries(entries)) {
  if (!Buffer.from(unpacked[name]).equals(Buffer.from(data)))
    throw new Error(`ZIP mismatch: ${name}`);
}
await mkdir(path.join(root, 'outputs'), { recursive: true });
await writeFile(path.join(root, 'outputs/x-media-viewer.zip'), archive);
console.log(`Packaged ${files.length} verified release files in outputs/x-media-viewer.zip`);

const storeEntries = Object.fromEntries(
  Object.entries(entries).map(([name, data]) => [name.replace('x-media-viewer/', ''), data]),
);
const storeArchive = zipSync(storeEntries, { level: 9 });
const storeFiles = unzipSync(storeArchive);
if (!storeFiles['manifest.json']) throw new Error('Store ZIP needs manifest.json at its root.');
for (const [name, [data]] of Object.entries(storeEntries)) {
  if (!Buffer.from(storeFiles[name]).equals(Buffer.from(data)))
    throw new Error(`Store ZIP mismatch: ${name}`);
}
await writeFile(path.join(root, 'outputs/x-media-viewer-store.zip'), storeArchive);
console.log('Packaged and verified outputs/x-media-viewer-store.zip for Chrome Web Store upload');

const manifest = JSON.parse(Buffer.from(storeFiles['manifest.json']).toString('utf8'));
const referenced = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...Object.values(manifest.icons),
];
for (const name of referenced)
  if (!storeFiles[name]) throw new Error(`Missing manifest resource: ${name}`);
if (manifest.description.length > 132) throw new Error('Store description exceeds 132 characters.');
for (const [size, name] of Object.entries(manifest.icons)) {
  const png = Buffer.from(storeFiles[name]);
  if (
    png.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== Number(size) ||
    png.readUInt32BE(20) !== Number(size)
  )
    throw new Error(`Invalid icon dimensions: ${name}`);
}
console.log('Verified store manifest references, description length, and icon dimensions');
