const path = require('path');
const fs = require('fs');

/** Local API port must match repo root config/dev-ports.json (backend). */
function getDevBackendPort() {
  try {
    const p = path.join(__dirname, '..', 'config', 'dev-ports.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Number(j.backend) || 5000;
  } catch {
    return 5000;
  }
}

const isProd = process.env.NODE_ENV === 'production';
const defaultApiUrl = isProd
  ? 'https://api.tavarios.com'
  : `http://localhost:${getDevBackendPort()}`;

/** @type {import('next').NextConfig} */
const fs = require('fs');
const path = require('path');

const devPortsPath = path.join(__dirname, '..', 'config', 'dev-ports.json');
let devBackendPort = 5003;
try {
  const raw = fs.readFileSync(devPortsPath, 'utf8');
  devBackendPort = JSON.parse(raw).backend || 5003;
} catch {
  // keep default
}

const isProd = process.env.NODE_ENV === 'production';
const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL
  ? undefined
  : isProd
    ? 'https://api.tavarios.com'
    : `http://localhost:${devBackendPort}`;

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  env: {
    ...(defaultApiUrl ? { NEXT_PUBLIC_API_URL: defaultApiUrl } : {}),
  },
};

module.exports = nextConfig;
