# MedResearch AI WebApp

A deployable Next.js web app for AI-assisted clinical research document generation.

## Features

- Next.js App Router frontend
- Supabase email auth
- Free quota: 3 generations
- DeepSeek-powered document generation
- Stripe Checkout upgrade flow
- Pro quota: 100 generations
- Generation quota enforcement
- Supabase database schema

## Getting Started

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000.

## Required Environment Variables

```txt
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_PRO=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Database

Run `supabase/schema.sql` in the Supabase SQL Editor.

## Important Security Notes

Never expose these values in frontend code:

- DEEPSEEK_API_KEY
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_SECRET_KEY

Only variables prefixed with `NEXT_PUBLIC_` are intended for browser use.
