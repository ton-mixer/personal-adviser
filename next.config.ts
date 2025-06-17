import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages that should not be bundled for server components
  serverExternalPackages: ['@prisma/client', 'bcrypt'],
  
  // Configure for Netlify deployment
  trailingSlash: false,
  
  // Handle images properly for Netlify
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
