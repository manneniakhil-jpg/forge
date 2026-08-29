import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ev/domain"],
  serverExternalPackages: ["better-sqlite3", "argon2"],
};

export default nextConfig;
