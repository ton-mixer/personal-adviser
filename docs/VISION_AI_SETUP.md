# Setting Up Google Cloud Vision AI

This document explains how to set up Google Cloud Vision AI for the Personal Financial Adviser application.

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Make note of your Project ID

## 2. Enable the Vision API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Cloud Vision API"
3. Click on the Vision API and click "Enable"

## 3. Create a Service Account Key

1. Go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Give it a name (e.g., "vision-api-access")
4. Grant the role "Cloud Vision API User" (or a more restrictive role as needed)
5. Click "Create Key" and select JSON format
6. Save the downloaded JSON file

## 4. Configure the Application

1. Place the downloaded JSON file in the root of your project
2. Rename it to `google-cloud-credentials.json`
3. Make sure this file is added to your `.gitignore` to prevent accidental commits of sensitive credentials
4. The environment variable `GOOGLE_APPLICATION_CREDENTIALS` in your `.env` file should point to this JSON file

## 5. Verify Setup

To verify the setup is working correctly:

1. Make sure the Google Cloud Vision library is installed: `npm install @google-cloud/vision`
2. Run a test upload of an image to confirm the OCR functionality works

## Troubleshooting

- Ensure the Vision API is enabled for your project
- Check that the service account has the correct permissions
- Verify the path to the credentials file is correct
- Check for any firewall or network restrictions that might block API access
