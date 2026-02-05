import type { NextConfig } from "next";
import { resolve } from "path";
import { config } from "dotenv";

// Load .env from the monorepo root (parent directory)
config({ path: resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
