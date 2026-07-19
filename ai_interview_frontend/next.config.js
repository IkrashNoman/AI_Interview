/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keeping your existing allowed origins configuration
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.18.163"],

  // Adding the security headers required for SharedArrayBuffer / multi-threaded WebAssembly to execute
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;