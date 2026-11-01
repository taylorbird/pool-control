# pool-control

Local REST API and Home Assistant integration for Hayward **AquaConnect** pool gateways.

The AquaConnect gateway exposes no real API — just an ancient HTML page (`WNewSt.htm`) that mirrors the pool panel's LCD display, LED indicators, and buttons. This project turns that page into a proper local API, and ships a Home Assistant integration that consumes it.

```
┌──────────────────┐  poll/keypress  ┌──────────────┐  GET /api/status   ┌────────────────┐
│ AquaConnect      │ <─────────────  │ pool-control │ <────────────────  │ Home Assistant │
│ gateway (HTML)   │  ─────────────> │ API (Node)   │  ────────────────> │ integration    │
└──────────────────┘                 └──────────────┘  POST /api/command └────────────────┘
```

This repo is the **API service** (Docker image: [`taylorlbird/pool-control`](https://hub.docker.com/r/taylorlbird/pool-control)). It runs standalone on your network — **not** inside Home Assistant. The Home Assistant integration is a thin client that polls it and lives in its own repo: [**ha-aquaconnect-control**](https://github.com/taylorbird/ha-aquaconnect-control).

## Features

- **Sensors**: pool/spa/air temperature, salt level, chlorinator %, filter speed, heater mode
- **Equipment control**: pool/spa mode, filter, lights, spa lights, waterfall, solar heater (toggle)
- **Heat set points** (read-only): spa/pool heater and solar set points, read by navigating the gateway's settings menu
- **System warnings**: "Check System" flag (from the LED status byte) plus the warning message text (e.g. "Inspect Cell")

## Run with Docker Compose (recommended)

Drop this `docker-compose.yaml` anywhere on the host that should run the API (no need to clone the repo):

```yaml
services:
  pool-control:
    image: taylorlbird/pool-control:latest
    container_name: pool-control
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GATEWAY_URL=http://your-gateway-host   # AquaConnect gateway URL
      # - POLL_INTERVAL=15000                  # optional, ms (idle poll rate)
      # - HEAT_SETTINGS_INTERVAL=3600          # optional, seconds
      # - STATUS_PAGE_CONTROLS=true            # optional, enable toggle buttons on the status page
```

```sh
docker compose up -d
curl http://localhost:3000/api/health
```

Sensor values fill in over the first minute as the gateway's LCD cycles.

## Other ways to run

**Build the image from source:**

```sh
docker build -t pool-control .
docker run -d -p 3000:3000 -e GATEWAY_URL=http://your-gateway-host pool-control
```

**Run directly with Node 20+:**

```sh
npm install
GATEWAY_URL=http://your-gateway-host node src/index.js
```

### Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_URL` | Yes | — | AquaConnect gateway base URL |
| `PORT` | No | `3000` | API listen port |
| `POLL_INTERVAL` | No | `15000` | Idle gateway poll interval (ms). The gateway is a small embedded server that locks up under sustained load — don't set this low. |
| `FAST_POLL_INTERVAL` | No | `1000` | Poll interval (ms) used briefly after a command, so the new equipment state shows up quickly |
| `FAST_POLL_DURATION` | No | `10000` | How long (ms) fast polling lasts after each command |
| `HEAT_SETTINGS_INTERVAL` | No | `3600` | Seconds between automatic heat set point fetches |
| `STATUS_PAGE_CONTROLS` | No | `false` | Render tap-to-toggle equipment buttons on the status page (`/`). The command API is available regardless. |

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

The companion HACS integration lives at [**taylorbird/ha-aquaconnect-control**](https://github.com/taylorbird/ha-aquaconnect-control). Install it via HACS (custom repository), point it at this API's URL, and you get sensors for every reading, switches for every piece of equipment, and a Check System problem sensor — see that repo's README for details.

## How it talks to the gateway

Everything goes through `POST {GATEWAY_URL}/WNewSt.htm`:

- **Reading**: body `Update Local Server&` returns the two LCD lines plus an LED state string. Each character encodes two button LEDs as hex nibbles (`3`=unused, `4`=off, `5`=on, `6`=blink); the final nibble is a control flag that signals the "Check System" warning.
- **Commands**: body `KeyId=XX` presses a virtual panel button (e.g. `08` = filter, `02` = MENU, `01` = RIGHT).
- **Heat set points**: not part of the LCD cycle — the API presses MENU, arrows through the four settings screens, reads each value, and backs out. The background poller pauses during this sequence.

Full protocol notes live in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Development

```sh
npm install
npx jest
```

The original C# console app this grew out of is preserved in [`legacy/`](legacy/).

## Roadmap

- Write support for heat set points (PLUS/MINUS keypresses) with HA `number`/`climate` entities
- Filter speed (VSP) control
- Super Chlorinate control
