#!/usr/bin/env node

/**
 * Generate a secure NextAuth secret
 * Run with: node scripts/generate-nextauth-secret.js
 */

const crypto = require('crypto');

function generateNextAuthSecret() {
  // Generate a 32-byte random string and encode it as base64
  const secret = crypto.randomBytes(32).toString('base64');
  return secret;
}

console.log('Generated NextAuth Secret:');
console.log(generateNextAuthSecret());
console.log('\nAdd this to your environment variables as:');
console.log('NEXTAUTH_SECRET=' + generateNextAuthSecret()); 