# Pool Control API — Design Spec

## Overview

A Node.js/Express REST API that wraps the AquaConnect pool gateway's HTML interface, providing a clean API for reading pool state and toggling equipment. Designed to be consumed by Home Assistant, custom dashboards, or any HTTP client.

The gateway (a Hayward AquaConnect device) exposes a simple HTML frontend at a configurable URL. It has no real API — just an HTML page with an LCD display, LED indicators, and virtual buttons that mimic the physical pool control panel. This API abstracts that into a proper REST interface.

## Architecture

**Single-process Node/Express app with two concerns:**

1. **Background Poller** — continuously reads gateway state
2. **REST API** — serves cached state and accepts commands

```
┌─────────────┐   POST every 500ms    ┌──────────────────┐
│  Poller     │ ────────────────────>  │  AquaConnect     │
│  (background)│ <────────────────────  │  Gateway         │
│             │   HTML response        │  (WNewSt.htm)    │
└──────┬──────┘                        └──────────────────┘
       │ updates
       v
┌─────────────┐
│  In-Memory  │
│  State      │
└──────┬──────┘
       │ reads
       v
┌─────────────┐   HTTP requests       ┌──────────────────┐
│  Express    │ <────────────────────  │  HA / Clients    │
│  REST API   │ ────────────────────>  │                  │
└─────────────┘   JSON responses       └──────────────────┘
```

## Gateway Interface

All communication with the gateway is via HTTP to `{GATEWAY_URL}/WNewSt.htm`.

### Reading State

The gateway accepts both GET and POST for reading state. We use POST with body `"Update Local Server&"` to match the gateway's own JavaScript client (`WebsFuncs.js`). No Content-Type header is required for the status poll.

Response is HTML containing a `<body>` with three sections separated by `xxx` delimiters.

**Example raw response body content:**

```
     Salt Level     xxx
      3000 PPM      xxx
TESD5C333333xxx
```

- **Section 1 (LCD Line 1):** `"     Salt Level     "` — the label currently shown on the LCD
- **Section 2 (LCD Line 2):** `"      3000 PPM      "` — the value currently shown on the LCD
- **Section 3 (LED state string):** `"TESD5C333333"` — encoded equipment states (see LED decoding below)

The LCD cycles through multiple screens showing different sensor readings. Each poll captures whatever screen is currently displayed.

**Note:** Temperature values include `&#176;` (degree symbol HTML entity) which must be stripped during parsing.

### LED State Encoding

Each ASCII character in the LED string encodes two button states via its hex byte value. The high nibble encodes one button, the low nibble encodes the next.

**Nibble values:** `3` = NOKEY (unused), `4` = OFF, `5` = ON, `6` = BLINK

**Example:** The character `'T'` has hex value `0x54` → high nibble `5` (ON), low nibble `4` (OFF).

**Decoding table for known characters:**

| Char | Hex | High Nibble | Low Nibble |
|------|-----|-------------|------------|
| `3` | 0x33 | NOKEY | NOKEY |
| `4` | 0x34 | NOKEY | OFF |
| `5` | 0x35 | NOKEY | ON |
| `6` | 0x36 | NOKEY | BLINK |
| `C` | 0x43 | OFF | NOKEY |
| `D` | 0x44 | OFF | OFF |
| `E` | 0x45 | OFF | ON |
| `F` | 0x46 | OFF | BLINK |
| `S` | 0x53 | ON | NOKEY |
| `T` | 0x54 | ON | OFF |
| `U` | 0x55 | ON | ON |
| `V` | 0x56 | ON | BLINK |
| `c` | 0x63 | BLINK | NOKEY |
| `d` | 0x64 | BLINK | OFF |
| `e` | 0x65 | BLINK | ON |
| `f` | 0x66 | BLINK | BLINK |

**Button index mapping** — The LED string is decoded sequentially. Each byte yields two button indices:

| Byte Index | High Nibble → Button | Low Nibble → Button |
|------------|---------------------|---------------------|
| 0 | Key_00 (POOL) | Key_01 (SPA) |
| 1 | Key_02 (SPILLOVER) | Key_03 (FILTER) |
| 2 | Key_04 (LIGHTS) | Key_05 (unused) |
| 3 | Key_06 (HEATER1) | Key_07 (VALVE3/Solar) |
| 4 | Key_08 (unused) | Key_09 (AUX1/Spa Lights) |
| 5 | Key_10 (AUX2/Waterfall) | Key_11 (unused) |
| 6-10 | Key_12 through Key_22 (all unused / NOKEY) |
| 11 | Key_23 high nibble (unused) | **Control nibble** (not a button) |

The **control nibble** (last byte, low nibble) signals page refresh needs: `3` = normal, `4` = names changed (reload), `5` = check system warning, `6` = both.

**Example decode of `"TESD5C333333"`:**
- Byte 0 `'T'` (0x54): Key_00 POOL=ON, Key_01 SPA=OFF → Pool mode active
- Byte 1 `'E'` (0x45): Key_02 SPILLOVER=OFF, Key_03 FILTER=ON
- Byte 2 `'S'` (0x53): Key_04 LIGHTS=ON, Key_05=NOKEY
- Byte 3 `'D'` (0x44): Key_06 HEATER1=OFF, Key_07 SOLAR=OFF
- Byte 4 `'5'` (0x35): Key_08=NOKEY, Key_09 SPA LIGHTS=ON
- Byte 5 `'C'` (0x43): Key_10 WATERFALL=OFF, Key_11=NOKEY
- Bytes 6-11 `'333333'`: all remaining buttons NOKEY

**Equipment state derivation from LEDs:**

| State | Condition |
|-------|-----------|
| Mode = "pool" | Key_00 = ON |
| Mode = "spa" | Key_01 = ON |
| Mode = null | Neither Key_00 nor Key_01 is ON |
| Filter on | Key_03 = ON |
| Lights on | Key_04 = ON |
| Heater on | Key_06 = ON |
| Solar heater on | Key_07 = ON |
| Spa lights on | Key_09 = ON |
| Waterfall on | Key_10 = ON |

Equipment states must be set to both `true` and `false` on each poll based on LED state — not just set to `true` when ON.

### Sending Commands

POST to `{GATEWAY_URL}/WNewSt.htm` with Content-Type `application/x-www-form-urlencoded` and body `KeyId=XX` where XX is the hex key code.

| Command | KeyId |
|---------|-------|
| Pool/Spa mode toggle | 07 |
| Filter | 08 |
| Lights | 09 |
| Spa Lights (AUX1) | 0A |
| Waterfall (AUX2) | 0B |
| Solar Heater (VALVE3) | 11 |

Commands are simple toggle keypresses. The gateway processes one at a time.

## In-Memory State Model

```js
{
  mode: "pool" | "spa" | null,
  equipment: {
    filter:      { on: boolean | null },
    lights:      { on: boolean | null },
    spaLights:   { on: boolean | null },
    waterfall:   { on: boolean | null },
    solarHeater: { on: boolean | null },
    heater:      { on: boolean | null },   // read-only, no control endpoint
  },
  sensors: {
    airTemp:         number | null,
    poolTemp:        number | null,
    spaTemp:         number | null,
    saltLevel:       number | null,
    poolChlorinator: string | null,
    spaChlorinator:  string | null,
    filterSpeed:     string | null,
    heaterMode:      string | null,
  },
  lastUpdated: string | null  // ISO 8601 timestamp
}
```

- All values initialize as `null`
- Equipment states update every poll from LED data (reliable, set to `true` or `false` on each poll)
- Sensor values update individually as their LCD screen cycles past
- `lastUpdated` reflects the timestamp of the last successful gateway poll

## Background Poller

- POSTs to `{GATEWAY_URL}/WNewSt.htm` every 500ms (configurable via `POLL_INTERVAL`)
- Parses the HTML response:
  1. Extracts body content between `<body>` and `</body>` tags
  2. Splits on `xxx` delimiters to get LCD Line 1, LCD Line 2, and LED data
  3. Strips `&#176;` (degree symbol) HTML entities from LCD text
  4. Parses LCD lines for sensor data using prefix matching on Line 1 (trimmed, first ~6 chars):
     - `"Air Te"` → airTemp parsed as number from Line 1 (e.g., "Air Temp 85" — value embedded in label line)
     - `"Pool T"` → poolTemp parsed as number from Line 1 (e.g., "Pool Temp 78")
     - `"Spa Te"` → spaTemp parsed as number from Line 1 (e.g., "Spa Temp 92")
     - `"Salt L"` → saltLevel parsed as number from Line 2
     - `"Pool C"` → poolChlorinator from Line 2 (string, e.g., "60%")
     - `"Spa Ch"` → spaChlorinator from Line 2 (string)
     - `"Filter"` → filterSpeed from Line 2 (string, e.g., "50% Speed2")
     - `"Heater"` → heaterMode from Line 2 (string, e.g., "Off")
     - Other screens (e.g., date display) are ignored
  5. Decodes LED nibble data to determine equipment on/off states (see LED encoding above)
- On poll failure: logs error, retries on next interval, no crash or backoff (gateway is local)

## REST API Endpoints

### Status

**`GET /api/status`**

Returns the full state object.

Response: `200 OK`
```json
{
  "mode": "pool",
  "equipment": {
    "filter": { "on": true },
    "lights": { "on": false },
    "spaLights": { "on": false },
    "waterfall": { "on": false },
    "solarHeater": { "on": true },
    "heater": { "on": false }
  },
  "sensors": {
    "airTemp": 85,
    "poolTemp": 78,
    "spaTemp": null,
    "saltLevel": 3000,
    "poolChlorinator": "60%",
    "spaChlorinator": null,
    "filterSpeed": "50% Speed2",
    "heaterMode": "Off"
  },
  "lastUpdated": "2026-03-14T12:00:00.000Z"
}
```

### Health

**`GET /api/health`**

Response: `200 OK`
```json
{
  "ok": true,
  "polling": true,
  "lastUpdated": "2026-03-14T12:00:00.000Z"
}
```

### Commands

All commands are `POST` requests with no body required.

| Endpoint | Action | KeyId |
|----------|--------|-------|
| `POST /api/command/mode` | Toggle pool/spa | 07 |
| `POST /api/command/filter` | Toggle filter | 08 |
| `POST /api/command/lights` | Toggle lights | 09 |
| `POST /api/command/spaLights` | Toggle spa lights | 0A |
| `POST /api/command/waterfall` | Toggle waterfall | 0B |
| `POST /api/command/solarHeater` | Toggle solar heater | 11 |

**Success response:** `200 OK`
```json
{ "success": true, "command": "filter" }
```

**Command already in progress:** `429 Too Many Requests`
```json
{ "success": false, "error": "Command in progress, try again" }
```

**Gateway unreachable:** `503 Service Unavailable`
```json
{ "success": false, "error": "Gateway unavailable" }
```

### Command Queue

- A simple mutex/lock — only one command at a time
- After sending a keypress, the lock is held for ~500ms to allow the gateway to process before releasing
- Subsequent requests during this window receive `429`

## Configuration

Environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_URL` | Yes | — | Gateway base URL (e.g., `http://10.33.103.24`) |
| `PORT` | No | `3000` | API listen port |
| `POLL_INTERVAL` | No | `500` | Polling interval in ms |

## Project Structure

```
pool-control/
├── src/
│   ├── index.js              # Express app entry point, starts poller
│   ├── poller.js             # Background gateway poller loop
│   ├── state.js              # In-memory state object
│   ├── gateway.js            # Low-level HTTP communication with gateway
│   ├── parser.js             # HTML + LED response parsing
│   ├── commands.js           # Command queue + execution
│   └── routes.js             # Express route definitions
├── package.json
├── Dockerfile
├── docker-compose.yaml
├── .env.example
└── legacy/                   # Old C# code for reference
    ├── Program.cs
    ├── pool.csproj
    ├── docker/
    └── .vscode/
```

## Docker

- **Base image:** Node 20 Alpine
- **Exposed port:** 3000 (configurable via PORT)
- **Environment:** GATEWAY_URL passed via docker-compose or `-e` flag

## Dependencies

- `express` — HTTP server
- `node-html-parser` — HTML parsing (lightweight, fast)

## Future Work (TODO)

- **Filter speed control** — multi-step menu navigation (MENU → navigate → PLUS/MINUS → back out) to adjust filter speed
- **Temperature set point control** — similar multi-step menu navigation to change pool/spa temperature set points
- **WebSocket/SSE support** — real-time push to clients for live dashboards
- **Home Assistant custom integration** — native HA integration instead of REST sensor configuration

## No Auth

No authentication layer. The API runs on the local network; HTTPS and access control are handled externally at the reverse proxy level.
