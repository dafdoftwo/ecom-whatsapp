/** @type {import('next').NextConfig} */
const nextConfig = {
  // Completely disable ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [],
  },
  // Disable TypeScript type checking during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimize for Railway deployment
  images: {
    unoptimized: true,
  },
  // Reduce bundle size for Railway
  output: 'standalone',
  // Disable dev features in production
  productionBrowserSourceMaps: false,
  // Optimize chunks
  webpack: (config, { dev, isServer }) => {
    // Disable ESLint webpack plugin
    if (!dev) {
      config.plugins = config.plugins.filter(
        plugin => plugin.constructor.name !== 'ESLintWebpackPlugin'
      );
    }
    return config;
  },
  // Experimental features
  experimental: {
    // Optimize for Railway
  },
}

module.exports = nextConfig 