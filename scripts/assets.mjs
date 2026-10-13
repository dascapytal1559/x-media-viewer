import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs/icons');
await mkdir(output, { recursive: true });
const icon = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');
for (const size of [16, 32, 48, 128]) {
  const image = new Resvg(icon, { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(path.join(output, `icon-${size}.png`), image);
}
