// Validate the production files Tauri embeds, including CSS-only artwork.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const missing = [];
let checked = 0;
function check(reference, source) {
  const ref = reference.trim().replace(/^['"]|['"]$/g, '');
  if (!ref || /^(data:|https?:|\/\/|#)/i.test(ref)) return;
  const base = new URL(path.relative(root, source).replaceAll('\\', '/'), 'https://bundle.invalid/');
  const url = new URL(ref, base);
  const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  checked++;
  if (!existsSync(target)) missing.push(`${path.relative(root, source)} → ${ref}`);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(source); continue; }
    if (source.endsWith('.css')) {
      for (const match of readFileSync(source, 'utf8').matchAll(/url\(([^)]+)\)/g)) check(match[1], source);
    } else if (source.endsWith('.html')) {
      for (const match of readFileSync(source, 'utf8').matchAll(/(?:src|href)=["']([^"']+)["']/g)) check(match[1], source);
    }
  }
}
walk(root);
if (missing.length) {
  console.error('Missing production assets:\n' + missing.join('\n'));
  process.exitCode = 1;
} else console.log(`Verified ${checked} production asset references.`);
