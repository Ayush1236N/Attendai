# How to run Attendai

## Option A — Docker (easiest: database + face service + backend + web, all at once)
1. Install Docker Desktop.
2. In this folder create a file named `.env` (optional but recommended):
   ```
   JWT_SECRET=put-a-long-random-string-here
   SMTP_HOST=smtp.gmail.com
   SMTP_USER=you@gmail.com
   SMTP_PASS=your-google-app-password
   REPORTING_API_KEY=            # only for Power BI
   ```
3. `docker compose up --build`  (first build takes several minutes — the face service is large)
4. Open http://localhost:8080 (web app). Backend health check: http://localhost:5000/health
5. Create the first super admin (once):
   ```
   curl -X POST http://localhost:5000/api/auth/setup-first-admin -H "Content-Type: application/json" -d '{"name":"Admin","email":"you@example.com","password":"ChangeMe123"}'
   ```
6. Log in on the web app, go to Employees → add an employee → set their portal password → Register face.

## Option B — Without Docker (4 terminals)
1. MongoDB running locally (or a MongoDB Atlas URI in `backend/.env`).
2. Face service: `cd face-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000`
3. Backend: `cd backend && cp .env.example .env` (edit it) `&& npm install && npm run dev`
4. Web: `cd admin-dashboard && npm install && npm run dev` → http://localhost:5173
5. Create the first admin with the curl command above (port 5000).

## Mobile app (employee phone)
1. `cd employee-app && npm install`
2. Put your computer's LAN IP in `employee-app/.env`:  `EXPO_PUBLIC_API_URL=http://192.168.x.x:5000/api`
   (and add `http://192.168.x.x:19000` to `ALLOWED_ORIGINS` in the backend `.env`)
3. `npx expo start`, scan the QR with the Expo Go app (phone and computer on the same Wi-Fi).
4. Front-desk tablet without logins: same steps in `employee-app-kiosk/`.

## Tests
`cd backend && npm install && npm test`  (backend)  ·  `cd admin-dashboard && npm install && npm test`  (analytics helpers)

## Notes
- Browser camera needs https:// or localhost. On a LAN IP over http the web camera is blocked — use localhost, or deploy with HTTPS (see DEPLOYMENT.md).
- Face scan needs the employee's face registered first. The very first face-service start downloads/loads models and can be slow.
- Without SMTP settings, password-reset emails are only printed in the backend log.
- Power BI: see docs/POWERBI.md and docs/POWERBI_WRITEBACK.md.

## Login not working? Check in this order
1. Open http://localhost:5000/health — must say OK. If not, the backend isn't running (look at its terminal for the error; MongoDB must be running too).
2. The login page now prints the exact reason under the form (cannot reach server / wrong password / too many attempts / server error) and shows which server URL it is using.
3. See which admins exist:           `cd backend && node scripts/reset-admin.js --list`
4. No admin, or forgot the password:  `node scripts/reset-admin.js you@example.com NewPassword123`
   Lost your authenticator:           add `--disable-2fa`
   (With Docker: `docker compose exec backend node scripts/reset-admin.js --list`)
5. Web app on a different address/port than 5173 (or 8080 in Docker)? Add it to `ALLOWED_ORIGINS` in backend/.env and restart the backend.
