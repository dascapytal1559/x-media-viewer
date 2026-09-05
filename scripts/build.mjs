import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs/x-media-viewer');
const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error('Package and extension versions must match.');
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/viewer.js', 'src/bridge.js', 'src/background.js'],
  outdir: output,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome111',
  loader: { '.css': 'text', '.html': 'text' },
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
});
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await copyFile(path.join(root, 'docs/INSTALL.md'), path.join(output, 'README.md'));
await copyFile(path.join(root, 'PRIVACY.md'), path.join(output, 'PRIVACY.md'));
// Remove the unused helper left by older releases. Each content script now
// bundles the same source into its own execution world without shared globals.
await rm(path.join(output, 'media-core.js'), { force: true });
await mkdir(path.join(root, 'work'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/media-core.js'],
  outfile: path.join(root, 'work/media-core.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XMediaCore',
  platform: 'browser',
  target: 'chrome111',
  sourcemap: false,
});
console.log(`Built X Media Viewer ${manifest.version} in outputs/x-media-viewer`);
