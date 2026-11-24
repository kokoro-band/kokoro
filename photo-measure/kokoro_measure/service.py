"""브라우저가 직접 부르는 로컬 측정 서버 (Ollama와 같은 방식).

    POST /measure?box=x0,y0,x1,y1   본문: 원본 사진 바이트(EXIF 포함), box는 0~1 비율
    GET  /health
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .geometry import MeasureError
from .photo import PhotoError, load_photo, parse_box

DEFAULT_ORIGINS = ("http://localhost:5173", "https://kokoro-band.github.io")
DEFAULT_MAX_BYTES = 25 * 1024 * 1024


def make_server(measurer, host: str, port: int, origins=DEFAULT_ORIGINS, max_bytes=DEFAULT_MAX_BYTES):
    allowed = set(origins)
    gpu = threading.Lock()  # GPU 하나로 한 번에 한 장씩 잰다

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):  # 사진 요청마다 콘솔을 채우지 않는다
            pass

        def _origin_ok(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin in allowed

        def _send(self, status: int, payload: dict | None = None, extra: dict | None = None):
            body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else b""
            self.send_response(status)
            origin = self.headers.get("Origin")
            if origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            if payload is not None:
                self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _error(self, status: int, code: str, message: str):
            self._send(status, {"error": code, "message": message})

        def do_OPTIONS(self):
            if not self._origin_ok():
                return self._error(403, "origin", "허용되지 않은 주소예요.")
            self._send(
                204,
                extra={
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "600",
                },
            )

        def do_GET(self):
            if urlparse(self.path).path != "/health":
                return self._error(404, "not_found", "없는 주소예요.")
            self._send(200, {"status": "ok"})

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/measure":
                return self._error(404, "not_found", "없는 주소예요.")
            if not self._origin_ok():
                return self._error(403, "origin", "허용되지 않은 주소예요.")
            length = int(self.headers.get("Content-Length") or 0)
            if length > max_bytes:
                self.close_connection = True
                return self._error(413, "too_large", "사진 파일이 너무 커요.")
            data = self.rfile.read(length)
            try:
                photo = load_photo(data)
            except PhotoError as err:
                return self._error(400, "bad_photo", str(err))
            try:
                box = parse_box(parse_qs(url.query).get("box", [None])[0], photo.image.size)
            except PhotoError as err:
                return self._error(400, "bad_box", str(err))
            try:
                with gpu:
                    result = measurer.measure(photo, box)
            except MeasureError as err:
                return self._error(422, "measure_failed", str(err))
            self._send(
                200,
                {
                    "widthCm": round(result.width_m * 100, 1),
                    "depthCm": round(result.depth_m * 100, 1),
                    "heightCm": round(result.height_m * 100, 1),
                    "floorFound": result.floor_found,
                },
            )

    return ThreadingHTTPServer((host, port), Handler)
