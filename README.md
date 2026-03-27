# VETRAN
### Trust infrastructure for AI agents.

> OAuth was built for humans. Vetran was built for agents.

---

## What It Does

When AI agents operate autonomously, you need to know who's cleared. Vetran is the identity and trust layer that:

- **Registers** agents with signed JWT identity tokens
- **Verifies** identity and capability clearance in <100ms
- **Delegates** trust across agent chains with scoped permissions
- **Revokes** agents instantly — blacklisted across the entire system

---

## Quick Start

```bash
git clone https://github.com/your-org/vetran
cd vetran
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
node src/server.js
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Health check |
| `POST` | `/register` | Register a new agent |
| `POST` | `/verify` | Verify agent identity + clearance |
| `POST` | `/delegate` | Issue scoped trust delegation |
| `GET`  | `/status/:agentId` | Get agent standing |
| `POST` | `/revoke/:agentId` | Instantly revoke an agent |

---

## Example Usage

### Register an agent
```bash
curl -X POST https://vetran.dev/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SchedulerAgent",
    "owner": "acme-corp",
    "capabilities": ["read:calendar", "write:calendar"],
    "model": "claude-sonnet-4"
  }'
```

### Verify before execution
```bash
curl -X POST https://vetran.dev/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<agent-jwt>",
    "requestedCapabilities": ["read:calendar"]
  }'
```

### Revoke immediately
```bash
curl -X POST https://vetran.dev/revoke/agt_7e2998e8e116 \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Compromised credentials" }'
```

---

## CLI

```bash
npm install -g @vetran/cli

vran ping                                    # Check registry health
vran register --name "MyAgent" --owner "me"  # Register an agent
vran verify <agentId>                        # Verify + clearance check
vran revoke <agentId> --reason "..."         # Revoke instantly
vran status <agentId>                        # Get agent standing
```

---

## Deploy to Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **Postgres** plugin — Railway auto-injects `DATABASE_URL`
4. Set environment variables:
   ```
   JWT_SECRET=<your-long-random-secret>
   NODE_ENV=production
   ```
5. Deploy — Vetran auto-runs the schema migration on first boot

That's it. Your registry is live at `https://your-app.railway.app`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (prod) | Postgres connection string |
| `JWT_SECRET` | Yes | Secret for signing identity tokens |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` enables SSL for DB |

---

## Agent Badges

| Badge | Condition |
|-------|-----------|
| `ROOKIE` | Default — newly registered |
| `ACTIVE` | 10+ successful verifications |
| `ELITE`  | 100+ verifications, 30+ days active |

---

## Tech Stack

- **Node.js + Express** — API server
- **PostgreSQL** — Persistent agent registry + audit log
- **JWT (HS256)** — Signed identity tokens
- **Railway** — Hosting + managed Postgres

---

## License

MIT
