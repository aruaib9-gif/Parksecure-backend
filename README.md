# ParkSecure

Vehicle security and parking management platform: QR-based entry/exit control, owner exit
approvals, item declaration with discrepancy detection, billing (free / flat / hourly), security
alerts and multi-facility administration.

Originally a Base44 web app — now fully self-hosted:

| Directory | What it is |
|---|---|
| [server/](server/) | **API backend** — Node 20, Express, Prisma, PostgreSQL. JWT auth, role-based access, Paystack, Expo push, hourly security-alert cron. Swagger at `/api-docs`. |
| [mobile/](mobile/) | **React Native app** (Expo) — role-based UI for security officers, facility admins, super admins and vehicle owners. Camera QR scanning, offline scan queue, push notifications. |
| [docs/](docs/) | [OpenAPI spec](docs/openapi.json), [Render deploy guide](docs/DEPLOY_RENDER.md), [APK build guide](docs/BUILD_APK.md). |
| [render.yaml](render.yaml) | One-click Render blueprint (API + PostgreSQL). |


## Roles

`super_admin` → all facilities, settings, users, billing ·
`park_admin` / `facility_admin` → their facility's dashboard, approvals, payments ·
`security` → scanner, exit approvals, shift handover ·
`vehicle_owner` → own vehicles, exit approvals, bills.

The **first account registered becomes the super admin** (or set `ADMIN_EMAIL`/`ADMIN_PASSWORD` and run the seed).

## Quick start (local)

```bash
# API — needs PostgreSQL and Node 20+
cd server
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate dev
npm run seed
npm run dev                   # http://localhost:4000 , docs at /api-docs

npm test                      # 31 integration tests (boots the app in-process)
npm run test:smoke            # 18-check end-to-end pass against a running server

# Mobile
cd ../mobile
npm install
npx expo start                # scan with Expo Go, or press a for Android
```

The mobile app reads the API URL from `expo.extra.apiUrl` in [mobile/app.json](mobile/app.json)
(a dev machine LAN IP works for Expo Go).

## Deploy

- **Backend on Render** → [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)
- **Android APK** → [docs/BUILD_APK.md](docs/BUILD_APK.md)
