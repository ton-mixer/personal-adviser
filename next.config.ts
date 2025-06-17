import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure static optimization is disabled for API routes
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcrypt'],
  },
  
  // Configure for Netlify deployment
  trailingSlash: false,
  
  // Ensure proper handling of environment variables
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  },
  
  // Handle images properly
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
