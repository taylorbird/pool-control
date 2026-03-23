# Heat Settings Read-Only Display — Design Spec

## Overview

Add the ability to read and display pool/spa heater and solar heat set points from the AquaConnect gateway. These values are not part of the normal LCD cycling display — they require navigating into the Settings Menu, reading 4 screens, and backing out.

This spec covers:
1. A new Node API endpoint (`GET /api/heat-settings`) that performs the menu navigation
2. Periodic background fetching via the existing poller
3. Four new HA sensor entities for the heat settings

Future work (out of scope): editing set points via PLUS/MINUS keys.

## Gateway Menu Navigation

The heat settings live behind a menu sequence. Starting from the default cycling display:

1. Send **MENU** (`KeyId=02`) repeatedly until LCD shows `"Settings"` / `"Menu"`
2. First screen after entering: **Spa Heater1** — line 2 is the set point
3. Send **RIGHT** (`KeyId=01`) → **Pool Heater1** — line 2 is the set point
4. Send **RIGHT** (`KeyId=01`) → **Spa Solar** — line 2 is the set point
5. Send **RIGHT** (`KeyId=01`) → **Pool Solar** — line 2 is the set point
6. Send **MENU** (`KeyId=02`) repeatedly until LCD shows `"Default"` / `"Menu"`, then one more MENU to return to cycling display

### Navigation Key Codes

| Key | KeyId |
|-----|-------|
| MENU | 02 |
| RIGHT | 01 |
| LEFT | 03 |
| PLUS | 06 |
| MINUS | 05 |

### Screen Values

Values are wrapped in `<span class="WBON">...</span>` tags within the LCD line 2 content. They can be:
- A temperature: `96°F` (with HTML entity `&#176;`)
- `Off` (feature disabled)

### Observed Example

| Screen | Line 1 | Line 2 (raw) |
|--------|--------|---------------|
| Spa Heater1 | `Spa Heater1` | `96°F` |
| Pool Heater1 | `Pool Heater1` | `Off` |
| Spa Solar | `Spa Solar` | `Off` |
| Pool Solar | `Pool Solar` | `89°F` |

## Node API Changes

### New Endpoint: `GET /api/heat-settings`

Returns the current heat settings by navigating the gateway menu.

**Response:**

```json
{
  "spaHeater": { "enabled": true, "setPoint": 96 },
  "poolHeater": { "enabled": false, "setPoint": null },
  "spaSolar": { "enabled": false, "setPoint": null },
  "poolSolar": { "enabled": true, "setPoint": 89 },
  "lastUpdated": "2026-03-22T22:30:00.000Z"
}
```

**Error responses:**
- `503` — gateway unreachable or menu navigation failed
- `429` — another heat settings fetch (or command) is already in progress

### Menu Navigation Logic (`src/heat-settings.js`)

New module that performs the full menu navigation sequence:

1. **Pause the poller** — call `poller.stop()` to prevent concurrent gateway access
2. **Navigate to Settings Menu:**
   - Send MENU (`KeyId=02`), wait, poll screen
   - Repeat until line 1 contains `"Settings"` and line 2 contains `"Menu"` (max 10 attempts)
   - If not found, abort and resume poller
3. **Read first screen** — poll to get Spa Heater1 value (should already be showing after entering Settings)
4. **Send RIGHT, poll** — read Pool Heater1
5. **Send RIGHT, poll** — read Spa Solar
6. **Send RIGHT, poll** — read Pool Solar
7. **Navigate back to Default Menu:**
   - Send MENU, wait, poll screen
   - Repeat until line 1 contains `"Default"` and line 2 contains `"Menu"` (max 10 attempts)
   - Send one more MENU to return to cycling display
8. **Resume poller** — call `poller.start()`

**Timing:** 500ms delay between each command send and the subsequent screen read. Total sequence ~6-8 seconds.

**Parsing set point values:**
- Strip `<span>` tags and HTML entities from line 2
- If value is `"Off"` → `{ enabled: false, setPoint: null }`
- Otherwise parse integer from temperature string → `{ enabled: true, setPoint: <number> }`

### State Changes (`src/state.js`)

Add `heatSettings` to the state object:

```js
heatSettings: {
  spaHeater: { enabled: null, setPoint: null },
  poolHeater: { enabled: null, setPoint: null },
  spaSolar: { enabled: null, setPoint: null },
  poolSolar: { enabled: null, setPoint: null },
  lastUpdated: null,
}
```

New method: `updateHeatSettings(settings)` — updates all four values and the heat settings timestamp.

The heat settings are included in `getSnapshot()` and thus in `GET /api/status` responses.

### Poller Changes (`src/poller.js`)

Add periodic heat settings fetching:

- New option: `heatSettingsInterval` (seconds, default 3600, from `HEAT_SETTINGS_INTERVAL` env var)
- Track `lastHeatSettingsFetch` timestamp
- On each poll cycle, check if enough time has elapsed since last fetch
- When due: call the heat settings fetch function (which pauses/resumes the poller internally)
- Also fetch on first startup (after a short delay to let normal polling establish state)

### Route Changes (`src/routes.js`)

- `GET /api/heat-settings` — triggers an immediate heat settings fetch, returns the result
  - Returns `429` if a fetch is already in progress (reuse command queue busy pattern)
  - Returns `503` if navigation fails

### Gateway Changes (`src/gateway.js`)

No changes needed — `sendCommand(keyId)` and `pollGateway()` already provide the primitives.

### Parser Changes (`src/parser.js`)

New function: `parseHeatSettingValue(line2)`
- Strip `<span>` tags (any class) from the raw text
- Strip HTML entities (`&#176;`) and unicode degree symbols
- Strip `F` suffix
- Trim whitespace
- If result is `"Off"` → `{ enabled: false, setPoint: null }`
- Otherwise parse integer → `{ enabled: true, setPoint: <number> }`

## HA Integration Changes

### API Client (`api.py`)

New method:

```python
async def get_heat_settings(self) -> dict:
    """Fetch heat settings from the API."""
    return await self._get("/api/heat-settings")
```

### Coordinator (`coordinator.py`)

Update `_async_update_data()` to include heat settings from `GET /api/status` (which now contains `heatSettings` in its response). No separate API call needed — the poller keeps them fresh in state.

### New Sensor Definitions (`const.py`)

Four new sensors:

| Key | Name | Device Class | Unit | Path |
|-----|------|-------------|------|------|
| `spa_heater_set_point` | Spa Heater Set Point | `temperature` | `°F` | `heatSettings.spaHeater` |
| `pool_heater_set_point` | Pool Heater Set Point | `temperature` | `°F` | `heatSettings.poolHeater` |
| `spa_solar_set_point` | Spa Solar Set Point | `temperature` | `°F` | `heatSettings.spaSolar` |
| `pool_solar_set_point` | Pool Solar Set Point | `temperature` | `°F` | `heatSettings.poolSolar` |

### Sensor Entity Display Logic

These sensors have a compound value (`enabled` + `setPoint`). The sensor's `native_value` should be:
- The `setPoint` number when `enabled` is `true`
- `None` when `enabled` is `false` (HA shows "Unavailable" or we can use a custom state)

To display "Off" rather than "Unavailable", use an `extra_state_attributes` approach:
- `native_value`: the set point number, or `None`
- `extra_state_attributes`: `{ "enabled": true/false }`

Alternatively, create these as a new `HeatSettingSensor` subclass that returns `"Off"` as a string state when disabled and the temperature when enabled. In this case, `device_class` should only be set to `temperature` when the value is numeric — or we skip `device_class` and just set the `unit_of_measurement` manually when enabled.

**Recommended approach:** Use `native_value` of the set point number when enabled, `None` when disabled. HA will show "Unknown" for `None`. Add `enabled` as an extra state attribute. Users can customize display in their dashboards. This is the simplest approach that follows HA conventions.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEAT_SETTINGS_INTERVAL` | `3600` | Seconds between automatic heat settings fetches |

## Testing

### Node API Tests

- `test/heat-settings.test.js`:
  - Parses temperature set point values (e.g., `96°F` → `{ enabled: true, setPoint: 96 }`)
  - Parses "Off" values → `{ enabled: false, setPoint: null }`
  - Menu navigation sequence sends correct KeyIds in order
  - Handles navigation timeout (can't find Settings Menu)
  - Handles navigation back timeout (can't find Default Menu)
  - Pauses and resumes poller during fetch
  - Returns 429 when fetch already in progress
- `test/parser.test.js`:
  - New tests for `parseHeatSettingValue()`
- `test/state.test.js`:
  - New tests for `updateHeatSettings()` and snapshot inclusion
- `test/routes.test.js`:
  - New tests for `GET /api/heat-settings` endpoint

### HA Integration Tests

- `tests/ha/test_sensor.py`:
  - New heat setting sensor entities created
  - Display correct values from coordinator data
  - Display None when disabled

## File Changes Summary

### New Files
- `src/heat-settings.js` — menu navigation and heat settings fetch logic

### Modified Files
- `src/parser.js` — add `parseHeatSettingValue()`
- `src/state.js` — add `heatSettings` to state, add `updateHeatSettings()`
- `src/poller.js` — add periodic heat settings fetch trigger
- `src/routes.js` — add `GET /api/heat-settings` route
- `src/index.js` — wire up heat settings module, pass poller reference
- `custom_components/aquaconnect_control/const.py` — add 4 sensor definitions
- `custom_components/aquaconnect_control/api.py` — add `get_heat_settings()`
- `custom_components/aquaconnect_control/sensor.py` — handle compound heat setting values
