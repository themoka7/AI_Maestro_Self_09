# 프로젝트 안내

WebSquare 5 업무 화면·SQL Server SP 개발 도구 저장소. 답변은 한국어로.

- WebSquare 화면·SP 작업은 `websquare-dev` 에이전트 또는 `/websquare-new-screen` 스킬을 쓴다.
- 작업 전 `.claude/skills/websquare-common-query/SKILL.md` 를 기준으로 삼는다.
- 생성기 로직은 `assets/generator.js` 하나다. 웹(`index.html`)과 CLI(`tools/gen.js`)가 같이 쓰므로 바꾸면 `node tools/gen.js specs/examples/<예제>.json` 전부 돌리고 `node tools/check.js out` 으로 검사한다.
- 생성되는 화면 스크립트는 ES5만. 생성기·웹 코드 자체는 브라우저 표준 JS면 된다.
