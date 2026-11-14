import type { NextConfig } from "next";

const configuration: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["@libsql/client"],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
    ] }];
  }
};

export default configuration;
