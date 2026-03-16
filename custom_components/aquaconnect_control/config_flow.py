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
