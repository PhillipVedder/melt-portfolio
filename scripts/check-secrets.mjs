import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const secrets = [];
if (existsSync('.env')) {
  const env = readFileSync('.env', 'utf8');
  const key = env
    .match(/^FINNHUB_API_KEY\s*=\s*(.+)$/m)?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (key && key.length >= 12) secrets.push(key);
}
const roots = ['src', 'server', 'tests', 'docs', 'dist', '.github', 'scripts'];
function files(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)],
  );
}
const scan = [
  ...roots.flatMap(files),
  'README.md',
  'package.json',
  'package-lock.json',
  '.env.example',
];
const leaked = scan.filter((file) =>
  secrets.some((key) => readFileSync(file).includes(Buffer.from(key))),
);
if (leaked.length) {
  console.error('Configured credential found in public files:', leaked.join(', '));
  process.exit(1);
}
console.log(
  secrets.length
    ? 'Configured key absent from public source and build artifacts.'
    : 'No local key configured; known-key scan skipped. Never commit credentials.',
);
