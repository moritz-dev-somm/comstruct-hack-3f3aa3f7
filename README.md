# comstruct-hack

Procurement assistant for construction teams, built with TanStack Start + Vite, Supabase, and AI-powered workflows (catalog import, chat/search, scan, and supplier agent flows).

## Tech stack

- **Frontend/SSR:** TanStack Start, React, Vite
- **Runtime target:** Cloudflare Workers (`wrangler.jsonc`)
- **Database/Auth:** Supabase
- **AI integrations:** OpenAI (required), AgentMail (supplier agent features)

---

## Prerequisites

- Node.js 20+
- npm (or Bun)
- Supabase project
- Cloudflare account (for Workers deployment)
- OpenAI API key
- AgentMail API key (only required if you use supplier-email automation)

---

## Environment variables

Set these for local/dev and in your deployment secrets.

### Required

| Variable | Used for |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access |
| `OPENAI_API_KEY` | Chat, scan, import/enrichment AI features |

### Optional / feature-specific

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Client-side Supabase URL override |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client-side Supabase key override |
| `AGENTMAIL_API_KEY` | Supplier inbox/webhook automation |
| `PUBLIC_APP_URL` | Public base URL for AgentMail webhook registration |
| `LOVABLE_API_KEY` | Product image generation script (`scripts_gen_product_images.mjs`) |

> Tip: keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never expose it in client bundles.

---

## Local setup

1. **Install dependencies**

```bash
npm install
```

(Or `bun install`)

2. **Create local env file**

```bash
cp .env.example .env
```

Then fill in the variables listed above.

3. **Run the app**

```bash
npm run dev
```

---

## Database setup (Supabase)

This repository includes SQL migrations in `supabase/migrations`.

1. Install Supabase CLI.
2. Link your project:

```bash
supabase link --project-ref vyibmhaoxfmnbooyoapx
```

3. Apply migrations:

```bash
supabase db push
```

If you are deploying to a different Supabase project, use its project ref in the `supabase link` command.

---

## Deploy to Cloudflare Workers

This app is configured for Workers via `wrangler.jsonc` (`main: src/server.ts`).

1. **Authenticate Wrangler**

```bash
npx wrangler login
```

2. **Set production secrets**

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENAI_API_KEY
```

If using supplier automation:

```bash
npx wrangler secret put AGENTMAIL_API_KEY
npx wrangler secret put PUBLIC_APP_URL
```

3. **Deploy**

```bash
npx wrangler deploy
```

4. **Verify runtime**
- Open the deployed URL
- Confirm login/auth and Supabase reads/writes work
- Test `/api/chat`
- If using supplier flows, trigger agent inbox setup and verify webhook endpoint: `/api/public/agentmail/webhook`

---

## Optional: Lovable deployment

If deploying via Lovable Cloud instead of direct Workers deployment, set the same env vars in Lovable project settings. The app code uses these exact variable names.

---

## Useful scripts

```bash
npm run dev      # local dev
npm run build    # production build
npm run preview  # preview build locally
npm run lint     # lint
npm run format   # prettier
```

---

## Notes

- Supplier-agent features depend on both **AgentMail** and **OpenAI**.
- Several scripts in the repo (`scripts/*.mjs`, `scripts_gen_product_images*.mjs`) also rely on the same Supabase/OpenAI env setup.
- If deployment succeeds but API routes fail, first re-check missing Worker secrets.
