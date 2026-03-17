/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint 9 + eslint-config-next mismatch on Vercel ("extensions" removed); skip lint in CI until aligned
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com',
  },
};

module.exports = nextConfig;

