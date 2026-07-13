"""Binary sensor platform for AquaConnect Control."""
from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import AquaConnectCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up binary sensor entities."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([AquaConnectCheckSystemSensor(coordinator, entry)])


class AquaConnectCheckSystemSensor(CoordinatorEntity, BinarySensorEntity):
    """Problem sensor for the gateway's Check System warning."""

    _attr_name = "Check System"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(
        self, coordinator: AquaConnectCoordinator, entry: ConfigEntry
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_check_system"

    def _system(self) -> dict:
        data = self.coordinator.data
        if not isinstance(data, dict):
            return {}
        return data.get("system") or {}

    @property
    def is_on(self):
        """Return True while the gateway reports a Check System warning."""
        return self._system().get("checkSystem")

    @property
    def extra_state_attributes(self):
        """Expose the warning message text (e.g. 'Inspect Cell')."""
        return {"message": self._system().get("message")}

    @property
    def device_info(self):
        """Return device info to group entities."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "AquaConnect Control",
            "manufacturer": "Hayward",
            "model": "AquaConnect",
        }
