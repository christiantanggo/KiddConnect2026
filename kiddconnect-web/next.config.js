const path = require('path');
const fs = require('fs');

const devPortsPath = path.join(__dirname, 'config', 'dev-ports.json');
let devBackendPort = 5003;
try {
  const raw = fs.readFileSync(devPortsPath, 'utf8');
  devBackendPort = Number(JSON.parse(raw).backend) || 5003;
} catch {
  // keep default
}

const isProd = process.env.NODE_ENV === 'production';
// Production default must resolve in DNS. api.kiddconnect.ca is optional; override with
// NEXT_PUBLIC_API_URL on Vercel (e.g. https://api.kiddconnect.ca) when the record exists.
const PRODUCTION_API_FALLBACK = 'https://kiddconnect2026-production.up.railway.app';
const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL
  ? undefined
  : isProd
    ? PRODUCTION_API_FALLBACK
    : `http://localhost:${devBackendPort}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  env: {
    ...(defaultApiUrl ? { NEXT_PUBLIC_API_URL: defaultApiUrl } : {}),
  },
};

module.exports = nextConfig;
