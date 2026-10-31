# AWS 시연 배포 가이드

공유 AWS 계정(인하대 캡스톤)에 서버 모드를 시연용으로 배포한 결과와 그 절차입니다. 2026년 10월 31일에 실제로 배포해 확인했습니다. 운영 서비스 수준의 구성(무중단 배포, 고가용성, 도메인)은 다루지 않습니다.

- 시연 주소: `https://d24akk8i5dqzwi.cloudfront.net` (웹 화면과 `/api`가 같은 주소)
- 확인한 것: 인증 없는 요청 401, 시연 계정 로그인, 계정 사이 프로젝트 분리(404), 프로젝트 생성과 삭제, 웹 화면 응답. 실제 헤드셋의 VR 진입과 도면 업로드는 이 배포에서 확인하지 않았습니다.
- 로그인 계정의 아이디와 비밀번호, 서명 키, DB 비밀번호는 저장소에 두지 않습니다.

> **먼저 읽을 경고**
> 서버의 보안 설정은 Spring 프로파일로만 정해집니다. `SPRING_PROFILES_ACTIVE`를 설정하지 않으면 기본값 `local`이 적용되어 **인증 없이 모든 API가 열리고 모든 사용자가 같은 `local-user`로 동작합니다**. 이 배포에서는 `demo`로 설정하고, 배포한 뒤 인증 없는 요청이 401인지 확인하세요(5단계). `SECURITY_MODE` 환경 변수는 코드에서 쓰이지 않습니다.

## 1. 구성

```text
브라우저 ──HTTPS──▶ CloudFront (*.cloudfront.net)
                     ├─ /*      ──▶ S3 inha-capstone-01-web (프론트, 비공개, OAC)
                     └─ /api/*  ──HTTP :8080──▶ EC2 inha-capstone-01-kokoro-app (demo 프로파일)
                                                   ├──▶ RDS inha-capstone-01-kokoro-db (비공개)
                                                   └──▶ EBS 디스크 (도면 원본)
```

프론트와 API가 같은 주소를 쓰므로 CORS 설정이 필요 없고, WebXR에 필요한 HTTPS도 CloudFront 기본 주소로 충족합니다. 기존 GitHub Pages 로컬 데모는 그대로 둡니다. 모드는 빌드할 때 정해지므로 서버 모드 화면은 이 주소에서 따로 제공합니다.

| 리소스 | 설정 |
|---|---|
| EC2 `inha-capstone-01-kokoro-app` | t3.small, Amazon Linux 2023(x86_64), 디스크 20GiB gp3, 기본 VPC의 공개 서브넷, 인스턴스 프로필 `SafeInstanceProfile-inha-capstone-01`, 키 페어 없음 |
| RDS `inha-capstone-01-kokoro-db` | PostgreSQL 16.13, db.t4g.micro, 단일 AZ, gp2 20GiB, 공개 접근 끔, DB 이름 `kokoro`, 관리자 `kokoro_admin`, 자동 백업 1일 |
| 보안 그룹 `inha-capstone-01-app` | 8080은 CloudFront의 관리형 접두사 목록(`com.amazonaws.global.cloudfront.origin-facing`)에서만 허용. 그 밖의 인바운드 없음 |
| 보안 그룹 `inha-capstone-01-db` | 5432는 `inha-capstone-01-app` 그룹에서만 허용 |
| S3 `inha-capstone-01-web` | 프론트 빌드(`frontend/dist`). CloudFront만 읽을 수 있습니다 |
| S3 `inha-capstone-01-deploy` | 서버 JAR와 설치 스크립트. 공개 액세스 전부 차단, 기본 암호화 |
| CloudFront | 기본 루트 `index.html`. 기본 동작은 웹 버킷(OAC), `/api/*`는 EC2(HTTP 8080)로 전달. 캐시는 끄는 관리형 정책(CachingDisabled)과 `Authorization` 헤더를 포함해 요청을 모두 전달하는 관리형 정책(AllViewerExceptHostHeader)을 씁니다 |

## 2. 계정 정책과 확인된 제한

2026년 10월 13일 운영진이 안내한 내용입니다. 바뀔 수 있으니 막히면 운영진에게 작업 내용과 오류 메시지를 전달합니다.

| 항목 | 사용 가능한 범위 |
|---|---|
| 리전과 이름 | 서울(ap-northeast-2). 모든 리소스 이름은 `inha-capstone-01-`로 시작 |
| EC2 | t3.nano~t3.small(안내문에는 t3.medium까지). 인스턴스 프로필 `SafeInstanceProfile-inha-capstone-01` 사용. 보안 그룹은 규칙 없이 만든 뒤 수정 |
| RDS PostgreSQL | db.t4g.micro, 단일 AZ, 비공개, 저장소 20GiB 이하 |
| S3 | `inha-capstone-01` 접두사 버킷 |
| CloudFront | 배포 생성·수정·무효화 가능, 삭제는 운영진 요청 |
| 제공하지 않음 | Route 53, ACM, Secrets Manager, AWS Budgets(비용은 운영진이 관리), ECS Fargate, ECR, ALB. Access Key도 발급하지 않습니다 |

이 배포를 하면서 `inha-capstone-01` IAM 사용자에게 **없다는 것을 확인한** 권한입니다. 계획을 세울 때 이 제한을 전제로 해야 합니다.

| 없는 권한 | 영향 |
|---|---|
| `ssm:DescribeInstanceInformation` 등(Session Manager) | 서버에 SSM으로 접속할 수 없습니다 |
| `ec2-instance-connect:SendSSHPublicKey` | 콘솔의 브라우저 SSH도 `SendSSHPublicKey가 실패했습니다`로 실패합니다. 키 페어도 없어 **실행 중인 서버에 접속할 방법이 없습니다** |
| `ec2:ModifyInstanceAttribute`(사용자 데이터) | 만든 인스턴스의 시작 스크립트를 바꿀 수 없습니다 |
| `ec2:AllocateAddress`(고정 IP) | 인스턴스를 중지했다가 시작하면 공개 DNS가 바뀝니다 |
| `rds:ModifyDBInstance` | 만든 DB의 관리자 비밀번호를 바꿀 수 없습니다. 비밀번호를 모르면 DB를 지우고 다시 만들어야 합니다 |

그래서 서버 설정은 **인스턴스를 만들 때 넣는 시작 스크립트로만** 합니다(3단계). 도구는 콘솔의 CloudShell(AWS CLI 포함)을 씁니다. CloudShell의 임시 홈 용량은 1GiB라 큰 빌드는 `/tmp`에서 합니다.

## 3. 배포 방식

운영진 안내대로 CI/CD와 Access Key를 쓰지 않고 수동으로 배포합니다. 서버에 접속할 수 없으므로 아래 순서를 따릅니다.

1. 저장소를 CloudShell에 받아 JAR와 프론트를 빌드합니다. 저장소가 공개라 인증 없이 받을 수 있습니다.
2. JAR는 배포 버킷에, 프론트는 웹 버킷에 올립니다.
3. 비밀 값 파일(`server-secrets.env`)을 배포 버킷에 올립니다. 서버가 읽고 나면 지웁니다.
4. 시작 스크립트가 들어간 EC2를 새로 만듭니다. 스크립트가 버킷에서 JAR와 설치 스크립트를 받아 서버를 설치하고 시작합니다.
5. CloudFront의 `api` 오리진을 새 인스턴스의 공개 DNS로 바꿉니다.

비밀 값은 시작 스크립트에 넣지 않고 비공개 버킷의 파일에서 읽습니다. 시작 스크립트는 사용자 데이터로 조회할 수 있어 비밀을 담으면 안 됩니다.

## 4. 실행 순서

### 0단계. 비밀 값 준비
로컬에서 만들어 저장소 밖(또는 git 제외 폴더)에 보관합니다.

1. 시연 계정마다 무작위 비밀번호를 만들고 bcrypt 해시로 바꿉니다.
   ```bash
   htpasswd -nbB -C 10 이름 '비밀번호'
   ```
2. 서명 키로 쓸 32바이트 이상의 무작위 문자열을 만듭니다(`openssl rand -base64 48`).
3. 아래 형식의 `server-secrets.env`를 만듭니다. 값은 작은따옴표로 감쌉니다(해시에 `$`가 있습니다). 모든 항목이 필요하고, 이 파일을 저장소에 올리지 않습니다.
   ```text
   DEMO_ACCOUNTS='이름1:해시1,이름2:해시2'
   DEMO_JWT_SECRET='무작위 문자열'
   DB_HOST=<RDS 엔드포인트>
   DB_USER=kokoro_admin
   DB_PASS='<DB 관리자 비밀번호>'
   ```
   DB는 관리자 계정을 그대로 씁니다. 별도 사용자를 만들려면 서버에서 `psql`로 접속해야 하는데 접속 수단이 없어 이번에는 하지 않았습니다.

### 1단계. 보안 그룹
1. `inha-capstone-01-app`을 규칙 없이 만들고, 8080 인바운드를 CloudFront 관리형 접두사 목록에서만 허용합니다.
2. `inha-capstone-01-db`의 5432 인바운드를 `inha-capstone-01-app` 그룹에서만 허용합니다.

### 2단계. RDS for PostgreSQL
```bash
aws rds create-db-instance --db-instance-identifier inha-capstone-01-kokoro-db \
  --db-instance-class db.t4g.micro --engine postgres --engine-version 16.13 \
  --allocated-storage 20 --storage-type gp2 \
  --master-username kokoro_admin --master-user-password '<무작위 비밀번호>' \
  --db-name kokoro --vpc-security-group-ids <db 보안 그룹 ID> --db-subnet-group-name default \
  --no-publicly-accessible --no-multi-az --backup-retention-period 1
```
Flyway가 서버 시작 시 스키마를 만듭니다. 비밀번호는 나중에 바꿀 수 없으므로(2절) 만들 때 파일에 저장해 둡니다. 상태가 `available`이 될 때까지 10분 정도 걸립니다.

### 3단계. 빌드와 업로드(CloudShell)
```bash
cd /tmp && git clone --depth 1 -b <브랜치> https://github.com/kokoro-band/kokoro k
cd k/backend && ./mvnw -q -DskipTests package
aws s3 cp target/kokoro-api-0.1.0.jar s3://inha-capstone-01-deploy/

cd ../frontend && npx -y pnpm@10.32.1 install --frozen-lockfile
VITE_API_MODE=server VITE_AUTH_MODE=demo VITE_API_BASE_URL=/api npx -y pnpm@10.32.1 exec vp run build
aws s3 sync dist s3://inha-capstone-01-web
aws cloudfront create-invalidation --distribution-id <배포 ID> --paths '/*'
```
- `VITE_` 값은 빌드에 포함되므로 비밀값을 넣지 않습니다.
- 데모 로그인이 들어 있는 코드(#213)가 병합되지 않았다면 그 브랜치를 받습니다.
- CloudShell의 Node 20에서 프론트 빌드가 통과했습니다. 로컬 개발과 CI는 Node 22를 씁니다.

`bootstrap.sh`(부록)와 `server-secrets.env`도 배포 버킷에 올립니다. CloudShell에는 로컬 파일을 올리는 "파일 업로드" 기능이 있습니다.

### 4단계. EC2 생성(시작 스크립트)
시작 스크립트 `ud.sh`는 비밀 없이 두 줄입니다.

```bash
#!/bin/bash
export HOME=/root
aws s3 cp s3://inha-capstone-01-deploy/bootstrap.sh /tmp/bootstrap.sh && bash /tmp/bootstrap.sh > /var/log/kokoro-bootstrap.log 2>&1
```

```bash
aws ec2 run-instances --image-id <Amazon Linux 2023 AMI> --instance-type t3.small \
  --subnet-id <기본 VPC 서브넷> --security-group-ids <app 보안 그룹 ID> \
  --iam-instance-profile Name=SafeInstanceProfile-inha-capstone-01 --associate-public-ip-address \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
  --metadata-options HttpTokens=required --user-data file://ud.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=inha-capstone-01-kokoro-app}]'
```
시작 스크립트는 인스턴스를 처음 켤 때만 실행됩니다. 설치에 2~4분이 걸리고 로그는 서버의 `/var/log/kokoro-bootstrap.log`에 남지만 접속할 수 없어 볼 수 없습니다. 실패하면 5단계의 상태 확인이 200이 아닌 것으로 알 수 있고, 새 인스턴스로 다시 시도합니다.

### 5단계. CloudFront 오리진 갱신과 검증
인스턴스가 실행되면 공개 DNS를 확인해 CloudFront의 `api` 오리진을 바꿉니다.

```bash
aws cloudfront get-distribution-config --id <배포 ID> > cf.json
ETAG=$(python3 -c "import json;print(json.load(open('cf.json'))['ETag'])")
python3 -c "import json;d=json.load(open('cf.json'))['DistributionConfig'];[o.__setitem__('DomainName','<새 공개 DNS>') for o in d['Origins']['Items'] if o['Id']=='api'];json.dump(d,open('cf-new.json','w'))"
aws cloudfront update-distribution --id <배포 ID> --if-match "$ETAG" --distribution-config file://cf-new.json
```
배포 상태가 `Deployed`가 될 때까지 몇 분 걸립니다. 그다음 확인합니다.

| 확인 | 기대 결과 |
|---|---|
| `GET /api/health` | 200 |
| `GET /api/projects` 토큰 없이 | **401** (200이면 `demo`나 `prod`가 아닙니다. 즉시 중단) |
| `POST /api/auth/login` 틀린 비밀번호 | 401 |
| 올바른 계정으로 로그인 후 프로젝트 생성과 조회 | 201과 200 |
| 다른 계정의 토큰으로 위 프로젝트 조회 | 404 |
| 프로젝트 삭제 | 204 |
| 웹 화면 접속 | 200, 로그인 화면 표시 |
| 도면 업로드 후 작업 상태가 `READY`까지 진행 | 이 배포에서 확인하지 않았습니다 |
| 서버 재시작 후 같은 프로젝트 조회 | 이 배포에서 확인하지 않았습니다 |
| 헤드셋 브라우저에서 VR 진입 | 실기기에서 별도로 확인 |

### 6단계. 정리
- 서버가 읽은 뒤 `server-secrets.env`를 배포 버킷에서 지웁니다(`aws s3 rm`).
- 임시로 연 포트(예: EC2 Instance Connect용 22번)가 있으면 지웁니다.
- 이전 인스턴스는 중지합니다. 삭제는 운영진이 유휴 인스턴스를 지적한 적이 있으니 필요 없어지면 합니다.

## 5. 업데이트 배포

실행 중인 서버에 접속할 수 없으므로 JAR만 바꾸는 방식은 쓰지 못합니다. 새 코드는 새 인스턴스로 교체합니다.

1. 3단계처럼 새 JAR와 프론트를 빌드해 올립니다. JAR 파일 이름을 바꾸거나(예: `kokoro-api-<커밋>.jar`) 덮어쓰고, `bootstrap.sh`의 `JAR_KEY`를 맞춥니다.
2. `server-secrets.env`를 다시 올립니다(6단계에서 지웠으므로).
3. 4단계로 새 인스턴스를 만들고 5단계로 오리진을 바꿉니다. 이전 인스턴스는 중지합니다.

DB는 그대로 쓰므로 데이터는 유지됩니다. 마이그레이션 번호는 V6이 비어 있고 V10과 V11이 V9 다음에 있어 새 마이그레이션은 V12부터 만듭니다. Flyway는 앞으로만 진행하므로 스키마가 바뀐 배포를 되돌릴 때는 이전 JAR가 새 스키마를 읽을 수 있는지 먼저 확인하고, 안 되면 DB 스냅샷 복원이 필요합니다. 이전 서버와 새 서버가 같은 DB에 동시에 쓰는 구성은 피합니다.

## 6. 운영과 종료

- **중지와 시작**: 인스턴스를 중지했다가 시작하면 공개 DNS가 바뀌어 CloudFront가 서버를 찾지 못합니다(504). 시작한 뒤 5단계로 오리진을 다시 바꿔야 합니다. 시연 전에 켜고, 쓰지 않을 때는 중지합니다. 중지해도 EBS와 RDS 비용은 남습니다.
- **도면 원본**은 EBS에만 있습니다. 인스턴스를 교체하면 이전 디스크의 도면 파일을 이어받지 못합니다. 도면 업로드를 시연하려면 교체 후에 올립니다. 보존 기간과 삭제 범위는 `PRODUCT.md`의 데이터 보존과 삭제를 따릅니다.
- **로그**: 서버 로그는 인스턴스에서만 볼 수 있어 접속 수단이 없는 지금은 확인하지 못합니다. CloudWatch로 보내려면 인스턴스 역할 권한과 에이전트 설정이 필요합니다.
- **하위 경로 새로고침**: 한 단계 아래 주소(`/some/route`)로 직접 들어가면 403입니다. 앱이 한 화면이라 시연에는 지장이 없습니다. 고치려면 CloudFront의 오류 응답에서 403을 `/index.html`로 돌려보내되, `/api/*`의 403에도 영향이 가는지 확인해야 합니다.
- **종료**: 사용자에게 알린 뒤 RDS 스냅샷을 만들고 리소스(EC2, RDS, 스냅샷, S3 버킷)를 삭제합니다. CloudFront 배포 삭제는 운영진에게 요청합니다. 사용자가 데이터를 내려받는 JSON 내보내기는 아직 없습니다.

## 7. 정책 때문에 하지 않는 것과 나중 선택지

| 항목 | 현재 | 필요해지면 |
|---|---|---|
| 도메인과 인증서 | CloudFront 기본 주소 | 개인 명의 도메인은 본인 계정에서 구매해 CNAME으로 연결(연결 가능 여부는 운영진 확인) |
| 컨테이너와 ALB | 단일 EC2 | 운영진은 최종 발표 전에 인스턴스 사양을 높이는 것을 권합니다 |
| Cognito 로그인 | demo 계정 | 팀 풀의 App Client로 연동하려면 로그인 화면과 사용자 관리 방법이 먼저 필요합니다 |
| 도면 원본 저장소 | EC2 디스크 | `FloorPlanStorage`의 S3 구현체를 추가하면 인스턴스를 교체해도 파일이 남습니다 |
| 서버 접속과 로그 | 불가 | 운영진에게 Session Manager나 EC2 Instance Connect 권한을 요청합니다 |
| 자동 배포 | 수동 | GitHub Actions 역할은 운영진이 만들어 주지만 정책은 수동 배포를 권합니다 |

## 8. 코드와 문서 작업 목록

| 작업 | 영역 | 상태 |
|---|---|---|
| 시연용 임시 로그인 | 백엔드와 프론트 | #213, PR #214 (이 배포에 쓴 코드) |
| 보존 정책 문서 | 문서 | #12, PR #210 |
| 서버가 시연 프로파일이 아니면 공개 주소로 시작되지 않게 막는 점검 | 백엔드 | 없음 |
| `FloorPlanStorage`의 S3 구현체 | 백엔드 | 없음 |
| JSON 내보내기와 가져오기 | 프론트 | 없음 |
| 허용 주소 여러 개 지원 | 백엔드 | 현재 `FRONTEND_ORIGIN` 한 개 |
| `bootstrap.sh`를 저장소 스크립트로 관리 | infra | 지금은 이 문서의 부록 |

## 9. 위험과 미확인 사항

- 도면 업로드, 서버 재시작 후 유지, 헤드셋 VR은 이 배포에서 확인하지 않았습니다.
- 계정 정책은 운영진이 바꿀 수 있습니다. 안내가 달라졌다면 이 문서를 고칩니다.
- 시연 로그인의 토큰은 브라우저 `localStorage`에 저장되고 회원가입과 비밀번호 변경이 없습니다. 시연 전용입니다.
- DB 관리자 계정을 앱이 그대로 씁니다. 서버에 접속할 수 있게 되면 전용 사용자를 만들고 바꿉니다.
- 서버에 접속할 수 없어 서버 상태와 로그를 직접 볼 수 없습니다. 단일 서버라 멈추면 서비스가 중단됩니다.
- 이전 DB는 최종 스냅샷을 남기고 삭제했습니다. 스냅샷은 비용이 계속 드니 필요 없어지면 지웁니다.

## 부록. bootstrap.sh

`inha-capstone-01-deploy` 버킷에 두고 시작 스크립트가 실행합니다. 이 배포에서 실제로 실행한 스크립트입니다. 시작 스크립트는 루트로 실행되어 `sudo`는 영향이 없고, 입력창은 `DB_PASS`가 비었을 때만 나옵니다(시작 스크립트에서는 입력할 수 없으니 비밀 파일에 항상 넣습니다). 이름과 버킷, CloudFront 주소는 이 배포의 값이므로 다시 만들 때 바꿉니다.

```bash
#!/bin/bash
set -euo pipefail
BUCKET=inha-capstone-01-deploy
JAR_KEY=kokoro-api-0.1.0.jar
WEB_ORIGIN=https://d24akk8i5dqzwi.cloudfront.net

# 계정과 서명 키는 배포 버킷의 비밀 파일에서 읽습니다. 설치 뒤 서버의 임시 사본은 지웁니다.
aws s3 cp "s3://$BUCKET/server-secrets.env" /tmp/server-secrets.env --only-show-errors
set -a; . /tmp/server-secrets.env; set +a
rm -f /tmp/server-secrets.env
[ -n "${DEMO_ACCOUNTS:-}" ] && [ -n "${DEMO_JWT_SECRET:-}" ] && [ -n "${DB_HOST:-}" ] || { echo "비밀 파일이 비어 있습니다."; exit 1; }
DB_USER=${DB_USER:-kokoro_admin}
if [ -z "${DB_PASS:-}" ]; then read -rsp "DB 비밀번호($DB_USER): " DB_PASS; echo; fi
ACCOUNTS=$DEMO_ACCOUNTS
SECRET=$DEMO_JWT_SECRET

sudo dnf install -y java-17-amazon-corretto-headless
id kokoro >/dev/null 2>&1 || sudo useradd --system --home-dir /opt/kokoro --shell /sbin/nologin kokoro
sudo mkdir -p /opt/kokoro/releases /var/lib/kokoro/floor-plans /etc/kokoro
sudo chown -R kokoro:kokoro /var/lib/kokoro
sudo aws s3 cp "s3://$BUCKET/$JAR_KEY" "/opt/kokoro/releases/$JAR_KEY"
sudo ln -sfn "/opt/kokoro/releases/$JAR_KEY" /opt/kokoro/current.jar

sudo tee /etc/kokoro/kokoro.env >/dev/null <<EOF
SPRING_PROFILES_ACTIVE=demo
DEMO_ACCOUNTS=$ACCOUNTS
DEMO_JWT_SECRET=$SECRET
DB_URL=jdbc:postgresql://$DB_HOST:5432/kokoro
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
FLOOR_PLAN_STORAGE_ROOT=/var/lib/kokoro/floor-plans
FRONTEND_ORIGIN=$WEB_ORIGIN
EOF
sudo chmod 600 /etc/kokoro/kokoro.env

sudo tee /etc/systemd/system/kokoro.service >/dev/null <<'EOF'
[Unit]
Description=Kokoro API
After=network.target

[Service]
User=kokoro
EnvironmentFile=/etc/kokoro/kokoro.env
ExecStart=/usr/bin/java -Xmx768m -jar /opt/kokoro/current.jar
Restart=on-failure
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now kokoro

for i in $(seq 1 60); do
  if curl -fs localhost:8080/actuator/health >/dev/null; then echo "서버가 시작됐습니다."; exit 0; fi
  sleep 2
done
echo "시작을 확인하지 못했습니다. sudo journalctl -u kokoro -n 50 로 로그를 확인하세요."; exit 1
```

`EnvironmentFile`은 변수를 확장하지 않아 `DEMO_ACCOUNTS`의 해시 속 `$`가 그대로 들어갑니다. DB 비밀번호에 `#`, `"`, 공백 같은 문자가 있으면 값이 잘리므로 영문과 숫자로만 만듭니다.
