/* Kunsang Lee · 한/영 문자열. 페이지의 모든 글은 이 사전 하나에서 나온다.
   장면 문구는 g-copy-v15, 본문은 g-body-v2 를 글자 그대로 옮겼다. 키 끝이 _h 이면 HTML 로 넣는다 */
window.__I18N_DICT = {
  ko: {
    'doc.title': 'Kunsang Lee — AI 에이전트를 만들고, 그 에이전트가 일하기 좋은 코드 구조를 설계합니다',
    'ui.skip': '본문으로 건너뛰기',
    'ui.newtab': '(새 탭)',
    'ui.home': 'Kunsang Lee, 맨 위로',
    'ui.links': '연락처',
    'ui.lang': '언어',
    'ui.secnav': '본문 구역',
    'ui.tabs': '이야기 장면',
    'ui.hint.mouse': '움직이면 밀려나고 · 누르면 흩어집니다 · 스크롤로 넘깁니다',
    'ui.hint.touch': '누르면 흩어집니다 · 스크롤로 넘깁니다',
    'ui.next': '아래에 자세한 내용이 이어집니다',

    'tab.1': 'Kunsang Lee', 'tab.2': '동료', 'tab.3': '말뜻', 'tab.4': '기억', 'tab.5': '언제든',
    'tab.6': '하루 30분', 'tab.7': '리뷰', 'tab.8': '코드 구조', 'tab.9': '함께',

    's1.t': 'Kunsang Lee',
    's1.d_h': '<b>이건상</b> · AI 에이전트를 만들고, 그 에이전트가 일하기 좋은 코드 구조를 설계합니다',
    's2.t': '동료와 같은 에이전트',
    's2.d': 'Slack 에서 부르면 코드베이스와 데이터베이스를 조회해 근거와 함께 답하고, 티켓과 PR 까지 맡도록 직접 설계했습니다.',
    's3.t': '말뜻을 알아듣는',
    's3.d': '평소 말투로 부탁하면 모델이 뜻을 읽고 할 일을 고릅니다. 비결정론적인 판단은 모델에, 실행해도 되는지 같은 결정론적인 판단은 코드에 맡겼습니다',
    's4.t': '기억을 가진 에이전트',
    's4.d': '채널 글을 모두 임베딩으로 쌓아 두고, 뜻이 가까운 지난 대화를 필요할 때 찾아 쓰게 했습니다. 최근 30일 1,111건의 임베딩 비용은 1센트도 되지 않았습니다',
    's5.t': '언제든, 자리에 없어도',
    's5.d': '그 일을 아는 사람이 자리에 없어도 답을 받을 수 있게 했습니다. 근무 시간 밖에 올라온 질문 39건도 절반은 99초 안에 첫 답이 달렸습니다',
    's6.t': '하루 30분, 멈추지 않고',
    's6.d': '하루 약 30분. 업무 질문이 올 때마다 누군가 확인해 답했다면 들었을 시간입니다. 건당 10분으로 잡으면 15주 동안 약 38시간입니다',
    's7.t': '리뷰를 바탕으로 발전할 수 있도록',
    's7.d_h': '<b>ai-ready.</b> 리뷰와 문서로만 권하던 규칙을 자동 검사로 옮기도록 돕는 오픈소스 도구입니다. 바로잡은 실수도 사람이 승인하면 규칙으로 남아 다음 작업의 기준이 됩니다',
    's8.t': '에이전트가 잘 일할 수 있도록',
    's8.d_h': '<b>Agent-Friendly Architecture.</b> Cursor 의 Lauren Tan 이 소개한 Dune 프로젝트 문서의 개념을 바탕으로 사내 에이전트 코드에 적용했습니다. 외부 연동 9개는 서비스별 폴더로, 구조 규칙은 테스트 52개로 옮겨 규칙을 어기면 push 전에 바로 알 수 있습니다',
    's9.t': '다음 에이전트는 함께',
    's9.d': '만들면서 겪은 일을 나누고 싶습니다',
    'fx.30': '30분',

    'lbl.code': '코드베이스', 'lbl.db': '데이터베이스', 'lbl.ticket': '티켓', 'lbl.pr': 'PR',
    'lbl.past': '지난 대화',
    'lbl.review': '리뷰', 'lbl.rules': '규칙',

    'nav.b1': 'agent-colleague', 'nav.b2': '15주 기록', 'nav.b3': '코드 구조', 'nav.b4': 'ai-ready', 'nav.b5': '글과 연결',

    'b1.k': '대표 작업 · agent-colleague',
    'b1.t': 'Slack 에서 일하는 사내 AI 에이전트',
    'b1.l': '처음 만든 봇을 TypeScript 와 Claude Agent SDK 로 다시 설계했습니다. 여기서는 에이전트에게 무엇을 맡기고 무엇을 막았는지, 코드를 어떻게 고치게 했는지를 적었습니다.',
    'b1.p1.h': '쓰기는 사람이 답한 뒤에',
    'b1.p1.d': '티켓 생성 같은 쓰기 도구는 봇이 스레드에 글을 올린 뒤 사람이 답했을 때만 실행되고, 실행 기록을 확인해 같은 요청을 두 번 실행하지 않습니다.',
    'b1.p2.h': '고친 코드는 리뷰를 거쳐서',
    'b1.p2.d': '격리된 작업 공간에서 구현하고, 수정 권한이 없는 별도 리뷰 세션이 찾은 문제를 반영한 뒤 봇 전용 브랜치로만 PR 을 엽니다.',
    'b1.p3.h': '운영 DB 는 좁게',
    'b1.p3.d': '개인정보 컬럼을 읽지 못하는 계정으로만 조회하고, 쓰기는 거부하며, 실행 계획으로 비용을 재서 무거운 조회는 사람이 답한 뒤에 실행합니다.',

    'b2.t': '15주 동안의 기록',
    'b2.s1.u': '초', 'b2.s1.sr': '96초', 'b2.s1.l': '첫 답까지 중앙값',
    'b2.s2.sr': '46%', 'b2.s2.l': '사람이 이어서 말한 스레드',
    'b2.s3.sr': '83%', 'b2.s3.l': '오류 알림 277개 중 첫 분석이 달린 비율(중앙값 113초, 대부분 재설계 전)',
    'b2.note': '2026년 6월 중순~9월 하순, 팀 코드 질문 채널의 Slack 스레드를 직접 센 사내 운영 기록입니다. 9월 중순에 지금 구조로 바꿨습니다. 이어서 말한 스레드에는 되물음과 정정도 섞여 있고, 답이 맞았는지는 따로 재지 않았습니다. 장면의 38시간은 잡담 9건을 뺀 226건에 건당 10분(처리 5분, 원래 일로 돌아오는 데 5분)을 곱한 값입니다. 묻는 쪽이 기다린 시간은 넣지 않았고, 모두 바로 답했다는 가정이라 실제보다 크게 잡혔을 수 있습니다. 기간 대부분(235건 중 211건)은 처음 만든 봇이 답했습니다.',

    'b3.k': 'Agent-Friendly Architecture',
    'b3.t': '에이전트가 잘 일할 수 있는 코드 구조',
    'b3.l': 'Cursor 의 Lauren Tan 이 영상에서 소개한 Dune 프로젝트 문서의 "작업자 에이전트가 자주 하는 다섯 가지"를 바탕으로 했습니다. 예외를 목록과 개수로 테스트하고 그 목록을 비운 것은 이 저장소에서 정했습니다.',
    'b3.p1': '외부 연결은 시작 파일 두 곳에서만 만들고, 외부 연동 9개는 서비스별 폴더로 모았습니다.',
    'b3.p2': '구조 규칙은 경계 테스트 52개로 옮겼고(2026-10-05 기준) 예외 목록 6개는 모두 비어 있으며, 비어 있는지도 테스트로 확인합니다.',
    'b3.p3': '리뷰 에이전트가 찾은 우회 13건과 변형 3건을 테스트 사례로 고정했습니다.',
    'b3.p4': 'PR 과 push 전에 같은 검사를 돌립니다. 결함이 줄었는지는 재지 않았습니다.',

    'b4.k': 'Open Source · MIT',
    'b4.t': '리뷰에서 한 말을 다음 작업의 규칙으로',
    'b4.l': '문서에 적힌 규칙마다 이미 강제되는지 따지고, 사람이 승인한 규칙은 lint·아키텍처 테스트 초안으로 옮겨 문서에는 강제할 수 없는 것만 남기는 오픈소스 도구입니다. 작업 중 바로잡은 실수와 PR 리뷰 댓글도 사람이 승인하면 규칙 초안이나 금지 목록 항목이 됩니다.',
    'b4.v': '1.x 는 문서를 7개 영역 점수로 매겼는데, 강제하지 않는 문서를 더 쓰는 것이 점수를 올리는 가장 쉬운 길이어서 2.0 에서 점수를 없앴습니다.',
    'b4.link': 'GitHub 저장소',

    'b5.t': '만들면서 판단한 것을 씁니다',
    'b5.l': '1편은 처음 만든 봇 이야기입니다. Claude Code 헤드리스 모드로 백엔드·안드로이드·iOS·웹 네 저장소의 코드를 읽고 답했습니다. 2편은 15주 운영 기록과, 기능이 늘면서 구조를 다시 짠 과정을 다룹니다.',
    'b5.p1.k': 'Medium · 2026.06 · 14분 분량 · 시리즈 1편',
    'b5.p1.t': '파트 경계를 넘는 코드 질문에 답하는 사내 AI 에이전트를 만들기까지',
    'b5.p2.k': 'Medium · 시리즈 2편',
    'b5.p2.t': '사내 AI 에이전트를 재설계한 이야기',
    'b5.ko': '',
    'b5.c.t': '에이전트 이야기라면 언제든',
    'b5.c.l': '만드는 중인 에이전트가 있다면 들려주세요.',

    'foot.c': '© 2026 이건상',
    'foot.src': '이 페이지의 소스'
  },
  en: {
    'doc.title': 'Kunsang Lee — I build AI agents, and design codebases that are easy for them to work in.',
    'ui.skip': 'Skip to content',
    'ui.newtab': '(opens in a new tab)',
    'ui.home': 'Kunsang Lee, back to top',
    'ui.links': 'Contact',
    'ui.lang': 'Language',
    'ui.secnav': 'Sections',
    'ui.tabs': 'Story scenes',
    'ui.hint.mouse': 'Move to push · click to scatter · scroll to continue',
    'ui.hint.touch': 'Tap to scatter · scroll to continue',
    'ui.next': 'More details below',

    'tab.1': 'Kunsang Lee', 'tab.2': 'Teammate', 'tab.3': 'Meaning', 'tab.4': 'Memory', 'tab.5': 'Anytime',
    'tab.6': '30 min a day', 'tab.7': 'Reviews', 'tab.8': 'Codebase', 'tab.9': 'Together',

    's1.t': 'Kunsang Lee',
    's1.d_h': 'I build AI agents, and design codebases that are easy for them to work in.',
    's2.t': 'An agent that works like a teammate',
    's2.d': 'Mention it in Slack and it digs through the codebase and database, answers with sources, and can file tickets and open pull requests. I designed it end to end.',
    's3.t': 'It gets what you mean',
    's3.d': 'Ask the way you\'d ask a colleague. The model does the non-deterministic work of figuring out what you mean; code makes the deterministic call on whether an action is allowed to run.',
    's4.t': 'It remembers',
    's4.d': 'Every channel message is embedded and stored, so it can pull up related past conversations when it needs them. Embedding 1,111 messages over 30 days cost under a cent.',
    's5.t': 'Anytime, even off the clock',
    's5.d': 'Answers don\'t have to wait for the one person who knows. Of the 39 questions asked before 9 a.m., after 7 p.m., or on weekends, half got a first reply within 99 seconds.',
    's6.t': '30 minutes a day, uninterrupted',
    's6.d': 'That\'s roughly the time someone would spend stopping to check and reply to work questions. At 10 minutes a question, it adds up to about 38 hours over 15 weeks.',
    's7.t': 'Review feedback that sticks',
    's7.d_h': '<b>ai-ready</b> is an open-source tool that helps move rules out of code reviews and docs and into automated checks. Corrections a person approves become rules that carry into the next task.',
    's8.t': 'A codebase made for agents',
    's8.d_h': '<b>Agent-Friendly Architecture</b>, based on a Dune project doc presented by Lauren Tan of Cursor. Each of the agent\'s 9 external integrations lives in its own folder, and the structural rules run as 52 tests, so an agent that breaks a rule finds out before it pushes.',
    's9.t': 'Let\'s build the next one together',
    's9.d': 'Always happy to compare notes on building agents',
    'fx.30': '30 min',

    'lbl.code': 'codebase', 'lbl.db': 'database', 'lbl.ticket': 'ticket', 'lbl.pr': 'PR',
    'lbl.past': 'past conversations',
    'lbl.review': 'review', 'lbl.rules': 'rules',

    'nav.b1': 'agent-colleague', 'nav.b2': '15 weeks', 'nav.b3': 'Architecture', 'nav.b4': 'ai-ready', 'nav.b5': 'Writing & contact',

    'b1.k': 'Featured · agent-colleague',
    'b1.t': 'An in-house AI agent that works in Slack',
    'b1.l': 'I rebuilt my first bot on TypeScript and the Claude Agent SDK. This part covers what the agent is trusted with, what it\'s kept from doing, and how it changes code.',
    'b1.p1.h': 'Writes wait for a person',
    'b1.p1.d': 'Actions like filing a ticket run only after the bot posts in the thread and someone replies, and an action log keeps the same request from running twice.',
    'b1.p2.h': 'Code changes go through review',
    'b1.p2.d': 'Built in an isolated workspace, checked by a separate read-only review session, then opened as a PR on a bot-only branch.',
    'b1.p3.h': 'Production data, narrowly',
    'b1.p3.d': 'Queries run under an account that can\'t read personal-data columns, writes are refused, and heavy queries (costed from the query plan) wait for a person\'s reply.',

    'b2.t': 'Fifteen weeks of use',
    'b2.s1.u': 's', 'b2.s1.sr': '96 s', 'b2.s1.l': 'median to first reply',
    'b2.s2.sr': '46%', 'b2.s2.l': 'of threads had a human follow-up',
    'b2.s3.sr': '83%', 'b2.s3.l': 'of 277 error alerts got a first analysis (median 113 s, mostly before the redesign)',
    'b2.note': 'An internal record from mid-June to late September 2026, counted by hand from Slack threads in the team\'s code-question channel. The structure changed to the current design in mid-September. Follow-ups include clarifying questions and corrections, and whether answers were correct wasn\'t measured separately. The 38 hours: 226 work questions (9 small-talk threads removed) × 10 minutes (5 to handle, 5 to get back to work). The asker\'s waiting time isn\'t counted, and assuming every question would have been answered right away may overstate it. Most of the period (211 of 235) was handled by the first bot.',

    'b3.k': '',
    'b3.t': 'Agent-Friendly Architecture',
    'b3.l': 'Based on the "five habits of worker agents" from the Dune project doc that Lauren Tan of Cursor presented. Testing exceptions as a counted list, and emptying that list, were decisions made in this repo.',
    'b3.p1': 'Outside connections are created in two entry files only; the 9 integrations each live in their own folder.',
    'b3.p2': 'Structural rules run as 52 boundary tests (as of 2026-10-05); all 6 exception lists are empty, and a test checks they stay that way.',
    'b3.p3': '13 workarounds and 3 variants found by a review agent are pinned as test cases.',
    'b3.p4': 'The same checks run before push and on every PR. Whether this reduced defects hasn\'t been measured.',

    'b4.k': 'Open Source · MIT',
    'b4.t': 'Turn review notes into rules',
    'b4.l': 'An open-source tool that checks whether each documented rule is actually enforced, and turns approved rules into lint or architecture-test drafts so docs keep only what can\'t be enforced. Corrections from work sessions and PR review comments become rule drafts or anti-pattern entries once a person approves them.',
    'b4.v': '1.x scored docs across seven areas. The easiest way to raise the score was to write more unenforced docs, so 2.0 dropped the score.',
    'b4.link': 'GitHub repository',

    'b5.t': 'Notes from building it',
    'b5.l': 'Part 1 is about the first bot, which read code across four repos (backend, Android, iOS, web) using Claude Code in headless mode. Part 2 covers fifteen weeks of use and how the structure was rebuilt as features grew.',
    'b5.p1.k': 'Medium · June 2026 · 14 min read · Part 1',
    'b5.p1.t': 'Building an in-house AI agent that answers code questions across teams',
    'b5.p2.k': 'Medium · Part 2',
    'b5.p2.t': 'How I redesigned our in-house AI agent',
    'b5.ko': 'Korean',
    'b5.c.t': 'Happy to talk agents',
    'b5.c.l': 'Building one? I\'d love to hear about it.',

    'foot.c': '© 2026 Kunsang Lee',
    'foot.src': 'Source for this page'
  }
};

/* 이건상 · 언어 전환과 읽는 구역의 나타나기. 입자 없이도 돈다 */
(function () {
  "use strict";
  var d = document, h = d.documentElement, DICT = window.__I18N_DICT || {};
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }

  /* ---------- 언어 ---------- */
  // HTML 에는 한국어가 적혀 있다. 고를 때마다 사전에서 그 언어의 글을 넣는다
  function apply(L) {
    var T = DICT[L] || {};
    $$("[data-i18n]").forEach(function (el) { var k = el.getAttribute("data-i18n"); if (k in T) el.textContent = T[k]; });
    $$("[data-i18n-html]").forEach(function (el) { var k = el.getAttribute("data-i18n-html"); if (k in T) el.innerHTML = T[k]; });
    $$("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var i = pair.indexOf(":");
        if (i < 0) return;
        var a = pair.slice(0, i).trim(), k = pair.slice(i + 1).trim();
        if (k in T) el.setAttribute(a, T[k]);
      });
    });
    if (T["doc.title"]) d.title = T["doc.title"];
    h.lang = L;
    $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === L ? "true" : "false"); });
    h.classList.remove("pre-en");
  }
  function choose(L) {
    if (L === h.lang) return;
    apply(L);
    try { localStorage.setItem("lang", L); } catch (e) {}
    // 주소에 ?lang= 이 있으면 그 값도 바꿔, 새로 고쳐도 고른 언어로 열리게 한다
    if (/[?&]lang=/.test(location.search) && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search.replace(/([?&]lang=)(ko|en)/, "$1" + L) + location.hash);
    }
    var ev;
    try { ev = new CustomEvent("fx:lang", { detail: L }); } catch (e) { ev = d.createEvent("CustomEvent"); ev.initCustomEvent("fx:lang", false, false, L); }
    window.dispatchEvent(ev);
  }
  var first = h.lang === "en" ? "en" : "ko";
  if (first === "en") apply("en");
  else { h.classList.remove("pre-en"); $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === "ko" ? "true" : "false"); }); }
  $$(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { choose(b.getAttribute("data-lang")); });
  });

  /* ---------- 나타나기 ---------- */
  (function () {
    var els = $$(".rv");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  })();
})();
