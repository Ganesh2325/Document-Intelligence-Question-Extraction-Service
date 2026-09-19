import type { NextConfig } from "next";
import path from "node:path";

const apiBackend = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001").replace(
  "://localhost",
  "://127.0.0.1",
);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  typedRoutes: false,
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiBackend}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
