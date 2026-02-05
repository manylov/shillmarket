# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ShillMarket** — agent-to-agent promotion exchange for X/Twitter with Solana escrow. Full product spec in `initial.md`.

## Hackathon

Colosseum Agent Hackathon. Deadline: **Feb 12, 2026 12:00 PM EST**.
- Hackathon API: `https://agents.colosseum.com/api`
- AgentWallet skill: `https://agentwallet.mcpay.tech/skill.md`
- Heartbeat: `https://colosseum.com/heartbeat.md`
- Solana dev skill: `https://solana.com/skill.md`
- Helius (RPC): `https://dashboard.helius.dev/agents`
- **`colosseum-skill.md`** — local copy of the official hackathon skill (v1.6.0). Read-only reference for hackathon API (registration, forum, projects, teams, voting, claims). Do not edit.

## Architecture

Monorepo with 3 main packages:

```
/programs/shillmarket/    — Solana program (Anchor/Rust)
/backend/                 — REST API server (Node.js, TypeScript, PostgreSQL, Redis, BullMQ)
/frontend/                — Public stats dashboard (Next.js)
/skill.md                 — ShillMarket MCP Skill for agent integration (our product)
/colosseum-skill.md       — Colosseum Hackathon skill (hackathon API reference, do not edit)
```

### Solana Program (`/programs/shillmarket/`)
Anchor-based escrow contract. PDAs:
- `[program, "escrow", order_id]` — EscrowAccount (funds locked per order)
- `[program, "treasury"]` — Platform fee treasury (optional, e.g. 3%)

Instructions (MVP): `create_escrow`, `release_escrow`, `refund_escrow`.

Client funds escrow directly when accepting an offer. In MVP, server authority settles (release/refund) based on off-chain verification; post‑MVP can move toward trust‑minimized settlement.

### Backend (`/backend/`)
Modules (MVP): auth, campaigns, offers, orders, escrow, verification (stats/UI are optional).

Background jobs (BullMQ):
- `verify-order` — checks tweet existence + requirements after `retention_window` via twitterapi.io

Profile parsing/pricing is post‑MVP (not required for the thin-slice demo).

### Frontend (`/frontend/`)
Next.js public dashboard. Leaderboard, platform stats, active campaigns.

## Key External Services

| Service | Purpose | Docs |
|---------|---------|------|
| twitterapi.io | Tweet verification, profile parsing | https://twitterapi.io/ |
| AgentWallet | Solana wallet for agent operations | `https://agentwallet.mcpay.tech/skill.md` |
| Helius | Solana RPC + WebSockets | `https://dashboard.helius.dev/agents` |

### twitterapi.io Reference

Context7 library IDs for documentation lookup:
- **Full API reference** (146 snippets): `/websites/twitterapi_io/api-reference`
- **MCP integration** (1052 snippets, best coverage): `/dorukardahan/twitterapi.io-mcp`
- **General docs** (138 snippets): `/websites/twitterapi_io`

Key endpoints we use:
- **Tweet lookup** — verify tweet exists and inspect author/content (15 credits = $0.00015 per tweet)
- **User profile** — get followers, bio, metrics (18 credits = $0.00018 per profile)
- **User tweets list** — recent tweets for engagement calc (150 credits/call + 15 credits/tweet)
- **Tweet search** — find verification tweets by code

Pricing: 1 USD = 100,000 credits. In MVP we mostly need tweet lookup + tweet search for verification.

When implementing twitterapi.io integration, query Context7 with library ID `/dorukardahan/twitterapi.io-mcp` for endpoint signatures and examples.

## Deployment

**Platform:** Railway (Railpack builder, NOT Nixpacks)
**Project:** `agents-tweets-exchange` (ID: `69c66093-6f31-407e-a5fb-4b57131786f5`) / workspace `manylovv` / environment `production`

### Live URLs

| Service | URL |
|---------|-----|
| Backend API | https://backend-production-63ce.up.railway.app |
| Frontend | https://frontend-production-143b.up.railway.app |
| Solana Program | `8GCsBLbmEhNigfHNjTL3SH3r7HUVjKczsu8aDoF5Tx73` (devnet) |
| GitHub | https://github.com/manylov/shillmarket |

### Railway CLI Commands

```bash
# Deploy backend (MUST use --path-as-root for subdirectory deploys)
railway up /path/to/backend --service backend --ci --path-as-root

# Deploy frontend
railway up /path/to/frontend --service frontend --ci --path-as-root

# View logs
railway logs --service backend

# Set env vars (use reference variables for DB/Redis)
railway variables --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" --service backend
```

### Railway Services (all deployed and online)

- `backend` — Node.js API server (Express 5, TypeScript, Prisma v7)
- `frontend` — Next.js dashboard
- `Postgres` — PostgreSQL database
- `Redis` — Redis for BullMQ job queue

### Critical Railway/Prisma Notes

1. **Railpack** (not Nixpacks): Railway uses Railpack builder. Config goes in `railway.json` at the service root.
2. **`--path-as-root`**: Required when deploying from a monorepo subdirectory. Without it, Railway uploads the entire repo and ignores `railway.json`.
3. **Prisma v7**: No `url` allowed in `schema.prisma` `datasource` block. The DB URL goes in `prisma.config.mjs`. At runtime, PrismaClient MUST use `@prisma/adapter-pg` driver adapter.
4. **BullMQ**: Worker connections require `maxRetriesPerRequest: null` on ioredis.
5. **Database deploy**: After `railway add --database postgres/redis`, you must click "Deploy database" in the Railway UI. The CLI does not auto-deploy databases.
6. **TypeScript in prod**: `typescript` and `@types/*` must be in `dependencies` (not devDependencies) because Railpack runs `npm ci --omit=dev`.
7. **Test exclusion**: `tsconfig.json` excludes `src/__tests__` so test files don't fail the production build.

## Language & Communication

Working language is Russian. Comments in code and git commits in English.

## Beads Workflow Rule

When closing a beads issue, **always review and update this CLAUDE.md** if the completed work introduced:
- New packages, services, or infrastructure
- Changed build/test/deploy commands
- New environment variables or configuration
- Architectural decisions that affect future work
- New external service integrations

If nothing material changed, no update needed. The goal is that any new Claude Code session can read this file and be productive immediately.
