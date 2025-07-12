/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable TypeScript type checking during build (for Railway deployment)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimize images for Railway
  images: {
    unoptimized: true,
  },
  // Reduce bundle size
  output: 'standalone',
  // Experimental features
  experimental: {
    // Add experimental features if needed
  },
}

module.exports = nextConfig 