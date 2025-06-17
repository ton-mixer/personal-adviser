# Netlify Deployment Guide

This guide will help you deploy your Personal Financial Adviser app to Netlify and resolve authentication issues.

## Prerequisites

1. A Netlify account
2. Your repository connected to Netlify
3. All required environment variables

## Environment Variables Setup

You need to set the following environment variables in your Netlify dashboard:

### Required Environment Variables

1. **NEXTAUTH_URL** (CRITICAL for fixing 401 errors)
   ```
   https://your-app-name.netlify.app
   ```
   Replace `your-app-name` with your actual Netlify app name.

2. **NEXTAUTH_SECRET**
   ```
   your-super-secret-key-here
   ```
   Generate a secure secret key (32+ characters). You can use: `openssl rand -base64 32`

3. **DATABASE_URL**
   ```
   postgresql://username:password@host:port/database
   ```
   Your PostgreSQL database connection string.

### Supabase Variables (if using Supabase)

4. **NEXT_PUBLIC_SUPABASE_URL**
   ```
   https://your-project.supabase.co
   ```

5. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   ```
   your-supabase-anon-key
   ```

6. **SUPABASE_SERVICE_ROLE_KEY**
   ```
   your-supabase-service-role-key
   ```

### Google Cloud Variables (optional)

7. **GOOGLE_CLOUD_PROJECT_ID**
8. **GOOGLE_CLOUD_LOCATION**
9. **GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID**
10. **GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID**

## Deployment Steps

### 1. Set Environment Variables in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings** > **Environment variables**
4. Add all the environment variables listed above
5. Make sure **NEXTAUTH_URL** matches your Netlify app URL exactly

### 2. Install Netlify Plugin

Add the Netlify Next.js plugin to your project:

```bash
npm install --save-dev @netlify/plugin-nextjs
```

### 3. Deploy

1. Push your changes to your repository
2. Netlify should automatically redeploy
3. Check the deploy logs for any errors

## Troubleshooting 404 Errors

If you're seeing a 404 error on your base URL, this is likely due to incorrect Netlify configuration:

### 1. Remove Manual Publish Directory
- **Problem**: Setting `publish = ".next"` interferes with the @netlify/plugin-nextjs plugin
- **Solution**: Remove the `publish` line from your `netlify.toml` and let the plugin handle it automatically

### 2. Let the Plugin Handle Everything
- **Problem**: Manual redirects or publish directories conflict with the plugin
- **Solution**: Use only the plugin configuration without additional redirects

## Troubleshooting 401 Errors

The 401 Unauthorized error you're experiencing is likely due to one of these issues:

### 1. Missing NEXTAUTH_URL
- **Problem**: NextAuth doesn't know your production URL
- **Solution**: Set `NEXTAUTH_URL=https://your-app-name.netlify.app` in Netlify environment variables

### 2. Incorrect NEXTAUTH_URL
- **Problem**: The URL doesn't match your actual Netlify URL
- **Solution**: Double-check your Netlify app URL and update the environment variable

### 3. Missing NEXTAUTH_SECRET
- **Problem**: NextAuth requires a secret for JWT signing
- **Solution**: Generate and set a secure `NEXTAUTH_SECRET`

### 4. Database Connection Issues
- **Problem**: Can't connect to the database to verify credentials
- **Solution**: Verify your `DATABASE_URL` is correct and the database is accessible

## Testing the Fix

1. After setting the environment variables, redeploy your site
2. Try logging in at `https://your-app-name.netlify.app`
3. Check the browser network tab for any remaining API errors
4. Check Netlify function logs for server-side errors

## Additional Notes

- Make sure your database is accessible from Netlify's servers
- If using Supabase, ensure your RLS policies allow the operations your app needs
- Consider setting up a staging environment for testing before production deploys

## Common Issues

### CORS Errors
If you see CORS errors, make sure your `NEXTAUTH_URL` is set correctly and matches your domain.

### Database Connection Timeouts
Ensure your database provider allows connections from Netlify's IP ranges.

### Function Timeouts
Large operations might timeout on Netlify's free tier (10 seconds). Consider optimizing or upgrading your plan. 