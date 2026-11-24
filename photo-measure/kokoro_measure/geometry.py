"""3D 점에서 가구 상자 크기를 잰다. 모델과 무관한 순수 계산이라 따로 시험한다.

좌표는 카메라 기준이다: x 오른쪽, y 아래, z 앞, 단위 미터 (MoGe 출력과 같다).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

CAMERA_UP = np.array([0.0, -1.0, 0.0])
MIN_OBJECT_POINTS = 200


class MeasureError(RuntimeError):
    pass


@dataclass
class Measurement:
    width_m: float  # 수평 두 변 중 긴 쪽
    depth_m: float  # 수평 두 변 중 짧은 쪽
    height_m: float  # 바닥에서 꼭대기까지
    floor_found: bool  # False면 카메라가 수평이라고 가정한 값이다


def erode(mask: np.ndarray, steps: int) -> np.ndarray:
    """경계의 '날아다니는 점'을 버리려고 마스크 가장자리를 깎는다."""
    m = mask.copy()
    for _ in range(steps):
        m[1:, :] &= m[:-1, :]
        m[:-1, :] &= m[1:, :]
        m[:, 1:] &= m[:, :-1]
        m[:, :-1] &= m[:, 1:]
    return m


def fit_floor(scene: np.ndarray, obj: np.ndarray, rng: np.random.Generator):
    """가구 아래에 있는 가장 큰 위쪽 평면을 바닥으로 본다. (법선, d): 법선·p + d = 0."""
    if len(scene) < 500:
        return None
    best, best_count = None, 0
    for _ in range(600):
        a, b, c = scene[rng.choice(len(scene), 3, replace=False)]
        n = np.cross(b - a, c - a)
        norm = np.linalg.norm(n)
        if norm < 1e-9:
            continue
        n /= norm
        if n @ CAMERA_UP < 0:
            n = -n
        if n @ CAMERA_UP < math.cos(math.radians(45)):  # 카메라가 45° 넘게 기울지 않았다고 본다
            continue
        d = -n @ a
        if d < 0.3:  # 카메라가 평면보다 30cm 이상 위에 있어야 바닥이다. 천장을 거른다.
            continue
        if ((obj @ n + d) < -0.05).mean() > 0.05:  # 가구가 평면 아래로 뚫고 내려가면 바닥이 아니다
            continue
        count = int((np.abs(scene @ n + d) < 0.02).sum())
        if count > best_count:
            best, best_count = (n, d), count
    if best is None or best_count < 0.05 * len(scene):
        return None
    n, d = best
    inliers = scene[np.abs(scene @ n + d) < 0.02]
    centroid = inliers.mean(axis=0)
    _, _, vt = np.linalg.svd(inliers - centroid)
    n = vt[2] if vt[2] @ CAMERA_UP > 0 else -vt[2]
    return n, float(-n @ centroid)


def _footprint(xy: np.ndarray) -> tuple[float, float]:
    """바닥에 투영한 점을 덮는 가장 작은 직사각형. 끝 2%는 잡음으로 버린다."""
    best = None
    for deg in np.arange(0, 90, 0.5):
        r = math.radians(deg)
        rot = xy @ np.array([[math.cos(r), -math.sin(r)], [math.sin(r), math.cos(r)]])
        w, d = np.percentile(rot, 98, axis=0) - np.percentile(rot, 2, axis=0)
        if best is None or w * d < best[0] * best[1]:
            best = (w, d)
    return float(best[0]), float(best[1])


def _face_axes(normals: np.ndarray, up: np.ndarray, e1: np.ndarray, e2: np.ndarray):
    """옆면 법선 방향(90° 주기)으로 가구의 수평 두 축을 찾는다. 뚜렷하지 않으면 None."""
    side = normals[np.abs(normals @ up) < 0.5]
    if len(side) <= 500:
        return None
    side = side - np.outer(side @ up, up)
    side /= np.linalg.norm(side, axis=1, keepdims=True)
    four = np.exp(4j * np.arctan2(side @ e2, side @ e1)).mean()  # 4배각 평균 = 90° 주기의 대표 방향
    if abs(four) <= 0.5:
        return None
    theta = np.angle(four) / 4
    a1 = math.cos(theta) * e1 + math.sin(theta) * e2
    return a1, np.cross(up, a1)


def measure_box(
    obj: np.ndarray, normals: np.ndarray | None, scene: np.ndarray, rng: np.random.Generator
) -> Measurement:
    """가구 점(obj)과 그 법선, 나머지 장면 점(scene)으로 바닥 기준 상자 크기를 잰다."""
    if len(obj) < MIN_OBJECT_POINTS:
        raise MeasureError("가구 영역을 찾지 못했어요. 영역을 다시 지정해 주세요.")
    lo, hi = np.percentile(obj[:, 2], [2, 98])  # 깊이 이상치 제거
    keep = (obj[:, 2] >= lo) & (obj[:, 2] <= hi)
    obj = obj[keep]
    if normals is not None:
        normals = normals[keep]

    if len(scene) > 60000:
        scene = scene[rng.choice(len(scene), 60000, replace=False)]
    floor = fit_floor(scene, obj, rng)
    if floor is None:
        up = CAMERA_UP
        heights = obj @ up
        heights = heights - np.percentile(heights, 2)
    else:
        up, d = floor
        heights = obj @ up + d
    height = float(np.percentile(heights, 98))

    e1 = np.cross(up, [0.0, 0.0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(up, e1)
    axes = _face_axes(normals, up, e1, e2) if normals is not None else None
    if axes is not None:
        spans = [float(np.subtract(*np.percentile(obj @ a, [99, 1]))) for a in axes]
    else:
        spans = list(_footprint(np.stack([obj @ e1, obj @ e2], axis=1)))
    return Measurement(
        width_m=max(spans), depth_m=min(spans), height_m=height, floor_found=floor is not None
    )
