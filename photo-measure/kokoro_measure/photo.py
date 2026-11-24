"""업로드된 사진을 모델 입력으로 바꾼다. 회전 태그와 EXIF 화각을 여기서 처리한다."""

from __future__ import annotations

import io
import math
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_SIDE = 1280  # 폰 사진은 크다. 모델 입력은 긴 변 1280px이면 충분하다.
MAX_PIXELS = 60_000_000  # 50MP 폰 사진까지 받는다.
FULL_FRAME_DIAGONAL_MM = 43.27  # 35mm 환산 초점거리는 이 대각선 기준이다.

EXIF_IFD = 0x8769
FOCAL_LENGTH_35MM = 0xA405


class PhotoError(ValueError):
    pass


@dataclass
class Photo:
    image: Image.Image  # 회전을 바로잡고 줄인 RGB 사진
    fov_x: float | None  # 가로 화각(도). EXIF가 없으면 None이고 모델이 추정한다.


def load_photo(data: bytes) -> Photo:
    try:
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > MAX_PIXELS:
            raise PhotoError("사진 해상도가 너무 커요.")
        focal35 = _focal_length_35mm(image)
        image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError) as err:
        raise PhotoError("사진 파일을 읽지 못했어요.") from err
    scale = MAX_SIDE / max(image.size)
    if scale < 1:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    return Photo(image=image, fov_x=_horizontal_fov(focal35, image.size) if focal35 else None)


def _focal_length_35mm(image: Image.Image) -> float | None:
    try:
        value = image.getexif().get_ifd(EXIF_IFD).get(FOCAL_LENGTH_35MM)
    except Exception:  # 깨진 EXIF는 없는 것으로 본다
        return None
    return float(value) if value else None


def _horizontal_fov(focal35: float, size: tuple[int, int]) -> float:
    diagonal = 2 * math.atan(FULL_FRAME_DIAGONAL_MM / 2 / focal35)
    width, height = size
    return math.degrees(2 * math.atan(math.tan(diagonal / 2) * width / math.hypot(width, height)))


def parse_box(text: str | None, size: tuple[int, int]) -> tuple[int, int, int, int]:
    """'x0,y0,x1,y1'(사진 크기에 대한 0~1 비율)을 모델 입력 사진의 픽셀 상자로 바꾼다."""
    try:
        values = [float(v) for v in (text or "").split(",")]
    except ValueError as err:
        raise PhotoError("가구 영역 값이 잘못됐어요.") from err
    if len(values) != 4 or not all(0 <= v <= 1 for v in values):
        raise PhotoError("가구 영역 값이 잘못됐어요.")
    x0, y0, x1, y1 = values
    if x0 >= x1 or y0 >= y1:
        raise PhotoError("가구 영역 값이 잘못됐어요.")
    width, height = size
    return round(x0 * width), round(y0 * height), round(x1 * width), round(y1 * height)
