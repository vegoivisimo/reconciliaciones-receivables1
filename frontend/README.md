# Frontend

Vite + React + TypeScript application for the Reconciliaciones Receivables POC.

## Local Development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The app runs on `http://localhost:8080` by default.

## Environment

Configure API URLs in `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DUCO_API_URL=http://localhost:8000
VITE_RECONCILE_API_URL=http://localhost:8000
VITE_WEBHOOK_URL=
```

## Scripts

- `npm run dev`: start the local Vite server.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: preview the production build locally.
- `npm run lint`: run ESLint.
- `npm run test`: run Vitest tests.

## Deployment

Set the `VITE_*` variables to the deployed backend URL before building the app in your hosting provider.
