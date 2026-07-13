"""Tests for AquaConnect Control binary sensor entities."""
import copy

import pytest
from unittest.mock import MagicMock

from custom_components.aquaconnect_control.binary_sensor import AquaConnectCheckSystemSensor
from custom_components.aquaconnect_control.const import DOMAIN
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


def test_check_system_on(mock_coordinator, mock_entry):
    """Binary sensor is on (problem) when the gateway reports a warning."""
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.is_on is True
    assert sensor.device_class == "problem"
    assert sensor.name == "Check System"


def test_check_system_message_attribute(mock_coordinator, mock_entry):
    """Warning message text is exposed as an attribute."""
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.extra_state_attributes["message"] == "Inspect Cell"


def test_check_system_off(mock_coordinator, mock_entry):
    """Binary sensor is off when there is no warning."""
    data = copy.deepcopy(MOCK_STATUS_RESPONSE)
    data["system"] = {"checkSystem": False, "message": None}
    mock_coordinator.data = data
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.is_on is False
    assert sensor.extra_state_attributes["message"] is None


def test_check_system_unknown(mock_coordinator, mock_entry):
    """Binary sensor reports None before the first poll establishes state."""
    data = copy.deepcopy(MOCK_STATUS_RESPONSE)
    data["system"] = {"checkSystem": None, "message": None}
    mock_coordinator.data = data
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.is_on is None


def test_check_system_missing_system_key(mock_coordinator, mock_entry):
    """Binary sensor tolerates an older API without the system field."""
    data = copy.deepcopy(MOCK_STATUS_RESPONSE)
    del data["system"]
    mock_coordinator.data = data
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.is_on is None


def test_check_system_unique_id_and_device(mock_coordinator, mock_entry):
    sensor = AquaConnectCheckSystemSensor(mock_coordinator, mock_entry)
    assert sensor.unique_id == "test_entry_123_check_system"
    assert (DOMAIN, "test_entry_123") in sensor.device_info["identifiers"]
