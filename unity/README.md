# Unity 클라이언트

3D 공간과 아바타 이동과 좌석 상호작용을 담당하는 Unity Web 프로젝트입니다.

## 시작하기

1. Unity Hub에서 이 폴더를 엽니다.
2. Editor는 `6000.3.23f1`을 사용합니다.
3. Web Build Support 모듈을 설치합니다.
4. `Assets/Scenes/Main.unity` 장면을 Unity Editor에서 생성합니다.
5. 빈 GameObject를 만들고 이름을 `AppBootstrap`으로 지정합니다.
6. `AppBootstrap` 컴포넌트를 추가합니다.

현재 머신에는 Unity Editor가 없어 장면과 Web 빌드는 생성하지 않았습니다. Editor를 처음 여는 담당자가 Unity가 만든 `.meta` 파일과 초기 장면을 함께 커밋해야 합니다.

## 책임 경계

- Unity는 로그인과 좌석 예약 화면을 만들지 않습니다.
- 프론트엔드가 전달한 실행 문맥으로 백엔드에 연결합니다.
- 좌석 착석 가능 여부는 백엔드 응답으로 확정합니다.
- 운영 서버 주소와 접근 토큰을 코드에 직접 저장하지 않습니다.
