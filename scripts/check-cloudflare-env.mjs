import { readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../migration/vercel-variable-inventory.json', import.meta.url), 'utf8'));
const required = inventory.productionAndPreview.filter(name => name.startsWith('VITE_'));
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error('Missing Cloudflare build variables (values are never printed):\n' + missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`All ${required.length} public build settings from the Vercel inventory are present.`);
}
