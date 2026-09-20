# Unity Text Thing

## Vercel environment variables

Set these in Vercel -> Project -> Settings -> Environment Variables:

- `SITE_PASSWORD` = the password visitors must enter
- `SITE_AUTH_SECRET` = a long random secret used to sign login sessions
- `DISCORD_WEBHOOK_URL` = your Discord webhook URL (optional; only needed for login/action notifications)

After changing environment variables, redeploy the project.

## Login flow

1. `/` is protected by `middleware.js`.
2. Users without a valid `site_auth` cookie are redirected to `/login.html`.
3. `/api/login` checks the password and VPN/proxy status, then creates a signed 24-hour HttpOnly session cookie.
4. `/api/notify` requires a valid session, so it cannot be called anonymously.
5. `/api/logout` clears the session.
