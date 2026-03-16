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
