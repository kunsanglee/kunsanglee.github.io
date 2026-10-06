/* 이건상 소개 페이지 — 입자 장면 · 스크롤 장면 · 정책 판정 놀이. 외부 라이브러리 없이 WebGL(안 되면 2D 캔버스)로 그린다. */
(function () {
  "use strict";
  window.__e = 1;

  var d = document, R = d.documentElement;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function eio(t) { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function hms(s) { s = Math.round(s); return two(Math.floor(s / 3600) % 24) + ":" + two(Math.floor(s / 60) % 60) + ":" + two(s % 60); }
  function setTxt(el, s) {
    if (!el) return;
    el.textContent = "";
    if (s) { var sp = d.createElement("span"); sp.className = eyeOn ? "rx vx" : "rx"; sp.textContent = s; el.appendChild(sp); }
  }
  function mid(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  var VW = innerWidth, VH = innerHeight;
  var SMALL = VW < 760;
  var COARSE = matchMedia("(hover: none)").matches;

  /* 주별 질문 스레드 수. drafts/D 와 같은 값이고 합은 235 */
  var WEEKS = [16, 6, 3, 2, 5, 1, 7, 3, 2, 33, 27, 26, 37, 35, 26, 6];
  var WEEK_LABEL = ["6/8", "6/15", "6/22", "6/29", "7/6", "7/13", "7/20", "7/27", "8/3", "8/10", "8/17", "8/24", "8/31", "9/7", "9/14", "9/21"];
  var PARTIAL = 15, PEAK = 12;

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

  var LABEL = { allow: "허용", wait: "사람 답 필요", deny: "거부" };
  var TOOLN = { ticket: "티켓 만들기", pr: "코드 고쳐 PR 올리기", prod: "운영 DB 질의", post: "스레드에 글 올리기", read: "코드 읽기" };
  var RUN = {
    TICKET: "티켓을 만들고 실행 기록을 남깁니다.",
    PR: "코드를 고치고, 바뀐 것이 있으면 브랜치를 올려 PR 을 연 뒤 실행 기록을 남깁니다.",
    QUERY: "질의를 실행하고 결과를 모델에게 돌려줍니다.",
    POST: "이 스레드에 글을 올립니다.",
    READ: "파일을 읽거나 검색한 결과를 모델에게 돌려줍니다."
  };
  var SHORT = {
    NO_SELF_POST: "초안을 먼저 스레드에 올려야 합니다.",
    NO_HUMAN_REPLY: "봇 글 뒤에 사람의 글이 있어야 합니다.",
    ALREADY_DONE: "같은 호출을 이미 실행했습니다.",
    PROD_WRITE: "운영 DB 는 읽기 전용입니다.",
    NOT_MEASURED: "예상 비용을 재지 못했습니다.",
    HEAVY_NO_POST: "무거운 질의는 스레드에 먼저 알려야 합니다.",
    HEAVY_NO_REPLY: "알린 뒤 사람의 글이나 👍 가 있어야 합니다.",
    PATH: "저장소 폴더 밖의 경로입니다."
  };

  /* ---------- 정책 함수가 보는 화면: 본문 글자를 가릴 수 있게 감싼다 ---------- */
  (function wrapRx(root) {
    if (!root) return;
    var tw = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest("[data-fact],.sr,script,style,svg,.no-js-only,.rx,.odo,.eye-bar,table")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var list = [];
    while (tw.nextNode()) list.push(tw.currentNode);
    list.forEach(function (n) { var sp = d.createElement("span"); sp.className = "rx"; n.parentNode.insertBefore(sp, n); sp.appendChild(n); });
  })($("#main"));

  /* ---------- 렌더러 ---------- */
  var cv = $("#fx");
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var NG = SMALL ? 1500 : 2900, NT = 235, N = NG + NT;
  var gl = null, x2 = null, prog = null, vbo = null, buf = new Float32Array(N * 8);

  function initGL() {
    var g = null;
    try { g = cv.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false }); } catch (e) { g = null; }
    if (!g) return null;
    var vs = "attribute vec2 p;attribute float s;attribute float h;attribute vec4 c;uniform vec2 res;uniform float dpr;varying vec4 vc;varying float vh;varying float vz;" +
      "void main(){vec2 q=p/res*2.0-1.0;gl_Position=vec4(q.x,-q.y,0.0,1.0);float z=s*dpr*mix(2.2,1.0,h);gl_PointSize=max(z,1.0);vc=c;vh=h;vz=max(z,1.0);}";
    var fs = "precision mediump float;varying vec4 vc;varying float vh;varying float vz;" +
      "void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=length(q);if(r>1.0)discard;float glow=exp(-r*r*3.4);float edge=1.0-smoothstep(1.0-2.2/vz,1.0,r);float a=mix(glow,edge,vh)*vc.a;gl_FragColor=vec4(vc.rgb*a,a);}";
    function sh(t, src) { var o = g.createShader(t); g.shaderSource(o, src); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; }
    try {
      var p = g.createProgram();
      g.attachShader(p, sh(g.VERTEX_SHADER, vs)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error("link");
      g.useProgram(p);
      vbo = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, vbo); g.bufferData(g.ARRAY_BUFFER, buf.byteLength, g.DYNAMIC_DRAW);
      var st = 32;
      [["p", 2, 0], ["s", 1, 8], ["h", 1, 12], ["c", 4, 16]].forEach(function (a) { var l = g.getAttribLocation(p, a[0]); g.enableVertexAttribArray(l); g.vertexAttribPointer(l, a[1], g.FLOAT, false, st, a[2]); });
      prog = { res: g.getUniformLocation(p, "res"), dpr: g.getUniformLocation(p, "dpr") };
      g.enable(g.BLEND); g.disable(g.DEPTH_TEST); g.clearColor(0, 0, 0, 0);
      return g;
    } catch (e) { return null; }
  }
  gl = initGL();
  if (!gl) { try { x2 = cv.getContext("2d"); } catch (e) { x2 = null; } }
  var FX = !!(gl || x2);
  if (FX) R.classList.add("fx");

  function sizeCanvas(force) {
    var w = innerWidth, h = innerHeight;
    if (!force && w === VW && Math.abs(h - VH) < 140 && cv.width) { VH = h; return; }
    VW = w; VH = h;
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    if (gl) { gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(prog.res, w, h); gl.uniform1f(prog.dpr, DPR); }
  }

  /* ---------- 입자 상태 ---------- */
  var px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  var tx = new Float32Array(N), ty = new Float32Array(N), ltx = new Float32Array(N), lty = new Float32Array(N);
  var ps = new Float32Array(N), ts = new Float32Array(N), pa = new Float32Array(N), ta = new Float32Array(N);
  var cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), tr = new Float32Array(N), tg = new Float32Array(N), tb = new Float32Array(N);
  var hard = new Float32Array(N), kk = new Float32Array(N), role = new Uint8Array(N), roleL = new Uint8Array(N);
  var du = new Float32Array(N), dv = new Float32Array(N), dz = new Float32Array(N), ph = new Float32Array(N), kf = new Float32Array(N), tint = new Uint8Array(N);
  var ovr = new Uint8Array(NG), born = new Float32Array(NG);
  var R0 = rng(20260616);
  for (var i0 = 0; i0 < N; i0++) {
    du[i0] = R0(); dv[i0] = R0(); dz[i0] = .25 + .75 * R0(); ph[i0] = R0() * 6.2832; kf[i0] = .6 + .8 * R0();
    var q0 = R0(); tint[i0] = q0 < .13 ? 1 : q0 < .24 ? 2 : 0;
    px[i0] = R0() * VW; py[i0] = R0() * VH; ps[i0] = 1; pa[i0] = 0; cr[i0] = cg[i0] = cb[i0] = .9;
  }
  var wk = new Uint8Array(NT), wi = new Uint8Array(NT), oR = new Float32Array(NT), oA = new Float32Array(NT), oW = new Float32Array(NT);
  (function () {
    var j = 0;
    WEEKS.forEach(function (n, w) { for (var q = 0; q < n; q++) { wk[j] = w; wi[j] = q; j++; } });
    for (j = 0; j < NT; j++) { oR[j] = .72 + .62 * R0(); oA[j] = R0() * 6.2832; oW[j] = .16 / oR[j]; }
  })();
  var PEAK0 = WEEKS.slice(0, PEAK).reduce(function (a, b) { return a + b; }, 0);

  var C = { warm: hex("#ffcf7a"), ink: hex("#ecebe6"), model: hex("#a891ff"), policy: hex("#36d7ae"), human: hex("#f4ac3f"), bot: hex("#cfd6e3"), gray: hex("#9aa3b5") };
  var DUST = 1, FORM = 2, STREAM = 3, ORBIT = 4, MEAN = 5, DOT = 6, FIELD = 7, HEAP = 8, RING = 9;

  function tgt(i, x, y, s, a, c, h, k, rl) {
    tx[i] = x; ty[i] = y; ts[i] = s; ta[i] = a; tr[i] = c[0]; tg[i] = c[1]; tb[i] = c[2]; hard[i] = h; kk[i] = k; role[i] = rl;
  }

  /* ---------- 글자 모양 뽑기 ---------- */
  var fontVer = 0, glyphReady = false, gcache = {};
  function baseline(el) {
    var pr = el.querySelector(".bl");
    if (!pr) { pr = d.createElement("span"); pr.className = "bl"; pr.setAttribute("aria-hidden", "true"); pr.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; el.appendChild(pr); }
    return pr.getBoundingClientRect().bottom;
  }
  function shuffle(n, rr) { var a = new Int32Array(n); for (var i = 0; i < n; i++) a[i] = i; for (i = n - 1; i > 0; i--) { var j = Math.floor(rr() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sample(el, seed, want235) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    var base = baseline(el) - r.top, pad = Math.ceil(fs * .12);
    var w = Math.ceil(r.width) + pad * 2, h = Math.ceil(r.height) + pad * 2;
    var c = d.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.font = cs.fontWeight + " " + fs + "px " + cs.fontFamily;
    try { if ("letterSpacing" in x) x.letterSpacing = cs.letterSpacing; } catch (e) { }
    x.fillStyle = "#fff"; x.textBaseline = "alphabetic";
    x.fillText(el.textContent.trim(), pad, pad + base);
    var data = x.getImageData(0, 0, w, h).data, cnt = 0, xx, yy;
    for (yy = 0; yy < h; yy += 2) for (xx = 0; xx < w; xx += 2) if (data[(yy * w + xx) * 4 + 3] > 140) cnt++;
    if (!cnt) return null;
    var step = Math.max(1.4, Math.sqrt(cnt * 4 / NG) * .92), rr = rng(seed), cand = [];
    var bx = [1e9, 1e9, -1e9, -1e9];
    for (yy = step / 2; yy < h; yy += step) for (xx = step / 2; xx < w; xx += step) {
      var jx = xx + (rr() - .5) * step * .9, jy = yy + (rr() - .5) * step * .9, ix = jx | 0, iy = jy | 0;
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      if (data[(iy * w + ix) * 4 + 3] > 140) {
        var X = jx - pad, Y = jy - pad; cand.push(X, Y);
        if (X < bx[0]) bx[0] = X; if (Y < bx[1]) bx[1] = Y; if (X > bx[2]) bx[2] = X; if (Y > bx[3]) bx[3] = Y;
      }
    }
    var n = cand.length / 2, perm = shuffle(n, rr), pts = new Float32Array(NG * 2);
    for (var i = 0; i < NG; i++) {
      var qn = perm[i % n], extra = i >= n;
      pts[2 * i] = cand[2 * qn] + (extra ? (rr() - .5) * step * .8 : 0);
      pts[2 * i + 1] = cand[2 * qn + 1] + (extra ? (rr() - .5) * step * .8 : 0);
    }
    var g = { pts: pts, w: r.width, h: r.height, step: step, bx: bx, ver: fontVer };
    if (want235) g.spread = spread(cand, n, step, NT, seed + 1);
    return g;
  }
  function spread(cand, n, step, k, seed) {
    var rr = rng(seed), order = shuffle(n, rr), out = [], dmin = Math.sqrt(n * step * step / k) * .95;
    while (out.length < k * 2 && dmin > .5) {
      for (var a = 0; a < n && out.length < k * 2; a++) {
        var q = order[a], x = cand[2 * q], y = cand[2 * q + 1], ok = true;
        for (var b = 0; b < out.length; b += 2) { var dx = out[b] - x, dy = out[b + 1] - y; if (dx * dx + dy * dy < dmin * dmin) { ok = false; break; } }
        if (ok) out.push(x, y);
      }
      dmin *= .82;
    }
    while (out.length < k * 2) out.push(cand[0], cand[1]);
    return out;
  }
  function glyph(el, key) {
    if (!el) return null;
    var r = el.getBoundingClientRect(), g = gcache[key];
    if (!g || g.ver !== fontVer || Math.abs(g.w - r.width) > 1.5 || Math.abs(g.h - r.height) > 1.5) { g = gcache[key] = sample(el, key === "96" ? 11 : 23, key === "235"); }
    return g ? { g: g, r: r } : null;
  }
  var BARW = [1, .78, .94, .55];
  function bar(g, i, out) {
    var b = g.bx, bw = b[2] - b[0], bh = b[3] - b[1], rows = 4, row = i % rows;
    out[0] = b[0] + ((i * .618034) % 1) * bw * BARW[row];
    out[1] = b[1] + bh * (row + .5) / rows + (dv[i] - .5) * bh / rows * .46;
  }
  if (d.fonts && d.fonts.load) {
    Promise.all([
      d.fonts.load('860 200px "Pretendard Variable"', "0123456789"),
      d.fonts.load('800 40px "Pretendard Variable"', "초건주")
    ]).then(function () { fontVer++; glyphReady = true; }, function () { glyphReady = true; });
    d.fonts.ready.then(function () { fontVer++; });
  }
  setTimeout(function () { glyphReady = true; }, 1600);

  /* ---------- 장면별 목표 ---------- */
  var el96 = $("#pt-96"), el235 = $("#pt-235"), weeksEl = $("#a-weeks"), oneEl = $("#a-one");
  var lineEl = $("#a-line"), modelDot = $("#a-model .g-lab i"), orbEl = $("#a-orb");
  var tmp2 = [0, 0];
  var GLYPH_S = SMALL ? 1.7 : 2.1;

  function dust(i, t, sy, am) {
    var z = dz[i], span = VH * 1.3;
    var raw = dv[i] * span - sy * .16 * z, w = Math.floor(raw / span);
    var y = raw - w * span - VH * .15 + Math.cos(t * .21 + ph[i] * 1.7) * 10 * z;
    var x = du[i] * VW + Math.sin(t * (.12 + .1 * z) + ph[i]) * 22 * z;
    tgt(i, x, y, (SMALL ? .9 : 1.1) + 1.5 * z, (.1 + .26 * z) * am, tint[i] === 1 ? C.model : tint[i] === 2 ? C.policy : C.gray, 0, 16 * kf[i], DUST);
  }
  function field(j, t, sy, am) {
    var i = NG + j, z = dz[i], span = VH * 1.25;
    var raw = dv[i] * span - sy * .3 * z, w = Math.floor(raw / span);
    var y = raw - w * span - VH * .12 + Math.cos(t * .3 + ph[i]) * 8;
    var x = du[i] * VW + Math.sin(t * .17 + ph[i]) * 16;
    tgt(i, x, y, (SMALL ? 2.1 : 2.6) * (.7 + .5 * z), (.16 + .2 * z) * am, C.ink, .75, 12 * kf[i], FIELD);
  }
  function allDust(t, sy, am, from) { for (var i = from || 0; i < NG; i++) dust(i, t, sy, am); }
  function allField(t, sy, am) { for (var j = 0; j < NT; j++) field(j, t, sy, am); }

  function sceneHero(t, sy) {
    var o = glyphReady ? glyph(el96, "96") : null;
    if (o) {
      var g = o.g, r = o.r;
      for (var i = 0; i < NG; i++) {
        var x, y;
        if (eyeOn) { bar(g, i, tmp2); x = r.left + tmp2[0]; y = r.top + tmp2[1]; }
        else { x = r.left + g.pts[2 * i]; y = r.top + g.pts[2 * i + 1]; }
        x += Math.sin(t * 1.3 + ph[i]) * .7; y += Math.cos(t * 1.1 + ph[i]) * .7;
        tgt(i, x, y, GLYPH_S * (.75 + .5 * dz[i]), .82, C.warm, 0, 24 * kf[i], FORM);
      }
    } else allDust(t, sy, .9);
    var rr = el96.getBoundingClientRect();
    var RX = Math.min(Math.max(rr.width * .82, 180), VW * .46), RY = RX * .34, tilt = -.22, ct = Math.cos(tilt), st = Math.sin(tilt);
    var cx = clamp(rr.left + rr.width * .5, RX * .92, VW - RX * .92), cy = rr.top + rr.height * .56;
    for (var j = 0; j < NT; j++) {
      var ang = oA[j] + t * oW[j], ex = Math.cos(ang) * RX * oR[j], ey = Math.sin(ang) * RY * oR[j], dep = (Math.sin(ang) + 1) / 2;
      tgt(NG + j, cx + ex * ct - ey * st, cy + ex * st + ey * ct, (SMALL ? 1.8 : 2.2) + 2.4 * dep, .2 + .72 * dep, C.ink, .8, 14 * kf[NG + j], DOT);
    }
  }
  function sceneT235(t, sy) {
    var o = glyphReady ? glyph(el235, "235") : null;
    if (!o) { allDust(t, sy, .8); allField(t, sy, 1); return; }
    var g = o.g, r = o.r, i;
    for (i = 0; i < NG; i++) {
      var x, y;
      if (eyeOn) { bar(g, i, tmp2); x = r.left + tmp2[0]; y = r.top + tmp2[1]; }
      else { x = r.left + g.pts[2 * i]; y = r.top + g.pts[2 * i + 1]; }
      tgt(i, x + Math.sin(t + ph[i]) * .6, y + Math.cos(t * 1.2 + ph[i]) * .6, GLYPH_S * (.7 + .4 * dz[i]), .36, C.ink, 0, 22 * kf[i], FORM);
    }
    var sp = g.spread;
    for (var j = 0; j < NT; j++) {
      tgt(NG + j, r.left + sp[2 * j] + Math.sin(t * .8 + ph[NG + j]) * .8, r.top + sp[2 * j + 1], SMALL ? 3.4 : 4.6, .96, C.ink, 1, 20 * kf[NG + j], DOT);
    }
  }
  var hoverCol = -1;
  function weekGeo() {
    var r = weeksEl.getBoundingClientRect(), W = r.width, Hb = r.height - 34 - 40, colW = W / 16, best = null;
    for (var k = 1; k <= 3; k++) { var rows = Math.ceil(37 / k), rr = Math.min(colW * .84 / (2 * k), Hb / (2 * rows * 1.1)); if (!best || rr > best.r) best = { k: k, r: rr }; }
    best.r = Math.min(best.r, SMALL ? 6 : 9.5);
    return { left: r.left, bottom: r.bottom - 34 - 6, colW: colW, k: best.k, r: best.r };
  }
  function sceneWeeks(t, sy) {
    allDust(t, sy, .6);
    var L = weekGeo(), gap = L.r * 2 * 1.1;
    for (var j = 0; j < NT; j++) {
      var w = wk[j], q = wi[j], row = Math.floor(q / L.k), cp = q % L.k;
      var hot = w === hoverCol, base = w === PARTIAL ? .5 : .92;
      tgt(NG + j, L.left + (w + .5) * L.colW + (cp - (L.k - 1) / 2) * gap, L.bottom - L.r - row * gap, L.r * 2 * (hot ? 1.04 : .9), hot ? 1 : (hoverCol >= 0 ? base * .5 : base), hot ? C.warm : C.ink, 1, 16 * kf[NG + j], DOT);
    }
  }
  var NODES = [[.22, "human"], [.40, "bot"], [.58, "human"], [.76, "bot"]];
  function sceneOne(t, sy) {
    var r = oneEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var lx = r.left + r.width * .30, ly0 = r.top + r.height * .08, ly1 = r.top + r.height * .92;
    var NR = SMALL ? 460 : 820, NL = SMALL ? 130 : 220, rx = Math.min(r.width * .66, VW / 2 - 16), ry = r.height * .63, i;
    for (i = 0; i < NG; i++) {
      if (i < NR) {
        var a = (i / NR) * 6.2832 + t * .1, wob = (dz[i] - .62) * 12 + Math.sin(t * 1.4 + ph[i]) * 2;
        tgt(i, cx + Math.cos(a) * (rx + wob), cy + Math.sin(a) * (ry + wob), 1.4 + 1.2 * dz[i], .62, C.model, 0, 26 * kf[i], RING);
      } else if (i < NR + NL) {
        var u = (i - NR) / NL, fl = i % 5 === 0;
        if (fl) { var uu = (u * 3.7 + t * .09) % 1; tgt(i, lx + (dz[i] - .5) * 3, lerp(ly0, ly1, uu), 2 + 1.2 * dz[i], .85 * Math.sin(uu * Math.PI), C.model, 0, 90, STREAM); }
        else tgt(i, lx + (dz[i] - .6) * 1.6, lerp(ly0, ly1, u), 1.3 + .6 * dz[i], .5, C.gray, 0, 26 * kf[i], FORM);
      } else dust(i, t, sy, .5);
    }
    for (var j = 0; j < NT; j++) {
      var k = j - PEAK0;
      if (k >= 0 && k < 4) {
        tgt(NG + j, lx, r.top + r.height * NODES[k][0], SMALL ? 12 : 14, 1, NODES[k][1] === "human" ? C.human : C.bot, 1, 18, DOT);
      } else {
        var ang = oA[j] + t * .05, rad = 1.12 + .5 * (oR[j] - .72) / .62;
        tgt(NG + j, cx + Math.cos(ang) * rx * rad * 1.1, cy + Math.sin(ang) * ry * rad, SMALL ? 1.8 : 2.2, .22, C.ink, .7, 10 * kf[NG + j], DOT);
      }
    }
  }
  function sceneGate(t, sy) {
    var ln = lineEl.getBoundingClientRect(), vert = ln.height > ln.width, md = mid(modelDot);
    var NB = SMALL ? 170 : 300, NO = SMALL ? 110 : 170;
    for (var i = 0; i < NG; i++) {
      if (ovr[i] === 1) {
        var a1 = ph[i] + t * (1.5 + dz[i]), r1 = 10 + 26 * dz[i], ag = t - born[i];
        tgt(i, md.x + Math.cos(a1) * r1, md.y + Math.sin(a1) * r1 * .8, 1.6 + 1.4 * dz[i], ag < 1.3 ? .8 : Math.max(.14, .8 - (ag - 1.3) * .5), C.model, 0, 7 + 4 * kf[i], MEAN);
      } else if (i < NB) {
        var s = (dv[i] + t * (.07 + .1 * dz[i])) % 1, wig = Math.sin(t * 2.2 + ph[i]) * 2.4 * dz[i], fade = Math.sin(s * Math.PI);
        if (vert) tgt(i, ln.left + ln.width / 2 + wig, ln.top + s * ln.height, 1.2 + 1.3 * dz[i], .25 + .6 * fade, C.policy, 0, 70, STREAM);
        else tgt(i, ln.left + s * ln.width, ln.top + ln.height / 2 + wig, 1.2 + 1.3 * dz[i], .25 + .6 * fade, C.policy, 0, 70, STREAM);
      } else if (i < NB + NO) {
        var a2 = ph[i] + t * (1.1 + 1.5 * dz[i]) * (i % 2 ? 1 : -1), r2 = 6 + 22 * dz[i];
        tgt(i, md.x + Math.cos(a2) * r2, md.y + Math.sin(a2) * r2 * .8, 1 + dz[i], .4, C.model, 0, 50, ORBIT);
      } else dust(i, t, sy, .45);
    }
    allField(t, sy, .55);
  }
  function sceneTry(t, sy) {
    var o = mid(orbEl), NO = SMALL ? 210 : 320;
    for (var i = 0; i < NG; i++) {
      if (ovr[i] === 2) {
        var a1 = ph[i] + t * (1.3 + dz[i]), r1 = 12 + 30 * dz[i], ag = t - born[i];
        tgt(i, o.x + Math.cos(a1) * r1, o.y + Math.sin(a1) * r1 * .72, 1.6 + 1.4 * dz[i], ag < 1.3 ? .8 : Math.max(.16, .8 - (ag - 1.3) * .5), C.model, 0, 6 + 4 * kf[i], MEAN);
      } else if (i < NO) {
        var a2 = ph[i] + t * (.8 + 1.7 * (1 - dz[i])), r2 = 6 + 44 * dz[i] * dz[i];
        tgt(i, o.x + Math.cos(a2) * r2, o.y + Math.sin(a2) * r2 * .72, 1 + 1.5 * dz[i], .58, C.model, 0, 40, ORBIT);
      } else dust(i, t, sy, .45);
    }
    allField(t, sy, .55);
  }

  /* 글의 뜻이 모델 쪽으로 빨려 들어가는 입자 */
  var emitAt = 600, lastEmit = -9;
  function emit(kind, rect, n) {
    if (!FX || !rect || rect.width < 2) return;
    var span = NG - 600;
    for (var q = 0; q < n; q++) {
      var i = 600 + (emitAt++ % span);
      ovr[i] = kind; born[i] = clock;
      px[i] = rect.left + Math.random() * rect.width; py[i] = rect.top + Math.random() * rect.height;
      vx[i] = (Math.random() - .5) * 120; vy[i] = -40 - Math.random() * 160;
      pa[i] = 1; ps[i] = 2.4; cr[i] = C.model[0]; cg[i] = C.model[1]; cb[i] = C.model[2];
      ltx[i] = px[i]; lty[i] = py[i]; roleL[i] = MEAN;
    }
    lastEmit = clock;
  }

  /* ---------- 포인터 · 클릭 파동 ---------- */
  var PTR = { x: -9999, y: -9999, on: false, down: false, r: SMALL ? 84 : 116, f: 5200 };
  var WAVES = [];
  addEventListener("pointermove", function (e) {
    PTR.x = e.clientX; PTR.y = e.clientY;
    PTR.on = e.pointerType === "mouse" || PTR.down;
  }, { passive: true });
  addEventListener("pointerdown", function (e) { PTR.down = true; PTR.x = e.clientX; PTR.y = e.clientY; PTR.on = true; }, { passive: true });
  function ptrUp(e) { PTR.down = false; if (e.pointerType !== "mouse") PTR.on = false; }
  addEventListener("pointerup", ptrUp, { passive: true });
  addEventListener("pointercancel", ptrUp, { passive: true });
  R.addEventListener("mouseleave", function () { PTR.on = false; });
  function ripple(x, y) {
    var el = d.createElement("span"); el.className = "ripple"; el.setAttribute("aria-hidden", "true");
    el.style.left = x + "px"; el.style.top = y + "px";
    d.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }
  function wave(x, y) { WAVES.push({ x: x, y: y, t0: clock }); if (WAVES.length > 4) WAVES.shift(); ripple(x, y); }
  d.addEventListener("click", function (e) {
    if (!FX) return;
    if (e.target.closest("a,button,input,label,textarea,select,[role=slider],.tok,.heap,.t-track,.eye-bar,.nav,.t-card,.t-box")) return;
    wave(e.clientX, e.clientY);
  });

  /* ---------- 적분 · 그리기 ---------- */
  var eyeOn = false, eyeK = 0, clock = 0, dotPush = .55;
  function integrate(dt) {
    var mOn = PTR.on, mx = PTR.x, my = PTR.y, Rr = PTR.r, R2 = Rr * Rr, F = PTR.f;
    var nw = 0;
    for (var w = 0; w < WAVES.length; w++) if (clock - WAVES[w].t0 < 1.2) WAVES[nw++] = WAVES[w];
    WAVES.length = nw;
    var e = 1 - Math.exp(-dt * 6.5), ek = eyeK * .88;
    for (var i = 0; i < N; i++) {
      var rl = role[i];
      if (rl !== HEAP) {
        if ((rl === DUST || rl === FIELD || rl === STREAM) && roleL[i] === rl) {
          var jx = tx[i] - ltx[i], jy = ty[i] - lty[i];
          if (jx * jx + jy * jy > 160 * 160) { px[i] += jx; py[i] += jy; }
        }
        var k = kk[i], c = 2 * Math.sqrt(k) * .8;
        var ax = (tx[i] - px[i]) * k - vx[i] * c, ay = (ty[i] - py[i]) * k - vy[i] * c;
        if (mOn) {
          var dx = px[i] - mx, dy = py[i] - my, q = dx * dx + dy * dy;
          if (q < R2 && q > .01 && (i < NG || dotPush > 0)) { var dd = Math.sqrt(q), f = 1 - dd / Rr; f = f * f * F * (i < NG ? 1 : dotPush); ax += (dx * f - dy * f * .4) / dd; ay += (dy * f + dx * f * .4) / dd; }
        }
        for (w = 0; w < nw; w++) {
          var W = WAVES[w], age = clock - W.t0, rad = age * 880, ex = px[i] - W.x, ey = py[i] - W.y, de = Math.sqrt(ex * ex + ey * ey) + .001, off = Math.abs(de - rad);
          if (off < 64) { var fw = (1 - off / 64) * (1 - age / 1.2) * 15000 * (i < NG ? 1 : .6); ax += ex / de * fw; ay += ey / de * fw; }
        }
        vx[i] += ax * dt; vy[i] += ay * dt; px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      }
      ltx[i] = tx[i]; lty[i] = ty[i]; roleL[i] = rl;
      var r_ = tr[i], g_ = tg[i], b_ = tb[i];
      if (ek > .001) { r_ += (C.policy[0] - r_) * ek; g_ += (C.policy[1] - g_) * ek; b_ += (C.policy[2] - b_) * ek; }
      ps[i] += (ts[i] - ps[i]) * e; pa[i] += (ta[i] - pa[i]) * e;
      cr[i] += (r_ - cr[i]) * e; cg[i] += (g_ - cg[i]) * e; cb[i] += (b_ - cb[i]) * e;
    }
  }
  function draw() {
    for (var i = 0, o = 0; i < N; i++, o += 8) {
      buf[o] = px[i]; buf[o + 1] = py[i]; buf[o + 2] = ps[i]; buf[o + 3] = hard[i];
      buf[o + 4] = cr[i]; buf[o + 5] = cg[i]; buf[o + 6] = cb[i]; buf[o + 7] = pa[i];
    }
    if (gl) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf);
      gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.POINTS, 0, NG);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.POINTS, NG, NT);
    } else if (x2) {
      x2.setTransform(DPR, 0, 0, DPR, 0, 0); x2.clearRect(0, 0, VW, VH);
      x2.globalCompositeOperation = "lighter";
      for (i = 0; i < N; i++) {
        if (i === NG) x2.globalCompositeOperation = "source-over";
        if (pa[i] < .01) continue;
        x2.globalAlpha = Math.min(1, pa[i]);
        x2.fillStyle = "rgb(" + (cr[i] * 255 | 0) + "," + (cg[i] * 255 | 0) + "," + (cb[i] * 255 | 0) + ")";
        var s = ps[i];
        if (i < NG) x2.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
        else { x2.beginPath(); x2.arc(px[i], py[i], s / 2, 0, 6.2832); x2.fill(); }
      }
      x2.globalAlpha = 1;
    }
  }

  /* ---------- 235 → 주별 → 스레드 하나 ---------- */
  var TH = { track: $("#th-track"), phases: $$("#threads .phase"), t235: $("#t235"), weeks: weeksEl, one: oneEl, vis: $("#th-vis"), ph: -1 };
  function setVt() {
    var on = TH.phases[Math.max(0, TH.ph)];
    if (on && TH.vis) TH.vis.style.setProperty("--vt", (60 + 14 + on.offsetHeight + 18) + "px");
  }
  function thUpdate(p) {
    var ph = p < .3 ? 0 : p < .66 ? 1 : 2;
    if (ph === TH.ph) return;
    TH.ph = ph;
    TH.phases.forEach(function (el, i) { el.classList.toggle("on", i === ph); el.classList.toggle("gone", i < ph); });
    TH.t235.classList.toggle("off", ph > 0);
    TH.weeks.classList.toggle("on", ph === 1);
    TH.one.classList.toggle("on", ph === 2);
    setVt();
  }
  (function weekHit() {
    var hit = $("#wk-hit"), n = $("#wk-n"), k = $("#wk-k");
    if (!hit) return;
    var cur = PEAK;
    function show(c, fromUser) {
      cur = c;
      setTxt(n, WEEKS[c] + "건");
      setTxt(k, WEEK_LABEL[c] + " 주" + (c === PARTIAL ? " · 이틀치" : "") + (c === PEAK ? " · 가장 많았던 주" : ""));
      hit.setAttribute("aria-valuenow", String(c + 1));
      hit.setAttribute("aria-valuetext", WEEK_LABEL[c] + " 주, " + WEEKS[c] + "건" + (c === PARTIAL ? ", 이틀치" : ""));
      hoverCol = fromUser ? c : -1;
    }
    function at(e) { var r = hit.getBoundingClientRect(); return clamp(Math.floor((e.clientX - r.left) / r.width * 16), 0, 15); }
    hit.addEventListener("pointermove", function (e) { show(at(e), true); });
    hit.addEventListener("pointerdown", function (e) { show(at(e), true); });
    hit.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") show(PEAK, false); });
    hit.addEventListener("keydown", function (e) {
      var c = cur;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") c--; else if (e.key === "ArrowRight" || e.key === "ArrowUp") c++;
      else if (e.key === "Home") c = 0; else if (e.key === "End") c = 15; else return;
      e.preventDefault(); show(clamp(c, 0, 15), true);
    });
    hit.addEventListener("blur", function () { show(PEAK, false); });
  })();

  /* ---------- 재현한 예시: 스크롤 진행에 따라 ---------- */
  var G = {
    track: $("#g-track"), stage: $("#gate-stage"), steps: $$("#g-steps li"), list: $("#g-list"), view: $("#g-view"),
    items: $$("#g-list > li"), badges: $$("#g-list .badge"), rows: {}, stamp: $("#g-stamp"), why: $("#g-why"), calln: $("#g-calln"),
    rec: $("#g-rec"), scan: $("#g-scan"), fcS: $("#fc-self"), fcH: $("#fc-human"), model: $("#a-model"), beam: $("#a-beam"), panel: $("#g-panel"),
    tsS: $("#ts-self"), tsH: $("#ts-human"), act: -1, lastOn: undefined, pkey: "", lastP: 0
  };
  $$("#g-rows li").forEach(function (li) { G.rows[li.getAttribute("data-r")] = li; });
  G.msgs = G.items.filter(function (it) { var k = it.getAttribute("data-k"); return k === "m1" || k === "m2" || k === "m3"; });
  var GT = { c1: .11, f1: .15, f1s: .17, f1v: .19, m2: .27, c2: .53, s0: .55, s1: .62, flS: [.62, .69], flH: [.655, .725], done: .745, v2: .76, unx: .80, rec: .81 };
  var VAL = {
    self: { idle: "—", wait: "…", fail: "없음", pass: "14:05:40" },
    human: { idle: "—", wait: "…", skip: "확인 안 함", pass: "14:06:14" },
    done: { idle: "—", wait: "…", skip: "확인 안 함", pass: "없음" }
  };
  function flyChip(chip, from, to, win, p) {
    var k = (p - win[0]) / (win[1] - win[0]);
    if (k <= 0 || k >= 1) { if (chip._v !== false) { chip.style.opacity = "0"; chip._v = false; } return null; }
    chip._v = true;
    var sr = G.stage.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    var ax = a.left + a.width / 2 - sr.left, ay = a.top + a.height / 2 - sr.top, bx = b.left + b.width / 2 - sr.left, by = b.top + b.height / 2 - sr.top;
    var e = eio(k), mx, my;
    if (Math.abs(bx - ax) > 200) { mx = (ax + bx) / 2; my = Math.min(ay, by) - 80; } else { mx = Math.max(ax, bx) + 70; my = (ay + by) / 2; }
    var x = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * mx + e * e * bx, y = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * my + e * e * by;
    chip.style.transform = "translate(" + (x - chip.offsetWidth / 2) + "px," + (y - chip.offsetHeight / 2) + "px) scale(" + (1 + .18 * Math.sin(Math.PI * e)).toFixed(3) + ")";
    chip.style.opacity = String(k < .1 ? k / .1 : k > .88 ? (1 - k) / .12 : 1);
    return { x: x + sr.left, y: y + sr.top };
  }
  function emitFrom(m) {
    $$(".g-tx .t, .g-draft span", m).forEach(function (el) { var r = el.getBoundingClientRect(); emit(1, r, Math.round(clamp(r.width * r.height / (SMALL ? 70 : 55), 24, SMALL ? 60 : 90))); });
  }
  function gateUpdate(p) {
    var act = 0;
    G.steps.forEach(function (li, i) { if (p >= +li.getAttribute("data-at")) act = i; });
    if (act !== G.act) { G.steps.forEach(function (li, i) { li.classList.toggle("on", i === act); li.classList.toggle("past", i < act); }); G.act = act; }
    var lastOn = null;
    G.items.forEach(function (it) { var on = p >= +it.getAttribute("data-at"); if (on !== it._on) { it.classList.toggle("on", on); it._on = on; } if (on) lastOn = it; });
    G.badges.forEach(function (b) { var on = p >= +b.getAttribute("data-at"); if (on !== b._on) { b.classList.toggle("on", on); b._on = on; } });
    if (lastOn !== G.lastOn) {
      G.lastOn = lastOn;
      var need = lastOn ? lastOn.offsetTop + lastOn.offsetHeight + 14 - G.view.clientHeight : 0;
      G.list.style.transform = "translateY(" + (-Math.max(0, need)) + "px)";
    }
    var st;
    if (p < GT.c1) st = ["도구 호출을 기다립니다", "idle", "idle", "idle", "", "", 0];
    else if (p < GT.c2) st = ["티켓 만들기 · 첫 호출", p >= GT.f1 ? "fail" : "wait", p >= GT.f1s ? "skip" : "wait", p >= GT.f1s ? "skip" : "wait", p >= GT.f1v ? "deny" : "", p >= GT.f1v ? "초안을 먼저 스레드에 올리라는 이유를 모델에게 돌려줍니다." : "", p >= GT.m2 ? 1 : 0];
    else st = ["티켓 만들기 · 다시 호출", p >= GT.flS[1] ? "pass" : "wait", p >= GT.flH[1] ? "pass" : "wait", p >= GT.done ? "pass" : "wait", p >= GT.v2 ? "allow" : "", p >= GT.v2 ? "티켓을 만들고 실행 기록을 한 줄 남깁니다." : "누가·언제 썼는지와 실행 기록만 확인합니다.", 0];
    var key = st.join("|");
    if (key !== G.pkey) {
      var prevV = G.stamp.getAttribute("data-v");
      G.pkey = key;
      setTxt(G.calln, st[0]);
      ["self", "human", "done"].forEach(function (k, i) { var s = st[i + 1], li = G.rows[k]; li.setAttribute("data-s", s === "wait" ? "idle" : s); $(".v", li).textContent = VAL[k][s]; });
      G.stamp.setAttribute("data-v", st[4]);
      G.stamp.textContent = st[4] === "allow" ? "허용" : st[4] === "deny" ? "거부" : "—";
      if (st[4] && st[4] !== prevV) { G.stamp.classList.add("pop"); setTimeout(function () { G.stamp.classList.remove("pop"); }, 380); }
      setTxt(G.why, st[5]);
      G.panel.classList.toggle("dim", !!st[6]);
    }
    G.rows.self.classList.toggle("land", p >= GT.flS[1] && p < GT.flS[1] + .035);
    G.rows.human.classList.toggle("land", p >= GT.flH[1] && p < GT.flH[1] + .035);
    G.rec.classList.toggle("on", p >= GT.rec);
    var vr = G.view.getBoundingClientRect(), sp = clamp((p - GT.s0) / (GT.s1 - GT.s0), 0, 1), scanY = sp * vr.height;
    var scanning = p >= GT.s0 && p < GT.s1;
    G.scan.style.opacity = scanning ? "1" : "0";
    G.scan.style.transform = "translateY(" + scanY.toFixed(1) + "px)";
    G.msgs.forEach(function (m) {
      var x = false;
      if (m._on && p >= GT.s0 && p < GT.unx) {
        if (p >= GT.s1) x = true;
        else { var r = m.getBoundingClientRect(); x = (r.top + Math.min(r.height, 60) * .5 - vr.top) < scanY; }
      }
      if (x !== !!m._x) { m.classList.toggle("x", x); if (x && p >= G.lastP) emitFrom(m); m._x = x; }
    });
    var a = flyChip(G.fcS, G.tsS, $(".v", G.rows.self), GT.flS, p), b = flyChip(G.fcH, G.tsH, $(".v", G.rows.human), GT.flH, p);
    var lr = lineEl.getBoundingClientRect(), vert = lr.height > lr.width, hit = false;
    [a, b].forEach(function (q) {
      if (!q) return;
      if (vert) { if (Math.abs(q.x - (lr.left + lr.width / 2)) < 28) hit = true; }
      else if (Math.abs(q.y - (lr.top + lr.height / 2)) < 20) hit = true;
    });
    G.beam.classList.toggle("hit", hit);
    G.model.classList.toggle("eat", clock - lastEmit < .8);
    G.lastP = p;
  }
  function gateLayout() {
    var steps = $("#g-steps");
    if (!steps) return;
    if (VW < 1100) { var mx = 0; G.steps.forEach(function (li) { mx = Math.max(mx, li.offsetHeight); }); steps.style.minHeight = mx + "px"; }
    else steps.style.minHeight = "";
    G.lastOn = undefined;
  }

  /* ---------- 직접 해 보기 ---------- */
  var TRY = (function () {
    var box = $("#try-box");
    if (!box) return null;
    var CALL = 14 * 3600 + 6 * 60 + 30, SPAN = 120;
    var st = { tool: "ticket", has: { self: true, human: false, react: false }, u: { self: .3, human: .84, react: .58 }, done: false, write: false, cost: "over", inside: true, text: "" };
    var track = $("#t-track"), toks = {}, lanes = {}, tgls = {};
    $$(".tok", track).forEach(function (el) { toks[el.getAttribute("data-k")] = el; });
    $$(".t-lane", track).forEach(function (el) { lanes[el.getAttribute("data-k")] = el.firstElementChild; });
    $$("[data-tg]", box).forEach(function (el) { tgls[el.getAttribute("data-tg")] = el; });
    var selfMsg = $("#t-self"), humMsg = $("#t-human"), humTx = $("#t-human-tx"), react = $("#t-react");
    var form = $("#t-form"), inp = $("#t-in"), read = $("#t-read"), out = $("#t-out"), rec = $("#t-rec");
    var vword = $("#v-word"), vcode = $("#v-code"), vwhyL = $("#v-why-l"), vwhy = $("#v-why"), trace = $("#v-trace"), vnote = $("#v-note"), vtool = $("#v-tool"), live = $("#v-live");
    var mini = $("#t-mini"), miniV = $("#mini-v"), miniWhy = $("#mini-why");
    var NAME = { self: "봇 글", human: "사람 글", react: "사람의 👍" };
    var lastV = "", lastKey = "", flipT = 0, drag = null;

    function sec(k) { return Math.round(CALL - SPAN + SPAN * st.u[k]); }
    function geo() { var W = track.clientWidth; return { x0: 14, x1: W - 66 }; }
    function clampU(k, u) {
      var g = geo(), w = toks[k].offsetWidth || 120, L = Math.max(1, g.x1 - g.x0);
      return clamp(u, clamp((w / 2 + 6 - g.x0) / L, 0, 1), Math.max(clamp((w / 2 + 6 - g.x0) / L, 0, 1), clamp((g.x1 - 6 - w / 2 - g.x0) / L, 0, 1)));
    }
    function place() {
      var g = geo(), L = g.x1 - g.x0;
      ["self", "human", "react"].forEach(function (k) {
        var el = toks[k];
        if (el.hidden) return;
        st.u[k] = clampU(k, st.u[k]);
        el.style.transform = "translateX(" + (g.x0 + st.u[k] * L - el.offsetWidth / 2).toFixed(1) + "px)";
      });
    }
    function facts() { return { self: st.has.self ? sec("self") : null, human: st.has.human ? sec("human") : null, react: st.has.react ? sec("react") : null }; }
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
    function render(changed) {
      var p = facts(), u = uses();
      $$(".tt", box).forEach(function (el) { var k = el.getAttribute("data-k"); el.textContent = p[k] !== null ? hms(p[k]) : ""; });
      ["self", "human", "react"].forEach(function (k) {
        var on = st.has[k], off = !u[k], reactNo = k === "react" && u.react0;
        toks[k].hidden = !on; lanes[k].hidden = on;
        tgls[k].setAttribute("aria-pressed", on ? "true" : "false");
        toks[k].classList.toggle("is-off", off);
        setTxt($(".off", toks[k]), reactNo ? "세지 않음" : "안 봄");
        toks[k].setAttribute("aria-label", NAME[k] + (p[k] !== null ? " " + hms(p[k]) : "") + (off ? (reactNo ? ", 이 도구는 답으로 세지 않음" : ", 이 도구는 보지 않음") : "") + ". 좌우 화살표로 시각을 바꿉니다");
      });
      place();
      p = facts();
      $$(".tt", box).forEach(function (el) { var k = el.getAttribute("data-k"); el.textContent = p[k] !== null ? hms(p[k]) : ""; });
      selfMsg.classList.toggle("off", !st.has.self);
      react.hidden = !st.has.react;
      humMsg.hidden = !st.has.human;
      if (st.has.human) setTxt(humTx, st.text || "좋아요, 진행해 주세요");
      var order = ["self", "human"].filter(function (k) { return st.has[k]; }).sort(function (a, b) { return p[a] - p[b]; });
      selfMsg.style.order = String(Math.max(0, order.indexOf("self")));
      humMsg.style.order = String(Math.max(0, order.indexOf("human")));
      rec.setAttribute("aria-checked", st.done ? "true" : "false");
      rec.classList.toggle("is-off", !u.done);
      var r = judge({ tool: st.tool, self: p.self, human: p.human, react: p.react, done: st.done, write: st.write, cost: st.cost, inside: st.inside });
      out.setAttribute("data-v", r.v); if (mini) mini.setAttribute("data-v", r.v);
      setTxt(vtool, "모델이 ‘" + TOOLN[st.tool] + (st.tool === "prod" ? (st.write ? " · 쓰기" : " · 읽기") : "") + "’를 부르면");
      if (r.v !== lastV) {
        vword.textContent = "";
        var sp = d.createElement("span"); sp.setAttribute("data-fact", ""); if (lastV) sp.className = "in"; if (eyeOn) sp.classList.add("vx"); sp.textContent = LABEL[r.v];
        vword.appendChild(sp); lastV = r.v;
      }
      vcode.textContent = r.v === "allow" ? "allow" : "deny";
      if (r.v === "allow") { setTxt(vwhyL, "실행하면"); setTxt(vwhy, RUN[r.key]); }
      else { setTxt(vwhyL, "모델에게 돌려주는 이유(요지)"); setTxt(vwhy, REASON[r.key]); }
      if (miniV) { setTxt(miniV, LABEL[r.v]); setTxt(miniWhy, r.v === "allow" ? RUN[r.key] : SHORT[r.key]); }
      trace.textContent = "";
      r.trace.forEach(function (x) {
        var li = d.createElement("li"); li.setAttribute("data-s", x.s);
        var q = d.createElement("span"); q.className = "q"; setTxt(q, x.q);
        var a = d.createElement("span"); a.className = eyeOn ? "v vx" : "v"; a.setAttribute("data-fact", ""); a.textContent = x.a;
        var ic = d.createElement("i"); ic.className = "st"; ic.setAttribute("aria-hidden", "true");
        li.appendChild(q); li.appendChild(a); li.appendChild(ic); trace.appendChild(li);
      });
      setTxt(vnote, note(r, p));
      if (st.has.human) setTxt(read, "‘" + (st.text || "좋아요, 진행해 주세요") + "’ — 이 답이 승인인지는 모델이 읽습니다. 정책 함수에는 글의 내용 대신 ‘사람 · " + hms(p.human) + "’만 넘어갑니다.");
      else setTxt(read, "답을 보내면 그 글은 모델이 읽습니다. 승인인지 가리는 일은 이 페이지에서 흉내 내지 않습니다.");
      var key = st.tool + r.v + r.key;
      if (changed && key !== lastKey) {
        live.textContent = TOOLN[st.tool] + ": " + LABEL[r.v] + ". " + (r.v === "allow" ? RUN[r.key] : REASON[r.key]);
        out.classList.add("flip"); clearTimeout(flipT); flipT = setTimeout(function () { out.classList.remove("flip"); }, 650);
      }
      lastKey = key;
    }
    function flyTo(fromEl, toEl, who) {
      if (!fromEl || !toEl || !fromEl.animate) return;
      var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      var c = d.createElement("span"); c.className = "flychip"; c.setAttribute("aria-hidden", "true");
      var bb = d.createElement("b"); bb.textContent = who; c.appendChild(bb); c.appendChild(d.createTextNode(" " + fromEl.textContent));
      d.body.appendChild(c);
      var w = c.offsetWidth, h = c.offsetHeight;
      var x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2, x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
      var an = c.animate([
        { transform: "translate(" + x0 + "px," + y0 + "px) scale(.9)", opacity: 0 },
        { transform: "translate(" + ((x0 + x1) / 2 + 30) + "px," + (Math.min(y0, y1) - 40) + "px) scale(1.12)", opacity: 1, offset: .45 },
        { transform: "translate(" + x1 + "px," + y1 + "px) scale(1)", opacity: 0 }
      ], { duration: 1150, easing: "cubic-bezier(.45,.05,.3,1)" });
      an.onfinish = function () { c.remove(); };
    }
    function send(text) {
      text = (text || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!text) { inp.focus(); return; }
      st.text = text; st.has.human = true; st.u.human = .84;
      inp.value = "";
      render(true);
      requestAnimationFrame(function () {
        emit(2, humTx.getBoundingClientRect(), SMALL ? 70 : 120);
        flyTo($(".tt", humMsg), toks.human, "사람");
        toks.human.classList.add("pulse"); setTimeout(function () { toks.human.classList.remove("pulse"); }, 900);
      });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); send(inp.value); });
    $$(".t-sugg button", box).forEach(function (b) { b.addEventListener("click", function () { send(b.getAttribute("data-s")); }); });
    Object.keys(tgls).forEach(function (k) { tgls[k].addEventListener("click", function () { st.has[k] = !st.has[k]; render(true); }); });
    rec.addEventListener("click", function () { st.done = !st.done; render(true); });
    $$('input[name="tool"]', box).forEach(function (r) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        st.tool = r.value;
        $$(".sub", box).forEach(function (s) { s.hidden = s.getAttribute("data-for") !== st.tool; });
        render(true);
      });
    });
    $$('[role="radio"]', box).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-g"), v = b.getAttribute("data-v");
        $$('[data-g="' + g + '"]', box).forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
        if (g === "kind") st.write = v === "write"; else if (g === "cost") st.cost = v; else if (g === "path") st.inside = v === "in";
        render(true);
      });
      b.addEventListener("keydown", function (e) {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
        e.preventDefault();
        var sibs = $$('[data-g="' + b.getAttribute("data-g") + '"]', box), i = sibs.indexOf(b);
        var nx = sibs[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + sibs.length) % sibs.length];
        nx.focus(); nx.click();
      });
    });
    Object.keys(toks).forEach(function (k) {
      var el = toks[k];
      el.addEventListener("pointerdown", function (e) {
        if (e.button) return;
        e.preventDefault();
        var r = el.getBoundingClientRect();
        drag = { k: k, id: e.pointerId, dx: e.clientX - (r.left + r.width / 2) };
        try { el.setPointerCapture(e.pointerId); } catch (er) { }
        el.classList.add("drag"); el.focus({ preventScroll: true });
      });
      el.addEventListener("pointermove", function (e) {
        if (!drag || drag.k !== k || drag.id !== e.pointerId) return;
        var tr_ = track.getBoundingClientRect(), g = geo();
        st.u[k] = clampU(k, (e.clientX - tr_.left - drag.dx - g.x0) / (g.x1 - g.x0));
        render(true);
      });
      function up(e) { if (drag && drag.k === k && drag.id === e.pointerId) { drag = null; el.classList.remove("drag"); } }
      el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
      el.addEventListener("keydown", function (e) {
        var dlt = 0;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") dlt = -.04; else if (e.key === "ArrowRight" || e.key === "ArrowUp") dlt = .04;
        else if (e.key === "Home") dlt = -1; else if (e.key === "End") dlt = 1; else return;
        e.preventDefault(); st.u[k] = clampU(k, st.u[k] + dlt); render(true);
      });
    });
    function miniTick() {
      if (!mini || VW >= 1100) return;
      var br = box.getBoundingClientRect(), or = out.getBoundingClientRect();
      var show = br.top < VH * .62 && br.bottom > VH * .45 && (or.bottom < 76 || or.top > VH - 40);
      if (show !== mini._on) { mini.classList.toggle("on", show); mini._on = show; }
    }
    render(false);
    return { mini: miniTick, layout: function () { render(false); } };
  })();

  /* ---------- 마지막: 235개 점 더미 ---------- */
  var HEAPS = (function () {
    var el = $("#a-heap");
    if (!el) return null;
    var tip = $("#heap-tip"), btn = $("#heap-sort"), cap = $(".heap-cap", el);
    var x = new Float32Array(NT), y = new Float32Array(NT), hx = new Float32Array(NT), hy = new Float32Array(NT), sx = new Float32Array(NT), sy = new Float32Array(NT);
    var ord = new Int32Array(NT); for (var j0 = 0; j0 < NT; j0++) ord[j0] = j0;
    var api = { el: el, on: false, sorted: false };
    var W = 0, H = 0, pad = 20, rad = SMALL ? 7.5 : 12, sr = rad, drag = -1, dpx = 0, dpy = 0, dvx = 0, dvy = 0, dlt = 0, hover = -1, down = null;
    function dims() {
      var r = el.getBoundingClientRect(); W = r.width; H = r.height;
      pad = parseFloat(getComputedStyle(cap).left) || 20;
      var floor = H - 34, top = cap.offsetTop + cap.offsetHeight + 16, avail = Math.max(60, floor - top), colW = (W - 2 * pad) / 16, best = null;
      for (var k = 1; k <= 4; k++) { var rows = Math.ceil(37 / k), rr = Math.min(colW * .86 / (2 * k), avail / (2 * rows * 1.06)); if (!best || rr > best.r) best = { k: k, r: rr }; }
      sr = Math.min(best.r, rad);
      var gap = sr * 2 * 1.06;
      for (var j = 0; j < NT; j++) { var row = Math.floor(wi[j] / best.k), cp = wi[j] % best.k; sx[j] = pad + (wk[j] + .5) * colW + (cp - (best.k - 1) / 2) * gap; sy[j] = floor - sr - row * gap; }
    }
    api.enter = function (r) {
      api.on = true; dims();
      for (var j = 0; j < NT; j++) {
        x[j] = clamp(px[NG + j] - r.left + (Math.random() - .5), rad, W - rad);
        y[j] = Math.min(py[NG + j] - r.top, H - 34 - rad);
        hx[j] = vx[NG + j] * .3; hy[j] = vy[NG + j] * .3;
      }
    };
    api.leave = function () {
      api.on = false; drag = -1; el.classList.remove("grabbing"); tip.classList.remove("on");
      for (var j = 0; j < NT; j++) { vx[NG + j] = hx[j] * .4; vy[NG + j] = hy[j] * .4; }
    };
    function collide() {
      for (var a = 1; a < NT; a++) { var v = ord[a], xv = x[v], b = a - 1; while (b >= 0 && x[ord[b]] > xv) { ord[b + 1] = ord[b]; b--; } ord[b + 1] = v; }
      var D = 2 * rad, D2 = D * D;
      for (a = 0; a < NT; a++) {
        var i = ord[a];
        for (b = a + 1; b < NT; b++) {
          var j = ord[b], dx = x[j] - x[i];
          if (dx >= D) break;
          var dy = y[j] - y[i];
          if (dy >= D || dy <= -D) continue;
          var q = dx * dx + dy * dy;
          if (q >= D2 || q < 1e-6) continue;
          var dd = Math.sqrt(q), nx = dx / dd, ny = dy / dd, ov = D - dd, mi = i === drag ? 0 : 1, mj = j === drag ? 0 : 1, ms = mi + mj;
          if (!ms) continue;
          x[i] -= nx * ov * mi / ms; y[i] -= ny * ov * mi / ms; x[j] += nx * ov * mj / ms; y[j] += ny * ov * mj / ms;
          var rv = (hx[j] - hx[i]) * nx + (hy[j] - hy[i]) * ny;
          if (rv < 0) { var imp = -1.3 * rv / ms; hx[i] -= imp * nx * mi; hy[i] -= imp * ny * mi; hx[j] += imp * nx * mj; hy[j] += imp * ny * mj; }
        }
      }
    }
    api.step = function (dt) {
      var floor = H - 34, j;
      if (api.sorted) {
        for (j = 0; j < NT; j++) {
          var kx = 46 * kf[NG + j], cc = 2 * Math.sqrt(kx) * .85;
          hx[j] += ((sx[j] - x[j]) * kx - hx[j] * cc) * dt; hy[j] += ((sy[j] - y[j]) * kx - hy[j] * cc) * dt;
          x[j] += hx[j] * dt; y[j] += hy[j] * dt;
        }
        return;
      }
      var sub = 3, h = dt / sub, g = 2300;
      for (var s = 0; s < sub; s++) {
        for (j = 0; j < NT; j++) {
          if (j === drag) { x[j] = dpx; y[j] = dpy; hx[j] = dvx; hy[j] = dvy; continue; }
          hy[j] += g * h; hx[j] *= .9995;
          x[j] += hx[j] * h; y[j] += hy[j] * h;
          if (x[j] < rad) { x[j] = rad; hx[j] = Math.abs(hx[j]) * .5; }
          if (x[j] > W - rad) { x[j] = W - rad; hx[j] = -Math.abs(hx[j]) * .5; }
          if (y[j] > floor - rad) { y[j] = floor - rad; if (hy[j] > 0) hy[j] = -hy[j] * .3; hx[j] *= .93; }
        }
        collide();
      }
    };
    api.map = function (r) {
      for (var j = 0; j < NT; j++) {
        var i = NG + j, hot = j === hover || j === drag;
        px[i] = r.left + x[j]; py[i] = r.top + y[j]; vx[i] = hx[j]; vy[i] = hy[j];
        tgt(i, px[i], py[i], 2 * (api.sorted ? sr : rad) * (hot ? 1.18 : 1), wk[j] === PARTIAL && api.sorted ? .55 : .94, hot ? C.warm : C.ink, 1, 0, HEAP);
      }
    };
    function nearest(mx, my, lim) {
      var best = -1, bd = lim * lim;
      for (var j = 0; j < NT; j++) { var dx = x[j] - mx, dy = y[j] - my, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = j; } }
      return best;
    }
    function showTip(j) {
      if (j < 0) { tip.classList.remove("on"); return; }
      setTxt(tip, WEEK_LABEL[wk[j]] + " 주에 답한 질문 스레드" + (wk[j] === PARTIAL ? " · 이틀치 주" : ""));
      tip.style.left = x[j].toFixed(1) + "px"; tip.style.top = (y[j] - (api.sorted ? sr : rad)).toFixed(1) + "px";
      tip.classList.add("on");
    }
    function kick(cx, cy) {
      for (var j = 0; j < NT; j++) {
        var dx = x[j] - cx, dy = y[j] - cy, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 200) { var f = 1 - dd / 200; hx[j] += dx / (dd + 1) * 1400 * f; hy[j] += dy / (dd + 1) * 700 * f - 1100 * f; }
      }
    }
    function local(e) { var r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    el.addEventListener("pointerdown", function (e) {
      if (!api.on || e.target.closest("button")) return;
      var m = local(e), j = nearest(m[0], m[1], COARSE ? 30 : 22);
      down = { x: m[0], y: m[1], moved: false, cx: e.clientX, cy: e.clientY };
      if (j >= 0 && !api.sorted) {
        drag = j; dpx = m[0]; dpy = m[1]; dvx = dvy = 0; dlt = performance.now();
        try { el.setPointerCapture(e.pointerId); } catch (er) { }
        el.classList.add("grabbing");
      }
      if (j >= 0) showTip(j);
    });
    el.addEventListener("pointermove", function (e) {
      if (!api.on) return;
      var m = local(e);
      if (down && Math.abs(m[0] - down.x) + Math.abs(m[1] - down.y) > 7) down.moved = true;
      if (drag >= 0) {
        var now = performance.now(), dts = Math.max(8, now - dlt) / 1000;
        dvx = clamp((m[0] - dpx) / dts, -2600, 2600) * .6 + dvx * .4; dvy = clamp((m[1] - dpy) / dts, -2600, 2600) * .6 + dvy * .4;
        dpx = m[0]; dpy = m[1]; dlt = now; showTip(drag);
      } else if (e.pointerType === "mouse") { hover = nearest(m[0], m[1], (api.sorted ? sr : rad) + 6); showTip(hover); }
    });
    function end(e) {
      if (drag >= 0) { hx[drag] = dvx; hy[drag] = dvy; if (down && !down.moved) { hy[drag] = -900; } drag = -1; el.classList.remove("grabbing"); }
      else if (down && !down.moved && e.type === "pointerup" && !api.sorted) { kick(down.x, down.y); ripple(down.cx, down.cy); }
      down = null;
      if (e.pointerType !== "mouse") setTimeout(function () { showTip(-1); }, 1400);
    }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { hover = -1; showTip(-1); } });
    btn.addEventListener("click", function () {
      api.sorted = !api.sorted;
      btn.setAttribute("aria-pressed", api.sorted ? "true" : "false");
      setTxt(btn, api.sorted ? "흩뜨리기" : "주별로 쌓기");
      el.classList.toggle("sorted", api.sorted);
      showTip(-1);
      if (api.sorted) dims();
      else for (var j = 0; j < NT; j++) { hx[j] = (Math.random() - .5) * 700; hy[j] = -400 - Math.random() * 800; }
    });
    api.resize = function () { if (api.on) dims(); };
    return api;
  })();

  /* ---------- 운영 기록 숫자 ---------- */
  $$(".odo").forEach(function (el) {
    var v = el.getAttribute("data-v"); el.textContent = "";
    v.split("").forEach(function (ch, i) {
      var box = d.createElement("span"), col = d.createElement("span"); col.className = "col";
      var n = 10 * (1 + (v.length - i) % 2) + (+ch);
      for (var k = 0; k <= n; k++) { var s = d.createElement("span"); s.textContent = String(k % 10); col.appendChild(s); }
      col.style.transitionDelay = (i * .12) + "s";
      col.setAttribute("data-n", String(n));
      box.appendChild(col); el.appendChild(box);
    });
  });

  /* ---------- 나타나기 · 머리띠 ---------- */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      $$(".odo .col", e.target).forEach(function (c) { c.style.transform = "translateY(-" + c.getAttribute("data-n") + "em)"; });
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .12 }) : null;
  $$(".rv").forEach(function (el) {
    if (io) io.observe(el);
    else { el.classList.add("in"); $$(".odo .col", el).forEach(function (c) { c.style.transform = "translateY(-" + c.getAttribute("data-n") + "em)"; }); }
  });
  var navBar = $("#nav-bar"), navLinks = $$(".nav ul a"), navCur = "", navTick = 0;
  function navUpdate(sy) {
    var max = d.documentElement.scrollHeight - VH;
    if (navBar) navBar.style.transform = "scaleX(" + (max > 0 ? clamp(sy / max, 0, 1) : 0).toFixed(4) + ")";
    if (++navTick % 8) return;
    var cur = "";
    navLinks.forEach(function (a) { var s = d.getElementById(a.getAttribute("href").slice(1)); if (s && s.getBoundingClientRect().top < VH * .4) cur = a.getAttribute("href"); });
    if (cur !== navCur) { navCur = cur; navLinks.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === cur ? "true" : "false"); }); }
  }

  /* ---------- 정책 함수가 보는 화면 ---------- */
  var eyeBtn = $("#eye-btn"), eyeScan = $("#eye-scan"), eyeWho = $("#eye-who"), eyeTimer = 0;
  if (eyeWho) eyeWho.setAttribute("aria-hidden", "true");
  function eyeTick() { var n = new Date(); eyeWho.textContent = "이 페이지를 보는 사람 · " + two(n.getHours()) + ":" + two(n.getMinutes()) + ":" + two(n.getSeconds()); }
  var VEIL = ".rx, [data-fact], .ptext, .odo, .st-n .u, .fig a, .hl, .badge", SWEEP = null;
  function setEye(on) {
    eyeOn = on;
    R.classList.toggle("eye", on);
    eyeBtn.setAttribute("aria-pressed", on ? "true" : "false");
    var items = $$(VEIL).map(function (el) { return { el: el, y: el.getBoundingClientRect().top }; });
    items.sort(function (a, b) { return a.y - b.y; });
    SWEEP = { items: items, i: 0, t0: performance.now(), on: on };
    clearInterval(eyeTimer);
    if (on) { eyeTick(); eyeTimer = setInterval(eyeTick, 1000); }
  }
  function sweepTick(now) {
    if (!SWEEP) return;
    var k = clamp((now - SWEEP.t0) / 950, 0, 1), y = (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * (VH + 40) - 20, it = SWEEP.items;
    eyeScan.style.opacity = k < 1 ? "1" : "0";
    eyeScan.style.transform = "translateY(" + y.toFixed(1) + "px)";
    while (SWEEP.i < it.length && (k >= 1 || it[SWEEP.i].y < y)) { it[SWEEP.i].el.classList.toggle("vx", SWEEP.on); SWEEP.i++; }
    if (k >= 1) SWEEP = null;
  }
  if (eyeBtn) eyeBtn.addEventListener("click", function () { setEye(!eyeOn); });
  var eyeOffBtn = $("#eye-off");
  if (eyeOffBtn) eyeOffBtn.addEventListener("click", function () { setEye(false); eyeBtn.focus(); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && eyeOn) setEye(false); });

  /* ---------- 크기 바뀜 ---------- */
  var rzT = 0;
  function layout() {
    sizeCanvas(false);
    SMALL = VW < 760;
    setVt(); gateLayout();
    if (TRY) TRY.layout();
    if (HEAPS) HEAPS.resize();
  }
  addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(layout, 120); });

  /* ---------- 매 프레임 ---------- */
  var gateSec = $("#gate"), trySec = $("#try"), lastT = performance.now(), scene = "";
  function frame(now) {
    var dt = Math.min(Math.max((now - lastT) / 1000, 0), 1 / 30);
    lastT = now; clock += dt;
    sweepTick(now);
    var sy = window.scrollY || window.pageYOffset || 0;
    navUpdate(sy);
    var thr = TH.track.getBoundingClientRect(), pth = clamp(-thr.top / Math.max(1, thr.height - VH), 0, 1);
    if (thr.bottom > -200 && thr.top < VH + 200) thUpdate(pth);
    var gr = G.track.getBoundingClientRect(), pg = clamp(-gr.top / Math.max(1, gr.height - VH), 0, 1);
    if (FX && gr.bottom > -200 && gr.top < VH + 200) gateUpdate(pg);
    if (TRY) TRY.mini();
    if (FX) {
      var hr = HEAPS ? HEAPS.el.getBoundingClientRect() : null;
      if (HEAPS && !HEAPS.on && hr.top < VH * .72) HEAPS.enter(hr);
      else if (HEAPS && HEAPS.on && hr.top > VH * .86) HEAPS.leave();
      if (HEAPS && HEAPS.on) scene = "heap";
      else if (thr.top > VH * .42) scene = "hero";
      else if (thr.bottom > VH * .5) scene = TH.ph <= 0 ? "t235" : TH.ph === 1 ? "weeks" : "one";
      else {
        var gs = gateSec.getBoundingClientRect(), tsr = trySec.getBoundingClientRect();
        if (gs.top < VH * .5 && gr.bottom > VH * .4) scene = "gate";
        else if (tsr.top < VH * .55 && tsr.bottom > VH * .35) scene = "try";
        else scene = "amb";
      }
      for (var i = 600; i < NG; i++) if (ovr[i] && !((ovr[i] === 1 && scene === "gate") || (ovr[i] === 2 && scene === "try"))) ovr[i] = 0;
      if (scene === "hero") sceneHero(clock, sy);
      else if (scene === "t235") sceneT235(clock, sy);
      else if (scene === "weeks") sceneWeeks(clock, sy);
      else if (scene === "one") sceneOne(clock, sy);
      else if (scene === "gate") sceneGate(clock, sy);
      else if (scene === "try") sceneTry(clock, sy);
      else { allDust(clock, sy, scene === "heap" ? .55 : .8); if (scene !== "heap") allField(clock, sy, 1); }
      if (scene === "heap") { HEAPS.step(dt); HEAPS.map(hr); }
      dotPush = scene === "weeks" ? 0 : .55;
      eyeK += ((eyeOn ? 1 : 0) - eyeK) * (1 - Math.exp(-dt * 5));
      integrate(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }

  sizeCanvas(true);
  setVt(); gateLayout();
  requestAnimationFrame(function (t) { lastT = t; frame(t); });
  setTimeout(function () { R.classList.add("ready"); }, 140);
  if (!FX) $$(".g-steps li, #g-list > li, #g-list .badge").forEach(function (el) { el.classList.add("on"); });
})();
