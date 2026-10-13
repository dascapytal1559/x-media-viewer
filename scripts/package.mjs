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

const manifest = JSON.parse(Buffer.from(unpacked['x-media-viewer/manifest.json']).toString('utf8'));
const referenced = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...Object.values(manifest.icons),
];
for (const name of referenced)
  if (!unpacked[`x-media-viewer/${name}`]) throw new Error(`Missing manifest resource: ${name}`);
for (const [size, name] of Object.entries(manifest.icons)) {
  const png = Buffer.from(unpacked[`x-media-viewer/${name}`]);
  if (
    png.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== Number(size) ||
    png.readUInt32BE(20) !== Number(size)
  )
    throw new Error(`Invalid icon dimensions: ${name}`);
}
console.log('Verified manifest references and icon dimensions');
