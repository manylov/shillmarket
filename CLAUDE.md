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

**Platform:** Railway
**Project:** `agents-tweets-exchange` / workspace `manylovv` / environment `production`

The project is already linked (`railway link` done). Use `railway` CLI for all deployments:

```bash
railway up                          # deploy current directory
railway up --service backend        # deploy specific service
railway logs --service backend      # view logs
railway variables --set KEY=VALUE   # set env variables
railway status                      # check deployment status
```

Railway services to create:
- `backend` — Node.js API server
- `frontend` — Next.js dashboard
- `postgres` — PostgreSQL (Railway plugin)
- `redis` — Redis (Railway plugin)

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
