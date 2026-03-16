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
    defn = SWITCH_DEFINITIONS[1]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is True


def test_switch_lights_is_off(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[2]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is False


def test_switch_mode_is_on_when_spa(mock_coordinator, mock_entry):
    mock_coordinator.data = {**MOCK_STATUS_RESPONSE, "mode": "spa"}
    defn = SWITCH_DEFINITIONS[0]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is True


def test_switch_mode_is_off_when_pool(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[0]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.is_on is False


@pytest.mark.asyncio
async def test_switch_turn_on(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    await switch.async_turn_on()
    mock_coordinator.api_client.send_command.assert_called_once_with("filter")
    mock_coordinator.async_request_refresh.assert_called_once()


@pytest.mark.asyncio
async def test_switch_turn_off(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[1]
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
    defn = SWITCH_DEFINITIONS[1]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    assert switch.unique_id == "test_entry_123_filter"


def test_switch_device_info(mock_coordinator, mock_entry):
    defn = SWITCH_DEFINITIONS[0]
    switch = AquaConnectSwitch(mock_coordinator, mock_entry, defn)
    device_info = switch.device_info
    assert (DOMAIN, "test_entry_123") in device_info["identifiers"]
