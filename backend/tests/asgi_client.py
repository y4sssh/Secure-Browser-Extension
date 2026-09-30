"""Small synchronous facade over httpx2's ASGI transport for endpoint tests.

Starlette's synchronous TestClient currently blocks with the installed
httpx2 transport. This facade exercises the same ASGI application, middleware,
and routes without opening a network listener.
"""

import asyncio
from typing import Any

import httpx2


class ASGIClient:
    def __init__(self, app: Any):
        self.app = app

    def request(self, method: str, url: str, **kwargs: Any) -> httpx2.Response:
        async def send_request() -> httpx2.Response:
            transport = httpx2.ASGITransport(app=self.app)
            async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(send_request())

    def get(self, url: str, **kwargs: Any) -> httpx2.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx2.Response:
        return self.request("POST", url, **kwargs)

    def options(self, url: str, **kwargs: Any) -> httpx2.Response:
        return self.request("OPTIONS", url, **kwargs)
