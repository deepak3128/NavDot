# NavDot

NavDot is a full-stack navigation and IoT companion app:

- Mobile client: Expo React Native + TypeScript
- API server: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Auth: JWT (register, login, profile)
- Device integration: BLE pairing, heading stream, destination packet send

## What This App Does

1. Scans and pairs to nearby BLE devices.
2. Streams navigation context (heading + location metadata) to the connected device.
3. Lets you pick a destination on map and send it to the device.
4. Syncs destination events to backend (`/api/navigation/destinations`).
5. Displays a deterministic local ride/activity snapshot in mobile UI (no external fitness API dependency).

## Monorepo Structure

```text
.
|- apps/
|  |- api/      # Express API + Prisma
|  |- mobile/   # Expo React Native app
|- package.json # Workspace scripts
```

## Architecture Diagram

```mermaid
flowchart LR
	Mobile[Expo Mobile App] -->|BLE packets| IoT[NavDot IoT Device]
	Mobile -->|HTTP JSON| API[Express API]
	API -->|Prisma| DB[(PostgreSQL)]
	API -->|JWT auth| Mobile
```

## Tech Stack

- Mobile: Expo SDK 54, React Native 0.81, Zustand, NativeWind, React Navigation
- Native integrations: `react-native-ble-plx`, `react-native-maps`, `expo-location`, `expo-sensors`
- API: Express, Prisma, Zod, JWT, bcryptjs
- DB: PostgreSQL

## Setup Requirements

Install these before running:

1. Node.js 20+
2. npm 10+
3. PostgreSQL 14+
4. Expo CLI tooling (via `npx expo ...`)
5. Android Studio emulator or physical Android device

Notes:

- BLE in this app is not supported inside Expo Go. Use an Expo development build for BLE functionality.
- For Android emulator to call local API, default mobile API base URL is `http://10.0.2.2:4000`.

## Environment Configuration

Create API env file:

```bash
copy apps\api\.env.example apps\api\.env
```

`apps/api/.env.example` values:

```env
PORT=4000
JWT_SECRET=replace_with_strong_secret
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/navdot?schema=public"
```

Set a real `JWT_SECRET` and confirm `DATABASE_URL` matches your local DB.

Optional mobile API base override:

Set `EXPO_PUBLIC_API_BASE_URL` before launching Expo (example values below):

- Android emulator: `http://10.0.2.2:4000`
- Physical device: `http://<your-lan-ip>:4000`

If omitted, mobile auto-resolves API base URL from Metro host (or platform defaults).

## Quick Start (Copy/Paste)

PowerShell (Windows):

```powershell
copy apps\api\.env.example apps\api\.env
npm install
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
```

Then run in two terminals:

```powershell
npm run dev:api
```

```powershell
npm run dev:mobile
```

Open mobile app and verify:

1. API health: http://localhost:4000/health
2. If mobile cannot connect, set `EXPO_PUBLIC_API_BASE_URL` for your target device/emulator.

## Commands Reference

### Root Workspace

```bash
npm run dev:api      # run apps/api in dev mode
npm run dev:mobile   # run apps/mobile via Expo
npm run build:api    # build API TypeScript
```

### API (`apps/api`)

```bash
npm run dev             # ts-node-dev server
npm run build           # tsc compile to dist/
npm run start           # run built server
npm run prisma:generate # prisma client generation
npm run prisma:migrate  # prisma migrate dev
```

### Mobile (`apps/mobile`)

```bash
npm run start      # expo start
npm run android    # expo start --android
npm run ios        # expo start --ios
npm run web        # expo start --web
npm run typecheck  # tsc --noEmit
```

## API Endpoints

Base URL (local): `http://localhost:4000`

### Health

- `GET /health`
- Response:

```json
{ "status": "ok", "service": "navdot-api" }
```

### Auth

- `POST /api/auth/register`
	- Body:

```json
{ "email": "user@example.com", "password": "password123", "fullName": "Nav User" }
```

- `POST /api/auth/login`
	- Body:

```json
{ "email": "user@example.com", "password": "password123" }
```

- `GET /api/auth/profile`
	- Header: `Authorization: Bearer <jwt-token>`

### BLE Ingestion

- `POST /api/ble/coordinates`
	- Body:

```json
{ "deviceId": "device-123", "latitude": 28.6139, "longitude": 77.2090, "altitude": 218.2 }
```

### Navigation Destinations

- `POST /api/navigation/destinations`
	- Body:

```json
{
	"deviceId": "device-123",
	"latitude": 28.6139,
	"longitude": 77.2090,
	"label": "selected_pin",
	"source": "mobile-map"
}
```

- `GET /api/navigation/destinations/:deviceId`
	- Returns recent destinations for that device.

## Database Models (Current)

Prisma schema currently defines:

1. `User`
2. `CoordinateEvent`

Notes:

- navigation destinations are currently stored in in-memory API store (not persisted in Postgres yet).
- auth reads/writes Postgres via Prisma when available; if DB/Prisma is unavailable locally, it transparently falls back to `apps/api/data/users.json`.

## Mobile Feature Map

### Pairing Tab

- BLE permission request and scanning
- Device pairing and preferred-device persistence
- Map-based destination selection (long press)
- Send destination to BLE device and backend sync

### Navigation Tab

- Location + heading stream
- Background navigation service hooks
- Tile fetch/cache trigger logic

### Activities Tab

- Loads deterministic local ride/session snapshot data
- Displays ride/session and device sync cards

### Settings Tab

- Zoom, dim timeout, schedule, units
- Account logout

## Troubleshooting

### BLE unavailable error

If you see BLE module unavailable errors, run a development build. Expo Go does not support this BLE setup.

### Mobile cannot reach API

1. Ensure API is running on port `4000`.
2. Verify mobile API base URL resolution:
	 - Android emulator: `http://10.0.2.2:4000`
	 - Physical device: use your machine LAN IP (for example `http://192.168.1.10:4000`)
	 - You can force the value with `EXPO_PUBLIC_API_BASE_URL`

### Prisma/database issues

1. Verify PostgreSQL is running.
2. Verify `DATABASE_URL` in `apps/api/.env`.
3. Re-run:

```bash
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
```

If Prisma is not initialized or DB is intentionally unavailable in local development, auth still works via file fallback store at `apps/api/data/users.json`.

## Next Production Steps

1. Persist navigation destinations in PostgreSQL (new Prisma model + migration).
2. Add refresh-token auth flow.
3. Add API tests and mobile E2E tests.
4. Add CI pipeline (typecheck, build, lint, tests).
5. Add secure token storage for sensitive client-side secrets.
