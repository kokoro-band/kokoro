# AWS 운영 배포 가이드

AWS 계정과 권한을 받은 뒤 순서대로 따라 할 수 있게 정리한 실행 문서입니다. 현재 구현을 기준으로 쓴 초안이며 AWS에서 실제로 실행해 검증하지 않았습니다. 확인하지 못한 항목은 "확인 필요"로 표시했습니다. 비용과 리전과 인스턴스 사양은 정해지지 않았습니다.

> **먼저 읽을 경고**
> 서버의 보안 설정은 Spring 프로파일로만 정해집니다. `SPRING_PROFILES_ACTIVE=prod`를 설정하지 않으면 기본값 `local`이 적용되어 **인증 없이 모든 API가 열리고 모든 사용자가 같은 `local-user`로 동작합니다**. `SECURITY_MODE` 환경 변수는 코드에서 쓰이지 않습니다. 배포한 뒤 반드시 인증 없는 요청이 401인지 확인하세요(9단계).

## 1. 구성

처음에는 서버 한 대와 DB 한 개로 시작하고, 프론트는 지금처럼 GitHub Pages에 둡니다.

```text
브라우저 ──HTTPS──▶ GitHub Pages (프론트, 정적 파일)
   │
   └─HTTPS─▶ [CloudFront 또는 Caddy] ──HTTP──▶ EC2 (Spring Boot, :8080)
                                                  ├──▶ RDS for PostgreSQL (private)
                                                  ├──▶ EBS 디스크 (도면 원본)
                                                  └──▶ Cognito (토큰 발급자 확인)
```

| 단계 | 구성 | 권한 요청 |
|---|---|---|
| 처음 | EC2, RDS for PostgreSQL, Cognito, IAM, AWS Budgets | 즉시 사용 |
| 확장 | S3(도면과 배포 파일), CloudFront와 ACM, ECS Fargate와 ECR과 ALB, Secrets Manager, CloudWatch | 미리 요청 |

배포 파일을 서버로 옮기는 수단이 필요해서 S3(배포 파일용 버킷)는 사실상 처음부터 쓰게 됩니다. 6단계와 8단계를 참고하세요.

## 2. 시작 전 결정 항목

| 항목 | 선택지 | 결정 |
|---|---|---|
| 서버 모드 운영 여부 | 서버 모드 / 정적 로컬 모드만 | |
| HTTPS 방식 | A. 도메인 구입 + Caddy / B. CloudFront 기본 주소 | |
| 리전 | 예: ap-northeast-2 | |
| 비용 상한(월) | | |
| 프론트 구성 | Pages를 서버 모드로 바꿈 / 서버 모드용 주소를 따로 둠 | |
| 도면 보관 기간 | #12 | |

프론트 구성에 주의하세요. 지금 Pages 빌드는 `VITE_API_MODE=local`이고 모드는 빌드할 때 정해집니다. 같은 주소를 서버 모드로 바꾸면 서버 없이 되던 데모가 로그인과 서버를 요구하게 됩니다. 로컬 데모를 유지하려면 서버 모드용 주소를 따로 두어야 합니다.

## 3. 실행 순서

### 0단계. 비용 보호
1. AWS Budgets에서 월 비용 상한과 알림(예: 상한의 50%, 80%, 100%)을 먼저 만듭니다.
2. 루트 계정에 MFA를 설정하고 일상 작업은 IAM 사용자나 역할로 합니다.

### 1단계. 네트워크와 보안 그룹
1. 기본 VPC로 시작합니다.
2. 보안 그룹 두 개를 만듭니다.
   - `kokoro-app`: 인바운드는 HTTPS용 포트(A는 80과 443, B는 CloudFront만)이며 8080은 외부에 열지 않습니다. 관리는 SSH 대신 Systems Manager를 씁니다.
   - `kokoro-db`: 인바운드 5432를 `kokoro-app` 보안 그룹에서만 허용합니다.
3. RDS는 공개 접근을 끕니다.

### 2단계. RDS for PostgreSQL
1. 엔진은 PostgreSQL 16입니다(테스트가 `postgres:16`을 씁니다).
2. 단일 AZ, 가장 작은 사양으로 시작하고 자동 백업을 켭니다. 보존 기간은 정하세요.
3. 데이터베이스 이름 `kokoro`, 전용 사용자를 만듭니다. 관리자 계정으로 앱을 연결하지 않습니다.
4. Flyway가 서버 시작 시 스키마를 만들므로 별도 스키마 작업은 필요 없습니다.

### 3단계. Cognito
1. User Pool을 만들고 App Client를 **비밀값 없는 공개 클라이언트**로 만듭니다(브라우저용).
2. 호스티드 UI 도메인을 정하고 콜백 주소에 프론트 주소(`https://kokoro-band.github.io/kokoro/` 등)와 개발용 `http://localhost:5173`을 등록합니다.
3. 발급자 주소는 `https://cognito-idp.<리전>.amazonaws.com/<User Pool ID>` 형식이며 서버의 `COGNITO_ISSUER_URI`가 됩니다.
4. 서버는 발급자만 확인하고 토큰의 대상(audience)은 확인하지 않습니다. 같은 User Pool의 토큰은 모두 통과합니다. 한 앱만 쓰는 지금은 문제가 없지만 다른 앱을 붙이면 점검해야 합니다.
5. 소유자 식별은 토큰의 `sub`입니다.
6. **프론트의 로그인 화면과 요청에 `Authorization: Bearer` 헤더를 붙이는 코드가 아직 없습니다.** 이 작업이 끝나기 전에는 서버 모드를 공개할 수 없습니다(10단계 작업 목록 참고).

### 4단계. EC2 준비
1. Amazon Linux 계열과 Java 17(Corretto 등)을 사용합니다. 인스턴스 사양은 작은 것으로 시작해 메모리 사용을 실측해 정합니다(JVM은 메모리가 부족하면 불안정합니다. 확인 필요).
2. 인스턴스 프로파일에 Systems Manager 접속 권한과 로그 전송 권한을 부여합니다.
3. 도면 저장용 EBS 디렉터리 `/var/lib/kokoro/floor-plans`를 만들고 서비스 계정만 쓰게 합니다.
4. 서비스 계정 `kokoro`와 앱 디렉터리 `/opt/kokoro/releases`를 만듭니다.

### 5단계. 서버 설정
환경 파일 `/etc/kokoro/kokoro.env`(권한 600, 소유자 `kokoro`)에 값을 둡니다.

| 변수 | 값 | 비고 |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | **필수**. 위 경고 참고 |
| `DB_URL` | `jdbc:postgresql://<RDS 엔드포인트>:5432/kokoro` | |
| `DB_USERNAME`, `DB_PASSWORD` | 전용 사용자 | 비밀값 |
| `COGNITO_ISSUER_URI` | 3단계의 발급자 주소 | prod에서 필수 |
| `FRONTEND_ORIGIN` | `https://kokoro-band.github.io` | 경로 없이 출처만. 한 주소만 허용 |
| `FLOOR_PLAN_STORAGE_ROOT` | `/var/lib/kokoro/floor-plans` | 기본값은 임시 폴더라 재부팅 시 사라짐 |
| `PORT` | `8080` | 기본값 |

systemd 서비스(`/etc/systemd/system/kokoro.service`) 예시입니다.

```ini
[Unit]
Description=Kokoro API
After=network.target

[Service]
User=kokoro
EnvironmentFile=/etc/kokoro/kokoro.env
ExecStart=/usr/bin/java -jar /opt/kokoro/current.jar
Restart=on-failure
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
```

`/opt/kokoro/current.jar`는 `releases/` 안의 JAR를 가리키는 심볼릭 링크입니다. JAR 이름은 `kokoro-api-0.1.0.jar` 형식입니다.

### 6단계. HTTPS
프론트가 HTTPS이므로 API도 HTTPS여야 합니다(HTTP면 브라우저가 차단합니다).

- **A. 도메인이 있을 때:** 서버에 Caddy를 두고 도메인을 `localhost:8080`으로 프록시하면 인증서를 자동으로 발급받습니다. 도메인과 DNS 레코드가 필요합니다.
- **B. 도메인이 없을 때:** CloudFront 배포를 만들고 오리진을 EC2의 공개 DNS(HTTP)로 지정합니다. 기본 `*.cloudfront.net` 주소가 HTTPS를 제공합니다. `/api/*`는 캐시를 끄고 `Authorization` 헤더와 모든 메서드를 오리진으로 전달하게 설정합니다. EC2는 CloudFront에서 오는 요청만 받도록 보안 그룹을 제한합니다. 이 항목들의 정확한 설정 이름은 콘솔에서 확인이 필요합니다.

### 7단계. 프론트 연결
프론트 빌드에 아래 값을 넣습니다(`VITE_` 값은 빌드에 포함되므로 비밀값을 넣지 않습니다).

| 변수 | 값 |
|---|---|
| `VITE_API_MODE` | `server` |
| `VITE_API_BASE_URL` | 6단계의 HTTPS 주소 + `/api` |
| `VITE_BASE_PATH` | Pages 하위 경로면 `/kokoro/` |

### 8단계. 자동 배포(GitHub Actions)
현재 CI는 커밋별 JAR(`backend-<sha>`)를 만들기만 하고 서버로 옮기는 단계가 없습니다. 아래는 제안 구성입니다.

1. GitHub OIDC 공급자를 IAM에 등록하고 배포 전용 역할을 만듭니다. 장기 액세스 키는 쓰지 않습니다.
2. 역할에는 배포 버킷 업로드와 Systems Manager 명령 실행 권한만 줍니다(대상은 이 인스턴스).
3. 워크플로 순서: JAR 빌드 → 배포 버킷에 `kokoro-api-<sha>.jar` 업로드 → Systems Manager로 서버에 명령 실행 → 서버가 JAR를 내려받아 `releases/`에 두고 링크 교체 후 서비스 재시작 → `/actuator/health` 확인 → 실패하면 이전 링크로 복원.
4. 이전 JAR는 최소 3개 보관합니다.

배포 워크플로 파일은 아직 없습니다(10단계).

### 9단계. 배포 후 검증
| 확인 | 기대 결과 |
|---|---|
| `GET /actuator/health` | 200 (인증 없음) |
| `GET /api/projects` 토큰 없이 | **401** (200이면 `prod` 프로파일이 아닙니다. 즉시 중단) |
| 토큰으로 프로젝트 생성 | 201 |
| 다른 사용자의 토큰으로 위 프로젝트 조회 | 404 |
| 도면 업로드 후 작업 상태 조회 | `READY`까지 진행 |
| 프로젝트 삭제 | 204 |
| 브라우저에서 프론트 접속 후 CORS 오류 없음 | 정상 |
| 서버 재시작 후 같은 프로젝트 조회 | 유지 |

## 4. 배포와 롤백

- 평소 배포는 8단계 순서를 따릅니다. 배포 전에 RDS 수동 스냅샷을 만듭니다.
- 앱 롤백은 `current.jar` 링크를 이전 JAR로 되돌리고 재시작합니다.
- **DB 롤백은 앱 롤백으로 되지 않습니다.** Flyway는 앞으로만 진행합니다. 스키마가 바뀐 배포를 되돌릴 때는 이전 JAR가 새 스키마를 읽을 수 있는지 먼저 확인하고, 안 되면 스냅샷 복원이 필요합니다.
- 이전 서버와 새 서버가 같은 DB에 동시에 쓰는 구성은 피합니다(`backend/README.md`의 이행 주의 참고). 소수 회전각 이행(V8)과 프로젝트 버전(V9) 이후에는 구버전 서버가 값을 잃거나 충돌을 일으킵니다.
- 마이그레이션 번호는 V6이 비어 있고 V10과 V11이 V9 다음에 있습니다. 새 마이그레이션은 V12부터 만듭니다.

## 5. 운영

- 로그: 서비스 로그는 `journalctl -u kokoro`로 봅니다. CloudWatch로 보내려면 에이전트 설정이 필요합니다(확장 단계).
- 도면 원본은 EBS에만 있습니다. 주기적인 EBS 스냅샷을 켜지 않으면 인스턴스를 잃을 때 함께 사라집니다.
- 도면 정리 실패는 `floor_plan_file_cleanup` 테이블에 쌓이고 주기적으로 다시 시도합니다. 오래 남은 행이 있으면 저장소 오류를 점검하세요.
- 비용은 Budgets 알림으로 확인하고 사용하지 않을 때는 인스턴스를 중지합니다(중지해도 EBS와 RDS 비용은 남습니다. 확인 필요).

## 6. 종료 절차

1. 서버 모드를 종료하기 전에 사용자에게 알리고 RDS 스냅샷과 도면 파일을 보관합니다.
2. 사용자가 데이터를 가져갈 수 있는 JSON 내보내기를 제공합니다. **이 기능은 아직 없습니다.**
3. 리소스를 삭제합니다(EC2, RDS, EBS 스냅샷, Cognito, CloudFront).
4. 정적 로컬 모드 데모(GitHub Pages)는 AWS와 무관하게 계속 호스팅할 수 있습니다.

## 7. 확장 단계

| 변경 | 이유 | 선행 작업 |
|---|---|---|
| 도면 원본을 S3로 이동 | 서버를 여러 대로 늘리거나 컨테이너로 옮기면 디스크가 유지되지 않음 | `FloorPlanStorage`의 S3 구현체 |
| 컨테이너 전환(ECS Fargate, ECR, ALB) | 무중단 배포와 확장 | Dockerfile, 이미지 빌드·게시 단계 |
| 비밀값을 Secrets Manager로 이동 | 환경 파일보다 안전한 교체 | 서버의 값 읽기 방식 정리 |
| CloudWatch 연동 | 경보와 로그 검색 | 에이전트 또는 로그 드라이버 |
| 도면 변환 작업 큐(SQS) | 실제 변환기를 붙일 때 요청 안에서 오래 실행하지 않음 | 작업자 분리. 현재는 프로세스 안에서 실행 |

도면 작업이 프로세스 안에서 실행되므로 서버를 여러 대로 늘리는 구성은 점검 없이 하지 않습니다.

## 8. 코드와 문서 작업 목록(이슈로 분리할 항목)

| 작업 | 영역 | 비고 |
|---|---|---|
| 로그인 화면과 요청의 토큰 전달 | 프론트 | 서버 모드 공개의 선행 조건 |
| 배포 워크플로(JAR 업로드, Systems Manager 실행, 롤백) | infra | 8단계 |
| 서버가 `prod` 프로파일이 아닐 때 공개 주소로 시작되지 않게 막는 점검 | 백엔드 | 경고 항목. 현재는 없음 |
| `FloorPlanStorage`의 S3 구현체 | 백엔드 | 확장 단계 |
| Dockerfile | infra | 확장 단계 |
| JSON 내보내기/가져오기 | 프론트 | 종료 절차 |
| 허용 주소 여러 개 지원 | 백엔드 | 현재 `FRONTEND_ORIGIN` 한 개 |
| 토큰 대상(audience) 검증 | 백엔드 | 앱이 늘어날 때 |

## 9. 위험과 미확인 사항

- 이 문서의 AWS 설정(CloudFront 헤더 전달, 보안 그룹 제한, 인스턴스 사양, 비용)은 실제 계정에서 검증하지 않았습니다.
- 계정 정책에 따라 IAM 역할 생성이 제한될 수 있습니다. 역할 생성과 `iam:PassRole` 권한을 요청에 포함해야 합니다.
- 도면 원본의 보관과 삭제 범위(#12)와 로그 보존 기간은 결정되지 않았습니다.
- 단일 서버라 서버가 멈추면 서비스가 중단됩니다. 가용성 목표는 정하지 않았습니다.
