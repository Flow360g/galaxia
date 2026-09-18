import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM examples; keep the bundle lean by letting
  // Next tree-shake it as a package rather than pre-bundling the whole library.
  experimental: {
    optimizePackageImports: ["three"],
  },
};

export default nextConfig;
