import math

import numpy as np
import pytest

from kokoro_measure.geometry import MeasureError, erode, measure_box

# 카메라 좌표: x 오른쪽, y 아래, z 앞 (MoGe와 같다). 단위 미터.


def rotation_x(deg):
    r = math.radians(deg)
    return np.array([[1, 0, 0], [0, math.cos(r), -math.sin(r)], [0, math.sin(r), math.cos(r)]])


def box_surface(width, depth, height, yaw_deg, center, rng, n=6000):
    """바닥(y=0, 위쪽 -y)에 놓인 상자의 겉면 점과 바깥 법선."""
    half = np.array([width / 2, height / 2, depth / 2])
    faces = [(axis, sign) for axis in range(3) for sign in (-1, 1)]
    points, normals = [], []
    for axis, sign in faces:
        p = rng.uniform(-1, 1, (n // 6, 3)) * half
        p[:, axis] = sign * half[axis]
        nrm = np.zeros((len(p), 3))
        nrm[:, axis] = sign
        points.append(p)
        normals.append(nrm)
    p, nrm = np.concatenate(points), np.concatenate(normals)
    y = math.radians(yaw_deg)
    yaw = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    p = p @ yaw.T + np.array([center[0], -height / 2, center[1]])
    return p, nrm @ yaw.T


def floor(rng, n=20000):
    return np.stack([rng.uniform(-3, 3, n), np.zeros(n), rng.uniform(0.5, 6, n)], axis=1)


def camera_view(world, camera_height, pitch_deg):
    """세계(바닥 y=0)를 높이 camera_height에서 아래로 pitch만큼 숙인 카메라 좌표로 옮긴다."""
    shifted = world + np.array([0, camera_height, 0])
    return shifted @ rotation_x(pitch_deg).T


@pytest.fixture
def rng():
    return np.random.default_rng(0)


def test_box_on_floor_is_measured_from_photo_points(rng):
    obj, nrm = box_surface(0.50, 0.56, 1.05, yaw_deg=30, center=(0.2, 2.0), rng=rng)
    scene = floor(rng)
    pitch = 25
    result = measure_box(
        camera_view(obj, 1.2, pitch), nrm @ rotation_x(pitch).T, camera_view(scene, 1.2, pitch), rng
    )
    assert result.floor_found
    assert result.height_m == pytest.approx(1.05, rel=0.02)
    assert result.width_m == pytest.approx(0.56, rel=0.03)
    assert result.depth_m == pytest.approx(0.50, rel=0.03)


def test_width_is_the_longer_side(rng):
    obj, nrm = box_surface(1.60, 0.70, 0.72, yaw_deg=-15, center=(0, 2.5), rng=rng)
    result = measure_box(camera_view(obj, 1.4, 35), nrm @ rotation_x(35).T, camera_view(floor(rng), 1.4, 35), rng)
    assert result.width_m >= result.depth_m
    assert result.width_m == pytest.approx(1.60, rel=0.03)
    assert result.depth_m == pytest.approx(0.70, rel=0.03)
    assert result.height_m == pytest.approx(0.72, rel=0.03)


def test_ceiling_is_never_taken_as_floor(rng):
    obj, nrm = box_surface(0.5, 0.5, 1.0, yaw_deg=0, center=(0, 2.0), rng=rng)
    ceiling = floor(rng, 20000) + np.array([0, -2.4, 0])  # 바닥 2.4m 위의 천장, 바닥보다 많이 보인다
    scene = np.concatenate([floor(rng, 10000), ceiling])
    result = measure_box(camera_view(obj, 1.2, 10), nrm @ rotation_x(10).T, camera_view(scene, 1.2, 10), rng)
    assert result.floor_found
    assert result.height_m == pytest.approx(1.0, rel=0.03)


def test_without_visible_floor_camera_is_assumed_level(rng):
    obj, nrm = box_surface(0.5, 0.5, 1.0, yaw_deg=0, center=(0, 2.0), rng=rng)
    wall = np.stack([rng.uniform(-3, 3, 5000), rng.uniform(-2, 0, 5000), np.full(5000, 4.0)], axis=1)
    result = measure_box(camera_view(obj, 1.2, 0), nrm, camera_view(wall, 1.2, 0), rng)
    assert not result.floor_found
    assert result.height_m == pytest.approx(1.0, rel=0.05)


def test_too_few_object_points_is_an_error(rng):
    with pytest.raises(MeasureError):
        measure_box(np.zeros((10, 3)), None, camera_view(floor(rng), 1.2, 20), rng)


def test_erode_trims_mask_edges():
    mask = np.zeros((7, 7), bool)
    mask[1:6, 1:6] = True
    eroded = erode(mask, 1)
    assert eroded.sum() == 9
    assert eroded[2:5, 2:5].all()
