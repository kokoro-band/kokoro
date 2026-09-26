# 리모델링 API 계약

기본 주소는 `http://localhost:8080/api`입니다.

로컬 실행은 기본적으로 `local` 프로파일을 사용하며 별도 인증 키 없이 `local-user`를 현재 사용자로 사용합니다. 운영 프로파일은 Cognito JWT를 검증하고 프로젝트 소유자만 프로젝트를 조회·수정·삭제할 수 있습니다.

프로젝트와 가구 배치는 PostgreSQL에 저장되며, 서버 재시작 후에도 같은 프로젝트 ID로 조회할 수 있습니다. 스키마 변경은 Flyway 마이그레이션으로 적용합니다.

## 상태 확인

`GET /health`

## 프로젝트

`GET /projects`는 프로젝트 목록을 반환합니다.

`GET /projects/{projectId}`는 방 치수와 도면과 가구 배치를 포함한 프로젝트를 반환합니다.

`POST /projects`는 프로젝트를 만듭니다.

`DELETE /projects/{projectId}`는 소유자의 프로젝트와 연결된 배치·도면 작업·원본 도면을 삭제합니다.

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

도면 이미지를 자동으로 인식하지는 않습니다. 사용자가 평수와 방 개수로 방을 만들고 문과 창을 추가하며, 그 결과는 아래 공간 데이터 API로 저장합니다.

`GET /projects/{projectId}/floor-plan/jobs/{jobId}`로 변환 상태를 조회합니다.

```json
{
  "jobId": "…",
  "projectId": "…",
  "status": "PROCESSING",
  "progress": 25,
  "errorCode": null,
  "errorMessage": null,
  "retryable": true
}
```

완료 상태는 `READY`, 실패 상태는 `FAILED`이며 실패 시 `errorCode`, `errorMessage`, `retryable`을 확인합니다. 현재 저장소 구현은 로컬 파일 시스템이고, 운영 object storage는 `FloorPlanStorage` 구현체를 교체하는 방식으로 연결합니다.

원본 파일의 저장 경로인 `objectKey`는 API 응답에 포함하지 않습니다. 현재 서버의 READY는 데모 작업 상태이며 자동 인식된 공간을 의미하지 않습니다. 브라우저에서 이미지 초안을 만든 뒤 사용자가 보정한 공간은 별도의 공간 저장 API로 전송합니다.

처리 중인 도면이 있는 프로젝트에 새 도면을 업로드하면 `409 Conflict`를 반환합니다. 기존 작업이 완료되거나 실패한 뒤 새 도면을 업로드할 수 있습니다.

서버가 재시작되면 완료되지 않은 작업은 `FAILED`와 `PROCESSING_INTERRUPTED`로 정리되며 다시 업로드할 수 있습니다. 동시에 업로드한 요청은 서버가 한 건만 원자적으로 시작하고 나머지는 `409 Conflict`로 거부하며, 거부된 요청이 임시 저장한 파일은 정리합니다. 도면 처리 상태 갱신은 방과 가구 배치를 덮어쓰지 않습니다.

## 공간 데이터

`PUT /projects/{projectId}/room`

```json
{ "room": { "version": 2, "unit": "m", "wallHeight": 2.4, "bounds": { "width": 10.4, "depth": 6.4 }, "outline": [], "walls": [], "openings": [] } }
```

`room` 본문 형식은 `docs/contracts/room-model.md`를 따릅니다. 저장하면 프로젝트 응답의 `room` 필드로 함께 내려갑니다. 공간 데이터를 바꾸면 기존 가구 배치를 새 외곽선 기준으로 다시 검증하며, 벗어나는 가구가 있으면 `400`을 반환하고 저장하지 않습니다.

## 배치 저장

공간 구조가 유효하지 않으면 `400`과 `code: INVALID_ROOM`을 반환합니다. `violations` 배열의 `path`는 수정할 필드이며 `reason`은 사용자용 이유입니다. 예를 들어 없는 벽을 참조한 문은 `openings[0].wallId`를 가리킵니다. JSON 자체가 잘못되었거나 필수 값이 없으면 표준 요청 검증의 `400`이 반환될 수 있습니다. 어느 경우에도 이전 공간과 배치를 변경하지 않습니다.

`PUT /projects/{projectId}/layout`

```json
{
  "furniture": [
    {
      "id": "sofa-01",
      "catalogId": "sofa-cloud",
      "name": "클라우드 소파",
      "category": "소파",
      "x": 2.4,
      "z": 4.6,
      "rotation": 0,
      "color": "#D8C8B8"
    }
  ]
}
```

`x`와 `z`는 미터이며 원점은 공간 데이터 바운딩 박스의 왼쪽 위입니다. 자세한 규칙은 `docs/contracts/room-model.md`에 있습니다.

서버는 카탈로그의 실제 폭·깊이와 회전값으로 가구의 바닥 사각형을 만들어 공간 데이터의 외곽선 안에 있는지, 내부 벽이나 문 앞 여유 구역을 침범하지 않는지, 가구끼리 겹치지 않는지 검증합니다. 공간 데이터가 없으면 `dimensions` 크기의 직사각형을 외곽선으로 사용합니다. 경계선에 정확히 닿는 배치는 허용하고, 하나라도 실패하면 전체 배치를 저장하지 않습니다.

지원하지 않는 `catalogId`, 방 밖 좌표, 중복된 가구 `id`는 사유만 담은 `400 Bad Request`입니다. 방 경계·내부 벽·문 여유 구역·가구 겹침 위반은 구조화된 오류를 반환합니다:

```json
{
  "status": 400,
  "code": "WALL_COLLISION",
  "detail": "가구 '소파'가 벽을 가로지릅니다.",
  "furnitureIds": ["sofa-01"],
  "wallId": "wall-1"
}
```

`code`는 `OUTSIDE_ROOM`, `WALL_COLLISION`, `DOOR_CLEARANCE`, `FURNITURE_OVERLAP` 중 하나이며, 대상은 `furnitureIds`로, 충돌한 벽이나 문은 각각 `wallId`/`openingId`로 식별합니다. 문 여유 구역은 문 구간의 양쪽으로 0.8m를 비워두는 제품 휴리스틱이며 보행이나 시공 기준을 인증하는 수치가 아닙니다.

## 자연어 배치

`POST /projects/{projectId}/layout/commands`

```json
{ "message": "창가에 식물과 소파를 배치해줘" }
```

응답은 사용자에게 보여줄 문장과 적용한 동작과 변경된 프로젝트를 함께 반환합니다. 현재 처리기는 소파와 테이블과 의자와 화분과 비우기 명령을 지원합니다.

자연어 명령 응답에는 구조화된 `commands`도 포함됩니다. 명령 타입은 `ADD`, `MOVE`, `ROTATE`, `REMOVE`, `CLEAR`이며, 대상을 찾지 못한 명령이 하나라도 있으면 전체 요청을 `400 Bad Request`로 거부하고 아무것도 적용하지 않습니다.

같은 `catalogId`의 가구가 여러 개면 임의로 하나를 고르지 않고, 응답의 `candidates`(`furnitureId`, `name`)로 후보를 돌려주고 아무것도 바꾸지 않습니다. 요청에 `furnitureId`를 함께 보내면 그 가구를 대상으로 확정합니다:

```json
{ "message": "의자를 90도 회전해줘", "furnitureId": "chair-01" }
```

전체 삭제처럼 되돌리기 어려운 명령은 즉시 적용하지 않고 `requiresConfirmation: true`와 `proposalId`, `expiresAt`(5분 뒤 만료), `proposedCommands`로 확인을 먼저 요청합니다. 이 시점까지 `appliedActions`는 비어 있고 프로젝트는 바뀌지 않습니다.

`POST /projects/{projectId}/layout/commands/confirm`

```json
{ "proposalId": "..." }
```

제안된 명령만 실행하며 임의의 `commands`는 받지 않습니다. `proposalId`가 없거나 다른 사용자의 제안이면 `404`, 만료됐거나 제안 이후 배치가 바뀌었으면(`updatedAt` 불일치) `409`입니다. 같은 `proposalId`를 다시 보내면 재실행 없이 이미 처리된 결과 상태를 그대로 반환합니다.
