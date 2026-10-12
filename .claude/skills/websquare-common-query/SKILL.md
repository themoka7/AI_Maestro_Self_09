---
name: websquare-common-query
description: 부산대 학사/행정 시스템(WebSquare 5 + 사내 공통 프레임워크 + SQL Server)에서 화면·SP를 만들거나 고칠 때, 특히 메타 기반 공통 데이터 조회(조회 메타 관리 / 데이터 조회 화면)에 조회를 추가·수정할 때 사용. WebSquare XML 화면, scwin 스크립트, bindProc 호출, T-SQL 조회 SP, 현황·성과지표 산출 쿼리 작업이 해당됨.
---

# WebSquare 공통 데이터 조회 & 사내 프레임워크 작업 가이드

이 문서는 실제 구축하면서 확인한 사실만 적었다. 추측으로 방어 코드를 쌓지 말고, 모르는 동작은 먼저 로그로 확인한 뒤 코드에 반영할 것.

---

## 1. 작업 원칙

- **확인 먼저, 코드는 나중에.** 프레임워크 동작이 불확실하면 `console.log`로 응답·키를 찍어 보게 하고, 확인된 사실만 코드에 남긴다. "혹시 몰라서" 넣는 분기·대체 로직은 유지보수 부담만 늘린다.
- **요청하지 않은 SP·호출을 추가하지 않는다.** 화면이 부르는 SP가 늘면 반드시 이유를 먼저 설명하고 동의를 받는다. (사용자는 로그에 모르는 SP 호출이 찍히는 것을 싫어함)
- **기존 프레임워크 기능을 우선 사용한다.** `bindProc`가 이미 DB·SP를 직접 호출할 수 있으므로 중간 실행 SP를 만들지 않는다.
- **ES5만 사용.** 화면 스크립트에 화살표 함수, `let/const`, 템플릿 문자열 금지.
- **주석은 사내 스타일로 짧게.** 함수마다 `/**** fn_이름 : 한 줄 설명 ****/` 블록, 화살표(→)·"확인됨"·번호 매기기·긴 괄호 설명 금지.
- **수정 요청에는 바뀐 부분만** 보여 주고, 전체 파일은 요청할 때만 준다.
- 화면을 고친 뒤에는 XML 파싱과 CDATA 스크립트 문법 검사(`node --check` 등)를 거친다.

---

## 2. 환경

| 항목 | 내용 |
|---|---|
| UI | WebSquare 5 (5.0_4.4710B), XML 화면 + `scwin` 스크립트 |
| 서버 | Spring + eGovFramework, `/core/function/bindProc` 공통 SP 호출 |
| DB | SQL Server, DB별 분리 (SYS, LECTURE, HAKJUKLOG, GRADE 등), 같은 인스턴스는 3-part name 호출 가능 |
| 공통 스크립트 | `common.*` 함수 (아래 4장) |

---

## 3. bindProc / 응답 특성 (중요)

```javascript
common.ajax_request({
    data   : { SYEAR : "2026" },
    target : dlt_01,                       // 생략하면 success(data) 로 원본 행 수신
    url    : '/core/function/bindProc',
    bind   : { db : "LECTURE", proc : "CLS_xxx_조회", params : ["SYEAR", "SESSION_USER_ID"] },
    success: function(data, responseData) { }
});
```

- **파라미터는 이름이 아니라 순서로 전달된다.** 서버가 `EXEC [SYS].DBO.[SP_공통_프로시저_호출] 'DB','SP','N''값1'',N''값2'''` 형태로 조립한다. `params` 순서 = SP 파라미터 선언 순서여야 한다. 하나라도 어긋나면 값이 밀린다.
- **`SESSION_*` 파라미터는 프레임워크가 세션값을 자동으로 채운다.** `params`에만 넣고 `data`에는 안 넣어도 된다. 확인된 키: `SESSION_USER_ID`, `SESSION_USER_IP`, `SESSION_SYSTEM_GCD`, `SESSION_MENU_CD`, `SESSION_USER_DEPT_CD`, `SESSION_SEARCH_SCOPE_GCD`, `SESSION_AUTH_CD` 등.
- **빈 값은 `''`(빈 문자열)로 넘어간다.** NULL이 아님. SP에서 `ISNULL(@X, '') = ''` 로 처리.
- **응답 행에 `PARAM_CODE`(base64 토큰)가 자동으로 붙는다.** 결과를 동적으로 표시할 때 제외할 것.
- **결과는 순서 없는 Map으로 온다.** 컬럼 순서가 SELECT 순서와 다르게 섞인다. 동적 화면에서는 별칭 번호 규칙(`[01_컬럼명]`)으로 정렬.
- **별칭의 마침표(.)를 경로로 해석해 중첩 객체로 보낸다.** `[02_재학생수(4.1.)]` → `{ "02_재학생수(4": { "1": { ")": 값 } } }`. 헤더가 잘리고 값이 `[object Object]`가 된다. 별칭에 마침표를 쓰지 말 것.
- 저장 SP 성공 후 `data.O_CNT` 로 건수를 쓰는 패턴이 있음.
- SP의 `THROW` 메시지는 서버 로그와 화면 오류로 그대로 전달된다.

---

## 4. 사내 공통 함수 (확인된 사용법)

| 함수 | 용도 |
|---|---|
| `udc_top_auth_btn.init({...})` | 상단 공통 버튼(조회·신규·삭제·저장·엑셀). `_grid` 에 `callSpNm` 주면 UDC가 SP를 재호출해 엑셀 생성. 결과 컬럼이 동적이면 `"_excelDownUseYn":"N"` 후 화면 자체 엑셀 사용 |
| `scwin.fn_commSearch / fn_commNew / fn_commDelete / fn_commSave` | 상단 버튼이 호출하는 함수. 안 쓰더라도 빈 함수로 정의 |
| `common.getCode("0001_XXX")` | 공통코드 DataList `dlt_0001_XXX` 생성 |
| `common.getCodeByEtcParam("0001_XXX", "AND ...")` | 조건부 공통코드, DataList `dlt_0001_XXX_f` 생성. 두 번째 인자는 SQL 조각 |
| `common.getSyearTermGcd(SYSTEM_GCD, MENU_CD, comp1, comp2)` | 메뉴 기준 학년도/학기. `async:false`, `dlt_SYEAR_TERM_GCD`(SYEAR, TERM_GCD, START_DATE, CLOSE_DATE) 생성 |
| `common.validateGridView(grid, checkInfo)` | `{id, mandatory, maxbyte}` 배열로 검증 |
| `common.getModifyedData(dlt)` | 수정 행 추출 (오타 아님, 실제 함수명) |
| `common.confirm(msg, "fn_이름")` | 콜백을 **문자열 함수명**으로 받고 `scwin.fn_이름(bool)` 호출 |
| `common.masterDetail(grid01, dlt_01, grid02, "키컬럼", cb)` | 마스터 행 이동 시 상세 수정 여부 확인 |
| `common.conditionChgReset(dma, [dlt...], null, [제외키])` | 검색조건 변경 시 결과 DataList 초기화. 편집 화면에서는 미저장 데이터가 확인 없이 지워질 수 있음 |
| `scwin.frameMenuData` | `SYSTEM_GCD`, `MENU_CD`, `USER_CONTENT`, `SEARCH_SCOPE_GCD` 등 메뉴 정보 |

공통코드 그룹은 반드시 **시스템구분 포함** 형식(`0001_TERM_GCD`, `0000_DB_SYSTEM_GCD`). 조건별 공통코드 SP(`SYS_공통_공통코드_조건별_조회`)가 `SYSTEM_GCD + '_' + COMMON_CD` 로 찾는다.

---

## 5. WebSquare 함정

| 현상 | 원인 / 처리 |
|---|---|
| `$p.dynamicCreate(id, "select1", ...)` 에서 `getAttribute of null` | 타입명은 XML 태그명이 아니라 컴포넌트명. `xf:select1 appearance="minimal"` → **`"selectbox"`**, full → `"radio"`. `input`, `inputCalendar`, `spinner`, `textbox`, `group` 은 그대로 |
| 동적 생성 컴포넌트 CSS 일부 깨짐 | `class` 옵션만으로는 부족. 생성 후 `comp.addClass()` + `comp.render.classList.add()` 로 재적용 |
| 그리드 컬럼이 화면 폭에 맞춰 늘어남 | XML `autoFit="none"` 을 프레임워크가 덮어씀. 폭 지정 전에 `grid.setAutoFit({ type : "none" })` 호출 |
| `ref` 바인딩된 select1 의 목록을 바꾸면 행이 수정 상태가 됨 | 목록에 없는 값이면 빈 값을 데이터에 써 버림. 목록이 행마다 바뀌는 콤보는 `ref` 를 빼고 `onviewchange` 에서 `setCellData` 로 직접 반영 |
| 마스터 조회 직후 상세 폼 콤보 미반영 | 조회 직후에는 `onrowindexchange` 가 안 일어남. 조회 `success` 에서 동기화 함수 직접 호출 |
| 프레임워크가 결과 건수를 제목 옆에 자동 표시 | 화면에서 건수를 또 붙이면 "총 3건 (총3건)" 중복 |
| 상태 컬럼·그룹정렬 영역 | 조회 전용 그리드는 `rowStatusVisible="false"`, `groupbyZone="false"` |

---

## 6. 화면 레이아웃 클래스 (업무 화면 표준)

```
search-box
 └ b-table-box flex-col-4          (한 줄 4칸, flex-col-2 는 2칸)
    └ b-row-box
       └ b-row-item                (merge-2: 2칸 병합, b-blank: 빈칸)
          ├ b-title-box > w2:textbox tagname="label" (필수면 class="req")
          └ b-con-box   > 컴포넌트 (콤보·입력 class="form-control")
sec sec-2 > sec-header(title-box, btn-box) + sec-body > gridView class="full-height"
안내문구: xf:group class="label-box" > w2:textbox class="info-txt02 mb-0" tagname="p"
```

- 학년도는 `w2:spinner skin="type1" buttonSize="30" min="1996" max="2100"`
- 마지막 줄 칸 수가 모자라면 `b-row-item b-blank` 로 채워야 레이아웃이 안 깨짐

---

## 7. 메타 기반 공통 데이터 조회

### 구성

| 구분 | 객체 |
|---|---|
| 관리 화면 | `CommonDataMng.xml` (`/common/commonmng/meta/commquerymng`) |
| 조회 화면 | `commQueryView.xml` (`/common/commonmng/meta/commqueryview`) |
| 마스터 | `SYS.dbo.SYS_COMMON_DATA_SEARCH_INFO` (ID, NM, DB_SYSTEM_GCD, DB_NM, PROC_NM, USE_YN, SORT_ORD, REMARK, AUTH_USER_IDS, AUTH_DEPT_CDS, GUIDE_MSG) |
| 조회조건 | `SYS.dbo.SYS_COMMON_DATA_SEARCH_PARAM` (ID, PARAM_ID, PARAM_NM, PARAM_TYPE, COMBO_GROUP_CD, MANDATORY_YN, SORT_ORD, REMARK) |
| SP | `SYS_조회메타마스터_조회/저장`, `SYS_조회메타파라미터_조회/저장`, `SYS_조회메타_사용자목록_조회`, `SYS_테이블정보조회_DB구분_조회`(기존) |

### 동작

1. 조회 목록: `SYS_조회메타_사용자목록_조회(SESSION_USER_ID, SESSION_USER_DEPT_CD)` 로 권한 있는 조회만
2. 조회 선택: 파라미터 메타로 조회조건 동적 생성 (한 줄 4칸)
3. 조회: 메타의 `DB_NM`, `PROC_NM`, 파라미터 순서로 `bindProc` 직접 호출
4. 결과: C01~C40 슬롯에 매핑, 헤더 = 별칭에서 번호 제거, 글자 수 기준 폭
5. 메뉴 파라미터 `ID=조회ID` 로 특정 조회 고정 가능

### 조회조건 유형 (`PARAM_TYPE`)

`TEXT`, `NUMBER`, `SELECT`(공통코드), `DATE`, `YM`, `SYEAR`(학년도 spinner, 기본 학사 기준년도), `TERM`(학기 콤보, 기본 `0001_TERM_GCD`), `YEAR`(최근 10년 콤보)

### 메타 등록 규칙

1. 파라미터 순번 = 대상 SP 파라미터 선언 순서
2. `SESSION_` 으로 시작하는 파라미터는 화면 미표시, 세션값 사용
3. 학년도 바로 다음 순번이 학기면 "학년도/학기" 한 칸
4. 공통코드그룹은 시스템구분 포함 (생략 시 메뉴 시스템구분 자동 보정)
5. 결과 별칭 `[01_컬럼명]` → 번호순 정렬, 화면엔 컬럼명만
6. 결과 별칭에 마침표 금지

### 권한

- `AUTH_USER_IDS`, `AUTH_DEPT_CDS` 쉼표 구분, 둘 다 비면 전체 허용. 부서는 정확히 일치하는 코드만.
- 화면 목록 단위 제어일 뿐 `bindProc` 직접 호출은 막지 못함 → 개인정보 조회는 SP 안에서 세션값으로 한 번 더 제한.

### 조회조건 유형 추가

`commQueryView.xml` 의 `fn_createCondComp` 에 `case` 추가, `CommonDataMng.xml` 의 유형 콤보(폼·그리드 2곳)에 항목 추가.

---

## 8. 조회 SP 작성 규칙

```sql
CREATE OR ALTER PROCEDURE [dbo].[CLS_샘플_현황_조회]
    @SYEAR                NVARCHAR(4),
    @TERM_GCD             NVARCHAR(4),
    @SESSION_USER_DEPT_CD NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
         A.SYEAR    AS [01_학년도]
        ,A.DEPT_NM  AS [02_학과명]
        ,COUNT(*)   AS [03_인원수]
    FROM ...
    WHERE A.SYEAR = @SYEAR
      AND (ISNULL(@TERM_GCD, '') = '' OR A.TERM_GCD = @TERM_GCD)
    GROUP BY A.SYEAR, A.DEPT_NM;
END
```

- 결과는 첫 번째 결과셋 하나만
- 빈 값 = `''` 처리, 숫자 파라미터도 문자열로 들어올 수 있음 (`TRY_CAST`)
- 사내 SP 헤더 주석 형식: `PROCEDURE명 / 설명 / 변수 / 사용예`
- 메타 저장 SP는 대상 DB의 모든 스키마에서 SP를 찾아 검증함 (dbo 외 스키마는 `스키마.SP명` 저장)

### 성능

- 연도 목록 × 성적 전체 같은 **비등가(`<=`) 대량 조인 금지.** 대상 학생을 먼저 뽑고(`#STDT`), 그 학생의 필요한 성적만 추출(`#AI`)한 뒤 학번으로 조인.
- CTE를 여러 단계로 엮어 느리면 임시테이블로 끊는다. 테이블 변수 조인은 `OPTION (RECOMPILE)` 고려.
- 학생 수는 `COUNT(DISTINCT 학번)`. 평균은 `AVG(x * 1.0)` (정수 나눗셈 방지).

---

## 9. 데이터 도메인 (확인된 것)

| DB.테이블 | 내용 / 주요 컬럼 |
|---|---|
| `HAKJUKLOG.DBO.HJ_STDT_INFO_DATE_DIVIDE_HISTORY` | 기준일별 학적 스냅샷. `HISTORY_DATE`(YYYYMMDD), `STDT_NO`, `HJ_STA_GCD`(`0001` 재학), `COLL_GRAD_GCD`(`0001` 학부), `HISTORY_GCD`(`0013`). 스냅샷이 있는 날짜만 조회 가능 → 날짜 바꾸기 전 `GROUP BY HISTORY_DATE` 로 존재 확인 |
| `GRADE..SJ_RESULT_SUBJ` | 성적. `STDT_NO`, `SYEAR`, `TERM_GCD`, `SUBJ_NO`, `GRADE_CD`(`F` 제외) |
| `SYS.DBO.SYS_COMMON_CD_DETAIL` | 공통코드. `SYSTEM_GCD`, `COMMON_CD`, `COMMON_DETAIL_CD`, `COMMON_DETAIL_CD_KOR_NM`, `CHAR_n_CONTENT` |
| 학기코드 `0001_TERM_GCD` | `0012` = 1학기 계열 마지막, `0022` = 2학기 계열 마지막. 학년도+학기 문자열(`CONCAT(SYEAR, TERM_GCD)`)로 기간 비교 |
| DB 시스템구분 `0000_DB_SYSTEM_GCD` | `0001` SESDB, `0002` ORGDB(별도 서버일 수 있음, 3-part name 불가) |

---

## 10. 지표 산출 시 체크 (AI 이수율에서 배운 것)

- **분자와 분모의 모집단을 일치시킨다.** 분모가 "기준일 재학생 평균"이면 분자도 기준일별로 세서 평균. 두 기준일 합집합을 분자로 쓰면 이수율이 100%를 넘는다.
- **성적 반영 범위(cutoff)를 기준일과 맞춘다.** 현행 AI 이수율: 1학기 7월1일 재학생 → 해당년도 `0012`까지, 2학기 12월1일 재학생 → `0022`까지, 누적.
- "기준일 이전 성적만" 으로 자르면 신입생이 전원 미이수가 되어 지표가 신입생 비율에 좌우된다. 이런 해석 문제는 쿼리가 아니라 **정의 문제**이므로 사용자/담당 부서 확인을 받는다.
- 기존 산출값과 비교 검증 쿼리를 먼저 만들고(기준별 A/B/C 열 비교), 숫자로 판단하게 한다.
- 당해 연도는 성적 확정 전 잠정치임을 안내문구에 표시.

---

## 11. 디버깅 순서

1. 서버 로그의 `EXEC [SYS].DBO.[SP_공통_프로시저_호출] ...` 줄로 실제 호출 DB·SP·파라미터 값 확인
2. "프로시저를 찾을 수 없습니다" → SP 미생성 또는 이름 오타(접두어 누락 등)부터 확인
3. 화면은 F12 콘솔에서 응답 키 로그 확인 (`PARAM_CODE`, 잘린 키, 순서)
4. 레이아웃 문제는 Elements에서 정적 업무 화면(예: 개설강좌 일람표)과 class 목록 비교
5. 값이 엉뚱한 파라미터에 들어가면 메타 순번 vs `sys.parameters` 의 `parameter_id` 비교
