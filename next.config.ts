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
  ],
  distDir: process.env.ALIST_BUILD_OUTPUT === 'e2e' ? '.next-e2e' : '.next',
  images: { remotePatterns: posterPatterns },
};

export default nextConfig;
