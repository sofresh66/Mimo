import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Variables partagées du monorepo (fichier .env à la racine).
loadEnv({ path: resolve(__dirname, '../../.env'), quiet: true });

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(__dirname, '../..'),
  transpilePackages: ['@mimo/ui'],
  poweredByHeader: false,
  // Socket.IO utilise le chemin « /socket.io/ » : on évite la redirection du slash final.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? 'Mimo',
  },
  // L'API et Socket.IO sont servis sous la même origine que le web :
  // les cookies HttpOnly restent « first-party » et aucun CORS n'est nécessaire.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/socket.io', destination: `${apiUrl}/socket.io/` },
      { source: '/socket.io/', destination: `${apiUrl}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${apiUrl}/socket.io/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
