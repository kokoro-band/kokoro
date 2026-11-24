"""MoGe-2(사진 → 미터 단위 3D 점)와 SAM(상자 → 가구 영역)을 한 번만 올려 두고 쓴다."""

from __future__ import annotations

import numpy as np
import torch

from .geometry import Measurement, erode, measure_box
from .photo import Photo

MOGE_MODEL = "Ruicheng/moge-2-vitl-normal"
SAM_MODEL = "facebook/sam-vit-huge"


class ModelMeasurer:
    def __init__(self, device: str | None = None):
        from moge.model.v2 import MoGeModel
        from transformers import SamModel, SamProcessor

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.moge = MoGeModel.from_pretrained(MOGE_MODEL).to(self.device).eval()
        self.sam_processor = SamProcessor.from_pretrained(SAM_MODEL)
        self.sam = SamModel.from_pretrained(SAM_MODEL).to(self.device).eval()

    @torch.no_grad()
    def _points(self, photo: Photo):
        tensor = torch.tensor(np.asarray(photo.image) / 255, dtype=torch.float32, device=self.device)
        out = self.moge.infer(tensor.permute(2, 0, 1), fov_x=photo.fov_x)
        return (
            out["points"].cpu().numpy(),
            out["mask"].cpu().numpy() > 0.5,
            out["normal"].cpu().numpy(),
        )

    @torch.no_grad()
    def _segment(self, photo: Photo, box: tuple[int, int, int, int]) -> np.ndarray:
        inputs = self.sam_processor(photo.image, input_boxes=[[list(box)]], return_tensors="pt").to(self.device)
        outputs = self.sam(**inputs)
        masks = self.sam_processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu()
        )[0][0]
        best = int(outputs.iou_scores.cpu()[0, 0].argmax())
        return masks[best].numpy().astype(bool)

    def measure(self, photo: Photo, box: tuple[int, int, int, int]) -> Measurement:
        points, valid, normals = self._points(photo)
        mask = self._segment(photo, box)
        inside = erode(mask & valid, 3)
        return measure_box(points[inside], normals[inside], points[valid & ~mask], np.random.default_rng(0))
