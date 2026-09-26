# 백엔드

Java 17과 Spring Boot 4.1.1을 사용하는 리모델링 프로젝트 API입니다.

먼저 PostgreSQL을 실행합니다. Docker Desktop 또는 호환 런타임이 필요합니다.

```bash
docker compose up -d
./mvnw spring-boot:run
```

기본 포트는 `8080`입니다. 프로젝트와 가구 배치는 PostgreSQL에 저장됩니다. 연결 정보는 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` 환경 변수로 변경할 수 있습니다. Flyway가 애플리케이션 시작 시 스키마를 적용합니다. 도면 업로드는 형식과 용량을 확인하지만 실제 도면 분석은 아직 실행하지 않습니다.

도면 원본은 로컬 파일에 저장하고 비동기 데모 작업이 PostgreSQL의 상태를 갱신합니다. 실제 도면 인식은 수행하지 않습니다. 저장 경로는 `FLOOR_PLAN_STORAGE_ROOT` 환경 변수로 변경할 수 있습니다. 기본값은 시스템 임시 디렉터리이므로 원본을 보존하려면 별도 영구 경로를 지정해야 합니다. AWS S3 연결과 재시작 후 작업 복구는 후속 작업입니다.

로컬 실행은 `local` 프로파일을 사용해 별도 인증 키 없이 `local-user` 소유자로 동작합니다. 운영에서는 `prod` 프로파일과 `COGNITO_ISSUER_URI`를 사용해 Cognito JWT를 검증합니다.

```bash
./mvnw test
./mvnw package
```

테스트는 운영 데이터베이스와 같은 PostgreSQL 컨테이너를 Testcontainers로 실행합니다. Docker 데몬이 실행 중이어야 하며, 컨테이너 이미지는 테스트 실행 시 자동으로 준비됩니다.

```bash
docker compose down
```

API 요청과 응답은 [API 계약](../docs/contracts/api.md)에 있습니다. 권한 검사와 파일 정리의 남은 작업은 #54와 #12에서 확인합니다. `local`은 개발용 공통 계정이므로 외부 사용자를 위한 운영 인증을 대신하지 않습니다.

## 실행 오류 확인

DB 연결 오류가 나면 `docker compose ps`로 PostgreSQL 상태와 `DB_URL`을 확인합니다. 테스트가 Docker를 찾지 못하면 데몬 실행 여부를 확인합니다. 파일 저장 오류는 `FLOOR_PLAN_STORAGE_ROOT` 경로의 쓰기 권한과 공간을 확인합니다. 운영 프로파일은 `COGNITO_ISSUER_URI`를 설정해야 하며 사용자 로그인 화면은 별도 작업입니다.
