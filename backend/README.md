# 백엔드

Java 17과 Spring Boot 4.1.1을 사용하는 리모델링 프로젝트 API입니다.

```bash
./mvnw spring-boot:run
```

기본 포트는 `8080`입니다. 프로젝트와 가구 배치는 현재 메모리에 저장됩니다. 도면 업로드는 형식과 용량을 확인하지만 실제 도면 분석은 아직 실행하지 않습니다.

```bash
./mvnw test
./mvnw package
```

API 요청과 응답은 `docs/contracts/api.md`에 있습니다.
