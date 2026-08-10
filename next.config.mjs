/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },

  // Dev only: keep webpack's cache in memory. The on-disk pack kept failing to
  // rename itself (ENOENT on 0.pack.gz_ -> 0.pack.gz) and left the build
  // referencing chunks that no longer existed, which surfaced as
  // "Cannot find module './948.js'" and a dev server 500ing on every route
  // until .next was deleted. Slightly slower cold starts, no corruption.
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: 'memory' };
    return config;
  },
};
export default nextConfig;
