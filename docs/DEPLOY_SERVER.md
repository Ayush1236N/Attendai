# Putting Attendai on a real server (so everyone — and Power BI — can reach it)

Goal: one public HTTPS address for the backend, e.g. `https://attendai-backend.onrender.com`.

## Path 1 — Render + MongoDB Atlas (no server to manage)
1. **Database:** mongodb.com/atlas → free cluster → Database Access: create a user/password →
   Network Access: allow `0.0.0.0/0` → Connect → copy the connection string
   (`mongodb+srv://USER:PASS@cluster.../attendance_system`).
2. **Code on GitHub:** `git init && git add . && git commit -m attendai`, create a GitHub repo, push.
3. **Render:** dashboard.render.com → New → **Blueprint** → pick the repo (it reads `render.yaml`
   and creates the face service, backend and web app). When asked, paste:
   `MONGO_URI`, `SMTP_HOST/SMTP_USER/SMTP_PASS`, and (for Power BI) `REPORTING_API_KEY`
   (+ `REPORTING_WRITE_KEY` only if you want write-back). `VITE_API_URL` = `https://<backend>.onrender.com/api`
   (redeploy the web service once after the backend URL exists).
4. **First admin (once):**
   `curl -X POST https://<backend>.onrender.com/api/auth/setup-first-admin -H "Content-Type: application/json" -d '{"name":"Admin","email":"you@example.com","password":"ChangeMe123"}'`
5. Open the web app URL → log in → add employees → register faces.
6. **Phones:** in `employee-app/.env` set `EXPO_PUBLIC_API_URL=https://<backend>.onrender.com/api`.

**Free-plan warnings (important):**
- Free Render services **sleep after ~15 min idle** — first request takes 30–60 s, the nightly warehouse job and
  Power BI scheduled refresh can miss/timeout. Use the paid "Starter" plan for the backend.
- The face service loads an AI model; the free 512 MB instance may run out of memory. Plan on a paid instance (≥1–2 GB).
- Atlas free tier (M0) is fine for small teams.

## Path 2 — One VPS with Docker (cheapest always-on, ~₹500–1000/month)
1. Rent a small Ubuntu server (2 GB RAM min; 4 GB comfortable): DigitalOcean, Hetzner, AWS Lightsail, etc.
2. Point a domain (or subdomain) A-record to its IP, e.g. `attendai.yourcompany.com`.
3. On the server: install Docker (`curl -fsSL https://get.docker.com | sh`), copy the project over (git clone / scp).
4. Create `.env` next to `docker-compose.yml` (JWT_SECRET, SMTP_*, REPORTING_API_KEY, `FRONTEND_URL=https://attendai.yourcompany.com`,
   `ALLOWED_ORIGINS=https://attendai.yourcompany.com`, `VITE_API_URL=https://attendai.yourcompany.com/api`).
5. `docker compose up --build -d`
6. HTTPS with Caddy (auto certificates). Install Caddy, then `/etc/caddy/Caddyfile`:
   ```
   attendai.yourcompany.com {
       handle /api/* { reverse_proxy localhost:5000 }
       handle /health { reverse_proxy localhost:5000 }
       handle { reverse_proxy localhost:8080 }
   }
   ```
   `sudo systemctl reload caddy`. Open ports 80 and 443 in the server firewall; do NOT expose 5000/8001/27017.
7. Create the first admin with the curl command (use `https://attendai.yourcompany.com/api/...`).
8. **Backups:** `docker exec attendance-mongo mongodump --archive=/data/db/backup.archive --db attendance_system` on a schedule
   (cron), copied off the server. A single server with no backups can lose everything.

## After deploying
- `https://<your-domain>/health` should say OK.
- Give the analyst: base URL `https://<your-domain>/api/bi/` and the `REPORTING_API_KEY` (docs/POWERBI.md).
- Set `ALLOWED_ORIGINS` to your web address (CORS), `FRONTEND_URL` to the same (reset-email links).
- The browser camera works because the site is HTTPS.
