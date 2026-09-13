from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


@dataclass
class HttpResponse:
    url: str
    status: int
    body: str
    content_type: str = ""

    def json(self) -> Any:
        return json.loads(self.body)


def fetch(
    url: str,
    *,
    timeout: float = 15.0,
    headers: dict[str, str] | None = None,
    accept: str = "text/html,application/json;q=0.9,*/*;q=0.8",
) -> HttpResponse:
    req_headers = {
        "User-Agent": DEFAULT_UA,
        "Accept": accept,
        "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
    }
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, headers=req_headers, method="GET")
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            body = raw.decode(charset, errors="replace")
            return HttpResponse(
                url=resp.geturl(),
                status=int(resp.status),
                body=body,
                content_type=resp.headers.get("Content-Type", ""),
            )
    except urllib.error.HTTPError as exc:
        raw = exc.read() or b""
        body = raw.decode("utf-8", errors="replace")
        return HttpResponse(
            url=url,
            status=int(exc.code),
            body=body,
            content_type=exc.headers.get("Content-Type", "") if exc.headers else "",
        )


def post_json(url: str, payload: dict[str, Any], timeout: float = 15.0) -> HttpResponse:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": DEFAULT_UA,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            raw = resp.read()
            return HttpResponse(
                url=resp.geturl(),
                status=int(resp.status),
                body=raw.decode("utf-8", errors="replace"),
                content_type=resp.headers.get("Content-Type", ""),
            )
    except urllib.error.HTTPError as exc:
        raw = exc.read() or b""
        return HttpResponse(
            url=url,
            status=int(exc.code),
            body=raw.decode("utf-8", errors="replace"),
        )


def abs_url(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)
