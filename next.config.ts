import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // @resvg/resvg-js is a native (N-API) addon — it must run as real Node.js code,
  // not get bundled by Turbopack/webpack.
  serverExternalPackages: ["@resvg/resvg-js", "satori", "harfbuzzjs", "better-sqlite3", "@ffmpeg-installer/ffmpeg"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
