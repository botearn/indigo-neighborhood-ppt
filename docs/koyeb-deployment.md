# Koyeb Deployment

This project should deploy the FastAPI backend through Koyeb's Git-driven Web Service flow. Do not deploy by manually changing files on a server.

## Backend Service

Create one Koyeb Web Service with these settings:

| Setting | Value |
| --- | --- |
| Deployment method | GitHub |
| Repository | This repository |
| Branch | `main` or the intended release branch |
| Builder | Dockerfile |
| Work directory | `backend` |
| Dockerfile location | `Dockerfile` |
| Instance | Free for demo/testing, paid for production |
| Port | `8000` / HTTP |
| Route | `/:8000` |
| Health check | HTTP `GET /health` |
| Autodeploy | Enabled for the release branch |

Koyeb always provides a `PORT` variable for Web Services. The backend Dockerfile uses `${PORT:-8000}`, so it works on Koyeb and still runs locally on port `8000`.

## Required Environment Variables

Set these in Koyeb, preferably using Koyeb Secrets for API keys:

```text
ENV=production
PORT=8000
CORS_ORIGINS=https://your-vercel-domain.vercel.app
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
OPENAI_API_KEY=...
MAPBOX_TOKEN=...
IMAGE_PROVIDER=relay
RELAY_BASE_URL=https://api.tokenrouter.com/v1
RELAY_API_KEY=...
RELAY_IMAGE_MODEL=openai/gpt-5.4-image-2
FAL_KEY=...
GEMINI_API_KEY=...
UNSPLASH_ACCESS_KEY=...
FEISHU_WEBHOOK_URL=...
GITHUB_WEBHOOK_SECRET=...
```

Only one LLM key is required for the selected `LLM_PROVIDER`. Only the image-provider keys for the selected `IMAGE_PROVIDER` are required. Keep unused optional variables blank.

## Frontend Vercel Setting

After the Koyeb service is healthy, copy its public domain, for example:

```text
https://indigo-ppt-backend-xxxx.koyeb.app
```

Set this in Vercel for the frontend:

```text
VITE_API_BASE_URL=https://indigo-ppt-backend-xxxx.koyeb.app
```

Redeploy the Vercel frontend after changing the variable. The frontend calls `${VITE_API_BASE_URL}/api/...`.

## Validation

Use these checks after Koyeb and Vercel finish their automated deployments:

```bash
curl -i https://indigo-ppt-backend-xxxx.koyeb.app/health
curl -i -X POST https://indigo-ppt-backend-xxxx.koyeb.app/api/locate \
  -H 'Content-Type: application/json' \
  --data '{"input":"上海 徐汇"}'
```

Expected result:

- `/health` returns `{"status":"ok"}`.
- `/api/locate` returns JSON or a backend `500` with a specific `detail`; it should not be a browser-level `Failed to fetch`.

## Notes

- `render.yaml` is now legacy Render configuration.
- `.koyebignore` prevents backend redeploys for frontend-only and docs-only commits.
- Free instances are suitable for demos and testing, not production acceptance.
