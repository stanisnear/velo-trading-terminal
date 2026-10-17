import { copyFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const relative of ['dist', 'dist/index.html']) {
  const stat = await lstat(path.join(root, relative));
  if (stat.isSymbolicLink()) throw new Error('Build output must not be a symlink');
}
await build({ entryPoints: [path.join(root, 'cloudflare/worker.js')], outfile: path.join(root, 'dist/_worker.js'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022' });
for (const [source, destination] of [['_routes.json', '_routes.json'], ['_headers', '_headers']]) {
  await copyFile(path.join(root, 'cloudflare', source), path.join(root, 'dist', destination));
}
console.log('Cloudflare gateway packaged. Backend deployment and runtime bindings are required.');
