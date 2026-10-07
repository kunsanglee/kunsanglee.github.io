/* Kunsang Lee · 입자 이야기. drafts/F 의 입자 엔진(WebGL2 변환 피드백, 스프링, curl 노이즈, 잔상·블룸)을 바탕으로
   원근 카메라 비행·피사계 심도·혜성 꼬리를 더했다. 장면 진행은 스크롤 위치에 묶여 있다. 맨 위에서 열고 손대지 않으면
   페이지를 한 번 저절로 장면 9 까지 내리고, 사용자가 스크롤하려는 입력을 하면 그 자리에서 손에 넘긴다. 되풀이하지 않는다. */
(() => {
'use strict';

/* ------------------------------------------------------------------ setup */
const qs = new URLSearchParams(location.search);
const CAPTURE = qs.has('capture');
const SHOW_FPS = qs.has('fps');
const root = document.documentElement;
if (!root.classList.contains('fx')) return;
const SMALL = Math.min(innerWidth, innerHeight) < 560 || matchMedia('(pointer: coarse)').matches;
const N = Math.max(8000, Math.min(60000, +(qs.get('n') || (SMALL ? 32000 : 40000))));

const canvas = document.getElementById('gl');
let gl = null;
try {
  gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false,
    preserveDrawingBuffer: CAPTURE, powerPreference: 'high-performance'
  });
} catch (e) { gl = null; }
function fail(err) {
  if (err) console.warn(err);
  root.classList.remove('fx', 'at0', 'in-sec');
}
if (!gl) { fail(); return; }
let HDR = !!gl.getExtension('EXT_color_buffer_float');

/* 색은 F 의 세 색(점토 · 호박 · 크림)만 쓴다. 입자 색 좌표 aCol = (온도, 흐림, 흰 정도, 꼬리).
   온도 0 은 점토, 0.5 는 호박, 1 은 크림. 사람은 호박, 에이전트는 흰 코어의 크림, 코드·데이터는 점토 쪽에 둔다. */
const CLAY = [0.92, 0.40, 0.24];
const AMBER = [1.00, 0.66, 0.30];
const CREAM = [1.00, 0.93, 0.83];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const mix = (a, b, t) => a + (b - a) * t;
const outCubic = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const inOut = x => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const outBack = (x, c1) => { const u = clamp(x, 0, 1) - 1; return 1 + (c1 + 1) * u * u * u + c1 * u * u; };

/* ---------------------------------------------------------------- shaders */
const NOISE = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
// simplex noise with analytic gradient (Ashima Arts / stegu, MIT)
float snoise(vec3 v, out vec3 gradient){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;
  return 105.0 * dot(m4, pdotx);
}
// divergence-free field: grad(n1) x grad(n2)
vec3 curl(vec3 p){
  vec3 g1; vec3 g2;
  snoise(p, g1);
  snoise(p + vec3(19.7, -43.1, 7.3), g2);
  return cross(g1, g2);
}`;

/* 모드: 0 흩어짐 1 모이기·멈춤(이름) 2 동료 고리 3 말뜻 4 신경망 5 자리에 없어도 6 아낀 30분 7 리뷰 8 은하(본문 뒤) 9 폴더 10 연락.
   장면 2~9 에서 0번부터 PB 개는 늘 에이전트(역할 20), 사람은 역할 21, 먼지는 29, 쓰지 않는 입자는 30.
   uPhaseT 는 스크롤에 묶인 장면 진행 시간, uRT 는 장면에 들어온 뒤 흐른 실제 시간(모양이 모이는 속도에만 쓴다) */
const SIM_HEAD = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aTgt;
layout(location=4) in vec4 aTCol;
layout(location=5) in vec4 aMeta;
layout(location=6) in vec4 aAux;
layout(location=7) in vec4 aAux2;
layout(location=8) in vec4 aSeed;
uniform float uDt, uTime, uPhaseT, uRT, uSnap, uForm;
uniform int uMode;
uniform ivec2 uKeep;   // particles in [x, y) carry over from the last scene: no fade-in, no spring ramp
uniform float uAgKeep; // 1 when the agent comes straight from the last story scene: it keeps its full spring
uniform float uK, uZeta, uRamp, uStagger, uNoise, uNoiseFreq, uDrag, uVmax, uKick, uKickR, uKickShell, uAspect, uColRate;
uniform vec2 uContain;
uniform vec3 uWind, uKickC, uKickBias, uEye, uCamR, uCamU, uCamF;
uniform vec4 uP, uQ, uS, uT, uU, uG, uPointer, uAg, uAgV;
uniform vec4 uArr[64];
uniform mat4 uVP;
out vec4 vPos;
out vec4 vVel;
out vec4 vCol;
${NOISE}
float eInOut(float s){ s = clamp(s, 0.0, 1.0); return s < 0.5 ? 4.0*s*s*s : 1.0 - pow(-2.0*s + 2.0, 3.0) * 0.5; }
float eOut(float s){ s = 1.0 - clamp(s, 0.0, 1.0); return 1.0 - s*s*s; }
float sm1(float x){ x = clamp(x, 0.0, 1.0); return x*x*(3.0 - 2.0*x); }
float sq(float x){ return x * x; }
vec2 rot(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 sphereDir(vec2 s){ float z = s.x*2.0 - 1.0; float a = s.y*6.2831853; float r = sqrt(max(0.0, 1.0 - z*z)); return vec3(cos(a)*r, sin(a)*r, z); }
vec3 bez(vec3 a, vec3 b, vec3 c, float t){ float u = 1.0 - t; return u*u*a + 2.0*u*t*b + t*t*c; }
vec3 bb(vec2 l){ return uCamR * l.x + uCamU * l.y; }
vec3 cloud(vec3 p, float swirl){
  vec3 q = p * vec3(0.62, 1.0, 1.5);
  float r = length(q);
  vec3 f = -p * max(r - uContain.x, 0.0) * uContain.y;
  f.xy += vec2(-q.y, q.x) * swirl / (0.3 + r);
  return f;
}
vec3 spring(vec3 p, vec3 v, vec3 goal, vec3 gv, float k, float z){
  return (goal - p) * k + (gv - v) * (2.0 * z * sqrt(k));
}
vec3 galaxy(vec4 sd, float t){
  float R = uP.z;
  float rr = pow(sd.x, 1.35);
  float r = R * (0.03 + 0.97 * rr);
  float arm = floor(sd.y * 3.0);
  float sp = sd.z - 0.5; sp = sp * sp * sp * 9.0;
  float a = arm * 2.0943951 + rr * 5.2 + sp * (0.3 + 0.7 * rr) - t * uP.w * (1.0 - 0.25 * rr);
  float h = (sd.w - 0.5) * uQ.w * (1.0 - 0.75 * rr);
  vec3 g = vec3(cos(a) * r, h, sin(a) * r);
  g.yz = rot(g.yz, uP.x);
  g.xy = rot(g.xy, uP.y);
  return g + uQ.xyz;
}
// flowing position along a beam: u runs 0 -> 1 and starts over; returns true when it starts over this step
bool wrapped(float u, float u0){ return abs(u - u0) > 0.5; }
struct St { vec3 p; vec3 v; vec3 goal; vec3 gv; float k; float z; float brT; vec2 ct; float cw; float tw; float flash; vec3 acc; bool jump; };

// 20: the agent, a cream ball with a white core, the same size on screen in every scene
void agentRole(inout St s){
  s.goal = uAg.xyz + aTgt.xyz * uAgV.w;
  s.gv = uAgV.xyz;
  s.k = 320.0; s.z = 0.86;
  s.brT *= uAg.w;
  s.tw = 0.45;
}
// 21: a person, an amber ball. uArr[s] = (place, on), uArr[8 + s] = (away, glow, size).
// away turns the ball into a thin empty circle at the brightness of the ring line
void personRole(inout St s, float form){
  int i = int(aAux.x + 0.5);
  vec4 S = uArr[i];
  vec4 X = uArr[8 + i];
  float sc = X.z > 0.0 ? X.z : 1.0;
  float ab = clamp(X.x, 0.0, 1.0);
  vec3 circ = bb(aAux.yz) * sc + vec3(0.0, 0.0, aTgt.z * 0.1);
  s.goal = S.xyz + mix(aTgt.xyz * sc, circ, ab * aAux.w);
  s.k = 170.0 * max(form, 0.04); s.z = 0.82;
  float on = S.w * form;
  s.brT = mix(aTgt.w * (1.0 + X.y), 0.075 * aAux.w, ab) * on;
  s.cw = mix(aTCol.z + 0.45 * X.y, 0.02, ab);
  s.ct = mix(aTCol.xy, vec2(0.5, 0.25), ab);
}
void dustRole(inout St s, float form){
  s.goal = aTgt.xyz + vec3(sin(uTime * 0.11 + aSeed.x * 6.28), cos(uTime * 0.09 + aSeed.y * 6.28), sin(uTime * 0.07 + aSeed.z * 6.28)) * 0.04;
  s.brT *= form;
  s.k = 12.0;
}
`;

/* 02 · 동료 고리: 사람 일곱 + 합류하는 에이전트, 부른 사람의 말풍선, 코드베이스·데이터베이스, 빛줄기, 티켓·PR 카드 */
const SIM_M2 = `
void m2(inout St s, float t, float form, float dt){
  float role = aAux2.x;
  if (role < 2.5) {                       // the faint circle the seats sit on
    s.brT *= form * sm1((uRT - 0.1 - aAux2.y * 0.6) / 0.4);
  } else if (role < 3.5) {                // code forest: branches grow from the root
    float vis = sm1((uS.x - aAux2.y) / 0.12);
    s.goal = mix(aAux.xyz, aTgt.xyz, vis);
    s.brT *= vis * (1.0 + 1.1 * uS.w * aMeta.x) * (1.0 - uP.x);
    s.k = 90.0;
  } else if (role < 4.5) {                // database cylinder
    float vis = sm1((uS.y - aAux2.y) / 0.2);
    s.goal = mix(aAux.xyz, aTgt.xyz, vis);
    s.brT *= vis * (1.0 + 0.9 * uS.w * aMeta.x) * (1.0 - uP.x);
    s.k = 90.0;
  } else if (role < 5.5) {                // light beams from the agent to the forest and the database
    vec3 a = uAg.xyz;
    vec3 e = uArr[16 + int(aAux.x + 0.5)].xyz;
    float u = fract(aSeed.x + uTime * 1.25);
    float u0 = fract(aSeed.x + (uTime - dt) * 1.25);
    vec3 d = e - a;
    vec3 side = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    s.goal = a + d * (u * uS.z) + side * (aSeed.y - 0.5) * 0.012 + vec3(0.0, 0.0, (aSeed.z - 0.5) * 0.012);
    if (wrapped(u, u0)) s.jump = true;
    s.gv = d * uS.z * 1.25;
    s.k = 400.0; s.z = 0.9;
    s.brT *= uS.w * step(0.002, uS.z) * (0.55 + 0.45 * (1.0 - u));
    s.tw = 0.6;
  } else if (role < 6.5) {                // fragments: pulled to the agent, sent to the caller, folded into cards
    vec3 src = aAux.xyz;
    float dl = aAux.w;
    vec3 a = uAg.xyz;
    vec3 c = uQ.xyz;
    vec3 j = aSeed.xyz - 0.5;
    float srcVis = aAux2.z < 0.5 ? sm1((uS.x - 0.35) / 0.3) : sm1((uS.y - 0.3) / 0.3);
    float tp = t - uG.x - dl;
    float ta = t - uG.y - dl * 0.3;
    float tf = t - uG.z - aMeta.w * 0.25;
    if (tp < 0.0) {
      s.goal = src;
      s.brT *= srcVis * 0.85 * (1.0 - uP.x);
      s.k = 90.0;
    } else if (tp < 0.6) {
      float e = eInOut(tp / 0.6);
      s.goal = bez(src, mix(src, a, 0.5) + vec3(0.0, 0.16, 0.12), a + j * 0.05, e);
      s.k = 260.0; s.z = 0.85;
      s.ct = mix(aTCol.xy, vec2(0.95, 0.0), e); s.cw = 0.45; s.tw = 1.0;
    } else if (ta < 0.0) {
      vec2 o = rot(j.xy, uTime * 3.0 + aSeed.w * 6.0) * 0.08;
      s.goal = a + vec3(o, j.z * 0.08);
      s.k = 140.0;
      s.ct = vec2(0.95, 0.0); s.cw = 0.5; s.tw = 0.8;
    } else if (ta < 0.55) {
      float e = eInOut(ta / 0.55);
      s.goal = bez(a + j * 0.08, mix(a, c, 0.5) + vec3(0.0, 0.22, 0.05), c + j * 0.07, e);
      s.k = 260.0; s.z = 0.85;
      s.ct = vec2(0.95, 0.0); s.cw = 0.55; s.tw = 1.0;
    } else if (tf < 0.0) {
      s.goal = c + j * 0.08;
      s.k = 150.0;
      s.ct = vec2(0.8, 0.0); s.cw = 0.45; s.tw = 0.6;
    } else {
      vec4 C = uArr[18 + int(aAux2.y + 0.5)];
      float e = sm1(tf / 0.5);
      s.goal = mix(c + j * 0.08, C.xyz + aTgt.xyz * C.w, e);
      s.k = mix(150.0, 240.0, e); s.z = 0.85;
      s.ct = vec2(0.92, 0.0); s.cw = mix(0.45, 0.3, e); s.tw = 1.0;
    }
  } else if (role < 7.5) {                // the caller's speech bubble, grown out of the caller
    float vis = sm1((uQ.w - aAux2.y) / 0.18);
    s.goal = mix(uQ.xyz, uArr[20].xyz + aTgt.xyz, vis);
    s.brT *= vis * uArr[20].w;
    s.k = 140.0;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 03 · 말뜻: 장면 2 의 말풍선은 테두리를 둔 채 글줄만 엉키고, 에이전트를 지나며 체크가 붙은 할 일 카드가 되어
   선의 틈 하나로 지나간다. 뒤따르는 흐린 카드 둘도 같은 틈으로 지나간다.
   카드 c: uArr[16 + c] = (가운데, 크기), uArr[20 + c] = (엉킴, 카드로 바뀜, 체크, 보임) */
const SIM_M3 = `
void m3(inout St s, float t, float form){
  float role = aAux2.x;
  if (role < 2.5) {                       // the ring line from scene 2, fading out
    s.brT *= form * (1.0 - uP.y);
  } else if (role < 3.5) {                // a bubble that becomes a to-do card
    int c = int(aAux2.y + 0.5);
    vec4 C = uArr[16 + c];
    vec4 M = uArr[20 + c];
    float part = aAux2.z;
    float tg = M.x, mo = M.y;
    vec3 j = aSeed.xyz - 0.5;
    vec2 wob = vec2(sin(uTime * 2.3 + aSeed.x * 31.0), cos(uTime * 1.9 + aSeed.y * 27.0)) * 0.012;
    vec2 bub = aAux.xy;
    vec2 tang = aAux.zw + wob;
    vec2 loc;
    float b = aTgt.w;
    if (part < 0.5) {                     // the frame keeps its shape until it becomes the card's frame
      loc = mix(bub, aTgt.xy, eInOut(mo));
      s.ct = mix(vec2(0.5, 0.0), aTCol.xy, mo);
      s.cw = mix(0.06 + 0.1 * aMeta.x, aTCol.z, mo);
    } else {                              // the words tangle, then settle into the card's lines and the check
      vec2 w1 = mix(bub, tang, tg);
      float mo2 = sm1((mo - 0.1 - aSeed.w * 0.3) / 0.6);
      loc = mix(w1, aTgt.xy, mo2);
      s.ct = mix(vec2(0.5, 0.0), aTCol.xy, mo2);
      s.cw = mix(0.05, aTCol.z, mo2);
      if (part > 1.5) {                   // the check mark draws along its stroke once the card has formed
        float drawn = sm1((M.z - aAux2.w) / 0.08);
        b *= mix(1.0 - mo2, 1.3, drawn);
        s.cw = mix(s.cw, 0.5, drawn);
      }
    }
    s.goal = C.xyz + vec3(loc * C.w, aTgt.z + j.z * 0.02 * (1.0 - mo));
    s.k = mix(110.0, 230.0, mo) * max(form, 0.04); s.z = 0.84;
    s.brT = b * M.w * form;
    s.tw = 0.35;
  } else if (role < 4.5) {                // the thin line with one gap; it draws from the left
    float vis = sm1((uP.x - aAux.x) / 0.06);
    s.brT *= vis * form;
    s.goal = aTgt.xyz + vec3(0.0, (aSeed.y - 0.5) * 0.004, 0.0);
    s.k = 120.0;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 04 · 신경망: 작은 말풍선이 날아와 신경세포(핵 + 휘어 갈라지는 가지)로 자란다. 에이전트가 카드를 안고 한 세포에 닿으면
   신호가 가지를 따라 달리고 틈에서 불꽃이 튀며 뜻이 가까운 한 무리만 켜진다. 신호는 다시 가지를 타고 에이전트로 모인다.
   세포 입자: aMeta.xyz = 핵, aMeta.w = 태어나는 때, aAux = (세포, 켜지는 때, 가져오는 신호가 지나는 때, 자라는 지연),
   aAux2 = (역할, 가지 위 위치, 길 위인가, 작은 말풍선 각도) */
const SIM_M4 = `
void m4(inout St s, float t, float form){
  float role = aAux2.x;
  vec3 j = aSeed.xyz - 0.5;
  if (role < 2.5) {                       // a neuron: nucleus and branches
    vec3 cj = aMeta.xyz;
    float aj = aMeta.w;
    if (t < aj) {                         // still a small speech bubble flying in
      float fly = (t - (aj - 1.3)) / 1.3;
      float e = 0.5 - 0.5 * cos(3.14159265 * clamp(fly, 0.0, 1.0));
      vec3 c = bez(cj + uQ.xyz, cj + uS.xyz, cj, e);
      float ang = aAux2.w * 6.2831853;
      vec2 o = vec2(cos(ang) * 0.072, sin(ang) * 0.046);
      if (aSeed.w < 0.14) o = mix(vec2(-0.028, -0.044), vec2(-0.05, -0.082), aSeed.z);
      s.goal = c + bb(o * uP.x);
      s.k = 260.0; s.z = 0.85;
      s.brT = 0.62 * step(aSeed.y, 0.32) * sm1(fly * 3.0) * form;
      s.ct = vec2(0.5, 0.0); s.cw = 0.12; s.tw = 0.15;
    } else {
      float g = sm1((t - aj - aAux.w) / 0.22);
      s.goal = mix(cj, aTgt.xyz, g) + j * 0.004;
      float lit = sm1((t - aAux.y) / 0.14);
      float fr = exp(-sq((t - aAux.y) / 0.06)) * step(-0.2, t - aAux.y);
      float fr2 = exp(-sq((t - aAux.z) / 0.06));
      float path = aAux2.z;
      float g0 = sm1((t - aj) / 0.12);
      s.brT = (aTgt.w * (1.0 + 1.9 * lit + 1.2 * path * uP.w) + 1.7 * fr + 1.5 * fr2) * max(g, 0.25 * g0) * form;
      s.brT *= 1.0 - 0.42 * uP.w * (1.0 - lit) * (1.0 - path);   // once the signal is back, the cells that stayed dark step back
      s.cw = aTCol.z + 0.35 * lit + 0.75 * max(fr, fr2);
      s.ct = mix(aTCol.xy, vec2(0.62, 0.0), lit);
      s.k = 150.0; s.z = 0.85;
    }
  } else if (role < 3.5) {                // the to-do card the agent carries in
    vec4 C = uArr[16];
    s.goal = uAg.xyz + C.xyz + bb(aTgt.xy * C.w);
    s.gv = uAgV.xyz;
    s.k = 280.0; s.z = 0.86;
    s.brT *= uP.z * form;
  } else if (role < 4.5) {                // sparks where a signal jumps the gap between two branch tips
    float ts = aAux.w;
    float e = eOut((t - ts) / 0.32);
    vec3 d = sphereDir(aSeed.xy) * (0.35 + 0.65 * aSeed.z);
    s.goal = aAux.xyz + d * 0.07 * e;
    s.k = 500.0; s.z = 0.9;
    s.brT = 2.2 * exp(-max(t - ts, 0.0) * 5.5) * step(ts, t) * step(t, ts + 1.2);
    s.ct = vec2(0.75, 0.0); s.cw = 0.7; s.tw = 0.6;
  } else if (role < 5.5) {                // the glowing path from the lit cells to the agent
    float u = aAux2.y;
    vec3 P = bez(uArr[17].xyz, uArr[18].xyz, uAg.xyz, u);
    s.goal = P + bb(j.xy * 0.012);
    s.k = 300.0; s.z = 0.88;
    float vis = sm1((uP.y - u) / 0.06);
    float fr = exp(-sq((t - (uArr[19].x + u * uArr[19].y)) / 0.06));
    s.brT = (aTgt.w * (0.8 + 1.2 * uP.w) + 1.6 * fr) * vis * form;
    s.cw = 0.3 + 0.6 * fr; s.ct = vec2(0.66, 0.0);
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 05 · 자리에 없어도: 고리(사람 여섯 + 가운데 에이전트), 고리 밖에서 묻는 사람, 밤과 초승달,
   빈 원 앞에서 멈춘 질문 말풍선과 "입력 중" 점 셋, 말풍선을 받아 묻는 사람에게 가는 답 빛줄기 */
const SIM_M5 = `
void m5(inout St s, float t, float form){
  float role = aAux2.x;
  vec3 j = aSeed.xyz - 0.5;
  if (role < 2.5) {                       // the faint ring line
    s.brT *= form * uP.x;
  } else if (role < 3.5) {                // the crescent moon
    s.goal = uArr[16].xyz + aTgt.xyz;
    s.brT *= uArr[16].w * form;
    s.k = 120.0;
  } else if (role < 4.5) {                // the question bubble
    vec4 C = uArr[17];
    vec4 M = uArr[18];
    s.goal = mix(C.xyz + aTgt.xyz * C.w, uAg.xyz + j * 0.03, eInOut(M.y));
    s.brT *= M.x * (1.0 - 0.92 * sm1(M.y * 1.4)) * form;
    s.k = mix(220.0, 300.0, M.y); s.z = 0.86;
    s.tw = 0.3;
  } else if (role < 5.5) {                // typing dots
    int d = int(aAux2.y + 0.5);
    vec4 B = uArr[20];
    float on = d == 0 ? B.x : d == 1 ? B.y : B.z;
    s.goal = uArr[19].xyz + aTgt.xyz;
    s.brT *= on * uArr[19].w * form;
    s.k = 200.0;
  } else if (role < 6.5) {                // the answer: a beam from the agent to the asker that stays as a thin line
    vec3 a = uArr[21].xyz;
    vec3 e = uArr[22].xyz;
    float u = aAux2.y;
    float head = uP.y;
    vec3 d = e - a;
    vec3 side = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    s.goal = a + d * u + side * j.y * 0.006;
    s.k = 260.0; s.z = 0.88;
    float vis = sm1((head - u) / 0.04);
    float hd = exp(-sq((u - head) / 0.07)) * step(head, 1.02) * step(0.001, head);
    s.brT = (aTgt.w * (0.55 + 0.9 * uP.z) + 1.6 * hd) * vis * form;
    s.cw = 0.35 + 0.5 * hd; s.ct = vec2(0.9, 0.0); s.tw = 0.2;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 06 · 아낀 30분: 초승달이 지고, 바늘 없는 시계판 하나, 일하는 사람 하나, 떨어진 자리의 에이전트.
   질문 말풍선 셋을 에이전트가 받아 낼 때마다 그 빛이 시계로 흘러가 12시부터 60도씩 채우고, 반이 차면 "30분" 이 남는다.
   uArr[16] 달, [17] 부채꼴 셋의 채움, [18 + b] 말풍선 (가운데, 크기), [21 + b] (보임, 받음, 시계로), [24 + b] 부채꼴 가운데와 퍼짐 */
const SIM_M6 = `
void m6(inout St s, float t, float form){
  float role = aAux2.x;
  vec3 j = aSeed.xyz - 0.5;
  if (role < 2.5) {                       // the crescent sets
    s.goal = uArr[16].xyz + aTgt.xyz;
    s.brT *= uArr[16].w * form;
    s.k = 120.0;
  } else if (role < 3.5) {                // the clock face: rim and twelve ticks, drawn around from twelve
    s.brT *= sm1((uP.x - aAux2.y) / 0.08) * form;
    s.k = 150.0;
  } else if (role < 4.5) {                // the three ten-minute sectors
    int k = int(aAux2.y + 0.5);
    vec4 F = uArr[17];
    float fill = k == 0 ? F.x : k == 1 ? F.y : F.z;
    float lit = sm1((fill - aAux2.z) * 9.0);
    s.goal = aTgt.xyz + j * 0.004;
    s.brT *= lit * form * (0.9 + 0.1 * sin(uTime * 2.0 + aSeed.x * 6.28));
    s.k = 150.0;
  } else if (role < 5.5) {                // questions: the agent catches them away from the person, and their light runs into the clock
    int b = int(aAux2.y + 0.5);
    vec4 C = uArr[18 + b];
    vec4 M = uArr[21 + b];
    vec4 K = uArr[24 + b];
    vec3 held = uAg.xyz + j * 0.035;
    vec3 g1 = mix(C.xyz + aTgt.xyz * C.w, held, eInOut(M.y));
    float go = eInOut((M.z - aSeed.w * 0.35) / 0.65);
    vec2 sp = rot(vec2(K.w * sqrt(aSeed.y), 0.0), aSeed.x * 6.2831853);
    s.goal = mix(g1, K.xyz + vec3(sp, 0.0), go);
    s.k = mix(240.0, 340.0, max(M.y, go)); s.z = 0.86;
    s.brT *= M.x * (1.0 - 0.5 * sm1(M.y * 1.4)) * (1.0 - sm1((go - 0.65) / 0.35)) * form;
    s.ct = mix(s.ct, vec2(0.62, 0.0), go); s.cw = mix(s.cw, 0.4, go);
    s.tw = 0.5;
  } else if (role < 6.5) {                // "30 min" in particle letters
    float e = sm1((t - uP.y - aMeta.w * 0.35) / 0.45);
    s.goal = mix(aAux.xyz, aTgt.xyz, e);
    s.brT *= e * form;
    s.k = mix(60.0, 200.0, e); s.z = 0.85;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 07 · 리뷰: 에이전트가 줄을 써 내려가며 코드 페이지가 생기고, 리뷰 댓글 조각이 달린다. 승인한 사람(호박 공)이
   승인한 조각만 체크가 붙은 규칙 줄로 굳고, 나머지는 흐린 테두리로 남는다. 끝에 에이전트가 규칙 줄을 따라 지나간다.
   조각 f: uArr[16 + f] = (가운데, 보임), uArr[21 + f] = (규칙 줄로 바뀜, 탈락, 빛남, 체크) */
const SIM_M7 = `
void m7(inout St s, float t, float form){
  float role = aAux2.x;
  if (role < 2.5) {                       // the code page: each line runs out of the agent's margin to the right
    float dtw = t - aAux2.y;
    float w = sm1(dtw / 0.06);
    float hd = aAux2.z * exp(-sq(dtw / 0.06)) * step(0.0, dtw);
    s.brT = (s.brT * w * (1.0 - 0.45 * uP.x) + 1.3 * hd) * form;
    s.cw += 0.6 * hd;
    s.goal = aTgt.xyz;
    s.k = 200.0;
  } else if (role < 3.5) {                // review comments that become rules or stay as faint outlines
    int f = int(aAux2.y + 0.5);
    vec4 F = uArr[16 + f];
    vec4 M = uArr[21 + f];
    float part = aAux2.z;
    float mo = eInOut(M.x);
    vec2 loc = mix(aAux.xy, aTgt.xy, mo);
    s.goal = F.xyz + vec3(loc, aTgt.z);
    s.k = 220.0; s.z = 0.85;
    float b = aTgt.w * F.w;
    if (part < 0.5) b *= mix(1.0, 0.32, M.y);
    else if (part < 1.5) b *= 1.0 - M.y;
    else b *= sm1((M.w - aAux2.w) / 0.08) * step(0.5, M.x) * 1.3;
    b *= 1.0 + 1.3 * M.z;
    s.brT = b * form;
    s.cw = mix(aTCol.z, 0.02, M.y) + 0.4 * M.z;
    s.ct = part > 1.5 ? vec2(0.5, 0.0) : mix(aTCol.xy, vec2(0.45, 0.3), M.y);
    s.tw = 0.3;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 08 · 폴더: 엉킨 코드 줄 덩어리가 풀려 탭 달린 폴더 아홉 개가 되고, 에이전트들이 제 폴더로 들어가 일한다.
   주인공이 옆 폴더 벽을 넘으면 벽 면이 번쩍이고 물결이 퍼져 닿고, 잠시 뒤 돌아온다. 넘은 벽에는 주황 테두리가 남는다.
   폴더 입자: aMeta.xyz = 덩어리 속 자리, aMeta.w = 순서, aAux = (폴더, 넘은 벽, 부분, -), uArr[24 + f] = (빛남, 정리되는 때) */
const SIM_M9 = `
void m9(inout St s, float t, float form){
  float role = aAux2.x;
  if (role < 2.5 || (role > 3.5 && role < 4.5)) {   // folders, and the face of the wall that gets crossed
    int f = int(aAux.x + 0.5);
    vec4 FU = uArr[24 + f];
    float e = sm1((t - FU.y - aMeta.w * 0.4) / 0.55);
    vec3 wob = vec3(sin(uTime * 1.3 + aSeed.x * 17.0), cos(uTime * 1.1 + aSeed.y * 13.0), sin(uTime * 0.9 + aSeed.z * 11.0)) * 0.02;
    s.goal = mix(aMeta.xyz + wob, aTgt.xyz, e);
    s.k = mix(70.0, 170.0, e) * max(form, 0.04); s.z = 0.82;
    float part = aAux.z;
    float b = aTgt.w;
    if (part > 0.5 && part < 1.5) {       // code stripes glow while an agent works in the folder
      b *= 1.0 + 1.7 * FU.x;
      s.cw = aTCol.z + 0.45 * FU.x;
    }
    s.ct = mix(vec2(0.1, 0.0), aTCol.xy, e);
    if (role > 3.5) {
      float fl = uP.x;
      if (part > 3.5) {                   // the wall's outline: flashes, then stays thin clay
        b = b * (1.0 + 3.5 * fl) + 1.7 * uP.y * e;
        s.ct = mix(s.ct, vec2(0.0, 0.0), uP.y);
        s.cw = mix(s.cw, 0.0, uP.y) + 0.6 * fl;
      } else {                            // the wall face itself
        b = b * e + 1.25 * fl + 0.07 * uP.y * e;   // the outline carries the mark; the face keeps only a trace of clay
        s.ct = mix(s.ct, vec2(0.0, 0.0), 0.85 * uP.y);
        s.cw = aTCol.z + 0.7 * fl;
      }
      s.flash = fl * 0.9 * step(part, 3.5);
    }
    s.brT = b * max(form, 0.05) * (0.35 + 0.65 * e);
  } else if (role < 3.5) {                // the other agents: smaller and dimmer than the hero
    int i = int(aAux.x + 0.5);
    vec4 A = uArr[16 + i];
    s.goal = A.xyz + aTgt.xyz * A.w;
    s.gv = uArr[20 + i].xyz;
    s.k = 300.0; s.z = 0.86;
    s.brT *= uArr[20 + i].w * form;
    s.tw = 0.4;
  } else if (role < 5.5) {                // the test's ripple: thin rings grow from the crossing to the hero
    float lag = aSeed.y < 0.62 ? 0.0 : 0.07;
    float rr2 = max(uQ.w - lag, 0.0);
    float a = aSeed.x * 6.2831853;
    s.goal = uQ.xyz + (uCamR * cos(a) + uCamU * sin(a)) * rr2 + aAux.xyz * 0.004;
    s.brT *= uP.z * (lag > 0.0 ? 0.55 : 1.0) * step(0.001, rr2);
    s.ct = vec2(0.2, 0.0); s.cw = 0.22;
    s.k = 900.0; s.z = 0.95;
    s.tw = 0.2;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

/* 09 · 연락: 입자가 모여 이름이 되고, 에이전트는 연락처 옆에 머문다. 링크를 가리키면 그쪽으로 빛줄기를 뻗는다 */
const SIM_M10 = `
void m10(inout St s, float t, float form, float dt){
  float role = aAux2.x;
  if (role < 2.5) {                       // the name
    s.k = 150.0 * max(form, 0.04); s.z = 0.8;
    s.brT *= form;
  } else if (role < 3.5) {                // the beam toward the link under the pointer
    vec3 a = uAg.xyz;
    vec3 e = uArr[16].xyz;
    float u = fract(aSeed.x + uTime * 1.3);
    float u0 = fract(aSeed.x + (uTime - dt) * 1.3);
    vec3 d = e - a;
    vec3 side = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    s.goal = a + d * (u * uP.y) + side * (aSeed.y - 0.5) * 0.01;
    if (wrapped(u, u0)) s.jump = true;
    s.gv = d * uP.y * 1.3;
    s.k = 400.0; s.z = 0.9;
    s.brT *= uP.x * (0.55 + 0.45 * (1.0 - u));
    s.tw = 0.6;
  } else {
    s.brT = 0.0; s.k = 10.0;
  }
}
`;

const SIM_MAIN = `
void main(){
  St s;
  s.p = aPos.xyz; s.v = aVel.xyz;
  float br = aPos.w;
  vec4 col = aCol;
  s.goal = aTgt.xyz; s.gv = vec3(0.0); s.k = 0.0; s.z = 0.8; s.brT = aTgt.w;
  s.ct = aTCol.xy; s.cw = aTCol.z; s.tw = aTCol.w; s.flash = 0.0; s.acc = vec3(0.0); s.jump = false;
  float dt = uDt;
  float t = uPhaseT;
  vec3 nz = vec3(0.0);
  if (uNoise > 0.0) nz = curl(s.p * uNoiseFreq + vec3(0.0, 0.0, uTime * 0.12)) * uNoise;

  if (uKick > 0.0) {
    float loc = uKickR > 0.0 ? 0.15 : 1.0;
    vec3 d = s.p - uKickC;
    d.xy += (aSeed.xy - 0.5) * 0.6 * loc;
    d.z += (aSeed.z - 0.5) * 0.9 * loc;
    float f = uKickR > 0.0 ? exp(-dot(d, d) / (uKickR * uKickR)) : 1.0;
    vec3 dir = mix(normalize(d + vec3(1e-4)), sphereDir(aSeed.zw), uKickShell);
    float mag = mix(0.35 + 0.9 * aSeed.w, 0.86 + 0.28 * aSeed.x, uKickShell);
    s.v = s.v * (1.0 - 0.6 * uKickShell * f) + (dir * uKick * mag + uKickBias * (0.4 + 0.9 * aSeed.y)) * f;
  }

  bool sprung = true;
  float role = aAux2.x;
  if (uMode == 0) {                       // free: swirling curl-noise cloud
    s.acc += nz + cloud(s.p, uP.w) + uWind;
    s.v += s.acc * dt;
    s.v *= exp(-uDrag * dt);
    sprung = false;
  } else if (uMode == 1) {                // assemble / hold: spring to target
    float delay = aMeta.w * uStagger + aSeed.x * uP.x;
    float a = sm1((uPhaseT - delay) / uRamp);
    float kk = uK * a;
    s.acc += (aTgt.xyz - s.p) * kk - s.v * (2.0 * uZeta * sqrt(kk) + uDrag * (1.0 - a)) + nz * (1.0 - 0.9 * a) + cloud(s.p, 1.5) * (1.0 - a) * uP.y;
    s.v += s.acc * dt;
    sprung = false;
  } else if (uMode == 8) {                // galaxy: a turning spiral disk behind the reading sections
    s.goal = galaxy(aSeed, uTime);
    s.k = uS.x; s.z = 0.9;
    nz *= 0.35;
    float rr = pow(aSeed.x, 1.35);
    float hue = fract(aSeed.w * 7.31 + aSeed.y * 3.17);
    s.ct = vec2(hue < 0.45 ? 0.08 : hue < 0.8 ? 0.5 : 0.95, sm1(rr * 1.6) * 0.8);
    s.cw = 0.55 * (1.0 - sm1(rr * 2.2));
    s.tw = 0.3;
    s.brT = (0.55 + 0.45 * aSeed.w) * (1.0 - 0.45 * rr) * uS.y;
    s.acc += nz;
  } else if (uMode == 11) {               // the cut between scenes 7 and 8: all but the agent stay put and go dark
    if (role > 19.5 && role < 20.5) agentRole(s);
    else { s.goal = s.p; s.gv = vec3(0.0); s.k = 40.0; s.z = 1.0; s.brT = 0.0; }
  } else {
    bool keep = gl_VertexID >= uKeep.x && gl_VertexID < uKeep.y;
    float form = keep ? 1.0 : sm1((uRT - aMeta.w * uStagger) / uForm);
    s.k = 120.0 * max(form, 0.04);
    if (role > 19.5 && role < 20.5) agentRole(s);
    else if (role > 20.5 && role < 21.5) personRole(s, form);
    else if (role > 28.5 && role < 29.5) dustRole(s, form);
    else if (role > 29.5) { s.brT = 0.0; s.k = 8.0; }
    else if (uMode == 2) m2(s, t, form, dt);
    else if (uMode == 3) m3(s, t, form);
    else if (uMode == 4) m4(s, t, form);
    else if (uMode == 5) m5(s, t, form);
    else if (uMode == 6) m6(s, t, form);
    else if (uMode == 7) m7(s, t, form);
    else if (uMode == 9) m9(s, t, form);
    else if (uMode == 10) m10(s, t, form, dt);
    s.acc += nz * (1.0 - form) * 0.8;
  }

  if (sprung) {
    bool held = (gl_VertexID >= uKeep.x && gl_VertexID < uKeep.y) || (uAgKeep > 0.5 && role > 19.5 && role < 20.5);
    float ra = held ? 1.0 : sm1(uRT / uRamp);
    s.acc += spring(s.p, s.v, s.goal, s.gv, s.k * max(ra, 0.04), s.z) + nz * 0.6 * (1.0 - ra);
    s.v += s.acc * dt;
  }
  if (s.jump) { s.p = s.goal; s.v = s.gv; }
  // the cut: everything jumps to its new place; the agent jumps to the same spot on screen and stays lit
  if (uSnap > 0.5) { bool ag = role > 19.5 && role < 20.5; s.p = s.goal; s.v = ag ? s.gv : vec3(0.0); if (!ag) br = 0.0; }

  if (uPointer.w > 0.0) {
    vec4 clip = uVP * vec4(s.p, 1.0);
    if (clip.w > 0.05) {
      vec2 ndc = clip.xy / clip.w;
      vec2 d = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
      float r = length(d);
      if (r < uPointer.z) {
        float f = 1.0 - r / uPointer.z;
        vec3 push = uCamR * (d.x / max(r, 1e-4)) + uCamU * (d.y / max(r, 1e-4));
        s.v += push * f * f * uPointer.w * dt;
      }
    }
  }
  if (uVmax > 0.0) { float sp = length(s.v); if (sp > uVmax) s.v *= uVmax / sp; }
  s.p += s.v * dt;
  vec3 de = s.p - uEye;
  float dl = length(de);
  if (dl < 0.22) s.p = uEye + de / max(dl, 1e-4) * 0.22;
  if (s.brT < 0.002) br *= exp(-dt * 9.0);
  br += (s.brT - br) * (1.0 - exp(-dt * 5.0));
  br = max(br, s.flash);
  float cr = 1.0 - exp(-dt * uColRate);
  col.xy += (s.ct - col.xy) * cr;
  col.z += (s.cw - col.z) * cr;
  col.w += (s.tw - col.w) * cr;
  vPos = vec4(s.p, br);
  vVel = vec4(s.v, 0.0);
  vCol = col;
}`;

const SIM_VS = SIM_HEAD + SIM_M2 + SIM_M3 + SIM_M4 + SIM_M5 + SIM_M6 + SIM_M7 + SIM_M9 + SIM_M10 + SIM_MAIN;
const SIM_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(0.0); }`;

/* 렌더 모드: 0 그대로 1 나선의 가로대 맥박(한 번만) */
const PAL = `
vec3 pal(float t){
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(uClay, uAmber, t * 2.0) : mix(uAmber, uCream, t * 2.0 - 1.0);
}`;
const PT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aCol;
layout(location=5) in vec4 aMeta;
layout(location=8) in vec4 aSeed;
uniform mat4 uVP;
uniform float uPx, uFocus, uTime, uBright, uWhite, uJitter, uPulse, uPulseT, uPulseGap, uDof, uVar, uMaxPx, uShift;
uniform vec4 uMask;
uniform float uMaskA, uTopA, uFixB;
uniform int uRMode, uFixEnd;
uniform vec3 uClay, uAmber, uCream;
out vec3 vCol;
out float vSoft;
${PAL}
void main(){
  vec3 p = aPos.xyz;
  float ph = aSeed.x * 6.2831853 + uTime * (0.7 + aSeed.y * 1.1);
  p.xy += vec2(sin(ph), cos(ph * 1.31 + aSeed.z * 4.0)) * uJitter;
  vec4 clip = uVP * vec4(p, 1.0);
  gl_Position = clip;
  float w = max(clip.w, 0.05);
  float soft = clamp(aCol.y, 0.0, 1.0);
  float speed = length(aVel.xyz);
  float glow = 0.0;
  if (uRMode == 1 && uPulse > 0.0) {
    float kind = aMeta.x;
    float tk = uPulseT - aMeta.z * uPulseGap;
    float e = aMeta.y;
    if (kind < 0.5) {
      float fd = tk / 0.55;
      glow = (fd > -0.2 && fd < 1.2) ? exp(-pow((e - fd) * 5.0, 2.0)) * 1.8 : 0.0;
    } else if (kind < 1.5) {
      float t2 = tk - 0.55;
      glow = t2 > 0.0 ? exp(-t2 * 2.4) * 1.6 + 0.25 : 0.0;
    } else if (kind < 2.5) {
      glow = tk > 0.0 ? exp(-tk * 3.5) * 1.1 + 0.12 : 0.0;
    }
    glow *= uPulse;
  }
  vec3 base = pal(aCol.x - uShift + (aSeed.y - 0.5) * uVar);
  float hl = clamp(aCol.z + uWhite + glow * 0.45 + min(speed * 0.05, 0.25), 0.0, 1.0);
  vec3 col = mix(base, uCream, hl);
  float dof = 1.0 + uDof * min(abs(w - uFocus) / uFocus, 2.5);
  float size = uPx * (uFocus / w) * (0.72 + 0.56 * aSeed.z) * (1.0 + 1.3 * soft) * dof;
  float b = aPos.w * (gl_VertexID < uFixEnd ? uFixB : uBright) * (1.0 + glow * 1.5 + min(speed * 0.06, 0.4));
  float ps = clamp(size, 1.0, uMaxPx);
  b *= clamp(pow(uPx / ps, 1.85), 0.004, 1.5);
  b *= smoothstep(0.18, 0.5, w / uFocus);
  vec2 mq = abs((clip.xy / w - uMask.xy) / uMask.zw);
  b *= 1.0 - uMaskA * (1.0 - smoothstep(0.78, 1.12, pow(pow(mq.x, 4.0) + pow(mq.y, 4.0), 0.25)));
  b *= 1.0 - uTopA * smoothstep(0.66, 0.76, clip.y / w);
  gl_PointSize = ps;
  vCol = col * b;
  vSoft = soft;
}`;

const PT_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vSoft;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float k = mix(3.2, 1.6, vSoft);
  float e = exp(-k);
  float f = (exp(-r2 * k) - e) / (1.0 - e);
  o = vec4(vCol * f, 1.0);
}`;

/* 혜성 꼬리: 입자마다 속도 반대쪽으로 가늘어지는 띠를 하나씩 그린다. 길이는 입자의 꼬리 값 × 속도 */
const ST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aCol;
layout(location=8) in vec4 aSeed;
uniform mat4 uVP;
uniform float uPx, uFocus, uBright, uTail, uGain, uMaxLen, uVar, uWhite, uLenK, uShift, uFixB, uAgMax;
uniform int uFixEnd, uAgEnd;
uniform vec2 uView;
uniform vec4 uMask;
uniform float uMaskA, uTopA;
uniform vec3 uClay, uAmber, uCream;
out vec3 vCol;
out float vAcross;
${PAL}
void main(){
  int id = gl_VertexID;
  float tailEnd = float(id >> 1);
  float side = float(id & 1) * 2.0 - 1.0;
  vec3 v = aVel.xyz;
  float speed = length(v);
  float L = min(speed * uTail * aCol.w, uMaxLen);
  if (gl_InstanceID < uAgEnd) L = min(L, uAgMax);   // the agent keeps a short tail, never a comet
  vec3 head = aPos.xyz;
  vec3 tail = head - (speed > 1e-4 ? v / speed : vec3(0.0)) * L;
  vec4 ch = uVP * vec4(head, 1.0);
  vec4 cT = uVP * vec4(tail, 1.0);
  float vis = step(0.06, ch.w) * step(0.06, cT.w) * smoothstep(0.2, 1.0, speed) * step(0.02, aCol.w);
  vec2 sh = ch.xy / max(ch.w, 0.06) * uView * 0.5;
  vec2 sT = cT.xy / max(cT.w, 0.06) * uView * 0.5;
  vec2 dir = sh - sT;
  float dl = length(dir);
  vec2 n = dl > 1e-3 ? vec2(-dir.y, dir.x) / dl : vec2(0.0, 1.0);
  float wHead = clamp(uPx * (uFocus / max(ch.w, 0.05)) * 0.4, 0.6, 9.0);
  float wpx = mix(wHead, 0.4, tailEnd);
  vec4 c = tailEnd < 0.5 ? ch : cT;
  c.xy += n * side * wpx / uView * 2.0 * c.w;
  if (vis < 0.5 || dl < 1.5) c = vec4(4.0, 4.0, 0.0, 1.0);
  gl_Position = c;
  vec3 col = mix(pal(aCol.x - uShift + (aSeed.y - 0.5) * uVar), uCream, clamp(aCol.z + uWhite + 0.15, 0.0, 1.0));
  float b = aPos.w * (gl_InstanceID < uFixEnd ? uFixB : uBright) * uGain * (1.0 - 0.55 * clamp(aCol.y, 0.0, 1.0)) * (1.0 - tailEnd) * min(1.0, smoothstep(0.2, 1.4, speed));
  b *= pow(clamp(28.0 / max(dl, 1.0), 0.0, 1.0), uLenK);
  b *= smoothstep(0.18, 0.5, ch.w / uFocus);
  vec2 mq = abs((ch.xy / max(ch.w, 0.06) - uMask.xy) / uMask.zw);
  b *= 1.0 - uMaskA * (1.0 - smoothstep(0.78, 1.12, pow(pow(mq.x, 4.0) + pow(mq.y, 4.0), 0.25)));
  b *= 1.0 - uTopA * smoothstep(0.66, 0.76, ch.y / max(ch.w, 0.06));
  vCol = col * b;
  vAcross = side;
}`;

const ST_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vAcross;
out vec4 o;
void main(){ float f = 1.0 - vAcross * vAcross; o = vec4(vCol * f, 1.0); }`;

const QUAD_VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uDecay;
out vec4 o;
void main(){ o = vec4(max(texture(uTex, vUv).rgb * uDecay - 0.0015, 0.0), 1.0); }`;

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main(){
  vec3 s = texture(uTex, vUv).rgb * 4.0;
  s += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  s += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  o = vec4(s / 8.0, 1.0);
}`;

const UP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uAdd;
uniform vec2 uTexel;
out vec4 o;
void main(){
  vec2 t = uTexel;
  vec3 s = texture(uTex, vUv + vec2(-2.0, 0.0) * t).rgb + texture(uTex, vUv + vec2(2.0, 0.0) * t).rgb
         + texture(uTex, vUv + vec2(0.0, -2.0) * t).rgb + texture(uTex, vUv + vec2(0.0, 2.0) * t).rgb;
  s += 2.0 * (texture(uTex, vUv + vec2(-1.0, 1.0) * t).rgb + texture(uTex, vUv + vec2(1.0, 1.0) * t).rgb
            + texture(uTex, vUv + vec2(1.0, -1.0) * t).rgb + texture(uTex, vUv + vec2(-1.0, -1.0) * t).rgb);
  o = vec4(s / 12.0 + texture(uAdd, vUv).rgb, 1.0);
}`;

/* 자동 노출: 가장 작은 블룸 단계의 평균 밝기를 1x1 에 적는다. 밝아질 때는 바로 따라가 번쩍임을 막고,
   어두워질 때는 천천히 돌아온다. 값은 a/(1+a) 로 눌러 담아 8비트에서도 쓴다 */
const AVG_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform float uDown;
out vec4 o;
void main(){
  vec3 s = vec3(0.0);
  float ws = 0.0;
  for (int y = 0; y < 6; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(8.0, 6.0);
    float w = 1.0 - 0.45 * length(uv - 0.5);
    s += texture(uTex, uv).rgb * w;
    ws += w;
  }
  s /= ws;
  float a = dot(s, vec3(0.42, 0.42, 0.16));
  float pe = texture(uPrev, vec2(0.5)).r;
  float prev = pe / max(1.0 - pe, 1e-3);
  float na = a > prev ? a : mix(prev, a, uDown);
  o = vec4(na / (1.0 + na), 0.0, 0.0, 1.0);
}`;

/* 바탕은 F 와 같은 따뜻한 검정. uFlash 는 폭발 순간 화면 가운데를 잠깐 밝힌다 */
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uAvg;
uniform float uExposure, uBloomStr, uAspect, uDim, uFlash, uKey, uAEPow;
uniform vec2 uBgM;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float ae = texture(uAvg, vec2(0.5)).r;
  float A = ae / max(1.0 - ae, 1e-3) * uExposure;
  float e = A > uKey ? pow(uKey / A, uAEPow) : 1.0;
  vec3 c = texture(uScene, vUv).rgb * uExposure * e;
  vec3 b = texture(uBloom, vUv).rgb * uBloomStr * e;
  vec3 m = (1.0 - exp(-(c + b))) * uDim;
  vec2 q = (vUv - vec2(0.5, 0.54)) * vec2(uAspect, 1.0);
  float g = smoothstep(1.3, 0.0, length(q));
  vec3 bg = mix(vec3(0.014, 0.011, 0.009), vec3(0.068, 0.050, 0.039), g);
  bg *= uBgM.x;
  bg += vec3(0.030, 0.016, 0.004) * uBgM.y * g;
  bg += vec3(1.0, 0.80, 0.58) * uFlash * g * g * 0.1;
  vec3 outc = 1.0 - (1.0 - bg) * (1.0 - m);
  outc += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(outc, 1.0);
}`;

/* ------------------------------------------------------------ gl helpers */
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs, varyings) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

let simP, ptP, stP, fadeP, downP, upP, compP, avgP;
try {
  simP = program(SIM_VS, SIM_FS, ['vPos', 'vVel', 'vCol']);
  ptP = program(PT_VS, PT_FS);
  stP = program(ST_VS, ST_FS);
  fadeP = program(QUAD_VS, FADE_FS);
  downP = program(QUAD_VS, DOWN_FS);
  upP = program(QUAD_VS, UP_FS);
  compP = program(QUAD_VS, COMP_FS);
  avgP = program(QUAD_VS, AVG_FS);
} catch (err) {
  fail(err);
  return;
}

/* -------------------------------------------------------------- buffers */
/* 상태(위치·속도·색)는 두 벌을 번갈아 쓰고, 목표·보조 값은 장면이 바뀔 때만 올린다.
   처음 자리는 화면 깊숙이 도는 원반이라, 이름이 먼 곳에서 날아와 모인다 */
const stateP = [gl.createBuffer(), gl.createBuffer()];
const stateV = [gl.createBuffer(), gl.createBuffer()];
const stateC = [gl.createBuffer(), gl.createBuffer()];
const tgtBuf = gl.createBuffer(), tcolBuf = gl.createBuffer(), metaBuf = gl.createBuffer();
const auxBuf = gl.createBuffer(), aux2Buf = gl.createBuffer(), seedBuf = gl.createBuffer();
{
  const r = rng(7);
  const P = new Float32Array(N * 4), V = new Float32Array(N * 4), C = new Float32Array(N * 4), S = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const rr = Math.pow(r(), 0.8), th = r() * Math.PI * 2;
    P[i * 4] = Math.cos(th) * rr * 2.2;
    P[i * 4 + 1] = Math.sin(th) * rr * 1.3 + (r() - 0.5) * 0.2;
    P[i * 4 + 2] = -1.2 - r() * 3.2;
    P[i * 4 + 3] = 0.45 + 0.55 * r();
    V[i * 4] = -Math.sin(th) * 0.8; V[i * 4 + 1] = Math.cos(th) * 0.5; V[i * 4 + 2] = 0.6 + r() * 0.6;
    C[i * 4] = 0.3 + r() * 0.35; C[i * 4 + 1] = 0; C[i * 4 + 2] = 0.2; C[i * 4 + 3] = 0.4;
    S[i * 4] = r(); S[i * 4 + 1] = r(); S[i * 4 + 2] = r(); S[i * 4 + 3] = r();
  }
  for (let k = 0; k < 2; k++) {
    gl.bindBuffer(gl.ARRAY_BUFFER, stateP[k]); gl.bufferData(gl.ARRAY_BUFFER, P, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, stateV[k]); gl.bufferData(gl.ARRAY_BUFFER, V, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, stateC[k]); gl.bufferData(gl.ARRAY_BUFFER, C, gl.DYNAMIC_COPY);
  }
  const Z = new Float32Array(N * 4), T0 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) T0[i * 4 + 3] = P[i * 4 + 3];
  for (const b of [tcolBuf, metaBuf, auxBuf, aux2Buf]) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, Z, gl.DYNAMIC_DRAW); }
  gl.bindBuffer(gl.ARRAY_BUFFER, tgtBuf); gl.bufferData(gl.ARRAY_BUFFER, T0, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, tcolBuf); gl.bufferData(gl.ARRAY_BUFFER, C, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); gl.bufferData(gl.ARRAY_BUFFER, S, gl.STATIC_DRAW);
}
function attrib(loc, buf, divisor) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  if (divisor) gl.vertexAttribDivisor(loc, divisor);
}
const vaos = [0, 1].map(k => {
  const v = gl.createVertexArray();
  gl.bindVertexArray(v);
  attrib(0, stateP[k]); attrib(1, stateV[k]); attrib(2, stateC[k]);
  attrib(3, tgtBuf); attrib(4, tcolBuf); attrib(5, metaBuf); attrib(6, auxBuf); attrib(7, aux2Buf); attrib(8, seedBuf);
  gl.bindVertexArray(null);
  return v;
});
const streakVaos = [0, 1].map(k => {
  const v = gl.createVertexArray();
  gl.bindVertexArray(v);
  attrib(0, stateP[k], 1); attrib(1, stateV[k], 1); attrib(2, stateC[k], 1); attrib(8, seedBuf, 1);
  gl.bindVertexArray(null);
  return v;
});
gl.bindBuffer(gl.ARRAY_BUFFER, null);
const quadVao = gl.createVertexArray();
const tfo = gl.createTransformFeedback();
let cur = 0;

/* --------------------------------------------------------- render targets */
function makeTarget(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, HDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h, ok };
}
function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
let trail = [], levels = [], ups = [], avgT = [], ti = 0, ai = 0;
function allocTargets(W, H) {
  [...trail, ...levels, ...ups, ...avgT].forEach(freeTarget);
  const build = () => {
    trail = [makeTarget(W, H), makeTarget(W, H)];
    levels = [];
    let w = W, h = H;
    for (let i = 0; i < 5; i++) { w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2)); levels.push(makeTarget(w, h)); }
    ups = levels.slice(0, 4).map(l => makeTarget(l.w, l.h));
    avgT = [makeTarget(1, 1), makeTarget(1, 1)];
    return [...trail, ...levels, ...ups, ...avgT].every(t => t.ok);
  };
  if (!build() && HDR) {
    [...trail, ...levels, ...ups, ...avgT].forEach(freeTarget);
    HDR = false;
    build();
  }
  ti = 0;
  clearTrails();
}
function clearTrails() {
  for (const t of [...trail, ...avgT]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ---------------------------------------------------------- camera/layout */
/* 기본 자리에서 초점면의 화면 높이 절반이 halfH 가 되도록 거리를 잡는다. 카메라는 바라보는 점(tx, ty, tz)을 중심으로
   방위각·고도·거리·기울기를 스프링으로 따라가고, 장면마다 시간에 따라 목표를 바꿔 날아다닌다 */
const FOV = 40 * Math.PI / 180, TAN = Math.tan(FOV / 2);
const VP = new Float32Array(16);
let aspect = 1.6, halfW = 1.62, halfH = 1, dist = 1 / TAN, pxPerUnit = 450, dpr = 1, dprCap = 2, layout = '', shapeAspect = 0;
const CAMK = ['yaw', 'pitch', 'dz', 'tx', 'ty', 'tz', 'roll'];
const cam = {
  yaw: 0, pitch: 0, dz: 0, tx: 0, ty: 0, tz: 0, roll: 0,
  vel: { yaw: 0, pitch: 0, dz: 0, tx: 0, ty: 0, tz: 0, roll: 0 },
  goal: { yaw: 0, pitch: 0, dz: 0, tx: 0, ty: 0, tz: 0, roll: 0 },
  k: 9,
  eye: new Float32Array(3), right: new Float32Array([1, 0, 0]), up: new Float32Array([0, 1, 0]), fwd: new Float32Array([0, 0, -1]), focus: 1
};
const parallax = { x: 0, y: 0 };
const warp = { v: 0, s: 0, lastY: 0 };
function layoutFor(a) { return a < 0.9 ? 'tall' : 'wide'; }
function updateProjection() {
  const W = innerWidth, H = innerHeight;
  aspect = W / H;
  const lay = layoutFor(aspect);
  halfW = lay === 'wide' ? 1.62 : 1.0;
  halfH = Math.max(lay === 'wide' ? 1.0 : 1.3, halfW / aspect);
  dist = halfH / TAN;
  pxPerUnit = H / (2 * halfH);
  if (lay !== layout || Math.abs(aspect - shapeAspect) > 0.02 * shapeAspect) {
    layout = lay;
    shapeAspect = aspect;
    GEO = null;
    cache.clear();
    if (curShape) useShape(curShape.key);
  } else if (curShape) {
    R.bright = R.brightGoal = brightFor(curShape);
  }
}
function stepCamera(dt) {
  const g = cam.goal, k = cam.k, c = 2 * Math.sqrt(k);
  const extra = { yaw: parallax.x * 0.035, pitch: parallax.y * 0.025, dz: -0.14 * warp.s, roll: 0, tx: 0, ty: 0, tz: 0 };
  for (const key of CAMK) {
    cam.vel[key] += ((g[key] + extra[key] - cam[key]) * k - cam.vel[key] * c) * dt;
    cam[key] += cam.vel[key] * dt;
  }
  buildView();
}
function snapCamera() {
  for (const key of CAMK) { cam[key] = cam.goal[key]; cam.vel[key] = 0; }
  buildView();
}
function buildView() {
  const d = dist * Math.max(0.05, 1 + cam.dz);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
  const tx = cam.tx, ty = cam.ty, tz = cam.tz;
  const ex = tx + d * sy * cp, ey = ty + d * spp, ez = tz + d * cy * cp;
  cam.eye[0] = ex; cam.eye[1] = ey; cam.eye[2] = ez;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = fwd x worldUp, up = right x fwd, then roll both about fwd
  let rx = -fz, ry = 0, rz = fx;
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  if (cam.roll) {
    const c = Math.cos(cam.roll), s = Math.sin(cam.roll);
    const rx2 = rx * c + ux * s, ry2 = ry * c + uy * s, rz2 = rz * c + uz * s;
    ux = ux * c - rx * s; uy = uy * c - ry * s; uz = uz * c - rz * s;
    rx = rx2; ry = ry2; rz = rz2;
  }
  cam.right[0] = rx; cam.right[1] = ry; cam.right[2] = rz;
  cam.up[0] = ux; cam.up[1] = uy; cam.up[2] = uz;
  cam.fwd[0] = fx; cam.fwd[1] = fy; cam.fwd[2] = fz;
  cam.focus = d;
  const f = 1 / TAN, near = 0.06, far = 80, nf = 1 / (near - far);
  const p0 = f / aspect, p5 = f, p10 = (far + near) * nf, p14 = 2 * far * near * nf;
  // view matrix rows: right, up, -fwd
  const v = [rx, ux, -fx, 0, ry, uy, -fy, 0, rz, uz, -fz, 0,
    -(rx * ex + ry * ey + rz * ez), -(ux * ex + uy * ey + uz * ez), (fx * ex + fy * ey + fz * ez), 1];
  // VP = P * V (column-major)
  for (let c = 0; c < 4; c++) {
    const a = v[c * 4], b = v[c * 4 + 1], e = v[c * 4 + 2], w = v[c * 4 + 3];
    VP[c * 4] = p0 * a;
    VP[c * 4 + 1] = p5 * b;
    VP[c * 4 + 2] = p10 * e + p14 * w;
    VP[c * 4 + 3] = -e;
  }
}
// world -> CSS pixels; null when behind the camera
function project(x, y, z) {
  const cx = VP[0] * x + VP[4] * y + VP[8] * z + VP[12];
  const cyy = VP[1] * x + VP[5] * y + VP[9] * z + VP[13];
  const cw = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
  if (cw < 0.05) return null;
  return [(cx / cw * 0.5 + 0.5) * innerWidth, (0.5 - cyy / cw * 0.5) * innerHeight];
}
// CSS pixels -> point on the plane through the camera target, facing the camera
function unproject(px, py) {
  const nx = px / innerWidth * 2 - 1, ny = 1 - py / innerHeight * 2;
  const R0 = cam.right, U0 = cam.up, F0 = cam.fwd;
  const dx = F0[0] + nx * TAN * aspect * R0[0] + ny * TAN * U0[0];
  const dy = F0[1] + nx * TAN * aspect * R0[1] + ny * TAN * U0[1];
  const dz = F0[2] + nx * TAN * aspect * R0[2] + ny * TAN * U0[2];
  const t = cam.focus;
  return [cam.eye[0] + dx * t, cam.eye[1] + dy * t, cam.eye[2] + dz * t];
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const W = Math.max(1, Math.round(innerWidth * dpr)), H = Math.max(1, Math.round(innerHeight * dpr));
  if (canvas.width !== W || canvas.height !== H || !trail.length) {
    canvas.width = W; canvas.height = H;
    allocTargets(W, H);
  }
  updateProjection();
  buildView();
}

/* ------------------------------------------------------------ shape lab */
/* 글자와 도형은 화면 밖 캔버스에 그린 뒤 알파를 가중치로 뽑는다. 한글은 Pretendard 가 준비된 뒤에만 뽑는다 */
const PPU = 380;
const sc = document.createElement('canvas');
const sx = sc.getContext('2d', { willReadFrequently: true });
let CW = 0, CH = 0, alphaMap = null;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
function setBox(w, h) {
  const W = Math.round(w * PPU), H = Math.round(h * PPU);
  if (W !== CW || H !== CH) { CW = W; CH = H; sc.width = W; sc.height = H; alphaMap = new Uint8Array(W * H); }
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalCompositeOperation = 'source-over';
  sx.globalAlpha = 1;
  sx.clearRect(0, 0, CW, CH);
}
function boxFor() { return layout === 'tall' ? [2.2, 4.0] : [3.4, 2.2]; }
function clearBox() { const b = boxFor(); setBox(b[0], b[1]); }
function worldSpace() { sx.setTransform(PPU, 0, 0, -PPU, CW / 2, CH / 2); }

// one line of text, ink box centred at world (cx, cy), fitted into maxW x lineH
function drawText(text, { cx = 0, cy = 0, maxW, lineH, weight = 800, track = -0.01, align = 'center' }) {
  sx.save();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.fillStyle = '#fff';
  sx.textAlign = 'left';
  sx.textBaseline = 'alphabetic';
  const setFont = px => { sx.font = `${weight} ${px}px ${FONT}`; if ('letterSpacing' in sx) sx.letterSpacing = `${(px * track).toFixed(2)}px`; };
  let px = 200;
  setFont(px);
  let m = sx.measureText(text);
  let w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  px *= Math.min(maxW * PPU / w, lineH * PPU / h);
  setFont(px);
  m = sx.measureText(text);
  w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight; h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const X = CW / 2 + cx * PPU, Y = CH / 2 - cy * PPU;
  const x0 = align === 'left' ? X + m.actualBoundingBoxLeft : X - w / 2 + m.actualBoundingBoxLeft;
  sx.fillText(text, x0, Y - h / 2 + m.actualBoundingBoxAscent);
  sx.restore();
  return { w: w / PPU, h: h / PPU, px };
}

// weighted stratified sampling of the current canvas alpha -> n points
function sample(n, rand) {
  const img = sx.getImageData(0, 0, CW, CH).data;
  const P = CW * CH;
  let cnt = 0;
  for (let p = 0; p < P; p++) { const a = img[p * 4 + 3]; alphaMap[p] = a; if (a > 12) cnt++; }
  const idx = new Int32Array(cnt), cum = new Float64Array(cnt);
  let tot = 0;
  for (let p = 0, j = 0; p < P; p++) {
    const a = alphaMap[p];
    if (a > 12) { tot += a; idx[j] = p; cum[j] = tot; j++; }
  }
  const out = { x: new Float32Array(n), y: new Float32Array(n), a: new Float32Array(n), edge: new Uint8Array(n), area: tot / 255 / (PPU * PPU) };
  if (!cnt) return out;
  const pix = new Int32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const r = (i + rand()) / n * tot;
    while (j < cnt - 1 && cum[j] < r) j++;
    pix[i] = idx[j];
  }
  for (let i = n - 1; i > 0; i--) { const k = (rand() * (i + 1)) | 0; const t = pix[i]; pix[i] = pix[k]; pix[k] = t; }
  for (let i = 0; i < n; i++) {
    const p = pix[i];
    out.x[i] = ((p % CW) + rand() - CW / 2) / PPU;
    out.y[i] = (CH / 2 - (((p / CW) | 0) + rand())) / PPU;
    out.a[i] = img[p * 4 + 3] / 255;
    out.edge[i] = isEdge(p, 3) ? 1 : 0;
  }
  return out;
}
function isEdge(p, r) {
  const t = 110;
  const x = p % CW, y = (p / CW) | 0;
  if (x < r || y < r || x >= CW - r || y >= CH - r) return true;
  return alphaMap[p - r] < t || alphaMap[p + r] < t || alphaMap[p - r * CW] < t || alphaMap[p + r * CW] < t;
}
function roundRect(x, y, w, h, r) {
  sx.beginPath();
  sx.moveTo(x + r, y);
  sx.lineTo(x + w - r, y); sx.arcTo(x + w, y, x + w, y + r, r);
  sx.lineTo(x + w, y + h - r); sx.arcTo(x + w, y + h, x + w - r, y + h, r);
  sx.lineTo(x + r, y + h); sx.arcTo(x, y + h, x, y + h - r, r);
  sx.lineTo(x, y + r); sx.arcTo(x, y, x + r, y, r);
  sx.closePath();
}
// Slack message: avatar dot, a name bar and text bars, in world units centred at (cx, cy)
function drawMessage(cx, cy, w, h, { avatarRight = false, lines = 2, fill = 0.16 } = {}) {
  worldSpace();
  const x = cx - w / 2, y = cy - h / 2, r = Math.min(h / 2, 0.05);
  sx.fillStyle = `rgba(255,255,255,${fill})`;
  roundRect(x, y, w, h, r); sx.fill();
  sx.strokeStyle = 'rgba(255,255,255,0.75)';
  sx.lineWidth = 0.008;
  roundRect(x, y, w, h, r); sx.stroke();
  const av = h * 0.26, ax = avatarRight ? x + w - h * 0.42 : x + h * 0.42;
  sx.fillStyle = '#fff';
  sx.beginPath(); sx.arc(ax, cy, av, 0, Math.PI * 2); sx.fill();
  const bx = avatarRight ? x + h * 0.25 : x + h * 0.82, bw = w - h * 1.07;
  const lh = h * 0.13, gap = h * 0.24;
  const top = cy + (lines - 1) * gap / 2 + gap * 0.5;
  sx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(bx, top - lh / 2, bw * 0.34, lh, lh / 2); sx.fill();
  sx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let k = 0; k < lines; k++) {
    const yy = top - gap * (k + 1);
    const ww = bw * (k === lines - 1 ? 0.62 : 0.92);
    roundRect(bx, yy - lh / 2, ww, lh, lh / 2); sx.fill();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
}
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) { const k = (rand() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[k]; arr[k] = t; }
  return arr;
}
function newShape(key) {
  return {
    key, area: 1,
    tgt: new Float32Array(N * 4), tcol: new Float32Array(N * 4), meta: new Float32Array(N * 4),
    aux: new Float32Array(N * 4), aux2: new Float32Array(N * 4), anchors: {}
  };
}
// split [0, N) into consecutive counts by fractions; the last part takes the remainder
function split(fracs) {
  const out = [];
  let left = N;
  fracs.forEach((f, i) => { const n = i === fracs.length - 1 ? left : Math.round(N * f); out.push(n); left -= n; });
  return out;
}

/* -------------------------------------------------------------- shapes */
// target position, brightness and colour (temperature, softness, white, tail)
function put(sh, i, x, y, z, b, temp, soft, white, tail) {
  const o = i * 4;
  sh.tgt[o] = x; sh.tgt[o + 1] = y; sh.tgt[o + 2] = z; sh.tgt[o + 3] = b;
  sh.tcol[o] = temp; sh.tcol[o + 1] = soft; sh.tcol[o + 2] = white; sh.tcol[o + 3] = tail;
}
function set4(arr, i, a, b, c, d) { const o = i * 4; arr[o] = a; arr[o + 1] = b; arr[o + 2] = c; arr[o + 3] = d; }
function bounds(xs, ys, n) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]); }
  return { x0, x1, y0, y1 };
}
const TAU = Math.PI * 2;
function sdir(rand) { const z = rand() * 2 - 1, a = rand() * TAU, r = Math.sqrt(1 - z * z); return [Math.cos(a) * r, Math.sin(a) * r, z]; }
function gauss(rand) { return Math.sqrt(-2 * Math.log(1 - 0.9999 * rand())) * Math.cos(TAU * rand()); }
function curLang() { return root.lang === 'en' ? 'en' : 'ko'; }
function fxWord(key) { const d = window.__I18N_DICT, t = d && d[curLang()]; return (t && t[key]) || ''; }


/* 장면마다 같은 번호의 입자를 같은 역할에 쓴다. 0번부터 PB 개는 늘 에이전트, 그다음 PB 개씩 일곱은 사람 자리,
   I_SC 부터는 장면마다 다른 그림에 쓴다 */
const PB = Math.round(N * 0.032);
const I_AG = 0, I_PP = PB, I_SC = 8 * PB, N_SC = N - I_SC;
const AGS = () => layout === 'tall' ? 0.05 : 0.058;
/* 그림 자리: 기본 카메라에서 z = 0 평면 위, 머리글 아래부터 가장 긴 장면 설명 위까지 */
let GEO = null;
// where an element of a fixed caption sits once its entrance transitions end (offsets ignore transforms)
function settledRect(c, el) {
  const l = c.offsetLeft - c.offsetWidth / 2 + (el === c ? 0 : el.offsetLeft), t = c.offsetTop + (el === c ? 0 : el.offsetTop);
  return { left: l, top: t, right: l + el.offsetWidth, bottom: t + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
}
function geo() {
  if (GEO) return GEO;
  const tall = layout === 'tall', H = innerHeight;
  // the header's children (on phones .brand has no box of its own)
  const hb = ['.top .mark', '.top .links', '.top .lang'].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect().bottom).filter(v => v > 0);
  // phones keep one more line free under the header for the auto-play notice
  const topPx = (hb.length ? Math.max(...hb) : 100) + 14 + (tall ? 14 : 0);
  let capTop = H * 0.8;
  for (let i = 1; i < 8; i++) {
    const c = caps[i];
    if (!c) continue;
    const r = settledRect(c, c);
    if (r.height) capTop = Math.min(capTop, r.top);
  }
  const toY = px => (H / 2 - px) / pxPerUnit;
  let y1 = toY(topPx), y0 = toY(capTop - 16);
  if (y1 - y0 < 0.9) { const m = (y0 + y1) / 2; y0 = m - 0.45; y1 = m + 0.45; }
  const w = 2 * halfW - (tall ? 0.16 : 0.32);
  GEO = { tall, y0, y1, cy: (y0 + y1) / 2, h: y1 - y0, w, topPx };
  return GEO;
}

// a soft ball of light in local coordinates: a dense core and a thin halo
function blob(sh, i0, n, rand, size, temp, white, b, role, each) {
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const halo = rand() < 0.26;
    const r = halo ? size * (0.8 + 0.9 * Math.pow(rand(), 0.7)) : size * 0.4 * Math.sqrt(-2 * Math.log(1 - 0.995 * rand()));
    const d = sdir(rand);
    const core = Math.exp(-r * r / (size * size * 0.16));
    put(sh, i, d[0] * r, d[1] * r, d[2] * r * 0.7, b * (halo ? 0.35 : 0.6 + 0.55 * core), temp, halo ? 0.5 : 0.08, white * core + 0.03, 0.25);
    sh.aux2[i * 4] = role;
    sh.meta[i * 4 + 3] = rand();
    if (each) each(i, k);
  }
}
// a faint circle through the seats; aux2.y is the angle from the top, so it draws around
function circleLine(sh, i0, n, rand, c, r, role, b = 0.14) {
  for (let k = 0; k < n; k++) {
    const i = i0 + k, a = rand() * TAU;
    put(sh, i, c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + (rand() - 0.5) * 0.01, b, 0.45, 0.4, 0.04, 0.1);
    sh.aux2[i * 4] = role; sh.aux2[i * 4 + 1] = ((Math.PI / 2 - a) % TAU + TAU) % TAU / TAU;
    sh.meta[i * 4 + 3] = rand();
  }
}
// faint specks deep behind the picture
function dust(sh, i0, n, rand, role, b = 1) {
  const g = geo();
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const z = -0.5 - rand() * 2.8;
    const sc = 1 + (-z) * 0.37;
    put(sh, i, (rand() - 0.5) * 2.2 * halfW * sc, g.cy + (rand() - 0.5) * 2 * halfH * sc, z, (0.06 + 0.14 * rand()) * b, 0.15 + 0.7 * rand(), 0.6, 0, 0.1);
    sh.aux2[i * 4] = role;
    sh.meta[i * 4 + 3] = rand();
  }
}
function line(x0, y0, x1, y1) { sx.moveTo(x0, y0); sx.lineTo(x1, y1); }
// sample the canvas and hand the points to fn(k, x, y, a, edge)
function take(n, rand, fn) {
  const S = sample(n, rand);
  for (let k = 0; k < n; k++) fn(k, S.x[k], S.y[k], S.a[k], S.edge[k]);
  return S;
}
// 01 · 이름 하나만 입자 글자로
function nameShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('name');
  clearBox();
  const cy = tall ? 0.2 : 0.07;
  drawText('Kunsang Lee', tall ? { cy, maxW: 1.8, lineH: 0.5 } : { cy, maxW: 2.75, lineH: 0.66 });
  const S = sample(N, rand);
  const b = bounds(S.x, S.y, N);
  for (let i = 0; i < N; i++) {
    const e = S.edge[i];
    put(sh, i, S.x[i], S.y[i], (rand() - 0.5) * 0.04, (0.62 + 0.38 * S.a[i]) * (e ? 1.15 : 1), 0.5, 0, e ? 0.42 : 0.1, 0.45);
    sh.meta[i * 4] = e;
    sh.meta[i * 4 + 3] = (S.x[i] - b.x0) / (b.x1 - b.x0) * 0.75 + rand() * 0.2;
  }
  sh.area = S.area;
  sh.center = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0];
  return sh;
}
// a file tree: rows of nodes with indentation, joined by elbow lines
function treeRows(rows, rand) {
  const lv = [0];
  for (let k = 1; k < rows; k++) {
    const p = lv[k - 1], r = rand();
    lv.push(p === 0 ? 1 : r < 0.36 && p < 3 ? p + 1 : r < 0.74 ? p : Math.max(1, p - 1));
  }
  return lv;
}
function treePlan(x0, ytop, w, h, rowH, rand) {
  const rows = Math.max(4, Math.floor(h / rowH));
  const lv = treeRows(rows, rand);
  const ind = Math.min(0.05, w / 5);
  const nodes = [], lines = [], bars = [], last = [];
  for (let k = 0; k < rows; k++) {
    const L = lv[k], y = ytop - (k + 0.5) * rowH, x = x0 + L * ind;
    nodes.push([x, y]);
    if (L > 0) {
      const pk = last[L - 1], px = x0 + (L - 1) * ind, py = ytop - (pk + 0.5) * rowH;
      lines.push([px, py, px, y], [px, y, x, y]);
    }
    bars.push([x + 0.024, y, Math.max(0.03, Math.min(w - (x - x0) - 0.04, 0.05 + rand() * 0.12))]);
    last[L] = k;
  }
  return { nodes, lines, bars, root: nodes[0], ytop, h: rows * rowH };
}
function drawDB(c, R, H, part) {
  worldSpace();
  const ry = R * 0.3;
  sx.strokeStyle = '#fff';
  sx.lineWidth = 0.008;
  if (part === 'fill') {
    sx.fillStyle = 'rgba(255,255,255,0.1)';
    sx.fillRect(c[0] - R, c[1] - H / 2, 2 * R, H);
    sx.beginPath(); sx.ellipse(c[0], c[1] - H / 2, R, ry, 0, Math.PI, TAU); sx.fill();
  } else {
    sx.beginPath(); sx.ellipse(c[0], c[1] + H / 2, R, ry, 0, 0, TAU); sx.stroke();
    for (const yy of [H / 6, -H / 6, -H / 2]) { sx.beginPath(); sx.ellipse(c[0], c[1] + yy, R, ry, 0, Math.PI, TAU); sx.stroke(); }
    sx.beginPath(); line(c[0] - R, c[1] + H / 2, c[0] - R, c[1] - H / 2); line(c[0] + R, c[1] + H / 2, c[0] + R, c[1] - H / 2); sx.stroke();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
}
// small cards, drawn at the origin: 0 ticket, 1 pull request
function drawCard(kind, w, h) {
  worldSpace();
  const x = -w / 2, y = -h / 2, r = Math.min(0.025, h * 0.16);
  sx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(x, y, w, h, r); sx.fill();
  sx.strokeStyle = '#fff'; sx.lineWidth = 0.007; roundRect(x, y, w, h, r); sx.stroke();
  const bx = x + w * 0.3, bw = w * 0.62, lh = h * 0.1;
  sx.fillStyle = '#fff';
  roundRect(bx, y + h * 0.66, bw * 0.55, lh * 1.2, lh * 0.6); sx.fill();
  sx.fillStyle = 'rgba(255,255,255,0.6)';
  roundRect(bx, y + h * 0.42, bw, lh, lh / 2); sx.fill();
  roundRect(bx, y + h * 0.2, bw * 0.7, lh, lh / 2); sx.fill();
  sx.lineWidth = 0.007;
  if (kind === 0) {
    sx.setLineDash([0.012, 0.01]);
    sx.beginPath(); line(x + w * 0.22, y + h * 0.1, x + w * 0.22, y + h * 0.9); sx.stroke();
    sx.setLineDash([]);
    sx.beginPath(); sx.arc(x + w * 0.11, y + h * 0.5, h * 0.12, 0, TAU); sx.stroke();
  } else {
    const ax = x + w * 0.1, r2 = h * 0.07;
    sx.beginPath(); sx.arc(ax, y + h * 0.76, r2, 0, TAU); sx.stroke();
    sx.beginPath(); sx.arc(ax, y + h * 0.24, r2, 0, TAU); sx.stroke();
    sx.beginPath(); sx.arc(ax + w * 0.1, y + h * 0.76, r2, 0, TAU); sx.stroke();
    sx.beginPath(); line(ax, y + h * 0.76 - r2, ax, y + h * 0.24 + r2); sx.stroke();
    sx.beginPath(); sx.moveTo(ax + w * 0.1, y + h * 0.76 - r2); sx.quadraticCurveTo(ax + w * 0.1, y + h * 0.4, ax + r2, y + h * 0.28); sx.stroke();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
}
// the to-do card parts in local coordinates: frame, words and the check mark's stroke
function cardParts(w, h) {
  const cb = { x: -w / 2 + h * 0.3, s: h * 0.26 };
  const tx = cb.x + cb.s * 0.5 + h * 0.2, tw = w / 2 - tx - h * 0.18;
  const bars = [[tx, h * 0.17, tw * 0.62], [tx, 0, tw], [tx, -h * 0.17, tw * 0.48]];
  const check = [[cb.x - cb.s * 0.3, cb.s * 0.02], [cb.x - cb.s * 0.06, -cb.s * 0.26], [cb.x + cb.s * 0.36, cb.s * 0.34]];
  return { cb, bars, check };
}
function drawTodo(w, h, part) {
  const P = cardParts(w, h);
  worldSpace();
  sx.strokeStyle = '#fff'; sx.fillStyle = '#fff';
  if (part === 'frame') {
    sx.lineWidth = w > 0.7 ? 0.0105 : 0.008; roundRect(-w / 2, -h / 2, w, h, Math.min(0.04, h * 0.14)); sx.stroke();
    sx.lineWidth = 0.007; sx.strokeRect(P.cb.x - P.cb.s / 2, -P.cb.s / 2, P.cb.s, P.cb.s);
  } else if (part === 'words') {
    const bh = h * 0.07;
    P.bars.forEach(b => { roundRect(b[0], b[1] - bh / 2, b[2], bh, bh / 2); sx.fill(); });
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
  return P;
}
// points along a polyline with the fraction along it
function alongPoly(pts, n, rand, jit) {
  const L = [];
  let tot = 0;
  for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); L.push(l); tot += l; }
  const out = [];
  for (let m = 0; m < n; m++) {
    let r = (m + rand()) / n * tot, k = 0;
    const d = r;
    while (k < L.length - 1 && r > L[k]) { r -= L[k]; k++; }
    const u = L[k] ? r / L[k] : 0;
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u + (rand() - 0.5) * jit, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u + (rand() - 0.5) * jit, d / tot]);
  }
  return out;
}
// a ball of loose scribbles: where the words sit while the request is still tangled
function scribbles(n, rand, R) {
  const curves = [];
  for (let c = 0; c < 9; c++) curves.push([rand() * TAU, 1 + rand() * 2.2, rand() * TAU, 1 + rand() * 2.6, rand() * TAU, 0.6 + 0.4 * rand(), 0.6 + 0.4 * rand()]);
  const out = [];
  for (let m = 0; m < n; m++) {
    const C = curves[(rand() * curves.length) | 0], s = rand() * TAU;
    const x = Math.sin(C[1] * s + C[0]) * R * C[5] + Math.sin(3.1 * s + C[4]) * R * 0.18;
    const y = Math.sin(C[3] * s + C[2]) * R * 0.62 * C[6] + Math.cos(2.3 * s + C[0]) * R * 0.12;
    out.push([x + (rand() - 0.5) * 0.012, y + (rand() - 0.5) * 0.012, (rand() - 0.5) * R * 0.5]);
  }
  return out;
}

/* 에이전트와 사람: 장면 2 고리의 크기 그대로. 사람 입자 셋 중 하나는 자리를 비울 때 얇은 빈 원으로 간다 */
function agentInto(sh, rand) { blob(sh, I_AG, PB, rand, AGS(), 0.95, 0.6, 1.05, 20); }
function personInto(sh, slot, rand) {
  const r = AGS() * 1.05;
  blob(sh, I_PP + slot * PB, PB, rand, AGS(), 0.5, 0.12, 0.95, 21, (i, k) => {
    const a = rand() * TAU;
    set4(sh.aux, i, slot, Math.cos(a) * r, Math.sin(a) * r, k % 3 === 0 ? 1 : 0);
  });
}
function hideRange(sh, i0, i1) { for (let i = i0; i < i1; i++) { sh.aux2[i * 4] = 30; sh.tgt[i * 4 + 3] = 0; } }

/* 질문 말풍선: 호박색 테두리 + 꼬리 + 글줄 둘. 장면 2·3·5·6 이 모두 이 모양을 쓴다.
   tip 은 말풍선 가운데에서 본 꼬리 끝 */
function bubbleTip(w, h, flip) { return [(flip ? 1 : -1) * w * 0.36, -h * 0.9]; }
function drawBubble(w, h, tip, part, lw) {
  worldSpace();
  const x = -w / 2, y = -h / 2, r = Math.min(0.05, h * 0.28);
  const left = tip[0] < 0;
  const b0 = left ? x + w * 0.14 : x + w * 0.7, b1 = left ? x + w * 0.3 : x + w * 0.86;
  if (part === 'frame') {
    sx.beginPath();
    sx.moveTo(x + r, y);
    sx.lineTo(b0, y); sx.lineTo(tip[0], tip[1]); sx.lineTo(b1, y);
    sx.lineTo(x + w - r, y); sx.arcTo(x + w, y, x + w, y + r, r);
    sx.lineTo(x + w, y + h - r); sx.arcTo(x + w, y + h, x + w - r, y + h, r);
    sx.lineTo(x + r, y + h); sx.arcTo(x, y + h, x, y + h - r, r);
    sx.lineTo(x, y + r); sx.arcTo(x, y, x + r, y, r);
    sx.closePath();
    sx.fillStyle = 'rgba(255,255,255,0.06)'; sx.fill();
    sx.strokeStyle = '#fff'; sx.lineWidth = lw; sx.stroke();
  } else {
    sx.fillStyle = '#fff';
    roundRect(x + w * 0.13, h * 0.08, w * 0.7, h * 0.15, h * 0.075); sx.fill();
    roundRect(x + w * 0.13, -h * 0.24, w * 0.44, h * 0.15, h * 0.075); sx.fill();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
}
// sampled bubble points: frame first, then the two text lines. Each point: [x, y, b, edge, part(0 frame / 1 text)]
function bubblePts(n, rand, w, h, tip) {
  const lw = layout === 'tall' ? 0.011 : 0.0075;
  const nF = Math.round(n * 0.58), out = [];
  clearBox(); drawBubble(w, h, tip, 'frame', lw);
  take(nF, rand, (k, x, y, a, e) => out.push([x, y, a > 0.4 ? 0.7 + 0.3 * a : 0.25, e, 0]));
  clearBox(); drawBubble(w, h, tip, 'text', lw);
  take(n - nF, rand, (k, x, y, a) => out.push([x, y, 0.55 + 0.3 * a, 0, 1]));
  return out;
}
// one bubble into particles [i0, i0 + n): amber outline, slightly brighter text
function bubbleInto(sh, i0, n, rand, w, h, tip, role, each) {
  const P = bubblePts(n, rand, w, h, tip);
  for (let k = 0; k < n; k++) {
    const i = i0 + k, q = P[k];
    put(sh, i, q[0], q[1], (rand() - 0.5) * 0.008, q[2], 0.5, 0, q[4] ? 0.1 : 0.05 + 0.1 * q[3], 0.3);
    sh.aux2[i * 4] = role;
    sh.meta[i * 4 + 3] = rand();
    if (each) each(i, k, q);
  }
  return P;
}

/* ---------------------------------------------------- 02 · 동료 고리 */
function g2() {
  const g = geo(), T = g.tall;
  const ring = T ? { c: [0, g.cy + 0.06, 0], r: 0.28 } : { c: [0, g.cy - 0.04, 0], r: 0.32 };
  const at = a => [ring.c[0] + Math.cos(a) * ring.r, ring.c[1] + Math.sin(a) * ring.r, 0];
  const seat8 = k => at(Math.PI / 2 + k * TAU / 8);          // seat 0 at the top is the agent's; no seat is left empty
  const seat7 = k => at(Math.PI / 2 + (k + 0.5) * TAU / 7);  // seven people before the agent joins
  const caller = 6;                                           // person 6 sits at seat8(7), upper right
  const cp = seat8(caller + 1);
  const bubble = T ? { c: [cp[0] + 0.32, cp[1] + 0.22, 0.03], w: 0.5, h: 0.2 } : { c: [cp[0] + 0.28, cp[1] + 0.3, 0.03], w: 0.46, h: 0.2 };
  bubble.tip = [(cp[0] - bubble.c[0]) * 0.66, (cp[1] - bubble.c[1]) * 0.66];
  const forest = T ? { x0: -0.86, x1: 0.86, y0: g.y1 - 0.56, y1: g.y1 - 0.04, rowH: 0.066 } : { x0: -g.w / 2 + 0.02, x1: -0.6, y0: g.cy - 0.5, y1: g.cy + 0.5, rowH: 0.08 };
  const db = T ? { c: [0, g.y0 + 0.27, 0], R: 0.32, H: 0.3 } : { c: [1.2, g.cy - 0.06, 0], R: 0.2, H: 0.46 };
  const cs = T ? 0.9 : 1;
  const cards = T ? [[0.56, cp[1] - 0.2, 0.08], [0.56, cp[1] - 0.44, 0.08]] : [[bubble.c[0] + 0.05, cp[1] + 0.03, 0.08], [bubble.c[0] + 0.05, cp[1] - 0.21, 0.08]];
  const fA = T ? [0, forest.y0 + 0.02, 0] : [forest.x1 - 0.04, (forest.y0 + forest.y1) / 2, 0];
  const dA = T ? [0, db.c[1] + db.H / 2 + 0.02, 0] : [db.c[0] - db.R * 0.6, db.c[1] + db.H / 2, 0];
  return { T, ring, seat8, seat7, caller, cp, bubble, forest, db, cs, cards, fA, dA };
}
function ringShape(rand) {
  const G = g2(), T = G.T, sh = newShape('ring');
  agentInto(sh, rand);
  for (let p = 0; p < 7; p++) personInto(sh, p, rand);
  let i = I_SC;

  // the caller's question: an amber bubble that grows out of the caller (aux2.y = distance from the tail tip)
  {
    const B = G.bubble, nB = NB2();
    const dmax = Math.hypot(B.w, B.h) + Math.hypot(B.tip[0], B.tip[1]);
    bubbleInto(sh, i, nB, rng(BUB_SEED), B.w, B.h, B.tip, 7, (ii, k, q) => { sh.aux2[ii * 4 + 1] = Math.hypot(q[0] - B.tip[0], q[1] - B.tip[1]) / dmax; });
    i += nB;
  }

  // code forest (file trees) and the database
  const nRB = Math.round(N * 0.3), nFo = Math.round(nRB * 0.6), nDb = nRB - nFo;
  const F = G.forest, nt = 3, tw = (F.x1 - F.x0) / nt;
  const leaves = [];
  for (let t = 0; t < nt; t++) {
    const ytop = F.y1 - (T ? 0 : [0, 0.08, 0.03][t]);
    const plan = treePlan(F.x0 + t * tw + 0.02, ytop, tw - 0.03, (ytop - F.y0) * (T ? 1 : [1, 0.9, 0.96][t]), F.rowH, rand);
    const nT = t === nt - 1 ? nFo - Math.round(nFo / nt) * (nt - 1) : Math.round(nFo / nt);
    const nNode = Math.round(nT * 0.24), nLine = nT - nNode;
    const order = py => clamp((plan.ytop - py) / plan.h, 0, 1) * 0.92;
    clearBox(); worldSpace();
    sx.strokeStyle = '#fff'; sx.lineWidth = 0.006;
    sx.beginPath(); plan.lines.forEach(s => line(s[0], s[1], s[2], s[3])); sx.stroke();
    sx.fillStyle = 'rgba(255,255,255,0.5)';
    plan.bars.forEach(b => { roundRect(b[0], b[1] - 0.006, b[2], 0.012, 0.006); sx.fill(); });
    sx.setTransform(1, 0, 0, 1, 0, 0);
    take(nLine, rand, (k, px, py, a) => {
      put(sh, i, px, py, (rand() - 0.5) * 0.02, 0.45 + 0.35 * a, 0.12, 0, 0.08, 0.3);
      set4(sh.aux, i, plan.root[0], plan.root[1], 0, 0);
      set4(sh.aux2, i, 3, order(py), 0, 0);
      sh.meta[i * 4 + 3] = rand();
      i++;
    });
    clearBox(); worldSpace();
    sx.fillStyle = '#fff';
    plan.nodes.forEach(n => sx.fillRect(n[0] - 0.011, n[1] - 0.011, 0.022, 0.022));
    sx.setTransform(1, 0, 0, 1, 0, 0);
    take(nNode, rand, (k, px, py) => {
      put(sh, i, px, py, (rand() - 0.5) * 0.02, 0.85, 0.3, 0, 0.3, 0.3);
      set4(sh.aux, i, plan.root[0], plan.root[1], 0, 0);
      set4(sh.aux2, i, 3, order(py), 0, 0);
      sh.meta[i * 4] = 1;
      sh.meta[i * 4 + 3] = rand();
      if (k % 7 === 0) leaves.push([px, py, 0, 0]);
      i++;
    });
  }
  {
    const D = G.db, nLn = Math.round(nDb * 0.78);
    clearBox(); drawDB(D.c, D.R, D.H, 'line');
    const top = D.c[1] + D.H / 2;
    take(nLn, rand, (k, px, py) => {
      put(sh, i, px, py, (rand() - 0.5) * 0.02, 0.8, 0.22, 0, 0.22, 0.3);
      set4(sh.aux, i, D.c[0], top, 0, 0);
      set4(sh.aux2, i, 4, clamp((top - py) / D.H, 0, 1) * 0.8, 0, 0);
      sh.meta[i * 4] = 1;
      sh.meta[i * 4 + 3] = rand();
      if (k % 9 === 0) leaves.push([px, py, 0, 1]);
      i++;
    });
    clearBox(); drawDB(D.c, D.R, D.H, 'fill');
    take(nDb - nLn, rand, (k, px, py) => {
      put(sh, i, px, py, (rand() - 0.5) * 0.04, 0.3, 0.12, 0.3, 0.04, 0.2);
      set4(sh.aux, i, D.c[0], top, 0, 0);
      set4(sh.aux2, i, 4, clamp((top - py) / D.H, 0, 1) * 0.8, 0, 0);
      sh.meta[i * 4 + 3] = rand();
      i++;
    });
  }

  // the faint circle, beams, fragments that become the answer and the cards, dust
  const nCir = Math.round(N * 0.025), nBeam = Math.round(N * 0.06), nFrag = Math.round(N * 0.08);
  circleLine(sh, i, nCir, rand, G.ring.c, G.ring.r, 2); i += nCir;
  for (let k = 0; k < nBeam; k++, i++) {
    put(sh, i, G.ring.c[0], G.ring.c[1], 0, 0.5, 0.85, 0, 0.35, 0.6);
    set4(sh.aux, i, k < nBeam * 0.55 ? 0 : 1, 0, 0, 0);
    sh.aux2[i * 4] = 5;
  }
  const cardPts = [0, 1].map(kind => { clearBox(); drawCard(kind, 0.3 * G.cs, 0.17 * G.cs); return sample(Math.ceil(nFrag / 2), rand); });
  const fF = leaves.filter(l => l[3] === 0), fD = leaves.filter(l => l[3] === 1);
  for (let k = 0; k < nFrag; k++, i++) {
    const kind = k < nFrag / 2 ? 0 : 1, S = cardPts[kind], m = kind === 0 ? k : k - Math.ceil(nFrag / 2);
    const fromDb = rand() < 0.38, pool = fromDb ? fD : fF, src = pool[(rand() * pool.length) | 0];
    put(sh, i, S.x[m], S.y[m], (rand() - 0.5) * 0.01, 0.62 + 0.35 * S.a[m], 0.85, 0, S.edge[m] ? 0.4 : 0.15, 0.6);
    set4(sh.aux, i, src[0] + (rand() - 0.5) * 0.02, src[1] + (rand() - 0.5) * 0.02, (rand() - 0.5) * 0.02, rand() * 0.45);
    set4(sh.aux2, i, 6, kind, fromDb ? 1 : 0, 0);
    sh.tcol[i * 4] = fromDb ? 0.8 : 0.85;
    sh.meta[i * 4 + 3] = rand();
  }
  dust(sh, i, N - i, rand, 29);

  sh.G = G;
  const F2 = G.forest;
  sh.anchors.code = T ? [0, F2.y1 + 0.02, 0] : [(F2.x0 + F2.x1) / 2, F2.y1 + 0.06, 0];
  sh.anchors.db = T ? [G.db.c[0] + G.db.R + 0.04, G.db.c[1], 0] : [G.db.c[0], G.db.c[1] + G.db.H / 2 + 0.12, 0];
  // the ring's own label sits below the ring, clear of the forest, the cards and the caller's bubble
  sh.anchors.team = [G.ring.c[0], G.ring.c[1] - G.ring.r - (T ? 0.13 : 0.12), 0];
  sh.labelAlign = T ? { db: 'left', ticket: 'left', pr: 'left', agent: 'right' } : { ticket: 'left', pr: 'left', agent: 'right' };
  sh.area = T ? 0.5 : 0.55;
  return sh;
}

/* ---------------------------------------------------- 03 · 말뜻 */
// scene 3 takes over scene 2's bubble as it is: the same particles with the same layout
const BUB_SEED = 4242, NB2 = () => Math.round(N * 0.06);
function g3() {
  const g = geo(), T = g.tall, G2 = g2();
  const card = T ? { w: 0.74, h: 0.36 } : { w: 0.46, h: 0.22 };
  const A = G2.seat8(0);
  const Cc = [0, A[1] - (T ? 0.55 : 0.33), 0.02];
  const lineY = Cc[1] - card.h / 2 - (T ? 0.25 : 0.15);
  const Ce = [0, lineY - card.h / 2 - (T ? 0.12 : 0.07), 0.02];
  const gap = { x: 0, w: card.w + (T ? 0.16 : 0.12) };
  const lx0 = -g.w / 2 + 0.02, lx1 = g.w / 2 - (T ? 0.3 : 0.42);
  const B = G2.bubble;
  return { T, card, A, Cc, Ce, lineY, gap, lx0, lx1, Bs: B.c, bw: B.w, bh: B.h, tip: B.tip, G2 };
}
function meaningShape(rand) {
  const G = g3(), G2 = G.G2, T = G.T, sh = newShape('meaning');
  agentInto(sh, rand);
  for (let p = 0; p < 7; p++) personInto(sh, p, rand);
  let i = I_SC;
  const W = G.card.w, H = G.card.h;
  // three cards: the clear one and two faint ones behind it
  const counts = [NB2(), Math.round(N * 0.035), Math.round(N * 0.035)];
  const R = Math.min(G.bw / 2.6, G.bh * 0.55);
  counts.forEach((n, c) => {
    const bub = bubblePts(n, c === 0 ? rng(BUB_SEED) : rand, G.bw, G.bh, G.tip);
    const bF = bub.filter(q => q[4] === 0), bT = bub.filter(q => q[4] === 1);
    const nF = bF.length, nCk = Math.round(bT.length * 0.28), nW = bT.length - nCk;
    clearBox(); const P = drawTodo(W, H, 'frame'); const cF = sample(nF, rand);
    clearBox(); drawTodo(W, H, 'words'); const cW = sample(nW, rand);
    const ck = alongPoly(P.check, nCk, rand, 0.006);
    const sc = scribbles(bT.length, rand, R);
    const dim = c === 0 ? 1 : 0.42;
    for (let k = 0; k < nF; k++, i++) {
      const e = cF.edge[k];
      put(sh, i, cF.x[k], cF.y[k], -0.05 * c, (0.62 + 0.38 * cF.a[k]) * (e ? 1.1 : 1) * dim, 0.82, 0.05, e ? 0.32 : 0.14, 0.3);
      set4(sh.aux, i, bF[k][0], bF[k][1], bF[k][0], bF[k][1]);
      set4(sh.aux2, i, 3, c, 0, 0);
      sh.meta[i * 4] = bF[k][3];
      sh.meta[i * 4 + 3] = rand();
    }
    for (let k = 0; k < bT.length; k++, i++) {
      const isCk = k >= nW, q = bT[k], s2 = sc[k];
      if (isCk) {
        const p = ck[k - nW];
        put(sh, i, p[0], p[1], -0.05 * c + 0.004, 1.0 * dim, 0.55, 0, 0.35, 0.3);
        set4(sh.aux2, i, 3, c, 2, p[2]);
      } else {
        const m = k;
        put(sh, i, cW.x[m], cW.y[m], -0.05 * c, (0.55 + 0.3 * cW.a[m]) * dim, 0.78, 0.05, 0.12, 0.3);
        set4(sh.aux2, i, 3, c, 1, 0);
      }
      set4(sh.aux, i, q[0], q[1], s2[0] * 1.35, s2[1]);
      sh.meta[i * 4 + 3] = rand();
    }
  });
  // the thin line with one gap, drawn from the left; small ticks mark the gap's edges
  {
    const n = Math.round(N * 0.04), g0 = G.gap.x - G.gap.w / 2, g1 = G.gap.x + G.gap.w / 2;
    const span = (G.lx1 - G.lx0) - G.gap.w;
    for (let k = 0; k < n; k++, i++) {
      let x, y = G.lineY + (rand() - 0.5) * 0.004, b = 0.5;
      if (k < n * 0.1) {                   // the two edge ticks
        const side = k % 2 ? g1 : g0;
        x = side + (rand() - 0.5) * 0.004; y = G.lineY + (rand() - 0.5) * (T ? 0.07 : 0.05); b = 0.75;
      } else {
        const u = rand() * span;
        x = G.lx0 + u; if (x > g0) x += G.gap.w;
      }
      put(sh, i, x, y, 0, b, 0.2, 0.05, 0.08, 0.2);
      set4(sh.aux, i, (x - G.lx0) / (G.lx1 - G.lx0), 0, 0, 0);
      sh.aux2[i * 4] = 4;
      sh.meta[i * 4 + 3] = rand();
    }
  }
  const nCir = Math.round(N * 0.02);
  circleLine(sh, i, nCir, rand, G2.ring.c, G2.ring.r, 2); i += nCir;
  dust(sh, i, N - i, rand, 29, 0.8);
  sh.G = G;
  sh.anchors.gate = [G.lx1 + 0.04, G.lineY, 0];
  sh.labelAlign = { gate: 'left' };
  sh.area = T ? 0.42 : 0.4;
  return sh;
}

/* ---------------------------------------------------- 04 · 신경망 */
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  bez: (a, b, c, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]; }
};
// a unit vector perpendicular to d, turned by angle a around d
function perpOf(d, a) {
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const p = v3.norm(v3.cross(d, up)), q = v3.cross(d, p);
  return v3.add(v3.mul(p, Math.cos(a)), v3.mul(q, Math.sin(a)));
}
const S4 = { touch: 2.4, tau: 0.22, gapT: 0.08, hop2: 0.26, tau2: 0.1, gap: 0.04 };
function g4() {
  const g = geo(), T = g.tall, r = rng(4242);
  const K = T ? 18 : 22;
  const box = T ? { x: 0.8, y0: g.cy - 1.0, y1: g.cy + 0.95, z0: -1.5, z1: 0.2 } : { x: 1.5, y0: g.cy - 0.55, y1: g.cy + 0.6, z0: -1.6, z1: 0.25 };
  const minD = T ? 0.4 : 0.45;
  const cells = [];
  for (let tries = 0; cells.length < K && tries < 8000; tries++) {
    const c = [(r() * 2 - 1) * box.x, mix(box.y0, box.y1, r()), mix(box.z0, box.z1, r())];
    if (cells.every(o => v3.len(v3.sub(o, c)) > minD)) cells.push(c);
  }
  const n = cells.length, d = (a, b) => v3.len(v3.sub(cells[a], cells[b]));
  // each cell reaches its nearest three or four cells; the links are shared both ways
  const nb = cells.map(() => new Set());
  for (let j = 0; j < n; j++) {
    const o = [...Array(n).keys()].filter(k => k !== j).sort((a, b) => d(j, a) - d(j, b));
    const want = 3 + (r() < 0.4 ? 1 : 0);
    for (let m = 0; m < want; m++) { const k = o[m]; if (nb[j].size < 5 && nb[k].size < 5) { nb[j].add(k); nb[k].add(j); } }
  }
  // the cell the agent touches sits near the middle, a little deep
  const aim = [0.08, g.cy + 0.02, -0.45];
  let E = 0;
  for (let j = 1; j < n; j++) if (v3.len(v3.sub(cells[j], aim)) < v3.len(v3.sub(cells[E], aim))) E = j;
  // the lit group: cells close in meaning, reached in at most two hops
  const maxC = T ? 5 : 6, L = new Array(n).fill(999), parent = new Array(n).fill(-1), depth = new Array(n).fill(-1);
  const hop = 2 * S4.tau + S4.gapT;
  L[E] = S4.touch; depth[E] = 0;
  const q = [E];
  let size = 1;
  while (q.length) {
    const j = q.shift();
    if (depth[j] >= 2) continue;
    for (const k of [...nb[j]].sort((a, b) => d(j, a) - d(j, b))) {
      if (depth[k] >= 0 || size >= maxC) continue;
      depth[k] = depth[j] + 1; parent[k] = j; L[k] = L[j] + hop; size++; q.push(k);
    }
  }
  const inC = depth.map(x => x >= 0);
  const D = Math.max(...depth);
  const lastLit = Math.max(...L.filter(x => x < 900));
  const F0 = lastLit + 0.2;
  const Fn = depth.map(x => x >= 0 ? F0 + (D - x) * S4.hop2 : 999);
  const FE = Fn[E];
  const A0 = [0, g.cy + (T ? 0.25 : 0.12), 0.45];
  const toA = v3.norm(v3.sub(A0, cells[E]));
  const touchAt = v3.add(cells[E], v3.mul(toA, T ? 0.085 : 0.095));
  const back = v3.add(v3.add(cells[E], v3.mul(toA, T ? 0.42 : 0.38)), [T ? -0.1 : -0.16, T ? 0.12 : 0.1, 0]);
  const pathCtrl = v3.add(v3.lerp(cells[E], back, 0.5), v3.mul(perpOf(v3.norm(v3.sub(back, cells[E])), 1.1), 0.09));
  const src = T ? [-1.1, 0.6, 0.35] : [-1.6, 0.32, 0.4], ctrl = T ? [-0.6, 0.4, 0.2] : [-0.8, 0.26, 0.2];
  // cells are born left to right, all within the first 1.4 s
  const byX = [...Array(n).keys()].sort((a, b) => cells[a][0] - cells[b][0]);
  const born = new Array(n);
  byX.forEach((j, m) => { born[j] = 0.15 + 1.2 * m / Math.max(1, n - 1); });
  return { T, cells, n, nb, E, L, parent, depth, inC, D, Fn, FE, A0, touchAt, back, pathCtrl, src, ctrl, born, lastLit };
}
function memoryShape(rand) {
  const G = g4(), T = G.T, sh = newShape('memory');
  agentInto(sh, rand);
  // the to-do card the agent carries in, made of the same particles as the clear card in scene 3
  const nCard = Math.round(N * 0.05);
  {
    const W = T ? 0.74 : 0.46, H = T ? 0.36 : 0.22;
    clearBox(); drawTodo(W, H, 'frame'); const F = sample(Math.round(nCard * 0.62), rand);
    clearBox(); const P = drawTodo(W, H, 'words'); const Wd = sample(nCard - F.x.length, rand);
    let i = I_SC;
    for (let k = 0; k < F.x.length; k++, i++) { put(sh, i, F.x[k], F.y[k], 0, F.edge[k] ? 0.95 : 0.6, 0.82, 0.05, F.edge[k] ? 0.32 : 0.14, 0.3); sh.aux2[i * 4] = 3; sh.meta[i * 4 + 3] = rand(); }
    const ck = alongPoly(P.check, Math.round(Wd.x.length * 0.25), rand, 0.006);
    for (let k = 0; k < Wd.x.length; k++, i++) {
      if (k < ck.length) put(sh, i, ck[k][0], ck[k][1], 0.004, 1.0, 0.55, 0, 0.35, 0.3);
      else put(sh, i, Wd.x[k], Wd.y[k], 0, 0.6, 0.78, 0.05, 0.12, 0.3);
      sh.aux2[i * 4] = 3; sh.meta[i * 4 + 3] = rand();
    }
  }
  // index ranges left for the network: the people's range, then everything after the card
  const nDust = Math.round(N * 0.06), nPath = Math.round(N * 0.025), nSpark = Math.round(N * 0.02);
  const ranges = [[I_PP, I_SC], [I_SC + nCard, N - nDust - nPath - nSpark]];
  let ri = 0, ii = ranges[0][0];
  const next = () => { while (ri < ranges.length && ii >= ranges[ri][1]) { ri++; if (ri < ranges.length) ii = ranges[ri][0]; } return ri < ranges.length ? ii++ : -1; };
  const total = (ranges[0][1] - ranges[0][0]) + (ranges[1][1] - ranges[1][0]);

  // branches: from each cell toward each neighbour, stopping short so the two tips leave a small gap; each forks once
  const segs = [];   // [cell, toward (or -1), a, b, c, u0, u1, kind]  kind 0 main, 1 twig
  const r2 = rng(777);
  const tipOf = (j, k) => { const a = G.cells[j], b = G.cells[k], dd = v3.sub(b, a), l = v3.len(dd); return v3.add(a, v3.mul(dd, 0.5 - S4.gap / 2 / l)); };
  for (let j = 0; j < G.n; j++) {
    const c = G.cells[j];
    const ends = [...G.nb[j]].map(k => [k, tipOf(j, k)]);
    const free = 1 + (r2() < 0.5 ? 1 : 0);
    for (let f = 0; f < free; f++) ends.push([-1, v3.add(c, v3.mul(v3.norm([r2() - 0.5, r2() - 0.5, r2() - 0.5]), 0.13 + 0.08 * r2()))]);
    for (const [k, tip] of ends) {
      const dd = v3.sub(tip, c), l = v3.len(dd), dn = v3.norm(dd);
      const bend = v3.mul(perpOf(dn, r2() * TAU), l * (0.16 + 0.14 * r2()));
      const mid = v3.add(v3.lerp(c, tip, 0.5), bend);
      segs.push([j, k, c, mid, tip, 0, 1, 0, l]);
      // level two: twigs splay off along the way
      for (const u0 of [0.42, 0.68]) {
        const p0 = v3.bez(c, mid, tip, u0), p1 = v3.bez(c, mid, tip, u0 + 0.02);
        const tg = v3.norm(v3.sub(p1, p0));
        for (const sgn of [-1, 1]) {
          if (r2() < 0.35) continue;
          const side = perpOf(tg, r2() * TAU);
          const dir = v3.norm(v3.add(v3.mul(tg, 0.75), v3.mul(side, 0.66 * sgn)));
          const tl = l * (0.18 + 0.12 * r2());
          const e = v3.add(p0, v3.mul(dir, tl));
          const m2 = v3.add(v3.lerp(p0, e, 0.5), v3.mul(perpOf(dir, r2() * TAU), tl * 0.25));
          segs.push([j, k, p0, m2, e, u0, u0 + 0.3, 1, tl]);
        }
      }
    }
  }
  const lenSum = segs.reduce((a, s) => a + s[8] * (s[7] ? 0.8 : 1), 0);
  const nNuc = Math.round(total * 0.13), perNuc = Math.floor(nNuc / G.n);
  const nBr = total - perNuc * G.n;
  const nucR = T ? 0.034 : 0.03;
  const writeNeuron = (i, p, j, u, lit, fet, path, base, temp, soft, white, delay) => {
    put(sh, i, p[0], p[1], p[2], base, temp, soft, white, 0.2);
    set4(sh.meta, i, G.cells[j][0], G.cells[j][1], G.cells[j][2], G.born[j]);
    set4(sh.aux, i, j, lit, fet, delay);
    set4(sh.aux2, i, 2, u, path, rand());
  };
  for (let j = 0; j < G.n; j++) {
    const c = G.cells[j];
    for (let m = 0; m < perNuc; m++) {
      const i = next(); if (i < 0) break;
      const dd = sdir(rand), rr = nucR * Math.pow(rand(), 0.6);
      const p = v3.add(c, v3.mul(dd, rr));
      writeNeuron(i, p, j, 0, G.L[j], G.Fn[j], G.inC[j] ? 1 : 0, 0.55 + 0.4 * (1 - rr / nucR), 0.35, 0.15, 0.25 * (1 - rr / nucR), 0.03);
    }
  }
  let made = 0;
  segs.forEach((s, si) => {
    const [j, k, a, b, c, u0, u1, kind, l] = s;
    const cnt = si === segs.length - 1 ? nBr - made : Math.round(nBr * l * (kind ? 0.8 : 1) / lenSum);
    made += cnt;
    const inc = G.inC[j], toParent = k >= 0 && k === G.parent[j], toChild = k >= 0 && G.parent[k] === j;
    const onTree = inc && (toParent || toChild);
    for (let m = 0; m < cnt; m++) {
      const i = next(); if (i < 0) return;
      const v = rand(), p = v3.bez(a, b, c, v), u = kind ? u0 + (u1 - u0) * v : v;
      const jit = v3.mul([rand() - 0.5, rand() - 0.5, rand() - 0.5], 0.006);
      let lit = 999, fet = 999;
      if (inc) {
        lit = toParent && !kind ? G.L[j] - S4.tau * u : G.L[j] + S4.tau * u;
        if (onTree && !kind) fet = toParent ? G.Fn[j] + S4.tau2 * u : G.Fn[j] - S4.tau2 * u;
      }
      const base = kind ? 0.2 : 0.26 * (1 - 0.35 * v);
      writeNeuron(i, v3.add(p, jit), j, u, lit, fet, onTree && !kind ? 1 : 0, base, 0.28, 0.3, 0.04, 0.05 + u * 0.38);
    }
  });
  // anything the rounding left over joins the nearest nucleus
  for (let i = next(); i >= 0; i = next()) { const j = (rand() * G.n) | 0; writeNeuron(i, G.cells[j], j, 0, G.L[j], G.Fn[j], 0, 0.3, 0.35, 0.15, 0.1, 0.03); }

  // sparks at the gaps the signal jumps, and smaller ones when the signal comes back
  let i = N - nDust - nPath - nSpark;
  {
    const edges = [];
    for (let k = 0; k < G.n; k++) if (G.parent[k] >= 0) edges.push([G.parent[k], k]);
    const per = Math.floor(nSpark / Math.max(1, edges.length * 2));
    edges.forEach(([j, k]) => {
      const mid = v3.lerp(G.cells[j], G.cells[k], 0.5);
      for (let m = 0; m < per * 2; m++, i++) {
        const back = m >= per * 1.3;
        put(sh, i, mid[0], mid[1], mid[2], 1, 0.7, 0, 0.6, 0.5);
        set4(sh.aux, i, mid[0], mid[1], mid[2], back ? G.Fn[k] + S4.tau2 + 0.03 : G.L[j] + S4.tau + S4.gapT / 2);
        sh.aux2[i * 4] = 4;
        sh.meta[i * 4 + 3] = rand();
      }
    });
    for (; i < N - nDust - nPath; i++) { sh.aux2[i * 4] = 30; sh.tgt[i * 4 + 3] = 0; }
  }
  for (let k = 0; k < nPath; k++, i++) {
    put(sh, i, 0, 0, 0, 0.62, 0.66, 0.05, 0.25, 0.3);
    sh.aux2[i * 4] = 5; sh.aux2[i * 4 + 1] = (k + rand()) / nPath;
    sh.meta[i * 4 + 3] = rand();
  }
  // faint depth behind and around the network
  for (; i < N; i++) {
    const p = [(rand() - 0.5) * 4.2, G.cells[0][1] * 0 + geo().cy + (rand() - 0.5) * (T ? 3.6 : 2.2), -2.6 + rand() * 3.0];
    put(sh, i, p[0], p[1], p[2], 0.08 + 0.12 * rand(), 0.2 + 0.6 * rand(), 0.6, 0, 0.1);
    sh.aux2[i * 4] = 29; sh.meta[i * 4 + 3] = rand();
  }
  sh.G = G;
  // the label goes on a dark cell that is on screen when it appears
  sh.anchorPick = { past: G.cells.map((c, j) => [j, c]).filter(([j]) => !G.inC[j]).map(([, c]) => [c[0], c[1] + (T ? 0.1 : 0.075), c[2]]) };
  sh.area = T ? 0.9 : 0.85;
  return sh;
}

/* ---------------------------------------------------- 05 · 자리에 없어도 */
function g5() {
  const g = geo(), T = g.tall;
  const C = T ? [0.16, g.cy + 0.12, 0] : [0.32, g.cy - 0.03, 0];
  const r = T ? 0.4 : 0.36;
  const seat = k => [C[0] + Math.cos(Math.PI / 2 + k * TAU / 6) * r, C[1] + Math.sin(Math.PI / 2 + k * TAU / 6) * r, 0];
  const knower = 1;
  const kp = seat(knower);
  const asker = T ? [-0.6, g.cy - 0.66, 0] : [-1.0, g.cy - 0.15, 0];
  const bw = T ? 0.4 : 0.34, bh = T ? 0.17 : 0.15;
  const stop = [kp[0] - (T ? 0.17 : 0.25), kp[1] + (T ? 0.21 : 0.15), 0.02];
  const tip = [(kp[0] - stop[0]) * 0.55, (kp[1] - stop[1]) * 0.55];
  const take = [C[0] + (kp[0] - C[0]) * 0.52, C[1] + (kp[1] - C[1]) * 0.52, 0.02];
  const moon = T ? { c: [0.6, g.y1 - 0.32, -0.1], R: 0.13 } : { c: [1.12, g.y1 - 0.22, -0.1], R: 0.13 };
  const dotGap = T ? 0.03 : 0.024, dotR = T ? 0.01 : 0.008;
  return { T, C, r, seat, knower, kp, asker, bw, bh, stop, tip, take, moon, dotGap, dotR };
}
function moonInto(sh, i0, n, rand, M, role) {
  clearBox(); worldSpace();
  sx.fillStyle = '#fff';
  sx.beginPath(); sx.arc(0, 0, M.R, 0, TAU); sx.fill();
  sx.globalCompositeOperation = 'destination-out';
  sx.beginPath(); sx.arc(M.R * 0.42, M.R * 0.28, M.R * 0.9, 0, TAU); sx.fill();
  sx.globalCompositeOperation = 'source-over';
  sx.setTransform(1, 0, 0, 1, 0, 0);
  take(n, rand, (k, x, y, a, e) => {
    const i = i0 + k;
    put(sh, i, x, y, (rand() - 0.5) * 0.01, (e ? 0.85 : 0.5) * (0.6 + 0.4 * a), 0.85, 0.1, e ? 0.4 : 0.2, 0.1);
    sh.aux2[i * 4] = role; sh.meta[i * 4 + 3] = rand();
  });
}
function awayShape(rand) {
  const G = g5(), T = G.T, sh = newShape('away');
  agentInto(sh, rand);
  for (let p = 0; p < 7; p++) personInto(sh, p, rand);
  let i = I_SC;
  const nCir = Math.round(N * 0.025);
  circleLine(sh, i, nCir, rand, G.C, G.r, 2, 0.13); i += nCir;
  const nMoon = Math.round(N * 0.04);
  moonInto(sh, i, nMoon, rand, G.moon, 3); i += nMoon;
  const nB = Math.round(N * 0.045);
  bubbleInto(sh, i, nB, rand, G.bw, G.bh, G.tip, 4); i += nB;
  const nDot = Math.round(N * 0.012);
  for (let k = 0; k < nDot; k++, i++) {
    const d = k % 3, dd = sdir(rand), rr = G.dotR * Math.sqrt(rand());
    put(sh, i, (d - 1) * G.dotGap + dd[0] * rr, dd[1] * rr, 0.01, 0.9, 0.6, 0.05, 0.35, 0.1);
    sh.aux2[i * 4] = 5; sh.aux2[i * 4 + 1] = d; sh.meta[i * 4 + 3] = rand();
  }
  const nBeam = Math.round(N * 0.03);
  for (let k = 0; k < nBeam; k++, i++) {
    put(sh, i, G.C[0], G.C[1], 0, 0.5, 0.9, 0, 0.35, 0.3);
    sh.aux2[i * 4] = 6; sh.aux2[i * 4 + 1] = (k + rand()) / nBeam; sh.meta[i * 4 + 3] = rand();
  }
  dust(sh, i, N - i, rand, 29, 0.7);
  sh.G = G;
  sh.area = T ? 0.42 : 0.4;
  return sh;
}

// hands out particle indices from [start, end) ranges in order; -1 when they run out
function cursor(ranges) {
  let r = 0, i = ranges.length ? ranges[0][0] : 0;
  const next = () => {
    while (r < ranges.length && i >= ranges[r][1]) { r++; if (r < ranges.length) i = ranges[r][0]; }
    return r < ranges.length ? i++ : -1;
  };
  next.left = () => { let n = 0; for (let k = r; k < ranges.length; k++) n += ranges[k][1] - (k === r ? Math.max(i, ranges[k][0]) : ranges[k][0]); return n; };
  return next;
}
// the crescent keeps the same particles from scene 5 to scene 6
const MOON0 = () => I_SC + Math.round(N * 0.025), MOONN = () => Math.round(N * 0.04);
const dirDeg = a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180), 0];

/* ---------------------------------------------------- 06 · 아낀 30분 */
function g6() {
  const g = geo(), T = g.tall, G5 = g5();
  let C, R, txt, P, rr, ang;
  if (T) {
    R = Math.min(0.44, g.h * 0.17);
    C = [0, g.y1 - R - 0.12, 0];
    txt = { c: [0, C[1] - R - 0.3, 0], w: 1.0, h: 0.26 };
    P = [-0.2, g.y0 + 0.36, 0]; rr = 0.4; ang = [128, 96, 64];
  } else {
    R = Math.min(0.42, g.h * 0.33);
    C = [0.3, g.cy + 0.02, 0];
    txt = { c: [1.13, g.cy + 0.02, 0], w: 0.56, h: 0.26 };
    P = [-0.85, g.cy - 0.32, 0]; rr = 0.42; ang = [118, 92, 62];
  }
  const I = ang.map(a => v3.add(P, v3.mul(dirDeg(a), rr)));
  const S = ang.map(a => v3.add(P, v3.mul(dirDeg(a), T ? 0.7 : 0.8)));
  const A0 = v3.add(P, v3.mul(dirDeg(ang[1] + 6), rr * 0.82));
  const secC = [0, 1, 2].map(k => { const a = (60 - 60 * k) * Math.PI / 180; return [C[0] + Math.cos(a) * R * 0.52, C[1] + Math.sin(a) * R * 0.52, 0.01]; });
  const bw = T ? 0.36 : 0.3, bh = T ? 0.16 : 0.13;
  return { T, C, R, txt, P, rr, ang, I, S, A0, secC, bw, bh, moon: G5.moon };
}
function clockShape(rand) {
  const G = g6(), T = G.T, sh = newShape('clock');
  agentInto(sh, rand);
  personInto(sh, 0, rand);
  const m0 = MOON0(), mn = MOONN();
  moonInto(sh, m0, mn, rand, G.moon, 2);
  const next = cursor([[2 * PB, m0], [m0 + mn, N]]);
  // the six empty seats of scene 5 become the clock: rim and twelve ticks first, then the three ten-minute sectors
  const nRim = Math.round(N * 0.05), nTick = Math.round(N * 0.024);
  for (let k = 0; k < nRim; k++) {
    const i = next(), a = rand() * TAU, r = G.R * (1 + (rand() - 0.5) * 0.014);
    put(sh, i, G.C[0] + Math.cos(a) * r, G.C[1] + Math.sin(a) * r, (rand() - 0.5) * 0.01, 0.5, 0.86, 0.05, 0.16, 0.15);
    set4(sh.aux2, i, 3, ((Math.PI / 2 - a) % TAU + TAU) % TAU / TAU, 0, 0);
    sh.meta[i * 4 + 3] = rand();
  }
  for (let k = 0; k < nTick; k++) {
    const i = next(), m = k % 12, a = Math.PI / 2 - m * TAU / 12, major = m % 3 === 0;
    const r = G.R * mix(major ? 0.78 : 0.86, 0.95, rand()), wj = (rand() - 0.5) * 0.008;
    put(sh, i, G.C[0] + Math.cos(a) * r - Math.sin(a) * wj, G.C[1] + Math.sin(a) * r + Math.cos(a) * wj, 0, major ? 0.9 : 0.62, 0.9, 0.02, 0.3, 0.15);
    set4(sh.aux2, i, 3, m / 12, 0, 0);
    sh.meta[i * 4 + 3] = rand();
  }
  const nSec = Math.round(N * 0.042);
  for (let s = 0; s < 3; s++) {
    for (let k = 0; k < nSec; k++) {
      const i = next(), rim = rand() < 0.22, u = rand(), a = (90 - 60 * s - 60 * u) * Math.PI / 180;
      const r = rim ? G.R * 0.9 * (1 - 0.03 * rand()) : G.R * 0.9 * Math.sqrt(rand());
      put(sh, i, G.C[0] + Math.cos(a) * r, G.C[1] + Math.sin(a) * r, (rand() - 0.5) * 0.01, rim ? 0.8 : 0.4 + 0.22 * rand(), 0.6, 0.25, rim ? 0.2 : 0.06, 0.15);
      set4(sh.aux2, i, 4, s, u, 0);
      sh.meta[i * 4 + 3] = rand();
    }
  }
  // three questions; the tail points at the person they are meant for
  const nB = Math.round(N * 0.03);
  for (let b = 0; b < 3; b++) {
    const d = v3.norm(v3.sub(G.P, G.I[b]));
    const tip = [d[0] * G.bh * 1.25, Math.min(d[1] * G.bh * 1.25, -G.bh * 0.85)];
    const ids = [];
    for (let k = 0; k < nB; k++) ids.push(next());
    const P = bubblePts(nB, rand, G.bw, G.bh, tip);
    ids.forEach((i, k) => {
      const q = P[k];
      put(sh, i, q[0], q[1], (rand() - 0.5) * 0.008, q[2], 0.5, 0, q[4] ? 0.1 : 0.05 + 0.1 * q[3], 0.3);
      set4(sh.aux2, i, 5, b, 0, 0);
      sh.meta[i * 4 + 3] = rand();
    });
  }
  // "30분" in particle letters, gathering out of a loose cloud where it will stand
  {
    const nT = Math.round(N * 0.07);
    clearBox();
    drawText(fxWord('fx.30') || '30분', { cx: G.txt.c[0], cy: G.txt.c[1], maxW: G.txt.w, lineH: G.txt.h });
    const S = sample(nT, rand), b = bounds(S.x, S.y, nT);
    for (let k = 0; k < nT; k++) {
      const i = next(), e = S.edge[k], dd = sdir(rand), rr = 0.08 + 0.22 * rand();
      put(sh, i, S.x[k], S.y[k], (rand() - 0.5) * 0.02, (0.6 + 0.4 * S.a[k]) * (e ? 1.12 : 1), 0.66, 0, e ? 0.4 : 0.14, 0.3);
      set4(sh.aux, i, S.x[k] + dd[0] * rr, S.y[k] + dd[1] * rr, dd[2] * rr, 0);
      sh.aux2[i * 4] = 6;
      sh.meta[i * 4 + 3] = (S.x[k] - b.x0) / Math.max(1e-3, b.x1 - b.x0);
    }
  }
  const rest = [];
  for (let i = next(); i >= 0; i = next()) rest.push(i);
  rest.forEach((i, k) => { dust(sh, i, 1, rand, 29, 0.6); });
  sh.G = G;
  sh.fixEnd = 2 * PB;
  sh.area = T ? 0.4 : 0.42;
  return sh;
}

/* ---------------------------------------------------- 07 · 리뷰 */
const APPROVED = [0, 2, 3];
function g7() {
  const g = geo(), T = g.tall;
  let page, frag, ap, rows;
  if (T) {
    page = { x0: -0.74, x1: 0.2, top: g.y1 - 0.4, n: 8, pitch: 0.1, bh: 0.022 };
    frag = { x: 0.6, w: 0.54, h: 0.14, lines: [0, 2, 3, 5, 7] };
    const pb = page.top - page.n * page.pitch;
    ap = [0, pb - 0.2, 0];
    rows = { x: 0.06, w: 1.36, h: 0.11, pitch: 0.17, y0: pb - 0.48 };
  } else {
    page = { x0: -1.24, x1: -0.16, top: g.y1 - 0.06, n: 9, pitch: Math.min(0.112, (g.h - 0.16) / 9), bh: 0.019 };
    frag = { x: 0.2, w: 0.46, h: 0.125, lines: [0, 2, 4, 5, 7] };
    ap = [0.66, g.cy + 0.06, 0];
    rows = { x: 1.1, w: 0.6, h: 0.1, pitch: 0.16, y0: g.cy + 0.22 };
  }
  const lineY = k => page.top - (k + 0.5) * page.pitch;
  const fragC = frag.lines.map(k => [frag.x, lineY(k), 0.02]);
  const rowC = [0, 1, 2].map(k => [rows.x, rows.y0 - k * rows.pitch, 0.02]);
  // desktop reads the rules from the bottom up so the agent arrives under them without crossing the approver
  return { T, page, frag, ap, rows, lineY, fragC, rowC, readUp: !T };
}
const S7 = { w0: 1.0, w1: 2.1, line: 0.36, frag: 1.95, fragGap: 0.12, fragDur: 0.75, ap: 2.35, appr: [2.75, 3.15, 3.55], apDur: 0.65, reject: 3.85, go: 3.75, read0: 4.55, readDur: 1.0, dim: 5.3 };
// when each line of the page is written: [start, duration]. The agent moves down the left margin and each line runs out of it to the right
function writeTimes(G) {
  const n = G.page.n, span = S7.w1 - S7.w0;
  return Array.from({ length: n }, (_, k) => [S7.w0 + span * k / n, S7.line]);
}
// the agent reads the rules in one pass down the column of checkboxes; when it passes row k
function rowPass(G, k) {
  const RW = G.rows, top = G.rowC[0][1] + RW.h * 0.5 + 0.1, bot = G.rowC[2][1] - RW.h * 0.5 - 0.1;
  const u = (top - G.rowC[k][1]) / (top - bot);
  return S7.read0 + S7.readDur * (G.readUp ? 1 - u : u);
}
// a review comment: an outlined slip with a bar down its left side and two lines of text; a rule row: a checkbox, its check and one line
function drawComment(w, h, part) {
  worldSpace();
  const x = -w / 2, y = -h / 2;
  sx.strokeStyle = '#fff'; sx.fillStyle = '#fff';
  if (part === 'frame') {
    sx.lineWidth = layout === 'tall' ? 0.009 : 0.0065;
    roundRect(x, y, w, h, Math.min(0.02, h * 0.18)); sx.stroke();
    sx.fillRect(x + w * 0.05, y + h * 0.2, Math.max(0.008, w * 0.018), h * 0.6);
  } else {
    const bh = h * 0.13;
    roundRect(x + w * 0.13, h * 0.1, w * 0.72, bh, bh / 2); sx.fill();
    roundRect(x + w * 0.13, -h * 0.24, w * 0.48, bh, bh / 2); sx.fill();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
}
function rowParts(w, h) {
  const cb = { x: -w / 2 + h * 0.55, s: h * 0.5 };
  const check = [[cb.x - cb.s * 0.32, cb.s * 0.02], [cb.x - cb.s * 0.06, -cb.s * 0.28], [cb.x + cb.s * 0.38, cb.s * 0.36]];
  return { cb, check, tx: cb.x + cb.s * 0.5 + h * 0.35 };
}
function drawRow(w, h, part) {
  const P = rowParts(w, h);
  worldSpace();
  sx.strokeStyle = '#fff'; sx.fillStyle = '#fff';
  if (part === 'frame') {
    sx.lineWidth = layout === 'tall' ? 0.009 : 0.0065;
    roundRect(-w / 2, -h / 2, w, h, Math.min(0.02, h * 0.2)); sx.stroke();
    sx.strokeRect(P.cb.x - P.cb.s / 2, -P.cb.s / 2, P.cb.s, P.cb.s);
  } else {
    const bh = h * 0.16;
    roundRect(P.tx, -bh / 2, w / 2 - P.tx - h * 0.3, bh, bh / 2); sx.fill();
  }
  sx.setTransform(1, 0, 0, 1, 0, 0);
  return P;
}
function reviewShape(rand) {
  const G = g7(), T = G.T, sh = newShape('review');
  agentInto(sh, rand);
  personInto(sh, 0, rand);
  const next = cursor([[2 * PB, N]]);
  // the page the agent writes: a faint outline, then lines of code tokens, each written left to right
  const pg = G.page, wt = writeTimes(G), r2 = rng(707);
  {
    const nO = Math.round(N * 0.03);
    const px0 = pg.x0 - 0.06, px1 = pg.x1 + 0.06, py1 = pg.top + 0.03, py0 = pg.top - pg.n * pg.pitch - 0.03;
    const per = 2 * ((px1 - px0) + (py1 - py0));
    for (let k = 0; k < nO; k++) {
      const i = next();
      let d = rand() * per, x, y;
      if (d < px1 - px0) { x = px0 + d; y = py1; }
      else if ((d -= px1 - px0) < py1 - py0) { x = px1; y = py1 - d; }
      else if ((d -= py1 - py0) < px1 - px0) { x = px1 - d; y = py0; }
      else { d -= px1 - px0; x = px0; y = py0 + d; }
      put(sh, i, x, y, -0.01, 0.22, 0.4, 0.3, 0.03, 0.1);
      set4(sh.aux2, i, 2, 0.15 + 0.3 * rand(), 0, 0);
      sh.meta[i * 4 + 3] = rand();
    }
  }
  const toks = [];
  let lv = 0;
  for (let k = 0; k < pg.n; k++) {
    lv = k === 0 ? 0 : clamp(lv + (r2() < 0.35 ? 1 : r2() < 0.6 ? -1 : 0), 0, 2);
    let x = pg.x0 + lv * 0.07;
    const end = pg.x1 - (0.05 + 0.3 * r2()) * (pg.x1 - pg.x0) * 0.6;
    while (x < end) {
      const w = Math.min(end - x, 0.04 + 0.13 * r2());
      if (w > 0.02) toks.push([k, x, w, r2() < 0.3]);
      x += w + 0.028;
    }
  }
  const tokLen = toks.reduce((a, t) => a + t[2], 0);
  const nTok = Math.round(N * 0.17);
  let made = 0;
  toks.forEach((t, ti) => {
    const [k, x, w, hi] = t, y = G.lineY(k);
    const cnt = ti === toks.length - 1 ? nTok - made : Math.round(nTok * w / tokLen);
    made += cnt;
    for (let m = 0; m < cnt; m++) {
      const i = next(), px = x + rand() * w, py = y + (rand() - 0.5) * pg.bh;
      put(sh, i, px, py, (rand() - 0.5) * 0.01, hi ? 0.75 : 0.55, hi ? 0.45 : 0.22, 0.05, hi ? 0.14 : 0.06, 0.2);
      set4(sh.aux2, i, 2, wt[k][0] + wt[k][1] * (px - pg.x0) / (pg.x1 - pg.x0), 1, 0);
      sh.meta[i * 4 + 3] = rand();
    }
  });
  // five review comments; approved ones turn into checked rule rows
  const nF = Math.round(N * 0.032), F = G.frag, RW = G.rows;
  for (let f = 0; f < 5; f++) {
    const nFr = Math.round(nF * 0.56), nCk = Math.round(nF * 0.1), nTx = nF - nFr - nCk;
    clearBox(); drawComment(F.w, F.h, 'frame'); const cf = sample(nFr, rand);
    clearBox(); drawComment(F.w, F.h, 'text'); const ct = sample(nTx, rand);
    clearBox(); const RP = drawRow(RW.w, RW.h, 'frame'); const rf = sample(nFr, rand);
    clearBox(); drawRow(RW.w, RW.h, 'text'); const rt = sample(nTx, rand);
    const ck = alongPoly(RP.check, nCk, rand, 0.005);
    for (let k = 0; k < nFr; k++) {
      const i = next(), e = rf.edge[k] || cf.edge[k];
      put(sh, i, rf.x[k], rf.y[k], 0, e ? 0.9 : 0.62, 0.62, 0.05, e ? 0.24 : 0.1, 0.2);
      set4(sh.aux, i, cf.x[k], cf.y[k], 0, 0);
      set4(sh.aux2, i, 3, f, 0, 0);
      sh.meta[i * 4 + 3] = rand();
    }
    for (let k = 0; k < nTx; k++) {
      const i = next();
      put(sh, i, rt.x[k], rt.y[k], 0, 0.62 + 0.25 * rt.a[k], 0.7, 0.05, 0.12, 0.2);
      set4(sh.aux, i, ct.x[k], ct.y[k], 0, 0);
      set4(sh.aux2, i, 3, f, 1, 0);
      sh.meta[i * 4 + 3] = rand();
    }
    for (let k = 0; k < nCk; k++) {
      const i = next(), p = ck[k];
      put(sh, i, p[0], p[1], 0.004, 1.0, 0.55, 0, 0.35, 0.2);
      set4(sh.aux, i, p[0], p[1], 0, 0);
      set4(sh.aux2, i, 3, f, 2, p[2]);
      sh.meta[i * 4 + 3] = rand();
    }
  }
  for (let i = next(); i >= 0; i = next()) dust(sh, i, 1, rand, 29, 0.7);
  sh.G = G;
  sh.fixEnd = 2 * PB;
  const f0 = G.fragC[0];
  sh.anchors.review = [f0[0] + F.w / 2 + 0.03, f0[1] + F.h * 0.55, 0];
  sh.anchors.ok = T ? [G.ap[0] + 0.12, G.ap[1], 0] : [G.ap[0], G.ap[1] - 0.15, 0];
  sh.anchors.rules = T ? [RW.x - RW.w / 2, G.rowC[0][1] + RW.h / 2 + 0.07, 0] : [RW.x + RW.w / 2, G.rowC[0][1] + RW.h / 2 + 0.07, 0];
  sh.labelAlign = T ? { review: 'right', ok: 'left', rules: 'left' } : { review: 'right', rules: 'right' };
  sh.area = T ? 0.5 : 0.5;
  return sh;
}

/* ---------------------------------------------------- 08 · 폴더 */
const CROSS = 7, INTO = 8;                 // the hero works in the front middle folder and crosses into the front right one
function g8() {
  const g = geo(), T = g.tall;
  const w = T ? 0.3 : 0.34, d = T ? 0.24 : 0.26, gx = T ? 0.16 : 0.26, gz = T ? 0.3 : 0.32;
  const ground = T ? g.cy - 0.42 : g.cy - 0.3;
  const boxes = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const f = r * 3 + c;
    const hb = (T ? 0.33 : 0.35) + 0.025 * [0, 1, -1, 1, -1, 0, -1, 0, 1][f];
    boxes.push({ f, r, c, x: (c - 1) * (w + gx), z: (r - 1) * (d + gz), w, d, hb, hf: hb * 0.48 });
  }
  const B = boxes[CROSS];
  const wallX = B.x + B.w / 2;
  const lump = [0, ground + 0.32, 0.05], lumpR = T ? 0.42 : 0.48;
  return { T, boxes, ground, w, d, wallX, lump, lumpR };
}
// a point on a folder in its own frame: x across, y up from the ground, z from back (-d/2) to front (+d/2)
function folderEdges(B) {
  const x0 = -B.w / 2, x1 = B.w / 2, zb = -B.d / 2, zf = B.d / 2, hb = B.hb, hf = B.hf;
  const tabW = B.w * 0.4, tabH = 0.05;
  return [
    // back panel and its tab
    [[x0, 0, zb], [x1, 0, zb]], [[x1, 0, zb], [x1, hb, zb]], [[x0, 0, zb], [x0, hb + tabH, zb]],
    [[x0, hb + tabH, zb], [x0 + tabW - 0.03, hb + tabH, zb]], [[x0 + tabW - 0.03, hb + tabH, zb], [x0 + tabW, hb, zb]], [[x0 + tabW, hb, zb], [x1, hb, zb]],
    // front panel
    [[x0, 0, zf], [x1, 0, zf]], [[x0, 0, zf], [x0, hf, zf]], [[x1, 0, zf], [x1, hf, zf]], [[x0, hf, zf], [x1, hf, zf]],
    // sides: bottom and the sloping top edge
    [[x0, 0, zb], [x0, 0, zf]], [[x1, 0, zb], [x1, 0, zf]], [[x0, hb, zb], [x0, hf, zf]], [[x1, hb, zb], [x1, hf, zf]]
  ];
}
function scribble3(n, rand, c, R) {
  const curves = [];
  for (let k = 0; k < 14; k++) curves.push([1 + rand() * 2.4, rand() * TAU, 1 + rand() * 2.0, rand() * TAU, 1 + rand() * 2.6, rand() * TAU, 0.55 + 0.45 * rand()]);
  const out = [];
  for (let m = 0; m < n; m++) {
    const C = curves[(rand() * curves.length) | 0], s = rand() * TAU, r = R * C[6];
    out.push([c[0] + Math.sin(C[0] * s + C[1]) * r, c[1] + Math.sin(C[2] * s + C[3]) * r * 0.55, c[2] + Math.sin(C[4] * s + C[5]) * r * 0.8]);
  }
  return out;
}
function folderShape(rand) {
  const G = g8(), T = G.T, sh = newShape('folders');
  agentInto(sh, rand);
  const next = cursor([[PB, N]]);
  const nF = Math.round(N * 0.068);
  const lumpAll = scribble3(nF * 9 + Math.round(N * 0.05), rand, G.lump, G.lumpR);
  let li = 0;
  const writeF = (i, B, p, b, temp, soft, white, part, order) => {
    put(sh, i, B.x + p[0], G.ground + p[1], B.z + p[2], b, temp, soft, white, 0.2);
    const L = lumpAll[li++ % lumpAll.length];
    set4(sh.meta, i, L[0], L[1], L[2], order);
    set4(sh.aux, i, B.f, 0, part, 0);
  };
  const seg = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  G.boxes.forEach(B => {
    const E = folderEdges(B), lens = E.map(e => Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2])), tot = lens.reduce((a, b) => a + b, 0);
    const nE = Math.round(nF * 0.46), nS = Math.round(nF * 0.32), nFill = nF - nE - nS;
    for (let k = 0; k < nE; k++) {
      let r = rand() * tot, e = 0;
      while (e < E.length - 1 && r > lens[e]) { r -= lens[e]; e++; }
      const p = seg(E[e][0], E[e][1], r / lens[e]);
      p[0] += (rand() - 0.5) * 0.004; p[1] += (rand() - 0.5) * 0.004;
      const i = next(); writeF(i, B, p, e < 6 ? 0.7 : 0.58, 0.55, 0.05, 0.1, 0, rand() * 0.5);
      sh.aux2[i * 4] = 2;
    }
    // code stripes on the inside of the back panel, above the front panel so they show
    const rows = 5, top = B.hb * 0.86, bot = B.hf * 1.12, rh = (top - bot) / (rows - 1);
    const r3 = rng(900 + B.f * 7);
    const bars = [];
    for (let k = 0; k < rows; k++) { const ind = (r3() < 0.4 ? 1 : 0) * 0.04; bars.push([-B.w / 2 + 0.04 + ind, top - k * rh, (B.w - 0.08 - ind) * (0.45 + 0.5 * r3())]); }
    const bl = bars.reduce((a, b) => a + b[2], 0);
    for (let k = 0; k < nS; k++) {
      let r = rand() * bl, m = 0;
      while (m < bars.length - 1 && r > bars[m][2]) { r -= bars[m][2]; m++; }
      const p = [bars[m][0] + r, bars[m][1] + (rand() - 0.5) * 0.012, -B.d / 2 + 0.006];
      const i = next(); writeF(i, B, p, 0.62, 0.6, 0.05, 0.1, 1, 0.4 + 0.5 * rand());
      sh.aux2[i * 4] = 2;
    }
    // a faint fill on the two side walls and the floor
    for (let k = 0; k < nFill; k++) {
      const s = rand(), u = rand(), v = rand();
      let p;
      if (s < 0.6) { const z = mix(-B.d / 2, B.d / 2, u), h = mix(B.hb, B.hf, u); p = [(s < 0.3 ? -1 : 1) * B.w / 2, v * h, z]; }
      else p = [mix(-B.w / 2, B.w / 2, u), 0.002, mix(-B.d / 2, B.d / 2, v)];
      const i = next(); writeF(i, B, p, 0.16, 0.45, 0.4, 0.02, 2, 0.2 + 0.6 * rand());
      sh.aux2[i * 4] = 2;
    }
  });
  // the wall the hero crosses: its face, then its outline (which stays clay)
  {
    const B = G.boxes[CROSS], nW = Math.round(N * 0.022), nO = Math.round(N * 0.014);
    for (let k = 0; k < nW; k++) {
      const u = rand(), v = rand(), z = mix(-B.d / 2, B.d / 2, u), h = mix(B.hb, B.hf, u);
      const i = next(); writeF(i, B, [B.w / 2 + 0.003, v * h, z], 0.14, 0.3, 0.3, 0.05, 3, rand());
      sh.aux2[i * 4] = 4;
    }
    const E = [[[0, 0, -1], [0, 0, 1]], [[0, 0, 1], [0, 1, 1]], [[0, 1, 1], [0, 1, -1]], [[0, 1, -1], [0, 0, -1]]];
    for (let k = 0; k < nO; k++) {
      const e = E[(rand() * 4) | 0], u = rand();
      const zz = mix(e[0][2], e[1][2], u), up = mix(e[0][1], e[1][1], u);
      const z = zz * B.d / 2, h = mix(B.hb, B.hf, (zz + 1) / 2) * up;
      const i = next(); writeF(i, B, [B.w / 2 + 0.004, h, z], 0.5, 0.05, 0.05, 0.1, 4, rand());
      sh.aux2[i * 4] = 4;
    }
  }
  // the other agents: smaller and dimmer than the hero
  const nA = Math.round(N * 0.011);
  for (let a = 0; a < 4; a++) {
    const ids = [];
    for (let k = 0; k < nA; k++) ids.push(next());
    for (let k = 0; k < nA; k++) {
      const i = ids[k], size = AGS() * 0.58, halo = rand() < 0.25;
      const r = halo ? size * (0.8 + 0.8 * rand()) : size * 0.4 * Math.sqrt(-2 * Math.log(1 - 0.995 * rand()));
      const dd = sdir(rand);
      put(sh, i, dd[0] * r, dd[1] * r, dd[2] * r * 0.7, halo ? 0.25 : 0.55, 0.92, halo ? 0.5 : 0.1, 0.3, 0.25);
      set4(sh.aux, i, a, 0, 0, 0);
      sh.aux2[i * 4] = 3;
      sh.meta[i * 4 + 3] = rand();
    }
  }
  // the test's ripple
  const nR = Math.round(N * 0.03);
  for (let k = 0; k < nR; k++) {
    const i = next(), dd = sdir(rand);
    put(sh, i, 0, 0, 0, 0.75, 0.2, 0.2, 0.2, 0.2);
    set4(sh.aux, i, dd[0], dd[1], dd[2], 0);
    sh.aux2[i * 4] = 5;
    sh.meta[i * 4 + 3] = rand();
  }
  for (let i = next(); i >= 0; i = next()) dust(sh, i, 1, rand, 29, 0.6);
  sh.G = G;
  sh.fixEnd = PB;
  sh.anchorPick = { folder: [0, 1, 2, 3, 5].map(f => { const B = G.boxes[f]; return [B.x - B.w / 2 + B.w * 0.2, G.ground + B.hb + 0.1, B.z - B.d / 2]; }) };
  sh.area = T ? 0.55 : 0.6;
  return sh;
}

/* ---------------------------------------------------- 09 · 연락 */
function g9() {
  const g = geo(), T = g.tall, W = innerWidth, H = innerHeight;
  const toW = (px, py) => [(px - W / 2) / pxPerUnit, (H / 2 - py) / pxPerUnit, 0];
  const c = caps[8];
  let capTop = H * 0.68;
  const btns = [];
  if (c) {
    const r = settledRect(c, c);
    if (r.height) capTop = r.top;
    c.querySelectorAll('.cta a').forEach(a => {
      let rr;
      if (a.offsetParent === c) rr = settledRect(c, a);
      else { const b = a.getBoundingClientRect(), cb = c.getBoundingClientRect(), s = settledRect(c, c); rr = { left: b.left - cb.left + s.left, top: b.top - cb.top + s.top, width: b.width, height: b.height }; }
      const p0 = toW(rr.left, rr.top), p1 = toW(rr.left + rr.width, rr.top + rr.height);
      btns.push({ x0: p0[0], x1: p1[0], y1: p0[1], y0: p1[1], el: a });
    });
  }
  const top = g.y1, bot = (H / 2 - (capTop - 24)) / pxPerUnit;
  const name = { cy: (top + bot) / 2 + (T ? 0.05 : 0.04), maxW: T ? 1.72 : 2.5, lineH: T ? Math.min(0.42, (top - bot) * 0.3) : Math.min(0.54, (top - bot) * 0.5) };
  let ag = [0, bot - 0.1, 0];
  if (btns.length) {
    const L = btns[btns.length - 1], y = (btns[0].y0 + btns[0].y1) / 2;
    ag = T ? [L.x1 - 0.06, btns[0].y1 + 0.13, 0.02] : [L.x1 + 0.14, y, 0.02];
  }
  return { T, name, btns, ag, top, bot };
}
function contactShape(rand) {
  const G = g9(), T = G.T, sh = newShape('contact');
  agentInto(sh, rand);
  const next = cursor([[PB, N]]);
  const nName = Math.round(N * 0.68);
  clearBox();
  drawText('Kunsang Lee', { cy: G.name.cy, maxW: G.name.maxW, lineH: G.name.lineH });
  const S = sample(nName, rand), b = bounds(S.x, S.y, nName);
  for (let k = 0; k < nName; k++) {
    const i = next(), e = S.edge[k];
    put(sh, i, S.x[k], S.y[k], (rand() - 0.5) * 0.04, (0.6 + 0.4 * S.a[k]) * (e ? 1.15 : 1), 0.5, 0, e ? 0.42 : 0.1, 0.45);
    sh.aux2[i * 4] = 2;
    sh.meta[i * 4 + 3] = (S.x[k] - b.x0) / (b.x1 - b.x0) * 0.7 + rand() * 0.2;
  }
  // a faint line of light around each contact link
  const nH = Math.round(N * 0.05), per = Math.floor(nH / Math.max(1, G.btns.length));
  // the links are pills, so the line follows a pill a little outside each one
  G.btns.forEach(B => {
    const pad = 0.01, x0 = B.x0 - pad, x1 = B.x1 + pad, y0 = B.y0 - pad, y1 = B.y1 + pad;
    const r = (y1 - y0) / 2, cy = (y0 + y1) / 2, w = Math.max(0, x1 - x0 - 2 * r), arc = Math.PI * r, L = 2 * w + 2 * arc;
    for (let k = 0; k < per; k++) {
      let d = rand() * L, x, y;
      if (d < w) { x = x0 + r + d; y = y1; }
      else if ((d -= w) < arc) { const a = Math.PI / 2 - d / r; x = x1 - r + r * Math.cos(a); y = cy + r * Math.sin(a); }
      else if ((d -= arc) < w) { x = x1 - r - d; y = y0; }
      else { d -= w; const a = -Math.PI / 2 - d / r; x = x0 + r + r * Math.cos(a); y = cy + r * Math.sin(a); }
      const i = next();
      put(sh, i, x, y, 0, 0.22, 0.62, 0.3, 0.05, 0.1);
      sh.aux2[i * 4] = 2;
      sh.meta[i * 4 + 3] = 0.7 + 0.3 * rand();
    }
  });
  const nBeam = Math.round(N * 0.03);
  for (let k = 0; k < nBeam; k++) {
    const i = next();
    put(sh, i, G.ag[0], G.ag[1], 0, 0.6, 0.9, 0, 0.35, 0.5);
    sh.aux2[i * 4] = 3;
    sh.meta[i * 4 + 3] = rand();
  }
  for (let i = next(); i >= 0; i = next()) dust(sh, i, 1, rand, 29, 0.5);
  sh.G = G;
  sh.fixEnd = PB;
  sh.area = S.area * 1.15;
  return sh;
}

/* ---------------------------------------------------- registry */
const BUILD = { name: nameShape, ring: ringShape, meaning: meaningShape, memory: memoryShape, away: awayShape, clock: clockShape, review: reviewShape, folders: folderShape, contact: contactShape };
const SEEDS = { name: 11, ring: 23, meaning: 37, memory: 41, away: 53, clock: 59, review: 61, folders: 67, contact: 71 };
const FIXEND = { name: 0, ring: 8 * PB, meaning: 8 * PB, memory: PB, away: 8 * PB, clock: 2 * PB, review: 2 * PB, folders: PB, contact: PB };
const cache = new Map();
let curShape = null, warmTimer = 0, fontsReady = false;
function getShape(key) {
  let s = cache.get(key);
  if (!s) { s = BUILD[key](rng(SEEDS[key])); if (s.fixEnd === undefined) s.fixEnd = FIXEND[key]; cache.set(key, s); }
  return s;
}
// build the other shapes one per timeout so no single frame pays for all of them
function warmAll(delay = 60) {
  clearTimeout(warmTimer);
  if (!fontsReady) return;
  const step = () => {
    const k = Object.keys(BUILD).find(key => !cache.has(key));
    if (k) { getShape(k); warmTimer = setTimeout(step, 50); }
  };
  warmTimer = setTimeout(step, delay);
}
function brightFor(s) {
  const dens = N / (s.area * pxPerUnit * pxPerUnit);
  return clamp(Math.pow(0.5 / dens, 0.7), 0.35, 2.4) * 1.1;
}
function useShape(key) {
  const s = getShape(key);
  const up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr); };
  up(tgtBuf, s.tgt); up(tcolBuf, s.tcol); up(metaBuf, s.meta); up(auxBuf, s.aux); up(aux2Buf, s.aux2);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  curShape = s;
  R.brightGoal = brightFor(s);
}
// fonts, language and screen size all move the picture, so every shape is rebuilt
function rebuildShapes() {
  GEO = null;
  cache.clear();
  if (curShape) useShape(curShape.key);
}

/* -------------------------------------------------------------- director */
const FREE = 0, ASSEMBLE = 1, RING = 2, MEANING = 3, MEMORY = 4, AWAY = 5, CLOCK = 6, REVIEW = 7, GALAXY = 8, FOLDERS = 9, CONTACT = 10, CUT = 11;
const U = {
  mode: 0, phaseT: 0, rt: 0, snap: 0, form: 0.8, K: 0, zeta: 0.7, ramp: 0.8, stagger: 0, noise: 0, noiseFreq: 0.85, drag: 1.2, vmax: 0,
  kick: 0, kickR: 0, kickShell: 0, colRate: 2.5, arrN: 0,
  contain: new Float32Array(2), wind: new Float32Array(3), kickC: new Float32Array(3), kickBias: new Float32Array(3),
  P: new Float32Array(4), Q: new Float32Array(4), S: new Float32Array(4), T: new Float32Array(4), V: new Float32Array(4), G: new Float32Array(4),
  Ag: new Float32Array(4), AgV: new Float32Array(4)
};
// per-frame positions the CPU decides (people, bubbles, cards, folders); uploaded as uArr
const ARR = new Float32Array(64 * 4);
const R = {
  mode: 0, jitter: 0, white: 0.04, gain: 1, bright: 1, brightGoal: 1, trail: 0, bloom: 1, exposure: 1, pulse: 0, pulseT: 0, pulseGap: 0.12,
  dim: 1, dof: 0.6, tail: 0.045, vari: 0.1, maskA: 0.6, lenK: 0.55, shift: 0, topA: 0, bg0: 1, bg1: 0, fixEnd: 0, par: 1
};
function resetUniforms() {
  U.mode = FREE; U.phaseT = 0; U.rt = 0; U.snap = 0; U.form = 0.8; U.K = 0; U.zeta = 0.7; U.ramp = 0.8; U.stagger = 0; U.noise = 0; U.noiseFreq = 0.85;
  U.drag = 1.2; U.vmax = 0; U.kick = 0; U.kickR = 0; U.kickShell = 0; U.colRate = 2.5; U.arrN = 0; U.keep0 = 0; U.keep1 = 0;
  U.contain[0] = 0.75; U.contain[1] = 8.0; U.wind.fill(0); U.kickBias.fill(0);
  U.P.fill(0); U.Q.fill(0); U.S.fill(0); U.T.fill(0); U.V.fill(0); U.G.fill(0);
  U.Ag.fill(0); U.AgV.fill(0); U.AgV[3] = 1;
  ARR.fill(0);
  R.mode = 0; R.jitter = 0; R.white = 0.04; R.gain = 1; R.trail = 0; R.bloom = 1; R.exposure = 1;
  R.pulse = 0; R.pulseT = 0; R.pulseGap = 0.12; R.dim = 1; R.dof = 0.6; R.tail = 0.045; R.vari = 0.1;
  R.maskA = 0.6; R.lenK = 0.55; R.shift = 0; R.topA = 0; R.bg0 = 1; R.bg1 = 0; R.fixEnd = curShape ? curShape.fixEnd || 0 : 0; R.par = 1;
}
function free(noise, drag) { U.mode = FREE; U.noise = noise * 0.6; U.drag = drag * 1.3; U.noiseFreq = 0.7; U.P[3] = 1.5; R.fixEnd = 0; }
function assemble(K, zeta, ramp, stagger, jit, noise) {
  U.mode = ASSEMBLE; U.K = K; U.zeta = zeta; U.ramp = ramp; U.stagger = stagger; U.P[0] = jit;
  U.noise = noise * 0.65; U.drag = 1.2; U.vmax = 5.5;
}
function hold() {
  U.mode = ASSEMBLE; U.phaseT = 99; U.K = 90; U.zeta = 0.72; U.ramp = 1; U.noise = 0.12; U.drag = 0;
  R.jitter = 0.0022;
}
// the shared settings of a story scene
function story(mode, T, rt, o) {
  U.mode = mode; U.phaseT = T; U.rt = rt;
  U.form = o.form || 0.8; U.stagger = o.stagger === undefined ? 0.35 : o.stagger; U.ramp = o.ramp || 0.6;
  U.noise = o.noise === undefined ? 0.4 : o.noise; U.noiseFreq = o.nf || 0.9; U.colRate = o.col || 2.6;
  R.tail = o.tail || 0.05; R.jitter = o.jit || 0.0008;
}

/* 흩어짐: 입자에 한 번 속도를 더하고, 화면을 잠깐 밝히고, 카메라를 흔든다 */
let pendingKick = null, flashE = 0, topA = 0;
const shakeR = rng(99);
function shake(a) {
  cam.vel.roll += (shakeR() - 0.5) * 0.5 * a;
  cam.vel.yaw += (shakeR() - 0.5) * 0.25 * a;
  cam.vel.dz -= 0.3 * a;
}
function explode(mag, bias, at, radius, shell, flash) {
  pendingKick = { mag, bias: bias || [0, 0, 0], at: at || [0, 0.05, 0], radius: radius || 0, shell: shell || 0 };
  const m = Math.min(mag, 3.5) / 3.5;
  flashE = Math.max(flashE, flash === undefined ? (radius ? 0.12 : 0.45) * m : flash);
  if (!radius) shake(m);
}

/* ---------------------------------------------------- small helpers */
const set4v = (a, x, y, z, w) => { a[0] = x; a[1] = y; a[2] = z; a[3] = w; };
function arr(i, p, w) {
  const o = i * 4;
  ARR[o] = p[0]; ARR[o + 1] = p[1]; ARR[o + 2] = p[2]; ARR[o + 3] = w;
  if (i + 1 > U.arrN) U.arrN = i + 1;
}
function arr4(i, x, y, z, w) { arr(i, [x, y, z], w); }
const L3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function B3(a, b, c, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]];
}
function vel(f, t) { const a = f(t), b = f(t + 0.02); return [(b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02, (b[2] - a[2]) / 0.02]; }
const pulse = (t, t0, k) => t < t0 ? 0 : Math.exp(-(t - t0) * k);
const win = (t, a, b, ra, rb) => sm((t - a) / ra) * (1 - sm((t - b) / rb));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// a travel easing whose top speed is only about 1.6x the average, so a moving agent never shoots
const glide = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
// keyframes [[time, [x, y, z]], ...], eased between each pair
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return L3(a[1], b[1], glide((t - a[0]) / Math.max(1e-3, b[0] - a[0]))); }
  }
  return keys[keys.length - 1][1];
}
// the shape a scene needs, even before it is the current one
const shapeOf = key => (curShape && curShape.key === key ? curShape : getShape(key));

/* 에이전트와 사람. 에이전트는 어느 장면에서나 화면에서 같은 크기로 보이도록, 카메라에서 떨어진 만큼 키운다 */
function depthScale(p) {
  const dx = p[0] - cam.eye[0], dy = p[1] - cam.eye[1], dz = p[2] - cam.eye[2];
  return clamp((dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2]) / dist, 0.3, 3);
}
function agent(f, t, glow = 1, size = 1) {
  const p = f(t), v = vel(f, t);
  set4v(U.Ag, p[0], p[1], p[2], glow);
  set4v(U.AgV, v[0], v[1], v[2], size * depthScale(p));
  return p;
}
// slot s: place, on; away turns the person into a thin empty circle; glow brightens them
function person(s, p, on, away = 0, glow = 0, size = 1) { arr(s, p, on); arr4(8 + s, away, glow, size, 0); }

/* ---------------------------------------------------- 02 · 동료 */
const S2 = { j0: 0.3, j1: 1.5, call: 1.7, grow: 2.0, beam: 2.6, pull: 3.0, ans: 3.8, fold: 4.4 };
function joinPath2(G) {
  const top = G.seat8(0);
  // the agent comes down into its seat from close by, so it never streaks across the screen
  const from = G.T ? [0.5, top[1] + 0.4, 0.1] : [0.62, top[1] + 0.3, 0.1];
  const ctrl = G.T ? [0.32, top[1] + 0.34, 0.06] : [0.4, top[1] + 0.27, 0.06];
  return t => B3(from, ctrl, top, glide((t - S2.j0) / (S2.j1 - S2.j0)));
}
function ringFrame(t, rt) {
  const sh = curShape, G = sh.G;
  story(RING, t, rt, { form: 0.7, stagger: 0.3, ramp: 0.6, noise: 0.45, col: 3 });
  // the seven make room as the agent arrives; nobody's seat is left empty
  const jn = sm((t - (S2.j1 - 0.7)) / 0.8);
  for (let p = 0; p < 7; p++) {
    const glow = p === G.caller ? 1.0 * win(t, S2.call, S2.ans + 0.7, 0.25, 0.6) : 0;
    person(p, L3(G.seat7(p), G.seat8(p + 1), jn), 1, 0, glow);
  }
  const arrive = pulse(t, S2.j1, 3.2);
  agent(joinPath2(G), t, sm((t - S2.j0 + 0.05) / 0.3) * (1 + 0.5 * arrive + 0.45 * win(t, S2.beam, S2.fold, 0.2, 0.4)), 1 + 0.12 * arrive);
  // the caller's words grow out of the caller as a small amber bubble; it stays for scene 3 to take over
  set4v(U.Q, G.cp[0], G.cp[1], G.cp[2], 1.25 * sm((t - S2.call - 0.1) / 0.5));
  arr(20, G.bubble.c, 1 - 0.25 * sm((t - S2.fold) / 0.6));
  U.S[0] = 1.15 * sm((t - S2.grow) / 0.8);
  U.S[1] = 1.05 * sm((t - S2.grow - 0.1) / 0.7);
  U.S[2] = sm((t - S2.beam) / 0.45);
  U.S[3] = win(t, S2.beam, S2.ans + 0.2, 0.2, 0.5);
  arr(16, G.fA, 1); arr(17, G.dA, 1);
  // once the answer is back, the code and the database drop to 30% so the two cards read
  U.P[0] = 0.7 * sm((t - S2.fold) / 0.6);
  set4v(U.G, S2.pull, S2.ans, S2.fold, 0);
  for (let k = 0; k < 2; k++) arr(18 + k, G.cards[k], 1);
  R.trail = t < S2.j0 ? 0.7 : t < S2.j1 + 0.3 ? 0.46 : t > S2.pull && t < S2.fold + 1.0 ? 0.6 : 0.42;
  R.tail = 0.055; R.jitter = 0.001;
}

/* ---------------------------------------------------- 03 · 말뜻 */
const S3 = { tg0: 0.5, tg1: 1.3, m0: 1.2, pass: 1.8, m1: 2.4, ck0: 2.4, ck1: 2.8, d0: 2.8, d1: 3.6, e0: 2.9, eGap: 0.42 };
function cardPath3(G, c) {
  const stack = [G.Ce[0] + 0.035 * c, G.Ce[1] + 0.03 * c, G.Ce[2]];
  if (c === 0) return t => track([[S3.m0, G.Bs], [S3.pass, G.A], [S3.m1, G.Cc], [S3.d0, G.Cc], [S3.d1, stack]], t);
  const t0 = S3.e0 + (c - 1) * S3.eGap;
  return t => track([[t0, G.Bs], [t0 + 0.42, G.A], [t0 + 0.72, G.Cc], [t0 + 0.8, G.Cc], [t0 + 1.25, stack]], t);
}
function meaningFrame(t, rt) {
  const sh = curShape, G = sh.G, G2 = G.G2;
  story(MEANING, t, rt, { form: 0.6, stagger: 0.25, ramp: 0.5, noise: 0.4, nf: 1.3, col: 3 });
  U.keep0 = I_SC; U.keep1 = I_SC + NB2();
  set4v(U.P, 1.1 * sm((t - 0.3) / 0.9), sm((t - 0.1) / 1.0), 0, 0);
  for (let p = 0; p < 7; p++) person(p, G2.seat8(p + 1), 1 - sm((t - 0.1) / 0.9));
  for (let c = 0; c < 3; c++) {
    const f = cardPath3(G, c), p = f(t);
    arr(16 + c, p, 1);
    if (c === 0) arr4(20, sm((t - S3.tg0) / (S3.tg1 - S3.tg0)), sm((t - S3.m0 - 0.3) / (S3.m1 - S3.m0 - 0.3)), sm((t - S3.ck0) / (S3.ck1 - S3.ck0)), 1);
    else {
      const t0 = S3.e0 + (c - 1) * S3.eGap;
      arr4(20 + c, sm((t - t0) / 0.25), sm((t - t0 - 0.25) / 0.45), sm((t - t0 - 0.72) / 0.12), sm((t - t0) / 0.2));
    }
  }
  // the agent stays at the top seat; it brightens each time a card passes through it
  const passes = pulse(t, S3.pass, 3.5) + pulse(t, S3.e0 + 0.42, 4) + pulse(t, S3.e0 + S3.eGap + 0.42, 4);
  agent(() => G.A, t, 1 + 0.6 * passes, 1 + 0.1 * passes);
  R.trail = t < 1.2 ? 0.55 : 0.42; R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 04 · 신경망 */
function memoryAgent(sh) {
  const G = sh.G, A3 = g3().A;
  return t => track([[0, A3], [0.8, G.A0], [S4.touch - 0.05, G.touchAt], [S4.touch + 0.35, G.touchAt], [S4.touch + 1.0, G.back]], t);
}
function memoryFrame(t, rt) {
  const sh = curShape, G = sh.G;
  story(MEMORY, t, rt, { form: 0.5, stagger: 0.2, ramp: 0.7, noise: 0.3, nf: 0.8, col: 2.4 });
  const fetchDur = 0.42, fetchEnd = G.FE + fetchDur;
  const swell = pulse(t, fetchEnd, 2.2);
  const ap = agent(memoryAgent(sh), t, 1 + 0.5 * pulse(t, S4.touch, 3) + 0.9 * swell, 1 + 0.35 * swell);
  set4v(U.Q, G.src[0], G.src[1], G.src[2], 0);
  set4v(U.S, G.ctrl[0], G.ctrl[1], G.ctrl[2], 0);
  set4v(U.P, G.T ? 1.2 : 1, sm((t - (G.FE - 0.55)) / 0.45), 1 - sm((t - S4.touch - 0.15) / 0.45), sm((t - G.FE) / 0.3));
  // the card rides just in front of the agent, a little up and to the side
  arr(16, G.T ? [0.0, 0.11, 0.05] : [0.0, 0.12, 0.05], depthScale(ap) * (G.T ? 0.55 : 0.5));
  arr(17, G.cells[G.E], 1);
  arr(18, G.pathCtrl, 1);
  arr4(19, G.FE, fetchDur, 0, 0);
  if (crossed(S4.touch)) flashE = Math.max(flashE, 0.2);
  R.trail = t < 1.6 ? 0.34 : 0.45; R.tail = 0.05; R.dof = 1.1; R.jitter = 0.001;
  R.bloom = 1 + 0.35 * win(t, S4.touch, fetchEnd + 0.6, 0.3, 1.0);
  R.topA = 0.9;
}
function memoryCam(t) {
  const G = shapeOf('memory').G;
  const c = G.cells[G.E], u = glide((t - 0.5) / 2.2);
  const f = [mix(0, c[0] * 0.6, u), mix(geo().cy, (c[1] + G.back[1]) / 2, u), mix(0, c[2] * 0.5, u)];
  return { tx: f[0], ty: f[1] - geo().cy * (1 - u) * 0, tz: f[2], dz: mix(0, -0.42, u), yaw: mix(0, 0.42, u) + 0.12 * sm((t - 3) / 5), pitch: mix(0.02, 0.12, u) };
}

/* ---------------------------------------------------- 05 · 자리에 없어도 */
const S5 = { night: 1.2, off0: 0.6, offGap: 0.16, q0: 1.4, q1: 2.25, dots0: 2.35, dots1: 3.35, go: 3.3, take: 3.6, ans0: 3.8, ans1: 4.3, home: 4.55 };
function awayAgent(sh) {
  const G = sh.G, B = shapeOf('memory').G.back;
  return t => track([[0, B], [0.8, G.C], [S5.go, G.C], [S5.take, G.take], [S5.take + 0.35, G.take], [S5.home, G.C]], t);
}
function bubblePath5(G) {
  const from = [G.asker[0] + 0.12, G.asker[1] + 0.12, 0.02];
  const ctrl = [mix(G.asker[0], G.stop[0], 0.5), Math.max(G.asker[1], G.stop[1]) + 0.22, 0.02];
  return t => B3(from, ctrl, G.stop, glide((t - S5.q0) / (S5.q1 - S5.q0)));
}
function awayFrame(t, rt) {
  const sh = curShape, G = sh.G;
  story(AWAY, t, rt, { form: 0.7, stagger: 0.25, ramp: 0.6, noise: 0.3, nf: 0.8, col: 2.2 });
  // night falls and a crescent rises
  const night = sm(t / S5.night);
  R.bg0 = mix(1, 0.42, night);
  // the crescent shows once the camera has come back from scene 4, so it rises in place instead of sliding in from the edge
  const mr = sm((t - 0.8) / 1.2);
  arr(16, [G.moon.c[0], G.moon.c[1] - 0.35 * (1 - mr), G.moon.c[2]], mr);
  U.P[0] = 1;
  // one by one the people go: a thin empty circle stays at each seat. The asker stands outside the ring
  for (let k = 0; k < 6; k++) person(1 + k, G.seat(k), 1, sm((t - (S5.off0 + S5.offGap * k)) / 0.4));
  const answered = sm((t - S5.ans1) / 0.3);
  person(0, G.asker, 1, 0, 0.85 * answered);
  // the question flies to the empty seat of the one who knows, and waits
  const bp = bubblePath5(G)(t);
  arr(17, bp, mix(0.6, 1, sm((t - S5.q0) / (S5.q1 - S5.q0))));
  const absorb = sm((t - S5.take) / 0.3);
  arr4(18, sm((t - S5.q0) / 0.15), absorb, 0, 0);
  // "typing" dots beside the empty circle blink three times, once
  const toB = v3.norm(v3.sub(G.stop, G.kp));
  const dc = v3.add(G.kp, v3.mul(toB, AGS() * 1.05 + (G.T ? 0.09 : 0.075)));
  arr(19, [dc[0], dc[1] - (G.T ? 0.02 : 0.015), 0.02], win(t, S5.dots0 - 0.05, S5.dots1, 0.1, 0.15));
  const ph = (t - S5.dots0) / ((S5.dots1 - S5.dots0) / 3);
  const blink = d => (ph < 0 || ph > 3) ? 0.35 : 0.35 + 0.65 * Math.exp(-Math.pow(((ph % 1) - 0.18 - d * 0.24) / 0.11, 2));
  arr4(20, blink(0), blink(1), blink(2), 0);
  // the agent takes it and answers the asker with a beam of light that stays as a thin line
  const ap = agent(awayAgent(sh), t, 1 + 0.6 * pulse(t, S5.take, 3) + 0.25 * win(t, S5.ans0, S5.ans1 + 0.3, 0.1, 0.4));
  arr(21, ap, 1);
  arr(22, G.asker, 1);
  U.P[1] = clamp((t - S5.ans0) / (S5.ans1 - S5.ans0), 0, 1) * 1.04;
  U.P[2] = 0.55 * sm((t - S5.ans1) / 0.3) + 0.6 * pulse(t, S5.ans1, 2.5);
  R.trail = t > S5.ans0 - 0.2 && t < S5.ans1 + 0.6 ? 0.6 : 0.48; R.tail = 0.06; R.jitter = 0.0008; R.dof = 0.7;
  // the network of scene 4 folds down into the ring: keep that first second calm
  const calm = 1 - sm((rt - 0.4) / 0.8);
  R.trail = mix(R.trail, 0.25, calm); R.tail = mix(R.tail, 0.01, calm);
}

/* ---------------------------------------------------- 06 · 아낀 30분 */
const S6 = { q0: 1.1, qGap: 0.75, fly: 0.75, text: 4.45 };
const tq6 = b => S6.q0 + S6.qGap * b, tc6 = b => tq6(b) + S6.fly;
function clockAgent(sh) {
  const G = sh.G, C5 = g5().C, keys = [[0, C5], [1.2, G.A0]];
  for (let b = 0; b < 3; b++) keys.push([tc6(b) - 0.22, G.I[b]], [tc6(b) + 0.15, G.I[b]]);
  keys.push([tc6(2) + 0.9, G.A0]);
  return t => track(keys, t);
}
function clockFrame(t, rt) {
  const sh = curShape, G = sh.G;
  story(CLOCK, t, rt, { form: 0.7, stagger: 0.3, ramp: 0.6, noise: 0.3, nf: 0.9, col: 2.4 });
  // the crescent sets and the morning warms the dark a little
  const day = sm(t / 1.2);
  R.bg0 = mix(0.42, 1, day); R.bg1 = 0.9 * sm((t - 0.3) / 1.4);
  arr(16, [G.moon.c[0], G.moon.c[1] - 0.6 * sm(t / 1.4), G.moon.c[2]], 1 - sm((t - 0.1) / 1.1));
  set4v(U.P, 1.1 * sm((t - 0.3) / 0.9), S6.text, 0, 0);
  person(0, G.P, 1, 0, 0.12 + 0.08 * Math.sin(t * 2.2));
  const fills = [0, 0, 0];
  let caught = 0;
  for (let b = 0; b < 3; b++) {
    const tq = tq6(b), tc = tc6(b);
    const p = L3(G.S[b], G.I[b], inOut((t - tq) / S6.fly));
    arr(18 + b, p, 1);
    arr4(21 + b, sm((t - tq) / 0.15), sm((t - tc) / 0.25), clamp((t - tc - 0.2) / 0.9, 0, 1), 0);
    arr(24 + b, G.secC[b], G.R * 0.3);
    fills[b] = 1.12 * sm((t - tc - 0.55) / 0.5);
    caught += pulse(t, tc, 3.2);
  }
  arr4(17, fills[0], fills[1], fills[2], 0);
  agent(clockAgent(sh), t, 1 + 0.9 * caught, 1 + 0.12 * caught);
  R.trail = t < 4.4 ? 0.5 : 0.42; R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 07 · 리뷰 */
function reviewAgent(sh) {
  const G = sh.G, pg = G.page, n = pg.n, RW = G.rows;
  const mx = pg.x0 - (G.T ? 0.07 : 0.08), y0 = G.lineY(0), yN = G.lineY(n - 1);
  const tA = S7.w0, tB = S7.w0 + (S7.w1 - S7.w0) * (n - 1) / n, tR = tB + 1.3;
  const rest = [pg.x1 + (G.T ? 0.08 : 0.1), yN - (G.T ? 0.1 : 0.02), 0.04];
  const cbx = RW.x - RW.w / 2 + RW.h * 0.55;
  const top = [cbx, G.rowC[0][1] + RW.h * 0.5 + 0.1, 0.05], bot = [cbx, G.rowC[2][1] - RW.h * 0.5 - 0.1, 0.05];
  const from = g6().A0;
  return t => {
    if (t < tA) return L3(from, [mx, y0, 0.04], glide(t / tA));
    if (t < tB) return [mx, mix(y0, yN, (t - tA) / (tB - tA)), 0.04];
    if (t < tR) return B3([mx, yN, 0.04], [mix(mx, rest[0], 0.5), Math.min(yN, rest[1]) - 0.1, 0.04], rest, glide((t - tB) / (tR - tB)));
    if (t < S7.go) return rest;
    const a = G.readUp ? bot : top, z = G.readUp ? top : bot;
    if (t < S7.read0) {
      const ctl = G.readUp ? [mix(rest[0], a[0], 0.5), Math.min(rest[1], a[1]) - 0.08, 0.05] : [mix(rest[0], a[0], 0.55), Math.max(rest[1], a[1]) + 0.08, 0.05];
      return B3(rest, ctl, a, glide((t - S7.go) / (S7.read0 - S7.go)));
    }
    return L3(a, z, clamp((t - S7.read0) / S7.readDur, 0, 1));
  };
}
function fragPath7(G, f) {
  const k = APPROVED.indexOf(f), spot = G.fragC[f];
  const from = [halfW + 0.12, spot[1] + 0.2, 0.1], t0 = S7.frag + f * S7.fragGap;
  const inPath = t => B3(from, [mix(from[0], spot[0], 0.5), spot[1] + 0.16, 0.06], spot, glide((t - t0) / S7.fragDur));
  if (k < 0) return inPath;
  const ta = S7.appr[k], via = [G.ap[0], G.ap[1] + (G.T ? 0.16 : 0.15), 0.04];
  return t => t < ta ? inPath(t) : B3(spot, via, G.rowC[k], glide((t - ta) / S7.apDur));
}
function reviewFrame(t, rt) {
  const sh = curShape, G = sh.G;
  story(REVIEW, t, rt, { form: 0.6, stagger: 0.25, ramp: 0.5, noise: 0.35, nf: 1.1, col: 3 });
  U.P[0] = sm((t - S7.dim) / 0.6);
  let apGlow = 0;
  for (let f = 0; f < 5; f++) {
    const p = fragPath7(G, f)(t), k = APPROVED.indexOf(f);
    arr(16 + f, p, sm((t - S7.frag - f * S7.fragGap) / 0.2));
    if (k >= 0) {
      const ta = S7.appr[k], tr = rowPass(G, k) - 0.08;
      apGlow += pulse(t, ta, 3.5);
      arr4(21 + f, sm((t - ta - 0.1) / 0.4), 0, 0.9 * pulse(t, tr + 0.1, 2.4) + 0.3 * sm((t - tr) / 0.2), clamp((t - ta - S7.apDur + 0.05) / 0.3, 0, 1));
    } else {
      const r = APPROVED.length ? [1, 4].indexOf(f) : 0;
      arr4(21 + f, 0, sm((t - S7.reject - 0.08 * r) / 0.5), 0, 0);
    }
  }
  person(0, G.ap, sm((t - S7.ap) / 0.3), 0, 0.9 * apGlow);
  agent(reviewAgent(sh), t, 1 + 0.35 * win(t, S7.read0 - 0.05, S7.read0 + S7.readDur, 0.1, 0.3));
  R.trail = t < S7.w1 ? 0.55 : 0.44; R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 08 · 폴더 */
const S8 = { unravel: 0.3, enter0: 1.5, enter1: 2.1, go: 2.45, arrive: 3.05, stay: 0.95, back: 0.75 };
const SMALL8 = [1, 3, 5, 6];
function orbit8(G, f, t, k) {
  const B = G.boxes[f], w = t * (0.9 + 0.13 * k) + k * 1.7;
  return [B.x + Math.sin(w) * B.w * 0.24, G.ground + B.hf * 0.8 + 0.04 * Math.sin(w * 0.7 + k), B.z + Math.cos(w * 1.2) * B.d * 0.2];
}
function crossPlan8(sh) {
  if (sh.plan) return sh.plan;
  const G = sh.G, A = G.boxes[CROSS], B = G.boxes[INTO];
  const P5 = [B.x - B.w * 0.12, G.ground + A.hf * 0.85, B.z + 0.02];
  const start = orbit8(G, CROSS, S8.go, 0);
  const mid = [(start[0] + P5[0]) / 2, Math.max(start[1], P5[1]) + 0.14, (start[2] + P5[2]) / 2];
  const go = t => B3(start, mid, P5, glide((t - S8.go) / (S8.arrive - S8.go)));
  let tc = S8.arrive;
  for (let tt = S8.go; tt <= S8.arrive; tt += 0.005) if (go(tt)[0] >= G.wallX) { tc = tt; break; }
  const leave = S8.arrive + S8.stay, home = leave + S8.back;
  sh.plan = { P5, go, tc, X: go(tc), leave, home };
  return sh.plan;
}
// the camera at a given pose, for one projection; the live camera is put back afterwards
function poseView(pose, fn) {
  const keep = {};
  for (const k of CAMK) { keep[k] = cam[k]; cam[k] = pose[k] || 0; }
  buildView();
  const r = fn();
  for (const k of CAMK) cam[k] = keep[k];
  buildView();
  return r;
}
// the cut from 7 to 8 keeps the agent where it was on screen: its last spot in scene 7, seen through scene 8's first camera
function matchSpot8(sh, start) {
  if (sh.M) return sh.M;
  const T7 = SCENES[6].Tend, p = reviewAgent(shapeOf('review'))(T7);
  const s = poseView(SCENES[6].cam(T7), () => project(p[0], p[1], p[2]));
  sh.M = s ? poseView(foldersCam(0), () => unproject(s[0], s[1])) : start;
  return sh.M;
}
function hero8(sh) {
  const G = sh.G, pl = crossPlan8(sh);
  const start = [G.lump[0] + 0.08, G.lump[1] + G.lumpR * 0.8, G.lump[2] + 0.3];
  const M = matchSpot8(sh, start);
  const stayAt = t => [pl.P5[0] + 0.03 * Math.sin((t - S8.arrive) * 3), pl.P5[1], pl.P5[2]];
  return t => {
    if (t < 1.1) return L3(M, start, glide(t / 1.1));
    if (t < S8.enter0) return start;
    if (t < S8.enter1) return L3(start, orbit8(G, CROSS, S8.enter1, 0), glide((t - S8.enter0) / (S8.enter1 - S8.enter0)));
    if (t < S8.go) return orbit8(G, CROSS, t, 0);
    if (t < S8.arrive) return pl.go(t);
    if (t < pl.leave) return stayAt(t);
    if (t < pl.home) {
      const from = stayAt(pl.leave), back = orbit8(G, CROSS, pl.home, 0);
      return B3(from, [(from[0] + back[0]) / 2, Math.max(from[1], back[1]) + 0.14, (from[2] + back[2]) / 2], back, glide((t - pl.leave) / (pl.home - pl.leave)));
    }
    return orbit8(G, CROSS, t, 0);
  };
}
function small8(G, k) {
  const f = SMALL8[k], t0 = S8.enter0 + 0.08 * (k + 1), t1 = S8.enter1 + 0.08 * (k + 1);
  const a = k * 1.57 + 0.6, start = [G.lump[0] + Math.cos(a) * G.lumpR * 0.6, G.lump[1] + 0.12 * Math.sin(a * 1.3), G.lump[2] + Math.sin(a) * G.lumpR * 0.6];
  return t => t < t0 ? start : t < t1 ? L3(start, orbit8(G, f, t1, k + 1), glide((t - t0) / (t1 - t0))) : orbit8(G, f, t, k + 1);
}
function foldersFrame(t, rt) {
  const sh = curShape, G = sh.G, pl = crossPlan8(sh);
  story(FOLDERS, t, rt, { form: 0.5, stagger: 0.15, ramp: 0.6, noise: 0.45, nf: 0.9, col: 6 });
  const hero = hero8(sh);
  const hp = agent(hero, t, 1 + 0.4 * pulse(t, pl.tc, 2.5));
  const inCross = (t > S8.enter1 - 0.1 && t < S8.go + 0.1) || t > pl.home - 0.1;
  for (let f = 0; f < 9; f++) {
    let glow = 0;
    if (f === CROSS && inCross) glow = 1;
    if (f === INTO) glow = win(t, S8.arrive - 0.1, pl.leave, 0.15, 0.3);
    const k = SMALL8.indexOf(f);
    if (k >= 0) glow = sm((t - S8.enter1 - 0.08 * (k + 1)) / 0.3) * 0.75;
    arr4(24 + f, glow, S8.unravel + 0.09 * f, 0, 0);
  }
  for (let k = 0; k < 4; k++) {
    const f = small8(G, k), p = f(t), v = vel(f, t);
    arr(16 + k, p, depthScale(p));
    arr4(20 + k, v[0], v[1], v[2], 0.7 * sm((t - 1.1) / 0.4));
  }
  // the test: the wall flashes, keeps a thin clay outline, and a ripple runs from the crossing to the hero
  const reach = dist3(pl.X, pl.P5) + 0.05;
  set4v(U.P, pulse(t, pl.tc, 3.2) * (t >= pl.tc ? 1 : 0), sm((t - pl.tc) / 0.3), win(t, pl.tc + 0.05, pl.tc + 0.95, 0.1, 0.35), 0);
  set4v(U.Q, pl.X[0], pl.X[1], pl.X[2], reach * sm((t - pl.tc - 0.05) / 0.5));
  R.trail = t < 1.2 ? 0.6 : 0.48; R.tail = 0.06; R.jitter = 0.0008; R.dof = 0.9;
  R.bloom = 1 + 0.5 * pulse(t, pl.tc, 2.5);
}
function foldersCam(t) {
  const G = shapeOf('folders').G, T = G.T;
  return { yaw: mix(0.5, 0.26, inOut(t / 6)), pitch: T ? 0.36 : 0.3, dz: T ? -0.12 : 0.06, ty: G.ground + (T ? 0.08 : 0.12), tz: 0.05 };
}

/* ---------------------------------------------------- 09 · 연락 */
let linkHover = -1, linkHold = 0;
const beam9 = { s: 0, r: 0, tgt: [0, 0, 0] };
function contactFrame(t, rt, dt) {
  const sh = curShape, G = sh.G;
  story(CONTACT, t, rt, { form: 0.9, stagger: 0.45, ramp: 0.6, noise: 0.35, col: 2.4 });
  const from = hero8(shapeOf('folders'))(SCENES[7].Tend);
  agent(tt => track([[0, from], [1.4, G.ag]], tt), t, 1);
  // a beam toward the contact link under the pointer or the keyboard focus
  const B = linkHover >= 0 ? G.btns[linkHover] : null;
  if (B) beam9.tgt = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, 0];
  beam9.s += ((B ? 1 : 0) - beam9.s) * (1 - Math.exp(-dt * 9));
  beam9.r += ((B ? 1 : 0) - beam9.r) * (1 - Math.exp(-dt * (B ? 6 : 3)));
  arr(16, beam9.tgt, 1);
  U.P[0] = beam9.s; U.P[1] = beam9.r;
  R.trail = 0.4; R.tail = 0.04; R.jitter = 0.0009; R.maskA = 0.8; R.par = 0;
}

/* 이름표: 장면의 기준점을 화면 좌표로 옮겨 붙인다. 개수에는 붙이지 않는다 */
const LABELS = {
  ring: (sh, t) => {
    const G = sh.G;
    sh.anchors.agent = [U.Ag[0] - AGS() * 1.9, U.Ag[1] + AGS() * 0.3, U.Ag[2]];
    for (let k = 0; k < 2; k++) { const c = G.cards[k]; sh.anchors[k ? 'pr' : 'ticket'] = [c[0] + 0.15 * G.cs + 0.035, c[1], c[2]]; }
    const low = t > S2.fold + 0.2 ? 'lo' : true;
    return { agent: t > S2.j0 + 0.25 && t < S2.ans + 0.3, team: t > 0.8, code: t > S2.grow + 0.45 && low, db: t > S2.grow + 0.55 && low, ticket: t > S2.fold + 0.45, pr: t > S2.fold + 0.55 };
  },
  meaning: (sh, t) => ({ gate: t > 0.9 }),
  memory: (sh, t) => ({ past: t > 0.95 }),
  away: (sh, t) => {
    const G = sh.G, b = bubblePath5(G)(t);
    sh.anchors.q = [b[0] + G.bw * 0.5 + 0.02, b[1] + G.bh * 0.55, 0];
    return { q: t > S5.q0 + 0.1 && t < S5.take + 0.15 };
  },
  clock: (sh, t) => {
    const G = sh.G, p = L3(G.S[0], G.I[0], inOut((t - tq6(0)) / S6.fly));
    sh.anchors.q = [p[0] + G.bw * 0.5 + 0.02, p[1] + G.bh * 0.55, 0];
    return { q: t > tq6(0) + 0.1 && t < tc6(0) + 0.15 };
  },
  review: (sh, t) => {
    const G = sh.G, f = G.fragC[1];
    sh.anchors.review = [f[0] + G.frag.w / 2, f[1] + G.frag.h * 0.5 + 0.05, 0];
    return { review: t > S7.frag + 0.6, ok: t > S7.ap + 0.25, rules: t > S7.appr[0] + 0.5 };
  },
  folders: (sh, t) => {
    const pl = crossPlan8(sh);
    sh.anchors.test = [pl.X[0] + 0.02, pl.X[1] + 0.2, pl.X[2]];
    return { folder: t > 1.3, test: t > pl.tc + 0.1 && t < pl.tc + 1.3 };
  }
};

/* 장면마다 이야기 시간(Tend)과 사건이 끝나는 때(ev), 카메라를 둔다. 장면 1과 본문 뒤 은하는 실제 시간으로 돈다 */
const SCENES = [
  { key: 'name', real: true, camK: 5, from: { yaw: -0.42, pitch: 0.16, dz: 0.95, roll: 0.22 }, cam: () => ({}) },
  { key: 'ring', Tend: 10, ev: 5.0, camK: 3.2, cam: t => ({ yaw: mix(-0.1, 0.07, sm(t / 8.5)), pitch: 0.05, dz: 0.02 }), frame: ringFrame },
  { key: 'meaning', Tend: 9, ev: 4.5, camK: 3.2, cam: () => ({ pitch: 0.02 }), frame: meaningFrame },
  { key: 'memory', Tend: 10.2, ev: 5.1, camK: 2.4, cam: t => memoryCam(t), frame: memoryFrame },
  { key: 'away', Tend: 9.8, ev: 4.9, camK: 2.6, cam: t => ({ yaw: mix(-0.06, 0.05, sm(t / 8)), pitch: 0.05, dz: 0.02 }), frame: awayFrame },
  { key: 'clock', Tend: 9.8, ev: 4.9, camK: 2.8, cam: () => ({ pitch: 0.02 }), frame: clockFrame },
  { key: 'review', Tend: 11.2, ev: 5.6, camK: 3, cam: t => ({ dz: mix(-0.06, 0.02, sm(t / 3)) }), frame: reviewFrame },
  { key: 'folders', Tend: 9.6, ev: 4.8, camK: 2.4, cut: true, cam: t => foldersCam(t), frame: foldersFrame },
  { key: 'contact', Tend: 3.6, ev: 1.8, camK: 3, cam: () => ({}), frame: contactFrame },
  { key: 'galaxy', real: true, camK: 2.5, cam: () => ({}) }
];
const GALAXY_I = SCENES.length - 1;
function galaxyFrame(t) {
  const tall = layout === 'tall';
  U.mode = GALAXY; U.phaseT = t; U.noise = 0.25; U.noiseFreq = 0.8;
  U.P[0] = 1.08; U.P[1] = -0.42; U.P[2] = tall ? 1.25 : 1.75; U.P[3] = 0.05;
  U.Q[0] = tall ? 0.1 : 0.55; U.Q[1] = tall ? 0.2 : 0.0; U.Q[2] = -0.7; U.Q[3] = 0.16;
  U.S[0] = 3.0 * sm(t / 2.5) + 0.3; U.S[1] = 0.62;
  U.colRate = 1.2;
  R.trail = 0.55; R.dim = 0.85; R.jitter = 0.0012; R.tail = 0.03; R.fixEnd = 0;
}

/* ------------------------------------------------------- scroll and UI */
const sections = [...document.querySelectorAll('.scene')];
const caps = sections.map(s => s.querySelector('.cap'));
const afterEl = document.querySelector('.after');
const navBtns = [...document.querySelectorAll('#tabs button')];
const bars = navBtns.map(b => b.querySelector('.bar i'));
const lblEls = {};
document.querySelectorAll('.lbl').forEach(el => { lblEls[el.dataset.l] = el; });
const lblOn = {};
const lblW = {};

/* 장면 진행은 스크롤에 묶는다. 장면 구간 안에서 화면 가운데가 지난 비율 f 로 목표 이야기 시간 Tend × min(f / 0.8, 1) 을 정하고
   (끝 20% 는 마지막 모양에 머문다. 장면 9 는 본문이 화면에 들어오기 전에 끝나도록 끝 절반), 그리는 시간은 그 목표를 쫓는다. 사건 구간에서는 쫓는 속도에 상한을 두어 휙 넘겨도
   사건이 보이게 하고, 목표가 한 장면 넘게 앞서거나 뒤처지면 바로 그 장면으로 건너뛴다. 장면 1 과 본문 뒤 은하는 실제 시간으로 돈다 */
const KCH = 6, VMIN = 0.6, VEV = 1.5, VEVB = 3, VREST = 10, CUT_HOLD = 0.32;
let sceneIdx = -1, storyT = 0, prevStoryT = 0, rt = 0, realT = 0, simTime = 1.0;
let cut = null, snapNext = false, manual = false, manualTo = 0, waitingFont = false, nameAt = -1;
const lastAg = new Float32Array(4), lastAgV = new Float32Array(4);
let agSpd = 0;
/* 에이전트는 장면이 바뀌어도 한 빛이다. 장면이 원하는 자리로 미끄러지되 화면 긴 변의 AG_V 배/초보다 빨리 가지 않아 혜성이 되지 않는다 */
const AG_V = 0.8, agPos = new Float32Array(3);
let agLive = false, agInit = false;
const isStory = i => !SCENES[i].real;
const crossed = a => prevStoryT < a && storyT >= a;
function scrollTarget() {
  if (afterEl && afterEl.getBoundingClientRect().top < innerHeight * 0.5) return { i: GALAXY_I, f: 0 };
  const mid = innerHeight * 0.5;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    if (r.bottom > mid) return { i, f: clamp((mid - r.top) / Math.max(1, r.height), 0, 1) };
  }
  return { i: sections.length - 1, f: 1 };
}
const FULL = i => i === 8 ? 0.5 : 0.8;
const tgtT = (i, f) => isStory(i) ? SCENES[i].Tend * Math.min(f / FULL(i), 1) : 0;
const gpos = (i, t) => i + (isStory(i) ? t / SCENES[i].Tend : 0.5);
function chase(t, tt, sc, dt) {
  const d = tt - t;
  if (Math.abs(d) < 1e-5) return tt;
  const fwd = d > 0, inEv = fwd ? t < sc.ev : t <= sc.ev + 1e-3;
  const cap = inEv ? (fwd ? VEV : VEVB) : VREST;
  const step = clamp(Math.abs(d) * KCH, VMIN, cap) * dt;
  return Math.abs(d) <= step ? tt : t + (fwd ? step : -step);
}
// scenes whose particles draw letters wait for Pretendard
function needsFont(i) { const k = SCENES[i].key; return k === 'name' || k === 'clock' || k === 'contact'; }
// the caption box of the scene in NDC (centre and half size, with a margin); particles fade inside it
const capRect = new Float32Array([0, -0.8, 0.5, 0.12]);
let capTopPx = 1e4;
function measureCap() {
  const c = caps[Math.min(sceneIdx, caps.length - 1)];
  if (!c || sceneIdx === GALAXY_I) { capRect[1] = -3; return; }
  let r = settledRect(c, c), my = 26;
  capTopPx = r.height ? r.top : 1e4;
  // the last scene keeps the contact links outside the box, so only the words are masked
  const h = c.querySelector('h2'), p = c.querySelector('.sub');
  if (sceneIdx === 8 && h && p) {
    const a = settledRect(c, h), b = settledRect(c, p);
    r = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: a.top, bottom: b.bottom, width: Math.max(a.right, b.right) - Math.min(a.left, b.left), height: b.bottom - a.top };
    my = 10;
  }
  if (!r.height) return;
  const mx = Math.min(70, innerWidth * 0.06);
  capRect[0] = ((r.left + r.right) / 2) / innerWidth * 2 - 1;
  capRect[1] = 1 - ((r.top + r.bottom) / 2) / innerHeight * 2;
  capRect[2] = Math.max(0.05, (r.width / 2 + mx) / innerWidth * 2);
  capRect[3] = Math.max(0.03, (r.height / 2 + my) / innerHeight * 2);
}
function applyCamGoal() {
  const sc = SCENES[sceneIdx];
  const g = (isStory(sceneIdx) ? sc.cam(storyT) : sc.cam(realT)) || {};
  for (const k of CAMK) cam.goal[k] = g[k] || 0;
  cam.k = sc.camK || 6;
}
function enter(i, t0, how) {
  const prev = sceneIdx;
  agLive = how !== 'show' && how !== 'first' && prev >= 1 && prev < GALAXY_I && isStory(i);
  if (!agLive) agInit = false;
  sceneIdx = i; storyT = prevStoryT = t0; rt = 0; realT = 0; nameAt = -1;
  const sc = SCENES[i];
  waitingFont = !fontsReady && needsFont(i) && sc.key !== 'name';
  if (isStory(i) && !waitingFont) useShape(sc.key);
  if (sc.key === 'name' && how !== 'first') explode(1.6, [0, 0, 0.8]);
  if (how === 'cut') snapNext = true;
  applyCamGoal();
  if (how === 'cut' || how === 'show') snapCamera();
  root.classList.toggle('in-sec', i === GALAXY_I);
  root.classList.toggle('at0', i === 0);
  root.classList.toggle('at-end', i === 8);
  caps.forEach((c, k) => { if (c) c.classList.toggle('on', k === i); });
  measureCap();
  for (const k in lblEls) setLabel(k, false);
  syncUI(true);
}
// 7 과 8 사이는 컷: 장면 7 의 입자는 그 자리에서 어둠으로 사라지고, 장면 8 은 새 입자로 시작한다
function go(i, t0) {
  const a = sceneIdx;
  if (isStory(a) && isStory(i) && ((a <= 6 && i === 7) || (a === 7 && i <= 6))) {
    cut = { t: 0, i, T: t0 };
    for (const k in lblEls) setLabel(k, false);
    return;
  }
  enter(i, t0, 'go');
}
function direct(dt) {
  prevStoryT = storyT;
  if (cut) {
    cut.t += dt;
    if (cut.t >= CUT_HOLD) {
      // a match cut: the picture changes around the agent, which stays at the same spot on screen
      const c = cut, sp = project(agPos[0], agPos[1], agPos[2]);
      cut = null;
      enter(c.i, c.T, 'cut');
      if (sp && agInit) { const w = unproject(sp[0], sp[1]); agPos[0] = w[0]; agPos[1] = w[1]; agPos[2] = w[2]; }
    }
    return;
  }
  if (manual) { if (storyT < manualTo) storyT = Math.min(manualTo, storyT + dt); return; }
  if (waitingFont) return;
  const tg = scrollTarget(), i = sceneIdx, sc = SCENES[i];
  if (tg.i === i) {
    if (isStory(i)) storyT = chase(storyT, tgtT(i, tg.f), sc, dt);
    return;
  }
  const tt = tgtT(tg.i, tg.f);
  if (!isStory(i) || tg.i === GALAXY_I) { go(tg.i, tg.i > i ? 0 : tt); return; }
  if (Math.abs(gpos(tg.i, tt) - gpos(i, storyT)) > 1) { go(tg.i, tg.i > i ? 0 : tt); return; }
  // the next or previous scene: finish this one in that direction first, so words and picture stay together
  if (tg.i > i) {
    storyT = chase(storyT, sc.Tend, sc, dt);
    if (storyT >= sc.Tend) go(i + 1, 0);
  } else {
    storyT = chase(storyT, 0, sc, dt);
    if (storyT <= 0) go(i - 1, isStory(i - 1) ? SCENES[i - 1].Tend : 0);
  }
}
// scrolling fast stretches the afterimage and pushes the camera forward a little; speed is read per simulation tick
let lastTickY = scrollY;
function readScrollSpeed(dt) {
  const dy = Math.abs(scrollY - lastTickY);
  lastTickY = scrollY;
  if (dy > 0 && dt > 0) warp.v = Math.max(warp.v, Math.min(dy / innerHeight / dt / 2.5, 1));
}
// a tab moves the page to the end of that scene and plays it from the start
navBtns.forEach((b, i) => b.addEventListener('click', () => {
  apStop();
  const s = sections[i], r = s.getBoundingClientRect();
  const y = i === 0 ? 0 : r.top + scrollY + (FULL(i) + 0.02) * r.height - innerHeight * 0.5;
  scrollTo({ top: Math.max(0, Math.round(y)), behavior: 'instant' });
  lastTickY = scrollY;
  cut = null;
  if (i !== sceneIdx) enter(i, 0, 'go');
}));

/* 첫 진입 자동 재생: 맨 위에서 열고 아무것도 건드리지 않으면 장면 1 의 이름이 모인 뒤 페이지를 프로그램으로 천천히 내린다.
   장면 진행은 그대로 스크롤에 묶여 있어 탭과 진행 막대도 함께 움직인다. 장면마다 AP_T 초 동안 이야기 시간을 1배속으로 보여 주고
   (Tend 를 넘는 몫은 마지막 모양에 머문다) AP_GLIDE 초 동안 다음 장면 첫머리로 미끄러진다. 장면 9 의 마지막 모양에서 한 번 끝나고
   본문으로 내려가거나 되풀이하지 않는다. 사용자가 직접 넘기려는 입력(휠·트랙패드, 터치로 끌기, 스크롤 키, 스크롤바, 장면 탭·목차 클릭)을
   하면 그 자리에서 끝나고 다시 켜지지 않는다. 포인터를 움직이거나 입자를 누르는 것, 한/EN 버튼과 연락처 링크는 끝내지 않는다 */
const AP_T = [0, 9.0, 8.6, 9.0, 9.0, 9.0, 9.6, 11.8, 3.6];
const AP_PAUSE = 1.2, AP_GLIDE = 0.8, AP_GLIDE0 = 0.9;
const ap = { on: false, over: CAPTURE ? !qs.has('autoplay') : qs.has('noauto') || !!location.hash, ph: 'wait', i: 0, t: 0, ya: 0, yb: 0, setY: -1, el: 0 };
const apEase = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const docY = (i, f) => { const r = sections[i].getBoundingClientRect(); return r.top + scrollY + f * r.height - innerHeight * 0.5; };
function apStop() {
  if (ap.over) return;
  ap.over = true; ap.on = false;
  root.classList.remove('autoplay');
}
function apScroll(y) {
  scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  ap.setY = scrollY;
}
function autoplay(dt) {
  if (ap.over) return;
  if (ap.ph === 'wait') {
    // a position restored by reload, or any scene other than 1, means the visit did not start at the top
    if (scrollY > 2 || sceneIdx !== 0) { apStop(); return; }
    if (!ap.on) { ap.on = true; root.classList.add('autoplay'); }
    if (nameAt < 0 || realT - nameAt < 1.9 + AP_PAUSE) return;
    ap.ph = 'glide'; ap.i = 1; ap.t = 0; ap.ya = scrollY; ap.setY = scrollY;
  }
  ap.el += dt;
  // the page moved without us (scrollbar, find in page, keyboard focus, a link): the visitor has taken over
  if (ap.setY >= 0 && Math.abs(scrollY - ap.setY) > 2) { apStop(); return; }
  if (ap.ph === 'glide') {
    ap.t += dt;
    const u = Math.min(1, ap.t / (ap.i === 1 ? AP_GLIDE0 : AP_GLIDE)), yb = docY(ap.i, 0) + 2;
    apScroll(ap.ya + (yb - ap.ya) * apEase(u));
    if (u >= 1) { ap.ph = 'play'; ap.t = 0; ap.yb = yb; }
    return;
  }
  // play: the scene's story time runs at 1x from the moment the director has entered it (after the 7/8 cut, after fonts)
  if (sceneIdx === ap.i && !cut && !waitingFont) ap.t += dt;
  const sc = SCENES[ap.i], T = Math.min(ap.t, sc.Tend);
  apScroll(Math.max(ap.yb, docY(ap.i, FULL(ap.i) * T / sc.Tend)));
  if (ap.t >= AP_T[ap.i]) {
    if (ap.i === 8) { ap.over = true; ap.on = false; ap.ph = 'end'; root.classList.remove('autoplay'); return; }
    ap.ph = 'glide'; ap.i++; ap.t = 0; ap.ya = scrollY;
  }
}
// inputs that mean "I will scroll myself"; scroll events are not read, so the program's own scrolling never counts
addEventListener('wheel', apStop, { passive: true, capture: true });
addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown' || k === 'Home' || k === 'End' || k === 'Escape') apStop();
  else if ((k === ' ' || k === 'Spacebar') && !(e.target && e.target.closest && e.target.closest('button,input,select,textarea,summary,[contenteditable]'))) apStop();
}, true);
let apTouch = null;
addEventListener('touchstart', e => { const t = e.touches[0]; apTouch = t && e.touches.length === 1 ? [t.clientX, t.clientY] : null; if (e.touches.length > 1) apStop(); }, { passive: true, capture: true });
addEventListener('touchmove', e => { const t = e.touches[0]; if (!apTouch || !t || Math.hypot(t.clientX - apTouch[0], t.clientY - apTouch[1]) > 6) apStop(); }, { passive: true, capture: true });
// a press on the scrollbar (classic scrollbars sit outside the client area)
addEventListener('mousedown', e => { const d = document.documentElement; if (e.clientX >= d.clientWidth || e.clientY >= d.clientHeight) apStop(); }, true);
document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('a[href^="#"],#tabs button')) apStop(); }, true);
addEventListener('pagehide', apStop);

let uiScene = -1;
const barVal = bars.map(() => '');
function syncUI(force) {
  const i = Math.min(sceneIdx, sections.length - 1);
  if (force || uiScene !== sceneIdx) {
    uiScene = sceneIdx;
    navBtns.forEach((b, k) => { if (k === i && sceneIdx !== GALAXY_I) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  const prog = sceneIdx === GALAXY_I ? 1 : isStory(sceneIdx) ? clamp(storyT / SCENES[sceneIdx].Tend, 0, 1) : clamp(realT / 2.6, 0, 1);
  bars.forEach((b, k) => {
    const v = k === i ? prog.toFixed(3) : k < i ? '1' : '0';
    if (barVal[k] !== v) { barVal[k] = v; b.style.transform = `scaleX(${v})`; }
  });
}

/* 이름표: 장면의 기준점을 화면 좌표로 옮겨 붙인다 */
function setLabel(k, on) {
  if (lblOn[k] === on) return;
  lblOn[k] = on;
  lblEls[k].classList.toggle('on', on);
}
const lblPick = {};
function pickAnchor(list) {
  const top = geo().topPx + 36, bot = capTopPx - 70, lo = 30, hi = innerWidth - 130;
  const px = innerWidth * 0.3, py = top + (bot - top) * 0.3;
  let best = null, bd = Infinity;
  list.forEach((a, i) => {
    const p = project(a[0], a[1], a[2]);
    if (!p || p[0] < lo || p[0] > hi || p[1] < top || p[1] > bot) return;
    const d = Math.hypot(p[0] - px, p[1] - py);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function placeLabels() {
  const sc = SCENES[sceneIdx];
  const fn = LABELS[sc.key];
  if (cut || !fn || !curShape || curShape.key !== sc.key || waitingFont) return;
  const want = fn(curShape, storyT);
  const align = curShape.labelAlign || {};
  for (const k in want) {
    const el = lblEls[k], pick = curShape.anchorPick && curShape.anchorPick[k];
    let a = curShape.anchors[k];
    if (pick) {
      const lp = lblPick[k];
      if (want[k] && (!lp || lp.shape !== curShape)) lblPick[k] = { shape: curShape, i: pickAnchor(pick) };
      if (lblPick[k] && lblPick[k].shape === curShape && lblPick[k].i !== null) a = pick[lblPick[k].i];
    }
    if (!el || !a) continue;
    if (want[k] || lblOn[k]) {
      const off = (curShape.labelOff && curShape.labelOff[k]) || [0, 0];
      const p0 = project(a[0], a[1], a[2]), p = p0 && [p0[0] + off[0], p0[1] + off[1]];
      if (p) {
        // keep the whole label inside the screen
        if (!lblW[k]) lblW[k] = el.offsetWidth;
        const w = lblW[k], m = 10, al = align[k];
        const lo = al === 'left' ? m : al === 'right' ? w + m : w / 2 + m;
        const hi = al === 'left' ? innerWidth - w - m : al === 'right' ? innerWidth - m : innerWidth - w / 2 - m;
        const x = clamp(p[0], lo, Math.max(lo, hi)), y = clamp(p[1], geo().topPx + 8, Math.min(innerHeight - 90, capTopPx - 22));
        const tx = al === 'left' ? '0' : al === 'right' ? '-100%' : '-50%';
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(${tx},-50%)`;
      }
    }
    setLabel(k, !!want[k]);
    el.classList.toggle('lo', want[k] === 'lo');
  }
}

// 장면 9: 연락처 링크를 가리키거나 포커스가 가면 에이전트가 그쪽으로 빛줄기를 뻗는다
const ctaLinks = caps[8] ? [...caps[8].querySelectorAll('.cta a')] : [];
ctaLinks.forEach((a, k) => {
  const on = () => { linkHover = k; };
  const off = () => { if (linkHover === k) linkHover = -1; };
  a.addEventListener('pointerenter', on);
  a.addEventListener('pointerleave', off);
  a.addEventListener('pointerdown', on, { passive: true });
  a.addEventListener('focus', on);
  a.addEventListener('blur', off);
});

/* --------------------------------------------------------------- pointer */
const pointer = { x: 0, y: 0, active: false, down: false, s: 0, r: 0.18, downAt: 0, dx: 0, dy: 0 };
const pointerU = new Float32Array(4);
function stageOn() { return sceneIdx !== GALAXY_I; }
function setPointer(e) { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = 1 - e.clientY / innerHeight * 2; }
function onUI(e) { return !!(e.target && e.target.closest && e.target.closest('a,button,input,label,summary,select,textarea,.top,.tabs,.after,footer,.lang')); }
addEventListener('pointermove', e => {
  if (!stageOn()) { pointer.active = false; return; }
  setPointer(e);
  if (e.pointerType === 'mouse') pointer.active = true;
}, { passive: true });
addEventListener('pointerdown', e => {
  if (!stageOn() || onUI(e)) return;
  setPointer(e); pointer.down = true; pointer.active = true;
  pointer.downAt = performance.now(); pointer.dx = e.clientX; pointer.dy = e.clientY;
}, { passive: true });
addEventListener('pointerup', e => {
  if (!pointer.down) return;
  const tap = performance.now() - pointer.downAt < 320 && Math.hypot(e.clientX - pointer.dx, e.clientY - pointer.dy) < 10;
  pointer.down = false;
  if (e.pointerType !== 'mouse') pointer.active = false;
  if (tap && stageOn()) scatterAt(e.clientX, e.clientY);
}, { passive: true });
addEventListener('pointercancel', () => { pointer.down = false; pointer.active = false; });
document.addEventListener('mouseout', e => { if (!e.relatedTarget) { pointer.active = false; pointer.down = false; } });
function updatePointer(dt) {
  const target = pointer.active ? (pointer.down ? 48 : 26) : 0;
  const rr = pointer.down ? 0.3 : 0.18;
  const k = 1 - Math.exp(-dt * 10);
  pointer.s += (target - pointer.s) * k;
  pointer.r += (rr - pointer.r) * k;
  pointerU[0] = pointer.x; pointerU[1] = pointer.y; pointerU[2] = pointer.r; pointerU[3] = pointer.s > 0.05 ? pointer.s : 0;
  const px = pointer.active && R.par ? pointer.x : 0, py = pointer.active && R.par ? pointer.y : 0;
  parallax.x += (px - parallax.x) * (1 - Math.exp(-dt * 2));
  parallax.y += (py - parallax.y) * (1 - Math.exp(-dt * 2));
}
// a tap: a local burst at the point; the springs pull everything back into the same scene
function scatterAt(px, py) {
  const w = unproject(px, py);
  explode(3.0, [0, 0, 0.5], w, 0.7);
}

/* ------------------------------------------------------------ simulation */
// 01 · 이름: 흩어진 구름이 글꼴이 준비되면 이름으로 모여 멈춘다(실제 시간)
function nameFrame(t) {
  if (nameAt < 0) {
    if (t >= 0.35 && fontsReady) { nameAt = t; useShape('name'); }
    else { free(1.5, 0.9); R.trail = 0.86; R.tail = 0.06; U.colRate = 0; return; }
  }
  const s = t - nameAt, u = clamp(s / 1.9, 0, 1);
  if (s < 1.9) { assemble(64, 0.62, 0.62, 0.5, 0.2, 1.2); U.phaseT = s; R.trail = mix(0.86, 0.3, sm(u)); R.tail = mix(0.06, 0.035, u); }
  else { hold(); R.trail = 0.25; }
}
function glideAgent(dt) {
  const w0 = U.Ag[0], w1 = U.Ag[1], w2 = U.Ag[2];
  if (!agLive || !agInit) { agPos[0] = w0; agPos[1] = w1; agPos[2] = w2; agInit = true; return; }
  const dx = w0 - agPos[0], dy = w1 - agPos[1], dz = w2 - agPos[2], d = Math.hypot(dx, dy, dz);
  const want = depthScale([w0, w1, w2]);
  if (d > 1e-6) {
    const vmax = AG_V * Math.max(innerWidth, innerHeight) / pxPerUnit * depthScale(agPos);
    if (d <= vmax * dt) { agPos[0] = w0; agPos[1] = w1; agPos[2] = w2; }
    else {
      const k = vmax * dt / d;
      agPos[0] += dx * k; agPos[1] += dy * k; agPos[2] += dz * k;
      U.AgV[0] = dx / d * vmax; U.AgV[1] = dy / d * vmax; U.AgV[2] = dz / d * vmax;
    }
  }
  U.Ag[0] = agPos[0]; U.Ag[1] = agPos[1]; U.Ag[2] = agPos[2];
  U.AgV[3] *= depthScale(agPos) / Math.max(1e-3, want);
}
function simulate(dt) {
  resetUniforms();
  const sc = SCENES[sceneIdx];
  if (cut) {
    U.mode = CUT; U.phaseT = storyT; U.rt = rt;
    U.Ag.set(lastAg); U.AgV.set(lastAgV); U.AgV[0] = U.AgV[1] = U.AgV[2] = 0;
    R.trail = 0.5; R.fixEnd = PB;
  } else if (sc.key === 'name') nameFrame(realT);
  else if (sc.key === 'galaxy') galaxyFrame(realT);
  else if (waitingFont) { free(2.0, 1.25); R.trail = 0.8; }
  else {
    sc.frame(storyT, rt, dt);
    glideAgent(dt);
    // a fast agent would leave a comet of afterimages; the faster it moves, the shorter the afterimage of the whole frame
    if (dt > 0) {
      const sp = Math.hypot(U.Ag[0] - lastAg[0], U.Ag[1] - lastAg[1], U.Ag[2] - lastAg[2]) / dt;
      agSpd = sp > 6 ? agSpd : agSpd + (sp - agSpd) * (1 - Math.exp(-dt * 12));
      R.trail = Math.min(R.trail, clamp(0.56 - 0.13 * agSpd, 0.22, 1));
    }
    lastAg.set(U.Ag); lastAgV.set(U.AgV);
  }
  if (snapNext) { U.snap = 1; snapNext = false; }
  if (pendingKick) {
    U.kick = pendingKick.mag; U.kickBias.set(pendingKick.bias); U.kickC.set(pendingKick.at); U.kickR = pendingKick.radius; U.kickShell = pendingKick.shell;
    pendingKick = null;
  }
  const u = simP.u;
  gl.useProgram(simP.p);
  gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, simTime); gl.uniform1f(u.uPhaseT, U.phaseT);
  gl.uniform1f(u.uRT, U.rt); gl.uniform1f(u.uSnap, U.snap); gl.uniform1f(u.uForm, U.form);
  gl.uniform1i(u.uMode, U.mode); gl.uniform2i(u.uKeep, U.keep0, U.keep1); gl.uniform1f(u.uAgKeep, agLive ? 1 : 0);
  gl.uniform1f(u.uK, U.K); gl.uniform1f(u.uZeta, U.zeta);
  gl.uniform1f(u.uRamp, U.ramp); gl.uniform1f(u.uStagger, U.stagger); gl.uniform1f(u.uNoise, U.noise);
  gl.uniform1f(u.uNoiseFreq, U.noiseFreq); gl.uniform1f(u.uDrag, U.drag); gl.uniform1f(u.uVmax, U.vmax);
  gl.uniform1f(u.uKick, U.kick); gl.uniform1f(u.uKickR, U.kickR); gl.uniform1f(u.uKickShell, U.kickShell);
  gl.uniform1f(u.uAspect, aspect); gl.uniform1f(u.uColRate, U.colRate);
  gl.uniform2fv(u.uContain, U.contain); gl.uniform3fv(u.uWind, U.wind);
  gl.uniform3fv(u.uKickC, U.kickC); gl.uniform3fv(u.uKickBias, U.kickBias);
  gl.uniform3fv(u.uEye, cam.eye); gl.uniform3fv(u.uCamR, cam.right); gl.uniform3fv(u.uCamU, cam.up); gl.uniform3fv(u.uCamF, cam.fwd);
  gl.uniform4fv(u.uP, U.P); gl.uniform4fv(u.uQ, U.Q); gl.uniform4fv(u.uS, U.S); gl.uniform4fv(u.uT, U.T); gl.uniform4fv(u.uU, U.V); gl.uniform4fv(u.uG, U.G);
  gl.uniform4fv(u.uAg, U.Ag); gl.uniform4fv(u.uAgV, U.AgV);
  if (U.arrN && u.uArr) gl.uniform4fv(u.uArr, ARR, 0, U.arrN * 4);
  gl.uniform4fv(u.uPointer, pointerU);
  gl.uniformMatrix4fv(u.uVP, false, VP);

  gl.bindVertexArray(vaos[cur]);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfo);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, stateP[1 - cur]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, stateV[1 - cur]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 2, stateC[1 - cur]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, N);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 2, null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.bindVertexArray(null);
  cur = 1 - cur;
  simTime += dt; rt += dt; realT += dt;
}
let bgS0 = 1, bgS1 = 0;
function tick(dt) {
  updatePointer(dt);
  autoplay(dt);
  readScrollSpeed(dt);
  warp.s += (warp.v - warp.s) * (1 - Math.exp(-dt * 8));
  warp.v *= Math.exp(-dt * 4);
  flashE *= Math.exp(-dt * 3.2);
  topA += (R.topA - topA) * (1 - Math.exp(-dt * 4));
  bgS0 += (R.bg0 - bgS0) * (1 - Math.exp(-dt * 3));
  bgS1 += (R.bg1 - bgS1) * (1 - Math.exp(-dt * 3));
  // particles still in the last scene's shape keep its brightness for a moment instead of jumping to the new shape's level
  R.bright += (R.brightGoal - R.bright) * (1 - Math.exp(-dt * 2.2));
  direct(dt);
  if (!cut) applyCamGoal();
  stepCamera(dt);
  const n = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < n; i++) simulate(dt / n);
}

/* --------------------------------------------------------------- render */
function quad(prog, target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
  gl.bindVertexArray(quadVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function bindTex(unit, tex, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); }
function palette(u) { gl.uniform3fv(u.uClay, CLAY); gl.uniform3fv(u.uAmber, AMBER); gl.uniform3fv(u.uCream, CREAM); }
// the agent and the people keep one brightness in every scene: the level the ring scene gives them
const fixBright = () => brightFor({ area: layout === 'tall' ? 0.5 : 0.55 });
function draw(dt) {
  const src = trail[ti], dst = trail[1 - ti];
  const trailK = Math.max(R.trail, mix(R.trail, 0.93, warp.s));
  gl.disable(gl.BLEND);
  gl.useProgram(fadeP.p);
  bindTex(0, src.tex, fadeP.u.uTex);
  gl.uniform1f(fadeP.u.uDecay, trailK > 0 ? Math.pow(trailK, dt * 60) : 0);
  quad(fadeP, dst);

  const px = dpr * clamp(2.3 * Math.sqrt(pxPerUnit / 450), 1.4, 2.9);
  // the scene's own afterimage keeps its glow; the extra afterimage from fast scrolling only smears and never brightens
  const base = R.gain * (HDR ? 1 : 0.6) * Math.sqrt((1 - R.trail) / 0.75) * (1 - trailK) / Math.max(1 - R.trail, 1e-3);
  const bright = R.bright * base, fixB = fixBright() * base;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
  gl.viewport(0, 0, dst.w, dst.h);

  // comet tails under the points
  gl.useProgram(stP.p);
  const s = stP.u;
  gl.uniformMatrix4fv(s.uVP, false, VP);
  gl.uniform1f(s.uPx, px); gl.uniform1f(s.uFocus, cam.focus);
  gl.uniform1f(s.uBright, bright); gl.uniform1f(s.uFixB, fixB); gl.uniform1i(s.uFixEnd, R.fixEnd);
  gl.uniform1i(s.uAgEnd, PB); gl.uniform1f(s.uAgMax, AGS() * 1.6);
  gl.uniform1f(s.uTail, R.tail * (1 + 2.2 * warp.s)); gl.uniform1f(s.uGain, 0.3);
  gl.uniform1f(s.uMaxLen, 0.75); gl.uniform1f(s.uVar, R.vari); gl.uniform1f(s.uWhite, R.white);
  // tails stretched by fast scrolling spread the same light over a longer line instead of adding more
  gl.uniform1f(s.uLenK, Math.min(1, R.lenK + 0.35 * warp.s)); gl.uniform1f(s.uShift, R.shift);
  gl.uniform2f(s.uView, dst.w, dst.h); gl.uniform4fv(s.uMask, capRect); gl.uniform1f(s.uMaskA, R.maskA); gl.uniform1f(s.uTopA, topA);
  palette(s);
  gl.bindVertexArray(streakVaos[cur]);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);

  gl.useProgram(ptP.p);
  const u = ptP.u;
  gl.uniformMatrix4fv(u.uVP, false, VP);
  gl.uniform1f(u.uFocus, cam.focus);
  gl.uniform1f(u.uPx, px);
  gl.uniform1f(u.uTime, simTime);
  gl.uniform1f(u.uBright, bright); gl.uniform1f(u.uFixB, fixB); gl.uniform1i(u.uFixEnd, R.fixEnd);
  gl.uniform1f(u.uWhite, R.white); gl.uniform1f(u.uJitter, R.jitter);
  gl.uniform1f(u.uPulse, R.pulse); gl.uniform1f(u.uPulseT, R.pulseT); gl.uniform1f(u.uPulseGap, R.pulseGap);
  gl.uniform1f(u.uDof, R.dof); gl.uniform1f(u.uVar, R.vari); gl.uniform1f(u.uMaxPx, 26 * dpr); gl.uniform1f(u.uShift, R.shift);
  gl.uniform4fv(u.uMask, capRect); gl.uniform1f(u.uMaskA, R.maskA); gl.uniform1f(u.uTopA, topA);
  gl.uniform1i(u.uRMode, R.mode);
  palette(u);
  gl.bindVertexArray(vaos[cur]);
  gl.drawArrays(gl.POINTS, 0, N);
  gl.disable(gl.BLEND);
  ti = 1 - ti;

  gl.useProgram(downP.p);
  let sIn = dst;
  for (const L of levels) {
    bindTex(0, sIn.tex, downP.u.uTex);
    gl.uniform2f(downP.u.uTexel, 1 / sIn.w, 1 / sIn.h);
    quad(downP, L);
    sIn = L;
  }
  gl.useProgram(avgP.p);
  bindTex(0, levels[4].tex, avgP.u.uTex);
  bindTex(1, avgT[ai].tex, avgP.u.uPrev);
  gl.uniform1f(avgP.u.uDown, 1 - Math.exp(-dt * 2.2));
  quad(avgP, avgT[1 - ai]);
  ai = 1 - ai;
  gl.useProgram(upP.p);
  let small = levels[4];
  for (let k = 3; k >= 0; k--) {
    bindTex(0, small.tex, upP.u.uTex);
    bindTex(1, levels[k].tex, upP.u.uAdd);
    gl.uniform2f(upP.u.uTexel, 1 / small.w, 1 / small.h);
    quad(upP, ups[k]);
    small = ups[k];
  }
  gl.useProgram(compP.p);
  bindTex(0, dst.tex, compP.u.uScene);
  bindTex(1, ups[0].tex, compP.u.uBloom);
  bindTex(2, avgT[ai].tex, compP.u.uAvg);
  gl.uniform1f(compP.u.uKey, AE_KEY); gl.uniform1f(compP.u.uAEPow, AE_POW);
  gl.uniform1f(compP.u.uExposure, R.exposure);
  gl.uniform1f(compP.u.uBloomStr, (R.bloom + 1.4 * flashE + 0.4 * warp.s) * 0.2);
  gl.uniform1f(compP.u.uAspect, aspect);
  gl.uniform1f(compP.u.uDim, R.dim);
  gl.uniform1f(compP.u.uFlash, Math.min(flashE, 1.5));
  gl.uniform2f(compP.u.uBgM, bgS0, bgS1);
  quad(compP, null);
  gl.bindVertexArray(null);
}

let AE_KEY = +(qs.get('aek') || 0.2), AE_POW = +(qs.get('aep') || 0.85);

/* ------------------------------------------------------------- the loop */
const perf = { frames: 0, sum: 0, list: [], js: 0 };
const fpsEl = document.getElementById('fps');
if (SHOW_FPS && fpsEl) fpsEl.hidden = false;
let last = 0, raf = 0, fpsShown = 0, slow = 0, skip = false, carry = 0;
function loop(now) {
  raf = requestAnimationFrame(loop);
  const t0 = performance.now();
  const ms = last ? now - last : 16.7;
  last = now;
  if (CAPTURE) return;
  // behind the reading sections the cloud only drifts, so half the frames are enough
  if (sceneIdx === GALAXY_I && !SHOW_FPS) { skip = !skip; if (skip) { carry += ms; return; } }
  const fms = ms + carry; carry = 0;
  perf.frames++; perf.sum += ms; if (perf.list.length < 20000) perf.list.push(ms);
  slow = ms > 21 ? slow + 1 : Math.max(0, slow - 1);
  if (slow > 45 && dprCap > 1 && dpr > 1) { dprCap = 1; slow = 0; resize(); }
  const dt = Math.min(fms / 1000, 1 / 20);
  tick(dt);
  draw(dt);
  placeLabels();
  syncUI(false);
  perf.js += performance.now() - t0;
  if (SHOW_FPS && fpsEl && now - fpsShown > 500) {
    fpsShown = now;
    const recent = perf.list.slice(-60);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    fpsEl.textContent = `${(1000 / avg).toFixed(1)} fps\n${N.toLocaleString('en-US')} particles${HDR ? '' : '\nLDR'}\ndpr ${dpr}`;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
});
let resizeTimer = 0;
addEventListener('resize', () => { ap.setY = -1; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); GEO = null; measureCap(); for (const k in lblW) delete lblW[k]; }, 120); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
canvas.addEventListener('webglcontextrestored', () => location.reload());

/* ------------------------------------------------------------- fonts */
function fontsDone() {
  if (fontsReady) return;
  fontsReady = true;
  rebuildShapes();
  measureCap();
  if (waitingFont) { waitingFont = false; rt = 0; useShape(SCENES[sceneIdx].key); }
  warmAll(CAPTURE ? 0 : 300);
}
function loadFonts() {
  const text = 'Kunsang Lee 이건상 30분 min';
  const goFonts = () => {
    if (!document.fonts || !document.fonts.load) { fontsDone(); return; }
    const want = Promise.all([
      document.fonts.load(`800 80px "Pretendard Variable"`, text),
      document.fonts.load(`760 80px "Pretendard Variable"`, text)
    ]);
    Promise.race([want, new Promise(r => setTimeout(r, 2500))]).then(() => document.fonts.ready).then(fontsDone, fontsDone);
  };
  const link = document.getElementById('font-css');
  if (!link) { goFonts(); return; }
  if (link.sheet && link.media === 'all') { goFonts(); return; }
  link.addEventListener('load', () => setTimeout(goFonts, 0), { once: true });
  link.addEventListener('error', fontsDone, { once: true });
  setTimeout(() => { if (!fontsReady) goFonts(); }, 2600);
}

/* ------------------------------------------------------------- language */
/* 언어를 바꾸면 글 칸의 크기와 장면 6·9 의 글자가 바뀐다. 입자를 한 번 흩은 뒤 새 모양으로 다시 모은다 */
addEventListener('fx:lang', () => {
  for (const k in lblW) delete lblW[k];
  rebuildShapes();
  measureCap();
  if (sceneIdx !== GALAXY_I) explode(1.5, [0, 0, 0.6]);
  warmAll(500);
});

/* ------------------------------------------------------------- start */
resize();
{
  const st = scrollTarget();
  enter(st.i, 0, 'first');
  snapCamera();
  if (SCENES[st.i].from) {
    // the first visit starts the camera far off and lets it fly in
    const f = SCENES[st.i].from;
    for (const k of CAMK) { cam[k] = f[k] || 0; cam.vel[k] = 0; }
    buildView();
  }
}
loadFonts();
window.__fxStarted = true;
raf = requestAnimationFrame(loop);

/* ------------------------------------------- hooks for capture and timing */
window.__story = {
  N, get hdr() { return HDR; },
  state: () => ({ scene: sceneIdx, key: SCENES[sceneIdx].key, t: +storyT.toFixed(3), rt: +rt.toFixed(2), real: +realT.toFixed(2), cut: !!cut, manual, fonts: fontsReady, layout, lang: root.lang,
    auto: { on: ap.on, over: ap.over, ph: ap.ph, i: ap.i, t: +ap.t.toFixed(2), el: +ap.el.toFixed(2) }, y: scrollY }),
  step(n = 1) { for (let i = 0; i < n; i++) { tick(1 / 60); draw(1 / 60); } placeLabels(); syncUI(false); return this.state(); },
  // capture: show a scene from its start and play it at its own pace, apart from the scroll
  show(i, fromPose) {
    manual = true; manualTo = 0; cut = null;
    enter(i, 0, 'show');
    if (fromPose && SCENES[i].from) { const f = SCENES[i].from; for (const k of CAMK) { cam[k] = f[k] || 0; cam.vel[k] = 0; } buildView(); }
    return this.state();
  },
  runTo(t) {
    const now = isStory(sceneIdx) ? storyT : realT;
    const frames = Math.max(0, Math.round((t - now) * 60));
    manualTo = t;
    const quiet = Math.max(0, frames - 45);
    for (let i = 0; i < quiet; i++) tick(1 / 60);
    clearTrails();
    for (let i = quiet; i < frames; i++) { tick(1 / 60); draw(1 / 60); }
    placeLabels();
    syncUI(false);
    return this.state();
  },
  setT(t) { manual = true; storyT = manualTo = t; return this.state(); },
  // capture: hand over to scene i the way scrolling does (including the 7/8 cut), then let story time run at 1x
  chain(i) { manual = true; cut = null; go(i, 0); manualTo = 1e9; return this.state(); },
  runFor(sec) { const n = Math.round(sec * 60); for (let k = 0; k < n; k++) { tick(1 / 60); draw(1 / 60); } placeLabels(); syncUI(false); return this.state(); },
  tend(i) { return SCENES[i].Tend || 0; },
  // measurement: the agent's on-screen speed (CSS px per second) through scene i at 1x
  agentTrace(i) {
    this.show(i); manualTo = 1e9;
    const out = [], n = Math.round((SCENES[i].Tend || 3) * 60);
    let prev = null;
    for (let k = 0; k < n; k++) {
      tick(1 / 60);
      const p = project(U.Ag[0], U.Ag[1], U.Ag[2]);
      if (p && prev) out.push([+storyT.toFixed(3), +(Math.hypot(p[0] - prev[0], p[1] - prev[1]) * 60).toFixed(0), +p[0].toFixed(0), +p[1].toFixed(0)]);
      prev = p;
    }
    return out;
  },
  auto() { manual = false; return this.state(); },
  warm() { Object.keys(BUILD).forEach(getShape); return cache.size; },
  brights() { const r = {}; for (const k of Object.keys(BUILD)) r[k] = +brightFor(getShape(k)).toFixed(3); r.fix = +fixBright().toFixed(3); return r; },
  geo() { return Object.assign({}, geo()); },
  ae() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, avgT[ai].fb);
    let v;
    if (HDR) { const f = new Float32Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, f); v = f[0]; }
    else { const b = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); v = b[0] / 255; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const a = v / Math.max(1 - v, 1e-3) * R.exposure;
    return { avg: +a.toFixed(3), scale: +(a > AE_KEY ? Math.pow(AE_KEY / a, AE_POW) : 1).toFixed(3) };
  },
  setAE(k, p) { AE_KEY = k; AE_POW = p; },
  perf() {
    const l = perf.list.slice().sort((a, b) => a - b);
    const q = p => l.length ? l[Math.min(l.length - 1, Math.floor(p * l.length))] : 0;
    return { frames: perf.frames, avgFps: perf.frames ? 1000 * perf.frames / perf.sum : 0, p50ms: q(0.5), p95ms: q(0.95), p99ms: q(0.99), maxMs: l.length ? l[l.length - 1] : 0, jsMsPerFrame: perf.frames ? perf.js / perf.frames : 0 };
  },
  resetPerf() { perf.frames = 0; perf.sum = 0; perf.list = []; perf.js = 0; },
  probe(n = 60) {
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { tick(1 / 60); draw(1 / 60); sync(); }
    return (performance.now() - t0) / n;
  }
};
})();
