/**
 * Runs `next dev` on the port from kiddconnect-web/config/dev-ports.json.
 */
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, '..');
const ports = JSON.parse(readFileSync(join(frontendRoot, 'config', 'dev-ports.json'), 'utf8'));
const port = Number(ports.frontend) || 3003;

const nextCli = join(frontendRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(nextCli)) {
  console.error('[run-next-dev] Next.js not found. Run: cd kiddconnect-web && npm install');
  console.error('Expected:', nextCli);
  process.exit(1);
}

const child = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
  cwd: frontendRoot,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env },
});

child.on('error', (err) => {
  console.error('[run-next-dev] Failed to start Next.js:', err.message);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code ?? 0));
