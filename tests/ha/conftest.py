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
    "heatSettings": {
        "spaHeater": {"enabled": True, "setPoint": 96},
        "poolHeater": {"enabled": False, "setPoint": None},
        "spaSolar": {"enabled": False, "setPoint": None},
        "poolSolar": {"enabled": True, "setPoint": 89},
        "lastUpdated": "2026-03-22T22:30:00.000Z",
    },
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
