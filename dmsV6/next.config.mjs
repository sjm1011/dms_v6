import os from 'node:os';

const allowedDevOrigins = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses || [])
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins,
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
