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
