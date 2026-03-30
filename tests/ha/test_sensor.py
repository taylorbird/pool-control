"""Tests for AquaConnect Control sensor entities."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from custom_components.aquaconnect_control.sensor import AquaConnectSensor
from custom_components.aquaconnect_control.const import SENSOR_DEFINITIONS, DOMAIN, HEAT_SETTING_SENSOR_DEFINITIONS
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
    defn = SENSOR_DEFINITIONS[0]
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 78
    assert sensor.name == "Pool Temperature"
    assert sensor.native_unit_of_measurement == "°F"
    assert sensor.device_class == "temperature"
    assert sensor.state_class == "measurement"


def test_sensor_salt_level(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[3]
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 3000
    assert sensor.native_unit_of_measurement == "PPM"


def test_sensor_filter_speed(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[4]
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == "50% Speed2"
    assert sensor.native_unit_of_measurement is None
    assert sensor.device_class is None


def test_sensor_null_value(mock_coordinator, mock_entry):
    defn = SENSOR_DEFINITIONS[1]
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
    defn = SENSOR_DEFINITIONS[0]
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.unique_id == "test_entry_123_poolTemp"


def test_heat_setting_sensor_enabled(mock_coordinator, mock_entry):
    """Heat setting sensor shows set point when enabled."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[0]  # spa_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 96
    assert sensor.native_unit_of_measurement == "°F"


def test_heat_setting_sensor_disabled(mock_coordinator, mock_entry):
    """Heat setting sensor shows None when disabled."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[1]  # pool_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value is None


def test_heat_setting_sensor_extra_attrs(mock_coordinator, mock_entry):
    """Heat setting sensor exposes enabled as extra state attribute."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[0]  # spa_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    attrs = sensor.extra_state_attributes
    assert attrs["enabled"] is True


def test_heat_setting_sensor_disabled_extra_attrs(mock_coordinator, mock_entry):
    """Disabled heat setting sensor has enabled=False in extra attrs."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[1]  # pool_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    attrs = sensor.extra_state_attributes
    assert attrs["enabled"] is False
