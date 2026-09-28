# 2026년 9월 29일 의존성 감사

## 결론과 범위

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

감사 성공과 테스트 통과 및 실제 운영 노출 검증은 서로 다른 결과입니다. #125가 끝나기 전에는 이번 감사로 백엔드 취약점 조치가 완료됐다고 표현하지 않습니다.
