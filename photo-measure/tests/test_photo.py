import io
import math

import pytest
from PIL import Image

from kokoro_measure.photo import MAX_SIDE, PhotoError, load_photo, parse_box


def jpeg(size=(300, 400), focal35=None, orientation=None) -> bytes:
    image = Image.new("RGB", size, (200, 200, 200))
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    if focal35:
        exif.get_ifd(0x8769)[0xA405] = focal35
    out = io.BytesIO()
    image.save(out, "JPEG", exif=exif)
    return out.getvalue()


def test_horizontal_fov_comes_from_35mm_focal_length():
    # 갤럭시 S25 기본 카메라 세로 사진: 23mm 환산 → 가로 화각 약 58.9°
    photo = load_photo(jpeg((300, 400), focal35=23))
    assert photo.fov_x == pytest.approx(58.9, abs=0.1)


def test_fov_is_none_without_exif():
    assert load_photo(jpeg()).fov_x is None


def test_rotation_tag_is_applied_before_measuring():
    # 센서는 가로(400x300)로 저장하고 회전 태그로 세로 사진임을 알린다
    photo = load_photo(jpeg((400, 300), focal35=23, orientation=6))
    assert photo.image.size == (300, 400)
    assert photo.fov_x == pytest.approx(58.9, abs=0.1)


def test_large_photo_is_shrunk_for_the_model():
    photo = load_photo(jpeg((3000, 4000)))
    assert max(photo.image.size) == MAX_SIDE
    assert photo.image.size == (960, 1280)


def test_non_image_is_rejected():
    with pytest.raises(PhotoError):
        load_photo(b"not an image")


def test_box_is_given_as_fractions_of_the_photo():
    assert parse_box("0.1,0.25,0.5,1", (1000, 800)) == (100, 200, 500, 800)


@pytest.mark.parametrize(
    "text",
    ["", "0.1,0.2,0.3", "a,b,c,d", "0.5,0.2,0.4,0.9", "0.1,0.2,0.1,0.9", "-0.1,0,0.5,0.5", "0,0,1.2,0.5", "nan,0,1,1"],
)
def test_bad_box_is_rejected(text):
    with pytest.raises(PhotoError):
        parse_box(text, (1000, 800))


def test_fov_formula_matches_diagonal_definition():
    # 35mm 환산 초점거리는 대각선 43.27mm 기준이다. 정사각형이면 가로 = 대각선/√2 비율
    photo = load_photo(jpeg((400, 400), focal35=22))
    fov_d = 2 * math.atan(43.27 / 2 / 22)
    expected = math.degrees(2 * math.atan(math.tan(fov_d / 2) / math.sqrt(2)))
    assert photo.fov_x == pytest.approx(expected, abs=0.05)
