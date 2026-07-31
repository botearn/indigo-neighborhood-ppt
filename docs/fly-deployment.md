# Fly.io Deployment

This project deploys the FastAPI backend to Fly.io through GitHub Actions. Do not deploy by manually running production commands from a local machine.

## Deployment Shape

- Backend platform: Fly.io
- Frontend platform: Vercel
- Deployment method: GitHub Actions
- Backend config: `backend/fly.toml`
- Backend Docker context: `backend`
- Health check: `GET /health`
- Build mode: Fly remote builder, so local Docker is not required
- Auth/history storage: SQLite on the Fly volume `indigo_data`, mounted at `/data`

## One-Time Fly Setup

Create or choose a Fly app name. The checked-in default is:

```text
indigo-ppt-backend
```

If that name is unavailable, update `app` in `backend/fly.toml` before merging.

Create the Fly app once:

```bash
fly apps create indigo-ppt-backend --org personal
```

Set runtime secrets on the Fly app. Use the values from the previous backend environment, but do not commit them:

```bash
fly secrets set \
  CORS_ORIGINS=https://your-vercel-domain.vercel.app \
  MAPBOX_TOKEN=... \
  LLM_PROVIDER=deepseek \
  DEEPSEEK_API_KEY=... \
  IMAGE_PROVIDER=relay \
  RELAY_BASE_URL=https://api.tokenrouter.com/v1 \
  RELAY_API_KEY=... \
  RELAY_IMAGE_MODEL=openai/gpt-5.4-image-2 \
  --stage \
  --app indigo-ppt-backend
```

The checked-in Fly config sets:

```text
AUTH_DB_PATH=/data/indigo.db
```

The GitHub Actions deployment workflow creates the `indigo_data` volume in `sin` if it is missing before deployment. This keeps demo users, sessions, and generation history across app deploys.

Optional provider secrets, depending on the selected provider:

```bash
fly secrets set \
  OPENAI_API_KEY=... \
  FAL_KEY=... \
  GEMINI_API_KEY=... \
  UNSPLASH_ACCESS_KEY=... \
  FEISHU_WEBHOOK_URL=... \
  GITHUB_WEBHOOK_SECRET=... \
  --stage \
  --app indigo-ppt-backend
```

GitHub-to-Feishu repository notifications do not use the backend webhook path. Set this repository secret in GitHub Actions instead:

```text
FEISHU_WEBHOOK_URL
```

The legacy backend webhook path can still use Fly secrets `FEISHU_WEBHOOK_URL` and `GITHUB_WEBHOOK_SECRET`, but the preferred notification flow is now GitHub Actions → Feishu.

Create a deploy token for GitHub Actions:

```bash
fly tokens create deploy -x 999999h --app indigo-ppt-backend
```

Add the full token output as a GitHub repository secret:

```text
FLY_API_TOKEN
```

## Automated Deployment

After the PR is merged, GitHub Actions runs `.github/workflows/fly-backend.yml` on pushes to `main` that touch backend deployment files.

The workflow runs:

```bash
flyctl deploy ./backend --config ./backend/fly.toml --remote-only --ha=false
```

`--remote-only` means the image is built by Fly's remote builder, not by local Docker. `--ha=false` avoids creating a spare Machine during the initial demo deployment.

## Frontend Vercel Setting

After the Fly deployment is healthy, set this in Vercel:

```text
VITE_API_BASE_URL=https://indigo-ppt-backend.fly.dev
```

Then redeploy the Vercel frontend.

## Validation

Use these checks after the GitHub Actions deployment completes:

```bash
curl -i https://indigo-ppt-backend.fly.dev/health
curl -i -X POST https://indigo-ppt-backend.fly.dev/api/locate \
  -H 'Content-Type: application/json' \
  --data '{"input":"上海 徐汇"}'
```

Expected result:

- `/health` returns `{"status":"ok"}`.
- `/api/locate` returns JSON or a backend `500` with a specific `detail`; it should not be a browser-level `Failed to fetch`.

## Notes

- `render.yaml` remains only as legacy Render configuration.
- Koyeb is no longer the recommended path because the current account flow is blocked by the Mistral transition page.
- Production acceptance should include GitHub Actions logs, Fly health checks, and Vercel frontend verification.
