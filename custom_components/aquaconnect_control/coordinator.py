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
