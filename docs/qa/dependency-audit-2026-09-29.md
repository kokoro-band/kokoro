# 2026년 9월 29일 의존성 감사

## 최초 감사의 결론과 범위

기준 코드는 `3c2b537`입니다. #124의 주소 검증 작업에서는 의존성 버전을 바꾸지 않습니다. 점검 도구가 알고 있는 공개 취약점과 실제 해석된 버전을 대조했으며 코드 실행 경로의 악용 가능성을 모두 검사한 것은 아닙니다. 업데이트는 #125에서 별도 PR로 진행합니다.

| 대상 | 실제 조회 범위 | 결과 |
|---|---|---|
| 프론트 | pnpm 잠금 파일 기반 기본 감사. 도구가 집계한 의존성 335개 | 공개 취약점 알림 0건. 무시한 알림 0건. 명령 종료 코드 0 |
| 백엔드 | Maven 의존성 트리의 고유 패키지와 버전 128쌍. 테스트 의존성 포함 | OSV 응답 128개. 알림 5건. 추가 페이지 없음 |

프론트는 `vp pm audit --json`을 사용했습니다. `--prod`나 무시 옵션 및 `--fix`는 사용하지 않았습니다. 보고서의 개발 의존성 별도 집계가 0이라고 개발 도구를 전부 검사하지 않았다는 뜻으로 해석하지 않습니다. 기본 감사의 총 집계이며 런타임별 도달 가능성을 분석하지 않습니다. pnpm은 10.32.1이고 Vite+는 0.3.1입니다. [pnpm 감사 명령](https://pnpm.io/10.x/cli/audit)을 기준으로 실행했습니다.

백엔드는 Maven Dependency Plugin 3.10.0이 해석한 트리에서 애플리케이션 자체를 제외하고 공개 의존성의 이름과 버전만 [OSV querybatch](https://google.github.io/osv.dev/post-v1-querybatch/)에 전달했습니다. Maven 빌드 플러그인 자체와 JDK 및 Docker 이미지와 운영체제 패키지는 이 범위가 아닙니다. OSV에 등록되지 않았거나 아직 반영되지 않은 문제도 있을 수 있습니다.

## 발견한 항목

| 패키지 | 포함 경로와 범위 | OSV에서 반환한 알림 | 조치 |
|---|---|---|---|
| `org.apache.tomcat.embed:tomcat-embed-core:11.0.24` | Spring Boot 4.1.1의 Tomcat starter. 실행 의존성 | `GHSA-9xv2-5v5q-p794`와 `GHSA-gcx9-497g-6cp6` 및 `GHSA-h3x4-894j-xpx5` | #125에서 공식 최신 수정 버전과 Spring 호환성을 확인합니다. |
| `org.apache.commons:commons-compress:1.24.0` | Testcontainers 1.21.3. 테스트 의존성 | `GHSA-4265-ccf5-phj5`와 `GHSA-4g9r-vxhx-9pgx` | #125에서 Testcontainers 의존성 경로를 수정하고 재검사합니다. |

Tomcat의 위 세 알림은 DIGEST와 FORM 인증 및 보안 제약 처리에 관한 것입니다. 현재 `SecurityConfig`에서는 Spring JWT를 사용하며 Tomcat DIGEST나 FORM 설정은 확인하지 못했습니다. 이를 근거로 패키지 알림을 삭제하거나 운영 배포가 안전하다고 결론 내리지 않습니다. [Apache 공식 보안 공지](https://tomcat.apache.org/security-11.html)에는 11.0.25까지 영향을 받는 더 최근 항목과 11.0.26 수정 내역도 있습니다. OSV의 3건이 Tomcat 문제 전체라는 뜻이 아니며 11.0.25로만 올리고 완료 처리하지 않습니다.

Commons Compress의 두 알림은 손상된 압축 파일을 읽을 때의 자원 소모 문제이며 수정 하한은 1.26.0입니다. 실제 선택 버전은 [Apache 공식 공지](https://commons.apache.org/proper/commons-compress/security.html)와 Testcontainers 호환성을 다시 확인합니다. 테스트 의존성은 실행 서버에 포함되는 패키지와 분리해 위험을 기록하지만 CI 실행 경로의 위험이 없어지는 것은 아닙니다.

## 재현 명령

프론트 폴더에서 실행합니다. 출력은 점검 당시 결과이며 시간이 지나면 같은 잠금 파일에서도 알림이 늘어날 수 있습니다.

```bash
vp install
vp pm audit --json
```

백엔드 폴더에서는 `jq`와 `curl`도 필요합니다. 생성되는 파일은 새 임시 폴더의 점검 결과이며 기존 작업을 바꾸지 않습니다.

```bash
kokoro_audit_dir=$(mktemp -d)
./mvnw org.apache.maven.plugins:maven-dependency-plugin:3.10.0:tree \
  -DoutputType=json -DoutputFile="$kokoro_audit_dir/tree.json"
jq '{queries: [.children[] | recurse(.children[]?) |
  {package: {name: (.groupId + ":" + .artifactId), ecosystem: "Maven"}, version: .version}]
  | unique_by(.package.name + "@" + .version)}' \
  "$kokoro_audit_dir/tree.json" > "$kokoro_audit_dir/queries.json"
curl --fail-with-body --max-time 60 -sS https://api.osv.dev/v1/querybatch \
  -H 'Content-Type: application/json' \
  --data-binary @"$kokoro_audit_dir/queries.json" > "$kokoro_audit_dir/result.json"
jq '{count: (.results | length), findings: [.results[] | .vulns[]?],
  more: [.results[] | select(.next_page_token != null)]}' "$kokoro_audit_dir/result.json"
```

요청과 응답 개수가 같아야 합니다. `more`가 비어 있지 않으면 해당 질의에 `page_token`을 넣어 다음 결과도 조회해야 합니다. 네트워크 실패와 오류 응답 및 페이지 미조회는 취약점 없음이 아닙니다. 결과의 순서는 질의 순서와 같으므로 알림이 있는 응답의 인덱스를 `queries.json`과 대조합니다.

## 기준 파일 식별

| 파일 | SHA-256 |
|---|---|
| `frontend/pnpm-lock.yaml` | `78d02d56bc88752f78ce966007b88b6d9cc6265cb8cfc5d9d935c4d3ac8bb66b` |
| `backend/pom.xml` | `43f3042747953eba0f3206e532567804a1a8054e24de10501c545012096baeff` |

감사 성공과 테스트 통과 및 실제 운영 노출 검증은 서로 다른 결과입니다. 위 표는 수정 전 기록이며 #125의 조치 결과는 아래에 별도로 기록합니다.

## #125 수정 후 재감사

선행 코드는 `d032f34`입니다. Spring Boot 4.1.1과 Testcontainers 1.21.3은 유지했습니다. 백엔드의 버전 설정만 바꾸었으며 프론트 잠금 파일과 애플리케이션 기능 코드는 바꾸지 않았습니다.

| 대상 | 수정 전 | 수정 후 | 포함 범위 |
|---|---|---|---|
| Tomcat core와 el 및 websocket | 11.0.24 | 11.0.26 | 실행 API |
| Commons Compress | 1.24.0 | 1.28.0 | Testcontainers의 테스트 경로 |

[Tomcat 공식 공지](https://tomcat.apache.org/security-11.html)의 11.0.26 수정 내역을 기준으로 같은 11.0 계열의 패치를 선택했습니다. Spring Boot가 공통으로 참조하는 `tomcat.version` 속성을 바꿔 세 라이브러리를 같은 버전으로 맞춥니다. [Spring Boot 4.1.1의 기본 버전 목록](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.1.1/spring-boot-dependencies-4.1.1.pom)은 Tomcat 11.0.24를 지정하고 있어 재정의가 필요했습니다.

[Commons Compress 공식 공지](https://commons.apache.org/proper/commons-compress/security.html)의 두 문제는 1.26.0에서 수정됐습니다. 이번에는 공개된 안정 버전 1.28.0을 선택했습니다. 1.26.0부터 1.27.x까지 모두 취약하다는 뜻이 아니라 이번에 검증한 기준을 1.28.0으로 정한 것입니다. [Testcontainers 1.21.4의 의존성 목록](https://repo.maven.apache.org/maven2/org/testcontainers/testcontainers/1.21.4/testcontainers-1.21.4.pom)도 Compress 1.24.0을 지정하므로 패치 업그레이드만으로 해결되지 않습니다. Testcontainers 2로의 주요 버전 변경은 섞지 않고 Maven의 `dependencyManagement`에서 Compress 버전을 관리했습니다. 이 설정은 라이브러리를 실행 의존성에 새로 추가하지 않습니다.

변경 후 Maven 트리는 고유 공개 좌표 131개입니다. 같은 OSV querybatch 방식으로 131개 모두 응답을 받았으며 취약점 알림과 추가 페이지는 0건이었습니다. 새로 따라오는 Commons IO 2.20.0과 Commons Codec 1.21.0 및 Commons Lang 3.20.0도 테스트 범위이며 조회에 포함했습니다. 프론트 의존성은 바뀌지 않아 이번 재감사에서는 다시 조회하지 않았습니다.

수정 후 `backend/pom.xml` SHA-256은 `9690e241f15d0f5926ef7980292232507216a6906cd1041445df5e6b42288e54`입니다. 결과는 2026년 9월 29일의 조회 시점에 한정됩니다. OSV에 없는 취약점과 실제 운영 설정의 안전성 및 JDK와 Docker 이미지의 안전성을 증명하지 않습니다.

`./mvnw test`와 `./mvnw package`는 각각 99개 테스트에 통과했습니다. 실제 HTTP 업로드 경계와 PostgreSQL 및 권한 검사와 새 압축 파일 복사 검사를 포함합니다. `jar tf target/kokoro-api-0.1.0.jar`로 배포 파일의 내부 목록도 확인했습니다. `BOOT-INF/lib`에는 Tomcat core와 el 및 websocket 11.0.26이 들어 있고 Testcontainers와 Commons Compress 및 새로 따라온 테스트 라이브러리는 없습니다. 실행 JAR 검사는 라이브러리 포함 범위를 확인한 것이며 운영 서버에 배포했다는 뜻이 아닙니다.

앞으로 Spring Boot나 Testcontainers를 올릴 때 기본 버전 목록과 실제 트리가 이 기준을 만족하면 해당 재정의를 제거할 수 있습니다. 제거 후에는 버전 검사와 파일 복사 호환 검사 및 전체 테스트와 패키징을 다시 실행합니다. 주요 버전 계열을 바꾸는 경우 공식 변경 내역과 테스트를 검토한 뒤 검사 기준을 갱신합니다.
