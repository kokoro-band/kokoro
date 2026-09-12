# 실시간 이벤트 계약

## 클라이언트에서 서버로

| 이벤트 | 필수 필드 | 의미 |
|---|---|---|
| `space:join` | `spaceId`, `reservationId` | 공간 입장 요청 |
| `avatar:move` | `x`, `y`, `z`, `rotationY`, `sequence` | 아바타 위치 갱신 |
| `seat:sit` | `seatId` | 좌석 착석 요청 |
| `seat:leave` | `seatId` | 좌석 퇴석 요청 |
| `presence:update` | `status`, `observedAt` | 집중 또는 자리비움 상태 보고 |

## 서버에서 클라이언트로

| 이벤트 | 필수 필드 | 의미 |
|---|---|---|
| `room:snapshot` | `participants`, `seats` | 입장 직후 전체 상태 |
| `participant:changed` | `participant` | 사용자 위치 또는 상태 변경 |
| `seat:changed` | `seat` | 좌석 예약 또는 착석 상태 변경 |
| `session:changed` | `session` | 집중 세션 상태 변경 |
| `domain:error` | `code`, `message` | 복구 가능한 요청 실패 |

`avatar:move`는 저장하지 않습니다. 서버는 오래된 `sequence` 값을 무시합니다. `seat:sit`은 클라이언트가 아니라 서버가 예약과 좌석 상태를 검사한 뒤 확정합니다.
