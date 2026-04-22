import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许从网络地址访问开发服务器
  allowedDevOrigins: ['192.168.56.1'],
};

export default nextConfig;
