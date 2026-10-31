# AWS 시연 배포 가이드

공유 AWS 계정(인하대 캡스톤)의 정책 안에서 서버 모드를 시연 배포하는 순서입니다. 코드는 실제로 확인했지만 AWS 설정은 실제 계정에서 실행해 검증하지 않았습니다. 확인하지 못한 항목은 "확인 필요"로 표시했습니다. 운영 서비스 수준의 구성(무중단 배포, 고가용성, 도메인)은 다루지 않습니다.

> **먼저 읽을 경고**
> 서버의 보안 설정은 Spring 프로파일로만 정해집니다. `SPRING_PROFILES_ACTIVE`를 설정하지 않으면 기본값 `local`이 적용되어 **인증 없이 모든 API가 열리고 모든 사용자가 같은 `local-user`로 동작합니다**. 이 배포에서는 반드시 `demo`로 설정하고, 배포한 뒤 인증 없는 요청이 401인지 확인하세요(5단계). `SECURITY_MODE` 환경 변수는 코드에서 쓰이지 않습니다.

## 1. 구성

```text
브라우저 ──HTTPS──▶ CloudFront (*.cloudfront.net)
                     ├─ /*      ──▶ S3 (프론트 정적 파일, 비공개 버킷)
                     └─ /api/*  ──HTTP :8080──▶ EC2 (Spring Boot, demo 프로파일)
                                                   ├──▶ RDS for PostgreSQL (비공개)
                                                   └──▶ EBS 디스크 (도면 원본)
```

프론트와 API가 같은 주소를 쓰므로 CORS 설정이 필요 없고, WebXR에 필요한 HTTPS도 CloudFront 기본 주소로 충족합니다. 기존 GitHub Pages 로컬 데모는 그대로 둡니다. 모드는 빌드할 때 정해지므로 서버 모드 화면은 별도 주소에서 제공합니다.

## 2. 계정 정책(운영진 안내 기준)

2026년 10월 13일 운영진이 안내한 내용이며, 바뀔 수 있으니 막히면 운영진에게 작업 내용과 오류 메시지를 전달합니다.

| 항목 | 사용 가능한 범위 | 이 가이드에서의 사용 |
|---|---|---|
| 리전 | 서울(ap-northeast-2) | 모든 리소스 |
| 이름 | 모든 리소스 이름은 `inha-capstone-01-`로 시작 | 모든 리소스 |
| EC2 | t3.nano~t3.small(안내문에는 t3.medium까지). 인스턴스 프로필 `SafeInstanceProfile-inha-capstone-01` 사용. 보안 그룹은 규칙 없이 만든 뒤 수정 | 서버 1대 |
| RDS PostgreSQL | db.t4g.micro, 단일 AZ, 비공개, 저장소 20GiB 이하 | DB 1개 |
| S3 | `inha-capstone-01` 접두사 버킷 | 프론트와 배포 파일 |
| CloudFront | 배포 생성·수정·무효화 가능, 삭제는 운영진 요청 | HTTPS 진입점 |
| CloudWatch | 로그와 지표 조회, 알람 | 선택 |
| Cognito | 팀 풀의 App Client만 관리. 사용자 관리 불가 | 사용하지 않음 |
| IAM | 역할·정책·Access Key 생성은 운영진 요청. Access Key 발급 불가 | 사용하지 않음 |
| 제공하지 않음 | Route 53, ACM, Secrets Manager, AWS Budgets(비용은 운영진이 관리), ECS Fargate, ECR, ALB | 쓰지 않음 |

운영진은 인스턴스를 켜 둔 채 사용률이 낮으면 용도를 묻습니다. 시연 때만 켜고 평소에는 중지하세요. 중지해도 EBS와 RDS 비용은 남습니다(확인 필요).

## 3. 시작 전 결정 항목

| 항목 | 결정 |
|---|---|
| HTTPS 방식 | CloudFront 기본 주소. 도메인과 ACM은 정책상 사용하지 않습니다. |
| 로그인 | `demo` 프로파일의 시연 계정(#213). Cognito는 사용하지 않습니다. |
| 프론트 | S3 + CloudFront. Pages 로컬 데모는 유지합니다. |
| 비용 상한 | 운영진이 팀별로 관리합니다. |
| 도면 보관 기간 | [#12](https://github.com/kokoro-band/kokoro/issues/12)와 `PRODUCT.md`의 보존 기본안을 따릅니다. |
| 기존 인스턴스 재사용 | 콘솔에서 사양과 설치 상태를 보고 정합니다. |

`demo` 프로파일은 #213(PR #214)이 병합되어야 사용할 수 있습니다. 그 전에는 로컬 프로파일의 인증 없는 서버를 공개 주소에 올리지 않습니다.

## 4. 실행 순서

### 0단계. 빌드 준비
1. 시연 계정의 비밀번호 해시를 만듭니다. 평문을 서버나 저장소에 두지 않습니다.
   ```bash
   htpasswd -nbB -C 10 demo '비밀번호' | cut -d: -f2
   ```
2. 서명 키로 쓸 32바이트 이상의 무작위 문자열을 만듭니다(예: `openssl rand -base64 48`).
3. JAR를 만듭니다: `cd backend && ./mvnw package`. 결과는 `target/kokoro-api-0.1.0.jar`입니다.
4. 프론트를 서버 모드로 빌드합니다. `VITE_` 값은 빌드에 포함되므로 비밀값을 넣지 않습니다.
   ```bash
   cd frontend
   VITE_API_MODE=server VITE_AUTH_MODE=demo VITE_API_BASE_URL=/api vp run build
   ```

### 1단계. 보안 그룹
1. `inha-capstone-01-app`: 규칙 없이 만든 뒤 8080 인바운드를 CloudFront에서 오는 요청으로 제한합니다. CloudFront의 관리형 접두사 목록을 쓸 수 있는지는 확인이 필요합니다. 사용할 수 없으면 범위를 임시로 넓히고 운영진과 상의합니다. 관리는 8080이 아니라 EC2 접속 방식을 따로 정합니다(Systems Manager 사용 가능 여부 확인 필요).
2. `inha-capstone-01-db`: 5432 인바운드를 `inha-capstone-01-app` 보안 그룹에서만 허용합니다.

### 2단계. RDS for PostgreSQL
1. 엔진은 PostgreSQL 16입니다(테스트가 `postgres:16`을 씁니다).
2. 템플릿은 프리티어, db.t4g.micro, 단일 AZ, 저장소 20GiB 이하이며 기본 VPC를 사용합니다. 생성 화면의 EC2 연결 옵션은 쓰지 않고 퍼블릭 액세스는 끕니다.
3. 데이터베이스 이름은 `kokoro`이고 전용 사용자를 만듭니다. Flyway가 서버 시작 시 스키마를 만듭니다.
4. 자동 백업의 보존 기간은 정합니다.

### 3단계. EC2
1. 인스턴스 프로필 `SafeInstanceProfile-inha-capstone-01`을 연결하고 `inha-capstone-01-app` 보안 그룹을 붙입니다.
2. Java 17을 설치합니다(Amazon Linux 계열은 Corretto). 메모리 사용은 실측해서 사양을 정합니다(확인 필요).
3. 서비스 계정 `kokoro`, 앱 디렉터리 `/opt/kokoro/releases`, 도면 디렉터리 `/var/lib/kokoro/floor-plans`를 만들고 서비스 계정만 쓰게 합니다.
4. 환경 파일 `/etc/kokoro/kokoro.env`(권한 600, 소유자 `kokoro`)에 값을 둡니다.

| 변수 | 값 | 비고 |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `demo` | **필수** |
| `DEMO_ACCOUNTS` | `이름:bcrypt해시` 쌍을 쉼표로 연결 | 비밀값. 형식이 틀리면 서버가 시작하지 않습니다 |
| `DEMO_JWT_SECRET` | 32바이트 이상 무작위 문자열 | 비밀값. 짧으면 서버가 시작하지 않습니다 |
| `DEMO_TOKEN_TTL` | 기본 `PT12H` | 선택 |
| `DB_URL` | `jdbc:postgresql://<RDS 엔드포인트>:5432/kokoro` | |
| `DB_USERNAME`, `DB_PASSWORD` | 전용 사용자 | 비밀값 |
| `FLOOR_PLAN_STORAGE_ROOT` | `/var/lib/kokoro/floor-plans` | 기본값은 임시 폴더라 재부팅 시 사라집니다 |
| `FRONTEND_ORIGIN` | CloudFront 주소 | 같은 출처로 쓰면 CORS를 거치지 않습니다 |

systemd 서비스 `/etc/systemd/system/kokoro.service` 예시입니다.

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

`/opt/kokoro/current.jar`는 `releases/` 안의 JAR를 가리키는 심볼릭 링크입니다.

CloudFront는 EC2의 공개 DNS를 오리진으로 씁니다. 인스턴스를 중지했다가 시작하면 공개 DNS가 바뀔 수 있습니다. 고정 주소(Elastic IP)를 쓸 수 있는지는 확인이 필요하며, 쓸 수 없으면 시작할 때마다 CloudFront 오리진을 갱신해야 합니다.

### 4단계. S3와 CloudFront
1. 버킷 `inha-capstone-01-kokoro-web`(프론트)과 `inha-capstone-01-kokoro-deploy`(JAR)를 만들고 퍼블릭 액세스는 막습니다.
2. 프론트 빌드(`frontend/dist`)를 웹 버킷에 올립니다.
3. CloudFront 배포를 만듭니다.
   - 기본 동작: S3 웹 버킷 오리진(비공개 접근 설정). 기본 루트 객체 `index.html`.
   - `/api/*` 동작: 오리진은 EC2(HTTP, 포트 8080). 캐시를 끄고 모든 HTTP 메서드와 `Authorization` 헤더를 오리진으로 전달합니다.
   - 도면 업로드 용량(최대 15MB)과 요청 시간 제한을 확인합니다.
4. 이 설정 이름들은 콘솔에서 확인이 필요합니다.

### 5단계. 배포 후 검증
| 확인 | 기대 결과 |
|---|---|
| `GET /api/health` | 200 (인증 없음) |
| `GET /api/projects` 토큰 없이 | **401** (200이면 `demo`나 `prod`가 아닙니다. 즉시 중단) |
| `POST /api/auth/login` 틀린 비밀번호 | 401 |
| 올바른 계정으로 로그인 후 프로젝트 생성 | 201 |
| 다른 계정의 토큰으로 위 프로젝트 조회 | 404 |
| 도면 업로드 후 작업 상태 조회 | `READY`까지 진행 |
| 프로젝트 삭제 | 204 |
| 브라우저에서 CloudFront 주소 접속, 로그인, 새로고침 | 로그인 유지 |
| 서버 재시작 후 같은 프로젝트 조회 | 유지 |
| 헤드셋 브라우저에서 VR 진입 | 실기기에서 별도로 확인 |

## 5. 배포와 롤백

Access Key를 쓰지 않으므로 수동으로 배포합니다.

1. 로컬에서 JAR를 빌드해 배포 버킷에 `kokoro-api-<커밋>.jar`로 올립니다(콘솔 업로드).
2. EC2에서 인스턴스 역할로 JAR를 내려받아 `releases/`에 두고 `current.jar` 링크를 바꾼 뒤 `sudo systemctl restart kokoro`를 실행합니다.
3. `/actuator/health`를 확인합니다. 실패하면 링크를 이전 JAR로 되돌리고 재시작합니다. 이전 JAR는 3개 이상 보관합니다.
4. 프론트는 빌드 결과를 웹 버킷에 다시 올리고 CloudFront 캐시를 무효화합니다.

배포 전에 RDS 수동 스냅샷을 만듭니다. **DB 롤백은 앱 롤백으로 되지 않습니다.** Flyway는 앞으로만 진행하므로 스키마가 바뀐 배포를 되돌릴 때는 이전 JAR가 새 스키마를 읽을 수 있는지 먼저 확인하고, 안 되면 스냅샷 복원이 필요합니다. 마이그레이션 번호는 V6이 비어 있고 V10과 V11이 V9 다음에 있으므로 새 마이그레이션은 V12부터 만듭니다. 소수 회전각(V8)과 프로젝트 버전(V9) 이후에는 구버전 서버를 같은 DB에 동시에 쓰지 않습니다.

## 6. 운영과 종료

- 로그는 `journalctl -u kokoro`로 봅니다. CloudWatch로 보내려면 에이전트 설정이 필요합니다.
- 도면 원본은 EBS에만 있습니다. 스냅샷을 만들지 않으면 인스턴스를 잃을 때 함께 사라집니다.
- 도면 정리 실패는 `floor_plan_file_cleanup` 테이블에 쌓이고 주기적으로 다시 시도합니다. 오래 남은 행이 있으면 저장소 오류를 점검합니다.
- 종료할 때는 사용자에게 알린 뒤 RDS 스냅샷과 도면 파일을 보관하고 리소스(EC2, RDS, 스냅샷, S3 버킷)를 삭제합니다. CloudFront 배포 삭제는 운영진에게 요청합니다. 사용자가 데이터를 내려받는 JSON 내보내기는 아직 없습니다.

## 7. 정책 때문에 하지 않는 것과 나중 선택지

| 항목 | 현재 | 필요해지면 |
|---|---|---|
| 도메인과 인증서 | CloudFront 기본 주소 | 개인 명의 도메인은 본인 계정에서 구매해 CNAME으로 연결(연결 가능 여부는 운영진 확인) |
| 컨테이너와 ALB | 단일 EC2 | 운영진은 최종 발표 전에 인스턴스 사양을 높이는 것을 권합니다 |
| Cognito 로그인 | demo 계정 | 팀 풀의 App Client로 연동하려면 로그인 화면과 사용자 관리 방법이 먼저 필요합니다 |
| 도면 원본 저장소 | EC2 디스크 | `FloorPlanStorage`의 S3 구현체를 추가하면 서버를 교체해도 파일이 남습니다 |
| 자동 배포 | 수동 | GitHub Actions 역할은 운영진이 만들어 주지만 정책은 수동 배포를 권합니다 |

도면 작업이 프로세스 안에서 실행되므로 서버를 여러 대로 늘리는 구성은 점검 없이 하지 않습니다.

## 8. 코드와 문서 작업 목록

| 작업 | 영역 | 상태 |
|---|---|---|
| 시연용 임시 로그인 | 백엔드와 프론트 | #213, PR #214 |
| 보존 정책 문서 | 문서 | #12, PR #210 |
| 서버가 시연 프로파일이 아니면 공개 주소로 시작되지 않게 막는 점검 | 백엔드 | 없음 |
| `FloorPlanStorage`의 S3 구현체 | 백엔드 | 없음 |
| JSON 내보내기와 가져오기 | 프론트 | 없음 |
| 허용 주소 여러 개 지원 | 백엔드 | 현재 `FRONTEND_ORIGIN` 한 개 |

## 9. 위험과 미확인 사항

- 이 문서의 AWS 설정(CloudFront 헤더 전달과 접두사 목록, 보안 그룹, EC2 공개 DNS와 고정 주소, 인스턴스 사양, 비용)은 실제 계정에서 검증하지 않았습니다.
- 계정 정책은 운영진이 바꿀 수 있습니다. 안내가 달라졌다면 이 문서를 고칩니다.
- 시연 로그인의 토큰은 브라우저 `localStorage`에 저장되고 회원가입과 비밀번호 변경이 없습니다. 시연 전용입니다.
- 단일 서버라 서버가 멈추면 서비스가 중단됩니다. 가용성 목표는 정하지 않았습니다.
