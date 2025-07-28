# GitHub Codespace Configuration Guide

This document explains how to properly configure the Discord AI Bot for GitHub Codespace environments.

## Issue Fixed

**Problem**: Users were experiencing 404 errors when accessing the Discord OAuth callback URL in GitHub Codespace:
```
https://fictional-telegram-gvpj4xjjjgpc6j-8080.app.github.dev/auth/discord/callback
```

**Root Cause**: The server was not properly configured to handle external connections and GitHub Codespace domain patterns.

## Solution Implemented

### 1. Server Binding Configuration
- Changed server to bind to `0.0.0.0:8080` instead of `localhost:8080` when external domain is detected
- This allows GitHub Codespace proxy to forward external traffic to the server

### 2. Environment Detection
- Added specific detection for GitHub Codespace domains (`*.app.github.dev`)
- Proper handling of HTTPS protocol for Codespace environments
- Automatic port extraction from Codespace domain names

### 3. OAuth Callback URL Generation
- Fixed callback URL construction for Codespace environments
- Proper protocol (HTTPS) and domain handling
- Correct session configuration with secure cookies

## Configuration for GitHub Codespace

### Required Environment Variables

In your `.env` file, ensure the following are configured:

```bash
# Set your Codespace domain (replace with your actual codespace URL)
ADMIN_DOMAIN=your-codespace-name-8080.app.github.dev

# Discord OAuth credentials
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here

# Other required variables
SESSION_SECRET=your_random_session_secret
PORT=8080
```

### Discord Developer Portal Configuration

In your Discord application settings (https://discord.com/developers/applications):

1. Go to **OAuth2** → **General**
2. Add the following redirect URI:
   ```
   https://your-codespace-name-8080.app.github.dev/auth/discord/callback
   ```
3. Make sure to replace `your-codespace-name-8080` with your actual codespace URL

### Verification

To verify the fix is working:

1. Start your server: `npm start`
2. Check the logs for proper environment detection:
   ```
   [情報] 認証環境: GitHub Codespace
   [情報] Discord OAuth Callback URL: https://your-codespace-name-8080.app.github.dev/auth/discord/callback
   ```
3. Test the health endpoint: `curl https://your-codespace-url/api/health`
4. Test the status endpoint: `curl https://your-codespace-url/status`

### Troubleshooting

If you still encounter issues:

1. **Check server binding**: Ensure logs show `Webサーバーが 0.0.0.0:8080 で起動しました`
2. **Verify domain detection**: Check that the environment is detected as "GitHub Codespace"
3. **Test local accessibility**: Use the test script to verify routes are accessible
4. **Check Discord app configuration**: Ensure callback URL matches exactly

### Test Script

Run the included test script to verify all routes are working:

```bash
node /tmp/test_oauth_callback.js
```

This should show all tests passing with proper status codes (200/302/400, not 404).

## Changes Made

- `server.js`: Updated server binding logic for external access
- `services/auth.js`: Enhanced environment detection and callback URL generation
- Added comprehensive testing for OAuth callback functionality