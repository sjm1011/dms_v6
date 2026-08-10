import os from 'node:os';

const allowedDevOrigins = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses || [])
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

const buildDateParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(new Date())
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value])
);

const appVersionDate =
  process.env.APP_VERSION_DATE?.trim() ||
  `${buildDateParts.year}-${buildDateParts.month}-${buildDateParts.day}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost', ...allowedDevOrigins],
  env: {
    NEXT_PUBLIC_APP_VERSION_DATE: appVersionDate
  },
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
