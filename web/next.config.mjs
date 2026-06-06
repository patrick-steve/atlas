/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The site must build green with zero env vars; gateway URL is read at runtime.
  env: {},
};

export default nextConfig;
