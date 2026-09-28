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
vp test
vp run build
```

WebXR은 지원 기기에서 별도로 확인해야 합니다.

도면 이미지는 공간 편집기의 초안 생성에서 분석합니다. PDF 파일 업로드의 서버 상태가 READY여도 이미지 분석 결과가 생기는 것은 아닙니다. 지원 이미지 형식과 보정 안내는 화면에 표시합니다.

모델 파일을 불러오지 못하면 대체 모델로 표시됩니다. 서버 연결 오류가 나면 Spring과 PostgreSQL의 실행 상태 및 `VITE_API_BASE_URL`을 확인합니다. 환경 변수 변경 후 개발 서버를 다시 실행해야 합니다. 실제 기기 기록은 [이슈 #6](https://github.com/kokoro-band/kokoro/issues/6)에서 관리합니다.
