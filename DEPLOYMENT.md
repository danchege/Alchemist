# Alchemist – Production Deployment (Render + Vercel)

Yes, this project can run in production using **Render** (backend or full app) and **Vercel** (frontend only). Two setups are supported.

---

## Option 1: Single deploy on Render (simplest)

One service serves both the Flask API and the static frontend. No CORS or API URL config.

### Steps

1. **Push your repo to GitHub** (if not already).

2. **Create a Web Service on Render**
   - Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**.
   - Connect your GitHub repo.
   - Use these settings:
     - **Root Directory:** leave empty (repo root).
     - **Runtime:** Python 3.
     - **Build Command:** `pip install -r backend/requirements.txt`
     - **Start Command:** `cd backend && gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 300 app:app`

3. **Deploy**
   - Render builds and runs the app. The app listens on `PORT` and serves:
     - `/` and static files from `frontend/`
     - `/api/*` for the backend

4. **Your app URL** will be like `https://alchemist-xxxx.onrender.com`.

### Notes

- **Free tier:** Service spins down after ~15 min idle; first request may be slow (cold start).
- **Ephemeral disk:** Uploads and session files are lost on restart. For persistent storage you’d add a store (e.g. S3) later.
- **Request timeout:** Default is 30s; long uploads may need a paid plan and higher timeout.

---

## Option 2: Split deploy (Frontend on Vercel, Backend on Render)

Frontend is hosted on Vercel; backend runs on Render. Good for static CDN + separate API scaling.

### Step 1 – Deploy backend on Render

1. Same as Option 1: **New** → **Web Service**, connect repo.
2. **Build Command:** `pip install -r backend/requirements.txt`
3. **Start Command:** `cd backend && gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 300 app:app`
4. Deploy and note the URL, e.g. `https://alchemist-api.onrender.com`.

### Step 2 – Deploy frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** and import the same repo.
2. **Root Directory:** leave as repo root.
3. **Build & Output:**
   - **Build Command:** leave empty (or `echo 'No build'`).
   - **Output Directory:** `frontend`
4. **Deploy.** Your site will be at e.g. `https://alchemist.vercel.app`.

### Step 3 – Point frontend to the backend API

The frontend must call your Render backend, not relative `/api`.

1. In the repo, open **frontend/index.html**.
2. Uncomment the script line in `<head>` and set your Render URL (including `/api`):

```html
<script>window.ALCHEMIST_API_BASE = 'https://alchemist-api.onrender.com/api';</script>
```

3. Commit, push. Vercel will redeploy and use this API base.

CORS is already enabled in the Flask app (`CORS(app)`), so the browser will allow requests from your Vercel domain to Render.

---

## Files added for production

| File | Purpose |
|------|--------|
| `render.yaml` | Optional Render Blueprint (alternative to manual Web Service setup). |
| `backend/runtime.txt` | Suggests Python 3.11 for Render. |
| `backend/requirements.txt` | Includes `gunicorn` for production. |
| `frontend/config.js` | Copies `window.ALCHEMIST_API_BASE` for split deploy. |
| `vercel.json` | Output directory `frontend` and security headers for Vercel. |

---

## Checklist before production

- [ ] Backend uses `PORT` (already done in `app.py` when using gunicorn).
- [ ] No hardcoded `localhost` in frontend (API base is `/api` or set via `ALCHEMIST_API_BASE`).
- [ ] CORS is enabled (already in Flask).
- [ ] For split deploy: set `ALCHEMIST_API_BASE` in `frontend/index.html` to your Render API URL.

---

## Summary

- **Render:** Run the Flask app (and optionally serve the frontend) with gunicorn; use the Web Service settings above or `render.yaml`.
- **Vercel:** Serve only the `frontend` folder as a static site; set `window.ALCHEMIST_API_BASE` to your Render backend URL when using a split deploy.

With these steps, the project is suitable for production on Render and Vercel.
