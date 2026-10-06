/* 이건상 · 읽는 구역: 나타나기, 직접 해 보기(정책 판정). 입자 없이도 돈다 */
(function () {
  "use strict";
  var d = document;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- 나타나기 ---------- */
  (function () {
    var els = $$(".rv");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- 판정기 ---------- */
  /* judge:start — agent-colleague src/policy/index.ts 의 decide()·pathVerdict() 와 같은 조건을 같은 순서로 확인한다 */
  var REASON = {
    NO_SELF_POST: "아직 이 스레드에 아무것도 올리지 않았습니다. 무엇을 하려는지 초안을 먼저 스레드에 올리고, 사람의 답을 받은 뒤 다시 시도하세요.",
    NO_HUMAN_REPLY: "마지막으로 올린 글 뒤에 사람의 답이 없습니다. 사람이 답할 때까지 기다린 뒤 다시 시도하세요.",
    ALREADY_DONE: "같은 내용으로 이미 처리했습니다. 다시 만들지 마세요.",
    PROD_WRITE: "운영 DB 는 읽기 전용입니다. 쓰기는 운영이 아닌 DB 에서만 됩니다.",
    NOT_MEASURED: "운영 DB 질의 비용을 확인하지 못했습니다. 질의를 고치거나 사람에게 알리세요.",
    HEAVY_NO_POST: "이 질의는 무겁습니다(예상 비용이 허용 상한을 넘음). 이 내용을 스레드에 올려 사람에게 알리고, 사람이 답하거나 👍 를 누른 뒤 다시 시도하세요.",
    HEAVY_NO_REPLY: "무거운 질의를 올린 뒤 사람의 답이나 👍 가 없습니다. 기다린 뒤 다시 시도하세요.",
    PATH: "저장소 폴더 밖의 경로입니다. 저장소 폴더 안의 경로만 읽을 수 있습니다."
  };
  var Q = {
    self: "봇이 이 스레드에 글을 올렸나",
    reply: "그 뒤에 사람이 글로 답했나",
    either: "그 뒤에 사람이 글이나 👍 로 답했나",
    done: "같은 호출을 실행한 기록이 있나",
    write: "쓰기 요청인가",
    measured: "예상 비용을 쟀나",
    under: "예상 비용이 상한 이하인가",
    inside: "경로가 저장소 폴더 안인가",
    none: "확인하는 조건"
  };
  function after(a, b) { return a !== null && b !== null && a > b; }
  function judge(s) {
    var tr = [];
    function c(q, a, st) { tr.push({ q: q, a: a, s: st }); }
    function out(v, key) { return { v: v, key: key, trace: tr }; }
    if (s.tool === "post") { c(Q.none, "없음", "pass"); return out("allow", "POST"); }
    if (s.tool === "read") {
      if (s.inside) { c(Q.inside, "예", "pass"); return out("allow", "READ"); }
      c(Q.inside, "아니오", "fail"); return out("deny", "PATH");
    }
    if (s.tool === "prod") {
      if (s.write) { c(Q.write, "예", "fail"); return out("deny", "PROD_WRITE"); }
      c(Q.write, "아니오", "pass");
      if (s.cost === "unknown") { c(Q.measured, "아니오", "fail"); return out("deny", "NOT_MEASURED"); }
      c(Q.measured, "예", "pass");
      if (s.cost === "under") { c(Q.under, "예", "pass"); return out("allow", "QUERY"); }
      c(Q.under, "아니오", "branch");
      if (s.self === null) { c(Q.self, "아니오", "fail"); c(Q.either, "확인 안 함", "skip"); return out("wait", "HEAVY_NO_POST"); }
      c(Q.self, "예", "pass");
      var byText = after(s.human, s.self), byReact = after(s.react, s.self);
      if (!byText && !byReact) { c(Q.either, "아니오", "fail"); return out("wait", "HEAVY_NO_REPLY"); }
      c(Q.either, byText ? "예 · 글" : "예 · 👍", "pass");
      return out("allow", "QUERY");
    }
    if (s.self === null) { c(Q.self, "아니오", "fail"); c(Q.reply, "확인 안 함", "skip"); c(Q.done, "확인 안 함", "skip"); return out("wait", "NO_SELF_POST"); }
    c(Q.self, "예", "pass");
    if (!after(s.human, s.self)) {
      c(Q.reply, after(s.react, s.self) ? "아니오 · 👍 만" : "아니오", "fail");
      c(Q.done, "확인 안 함", "skip");
      return out("wait", "NO_HUMAN_REPLY");
    }
    c(Q.reply, "예", "pass");
    if (s.done) { c(Q.done, "예", "fail"); return out("deny", "ALREADY_DONE"); }
    c(Q.done, "아니오", "pass");
    return out("allow", s.tool === "pr" ? "PR" : "TICKET");
  }
  /* judge:end */

  /* ---------- 직접 해 보기 ---------- */
  (function () {
    var root = $("#pg");
    if (!root) return;
    var track = $("#track"), rec = $("#rec"), costSeg = $("#cost-seg");
    var vword = $("#vword"), vcode = $("#vcode"), vwhyL = $("#vwhy-l"), vwhy = $("#vwhy"), trace = $("#trace"), vnote = $("#vnote"), vtool = $("#v-tool"), live = $("#pg-live"), out = $("#pg-out");
    var tgls = {};
    $$("[data-tg]", root).forEach(function (el) { tgls[el.getAttribute("data-tg")] = el; });
    var presets = $$(".presets button", root);
    var NAME = { self: "봇 글", human: "사람 글", react: "사람의 👍" };
    var TOOLN = { ticket: "티켓 만들기", pr: "코드 고쳐 PR 올리기", prod: "운영 DB 질의", post: "스레드에 글 올리기", read: "코드 읽기" };
    var LABEL = { allow: "허용", wait: "사람 답 필요", deny: "거부" };
    var RUN = {
      TICKET: "티켓을 만들고 실행 기록을 남깁니다.",
      PR: "코드를 고치고, 바뀐 것이 있으면 브랜치를 올려 PR 을 연 뒤 실행 기록을 남깁니다.",
      QUERY: "질의를 실행하고 결과를 모델에게 돌려줍니다.",
      POST: "이 스레드에 글을 올립니다.",
      READ: "파일을 읽거나 검색한 결과를 모델에게 돌려줍니다."
    };
    var PRE = [
      { order: ["human"], done: false },
      { order: ["human", "self"], done: false },
      { order: ["human", "self", "react"], done: false },
      { order: ["self", "human"], done: false },
      { order: ["self", "human"], done: true }
    ];
    var st = { tool: "ticket", order: ["self", "human"], done: false, write: false, cost: "over", inside: true };
    var lastV = "", lastKey = "";

    function pos() { var p = { self: null, human: null, react: null }; st.order.forEach(function (k, i) { p[k] = i; }); return p; }
    function uses() {
      var u = { self: false, human: false, react: false, done: false, react0: false };
      if (st.tool === "ticket" || st.tool === "pr") { u.self = u.human = u.done = true; u.react0 = true; }
      if (st.tool === "prod" && !st.write && st.cost === "over") { u.self = u.human = u.react = true; }
      return u;
    }
    function note(r, p) {
      if (st.tool === "post") return "조건 없이 허용합니다. 초안도 이 도구로 올리고, 글은 이 스레드에만 올라갑니다.";
      if (st.tool === "read") return "파일 읽기와 검색은 스레드의 순서와 상관없이 경로만 확인합니다. 셸 명령은 읽기 전용 명령만 허용합니다.";
      if (st.tool === "prod") {
        if (st.write) return "스레드에서 누가 답해도 실행하지 않습니다.";
        if (st.cost === "under") return "가벼운 조회는 사람에게 묻지 않고 바로 실행합니다.";
        if (st.cost === "unknown") return "실행 계획으로 비용을 재지 못하면 가벼운지 알 수 없어 거부합니다.";
        if (r.v === "allow" && !after(p.human, p.self)) return "👍 를 사람의 답으로 세는 곳은 무거운 운영 DB 조회뿐입니다. 이모지의 종류와 시각만 확인합니다.";
        if (st.done) return "조회는 실행 기록을 확인하지 않습니다. 사람이 다시 요청하면 같은 질의를 다시 돌려야 하기 때문입니다.";
        return "무거운 조회는 봇이 스레드에 알린 뒤 사람의 글이나 👍 가 있어야 실행합니다.";
      }
      if (r.key === "NO_HUMAN_REPLY" && after(p.react, p.self)) return "이 도구는 👍 를 답으로 세지 않습니다. 사람이 글로 답해야 합니다.";
      if (r.key === "NO_SELF_POST") return "모델은 이 이유를 읽고 초안을 스레드에 올립니다.";
      if (r.key === "ALREADY_DONE") return "같은 일을 두 번 하지 않게 막습니다. 입력이 다른 호출은 따로 판정합니다.";
      if (r.v === "allow") return "답글이 승인인지는 모델이 읽습니다. 코드는 스레드의 순서만 확인합니다.";
      return "";
    }
    function moveToEnd(k) { st.order = st.order.filter(function (x) { return x !== k; }).concat(k); }
    function move(k, idx) {
      var o = st.order.filter(function (x) { return x !== k; });
      o.splice(clamp(idx, 0, o.length), 0, k);
      st.order = o;
    }
    function buildTrack(u, focusK) {
      track.textContent = "";
      if (!st.order.length) {
        var e = d.createElement("li"); e.className = "track-empty"; e.textContent = "스레드에 글이 없습니다";
        track.appendChild(e);
        return;
      }
      st.order.forEach(function (k, i) {
        var li = d.createElement("li");
        var b = d.createElement("button");
        b.type = "button"; b.className = "tok"; b.setAttribute("data-k", k);
        var off = !u[k];
        if (off) b.classList.add("is-off");
        var dot = d.createElement("i"); dot.setAttribute("aria-hidden", "true");
        b.appendChild(dot);
        b.appendChild(d.createTextNode(NAME[k]));
        if (off) { var em = d.createElement("em"); em.textContent = k === "react" && u.react0 ? "세지 않음" : "안 봄"; b.appendChild(em); }
        b.setAttribute("aria-label", NAME[k] + ", 스레드에서 " + (i + 1) + "번째" + (off ? ", 이 도구는 보지 않음" : "") + ". 누르면 맨 뒤로 보냅니다. 화살표로 순서를 바꿉니다");
        b.addEventListener("click", function () { moveToEnd(k); render(true, k); });
        b.addEventListener("keydown", function (ev) {
          var j = st.order.indexOf(k), ok = true;
          if (ev.key === "ArrowLeft") move(k, j - 1);
          else if (ev.key === "ArrowRight") move(k, j + 1);
          else if (ev.key === "Home") move(k, 0);
          else if (ev.key === "End") move(k, st.order.length);
          else ok = false;
          if (ok) { ev.preventDefault(); render(true, k); }
        });
        li.appendChild(b);
        track.appendChild(li);
        if (k === focusK) { b.classList.add("pop"); setTimeout(function () { b.classList.remove("pop"); b.focus({ preventScroll: true }); }, 10); }
      });
    }
    function render(changed, focusK) {
      var p = pos(), u = uses();
      buildTrack(u, focusK);
      ["self", "human", "react"].forEach(function (k) { tgls[k].setAttribute("aria-pressed", p[k] !== null ? "true" : "false"); });
      rec.setAttribute("aria-checked", st.done ? "true" : "false");
      rec.classList.toggle("is-off", !u.done);
      var r = judge({ tool: st.tool, self: p.self, human: p.human, react: p.react, done: st.done, write: st.write, cost: st.cost, inside: st.inside });
      out.setAttribute("data-v", r.v);
      vtool.textContent = TOOLN[st.tool] + (st.tool === "prod" ? (st.write ? " · 쓰기" : " · 읽기") : "");
      if (r.v !== lastV) {
        vword.textContent = "";
        var sp = d.createElement("span"); sp.textContent = LABEL[r.v];
        if (lastV) sp.className = "in";
        vword.appendChild(sp);
        lastV = r.v;
      }
      vcode.textContent = r.v === "allow" ? "allow" : "deny";
      if (r.v === "allow") { vwhyL.textContent = "실행하면"; vwhy.textContent = RUN[r.key]; }
      else { vwhyL.textContent = "모델에게 돌려주는 이유(요지)"; vwhy.textContent = REASON[r.key]; }
      trace.textContent = "";
      r.trace.forEach(function (x) {
        var li = d.createElement("li"); li.setAttribute("data-s", x.s);
        var q = d.createElement("span"); q.textContent = x.q;
        var a = d.createElement("span"); a.className = "a"; a.textContent = x.a;
        var s = d.createElement("i"); s.className = "s"; s.setAttribute("aria-hidden", "true");
        li.appendChild(q); li.appendChild(a); li.appendChild(s); trace.appendChild(li);
      });
      vnote.textContent = note(r, p);
      presets.forEach(function (b, i) {
        var pr = PRE[i], same = (st.tool === "ticket" || st.tool === "pr") && pr.done === st.done && pr.order.join() === st.order.join();
        b.setAttribute("aria-pressed", same ? "true" : "false");
      });
      var key = r.v + r.key;
      if (changed && key !== lastKey) live.textContent = TOOLN[st.tool] + ": " + LABEL[r.v] + ". " + (r.v === "allow" ? RUN[r.key] : REASON[r.key]);
      lastKey = key;
    }
    Object.keys(tgls).forEach(function (k) {
      tgls[k].addEventListener("click", function () {
        if (st.order.indexOf(k) >= 0) st.order = st.order.filter(function (x) { return x !== k; });
        else st.order = st.order.concat(k);
        render(true);
      });
    });
    rec.addEventListener("click", function () { st.done = !st.done; render(true); });
    presets.forEach(function (b, i) {
      b.addEventListener("click", function () {
        if (st.tool !== "ticket" && st.tool !== "pr") { st.tool = "ticket"; $("#t-ticket").checked = true; $$(".sub", root).forEach(function (s) { s.hidden = true; }); }
        st.order = PRE[i].order.slice(); st.done = PRE[i].done; render(true);
      });
    });
    $$("input[name=tool]", root).forEach(function (r) {
      r.addEventListener("change", function () {
        st.tool = r.value;
        $$(".sub", root).forEach(function (s) { s.hidden = s.getAttribute("data-for") !== st.tool; });
        render(true);
      });
    });
    $$("input[name=kind]", root).forEach(function (r) { r.addEventListener("change", function () { st.write = r.value === "write"; costSeg.hidden = st.write; render(true); }); });
    $$("input[name=cost]", root).forEach(function (r) { r.addEventListener("change", function () { st.cost = r.value; render(true); }); });
    $$("input[name=path]", root).forEach(function (r) { r.addEventListener("change", function () { st.inside = r.value === "in"; render(true); }); });
    render(false);
  })();
})();
