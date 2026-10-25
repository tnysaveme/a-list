import type { NextConfig } from 'next';
import { posterPatterns } from './lib/poster';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: posterPatterns },
};

export default nextConfig;
