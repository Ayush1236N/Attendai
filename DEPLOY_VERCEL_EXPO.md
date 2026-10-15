# Deploying Attendai — Admin Dashboard on Vercel + Mobile App on Expo

This guide covers exactly two pieces: the **admin-dashboard** (Vercel) and
the **employee-app** (Expo). It assumes your **backend** and **face-service**
are already hosted somewhere that can run a persistent server (Render,
Railway, a VPS, etc — see `render.yaml` at the repo root for a one-click
Render setup). Vercel can't run those two — it's serverless/static hosting
only, which is exactly what the dashboard needs but not what an Express API
or a Python face-recognition service needs.

---

## Part 1 — Admin dashboard on Vercel

The repo already has `admin-dashboard/vercel.json` configured (build command,
output directory, and the SPA rewrite rule React Router needs), so this is
mostly clicking through Vercel's UI.

### 1. Push to GitHub
Vercel deploys from Git, not from a zip upload.
```bash
git init && git add . && git commit -m "attendai"
git remote add origin https://github.com/<you>/attendai.git
git push -u origin main
```

### 2. Import the project
1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import your repo
3. **Root Directory**: set to `admin-dashboard` (important — this repo has
   multiple apps in it, Vercel needs to know which one)
4. Framework Preset: Vite should be auto-detected

### 3. Environment variable
Add one build-time env var:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://your-backend-host.com/api` |

(This gets baked into the JS bundle at build time — if you change it later,
you must **redeploy**, not just restart.)

### 4. Deploy
Click **Deploy**. You'll get a URL like `https://attendai.vercel.app`.

### 5. Point your backend back at it
Go to wherever your backend is hosted and set/update:
- `FRONTEND_URL=https://attendai.vercel.app` (used to build password-reset email links)
- `ALLOWED_ORIGINS=https://attendai.vercel.app` (CORS — without this, the dashboard's API calls will be blocked by the browser)

Redeploy the backend after changing these.

### 6. Custom domain (optional)
Vercel → your project → **Settings → Domains** → add your domain, follow the
DNS instructions it gives you (usually a CNAME record).

### Updating the dashboard later
Just `git push` to your main branch — Vercel redeploys automatically. Manual
redeploy: Vercel dashboard → your project → **Deployments** → **Redeploy**.

---

## Part 2 — Mobile app(s) on Expo

There are now **two separate Expo projects**, each built and deployed
independently — follow the same steps for whichever one(s) you need:

- **`employee-app/`** ("Attendai") — the personal app employees install on
  their own phones (login, check-in/out, leave, account settings)
- **`employee-app-kiosk/`** ("Attendai Kiosk") — the no-login app for a
  shared front-desk device (just face scan + greeting)

You don't need both — install just `employee-app` if every employee has
their own phone, just `employee-app-kiosk` if you only want a shared device,
or both if you want to support either.

The employee app (`employee-app/`) is an Expo/React Native app. There are two
very different things people mean by "deploy" here — pick based on your
situation:

### Option A — Just want employees to use it now (fastest, no app store)

Good for internal tools / testing with a small team.

1. Point the app at your live backend:
   ```bash
   cd employee-app
   echo "EXPO_PUBLIC_API_URL=https://your-backend-host.com/api" > .env
   ```
2. Install the **Expo Go** app on your phone (App Store / Play Store)
3. Run:
   ```bash
   npx expo start
   ```
4. Scan the QR code shown in the terminal with Expo Go (Android: Expo Go's
   scanner; iOS: the Camera app, then tap the notification)
5. Share the same QR code / a `npx expo start --tunnel` link with other
   employees so they can open it in their own Expo Go app

This requires Expo Go to stay installed and your `expo start` process to
keep running (or use `--tunnel` so it works over the internet, not just your
local network). It's the quickest way to get everyone testing, but not a
real "installed app."

### Option B — Real installable app (EAS Build), for app stores or internal distribution

This produces an actual `.apk`/`.aab` (Android) or `.ipa` (iOS) that installs
like a normal app — no Expo Go required.

1. Install the EAS CLI and log in (free Expo account):
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. From `employee-app/`, configure the project:
   ```bash
   cd employee-app
   eas build:configure
   ```
   This creates an `eas.json` and links the project to your Expo account.
3. Set the production API URL as a build-time env var. Easiest way — add it
   to `eas.json` under your build profile:
   ```json
   {
     "build": {
       "production": {
         "env": {
           "EXPO_PUBLIC_API_URL": "https://your-backend-host.com/api"
         }
       }
     }
   }
   ```
4. Build:
   ```bash
   eas build --platform android --profile production
   # or: eas build --platform ios --profile production   (needs an Apple Developer account, $99/yr)
   ```
5. EAS builds in the cloud (free tier available) and gives you a download
   link when done, or a QR code to install directly on a test device.

**Internal distribution (skip the app stores entirely):**
```bash
eas build --platform android --profile preview
```
Share the resulting `.apk` link directly with employees — no Play Store
review needed. (iOS internal distribution needs either TestFlight or an
Apple Enterprise account — Apple doesn't allow direct `.ipa` installs the
way Android does.)

**Publishing to the app stores:**
```bash
eas submit --platform android   # needs a Google Play Developer account, $25 one-time
eas submit --platform ios       # needs an Apple Developer account, $99/yr
```
Follow the prompts — `eas submit` walks you through connecting your
developer accounts.

### Updating the app later (OTA — no re-install needed)

For JS-only changes (not native code changes), you can push updates instantly
without going through app store review:
```bash
eas update --branch production
```
Users get the update next time they open the app — no reinstall.

---

## Quick reference

| Piece | Host | One-time setup | Redeploy on change |
|---|---|---|---|
| `admin-dashboard` | Vercel | Import repo, set `VITE_API_URL`, deploy | `git push` (auto) |
| `backend` + `face-service` | Render (see `render.yaml`) or similar | See `WHATS_NEW.md` / render.yaml comments | `git push` (auto, if autoDeploy on) |
| `employee-app` | Expo Go (testing) or EAS Build (real app) | `eas build:configure` | `eas update` (JS changes) or new `eas build` (native changes) |
| MongoDB | Atlas | Create cluster, get `MONGO_URI` | N/A (it's a database) |

If you only remember one thing: **Vercel hosts the dashboard's static files,
Render hosts the actual servers, Expo/EAS builds the mobile app** — three
different jobs, three different tools.
