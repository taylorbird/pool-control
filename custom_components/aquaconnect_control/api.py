"""API client for AquaConnect Control."""
import asyncio
import logging

import aiohttp

_LOGGER = logging.getLogger(__name__)

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=10)


class AquaConnectApiError(Exception):
    """Exception for API errors."""


class AquaConnectCommandBusyError(AquaConnectApiError):
    """Raised when the gateway returns 429 (command in progress)."""


class AquaConnectApiClient:
    """Async client for the pool-control-api."""

    def __init__(self, host: str, session: aiohttp.ClientSession) -> None:
        self._host = host.rstrip("/")
        self._session = session

    async def get_status(self) -> dict:
        """GET /api/status — returns full pool state."""
        return await self._get("/api/status")

    async def get_health(self) -> dict:
        """GET /api/health — returns health check."""
        return await self._get("/api/health")

    async def send_command(self, action: str) -> dict:
        """POST /api/command/{action} — toggles equipment."""
        return await self._post(f"/api/command/{action}")

    async def _get(self, path: str) -> dict:
        """Make a GET request."""
        url = f"{self._host}{path}"
        try:
            async with self._session.get(url, timeout=REQUEST_TIMEOUT) as response:
                response.raise_for_status()
                return await response.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise AquaConnectApiError(f"Error fetching {path}: {err}") from err

    async def _post(self, path: str) -> dict:
        """Make a POST request."""
        url = f"{self._host}{path}"
        try:
            async with self._session.post(url, timeout=REQUEST_TIMEOUT) as response:
                if response.status == 429:
                    raise AquaConnectCommandBusyError("Command in progress")
                response.raise_for_status()
                return await response.json()
        except AquaConnectCommandBusyError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise AquaConnectApiError(f"Error posting {path}: {err}") from err
