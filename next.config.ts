import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MediaPipe 为浏览器 WASM 包，需参与转译以便与 Next 打包协作
  transpilePackages: ["@mediapipe/tasks-vision"],
  /** 放宽 Server Actions / 部分服务端请求的体积上限，避免大图 Base64 被截断 */
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
