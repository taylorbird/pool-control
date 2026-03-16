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
