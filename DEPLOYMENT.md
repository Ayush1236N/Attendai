# Running & Deploying Attendai

Your project has **4 separate pieces**, and that matters for deployment:

| Piece | What it is | Needs a server? |
|---|---|---|
| `backend/` | Node/Express API | Yes — always running |
| `face-service/` | Python/FastAPI AI service | Yes — always running |
| `admin-dashboard/` | React web app | No — just static files after build |
| `employee-app/` | React Native/Expo mobile app | No — installed on a phone |

Because of that mix, no single platform is the right home for all four. Below
is what actually works for each, plus the exact commands.

---

## 1. Run it locally (no Docker)

Same as the project's own `docs/DOCUMENTATION.md` Section 17. You need
Node 18+, Python 3.10+, and MongoDB.

```bash
# 1) MongoDB running locally, or a MongoDB Atlas URI

# 2) Face service
cd face-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3) Backend (new terminal)
cd backend
cp .env.example .env      # edit MONGO_URI / JWT_SECRET if needed
npm install
npm run dev

# 4) Admin dashboard (new terminal)
cd admin-dashboard
npm install
npm run dev                # opens on http://localhost:5173

# 5) Employee mobile app (new terminal)
cd employee-app
cp .env.example .env       # set EXPO_PUBLIC_API_URL to your PC's LAN IP
npm install
npx expo start             # scan the QR code with Expo Go on your phone
```

I changed `employee-app/api/client.js` so the backend URL is no longer
hardcoded — it now reads `EXPO_PUBLIC_API_URL` (falls back to a placeholder
IP if unset). Find your PC's LAN IP with `ipconfig` (Windows) or
`ifconfig`/`ip addr` (Mac/Linux) and put it in `employee-app/.env`.

---

## 2. Run it with Docker (recommended — one command, everywhere)

I added a `Dockerfile` for each service plus a root `docker-compose.yml`
that also spins up MongoDB for you, so nothing extra needs installing.

```bash
cp .env.example .env       # edit JWT_SECRET etc. if you want
docker compose up --build
```

This starts:
- **MongoDB** → internal only (`mongo:27017`)
- **face-service** → http://localhost:8000/docs
- **backend** → http://localhost:5000/health
- **admin-dashboard** → http://localhost:8080 (built and served via nginx)

Create your first admin account (same as before, just once):
```bash
curl -X POST http://localhost:5000/api/auth/setup-first-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"changeme123"}'
```

**To run this "anywhere"** (a cloud VPS, Render, Railway, Fly.io, a home
server, etc.): install Docker on that machine, copy this repo over, and run
the same `docker compose up --build -d`. That's the whole point of
containerizing it — the exact same command works on your laptop or on a
$5/month VPS.

**For the employee app to reach a Dockerized backend**, point
`EXPO_PUBLIC_API_URL` at that machine's IP/domain, e.g.
`http://192.168.1.10:5000/api` on your LAN, or `https://yourdomain.com/api`
once it's on the internet.

---

## 3. Deploying to the actual internet (so it's reachable from any phone,
not just your Wi-Fi)

**Important:** Vercel is built for static sites and short-lived serverless
functions. It's a great fit for the **admin dashboard**, but a poor fit for
the **backend** (a long-running Express server with a persistent MongoDB
connection) and the **face-service** (FastAPI + OpenCV — too heavy for a
serverless function and it'll hit cold-start/timeout issues). I didn't want
to hand you a setup that looks like it deploys but breaks under real use.

What I'd actually do:

### Admin dashboard → Vercel (this part fits great)
```bash
cd admin-dashboard
npx vercel
```
I added `admin-dashboard/vercel.json` so client-side routing works. In the
Vercel project settings, add an environment variable:
```
VITE_API_URL = https://your-backend-domain.com/api
```
Redeploy after adding it (Vite bakes env vars in at build time).

### Backend + face-service → any Docker host
Since you already have Dockerfiles and a compose file, the easiest options,
roughly cheapest/simplest to most control:
- **Railway** or **Render**: point them at `backend/` and `face-service/` as
  two separate services (they build straight from your Dockerfiles). Add a
  managed MongoDB (Railway/Render both offer one, or use MongoDB Atlas's free
  tier).
- **Fly.io**: `fly launch` inside each of `backend/` and `face-service/`.
- **Any VPS** (DigitalOcean, Hetzner, AWS Lightsail): install Docker, copy
  the repo, run `docker compose up -d`, put a reverse proxy (nginx/Caddy) in
  front for HTTPS.

Whichever you pick, once the backend has a public HTTPS URL:
- Update the admin dashboard's `VITE_API_URL` (Vercel env var) to point at it.
- Update `employee-app/.env`'s `EXPO_PUBLIC_API_URL` to point at it.
- Update the backend's `ALLOWED_ORIGINS` to include your Vercel domain.

### Employee app → build a real installable app, or run it as a website too
The mobile app currently targets Android via Expo. Two paths:
- **Installable app**: `npx eas build -p android` (needs a free Expo/EAS
  account) produces a real `.apk`/`.aab` you can install on any Android
  phone, no Expo Go required.
- **Also usable from a browser**: Expo supports exporting to web
  (`npx expo export -p web`), but this app uses `expo-camera`, which behaves
  differently in a browser than on native — worth testing before relying on
  it. If you want a genuine mobile *and* web experience from one codebase,
  that's the direction, just budget time to verify the camera flow on web.

---

## 4. New: Employee self-service portal (login, not just face check-in)

The original app only had face-based check-in/out for employees (no
password) and a separate admin login. I added a second, independent login
system on top of that — a web portal where employees log in with an
**Employee ID + password** to see their own attendance and who else is
present.

**How it works:**
- Face check-in/out is unchanged — still password-free.
- An admin sets a portal password for an employee from **Employee Detail →
  "Employee portal login"** in the admin dashboard. This is separate from
  face registration.
- The employee then goes to the same login page as admins
  (`http://localhost:8080` or wherever the dashboard is hosted), picks the
  **Employee** tab, and signs in with their Employee ID + that password.
- On login they see a "Welcome, {name}!" banner; on logout, "See you
  tomorrow, {name}!" before being signed out.
- Their portal shows: total days present, their own attendance history, and
  a live table of everyone currently checked in today (name, department,
  check-in/out time).

**What's new under the hood** (if you want to review or extend it):
- `backend/src/models/Employee.js` — added an optional hashed `password`
  field, separate from face data.
- `backend/src/controllers/authController.js` — new `employeeLogin`.
- `backend/src/middleware/employeeAuthMiddleware.js` — new, guards
  employee-only routes.
- `backend/src/services/attendanceService.js` — new `myHistory` and
  `presentTodayWithNames` (joins Attendance with Employee to attach names).
- `backend/src/controllers/employeeController.js` — new `setCredentials`
  admin action, routed at `PUT /api/employees/:id/credentials`.
- `admin-dashboard/src/pages/Login.jsx` — now has Admin/Employee tabs.
- `admin-dashboard/src/pages/EmployeeLayout.jsx` and `EmployeeDashboard.jsx`
  — new, the portal itself.
- `admin-dashboard/src/api/employeeClient.js` — new, uses its own token
  (`employee_token`) so an admin and an employee can even be logged in on
  the same browser without colliding.

I verified the full backend module graph loads without errors and the
admin-dashboard builds cleanly (101 modules) with these changes included. I
could not test the actual login → greeting → attendance flow end-to-end
against a live MongoDB in this environment — run through it yourself as
your first test, same caveat as the rest of this project.



1. **`employee-app/api/client.js`** — was a hardcoded LAN IP
   (`192.168.68.108`) that only worked on your original network. Now reads
   `EXPO_PUBLIC_API_URL` from the environment, with that same IP as a
   fallback default. Set it per-environment instead of editing the file.
2. Added `backend/Dockerfile`, `face-service/Dockerfile`,
   `admin-dashboard/Dockerfile` + `nginx.conf`.
3. Added root `docker-compose.yml` wiring all four containers (incl. Mongo)
   together with sensible defaults.
4. Added `.dockerignore` files so `node_modules`/`venv` don't get copied into
   images.
5. Added `admin-dashboard/vercel.json` for clean SPA routing on Vercel.
6. Added `.env.example` files at the root and in `employee-app/`.

I verified `npm install` (backend + admin-dashboard), `vite build`
(admin-dashboard), and `pip install` + a live boot of `face-service` all
succeed. I could not verify against a real MongoDB instance or a physical
Android device in this environment — same limitation the project's own docs
already flag — so test the check-in/check-out flow end-to-end yourself
before relying on it.
