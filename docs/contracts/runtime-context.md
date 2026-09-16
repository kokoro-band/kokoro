# 웹 2D 및 WebXR 실행 문맥

2D와 일반 3D와 VR 모드는 하나의 React 애플리케이션과 같은 프로젝트 상태를 사용합니다. 별도의 VR 앱으로 실행 문맥을 전달하지 않습니다.

```json
{
  "apiBaseUrl": "http://localhost:8080/api",
  "projectId": "living-room-01",
  "viewMode": "vr",
  "layoutVersion": "2026-09-16T00:00:00Z",
  "xr": {
    "requiredFeatures": ["local-floor"],
    "optionalFeatures": ["bounded-floor", "hand-tracking"]
  }
}
```

`viewMode`는 `2d`와 `3d`와 `vr` 중 하나입니다. 모드를 바꿔도 방 치수와 가구 배열은 바뀌지 않습니다. VR 진입은 `navigator.xr`과 Three.js의 WebXR 렌더러를 통해 시작합니다. 지원하지 않는 브라우저에서는 2D와 3D 기능을 그대로 사용할 수 있어야 합니다.

운영 환경에서 WebXR은 HTTPS 또는 로컬 개발 주소가 필요합니다. 헤드셋 지원 여부와 컨트롤러 입력은 기기에서 별도로 확인해야 합니다.
