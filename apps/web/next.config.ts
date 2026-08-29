import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ev/domain"],
  serverExternalPackages: ["better-sqlite3", "argon2"],
  // Cursor preview / desktop loads via 127.0.0.1 while dev binds localhost — allow RSC fetches.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: repoRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
