# 백엔드

Java 17과 Spring Boot 4.1.1을 사용하는 리모델링 프로젝트 API입니다.

먼저 PostgreSQL을 실행합니다. Docker Desktop 또는 호환 런타임이 필요합니다.

```bash
docker compose up -d
./mvnw spring-boot:run
```

기본 포트는 `8080`입니다. 프로젝트와 가구 배치는 PostgreSQL에 저장됩니다. 연결 정보는 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` 환경 변수로 변경할 수 있습니다. Flyway가 애플리케이션 시작 시 스키마를 적용합니다. 도면 업로드는 형식과 용량을 확인하지만 실제 도면 분석은 아직 실행하지 않습니다.

```bash
./mvnw test
./mvnw package
```

테스트는 운영 데이터베이스와 같은 PostgreSQL 컨테이너를 Testcontainers로 실행합니다. Docker 데몬이 실행 중이어야 하며, 컨테이너 이미지는 테스트 실행 시 자동으로 준비됩니다.

```bash
docker compose down
```

API 요청과 응답은 `docs/contracts/api.md`에 있습니다.
