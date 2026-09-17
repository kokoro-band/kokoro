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

현재 응답은 검증이 끝나면 바로 `READY` 상태를 반환합니다. 실제 변환기가 연결되면 `PROCESSING`과 진행률을 반환하고 별도 상태 조회 API를 추가합니다.

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

## 자연어 배치

`POST /projects/{projectId}/layout/commands`

```json
{ "message": "창가에 식물과 소파를 배치해줘" }
```

응답은 사용자에게 보여줄 문장과 적용한 동작과 변경된 프로젝트를 함께 반환합니다. 현재 처리기는 소파와 테이블과 의자와 화분과 비우기 명령을 지원합니다.
