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

All communication with the gateway is via HTTP POST to `{GATEWAY_URL}/WNewSt.htm`.

### Reading State

POST body: `"Update Local Server&"`

Response is HTML with a `<body>` containing three sections separated by `xxx` delimiters:

1. **LCD Line 1** — display text (e.g., `"    Air Temp     "`)
2. **LCD Line 2** — display value (e.g., `"      85 F        "`)
3. **LED state string** — encoded nibble data representing button LED states

The LCD cycles through multiple screens showing different sensor readings. Each poll captures whatever screen is currently displayed.

**LED state encoding:**
- Each byte in the LED string encodes two button states (high nibble + low nibble)
- Nibble values: `3` = NOKEY (unused), `4` = OFF, `5` = ON, `6` = BLINK
- The last nibble is a control byte (not a button state)

**Button-to-LED mapping:**

| Button | Key Element | KeyId | Purpose |
|--------|-------------|-------|---------|
| POOL | Key_00 | 07 | Mode toggle |
| SPA | Key_01 | 07 | Mode toggle (same key) |
| FILTER | Key_03 | 08 | Filter on/off |
| LIGHTS | Key_04 | 09 | Pool lights on/off |
| HEATER1 | Key_06 | 13 | Heater (read-only) |
| VALVE3 | Key_07 | 11 | Solar heater on/off |
| AUX1 | Key_09 | 0A | Spa lights on/off |
| AUX2 | Key_10 | 0B | Waterfall on/off |

### Sending Commands

POST body: `"KeyId=XX&"` where XX is the hex key code from the table above.

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
- Equipment states update every poll from LED data (reliable)
- Sensor values update individually as their LCD screen cycles past
- `lastUpdated` reflects the timestamp of the last successful gateway poll

## Background Poller

- POSTs to `{GATEWAY_URL}/WNewSt.htm` every 500ms (configurable via `POLL_INTERVAL`)
- Parses the HTML response:
  1. Extracts body content between `<body>` and `</body>` tags
  2. Splits on `xxx` delimiters to get LCD Line 1, LCD Line 2, and LED data
  3. Parses LCD lines for sensor data using prefix matching on Line 1 (first ~6 chars):
     - `"Air Te"` → airTemp from Line 2
     - `"Pool T"` → poolTemp from Line 2
     - `"Spa Te"` → spaTemp from Line 2
     - `"Salt L"` → saltLevel from Line 2
     - `"Pool C"` → poolChlorinator from Line 2
     - `"Spa Ch"` → spaChlorinator from Line 2
     - `"Filter"` → filterSpeed from Line 2
     - `"Heater"` → heaterMode from Line 2
  4. Decodes LED nibble data to determine equipment on/off states
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
    "heaterMode": "Off",
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
- `node-html-parser` or `cheerio` — HTML parsing (lightweight; node-html-parser preferred for speed)

## Future Work (TODO)

- **Filter speed control** — multi-step menu navigation (MENU → navigate → PLUS/MINUS → back out) to adjust filter speed
- **Temperature set point control** — similar multi-step menu navigation to change pool/spa temperature set points
- **WebSocket/SSE support** — real-time push to clients for live dashboards
- **Home Assistant custom integration** — native HA integration instead of REST sensor configuration

## No Auth

No authentication layer. The API runs on the local network; HTTPS and access control are handled externally at the reverse proxy level.
