# Supabase OAuth Server

A React app that serves as the OAuth authorization server UI for Supabase. It provides a login page and an OAuth consent screen for third-party apps requesting access to user accounts.

## Features

- **Login page** — authenticates users via Supabase email/password before the OAuth flow
- **OAuth consent screen** — displays the requesting client's name, redirect URI, and requested scopes, then lets the user approve or deny the authorization

## Routes

| Path | Description |
|------|-------------|
| `/login` | Email/password sign-in form |
| `/oauth/consent?authorization_id=<id>` | OAuth consent page; redirects to `/login` if unauthenticated |

## Tech Stack

- React 19 + TypeScript
- Vite
- React Router v7
- Supabase JS SDK v2

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
