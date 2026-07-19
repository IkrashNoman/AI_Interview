/** @type {import('next').NextConfig} */
const nextConfig = {
  // Move it here as a top-level option
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.18.163"]
};

module.exports = nextConfig;