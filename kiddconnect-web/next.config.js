// Live API. api.lefournier.ca does not resolve, so local dev and production both use Railway
// unless NEXT_PUBLIC_API_URL is set (for example http://localhost:5003 when the API is running here).
const PRODUCTION_API_FALLBACK = 'https://kiddconnect2026-production.up.railway.app';
const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL ? undefined : PRODUCTION_API_FALLBACK;

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  env: {
    ...(defaultApiUrl ? { NEXT_PUBLIC_API_URL: defaultApiUrl } : {}),
  },
};

module.exports = nextConfig;
