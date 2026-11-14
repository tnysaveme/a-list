import type { NextConfig } from 'next';
import { posterPatterns } from './lib/poster';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Preserve the origin on same-site POST forms, including sign-out.
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'none'; script-src 'self'; connect-src 'self'",
        },
      ],
    },
  ],
  distDir: process.env.ALIST_BUILD_OUTPUT === 'e2e' ? '.next-e2e' : '.next',
  images: { remotePatterns: posterPatterns },
};

export default nextConfig;
