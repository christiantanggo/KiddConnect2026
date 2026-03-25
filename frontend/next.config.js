const path = require('path');
const fs = require('fs');

const devPortsPath = path.join(__dirname, '..', 'config', 'dev-ports.json');
let devBackendPort = 5003;
try {
  const raw = fs.readFileSync(devPortsPath, 'utf8');
  devBackendPort = Number(JSON.parse(raw).backend) || 5003;
} catch {
  // keep default
}

const isProd = process.env.NODE_ENV === 'production';
const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL
  ? undefined
  : isProd
    ? 'https://api.tavarios.com'
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
