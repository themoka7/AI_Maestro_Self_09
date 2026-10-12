# WebSquare 화면 개발 공통 에이전트

부산대 학사/행정 시스템(WebSquare 5 + 사내 공통 프레임워크 + SQL Server) 화면·SP 개발을 위한 도구 모음입니다.

| 구성 | 위치 | 용도 |
|---|---|---|
| 화면 생성기 (웹) | `index.html` (GitHub Pages) | 화면 유형 → 디자인 → 조회조건·컬럼 → 공통코드를 고르면 화면 XML, 조회/저장 SP, 메타 등록값, 에이전트 요청문 생성 |
| 개발 에이전트 | `.claude/agents/websquare-dev.md` | 명세·초안을 받아 실제 화면/SP로 완성, 기존 화면·SP 수정·리뷰 |
| 새 화면 스킬 | `.claude/skills/websquare-new-screen/` | Claude Code 안에서 질문-선택 방식으로 화면 설계 (`/websquare-new-screen`) |
| 작업 가이드 스킬 | `.claude/skills/websquare-common-query/` | bindProc 특성, 사내 공통 함수, WebSquare 함정, 메타 조회 규칙 |
| 공통 설정 | `config/ws-config.json` | 사내 템플릿(UDC 태그·init, 공통코드 컬럼명), DB 목록, **공통코드 목록** |
| 생성기 CLI | `tools/gen.js`, `tools/check.js` | 명세 JSON → 파일 생성 / XML·ES5 스크립트 검사 |

## 사용 흐름

1. **웹에서 설계** — [화면 생성기](https://themoka7.github.io/AI_Maestro_Self_09/)에서 화면 유형 카드를 고르고, 디자인·조회조건·컬럼·공통코드를 채웁니다. 오른쪽 미리보기에 레이아웃이 바로 그려집니다.
2. **에이전트 요청문 복사** — "에이전트 요청문" 탭을 복사해 Claude Code에 붙여넣습니다.
3. **에이전트가 완성** — `websquare-dev` 가 명세를 `specs/` 에 저장하고 `tools/gen.js` 로 초안을 만든 뒤 실제 테이블·사내 패턴에 맞춰 다듬고 `tools/check.js` 로 검사합니다.

웹 없이 Claude Code 에서 바로 시작하려면 `/websquare-new-screen` 을 입력하세요.

```bash
node tools/gen.js specs/examples/edit.json        # out/SYS_CODE_MNG/ 에 생성
node tools/check.js out/SYS_CODE_MNG              # XML 파싱 + 스크립트 문법 + ES5 검사
```

## 화면 유형

| 유형 | 생성물 |
|---|---|
| 조회형 | 화면 XML, 조회 SP |
| 그리드 편집형 | 화면 XML, 조회 SP, 저장 SP (OPENJSON + ROW_STATUS) |
| 마스터-디테일 (상하/좌우) | 화면 XML, 마스터 조회 SP, 상세 조회 SP, (상세 편집 시) 상세 저장 SP |
| 목록 + 상세 폼 | 화면 XML, 조회 SP, 저장 SP |
| 공통 데이터 조회 등록 | `[01_컬럼명]` 별칭 조회 SP, 관리 화면 등록값 |

## 처음 한 번 해야 할 일: 사내 템플릿 확인

생성기 기본값 중 아래는 **실제 프레임워크에서 확인되지 않은 값**입니다. 기존 업무 화면(예: 개설강좌 일람표) XML을 열어 맞춘 뒤 `config/ws-config.json` 의 `settings.verified` 를 `true` 로 바꾸세요. (웹의 "사내 템플릿 설정"에서 고치고 "설정 JSON 받기"로 받아 커밋해도 됩니다.)

- `udcHeadTag`, `udcBodyTag` — 상단 공통버튼 UDC 태그
- `udcInit` — `udc_top_auth_btn.init({...})` 옵션 형식 (`{GRID}` `{SEARCH_SP}` `{EXCEL_YN}` 치환)
- `codeLabelCol`, `codeValueCol` — `common.getCode` 가 만드는 DataList의 라벨/값 컬럼명
- `alertFn` — 알림 함수 (기본 `alert`)

저장 SP의 감사 컬럼(`INSERT_ID/IP/DT`, `UPDATE_ID/IP/DT`)과 `JSON_DATA` 전달 방식도 사내 저장 표준과 대조가 필요합니다. 생성기는 이런 항목을 "확인 필요"로 항상 표시합니다.

## 공통코드 셋팅

- 웹 6단계 "공통코드"에서 그룹(`시스템구분_코드`, 예: `0001_TERM_GCD`)·이름·조건 SQL 조각을 등록하면 조회조건·컬럼에서 골라 쓸 수 있습니다.
- 조건이 있으면 `common.getCodeByEtcParam` → `dlt_<그룹>_f`, 없으면 `common.getCode` → `dlt_<그룹>` 으로 생성됩니다.
- 브라우저에만 저장되므로, 팀 공용으로 쓰려면 "설정 JSON 받기" 후 `config/ws-config.json` 에 커밋하세요. 에이전트도 같은 파일을 읽습니다.

## GitHub Pages

- 주소: https://themoka7.github.io/AI_Maestro_Self_09/
- 진입점: 저장소 루트의 `index.html`

### 배포 방식

`.github/workflows/pages.yml` 이 `main` 에 푸시될 때마다 GitHub Actions 로 자동 배포합니다. (Actions 탭의 "Deploy Pages")

- **Settings → Pages → Source** 는 **GitHub Actions** 로 둡니다.
- 사이트에 올라가는 파일: `index.html`, `assets/`, `config/`, `specs/` (에이전트·스킬 파일은 올라가지 않음)
- 수동으로 다시 배포하려면 Actions → Deploy Pages → **Run workflow**

### 로컬에서 보기

```bash
python3 -m http.server 8000   # http://localhost:8000
```

파일을 브라우저로 직접 열면(file://) 설정·예제 fetch 가 막혀 기본값으로만 동작합니다.
