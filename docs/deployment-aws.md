# AWS 운영 배포 설계 초안

이 문서는 결정 전 초안입니다. 현재 구현을 기준으로 필요한 AWS 서비스와 선행 작업과 결정 항목을 정리하며, 이슈 #10의 설계 단계에 사용합니다. 실제 자원은 만들지 않았고 비용과 리전은 정해지지 않았습니다. "현재"로 적은 내용은 저장소의 코드와 문서에서 확인한 사실이고, "제안"은 결정이 필요한 항목입니다.

## 현재 상태

| 대상 | 현재 구현 |
|---|---|
| 프론트엔드 | React 정적 빌드. `VITE_API_MODE`가 `server`이면 Spring API를 사용하고 `local`이면 브라우저 저장소를 사용합니다. 모드는 빌드할 때 정해집니다. |
| 백엔드 | Spring Boot와 Java 17. `./mvnw package`가 JAR를 만들고 포트는 `PORT`(기본 8080)입니다. Dockerfile은 없습니다. |
| DB | PostgreSQL. 시작할 때 Flyway가 마이그레이션을 적용합니다. 현재 V1~V11입니다(V6 없음). |
| 인증 | `prod` 프로파일에서 Cognito JWT의 발급자(`COGNITO_ISSUER_URI`)를 검증하고 프로젝트 소유자만 접근합니다. 프론트에는 로그인 화면과 토큰 전달이 없습니다. |
| 도면 원본 | 서버 로컬 디스크(`FLOOR_PLAN_STORAGE_ROOT`). `FloorPlanStorage` 구현체는 `LocalFloorPlanStorage` 하나입니다. |
| 도면 작업 | 프로세스 안의 Executor가 실행하고 상태는 PostgreSQL에 있습니다. 재시작하면 처리 중이던 작업을 실패로 표시해 다시 올릴 수 있게 합니다. |
| 파일 삭제 | 프로젝트를 삭제하면 정리 기록을 남기고 삭제하며 실패하면 주기적으로 다시 시도합니다(`app.floor-plan-cleanup-retry-interval`). |
| CORS | 허용 주소 하나(`FRONTEND_ORIGIN`)입니다. |
| 상태 확인 | `/api/health`와 `/actuator/health`는 인증 없이 열려 있습니다. |
| 업로드 한도 | 파일 15MB, 요청 16MB(서버 설정)입니다. |
| 공개 데모 | GitHub Pages에서 `local` 모드로 배포합니다. Spring API와 DB는 포함하지 않습니다. |

## 목표 구성(제안)

```text
사용자 브라우저 (HTTPS, WebXR)
    │
    ▼
CloudFront ── 정적 파일 ──▶ S3 (프론트 빌드 파일)
    │
    └── /api ──▶ ALB ──▶ ECS Fargate (Spring Boot, ECR 이미지)
                               ├──▶ RDS for PostgreSQL
                               ├──▶ S3 (도면 원본)
                               └──▶ Cognito (JWT 검증)
```

사용자 PC의 Ollama와 브라우저 WebGPU 모델은 서버 구성에 들어가지 않습니다.

## 서비스 목록

| 구분 | 서비스 | 용도 |
|---|---|---|
| 필수 | S3 | 프론트 정적 파일, 도면 원본(버킷 분리) |
| 필수 | CloudFront, ACM | HTTPS와 `/api` 라우팅 |
| 필수 | Cognito | 사용자 로그인과 JWT 발급 |
| 필수 | RDS for PostgreSQL | 프로젝트와 배치와 작업과 제안 저장 |
| 필수 | ECS Fargate, ECR, ALB | Spring Boot 컨테이너 실행 |
| 필수 | VPC | RDS를 private 서브넷에 둡니다 |
| 필수 | IAM | GitHub Actions OIDC 배포 역할, 서버의 S3 접근 최소 권한 |
| 필수 | Secrets Manager 또는 Systems Manager Parameter Store | DB 비밀번호와 설정값 |
| 필수 | CloudWatch | 로그와 경보 |
| 권장 | AWS Budgets | 비용 상한 알림(#10 완료 조건) |
| 권장 | RDS 자동 백업 또는 AWS Backup | 백업과 복원 확인(#10 완료 조건) |
| 선택 | Route 53 | 도메인 사용 시 |
| 선택 | SQS | 실제 도면 변환기를 붙일 때 작업 큐 |
| 선택 | WAF | 공개 범위가 넓어질 때 |

## 코드와 설정의 선행 작업

| 작업 | 이유 |
|---|---|
| 로그인 화면과 요청의 토큰 전달 | 서버는 JWT를 요구하지만 프론트에는 `Authorization` 헤더를 붙이는 코드가 없습니다. |
| `FloorPlanStorage`의 S3 구현체 | 컨테이너는 디스크가 유지되지 않으므로 도면 원본을 로컬에 둘 수 없습니다. |
| Dockerfile과 이미지 빌드·게시 단계 | 현재 CI는 JAR만 빌드 파일로 올립니다. |
| 프론트 빌드 환경 변수 | `VITE_API_MODE=server`, `VITE_API_BASE_URL`(HTTPS 또는 같은 출처 `/api`), 필요하면 `VITE_BASE_PATH`. 비밀값은 넣지 않습니다. |
| 서버 환경 변수 | `SPRING_PROFILES_ACTIVE=prod`, `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `COGNITO_ISSUER_URI`, `FRONTEND_ORIGIN`, `PORT` |
| 다중 인스턴스 점검 | 도면 작업이 프로세스 안에서 실행되므로 서버가 여러 대일 때의 동작을 확인해야 합니다. |

## 배포와 복구

1. CI가 만든 커밋별 빌드 파일(frontend dist, backend JAR)을 이미지와 정적 파일로 게시합니다.
2. 새 이미지를 배포하고 `/actuator/health`로 확인한 뒤 트래픽을 전환합니다. 실패하면 이전 이미지로 되돌립니다.
3. DB 마이그레이션은 앞으로만 진행합니다. 이전 서버와 새 서버가 같은 DB에 쓰는 혼합 운영은 피합니다(`backend/README.md`의 이행 주의 참고).
4. 배포 전에 DB 백업을 만들고 복원 1건을 확인합니다.

## 운영과 종료

- 비용 상한과 운영 담당과 종료 절차를 정해 이 문서에 기록합니다(#10 완료 조건).
- AWS를 종료해도 정적 프론트는 `local` 모드로 계속 호스팅할 수 있습니다. 종료 전에 DB를 백업하고 사용자가 JSON으로 데이터를 가져갈 수 있는 방법(내보내기)을 제공해야 합니다. 이 기능은 아직 없습니다.

## 결정이 필요한 항목

1. 서버 모드를 운영에서 쓸지, 정적 `local` 모드만 호스팅할지.
2. 실행 환경: ECS Fargate와 App Runner 같은 대안 중 무엇을 쓸지.
3. 도면 원본의 보관 기간과 삭제 범위(#12).
4. 리전과 비용 상한.
5. 서버 로그와 접근 기록의 보존 기간.

## AI 기능 확장(참고)

현재 자연어 배치 요청은 규칙 처리와 사용자 PC의 모델(Ollama, WebGPU)로 처리하며 서버에 모델을 두지 않습니다. 서버에서 모델을 호출해야 한다면 Amazon Bedrock이, 도면 속 글자와 치수를 읽어야 한다면 Amazon Textract가 후보입니다. 둘 다 사용 신청과 리전별 제공 여부 확인이 먼저입니다.
