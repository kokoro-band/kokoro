# 공통 가구 규격

`docs/contracts/furniture-catalog.json`이 가구 규격의 단일 원본입니다. 가구가 바닥에서 차지하는 폭과 깊이를 웹과 서버가 같은 값으로 읽습니다. 기존 8종의 ID와 폭과 깊이는 변경하지 않았습니다. 저장된 프로젝트의 `catalogId`도 그대로 사용합니다.

## 데이터 의미

| 필드 | 의미 |
|---|---|
| version | 규격 파일 형식의 버전입니다. 현재 값은 1입니다. |
| unit | 폭과 깊이의 단위입니다. 현재 값은 미터를 뜻하는 m입니다. |
| priceKind | 현재 example입니다. price는 출처가 검증된 판매 가격이나 이사 비용이 아니라 화면 표시용 예제 가격입니다. |
| currency | 예제 가격의 통화입니다. 현재 값은 KRW입니다. |
| items | 가구 목록입니다. ID가 중복되거나 폭과 깊이가 0 이하이면 사용할 수 없습니다. |
| modelUrl | 선택 필드입니다. 웹에 포함된 `/models/이름.glb` 경로만 허용합니다. |

각 가구에는 이름과 분류와 설명 및 색상도 있습니다. 높이와 무게와 부피는 아직 검증된 출처가 없으므로 추가하지 않았습니다. 3D 화면에서 보이는 높이를 실제 가구 높이나 견적 계산값으로 사용하지 않습니다.

## 웹과 서버가 읽는 방법

웹은 `frontend/src/features/studio/data.ts`에서 원본 JSON을 읽습니다. 별도 API 요청 없이 빌드 결과 안에 포함됩니다. Vite 설정에서도 같은 검증 함수를 실행하므로 잘못된 규격이면 개발 서버 시작과 빌드가 실패합니다.

서버는 Maven이 원본을 `contracts/furniture-catalog.json` 리소스로 복사합니다. `FurnitureCatalog`가 이를 읽어 배치 검증기에 전달합니다. JAR 안에도 같은 파일이 들어가므로 배포 후 저장소의 docs 폴더를 참조하지 않습니다. 원본이 없거나 잘못되면 서버가 시작되지 않습니다. 기본 `./mvnw test`와 `./mvnw package`도 계약 테스트에서 실패합니다. 테스트를 건너뛰는 빌드는 이 검증의 근거로 쓰지 않습니다.

빌드는 저장소 전체를 체크아웃한 뒤 `frontend/`와 `backend/`에서 각각 실행합니다. 폴더별 배포는 유지하지만 소스 빌드에는 `docs/contracts/`도 필요합니다. 폴더만 복사한 빌드는 지원하지 않습니다.

## 모델 좌표와 출처

현재 배치 화면의 GLB와 썸네일은 코코로에서 Blender로 제작했습니다. 기존 8종의 `provenance.modelAsset`과 `provenance.modelSha256`은 처음 사용한 Kenney Furniture Kit 2.0 원본의 이름과 확인값입니다. 새로 추가한 12종은 `provenance.kind`에 `kokoro-blender`를 표시하고 실제 배포 GLB의 파일명과 SHA-256을 기록합니다. 당시 원본과 라이선스는 `frontend/public/models/LICENSE.txt`에서 확인할 수 있습니다.

배치 좌표는 미터입니다. X는 폭 방향이고 Y는 위쪽이며 Z는 깊이 방향입니다. 현재 GLB는 폭과 깊이를 카탈로그 규격에 맞춰 만들었습니다. 바닥은 Y=0이고 원점은 바닥 면의 중심입니다. 앞뒤가 있는 가구의 정면은 +Z를 향합니다. 로더는 다른 GLB도 같은 배치 영역에 맞출 수 있도록 각 축의 크기와 위치를 보정합니다. 화면에 보이는 높이는 예제 모델의 치수입니다.

GLB를 기다리는 동안 대체 모델이 먼저 나타납니다. 대체 모델의 폭과 깊이는 공통 규격과 일치합니다. 모델 요청이 실패해도 대체 모델과 선택 ID는 유지합니다. 늦게 도착한 응답은 이미 제거된 장면의 모델을 바꾸지 않습니다. 로드에 실패한 URL은 다음 요청에서 다시 시도합니다.

## Blender에서 가구 다시 만들기

저장소 루트에서 Blender 4.5 LTS로 아래 명령을 실행하면 지정한 가구의 GLB와 같은 각도로 촬영한 WebP 썸네일을 함께 내보냅니다. 맨 뒤의 가구 ID를 생략하면 20종을 모두 만듭니다.

```bash
blender -b --factory-startup -P tools/blender/furniture.py -- --output /tmp/kokoro-models bed-linen storage-open
```

배포할 파일을 `frontend/public/models/`와 그 아래 `thumbnails/`로 복사합니다. 새로 제작한 12종의 GLB를 바꾸면 계약 파일의 해당 SHA-256도 함께 갱신합니다.

## 변경과 검증

규격은 JSON에서만 수정합니다. 같은 변경에서 아래 검사를 모두 실행합니다.

```bash
cd frontend
vp check
vp test
vp run build
```

```bash
cd backend
./mvnw test
./mvnw package
```

웹 테스트는 공통 규격을 그대로 읽는지 검사하고 실제 GLB의 폭과 깊이 및 높이와 바닥 위치를 확인합니다. 20종의 썸네일 파일과 모델 로드 실패 시 대체 모델도 검사합니다. 서버 테스트는 패키징된 원본의 일치와 모든 ID의 경계 배치 및 알 수 없는 ID 거부를 확인합니다. 중복 ID와 잘못된 치수도 두 환경에서 거부합니다.

이 테스트는 실제 브라우저 드래그나 헤드셋 검증을 대신하지 않습니다. 실기기 확인은 #6에서 기록합니다. #35의 경로별 CI는 `docs/contracts/` 변경 때 웹과 서버를 모두 검사하도록 연결합니다.
