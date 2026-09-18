# untiys text thing

Password-protected site. Password lives **only** in Vercel env vars.

## How it works

1. Visit any page → redirected to `/login.html`
2. Enter password → checked by `/api/login` against `SITE_PASSWORD`
3. On success a secure cookie is set → you can use the app
4. Cookie lasts 24 hours

## Setup (do all steps)

### 1. Deploy the whole folder
Must include:
- `index.html` (the app)
- `login.html` (password form)
- `middleware.js` (redirects if not logged in)
- `api/login.js` (checks password)
- `vercel.json`
- `package.json`

```bash
cd untiys-text-thing
npx vercel
```

### 2. Add environment variable
Vercel dashboard → your project → **Settings → Environment Variables**

| Name            | Value            | Environments                    |
|-----------------|------------------|---------------------------------|
| `SITE_PASSWORD` | your-real-pass   | Production, Preview, Development |

### 3. Redeploy
Deployments → ⋯ → **Redeploy**

Env vars only apply after a new deploy.

### 4. Test
Open the site (preferably Incognito). You should land on the purple **LOCKED** page and must enter the password.

## Change password later
Edit `SITE_PASSWORD` in Vercel → Redeploy. No code changes.
