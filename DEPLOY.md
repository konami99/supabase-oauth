# Deploying to GitHub Pages

This project deploys automatically to GitHub Pages via GitHub Actions on every push to `main`.

**Live URL:** https://konami99.github.io/supabase-oauth/

## How it works

The workflow in `.github/workflows/deploy.yml` runs two jobs:

1. **build** — installs dependencies, runs `npm run build`, and uploads the `dist/` folder as a Pages artifact using `actions/upload-pages-artifact`
2. **deploy** — takes the artifact and publishes it using `actions/deploy-pages`

Vite is configured with `base: '/supabase-oauth/'` so all asset paths are relative to the correct subpath.

## One-time setup

### 1. Enable GitHub Pages

In your repository: **Settings → Pages → Source**, select **GitHub Actions**.

### 2. Add repository secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

### 3. Add the Pages redirect URL to Supabase

In your Supabase project: **Authentication → URL Configuration → Redirect URLs**, add:

```
https://konami99.github.io/supabase-oauth/
```

This is required for OAuth to redirect back to your app after login.

## Manual trigger

You can also trigger a deployment manually from the **Actions** tab by selecting the **Deploy to GitHub Pages** workflow and clicking **Run workflow**.
