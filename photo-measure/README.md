# 사진 실측 서버

휴대폰으로 찍은 가구 사진 한 장과 가구 영역(상자)을 받아 가로·세로·높이를 추정하는 로컬 서버입니다. Ollama처럼 시연 PC에서 따로 실행하고 브라우저가 직접 호출합니다.

- 사진 → MoGe-2(미터 단위 3D 점과 면 방향) → SAM(상자 안 가구 영역) → 바닥 평면 → 바닥 기준 상자
- 사진의 EXIF 초점거리로 화각을 정하므로 **원본 사진을 그대로** 보내야 합니다. 브라우저에서 줄이거나 다시 인코딩하면 EXIF가 사라집니다.
- 추정값이므로 화면에서 사용자가 보정하는 단계를 둡니다. 가로는 긴 변, 세로는 짧은 변입니다.

## 정확도 (2026-11-24, 갤럭시 S25)

| 가구 | 실제 (cm) | 추정 (cm) |
|---|---|---|
| 냉장고 4장 | 50 × 55~58 × 100~110 | 51~57 × 56~63 × 107~126 |
| 의자 2장 | 67 × 59 × 115 | 64~69 × 59~64 × 116~121 |
| 책상 (위에 물건이 많음) | 160 × 70 × 72 | 102 × 78 × 80 |

대부분 10% 안이지만 사진 한 장 전체가 약 1.2배 크게 나온 경우가 있었습니다. 물건에 가려진 부분은 크기에 들어가지 않습니다. A4와 신용카드를 기준물로 넣는 방식은 휘거나 작게 찍히면 오히려 틀려서 넣지 않았습니다.

촬영 안내: 가구 위 물건을 치우고, 바닥이 보이게, 모서리 쪽에서 가구 전체가 들어오게 찍습니다.

## 준비

NVIDIA GPU와 Python 3.12 기준입니다. 모델 내려받기에 약 3GB가 필요합니다.

```bash
cd photo-measure
python -m venv .venv
.venv/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cu128   # macOS/Linux는 .venv/bin/pip
.venv/Scripts/pip install -r requirements.txt
```

## 실행

```bash
.venv/Scripts/python -m kokoro_measure --port 8790
```

`준비 완료`가 나오면 `curl http://127.0.0.1:8790/health`가 `{"status": "ok"}`를 돌려줍니다. 허용 주소 기본값은 `http://localhost:5173`과 `https://kokoro-band.github.io`이며 `KOKORO_MEASURE_ORIGINS`에 쉼표로 바꿀 수 있습니다.

## API

`POST /measure?box=x0,y0,x1,y1`

- 본문: 원본 사진 바이트 (최대 25MB)
- `box`: 회전을 바로잡은 사진 기준 0~1 비율 좌표
- 한 장에 약 9초 (RTX 5070)

| 상태 | 본문 |
|---|---|
| 200 | `{"widthCm": 55.8, "depthCm": 51.5, "heightCm": 107.8, "floorFound": true}` |
| 400 | `{"error": "bad_photo" 또는 "bad_box", "message": "..."}` |
| 403 | 허용되지 않은 Origin |
| 413 | `{"error": "too_large"}` |
| 422 | `{"error": "measure_failed"}` 상자 안에서 가구를 찾지 못함 |

`floorFound`가 `false`면 바닥이 안 보여 카메라가 수평이라고 가정한 값이라 높이가 덜 정확합니다.

## 테스트

모델 없이 사진 처리와 크기 계산과 서버 응답을 확인합니다.

```bash
.venv/Scripts/python -m pytest
```
