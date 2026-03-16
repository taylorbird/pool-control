"""Tests for AquaConnect Control API client."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from custom_components.aquaconnect_control.api import (
    AquaConnectApiClient,
    AquaConnectApiError,
    AquaConnectCommandBusyError,
)
from tests.ha.conftest import (
    MOCK_STATUS_RESPONSE,
    MOCK_HEALTH_RESPONSE,
    MOCK_COMMAND_RESPONSE,
    create_mock_response,
)


@pytest.fixture
def api_client(mock_session):
    """Create an API client with a mock session."""
    return AquaConnectApiClient("http://pool-control:3000", mock_session)


@pytest.mark.asyncio
async def test_get_status(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_STATUS_RESPONSE))
    result = await api_client.get_status()
    assert result["mode"] == "pool"
    assert result["sensors"]["poolTemp"] == 78
    mock_session.get.assert_called_once()


@pytest.mark.asyncio
async def test_get_health(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_HEALTH_RESPONSE))
    result = await api_client.get_health()
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_send_command(api_client, mock_session):
    mock_session.post = MagicMock(return_value=create_mock_response(MOCK_COMMAND_RESPONSE))
    result = await api_client.send_command("filter")
    assert result["success"] is True
    mock_session.post.assert_called_once()


@pytest.mark.asyncio
async def test_get_status_connection_error(api_client, mock_session):
    mock_session.get = MagicMock(return_value=create_mock_response({}, status=500))
    with pytest.raises(AquaConnectApiError):
        await api_client.get_status()


@pytest.mark.asyncio
async def test_send_command_429(api_client, mock_session):
    mock_session.post = MagicMock(return_value=create_mock_response(
        {"success": False, "error": "Command in progress"}, status=429
    ))
    with pytest.raises(AquaConnectCommandBusyError):
        await api_client.send_command("filter")


@pytest.mark.asyncio
async def test_host_trailing_slash_stripped(mock_session):
    client = AquaConnectApiClient("http://pool-control:3000/", mock_session)
    mock_session.get = MagicMock(return_value=create_mock_response(MOCK_HEALTH_RESPONSE))
    await client.get_health()
    call_args = mock_session.get.call_args
    url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
    assert "//" not in url.replace("http://", "", 1)
