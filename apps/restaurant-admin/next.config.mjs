/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xeva/ui'],
  // Same-origin API calls: the browser talks to /api/v1 and Next forwards to the API server.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${process.env.XEVA_API_URL ?? 'http://localhost:4000'}/api/v1/:path*` }];
  },
};

export default nextConfig;
