# 프론트엔드

도면과 가구 카탈로그와 2D 편집과 Three.js 3D 미리보기와 WebXR VR을 모두 제공하는 React 웹 애플리케이션입니다. VR용 별도 앱은 사용하지 않습니다.

프론트엔드 도구는 Vite+로 관리합니다.

```bash
vp install
vp dev
```

기본값은 서버 없이 사용할 수 있는 로컬 데모입니다. `VITE_API_MODE=server`와 `VITE_API_BASE_URL=http://localhost:8080/api`를 설정하면 Spring 서버에 연결됩니다.

검증은 아래 명령으로 실행합니다.

```bash
vp check
vp run build
```

WebXR은 지원 기기에서 별도로 확인해야 합니다.
