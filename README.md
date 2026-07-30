<p align="center">
  <img src="https://img.shields.io/badge/Hotel_Indigo-Neighbourhood_Story-2D7A7A?style=for-the-badge&labelColor=1A2E3B" alt="Hotel Indigo Neighbourhood Story" />
</p>

<h1 align="center">Indigo Neighbourhood Storytelling Platform</h1>

<p align="center">
  <strong>AI-powered PPT generator that turns street-level research into branded Hotel Indigo neighbourhood narratives.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=fff" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=fff" alt="FastAPI" />
  <img src="https://img.shields.io/badge/python--pptx-1.0-3776AB?logo=python&logoColor=fff" alt="python-pptx" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=fff" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Mapbox_GL-3-000?logo=mapbox&logoColor=fff" alt="Mapbox GL" />
  <img src="https://img.shields.io/badge/deploy-Fly.io-8B5CF6?logo=flydotio&logoColor=fff" alt="Fly.io" />
</p>

---

## The Idea

> The neighbourhood is not supplementary information — it's the reason to stay.

Hotel Indigo properties are rooted in the stories of their surroundings. This platform **systematises** the brand's *Clues to the Neighbourhood* framework using LLMs, generative imagery, and a fixed 22-slide design system — so any property team can produce a publication-ready PPT in minutes, not weeks.

---

## Two Modes

| | **FastLane** 一键生成 | **Guided** 逐步创作 |
|---|---|---|
| Input | City + District + Hotel name | Conversational location search |
| Control | Fully automated | Full editorial at every step |
| Output | 22-slide PPTX (editable text boxes) | 22-slide PPTX (editable text boxes) |
| Time | ~2-3 min | You decide |

---

## 22-Slide Structure

Every deck follows a **fixed narrative arc** mapped to six hotel spaces:

```
 ┌─────────────────────────────────────────────────────┐
 │  01  Cover                                          │
 │  02  Tagline (3 options)                            │
 │  03  Brand Concept Cinematic                        │
 │ 04–06  Three Origin Articles (背景 / 历史 / 建筑)     │
 │  07  Story Emotion Cinematic                        │
 │  08  Story Summary                                  │
 │  09  Story Mapping (6-beat index grid)              │
 │  10  Story Flow Grid (3×2 text layout)              │
 │ 11–22  Six Beats × 2 slides (Cover + Moodboard)    │
 └─────────────────────────────────────────────────────┘
```

**Six Beats** — each tied to a hotel space and a sensory verb:

| Beat | Space | Verb |
|------|-------|------|
| 01 | Lobby | Arrival / Welcome |
| 02 | Corridor | Transition / Lane |
| 03 | Guest Room | Private / Lane House |
| 04 | Restaurant & PDR | Dining / Feast |
| 05 | Meeting Room | Convenes / History |
| 06 | Wellness Area | Morning / Wellness |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend  (React 19 + Vite + Tailwind)                      │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ FastLane   │ │ Guided 5-Step│ │ IndigoSlides (22-slide │  │
│  │ one-click  │ │ wizard       │ │ design-system renderer)│  │
│  └─────┬──────┘ └──────┬───────┘ └────────────────────────┘  │
│        │               │                                      │
│        └───────┬───────┘                                      │
│                ▼                                              │
│          api.ts  →  HTTP                                      │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend  (FastAPI + python-pptx)                            │
│                                                              │
│  Routes                         Services                     │
│  ─────────────────              ─────────────────────        │
│  POST /api/locate        →      locator (Mapbox + LLM)      │
│  POST /api/generate      →      generator (6-beat story)    │
│  POST /api/edit          →      editor (iterative rewrite)  │
│  POST /api/images        →      image_generator (FAL/Gemini)│
│  POST /api/indigo/generate →    indigo_generator (22-slide) │
│  POST /api/indigo/export-pptx → indigo_pptx_builder         │
│                                                              │
│  LLM backends: OpenAI · Google Gemini · DeepSeek             │
│  Image gen:    FAL.ai · Relay API · Unsplash fallback        │
└──────────────────────────────────────────────────────────────┘
```

All text in the exported PPTX is **real, editable text** (via python-pptx) — not embedded screenshots. Property teams can freely customise after export.

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.11
- API keys for: OpenAI (or Gemini/DeepSeek), Mapbox, FAL.ai (optional)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env   # then fill in your API keys

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev
```

Open **http://localhost:5173** — pick FastLane or Guided, enter a neighbourhood, and generate.

---

## Demo Auth & History

The current demo includes email/password login, protected generation/export APIs, and per-user generation history backed by local SQLite. See [docs/auth-history-demo.md](docs/auth-history-demo.md) for current scope, verification commands, and production gaps.

---

## Deployment

Production-style demos are deployed with **Fly.io** for the FastAPI backend and **Vercel** for the frontend.

Backend:

- Fly.io app deployed by GitHub Actions
- Dockerfile builder
- Docker context: `backend`
- Config: `backend/fly.toml`
- Health check: `GET /health`

Frontend:

- Vercel static build from `frontend`
- `VITE_API_BASE_URL` points to the Fly backend domain

See [docs/fly-deployment.md](docs/fly-deployment.md) for the deployment checklist, environment variables, and validation commands. The old `render.yaml` is kept only as legacy Render configuration.

Indigo image generation supports recoverable, zero-additional-infrastructure Jobs in both one-step and guided flows. Job state and compressed image files reuse the existing Fly SQLite volume; Redis and a separate worker are not required. See [docs/image-generation-jobs.md](docs/image-generation-jobs.md) for the API, recovery model, sleep behavior, and remaining storage/observability work.

---

## Design Tokens

The slide renderer follows Hotel Indigo's visual identity:

| Token | Value | Usage |
|-------|-------|-------|
| Teal | `#2D7A7A` | Primary accent, beat covers |
| Gold | `#C8A96E` | Highlights, tagline accents |
| Navy | `#1A2E3B` | Headers, dark backgrounds |
| Slide size | 960 × 540 px | Web preview (16:9) |
| PPTX size | 33.867 × 19.05 cm | Standard widescreen export |

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/auth.py              # Login, registration, current user, logout
│   │   ├── api/routes.py            # Protected generation, history, and export endpoints
│   │   ├── core/
│   │   │   ├── auth.py              # SQLite auth/session/history store
│   │   │   ├── config.py            # Env-based settings
│   │   │   └── models.py            # Pydantic schemas
│   │   └── services/
│   │       ├── indigo_generator.py   # 22-slide LLM orchestration
│   │       ├── indigo_pptx_builder.py # python-pptx construction
│   │       ├── image_generator.py    # FAL / Gemini image gen
│   │       ├── locator.py           # Mapbox + NLP geolocation
│   │       └── generator.py         # Legacy 6-beat story gen
│   ├── Dockerfile
│   ├── fly.toml                     # Fly.io backend deployment config
│   ├── requirements.txt
│   └── tests/test_auth_flow.py      # Auth/history regression coverage
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Main state machine (5 steps)
│   │   ├── AuthScreen.tsx           # Demo login/register UI
│   │   ├── FastLane.tsx             # One-click generation UI
│   │   ├── IndigoSlides.tsx         # 22-slide design-system renderer
│   │   ├── indigo_types.ts          # TS interfaces for story schema
│   │   ├── MapPicker.tsx            # Mapbox location picker
│   │   └── api.ts                   # Backend HTTP client
│   ├── package.json
│   └── vite.config.ts
├── render.yaml                      # Legacy Render deployment manifest
├── .github/workflows/fly-backend.yml # Fly.io backend deployment workflow
└── indigo-ppt-methodology.md        # 22-slide framework & prompt scripts
```

---

## License

Proprietary — Hotel Indigo / IHG internal use.
