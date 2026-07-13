# pool-control

Local REST API and Home Assistant integration for Hayward **AquaConnect** pool gateways.

The AquaConnect gateway exposes no real API — just an ancient HTML page (`WNewSt.htm`) that mirrors the pool panel's LCD display, LED indicators, and buttons. This project turns that page into a proper local API, and ships a Home Assistant integration that consumes it.

```
┌──────────────────┐  poll/keypress  ┌──────────────┐  GET /api/status   ┌────────────────┐
│ AquaConnect      │ <─────────────  │ pool-control │ <────────────────  │ Home Assistant │
│ gateway (HTML)   │  ─────────────> │ API (Node)   │  ────────────────> │ integration    │
└──────────────────┘                 └──────────────┘  POST /api/command └────────────────┘
```

The API runs standalone (Docker or Node) on your network — **not** inside Home Assistant. The HA integration is a thin client that polls it.

## Features

- **Sensors**: pool/spa/air temperature, salt level, chlorinator %, filter speed, heater mode
- **Equipment control**: pool/spa mode, filter, lights, spa lights, waterfall, solar heater (toggle)
- **Heat set points** (read-only): spa/pool heater and solar set points, read by navigating the gateway's settings menu
- **System warnings**: "Check System" flag (from the LED status byte) plus the warning message text (e.g. "Inspect Cell")

## API service

### Run with Docker Compose

```yaml
services:
  pool-control:
    image: # build from this repo
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      - GATEWAY_URL=http://your-gateway-host
```

```sh
GATEWAY_URL=http://your-gateway-host docker compose up -d
```

### Run directly

```sh
npm install
GATEWAY_URL=http://your-gateway-host node src/index.js
```

### Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_URL` | Yes | — | AquaConnect gateway base URL |
| `PORT` | No | `3000` | API listen port |
| `POLL_INTERVAL` | No | `500` | Gateway poll interval (ms) |
| `HEAT_SETTINGS_INTERVAL` | No | `3600` | Seconds between automatic heat set point fetches |

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Full pool state (mode, equipment, sensors, heat settings, system warnings) |
| `GET /api/health` | Health check |
| `GET /api/heat-settings` | Fetch heat set points now (navigates the gateway menu, takes ~10s) |
| `POST /api/command/mode` | Toggle pool/spa mode |
| `POST /api/command/filter` | Toggle filter |
| `POST /api/command/lights` | Toggle lights |
| `POST /api/command/spaLights` | Toggle spa lights |
| `POST /api/command/waterfall` | Toggle waterfall |
| `POST /api/command/solarHeater` | Toggle solar heater |

Example status response:

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
    "airTemp": 102,
    "poolTemp": 85,
    "spaTemp": null,
    "saltLevel": 3800,
    "poolChlorinator": "100%",
    "spaChlorinator": null,
    "filterSpeed": "95% Valve3",
    "heaterMode": "Auto Control"
  },
  "system": { "checkSystem": true, "message": "Inspect Cell" },
  "heatSettings": {
    "spaHeater": { "enabled": true, "setPoint": 96 },
    "poolHeater": { "enabled": false, "setPoint": null },
    "spaSolar": { "enabled": false, "setPoint": null },
    "poolSolar": { "enabled": true, "setPoint": 90 },
    "lastUpdated": "2026-07-13T22:43:04.447Z"
  },
  "lastUpdated": "2026-07-13T22:45:01.123Z"
}
```

Sensor values populate as the gateway's LCD cycles through its screens (one full cycle takes about a minute). Spa readings stay `null` while in pool mode and vice versa. Commands are toggles — the gateway has no absolute on/off.

**No auth**: the API is meant for your LAN. Put it behind a reverse proxy if you need TLS or access control.

## Home Assistant integration

The `aquaconnect_control` custom integration connects HA to the API above.

### Install via HACS

1. HACS → Integrations → ⋮ → **Custom repositories**
2. Add `https://github.com/taylorbird/pool-control` as type **Integration**
3. Install **AquaConnect Control**, restart HA
4. Settings → Devices & Services → **Add Integration** → "AquaConnect Control"
5. Enter the API URL (e.g. `http://pool-control:3000`) and scan interval

### Entities

One "AquaConnect Control" device with:

- 9 sensors (temperatures, salt, chlorinators, filter speed, heater mode, system message)
- 4 heat set point sensors (with an `enabled` attribute; `Unknown` when the setting is Off)
- 6 switches (pool/spa mode, filter, lights, spa lights, waterfall, solar heater)
- 1 binary sensor: **Check System** (device class `problem`, with the warning text as a `message` attribute)

## How it talks to the gateway

Everything goes through `POST {GATEWAY_URL}/WNewSt.htm`:

- **Reading**: body `Update Local Server&` returns the two LCD lines plus an LED state string. Each character encodes two button LEDs as hex nibbles (`3`=unused, `4`=off, `5`=on, `6`=blink); the final nibble is a control flag that signals the "Check System" warning.
- **Commands**: body `KeyId=XX` presses a virtual panel button (e.g. `08` = filter, `02` = MENU, `01` = RIGHT).
- **Heat set points**: not part of the LCD cycle — the API presses MENU, arrows through the four settings screens, reads each value, and backs out. The background poller pauses during this sequence.

Full protocol notes live in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Development

```sh
npm install
npx jest                          # API tests

python3 -m venv .venv
.venv/bin/pip install homeassistant pytest pytest-asyncio aiohttp
.venv/bin/python -m pytest tests/ha/   # HA integration tests
```

The original C# console app this grew out of is preserved in [`legacy/`](legacy/).

## Roadmap

- Write support for heat set points (PLUS/MINUS keypresses) with HA `number`/`climate` entities
- Filter speed (VSP) control
- Super Chlorinate control
