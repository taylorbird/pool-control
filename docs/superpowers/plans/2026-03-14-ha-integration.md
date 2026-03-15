# AquaConnect Control HA Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a HACS-installable Home Assistant custom integration that connects to the pool-control-api for pool monitoring and equipment control.

**Architecture:** Standard HA custom integration using DataUpdateCoordinator to poll the API, CoordinatorEntity base for all entities, config flow for UI setup, and aiohttp for async HTTP. One API call per poll interval serves all 14 entities.

**Tech Stack:** Python 3.12+, Home Assistant Core APIs (DataUpdateCoordinator, ConfigFlow, CoordinatorEntity), aiohttp, pytest

**Spec:** `docs/superpowers/specs/2026-03-14-ha-integration-design.md`

---

## File Structure

```
custom_components/aquaconnect_control/
├── __init__.py          # Integration setup/teardown
├── manifest.json        # HA integration manifest
├── const.py             # Constants (domain, defaults, sensor/switch definitions)
├── api.py               # Async API client
├── coordinator.py       # DataUpdateCoordinator
├── config_flow.py       # UI config flow
├── sensor.py            # Sensor entity platform
├── switch.py            # Switch entity platform
└── strings.json         # UI strings

hacs.json                # HACS manifest at repo root

tests/
├── __init__.py          # Package init
└── ha/
    ├── __init__.py          # Package init
    ├── conftest.py          # Shared fixtures (mock API, coordinator, hass)
    ├── test_api.py          # API client tests
    ├── test_coordinator.py  # Coordinator tests
    ├── test_config_flow.py  # Config flow tests
    ├── test_sensor.py       # Sensor entity tests
    └── test_switch.py       # Switch entity tests
```

---

## Chunk 1: Constants, API Client & Coordinator

### Task 1: Constants and manifests

**Files:**
- Create: `custom_components/aquaconnect_control/const.py`
- Create: `custom_components/aquaconnect_control/manifest.json`
- Create: `custom_components/aquaconnect_control/strings.json`
- Create: `hacs.json`

- [ ] **Step 1: Create const.py**

```python
"""Constants for the AquaConnect Control integration."""

DOMAIN = "aquaconnect_control"
DEFAULT_SCAN_INTERVAL = 10
CONF_HOST = "host"
CONF_SCAN_INTERVAL = "scan_interval"

SENSOR_DEFINITIONS = [
    {"key": "poolTemp", "name": "Pool Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "poolTemp"]},
    {"key": "spaTemp", "name": "Spa Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "spaTemp"]},
    {"key": "airTemp", "name": "Air Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "airTemp"]},
    {"key": "saltLevel", "name": "Salt Level", "device_class": None, "unit": "PPM", "state_class": "measurement", "path": ["sensors", "saltLevel"]},
    {"key": "filterSpeed", "name": "Filter Speed", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "filterSpeed"]},
    {"key": "poolChlorinator", "name": "Pool Chlorinator", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "poolChlorinator"]},
    {"key": "spaChlorinator", "name": "Spa Chlorinator", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "spaChlorinator"]},
    {"key": "heaterMode", "name": "Heater Mode", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "heaterMode"]},
]

SWITCH_DEFINITIONS = [
    {"key": "mode", "name": "Pool/Spa Mode", "command": "mode", "state_path": None},
    {"key": "filter", "name": "Filter", "command": "filter", "state_path": ["equipment", "filter", "on"]},
    {"key": "lights", "name": "Lights", "command": "lights", "state_path": ["equipment", "lights", "on"]},
    {"key": "spaLights", "name": "Spa Lights", "command": "spaLights", "state_path": ["equipment", "spaLights", "on"]},
    {"key": "waterfall", "name": "Waterfall", "command": "waterfall", "state_path": ["equipment", "waterfall", "on"]},
    {"key": "solarHeater", "name": "Solar Heater", "command": "solarHeater", "state_path": ["equipment", "solarHeater", "on"]},
]
```

- [ ] **Step 2: Create manifest.json**

Create `custom_components/aquaconnect_control/manifest.json`:

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

- [ ] **Step 3: Create strings.json**

Create `custom_components/aquaconnect_control/strings.json`:

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

- [ ] **Step 4: Create hacs.json**

Create `hacs.json` at repo root:

```json
{
  "name": "AquaConnect Control",
  "content_in_root": false,
  "render_readme": true
}
```

- [ ] **Step 5: Create empty `__init__.py`**

Create `custom_components/aquaconnect_control/__init__.py`:

```python
"""AquaConnect Control integration."""
```

This is a placeholder — full setup logic comes in Task 5.

- [ ] **Step 6: Commit**

```bash
git add custom_components/ hacs.json
git commit -m "feat: add HA integration constants, manifests, and strings"
```

---

### Task 2: API client

**Files:**
- Create: `custom_components/aquaconnect_control/api.py`
- Create: `tests/ha/conftest.py`
- Create: `tests/ha/test_api.py`

- [ ] **Step 1: Create conftest.py with shared fixtures**

Create `tests/__init__.py` and `tests/ha/__init__.py` (empty files for Python package resolution).

Create `tests/ha/conftest.py`:

```python
"""Shared test fixtures for AquaConnect Control HA integration tests."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from aiohttp import ClientSession


MOCK_STATUS_RESPONSE = {
    "mode": "pool",
    "equipment": {
        "filter": {"on": True},
        "lights": {"on": False},
        "spaLights": {"on": False},
        "waterfall": {"on": False},
        "solarHeater": {"on": True},
        "heater": {"on": False},
    },
    "sensors": {
        "airTemp": 85,
        "poolTemp": 78,
        "spaTemp": None,
        "saltLevel": 3000,
        "poolChlorinator": "60%",
        "spaChlorinator": None,
        "filterSpeed": "50% Speed2",
        "heaterMode": "Off",
    },
    "lastUpdated": "2026-03-14T12:00:00.000Z",
}

MOCK_HEALTH_RESPONSE = {
    "ok": True,
    "polling": True,
    "lastUpdated": "2026-03-14T12:00:00.000Z",
}

MOCK_COMMAND_RESPONSE = {"success": True, "command": "filter"}


@pytest.fixture
def mock_session():
    """Create a mock aiohttp ClientSession."""
    session = MagicMock(spec=ClientSession)
    return session


def create_mock_response(json_data, status=200):
    """Create a mock aiohttp response."""
    response = AsyncMock()
    response.status = status
    response.json = AsyncMock(return_value=json_data)
    response.raise_for_status = MagicMock()
    if status >= 400:
        from aiohttp import ClientResponseError
        response.raise_for_status.side_effect = ClientResponseError(
            request_info=MagicMock(), history=(), status=status
        )
    response.__aenter__ = AsyncMock(return_value=response)
    response.__aexit__ = AsyncMock(return_value=False)
    return response
```

- [ ] **Step 2: Write the failing tests**

Create `tests/ha/test_api.py`:

```python
"""Tests for AquaConnect Control API client."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from custom_components.aquaconnect_control.api import (
    AquaConnectApiClient,
    AquaConnectApiError,
    AquaConnectCommandBusyError,
)
from tests.ha.conftest import (
    MOCK_STATUS_RESPONSE,
    MOCK_HEALTH_RESPONSE,
    MOCK_COMMAND_RESPONSE,
    create_mock_response,
)


@pytest.fixture
def api_client(mock_session):
    """Create an API client with a mock session."""
    return AquaConnectApiClient("http://pool-control:3000", mock_session)


@pytest.mark.asyncio
async def test_get_status(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_STATUS_RESPONSE))
    result = await api_client.get_status()
    assert result["mode"] == "pool"
    assert result["sensors"]["poolTemp"] == 78
    mock_session.get.assert_called_once()


@pytest.mark.asyncio
async def test_get_health(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_HEALTH_RESPONSE))
    result = await api_client.get_health()
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_send_command(api_client, mock_session):
    mock_session.post = MagicMock(return_value=create_mock_response(MOCK_COMMAND_RESPONSE))
    result = await api_client.send_command("filter")
    assert result["success"] is True
    mock_session.post.assert_called_once()


@pytest.mark.asyncio
async def test_get_status_connection_error(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response({}, status=500))
    with pytest.raises(AquaConnectApiError):
        await api_client.get_status()


@pytest.mark.asyncio
async def test_send_command_429(api_client, mock_session):
    mock_session.post = MagicMock(return_value=create_mock_response(
        {"success": False, "error": "Command in progress"}, status=429
    ))
    with pytest.raises(AquaConnectCommandBusyError):
        await api_client.send_command("filter")


@pytest.mark.asyncio
async def test_host_trailing_slash_stripped(mock_session):
    client = AquaConnectApiClient("http://pool-control:3000/", mock_session)
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_HEALTH_RESPONSE))
    await client.get_health()
    call_args = mock_session.get.call_args
    url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
    assert "//" not in url.replace("http://", "", 1)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/tbird/dev/pool-control
pip install pytest pytest-asyncio aiohttp
python -m pytest tests/ha/test_api.py -v
```

Expected: FAIL — cannot import `custom_components.aquaconnect_control.api`

- [ ] **Step 4: Write implementation**

Create `custom_components/aquaconnect_control/api.py`:

```python
"""API client for AquaConnect Control."""
import asyncio
import logging

import aiohttp

_LOGGER = logging.getLogger(__name__)

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=10)


class AquaConnectApiError(Exception):
    """Exception for API errors."""


class AquaConnectCommandBusyError(AquaConnectApiError):
    """Raised when the gateway returns 429 (command in progress)."""


class AquaConnectApiClient:
    """Async client for the pool-control-api."""

    def __init__(self, host: str, session: aiohttp.ClientSession) -> None:
        self._host = host.rstrip("/")
        self._session = session

    async def get_status(self) -> dict:
        """GET /api/status — returns full pool state."""
        return await self._get("/api/status")

    async def get_health(self) -> dict:
        """GET /api/health — returns health check."""
        return await self._get("/api/health")

    async def send_command(self, action: str) -> dict:
        """POST /api/command/{action} — toggles equipment."""
        return await self._post(f"/api/command/{action}")

    async def _get(self, path: str) -> dict:
        """Make a GET request."""
        url = f"{self._host}{path}"
        try:
            async with self._session.get(url, timeout=REQUEST_TIMEOUT) as response:
                response.raise_for_status()
                return await response.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise AquaConnectApiError(f"Error fetching {path}: {err}") from err

    async def _post(self, path: str) -> dict:
        """Make a POST request."""
        url = f"{self._host}{path}"
        try:
            async with self._session.post(url, timeout=REQUEST_TIMEOUT) as response:
                if response.status == 429:
                    raise AquaConnectCommandBusyError("Command in progress")
                response.raise_for_status()
                return await response.json()
        except AquaConnectCommandBusyError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise AquaConnectApiError(f"Error posting {path}: {err}") from err
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/ha/test_api.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add custom_components/aquaconnect_control/api.py tests/ha/
git commit -m "feat: add async API client for HA integration"
```

---

### Task 3: DataUpdateCoordinator

**Files:**
- Create: `custom_components/aquaconnect_control/coordinator.py`
- Create: `tests/ha/test_coordinator.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/ha/test_coordinator.py`:

```python
"""Tests for AquaConnect Control coordinator."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import timedelta

from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.aquaconnect_control.coordinator import AquaConnectCoordinator
from custom_components.aquaconnect_control.api import AquaConnectApiError
from tests.ha.conftest import MOCK_STATUS_RESPONSE


@pytest.fixture
def mock_api():
    api = AsyncMock()
    api.get_status = AsyncMock(return_value=MOCK_STATUS_RESPONSE)
    return api


@pytest.fixture
def mock_hass():
    hass = MagicMock()
    hass.loop = AsyncMock()
    return hass


@pytest.mark.asyncio
async def test_coordinator_fetches_data(mock_hass, mock_api):
    coordinator = AquaConnectCoordinator(mock_hass, mock_api, 10)
    data = await coordinator._async_update_data()
    assert data["mode"] == "pool"
    assert data["sensors"]["poolTemp"] == 78
    mock_api.get_status.assert_called_once()


@pytest.mark.asyncio
async def test_coordinator_raises_update_failed_on_error(mock_hass, mock_api):
    mock_api.get_status.side_effect = AquaConnectApiError("Connection failed")
    coordinator = AquaConnectCoordinator(mock_hass, mock_api, 10)
    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()


@pytest.mark.asyncio
async def test_coordinator_update_interval(mock_hass, mock_api):
    coordinator = AquaConnectCoordinator(mock_hass, mock_api, 15)
    assert coordinator.update_interval == timedelta(seconds=15)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/ha/test_coordinator.py -v
```

Expected: FAIL — cannot import coordinator

Note: These tests require `homeassistant` package. Install with:
```bash
pip install homeassistant
```

- [ ] **Step 3: Write implementation**

Create `custom_components/aquaconnect_control/coordinator.py`:

```python
"""DataUpdateCoordinator for AquaConnect Control."""
import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import AquaConnectApiClient, AquaConnectApiError

_LOGGER = logging.getLogger(__name__)


class AquaConnectCoordinator(DataUpdateCoordinator):
    """Coordinator to poll the pool-control-api."""

    def __init__(
        self,
        hass: HomeAssistant,
        api_client: AquaConnectApiClient,
        scan_interval: int,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name="AquaConnect Control",
            update_interval=timedelta(seconds=scan_interval),
        )
        self.api_client = api_client

    async def _async_update_data(self) -> dict:
        """Fetch latest status from the API."""
        try:
            return await self.api_client.get_status()
        except AquaConnectApiError as err:
            raise UpdateFailed(f"Error communicating with API: {err}") from err
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ha/test_coordinator.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add custom_components/aquaconnect_control/coordinator.py tests/ha/test_coordinator.py
git commit -m "feat: add DataUpdateCoordinator for HA integration"
```

---

## Chunk 2: Config Flow & Integration Setup

### Task 4: Config flow

**Files:**
- Create: `custom_components/aquaconnect_control/config_flow.py`
- Create: `tests/ha/test_config_flow.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/ha/test_config_flow.py`:

```python
"""Tests for AquaConnect Control config flow."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from custom_components.aquaconnect_control.config_flow import AquaConnectConfigFlow
from custom_components.aquaconnect_control.const import DOMAIN, CONF_HOST, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
from custom_components.aquaconnect_control.api import AquaConnectApiError
from tests.ha.conftest import MOCK_HEALTH_RESPONSE


@pytest.fixture
def mock_api_client():
    with patch(
        "custom_components.aquaconnect_control.config_flow.AquaConnectApiClient"
    ) as mock_cls, patch(
        "custom_components.aquaconnect_control.config_flow.async_get_clientsession"
    ):
        client = AsyncMock()
        client.get_health = AsyncMock(return_value=MOCK_HEALTH_RESPONSE)
        mock_cls.return_value = client
        yield client


@pytest.mark.asyncio
async def test_flow_user_step_success(mock_api_client):
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()
    flow.hass.config_entries = MagicMock()
    flow.hass.config_entries.async_entries = MagicMock(return_value=[])
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()

    with patch.object(flow, "async_create_entry", return_value={"type": "create_entry"}) as mock_create:
        result = await flow.async_step_user(
            user_input={CONF_HOST: "http://pool-control:3000", CONF_SCAN_INTERVAL: 10}
        )
        mock_create.assert_called_once()


@pytest.mark.asyncio
async def test_flow_user_step_cannot_connect(mock_api_client):
    mock_api_client.get_health.side_effect = AquaConnectApiError("fail")
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()

    result = await flow.async_step_user(
        user_input={CONF_HOST: "http://bad-host:3000", CONF_SCAN_INTERVAL: 10}
    )
    assert result["errors"] == {"base": "cannot_connect"}


@pytest.mark.asyncio
async def test_flow_user_step_shows_form():
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()

    result = await flow.async_step_user(user_input=None)
    assert result["type"] == "form"
    # Check that CONF_HOST is in the schema (keys are vol.Required/Optional wrappers)
    schema_keys = [str(k) for k in result["data_schema"].schema]
    assert any(CONF_HOST in k for k in schema_keys)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/ha/test_config_flow.py -v
```

Expected: FAIL — cannot import config_flow

- [ ] **Step 3: Write implementation**

Create `custom_components/aquaconnect_control/config_flow.py`:

```python
"""Config flow for AquaConnect Control."""
import logging

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AquaConnectApiClient, AquaConnectApiError
from .const import DOMAIN, CONF_HOST, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


class AquaConnectConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for AquaConnect Control."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            host = user_input[CONF_HOST].rstrip("/")
            scan_interval = user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)

            # Check for duplicates
            await self.async_set_unique_id(host)
            self._abort_if_unique_id_configured()

            # Validate connection
            try:
                session = async_get_clientsession(self.hass)
                client = AquaConnectApiClient(host, session)
                health = await client.get_health()
                if not health.get("ok"):
                    raise AquaConnectApiError("Health check failed")
            except AquaConnectApiError:
                errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Unexpected error")
                errors["base"] = "unknown"
            else:
                return self.async_create_entry(
                    title="AquaConnect Control",
                    data={CONF_HOST: host, CONF_SCAN_INTERVAL: scan_interval},
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HOST): str,
                    vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): int,
                }
            ),
            errors=errors,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ha/test_config_flow.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add custom_components/aquaconnect_control/config_flow.py tests/ha/test_config_flow.py
git commit -m "feat: add config flow for HA integration setup"
```

---

### Task 5: Integration setup (`__init__.py`)

**Files:**
- Modify: `custom_components/aquaconnect_control/__init__.py`

- [ ] **Step 1: Write implementation**

Replace `custom_components/aquaconnect_control/__init__.py`:

```python
"""AquaConnect Control integration."""
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AquaConnectApiClient
from .const import DOMAIN, CONF_HOST, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
from .coordinator import AquaConnectCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "switch"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up AquaConnect Control from a config entry."""
    host = entry.data[CONF_HOST]
    scan_interval = entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)

    session = async_get_clientsession(hass)
    api_client = AquaConnectApiClient(host, session)

    coordinator = AquaConnectCoordinator(hass, api_client, scan_interval)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
```

- [ ] **Step 2: Commit**

```bash
git add custom_components/aquaconnect_control/__init__.py
git commit -m "feat: add integration setup and teardown"
```

---

## Chunk 3: Entity Platforms

### Task 6: Sensor entities

**Files:**
- Create: `custom_components/aquaconnect_control/sensor.py`
- Create: `tests/ha/test_sensor.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/ha/test_sensor.py`:

```python
"""Tests for AquaConnect Control sensor entities."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from custom_components.aquaconnect_control.sensor import AquaConnectSensor
from custom_components.aquaconnect_control.const import SENSOR_DEFINITIONS, DOMAIN
from tests.ha.conftest import MOCK_STATUS_RESPONSE


@pytest.fixture
def mock_coordinator():
    coordinator = MagicMock()
    coordinator.data = MOCK_STATUS_RESPONSE
    return coordinator


@pytest.fixture
def mock_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry_123"
    return entry


def test_sensor_pool_temp(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[0]  # poolTemp
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 78
    assert sensor.name == "Pool Temperature"
    assert sensor.native_unit_of_measurement == "°F"
    assert sensor.device_class == "temperature"
    assert sensor.state_class == "measurement"


def test_sensor_salt_level(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[3]  # saltLevel
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 3000
    assert sensor.native_unit_of_measurement == "PPM"


def test_sensor_filter_speed(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[4]  # filterSpeed
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == "50% Speed2"
    assert sensor.native_unit_of_measurement is None
    assert sensor.device_class is None


def test_sensor_null_value(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[1]  # spaTemp
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value is None


def test_sensor_device_info(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[0]
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    device_info = sensor.device_info
    assert (DOMAIN, "test_entry_123") in device_info["identifiers"]
    assert device_info["name"] == "AquaConnect Control"
    assert device_info["manufacturer"] == "Hayward"


def test_sensor_unique_id(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[0]  # poolTemp
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.unique_id == "test_entry_123_poolTemp"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/ha/test_sensor.py -v
```

Expected: FAIL — cannot import sensor

- [ ] **Step 3: Write implementation**

Create `custom_components/aquaconnect_control/sensor.py`:

```python
"""Sensor platform for AquaConnect Control."""
from homeassistant.components.sensor import SensorEntity, SensorStateClass, SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, SENSOR_DEFINITIONS
from .coordinator import AquaConnectCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up sensor entities."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [
        AquaConnectSensor(coordinator, entry, defn)
        for defn in SENSOR_DEFINITIONS
    ]
    async_add_entities(entities)


class AquaConnectSensor(CoordinatorEntity, SensorEntity):
    """Sensor entity for a pool reading."""

    def __init__(
        self,
        coordinator: AquaConnectCoordinator,
        entry: ConfigEntry,
        definition: dict,
    ) -> None:
        super().__init__(coordinator)
        self._definition = definition
        self._entry = entry
        self._attr_name = definition["name"]
        self._attr_unique_id = f"{entry.entry_id}_{definition['key']}"
        self._attr_native_unit_of_measurement = definition["unit"]
        self._attr_device_class = definition["device_class"]
        self._attr_state_class = definition["state_class"]

    @property
    def native_value(self):
        """Return the sensor value from coordinator data."""
        data = self.coordinator.data
        if data is None:
            return None
        for key in self._definition["path"]:
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return None
        return data

    @property
    def device_info(self):
        """Return device info to group entities."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "AquaConnect Control",
            "manufacturer": "Hayward",
            "model": "AquaConnect",
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ha/test_sensor.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add custom_components/aquaconnect_control/sensor.py tests/ha/test_sensor.py
git commit -m "feat: add sensor entities for HA integration"
```

---

### Task 7: Switch entities

**Files:**
- Create: `custom_components/aquaconnect_control/switch.py`
- Create: `tests/ha/test_switch.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/ha/test_switch.py`:

```python
"""Tests for AquaConnect Control switch entities."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from custom_components.aquaconnect_control.switch import AquaConnectSwitch
from custom_components.aquaconnect_control.const import SWITCH_DEFINITIONS, DOMAIN
from tests.ha.conftest import MOCK_STATUS_RESPONSE


@pytest.fixture
def mock_coordinator():
    coordinator = MagicMock()
    coordinator.data = MOCK_STATUS_RESPONSE
    coordinator.api_client = AsyncMock()
    coordinator.api_client.send_command = AsyncMock(
        return_value={"success": True, "command": "filter"}
    )
    coordinator.async_request_refresh = AsyncMock()
    return coordinator


@pytest.fixture
def mock_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry_123"
    return entry


def test_switch_filter_is_on(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]  # filter
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is True


def test_switch_lights_is_off(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[2]  # lights
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is False


def test_switch_mode_is_on_when_spa(mock_coordinator, mock_entry):
    mock_coordinator.data = {**MOCK_STATUS_RESPONSE, "mode": "spa"}
    defn = SWITCH_DEFINITIONS[0]  # mode
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is True


def test_switch_mode_is_off_when_pool(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[0]  # mode
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is False


@pytest.mark.asyncio
async def test_switch_turn_on(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]  # filter
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    await switch.async_turn_on()
    mock_coordinator.api_client.send_command.assert_called_once_with("filter")
    mock_coordinator.async_request_refresh.assert_called_once()


@pytest.mark.asyncio
async def test_switch_turn_off(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]  # filter
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    await switch.async_turn_off()
    mock_coordinator.api_client.send_command.assert_called_once_with("filter")
    mock_coordinator.async_request_refresh.assert_called_once()


@pytest.mark.asyncio
async def test_switch_429_logs_warning(mock_coordinator, mock_entry, caplog):
    from custom_components.aquaconnect_control.api import AquaConnectCommandBusyError
    import logging
    mock_coordinator.api_client.send_command.side_effect = AquaConnectCommandBusyError("busy")
    defn = SWITCH_DEFINITIONS[1]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    with caplog.at_level(logging.WARNING):
        await switch.async_turn_on()
    assert "busy" in caplog.text.lower()


@pytest.mark.asyncio
async def test_switch_503_raises_ha_error(mock_coordinator, mock_entry):
    from custom_components.aquaconnect_control.api import AquaConnectApiError
    from homeassistant.exceptions import HomeAssistantError
    mock_coordinator.api_client.send_command.side_effect = AquaConnectApiError("Gateway down")
    defn = SWITCH_DEFINITIONS[1]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    with pytest.raises(HomeAssistantError):
        await switch.async_turn_on()


def test_switch_unique_id(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]  # filter
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.unique_id == "test_entry_123_filter"


def test_switch_device_info(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[0]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    device_info = switch.device_info
    assert (DOMAIN, "test_entry_123") in device_info["identifiers"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/ha/test_switch.py -v
```

Expected: FAIL — cannot import switch

- [ ] **Step 3: Write implementation**

Create `custom_components/aquaconnect_control/switch.py`:

```python
"""Switch platform for AquaConnect Control."""
import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from homeassistant.exceptions import HomeAssistantError

from .api import AquaConnectApiError, AquaConnectCommandBusyError
from .const import DOMAIN, SWITCH_DEFINITIONS
from .coordinator import AquaConnectCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up switch entities."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [
        AquaConnectSwitch(coordinator, entry, defn)
        for defn in SWITCH_DEFINITIONS
    ]
    async_add_entities(entities)


class AquaConnectSwitch(CoordinatorEntity, SwitchEntity):
    """Switch entity for pool equipment."""

    def __init__(
        self,
        coordinator: AquaConnectCoordinator,
        entry: ConfigEntry,
        definition: dict,
    ) -> None:
        super().__init__(coordinator)
        self._definition = definition
        self._entry = entry
        self._attr_name = definition["name"]
        self._attr_unique_id = f"{entry.entry_id}_{definition['key']}"

    @property
    def is_on(self) -> bool | None:
        """Return the switch state from coordinator data."""
        data = self.coordinator.data
        if data is None:
            return None

        # Mode switch: ON = spa, OFF = pool
        if self._definition["state_path"] is None:
            return data.get("mode") == "spa"

        # Equipment switches: traverse path to get on/off
        for key in self._definition["state_path"]:
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return None
        return data

    async def async_turn_on(self, **kwargs) -> None:
        """Send toggle command."""
        await self._send_command()

    async def async_turn_off(self, **kwargs) -> None:
        """Send toggle command (same as turn_on — gateway is toggle-based)."""
        await self._send_command()

    async def _send_command(self) -> None:
        """Send the command and refresh coordinator."""
        try:
            await self.coordinator.api_client.send_command(self._definition["command"])
        except AquaConnectCommandBusyError as err:
            _LOGGER.warning("Command %s busy: %s", self._definition["command"], err)
            return
        except AquaConnectApiError as err:
            raise HomeAssistantError(
                f"Error sending {self._definition['command']}: {err}"
            ) from err
        await self.coordinator.async_request_refresh()

    @property
    def device_info(self):
        """Return device info to group entities."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "AquaConnect Control",
            "manufacturer": "Hayward",
            "model": "AquaConnect",
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ha/test_switch.py -v
```

Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add custom_components/aquaconnect_control/switch.py tests/ha/test_switch.py
git commit -m "feat: add switch entities for HA integration"
```

---

## Chunk 4: Verification

### Task 8: Run all tests and verify

- [ ] **Step 1: Run full HA test suite**

```bash
python -m pytest tests/ha/ -v
```

Expected: All tests across all test files PASS (~29 tests total: api 6, coordinator 3, config_flow 3, sensor 6, switch 10 + 1 for 503).

- [ ] **Step 2: Verify integration loads in HA (manual)**

Copy `custom_components/aquaconnect_control/` to your HA instance's `custom_components/` directory. Restart HA. Navigate to Integrations → Add → search "AquaConnect". Verify the config flow appears.

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final adjustments after integration testing"
```
