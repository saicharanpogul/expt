import type { NextConfig } from "next";
import path from "path";

const sdkDist = path.resolve(process.cwd(), "../../programs/sdk/dist");

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@expt/sdk"],
  turbopack: {
    resolveAlias: {
      "@expt/sdk": sdkDist + "/index.mjs",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@expt/sdk": sdkDist,
    };
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
