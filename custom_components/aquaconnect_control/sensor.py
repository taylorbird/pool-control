"""Sensor platform for AquaConnect Control."""
from homeassistant.components.sensor import SensorEntity, SensorStateClass, SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, SENSOR_DEFINITIONS, HEAT_SETTING_SENSOR_DEFINITIONS
from .coordinator import AquaConnectCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up sensor entities."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [
        AquaConnectSensor(coordinator, entry, defn)
        for defn in SENSOR_DEFINITIONS + HEAT_SETTING_SENSOR_DEFINITIONS
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

    def _resolve_path(self):
        """Walk the data dict following the definition path."""
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
    def native_value(self):
        """Return the sensor value from coordinator data."""
        data = self._resolve_path()
        if data is None:
            return None
        if self._definition.get("heat_setting"):
            return data.get("setPoint") if data.get("enabled") else None
        return data

    @property
    def extra_state_attributes(self):
        """Return extra state attributes."""
        if not self._definition.get("heat_setting"):
            return None
        data = self._resolve_path()
        if data is None:
            return {"enabled": None}
        return {"enabled": data.get("enabled")}

    @property
    def device_info(self):
        """Return device info to group entities."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "AquaConnect Control",
            "manufacturer": "Hayward",
            "model": "AquaConnect",
        }
