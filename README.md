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
3. `/api/login` checks the password, then creates a signed 24-hour HttpOnly session cookie.
4. `/api/notify` requires a valid session, so it cannot be called anonymously.
5. `/api/logout` clears the session.

## Firebase paths

- `text.json` — command channel (messages, EVENT:, TEXT:)
- `active.json` — array of currently active GameObject paths (written by Unity)
- `targets.json` — list of text target names (written by Unity on start)

## Website controls

- **Send Message** — types + TTS on the selected text target (default = main uiText)
- **Send Event** — turns GameObjects on (`path`, `a,b`, `+a,-b`)
- **Clear** — clears text and turns tracked objects off
- **Active objects** — live list from Unity; click **Off** to send `EVENT:-path`

## Unity setup

1. Put `LiveText.cs` on a GameObject.
2. Assign the main `uiText` TextMesh.
3. Optionally fill **Extra Targets** with named TextMeshes so the website dropdown can target them.
4. Make sure those GameObjects start disabled if you only want them on via events.
