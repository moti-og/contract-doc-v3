# Render.com Deployment Guide

This guide covers deploying the Contract Doc v3 application to Render.com's free tier for prototype/demo purposes.

## Overview

The application consists of three services that will be deployed to Render:

1. **Main Server** - Express.js API server serving frontend, API endpoints, and static assets
2. **Collab Server** - Hocuspocus WebSocket server for real-time collaborative editing
3. **Add-in Static Site** - Static assets for the Word add-in (Office.js)

## Prerequisites

- GitHub repository with your code
- Render.com account (free signup at https://render.com)
- Node.js 18+ (specified in package.json engines)

## Deployment Steps

### 1. Prepare Your Repository

Ensure your repository has the following files (already created):

- `render.yaml` - Render service configuration
- `package.json` - Root package with cross-platform scripts
- Updated server files with dynamic port configuration

### 2. Connect to Render.com

1. **Sign up/Login** to Render.com
2. **Connect GitHub** - Link your GitHub account
3. **Import Repository** - Select your contract-doc-v3 repository

### 3. Configure Services

Render will automatically detect the `render.yaml` file and create three services:

#### Main Server (contract-doc-server)

- **Type:** Web Service
- **Build Command:** `cd server && npm ci`
- **Start Command:** `cd server && node src/server.js`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `LLM_PROVIDER=ollama`
  - `OLLAMA_MODEL=gemma3:1b`
  - `OLLAMA_BASE_URL=http://localhost:11434`
  - `ALLOW_HTTP=true`

#### Collab Server (contract-doc-collab)

- **Type:** Web Service
- **Build Command:** `cd collab && npm ci`
- **Start Command:** `cd collab && node server.js`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `SUPERDOC_PORT=4100`

#### Add-in Static Site (contract-doc-addin)

- **Type:** Static Site
- **Build Command:** `cd addin && npm ci && npm run build`
- **Publish Directory:** `addin/dist`

### 4. Set Up Service Dependencies

The main server needs to know the URL of the collab server:

1. **Deploy the collab server first** - Note its URL (e.g., `https://contract-doc-collab.onrender.com`)
2. **Update main server environment variable:**
   - `SUPERDOC_BASE_URL=https://contract-doc-collab.onrender.com`

### 5. Deploy

1. **Push to GitHub** - Any push to your main branch triggers automatic deployment
2. **Monitor Logs** - Check the Render dashboard for deployment progress
3. **Test Services** - Verify all three services are running

## Service URLs

After deployment, you'll get URLs like:

- **Main Server:** `https://contract-doc-server.onrender.com`
- **Collab Server:** `https://contract-doc-collab.onrender.com`
- **Add-in Assets:** `https://contract-doc-addin.onrender.com`

## Important Notes

### Free Tier Limitations

- **Cold Starts:** Services spin down after 15 minutes of inactivity
- **Startup Time:** First request after inactivity takes 30-60 seconds
- **Perfect for demos** - Just warn users about the initial load time

### File Storage

- **Ephemeral Storage:** Files are lost on service restart
- **Demo-appropriate:** Perfect for prototypes and demonstrations
- **No persistence:** Don't rely on file storage for production data

### HTTPS

- **Automatic HTTPS:** Render provides SSL certificates
- **No configuration needed:** HTTPS works out of the box
- **Mixed content:** Services can communicate over HTTPS

## Development vs Production

### Local Development

```bash
# Use PowerShell scripts (Windows)
./tools/scripts/servers.ps1 -Action start

# OR use npm scripts (cross-platform)
npm run dev
```

### Production Deployment

- **Automatic:** Git push → Render deployment
- **Environment-aware:** URLs adapt to production environment
- **No manual steps:** Everything configured via `render.yaml`

## Troubleshooting

### Common Issues

1. **Service won't start:**

   - Check logs in Render dashboard
   - Verify Node.js version (18+)
   - Ensure all dependencies install correctly

2. **Collab connection fails:**

   - Verify `SUPERDOC_BASE_URL` environment variable
   - Check that collab server is running
   - Ensure WebSocket connections are allowed

3. **Cold start timeout:**
   - Normal for free tier
   - Wait 30-60 seconds for first request
   - Consider upgrading to paid plan for production

### Debug Commands

```bash
# Check service status locally
npm run status

# Test individual services
npm run dev:server
npm run dev:collab
npm run dev:addin
```

### Logs and Monitoring

- **Render Dashboard:** View real-time logs
- **Service Health:** Check service status
- **Environment Variables:** Verify configuration

## Environment Variables Reference

### Main Server

| Variable            | Default       | Description                       |
| ------------------- | ------------- | --------------------------------- |
| `NODE_ENV`          | `production`  | Environment mode                  |
| `LLM_PROVIDER`      | `ollama`      | LLM service provider              |
| `OLLAMA_MODEL`      | `gemma3:1b`   | Model to use                      |
| `SUPERDOC_BASE_URL` | Auto-detected | Collab server URL                 |
| `ALLOW_HTTP`        | `true`        | Allow HTTP (Render handles HTTPS) |

### Collab Server

| Variable        | Default      | Description      |
| --------------- | ------------ | ---------------- |
| `NODE_ENV`      | `production` | Environment mode |
| `SUPERDOC_PORT` | `4100`       | Server port      |

## Next Steps

1. **Test the deployment** - Verify all services work
2. **Share URLs** - Provide demo links to stakeholders
3. **Monitor usage** - Check Render dashboard for performance
4. **Consider upgrades** - Move to paid plan for production use

## Support

- **Render Documentation:** https://render.com/docs
- **Service Logs:** Available in Render dashboard
- **GitHub Issues:** Report deployment issues in your repository

---

_This deployment is optimized for prototype/demo use. For production workloads, consider upgrading to Render's paid plans or alternative platforms._
