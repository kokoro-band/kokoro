# 리모델링 API 계약

기본 주소는 `http://localhost:8080/api`입니다.

프로젝트와 가구 배치는 PostgreSQL에 저장되며, 서버 재시작 후에도 같은 프로젝트 ID로 조회할 수 있습니다. 스키마 변경은 Flyway 마이그레이션으로 적용합니다.

## 상태 확인

`GET /health`

## 프로젝트

`GET /projects`는 프로젝트 목록을 반환합니다.

`GET /projects/{projectId}`는 방 치수와 도면과 가구 배치를 포함한 프로젝트를 반환합니다.

`POST /projects`는 프로젝트를 만듭니다.

```json
{
  "name": "우리 집 거실",
  "roomType": "거실",
  "dimensions": { "width": 5.8, "depth": 4.2, "height": 2.4 }
}
```

## 도면

`POST /projects/{projectId}/floor-plan`에 `file`이라는 이름으로 multipart 파일을 전송합니다. PDF와 PNG와 JPG만 허용하고 최대 크기는 15MB입니다.

업로드 응답은 기존 프로젝트 형식을 유지하면서 `floorPlan.jobId`를 함께 반환합니다. 업로드 직후에는 `PROCESSING` 상태이며, 변환 작업은 로컬 저장소 기반 비동기 데모 프로세서가 처리합니다.

`GET /projects/{projectId}/floor-plan/jobs/{jobId}`로 변환 상태를 조회합니다.

```json
{
  "jobId": "…",
  "projectId": "…",
  "objectKey": "project-id/uuid/plan.pdf",
  "status": "PROCESSING",
  "progress": 25,
  "errorCode": null,
  "errorMessage": null,
  "retryable": true
}
```

완료 상태는 `READY`, 실패 상태는 `FAILED`이며 실패 시 `errorCode`, `errorMessage`, `retryable`을 확인합니다. 현재 저장소 구현은 로컬 파일 시스템이고, 운영 object storage는 `FloorPlanStorage` 구현체를 교체하는 방식으로 연결합니다.

처리 중인 도면이 있는 프로젝트에 새 도면을 업로드하면 `409 Conflict`를 반환합니다. 기존 작업이 완료되거나 실패한 뒤 새 도면을 업로드할 수 있습니다.

### 변환 결과 계약 초안

실제 변환기가 반환할 공간 모델은 `schemaVersion: "1.0"`을 기준으로 합니다. 길이 단위는 미터이며, 바닥면 좌표는 Three.js의 X/Z 축을 사용하고 높이는 Y 축으로 올립니다. 벽의 `start`와 `end`는 바닥면 좌표이고, 개구부의 `offset`은 해당 벽의 시작점에서 잰 거리입니다.

```json
{
  "schemaVersion": "1.0",
  "jobId": "…",
  "unit": "m",
  "room": { "width": 5.8, "depth": 4.2, "height": 2.4 },
  "walls": [
    {
      "id": "wall-01",
      "start": { "x": 0, "z": 0 },
      "end": { "x": 5.8, "z": 0 },
      "height": 2.4,
      "thickness": 0.15
    }
  ],
  "openings": [
    {
      "id": "window-01",
      "wallId": "wall-01",
      "type": "WINDOW",
      "offset": 1.2,
      "width": 1.8,
      "height": 1.4,
      "sillHeight": 0.9
    }
  ]
}
```

## 배치 저장

`PUT /projects/{projectId}/layout`

```json
{
  "furniture": [
    {
      "id": "sofa-01",
      "catalogId": "sofa-cloud",
      "name": "클라우드 소파",
      "category": "소파",
      "x": 28,
      "z": 68,
      "rotation": 0,
      "color": "#D8C8B8"
    }
  ]
}
```

`x`와 `z`는 방 크기에 대한 백분율입니다. 운영 구현에서는 가구 치수와 충돌을 검사하고 허용 범위를 벗어난 값을 거부해야 합니다.

현재 서버는 카탈로그의 실제 폭·깊이와 회전값을 사용해 방 경계와 가구 간 겹침을 검증합니다. 경계선에 정확히 닿는 배치는 허용하고, 하나라도 실패하면 전체 배치를 저장하지 않습니다. 지원하지 않는 `catalogId`, 방 밖 좌표, 겹치는 가구는 `400 Bad Request`와 사유를 반환합니다.

## 자연어 배치

`POST /projects/{projectId}/layout/commands`

```json
{ "message": "창가에 식물과 소파를 배치해줘" }
```

응답은 사용자에게 보여줄 문장과 적용한 동작과 변경된 프로젝트를 함께 반환합니다. 현재 처리기는 소파와 테이블과 의자와 화분과 비우기 명령을 지원합니다.
