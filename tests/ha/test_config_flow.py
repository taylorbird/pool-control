"""Tests for AquaConnect Control config flow."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from custom_components.aquaconnect_control.config_flow import AquaConnectConfigFlow
from custom_components.aquaconnect_control.const import DOMAIN, CONF_HOST, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
from custom_components.aquaconnect_control.api import AquaConnectApiError
from tests.ha.conftest import MOCK_HEALTH_RESPONSE


@pytest.fixture
def mock_api_client():
    with patch(
        "custom_components.aquaconnect_control.config_flow.AquaConnectApiClient"
    ) as mock_cls, patch(
        "custom_components.aquaconnect_control.config_flow.async_get_clientsession"
    ):
        client = AsyncMock()
        client.get_health = AsyncMock(return_value=MOCK_HEALTH_RESPONSE)
        mock_cls.return_value = client
        yield client


@pytest.mark.asyncio
async def test_flow_user_step_success(mock_api_client):
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()
    flow.hass.config_entries = MagicMock()
    flow.hass.config_entries.async_entries = MagicMock(return_value=[])
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()

    with patch.object(flow, "async_create_entry", return_value={"type": "create_entry"}) as mock_create:
        result = await flow.async_step_user(
            user_input={CONF_HOST: "http://pool-control:3000", CONF_SCAN_INTERVAL: 10}
        )
        mock_create.assert_called_once()


@pytest.mark.asyncio
async def test_flow_user_step_cannot_connect(mock_api_client):
    mock_api_client.get_health.side_effect = AquaConnectApiError("fail")
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()

    result = await flow.async_step_user(
        user_input={CONF_HOST: "http://bad-host:3000", CONF_SCAN_INTERVAL: 10}
    )
    assert result["errors"] == {"base": "cannot_connect"}


@pytest.mark.asyncio
async def test_flow_user_step_shows_form():
    flow = AquaConnectConfigFlow()
    flow.hass = MagicMock()

    result = await flow.async_step_user(user_input=None)
    assert result["type"] == "form"
    schema_keys = [str(k) for k in result["data_schema"].schema]
    assert any(CONF_HOST in k for k in schema_keys)
