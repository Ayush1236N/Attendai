# Changing your admin email & password

Two ways to do this: from inside the dashboard (fastest), or via the API
directly. Both work for any account — `super_admin`, `admin`, or
`data_analyst`.

## From the dashboard (recommended)

1. Log in at your admin dashboard URL.
2. Click **Security** in the sidebar (data analysts see this as **My Account**).
3. Under **Change email**: enter your new email + your *current* password → **Update email**.
4. Under **Change password**: enter your current password + a new one (6+ characters) → **Update password**.

That's it — your login credentials are updated immediately, live in the database.

**Note:** changing your password automatically logs out every *other* device
signed in as you (the device you're using stays signed in). This is a
safety measure in case the old password had been compromised.

## Forgot your password entirely (can't log in at all)

Use the **Forgot your password?** link on the login screen instead — it emails
you a reset link. See `WHATS_NEW.md` → "Employees can add their own email +
reset their password by email" for how that flow is configured (SMTP setup).

## Directly via the API

If you're scripting this or the dashboard isn't available:

```bash
# 1. Log in to get a token
curl -X POST https://your-backend-url/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"old@example.com","password":"your-current-password"}'
# -> { "token": "...", "admin": {...} }

# 2. Change email
curl -X PUT https://your-backend-url/api/auth/me/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token from step 1>" \
  -d '{"newEmail":"new@example.com","currentPassword":"your-current-password"}'

# 3. Change password
curl -X PUT https://your-backend-url/api/auth/me/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token from step 1>" \
  -d '{"currentPassword":"your-current-password","newPassword":"a-new-stronger-password"}'
```

## Very first admin account / lost every password

If no admin account can log in at all (e.g. fresh install), the backend has
a one-time bootstrap endpoint that only works while **zero** admin accounts
exist in the database:

```bash
curl -X POST https://your-backend-url/api/auth/setup-first-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@example.com","password":"choose-a-password"}'
```

This creates a `super_admin` account. It refuses to run again once any admin
exists (`403 An admin already exists`) — that's intentional, so it can't be
used to hijack a live system. If you're truly locked out of an existing
install, a super_admin has to reset your password (Team page → not directly
supported for resetting *others'* passwords currently — the cleanest path is
updating `passwordHash` directly in MongoDB, or deleting the account and
re-inviting via the Team page if it's not the last super_admin).
