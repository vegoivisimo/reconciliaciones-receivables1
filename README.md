# Reconciliaciones Receivables POC2

Full-stack reconciliation app:

- `backend/`: FastAPI APIs for DUCO-SAP and Santix-LoanIQ reconciliation, plus DUCO filtering/dataset services.
- `frontend/`: Vite + React + TypeScript UI.
- `databases/`: sample `.xlsx` files for local/manual testing.

## Prerequisites

- Python `3.10+`
- Node.js `18+` and npm
- PowerShell (commands below are written for Windows/PowerShell)

## Repository Layout

```text
.
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── reconcile_router.py      # DUCO-SAP endpoints (/reconcile, /duco-sap/ai-summary)
│   ├── duco_dataset_router.py   # DUCO dataset/filter endpoints (/api/duco/*)
│   ├── duco_agent.py            # DUCO AI rule interpretation logic
│   ├── loaniq_router.py         # Santix-LoanIQ endpoints (/api/loaniq/*)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   └── .env.example
├── databases/
└── README.md
```

## Quick Start (from scratch)

### 1) Backend setup

From repo root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with the keys/models you want (see env section below).

Run backend:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Swagger docs: `http://localhost:8000/docs`

### 2) Frontend setup

Open a second terminal from repo root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Frontend dev server: `http://localhost:8080`

## Environment Variables

### Backend (`backend/.env`)

Minimal recommended template:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=

# DUCO AI agent
DUCO_AGENT_PROVIDER=openai
DUCO_AGENT_MODEL=gpt-4o-mini

# Executive-summary agents (OpenAI-based in current code)
SANTIX_LOANIQ_AGENT_MODEL=gpt-4o-mini
DUCO_SAP_AGENT_MODEL=gpt-4o-mini
```

Notes:

- DUCO Filtering AI supports provider switch via `DUCO_AGENT_PROVIDER` (`openai` or `gemini`).
- Santix-LoanIQ and DUCO-SAP summary agents currently use OpenAI client code, so `OPENAI_API_KEY` is required for those AI features.

### Frontend (`frontend/.env.local`)

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_DUCO_API_URL=http://localhost:8000
VITE_RECONCILE_API_URL=http://localhost:8000
VITE_WEBHOOK_URL=
```

## API Surface (current)

- DUCO-SAP:
	- `POST /reconcile`
	- `POST /duco-sap/ai-summary`
- DUCO Filtering:
	- `GET /api/duco/schema`
	- `GET /api/duco/rows`
	- `POST /api/duco/datasets`
	- `POST /api/duco/filter`
	- `POST /api/duco/ai-rule`
- Santix-LoanIQ:
	- `POST /api/loaniq/reconcile`
	- `POST /api/loaniq/chat`
	- `POST /api/loaniq/override`
	- `GET /api/loaniq/overrides`
	- `POST /api/loaniq/ai-summary`
	- `POST /api/loaniq/export-updated`

## Validation Checklist (new machine)

1. Backend starts and `/docs` loads.
2. Frontend starts on `:8080`.
3. DUCO page can upload dataset and call `/api/duco/filter`.
4. DUCO AI rule endpoint works with selected provider and key.
5. ReconcileIQ page can call `/reconcile`.
6. LoanIQ page can call `/api/loaniq/reconcile`.

Optional backend smoke test (with backend running):

```powershell
cd backend
python test_api.py
```

## Dependency Notes

Current backend `requirements.txt` already includes the packages needed by the current codebase, including:

- `python-dotenv` (loads `.env`)
- `requests` (Gemini HTTP calls)
- `rapidfuzz` (fuzzy matching)

No extra manual package installation is required beyond `pip install -r backend/requirements.txt`.

## Deployment Notes

- Backend root: `backend`
- Backend install: `pip install -r requirements.txt`
- Backend start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Frontend root: `frontend`
- Frontend build: `npm ci && npm run build`
- Frontend output: `frontend/dist`

Set frontend `VITE_*` URLs to your deployed backend URL before production build.
