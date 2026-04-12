# NavDot

NavDot is a full-stack navigation and IoT companion app for cyclists using handlebar-mounted IoT devices:

- Mobile client: Expo React Native + TypeScript (Expo SDK 54)
- API server: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Auth: Supabase Auth
- Device integration: BLE 0xFF00/0xFF01 (ESP32 custom service), heading/location stream, normalized route packets

## Latest Updates (April 2026)

✅ **Screen Improvements**:
- Removed map from NavigationScreen (map-only in HomeScreen)
- Added dark mode support to SearchCard, BLE debug panel, Search modal
- Route polyline now blue in dark mode for visibility (matches Google Maps)

✅ **Profile Management**:
- Integrated photo avatar picker (gallery + camera via `expo-image-picker`)
- Separated email/name/password update flows to prevent blocking errors
- Token auto-refresh on 401/403 with retry pattern

✅ **Data Pipeline**:
- OSRM routing with multiple route options
- Polyline normalization to 0–1 screen space (bounding box method)
- Direction extraction from route maneuvers (UTURN/LEFT/RIGHT/STRAIGHT)
- Navigation JSON packet with speed, distance, direction, polyline sent via BLE 0xFF01

✅ **BLE Layer Refactor**:
- Aligned to ESP32 custom service (0xFF00/0xFF01)
- Characteristic discovery and caching
- MTU 247 negotiation on Android
- Live BLE debug panel with cached UUIDs

---

## What This App Does

1. **Home Screen**: 
   - Pick destination from interactive map (OSRM cycling routes)
   - View route options with distance, ETA, and direction
   - Search destinations with recent search history
   - Display BLE debug panel (device, MTU, service/characteristic UUIDs)
   - Scan, pair, and manage nearby NavDot devices via BLE

2. **Navigation Screen**: 
   - Once paired and riding, stream live heading (10Hz) and GPS to device
   - Adaptive tile refresh for map context
   - BLE/GPS/Network status monitoring

3. **Data Flow**:
   - Route selection triggers OSRM cycling router
   - Polyline normalized to 0–1 screen space (bounding box normalization)
   - Navigation JSON packet sent via BLE (direction + distance + speed + polyline)
   - Destination also synced to backend (`/api/navigation/destinations`)

4. **Profile & Auth**:
   - Profile photo upload (gallery/camera via expo-image-picker)
   - Name/email/password editing with separate update flows
   - Token auto-refresh on 401/403 with session retry
   - Dark mode support throughout app

## BLE Service Architecture (ESP32 Custom)

NavDot uses a custom ESP32 GATT service for device communication:

**Service UUID**: `0xFF00` (Custom service)  
**Write Characteristic**: `0xFF01` (Write-enabled)

### BLE Operations in Mobile App (`apps/mobile/src/services/bleService.ts`)

| Operation | Flow |
|-----------|------|
| **Scan** | Request BLE + location permissions → wait for Bluetooth power-on (8s timeout) → scan 0xFF00 service → filter devices by "navdot" in name |
| **Connect** | Connect to device → discover services → find 0xFF00 service → locate writable 0xFF01 → cache UUIDs → request MTU 247 (Android) |
| **Write Destination** | Use cached 0xFF01 → construct JSON payload → base64 encode → `writeCharacteristicWithResponseForService` |
| **Write Navigation** | Build normalized polyline packet → send with direction, distance, speed → BLE write with response |
| **Reconnect** | If write fails and cache is stale → rediscover services and refresh cache |

### Permissions Required (Android)

- `android.permission.BLUETOOTH`
- `android.permission.BLUETOOTH_SCAN` (advertise search)
- `android.permission.BLUETOOTH_CONNECT`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.ACCESS_COARSE_LOCATION`

### MTU Negotiation

- **Request**: 247 bytes (Android only, iOS auto-negotiates)
- **Fallback**: Device's default MTU if negotiation fails

---

```text
.
|- apps/
|  |- api/      # Express API + Prisma
|  |- mobile/   # Expo React Native app
|- package.json # Workspace scripts
```

## Screen Features

### Home Screen (`apps/mobile/src/screens/HomeScreen.tsx`)

**Map & Route Selection:**
- Interactive map with long-press to set destination
- OSRM cycling route calculation (multiple route options)
- Route metrics: distance (km), ETA (minutes), heading (degrees), direction (LEFT/RIGHT/UTURN/STRAIGHT)
- Route polyline visualization: **blue in dark mode**, black in light mode (for visibility)

**Search Modal:**
- Full-screen destination search (keyboard-friendly with KeyboardAvoidingView)
- Komoot Photon API live search (350ms debounce)
- Recent searches (up to 6) with tap-to-reuse and "Clear all" button
- Fallback to `expo-location` geocoding if API fails
- Dark mode support (input, chips, results)

**Device Management:**
- Scan nearby BLE devices (0xFF00 service filter)
- Connect to NavDot device with characteristic discovery and caching (0xFF01 write char)
- MTU 247 negotiation on Android
- Preferred device persistence via AsyncStorage

**BLE Debug Panel:**
- Live display: connection status, scan status, device name/ID
- Requested & negotiated MTU
- Cached service UUID (0xFF00), write characteristic UUID (0xFF01)
- Dark mode support

**Send To Device:**
- Sends normalized route polyline + direction + distance + speed via BLE (0xFF01 write)
- Syncs destination to backend (`/api/navigation/destinations`)
- Status feedback: Idle → Sending → Delivered/error

### Navigation Screen (`apps/mobile/src/screens/NavigationScreen.tsx`)

**Status Cards:**
- BLE connection status (Connected/Disconnected)
- GPS fix status (Acquired/Waiting)
- Network status (Online/Offline)

**Position Display:**
- Current latitude/longitude (updated via location stream)

**Ride Control:**
- Start Ride: begins 10Hz heading + location streaming to device
- End Ride: stops stream and cleans up resources

**Active Destination Display:**
- Shows current destination lat/lng and label

## Data Pipeline: Route → BLE Packet

When you send a destination to the device:

1. **OSRM Routing**: Fetch cycling route from Open Source Routing Machine
   - Returns: geometry (polyline array), distance, duration, steps (with turn maneuvers)

2. **Direction Extraction**: Parse first turn maneuver from route steps
   - Types: `UTURN` → `LEFT` → `RIGHT` → `STRAIGHT` (fallback)

3. **Polyline Normalization**: Convert real-world coordinates to 0–1 screen space
   - Compute bounding box: `minLat`, `maxLat`, `minLng`, `maxLng`
   - Normalize each point: `x = (lng - minLng) / lngSpan`, `y = (lat - minLat) / latSpan`
   - Limit to 120 points for BLE payload size

4. **Navigation JSON Packet**:
   ```json
   {
     "ts": 1712761200000,
     "type": "navigation",
     "direction": "LEFT",
     "distance": 1200,
     "speed": 35,
     "polyline": [[0.1, 0.8], [0.3, 0.6], [0.7, 0.2]]
   }
   ```

5. **BLE Write**: Send base64-encoded JSON via 0xFF01 characteristic

6. **Backend Sync**: Store destination in PostgreSQL for record-keeping

## Tech Stack

- **Mobile**: Expo SDK 54, React Native 0.81, TypeScript, Zustand (state), NativeWind (Tailwind CSS), React Navigation
- **BLE**: `react-native-ble-plx` (GATT 0xFF00 service, 0xFF01 write characteristic, MTU 247 negotiation on Android)
- **Maps & Location**: `react-native-maps`, `expo-location` (foreground, heading, speed)
- **Image Handling**: `expo-image-picker` (gallery + camera for avatar)
- **Routing**: OSRM cycling router (open-source)
- **Search**: Komoot Photon API + `expo-location` geocoding fallback
- **Auth**: Supabase Auth (`@supabase/supabase-js`)
- **API**: Express, Prisma, Zod
- **Database**: PostgreSQL
- **Styling**: NativeWind (Tailwind CSS for React Native)

## Authentication & Profile Management

### Supabase Auth Integration (`apps/mobile/src/services/authService.ts`)

- **Email/Password Sign-up**: `signUp({ email, password })`
- **Login**: `signInWithPassword({ email, password })`
- **Session Persistence**: Auto-restore session from AsyncStorage on app launch
- **Token Refresh**: Auto-refresh access token via refresh_token grant when 401/403 occurs
- **Logout**: Clear session and local storage

### Profile Updates (Separate Flows)

To avoid email change failures blocking name/avatar updates:

- **updateProfile({ fullName, avatarUrl })**: Updates user metadata
- **updateEmail({ email })**: Separate endpoint for email changes
- **updatePassword({ password })**: Updates password with validation (8+ chars)

All profile operations include automatic token refresh retry.

### Profile Screen (`apps/mobile/src/screens/ProfileScreen.tsx`)

**Photo Avatar:**
- Gallery picker via `expo-image-picker`
- Camera capture via `expo-image-picker`
- Avatar preview before save
- Stored as file URI (local to device)

**Editable Fields:**
- Full name
- Email (saved separately to avoid blocking name/avatar)
- Password change modal (confirmation required)
- Email visibility (read-only display of current email)

**Dark Mode Support:**
- Modal and form inputs adapt to theme

## State Management (Zustand + AsyncStorage)

### Stores in `apps/mobile/src/store/`

| Store | Purpose |
|-------|---------|
| `useAuthStore.ts` | Session, user profile, avatar URL |
| `useBleStore.ts` | Devices list, scan status, connection status, preferred device |
| `useNavStore.ts` | Destination, current position, ride mode, status messages |
| `useSettingsStore.ts` | Theme mode (dark/light), user preferences |

All stores optionally persist to AsyncStorage for session recovery.

### Dark Mode Implementation

Theme state in `useSettingsStore`:
- `themeMode`: `"dark" | "light"`
- Applies to: SearchCard, BLE debug panel, Search modal, Polyline color, all buttons & text

Example:
```typescript
const isDark = useSettingsStore((state) => state.themeMode === "dark");
<View className={isDark ? "bg-[#111827]" : "bg-white"} />
```

---

## Setup Requirements

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

Create mobile env file:

```bash
copy apps\mobile\.env.example apps\mobile\.env
```

Required mobile env values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000
```

## Install Dependencies

From repository root:

```bash
npm install
```

## Quick Start (Copy/Paste)

PowerShell (Windows):

```powershell
copy apps\api\.env.example apps\api\.env
copy apps\mobile\.env.example apps\mobile\.env
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
2. Mobile Settings -> API base URL is correct for your device/emulator.

## Database Setup (Prisma)

From repository root:

```bash
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
```

This generates Prisma client and applies the initial schema migration.

## Run the App (Local Development)

Terminal 1: start API

```bash
npm run dev:api
```

Terminal 2: start mobile

```bash
npm run dev:mobile
```

Then open the Expo app via Android/iOS/web shortcut from terminal.

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

Mobile authentication now uses Supabase Auth directly.

- Sign up: `supabase.auth.signUp(...)`
- Login: `supabase.auth.signInWithPassword(...)`
- Session restore: `supabase.auth.getSession(...)`
- Profile: `supabase.auth.getUser(...)`
- Sign out: `supabase.auth.signOut(...)`

The existing API auth routes can still run, but they are no longer required for mobile sign-in.

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

## API cURL Examples

Assumption: API is running at `http://localhost:4000`.

Health:

```bash
curl http://localhost:4000/health
```

Register:

```bash
curl -X POST http://localhost:4000/api/auth/register \
	-H "Content-Type: application/json" \
	-d '{"email":"user@example.com","password":"password123","fullName":"Nav User"}'
```

Login:

```bash
curl -X POST http://localhost:4000/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"email":"user@example.com","password":"password123"}'
```

Profile (replace TOKEN):

```bash
curl http://localhost:4000/api/auth/profile \
	-H "Authorization: Bearer TOKEN"
```

Ingest BLE coordinate event:

```bash
curl -X POST http://localhost:4000/api/ble/coordinates \
	-H "Content-Type: application/json" \
	-d '{"deviceId":"device-123","latitude":28.6139,"longitude":77.2090,"altitude":218.2}'
```

Create destination:

```bash
curl -X POST http://localhost:4000/api/navigation/destinations \
	-H "Content-Type: application/json" \
	-d '{"deviceId":"device-123","latitude":28.6139,"longitude":77.2090,"label":"selected_pin","source":"mobile-map"}'
```

Get destination history:

```bash
curl http://localhost:4000/api/navigation/destinations/device-123
```

## Database Models (Current)

Prisma schema currently defines:

1. `User`
2. `CoordinateEvent`

Note: navigation destinations are currently stored in in-memory API store (not persisted in Postgres yet).

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

- Imports external activity/routes data into local store
- Displays activity and route cards

### Settings Tab

- Zoom, dim timeout, schedule, units
- Fitness access token field
- API base URL field (`apiBaseUrl`)

## Troubleshooting

### BLE unavailable error

If you see BLE module unavailable errors, run a development build. Expo Go does not support this BLE setup.

### Mobile cannot reach API

1. Ensure API is running on port `4000`.
2. In mobile Settings, verify API base URL:
	 - Android emulator: `http://10.0.2.2:4000`
	 - Physical device: use your machine LAN IP

### Prisma/database issues

1. Verify PostgreSQL is running.
2. Verify `DATABASE_URL` in `apps/api/.env`.
3. Re-run:

```bash
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
```

## Next Production Steps

1. Persist navigation destinations in PostgreSQL (new Prisma model + migration).
2. Add refresh-token auth flow.
3. Add API tests and mobile E2E tests.
4. Add CI pipeline (typecheck, build, lint, tests).
5. Add secure token storage for sensitive client-side secrets.
