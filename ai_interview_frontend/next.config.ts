import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.18.163", // Optional: if you access the app from another device on your network
  ],
};

export default nextConfig;