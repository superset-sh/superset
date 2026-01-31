# Copyright Modal Labs 2025
import asyncio
import base64
import json
import time
import typing
from typing import Any

from modal.exception import ExecutionError
from modal_proto import api_pb2, modal_api_grpc

from .logger import logger


class _AuthTokenManager:
    """Handles fetching and refreshing of the input plane auth token."""

    # Start refreshing this many seconds before the token expires
    REFRESH_WINDOW = 5 * 60
    # If the token doesn't have an expiry field, default to current time plus this value (not expected).
    DEFAULT_EXPIRY_OFFSET = 20 * 60

    def __init__(self, stub: "modal_api_grpc.ModalClientModal"):
        self._stub = stub
        self._token = ""
        self._expiry = 0.0
        self._lock: typing.Union[asyncio.Lock, None] = None

    async def get_token(self) -> str:
        """
        When called, the AuthTokenManager can be in one of three states:
        1. Has a valid cached token. It is returned to the caller.
        2. Has no cached token, or the token is expired. We fetch a new one and cache it. If `get_token` is called
        concurrently by multiple coroutines, all requests will block until the token has been fetched. But only one
        coroutine will actually make a request to the control plane to fetch the new token. This ensures we do not hit
        the control plane with more requests than needed.
        3. Has a valid cached token, but it is going to expire in the next 5 minutes. In this case we fetch a new token
        and cache it. If `get_token` is called concurrently, only one request will fetch the new token, and the others
        will be given the old (but still valid) token - i.e. they will not block.
        """
        if not self._token or self._is_expired():
            # We either have no token or it is expired - block everyone until we get a new token
            await self._refresh_token()
        elif self._needs_refresh():
            # The token hasn't expired yet, but will soon, so it needs a refresh.
            lock = await self._get_lock()
            if lock.locked():
                # The lock is taken, so someone else is refreshing. Continue to use the old token.
                return self._token
            else:
                # The lock is not taken, so we need to fetch a new token.
                await self._refresh_token()

        return self._token

    async def _refresh_token(self):
        """
        Fetch a new token from the control plane. If called concurrently, only one coroutine will make a request for a
        new token. The others will block on a lock, until the first coroutine has fetched the new token.
        """
        lock = await self._get_lock()
        async with lock:
            # Double check inside lock - maybe another coroutine refreshed already. This happens the first time we fetch
            # the token. The first coroutine will fetch the token, while the others block on the lock, waiting for the
            # new token. Once we have a new token, the other coroutines will unblock and return from here.
            if self._token and not self._needs_refresh():
                return
            resp: api_pb2.AuthTokenGetResponse = await self._stub.AuthTokenGet(api_pb2.AuthTokenGetRequest())
            if not resp.token:
                # Not expected
                raise ExecutionError(
                    "Internal error: Did not receive auth token from server. Please contact Modal support."
                )

            self._token = resp.token
            if exp := self._decode_jwt(resp.token).get("exp"):
                self._expiry = float(exp)
            else:
                # This should never happen.
                logger.warning("x-modal-auth-token does not contain exp field")
                # We'll use the token, and set the expiry to 20 min from now.
                self._expiry = time.time() + self.DEFAULT_EXPIRY_OFFSET

    async def _get_lock(self) -> asyncio.Lock:
        # Note: this function runs no async code but is marked as async to ensure it's
        # being run inside the synchronicity event loop and binds the lock to the
        # correct event loop on Python 3.9 which eagerly assigns event loops on
        # constructions of locks
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @staticmethod
    def _decode_jwt(token: str) -> dict[str, Any]:
        """
        Decodes a JWT into a dict without verifying signature. We do this manually instead of using a library to avoid
        adding another dependency to the client.
        """
        try:
            payload = token.split(".")[1]
            padding = "=" * (-len(payload) % 4)
            decoded_bytes = base64.urlsafe_b64decode(payload + padding)
            return json.loads(decoded_bytes)
        except Exception as e:
            raise ValueError("Internal error: Cannot parse auth token. Please contact Modal support.") from e

    def _needs_refresh(self):
        return time.time() >= (self._expiry - self.REFRESH_WINDOW)

    def _is_expired(self):
        return time.time() >= self._expiry
