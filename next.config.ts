import type { NextConfig } from 'next';
import { posterPatterns } from './lib/poster';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.ALIST_BUILD_OUTPUT === 'e2e' ? '.next-e2e' : '.next',
  images: { remotePatterns: posterPatterns },
};

export default nextConfig;
