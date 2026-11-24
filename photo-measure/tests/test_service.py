import io
import json
import threading
import urllib.error
import urllib.request

import pytest
from PIL import Image

from kokoro_measure.geometry import MeasureError, Measurement
from kokoro_measure.service import make_server

ORIGIN = "http://localhost:5173"


class FakeMeasurer:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def measure(self, photo, box):
        self.calls.append((photo, box))
        if self.error:
            raise self.error
        return Measurement(width_m=0.561, depth_m=0.515, height_m=1.092, floor_found=True)


@pytest.fixture
def serve():
    servers = []

    def start(measurer, max_bytes=1_000_000):
        server = make_server(measurer, "127.0.0.1", 0, origins=[ORIGIN], max_bytes=max_bytes)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        return f"http://127.0.0.1:{server.server_address[1]}"

    yield start
    for server in servers:
        server.shutdown()
        server.server_close()


def photo_bytes():
    image = Image.new("RGB", (300, 400), (200, 200, 200))
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0xA405] = 23
    out = io.BytesIO()
    image.save(out, "JPEG", exif=exif)
    return out.getvalue()


def request(url, method="GET", body=None, headers=None):
    req = urllib.request.Request(url, data=body, method=method, headers={"Origin": ORIGIN, **(headers or {})})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


def test_health_reports_ready(serve):
    status, headers, body = request(serve(FakeMeasurer()) + "/health")
    assert status == 200
    assert json.loads(body) == {"status": "ok"}
    assert headers["Access-Control-Allow-Origin"] == ORIGIN


def test_photo_with_box_returns_size_in_cm(serve):
    measurer = FakeMeasurer()
    status, _, body = request(
        serve(measurer) + "/measure?box=0.1,0.25,0.9,1", "POST", photo_bytes(), {"Content-Type": "image/jpeg"}
    )
    assert status == 200
    assert json.loads(body) == {"widthCm": 56.1, "depthCm": 51.5, "heightCm": 109.2, "floorFound": True}
    photo, box = measurer.calls[0]
    assert photo.fov_x == pytest.approx(58.9, abs=0.1)
    assert box == (30, 100, 270, 400)


def test_preflight_allows_known_origin_only(serve):
    url = serve(FakeMeasurer()) + "/measure"
    preflight = {"Access-Control-Request-Method": "POST"}
    status, headers, _ = request(url, "OPTIONS", headers=preflight)
    assert status == 204
    assert headers["Access-Control-Allow-Origin"] == ORIGIN
    status, headers, _ = request(url, "OPTIONS", headers={**preflight, "Origin": "https://evil.example"})
    assert status == 403
    assert "Access-Control-Allow-Origin" not in headers


def test_unknown_origin_cannot_measure(serve):
    measurer = FakeMeasurer()
    status, _, _ = request(
        serve(measurer) + "/measure?box=0,0,1,1", "POST", photo_bytes(), {"Origin": "https://evil.example"}
    )
    assert status == 403
    assert measurer.calls == []


@pytest.mark.parametrize(
    ("path", "body", "code"),
    [
        ("/measure", "photo", "bad_box"),
        ("/measure?box=0.5,0,0.4,1", "photo", "bad_box"),
        ("/measure?box=0,0,1,1", b"not an image", "bad_photo"),
        ("/measure?box=0,0,1,1", b"", "bad_photo"),
    ],
)
def test_bad_request_is_rejected_without_measuring(serve, path, body, code):
    measurer = FakeMeasurer()
    data = photo_bytes() if body == "photo" else body
    status, _, raw = request(serve(measurer) + path, "POST", data)
    assert status == 400
    assert json.loads(raw)["error"] == code
    assert measurer.calls == []


def test_too_large_photo_is_rejected(serve):
    measurer = FakeMeasurer()
    status, _, raw = request(serve(measurer, max_bytes=100) + "/measure?box=0,0,1,1", "POST", photo_bytes())
    assert status == 413
    assert json.loads(raw)["error"] == "too_large"
    assert measurer.calls == []


def test_measurement_failure_is_reported(serve):
    measurer = FakeMeasurer(error=MeasureError("가구 영역을 찾지 못했어요."))
    status, _, raw = request(serve(measurer) + "/measure?box=0,0,1,1", "POST", photo_bytes())
    assert status == 422
    assert json.loads(raw) == {"error": "measure_failed", "message": "가구 영역을 찾지 못했어요."}


def test_unknown_path_is_404(serve):
    status, _, _ = request(serve(FakeMeasurer()) + "/nope")
    assert status == 404
