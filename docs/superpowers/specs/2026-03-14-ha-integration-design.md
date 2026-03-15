# AquaConnect Control — Home Assistant Integration Design Spec

## Overview

A custom Home Assistant integration that connects to the pool-control-api (a Node/Express REST API wrapping a Hayward AquaConnect pool gateway). Users run the API themselves and configure this integration to point at it. Installable via HACS.

The integration provides 8 sensors for pool readings and 6 switches for equipment control, all grouped under a single "AquaConnect Control" device.

## Architecture

```
┌──────────────────────┐       GET /api/status        ┌──────────────────┐
│  HA Integration      │  ──────────────────────────>  │  pool-control-api│
│  (DataUpdateCoord.)  │  <──────────────────────────  │  (Node/Express)  │
│                      │       JSON response           │                  │
│  Switches ───────────│──> POST /api/command/:action  │                  │
└──────────────────────┘                               └──────────────────┘
```

- **DataUpdateCoordinator** polls `GET /api/status` every N seconds (default 10, configurable)
- All entities read from the coordinator's cached data — one API call serves all entities
- Switches send `POST /api/command/:action` via a shared API client, then trigger a coordinator refresh

## Project Structure

```
pool-control/
├── custom_components/
│   └── aquaconnect_control/
│       ├── __init__.py          # Integration setup, creates coordinator
│       ├── manifest.json        # HA integration manifest
│       ├── config_flow.py       # UI config flow (enter URL, validate)
│       ├── const.py             # Constants (domain, defaults, keys)
│       ├── coordinator.py       # DataUpdateCoordinator (polls API)
│       ├── api.py               # Async API client (aiohttp wrapper)
│       ├── sensor.py            # Sensor entities
│       ├── switch.py            # Switch entities
│       └── strings.json         # UI strings for config flow
├── hacs.json                    # HACS manifest at repo root
└── ... (existing API code)
```

## API Client (`api.py`)

A thin async wrapper around `aiohttp.ClientSession`:

```python
class AquaConnectApiClient:
    def __init__(self, host: str, session: aiohttp.ClientSession):
        self._host = host.rstrip("/")
        self._session = session

    async def get_status(self) -> dict:
        """GET /api/status — returns full pool state."""

    async def get_health(self) -> dict:
        """GET /api/health — returns health check for validation."""

    async def send_command(self, action: str) -> dict:
        """POST /api/command/{action} — toggles equipment."""
```

- Uses HA's `async_get_clientsession()` for the aiohttp session (HA manages lifecycle)
- Raises `AquaConnectApiError` on non-200 responses or connection failures
- Timeout: 10 seconds per request

## Config Flow (`config_flow.py`)

**Step 1 — User setup:**

User navigates to Integrations → Add → "AquaConnect Control" and sees a form with:

| Field | Type | Default | Required |
|-------|------|---------|----------|
| Host | string | — | Yes |
| Scan Interval | integer | 10 | No |

**Host** is the base URL of the pool-control-api (e.g., `http://pool-control:3000`).

**Validation:**
- Calls `GET /api/health` on the provided host
- Success: response contains `{ "ok": true }`
- Failure: shows error "Cannot connect to AquaConnect Control API"
- Also checks for duplicate entries (same host already configured)

**On success:**
- Stores `host` and `scan_interval` in the config entry
- Creates the integration with a unique ID based on the host

## DataUpdateCoordinator (`coordinator.py`)

```python
class AquaConnectCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, api_client, scan_interval):
        super().__init__(
            hass,
            logger,
            name="AquaConnect Control",
            update_interval=timedelta(seconds=scan_interval),
        )
        self.api_client = api_client

    async def _async_update_data(self) -> dict:
        """Fetch latest status from the API."""
        try:
            return await self.api_client.get_status()
        except AquaConnectApiError as err:
            raise UpdateFailed(f"Error communicating with API: {err}")
```

- Returns the full `/api/status` JSON response as `self.data`
- On failure, raises `UpdateFailed` which makes all entities show as `unavailable`
- Entities access data via `self.coordinator.data`

## Integration Setup (`__init__.py`)

1. Creates the API client with `async_get_clientsession(hass)`
2. Creates the coordinator with configured scan interval
3. Calls `coordinator.async_config_entry_first_refresh()` to validate connectivity
4. Forwards setup to entity platforms: `sensor`, `switch`

Unload tears down platforms and stops the coordinator.

## Entities

All entities extend `CoordinatorEntity` to automatically:
- Update when the coordinator fetches new data
- Show as `unavailable` when the coordinator fails
- Register for coordinator updates without manual polling

### Device Info

All entities belong to a single device:

```python
{
    "identifiers": {(DOMAIN, entry.entry_id)},
    "name": "AquaConnect Control",
    "manufacturer": "Hayward",
    "model": "AquaConnect",
}
```

### Sensors (8)

| Entity ID | Name | Source | Device Class | Unit | State Class |
|-----------|------|--------|-------------|------|-------------|
| `sensor.pool_temperature` | Pool Temperature | `sensors.poolTemp` | `temperature` | °F | `measurement` |
| `sensor.spa_temperature` | Spa Temperature | `sensors.spaTemp` | `temperature` | °F | `measurement` |
| `sensor.air_temperature` | Air Temperature | `sensors.airTemp` | `temperature` | °F | `measurement` |
| `sensor.salt_level` | Salt Level | `sensors.saltLevel` | — | PPM | `measurement` |
| `sensor.filter_speed` | Filter Speed | `sensors.filterSpeed` | — | — | — |
| `sensor.pool_chlorinator` | Pool Chlorinator | `sensors.poolChlorinator` | — | — | — |
| `sensor.spa_chlorinator` | Spa Chlorinator | `sensors.spaChlorinator` | — | — | — |
| `sensor.heater_mode` | Heater Mode | `sensors.heaterMode` | — | — | — |

When a sensor value is `null` in the API response (not yet seen on LCD cycle), the entity reports `None` (shows as "Unknown" in HA). Once a value appears, it persists until replaced.

### Switches (6)

| Entity ID | Name | State Source | Command |
|-----------|------|-------------|---------|
| `switch.pool_spa_mode` | Pool/Spa Mode | `mode == "spa"` | `mode` |
| `switch.filter` | Filter | `equipment.filter.on` | `filter` |
| `switch.lights` | Lights | `equipment.lights.on` | `lights` |
| `switch.spa_lights` | Spa Lights | `equipment.spaLights.on` | `spaLights` |
| `switch.waterfall` | Waterfall | `equipment.waterfall.on` | `waterfall` |
| `switch.solar_heater` | Solar Heater | `equipment.solarHeater.on` | `solarHeater` |

**Switch behavior:**
- `turn_on` and `turn_off` both send the same `POST /api/command/{action}` — the gateway is a toggle
- After sending the command, the switch calls `coordinator.async_request_refresh()` to immediately poll for updated state
- If the API returns 429 (command in progress), the switch logs a warning but does not raise an error — the coordinator will pick up the state on next poll
- State is read from `coordinator.data`, not tracked locally

**Pool/Spa Mode switch:**
- ON = Spa mode (`mode == "spa"`)
- OFF = Pool mode (`mode == "pool"`)
- Toggle sends `mode` command (KeyId 07)

## Manifests

### `manifest.json`

```json
{
  "domain": "aquaconnect_control",
  "name": "AquaConnect Control",
  "codeowners": [],
  "config_flow": true,
  "dependencies": [],
  "documentation": "",
  "iot_class": "local_polling",
  "requirements": [],
  "version": "1.0.0"
}
```

- `iot_class: local_polling` — polls a local API
- No external pip requirements — uses HA's built-in `aiohttp`

### `hacs.json`

```json
{
  "name": "AquaConnect Control",
  "content_in_root": false,
  "render_readme": true
}
```

### `strings.json`

```json
{
  "config": {
    "step": {
      "user": {
        "title": "AquaConnect Control",
        "description": "Connect to your AquaConnect Control API",
        "data": {
          "host": "API URL",
          "scan_interval": "Update interval (seconds)"
        }
      }
    },
    "error": {
      "cannot_connect": "Cannot connect to AquaConnect Control API",
      "unknown": "Unexpected error"
    },
    "abort": {
      "already_configured": "This API is already configured"
    }
  }
}
```

## Error Handling

- **API unreachable:** Coordinator raises `UpdateFailed`, all entities go `unavailable`
- **API recovers:** Next successful poll restores all entities automatically
- **Command 429 (busy):** Switch logs warning, state updates on next coordinator poll
- **Command 503 (gateway down):** Switch raises `HomeAssistantError` so HA shows a toast notification
- **Null sensor values:** Entity reports `None` (shows "Unknown" in HA UI until LCD cycles)

## No Auth

The integration does not implement authentication. The pool-control-api has no auth layer — access control is handled at the network/proxy level by the user.
