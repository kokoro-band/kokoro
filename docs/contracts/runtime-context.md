# Unity 실행 문맥

프론트엔드가 Unity Web 빌드를 시작할 때 아래 JSON을 전달합니다.

```json
{
  "apiBaseUrl": "http://localhost:3000/api",
  "webSocketUrl": "ws://localhost:3000/space",
  "accessToken": "development-token",
  "spaceId": "main-study-cafe",
  "reservationId": "reservation-id"
}
```

`accessToken`은 URL에 넣지 않습니다. 프론트엔드에서 Unity 인스턴스의 `AppBootstrap.ReceiveContext` 메서드로 전달합니다.

서버 주소는 환경별로 바뀔 수 있습니다. Unity 코드에 운영 주소를 직접 작성하지 않습니다.
