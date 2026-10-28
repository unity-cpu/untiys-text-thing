# Unity Text Thing

## Change text on different GameObjects

1. On the website, type the **GameObject name** (or path like `Parent/Child`).
2. Type your **message**.
3. Click **Send Message**.

Unity finds that object and sets text on its TextMesh, TextMeshPro, or UI Text.

Leave the name empty to use the default `uiText`.

## Events (turn objects on/off)

- Send Event with `MyObject` or `A,B` or `+A,-B`
- Active objects list shows what’s on — click **Off** to disable

## Unity setup

1. Add `LiveText.cs` to a GameObject.
2. Assign the main `uiText` TextMesh (default target).
3. Play — script polls Firebase and publishes the active list.

## Firebase

- `text.json` — commands (messages, `TEXT:name|msg`, `EVENT:...`)
- `active.json` — list of active event objects (written by Unity)

## Vercel env vars

- `SITE_PASSWORD`
- `SITE_AUTH_SECRET`
- `DISCORD_WEBHOOK_URL` (optional)
