# 포트폴리오 원페이지 전면 재디자인 — 공통 브리프

## 목적
백엔드 개발자 이건상의 개인 사이트(kunsanglee.github.io). 주 사용처는 AI 에이전트 밋업(성수, Grok Bot Meetup — 개발자·창업자·AI 인프라/도구 회사 참석)에서
상대가 QR 을 찍고 **휴대폰으로 30초** 보는 상황. 첫 화면에서 "이 사람은 실제 운영되는 사내 AI 에이전트를 설계·운영한 사람" 이 즉시 박혀야 한다.
보조 사용처: 채용 담당자가 데스크톱으로 보는 것.

## 내용 원본 (사실은 여기서만 — 새 숫자·주장 지어내지 말 것)
- 현재 사이트(리뷰 통과본): `../../index.html` — 히어로, #featured(agent-colleague, 리뷰 반영 완료 문장), #works, #writing, #contact, footer. 모든 섹션 내용을 유지(문장 다듬기는 가능, 사실 추가 불가).
- #featured 의 숫자/문장은 리뷰를 통과한 것이니 의미를 바꾸지 말 것: 15주·235건·96초(첫 답까지 중앙값)·46%(사람이 이어서 말한 스레드), "1편 봇부터 이어진 15주 운영 기록", 기간 2026년 6월 중순~9월 하순, 대부분 1편 봇이 답했고 9월 중순 구조 전환, 답 정확도는 재지 않았음.
- 설계 요점 3개(현 #featured 문장 그대로의 의미): ① 말뜻은 모델이, 실행 허용은 코드가(누가·언제·이미 실행했는지·운영 DB 예상 비용 같은 사실만 봄) ② 스레드 하나에 세션 하나 ③ 정해 둔 도구만, 외부에 영향을 주는 일은 초안 먼저(부탁받은 일은 사람이 답한 뒤 실행).
- 더 깊은 근거가 필요하면: `~/Desktop/personal/agent-colleague-포트폴리오/2_블로그/blog-2-agent-colleague.md`(머리 주석의 미결 항목 숫자 금지: 9/16, 24건, 51초, 38시간, $0.84), `~/Desktop/personal/agent-colleague/README.md`, `docs/POLICY.md`.
- 그림: `../../assets/featured/policy-flow.png`, 추가로 `~/Desktop/personal/agent-colleague-포트폴리오/2_블로그/images/` 의 다이어그램류(blog-architecture, blog-policy-flow, blog-before-after, blog-weekly-threads 등). **슬랙 캡처(blog-slack-*, blog-shot-*)는 쓰지 않는다.** 쓰는 그림은 시안 폴더 안 assets/ 로 복사.
- 블로그 링크 1·2편, 이메일·GitHub 등 연락처는 현재 index.html 에 있는 것 그대로.

## 금지·제약
- 운영 상태를 현재형으로 단정하지 않는다("지금도 답하고 있습니다", 'LIVE' 깜빡이 등 금지 — 미확인). 슬랙 재생 데모를 만들면 "재현한 예시"라고 표시하고, 대화 내용은 policy-flow 그림 수준(티켓 만들어 줘 → 초안 → 사람 답 → 실행)의 일반 예시로. 사내 채널명·사람 이름·사내 저장소명·회사 내부 정보 금지.
- 시크릿·개인 전화번호 등 현재 페이지에 없는 개인정보 추가 금지.
- 외부 스크립트는 cdnjs.cloudflare.com / cdn.jsdelivr.net/npm / unpkg.com 만, 폰트는 Google Fonts 또는 Pretendard(jsdelivr). 정적 단일 index.html + assets/ (GitHub Pages 그대로 배포 가능해야 함). 빌드 도구 없음.
- 모바일 390px 우선: 가로 스크롤 0, 탭 영역 44px 이상, 첫 화면(390x844)에서 정체성+agent-colleague 핵심이 보일 것. `prefers-reduced-motion` 존중. 첫 렌더 3초 안에 의미 있는 내용(무거운 WebGL 로딩 화면 금지). 한국어 줄바꿈 `word-break: keep-all`.
- 그림(다이어그램)을 새로 그리면 diagram-design 스킬 규칙(`~/.claude/plugins/cache/diagram-design/diagram-design/*/skills/diagram-design/SKILL.md` 가장 높은 버전)을 읽고 따른다.

## 글 규칙 (사람이 읽는 말)
내부 은유 금지(열린다/닫힌다, 울타리, 바깥, 영수증, 겹), AI 문형 금지("~인 셈", "핵심은", "A가 곧 B", "A가 아니라 B" 대구 남발, 명사형 종결 나열, 격언형 맺음), 무생물 행위 주어 금지, 성과는 잰 만큼만. 마지막에 실행:
`grep -nE '열린다|열리는|열립니다|바깥|울타리|셈이|핵심은|이 곧 |가 곧 ' index.html` → 0건.

## 산출물 (자기 시안 폴더 안에서만 작업. 다른 폴더·../../index.html 수정 금지, git 커밋 금지)
- `index.html`, `assets/`
- `shots/`: headless Chrome 스크린샷 — 모바일 390 폭(첫 화면 390x844 + 전체 길이), 데스크톱 1440x900 첫 화면 + 전체 길이. headless Chrome 은 창 폭 500 미만이 안 되므로 390은 390폭 iframe 래퍼로 찍는다. 애니메이션/reveal 은 촬영용 임시 사본에서만 강제 표시(원본에 촬영용 코드 남기지 말 것). 로컬 서버 포트는 시안별로 다르게(A 8781, B 8782, C 8783), 끝나면 종료.
- 스크린샷을 직접 보며 최소 3회 이상 고친다. 첫 화면 임팩트·위계·여백·모바일 가독성 기준.
- `NOTES.md`: 콘셉트 한 단락, 왜 시선을 끄는지, 인터랙션 목록, 쓴 사실과 출처, 알려진 한계.
