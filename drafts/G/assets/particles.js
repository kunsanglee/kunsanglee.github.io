/* Kunsang Lee · 입자 이야기. drafts/F 의 입자 엔진(WebGL2 변환 피드백, 스프링, curl 노이즈, 잔상·블룸)을 바탕으로
   원근 카메라 비행·피사계 심도·혜성 꼬리를 더했다. 스크롤한 위치의 장면을 한 번 연출한 뒤 멈추고,
   저절로 넘어가거나 되풀이하지 않는다. */
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

/* 모드: 0 흩어짐 1 모이기·멈춤 2 동료 원(장면 2) 3 말뜻(장면 3) 4 기억 성운(장면 4) 5 언제든(장면 5)
   6 띠(장면 6) 7 리뷰(장면 7) 8 은하(본문 뒤) 9 구조물(장면 8) 10 함께(장면 9).
   역할은 aAux2.x, 장면 시간은 uPhaseT. uArr 는 자리·혜성·카드처럼 CPU 가 매 프레임 정하는 위치를 싣는다 */
const SIM_VS = `#version 300 es
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
uniform float uDt, uTime, uPhaseT;
uniform int uMode;
uniform float uK, uZeta, uRamp, uStagger, uNoise, uNoiseFreq, uDrag, uVmax, uKick, uKickR, uKickShell, uAspect, uColRate;
uniform vec2 uContain;
uniform vec3 uWind, uKickC, uKickBias, uEye, uCamR, uCamU, uCamF;
uniform vec4 uP, uQ, uS, uT, uU, uG, uPointer;
uniform vec4 uArr[32];
uniform mat4 uVP;
out vec4 vPos;
out vec4 vVel;
out vec4 vCol;
${NOISE}
float eInOut(float s){ s = clamp(s, 0.0, 1.0); return s < 0.5 ? 4.0*s*s*s : 1.0 - pow(-2.0*s + 2.0, 3.0) * 0.5; }
float eOut(float s){ s = 1.0 - clamp(s, 0.0, 1.0); return 1.0 - s*s*s; }
float sm1(float x){ x = clamp(x, 0.0, 1.0); return x*x*(3.0 - 2.0*x); }
vec2 rot(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 sphereDir(vec2 s){ float z = s.x*2.0 - 1.0; float a = s.y*6.2831853; float r = sqrt(max(0.0, 1.0 - z*z)); return vec3(cos(a)*r, sin(a)*r, z); }
vec3 bez(vec3 a, vec3 b, vec3 c, float t){ float u = 1.0 - t; return u*u*a + 2.0*u*t*b + t*t*c; }
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
// 장면 6 의 띠: 가로(uG.x = 0)면 왼쪽에서 오른쪽으로, 세로면 위에서 아래로 흐른다
vec3 ribbonAt(float s, float t){
  float w = uQ.y * (0.6 * sin(s * 1.7 - t * 0.9) + 0.4 * sin(s * 0.63 + t * 0.5));
  float zz = 0.12 * sin(s * 1.2 + t * 0.4);
  return uG.x < 0.5 ? vec3(s, uQ.z + w, zz) : vec3(uQ.z + w, -s, zz);
}

void main(){
  vec3 p = aPos.xyz;
  vec3 v = aVel.xyz;
  float br = aPos.w;
  vec4 col = aCol;
  vec3 tgt = aTgt.xyz;
  float dt = uDt;
  float brT = aTgt.w;
  vec2 ct = aTCol.xy;
  float cw = aTCol.z;
  float tw = aTCol.w;
  float flash = 0.0;
  float wf = 0.0;
  float t = uPhaseT;
  vec3 acc = vec3(0.0);
  vec3 nz = vec3(0.0);
  if (uNoise > 0.0) nz = curl(p * uNoiseFreq + vec3(0.0, 0.0, uTime * 0.12)) * uNoise;

  if (uKick > 0.0) {
    float loc = uKickR > 0.0 ? 0.15 : 1.0;
    vec3 d = p - uKickC;
    d.xy += (aSeed.xy - 0.5) * 0.6 * loc;
    d.z += (aSeed.z - 0.5) * 0.9 * loc;
    float f = uKickR > 0.0 ? exp(-dot(d, d) / (uKickR * uKickR)) : 1.0;
    vec3 dir = mix(normalize(d + vec3(1e-4)), sphereDir(aSeed.zw), uKickShell);
    float mag = mix(0.35 + 0.9 * aSeed.w, 0.86 + 0.28 * aSeed.x, uKickShell);
    v = v * (1.0 - 0.6 * uKickShell * f) + (dir * uKick * mag + uKickBias * (0.4 + 0.9 * aSeed.y)) * f;
  }

  vec3 goal = tgt;
  vec3 gv = vec3(0.0);
  float k = 0.0;
  float z = 0.8;
  float role = aAux2.x;
  bool sprung = true;

  if (uMode == 0) {                       // free: swirling curl-noise cloud
    acc += nz + cloud(p, uP.w) + uWind;
    v += acc * dt;
    v *= exp(-uDrag * dt);
    sprung = false;
  } else if (uMode == 1) {                // assemble / hold: spring to target
    float delay = aMeta.w * uStagger + aSeed.x * uP.x;
    float a = sm1((uPhaseT - delay) / uRamp);
    float kk = uK * a;
    acc += (tgt - p) * kk - v * (2.0 * uZeta * sqrt(kk) + uDrag * (1.0 - a)) + nz * (1.0 - 0.9 * a) + cloud(p, 1.5) * (1.0 - a) * uP.y;
    v += acc * dt;
    sprung = false;
  } else if (uMode == 2) {                // 02 colleague ring: join, call, look up, answer, fold into cards
    float form = sm1((t - aMeta.w * 0.7) / 0.8);
    k = 110.0 * max(form, 0.04); z = 0.78;
    if (role < 0.5) {                     // a person
      int s = int(aAux.x + 0.5);
      vec4 S = uArr[s];
      goal = S.xyz + tgt;
      float glow = clamp(S.w - 1.0, 0.0, 1.5);
      brT *= form * min(S.w, 1.0) * (1.0 + 0.9 * glow);
      cw = mix(cw, 0.75, glow * 0.6);
    } else if (role < 1.5) {              // the new light
      goal = uT.xyz + tgt * uT.w;
      gv = uU.xyz;
      k = 160.0; z = 0.82;
      brT *= uU.w;
      tw = 1.0;
    } else if (role < 2.5) {              // the faint circle the seats sit on
      brT *= sm1((t - 0.25 - aAux2.y * 0.9) / 0.4);
    } else if (role < 3.5) {              // code forest: branches grow from the root
      float vis = sm1((uS.x - aAux2.y) / 0.12);
      goal = mix(aAux.xyz, tgt, vis);
      brT *= vis * (1.0 + 1.1 * uS.w * aMeta.x) * (1.0 - uP.x);
      k = 90.0;
    } else if (role < 4.5) {              // database cylinder
      float vis = sm1((uS.y - aAux2.y) / 0.2);
      goal = mix(aAux.xyz, tgt, vis);
      brT *= vis * (1.0 + 0.9 * uS.w * aMeta.x) * (1.0 - uP.x);
      k = 90.0;
    } else if (role < 5.5) {              // light beams from the new light to the forest and the database
      vec3 a = uT.xyz;
      vec3 e = uArr[10 + int(aAux.x + 0.5)].xyz;
      float u = fract(aSeed.x + t * 1.25);
      float u0 = fract(aSeed.x + (t - dt) * 1.25);
      vec3 d = e - a;
      vec3 side = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
      goal = a + d * (u * uS.z) + side * (aSeed.y - 0.5) * 0.012 + vec3(0.0, 0.0, (aSeed.z - 0.5) * 0.012);
      if (u < u0) { p = goal; v = vec3(0.0); }
      gv = d * uS.z * 1.25;
      k = 400.0; z = 0.9;
      brT *= uS.w * step(0.002, uS.z) * (0.55 + 0.45 * (1.0 - u));
      tw = 0.6;
    } else if (role < 6.5) {              // fragments: pulled to the light, sent to the caller, folded into cards
      vec3 src = aAux.xyz;
      float dl = aAux.w;
      vec3 a = uT.xyz;
      vec3 c = uQ.xyz;
      vec3 j = aSeed.xyz - 0.5;
      float srcVis = aAux2.z < 0.5 ? sm1((uS.x - 0.35) / 0.3) : sm1((uS.y - 0.3) / 0.3);
      float tp = t - uG.x - dl;
      float ta = t - uG.y - dl * 0.3;
      float tf = t - uG.z - aMeta.w * 0.25;
      if (tp < 0.0) {
        goal = src;
        brT *= srcVis * 0.85;
        k = 90.0;
      } else if (tp < 0.6) {
        float e = eInOut(tp / 0.6);
        goal = bez(src, mix(src, a, 0.5) + vec3(0.0, 0.16, 0.12), a + j * 0.05, e);
        k = 260.0; z = 0.85;
        ct = mix(aTCol.xy, vec2(0.95, 0.0), e); cw = 0.45; tw = 1.0;
      } else if (ta < 0.0) {
        vec2 o = rot(j.xy, t * 3.0 + aSeed.w * 6.0) * 0.08;
        goal = a + vec3(o, j.z * 0.08);
        k = 140.0;
        ct = vec2(0.95, 0.0); cw = 0.5; tw = 0.8;
      } else if (ta < 0.55) {
        float e = eInOut(ta / 0.55);
        goal = bez(a + j * 0.08, mix(a, c, 0.5) + vec3(0.0, 0.22, 0.05), c + j * 0.07, e);
        k = 260.0; z = 0.85;
        ct = vec2(0.95, 0.0); cw = 0.55; tw = 1.0;
      } else if (tf < 0.0) {
        goal = c + j * 0.08;
        k = 150.0;
        ct = vec2(0.8, 0.0); cw = 0.45; tw = 0.6;
      } else {
        vec4 C = uArr[8 + int(aAux2.y + 0.5)];
        float e = sm1(tf / 0.5);
        goal = mix(c + j * 0.08, C.xyz + tgt * C.w, e);
        k = mix(150.0, 240.0, e); z = 0.85;
        brT *= 1.0 - uG.w;
        ct = vec2(0.92, 0.0); cw = mix(0.45, 0.3, e); tw = 1.0;
      }
    } else if (role < 7.5) {              // the caller's speech bubble
      float vis = sm1((uQ.w - aAux2.y) / 0.18);
      goal = mix(uQ.xyz, uArr[12].xyz + tgt, vis);
      brT *= vis;
      k = 120.0;
    } else {                              // dust
      goal = tgt + vec3(sin(uTime * 0.11 + aSeed.x * 6.28), cos(uTime * 0.09 + aSeed.y * 6.28), sin(uTime * 0.07 + aSeed.z * 6.28)) * 0.04;
      brT *= sm1(t / 1.2);
      k = 12.0;
    }
    acc += nz * (1.0 - form) * 0.8;
  } else if (uMode == 3) {                // 03 meaning: a tangled bubble becomes a checked card that passes one straight line
    k = 150.0; z = 0.8;
    if (role < 1.5) {                     // words (0) and the frame (1)
      float e = sm1((t - uP.x - aAux2.y * 0.55) / uP.y);
      vec3 j = aSeed.xyz - 0.5;
      vec3 wob = vec3(sin(t * 2.3 + aSeed.x * 31.0), cos(t * 1.9 + aSeed.y * 27.0), sin(t * 1.6 + aSeed.z * 19.0)) * 0.035;
      vec3 loc = mix(aAux.xyz + wob * uP.w, tgt, e);
      goal = uQ.xyz + loc * uQ.w;
      gv = uU.xyz;
      k = mix(45.0, 230.0, e); z = mix(0.55, 0.86, e);
      ct = mix(vec2(0.22 + 0.18 * aSeed.w, 0.65), aTCol.xy, e);
      cw = mix(0.05, aTCol.z, e);
      tw = mix(0.35, 0.1, e);
      brT *= mix(0.8, 1.0, e) * uT.y;
      acc += nz * (1.0 - e) * 0.3;
      float cross1 = exp(-pow((p.y - uS.x) / 0.016, 2.0)) * uG.x;
      flash = brT * 2.0 * cross1;
      wf = 0.7 * cross1;
    } else if (role < 2.5) {              // the check mark, drawn stroke by stroke
      float vis = sm1((uP.z - aAux2.y) / 0.06);
      goal = uQ.xyz + mix(aAux.xyz, tgt, vis) * uQ.w;
      gv = uU.xyz;
      k = 240.0; z = 0.86;
      brT *= vis * uT.y;
      tw = 0.1;
      float cross1 = exp(-pow((p.y - uS.x) / 0.016, 2.0)) * uG.x;
      flash = brT * 1.6 * cross1;
    } else if (role < 3.5) {              // the straight line: no noise, no wobble
      float vis = sm1((uS.w - aAux2.y) / 0.05);
      float hit = exp(-pow((tgt.x - uS.y) / 0.05, 2.0)) * uS.z;
      brT *= vis * (1.0 + 2.6 * hit);
      cw = max(cw, 0.75 * hit);
      k = 420.0; z = 0.96;
      nz = vec3(0.0);
    } else if (role < 4.5) {              // two later cards that pass the same point
      int f = int(aAux.x + 0.5);
      vec4 C = uArr[f];
      goal = C.xyz + tgt * C.w;
      gv = uArr[2 + f].yzw;
      k = 220.0; z = 0.86;
      brT *= uArr[2 + f].x;
      tw = 0.2;
      float cross1 = exp(-pow((p.y - uS.x) / 0.016, 2.0));
      flash = brT * 1.8 * cross1;
    } else if (role < 5.5) {              // what is left of the ring
      int s = int(aAux.x + 0.5);
      goal = uArr[4 + s].xyz + tgt;
      brT *= uT.x;
      k = 60.0;
    } else {
      goal = tgt + vec3(sin(uTime * 0.11 + aSeed.x * 6.28), cos(uTime * 0.09 + aSeed.y * 6.28), 0.0) * 0.05;
      brT *= uT.z;
      k = 10.0;
    }
  } else if (uMode == 4) {                // 04 memory: a 3D cloud of past messages; points light where they are and join up
    k = 60.0; z = 0.8;
    if (role < 0.5) {                     // past messages
      float form = sm1((t - aMeta.w * 0.9) / 1.0);
      k = mix(3.0, 46.0, form);
      brT *= mix(0.25, 1.0, form) * (0.8 + 0.2 * sin(uTime * (0.6 + aSeed.y * 1.4) + aSeed.x * 40.0));
      acc += nz * 0.5 * (1.0 - form);
    } else if (role < 1.5) {              // the points that light up, in order, without moving
      float ti = uP.z + aAux.x * uP.w;
      float tau = t - ti;
      float on = sm1(tau / 0.12);
      float form = sm1((t - 0.3) / 1.0);
      k = mix(3.0, 60.0, form);
      float core = aAux.y;
      brT = aTgt.w * mix(core * 0.32 * form, 1.0 + 2.4 * exp(-max(tau, 0.0) * 3.0), on);
      ct = mix(ct, vec2(0.95, 0.0), on);
      cw = mix(cw, core > 0.5 ? 0.85 : 0.35, on);
    } else if (role < 2.5) {              // thin lines between lit points, drawn from one to the next
      float dr = clamp((t - (uP.z + aAux.w * uP.w) + uS.x) / uS.x, 0.0, 1.0);
      goal = mix(aAux.xyz, tgt, aAux2.y);
      float vis = sm1((dr - aAux2.y) / 0.05);
      brT *= vis;
      k = 90.0;
      flash = brT * 1.6 * exp(-pow((dr - aAux2.y) / 0.04, 2.0)) * step(dr, 0.999);
    } else {                              // the to-do card turns into the question star and falls in
      float c = uP.x;
      vec3 cardPos = uT.xyz + aAux.xyz * uT.w;
      vec3 star = uQ.xyz + uCamR * tgt.x + uCamU * tgt.y + uCamF * tgt.z;
      goal = mix(cardPos, star, eInOut(c));
      gv = uU.xyz * c;
      k = 230.0; z = 0.85;
      brT *= mix(1.0, uQ.w, c);
      ct = mix(vec2(0.9, 0.0), aTCol.xy, c);
      cw = mix(0.35, aTCol.z, c);
      tw = 1.0;
    }
  } else if (uMode == 5) {                // 05 anytime: a 24-hour dial sweeps day to night to the weekend; one light stays on
    float form = sm1((t - aMeta.w * 0.8) / 0.9);
    k = 100.0 * max(form, 0.04); z = 0.8;
    if (role < 0.5) {                     // night sky
      k = mix(3.0, 30.0, form);
      brT *= mix(0.3, 1.0, form) * (0.7 + 0.3 * sin(uTime * (0.5 + aSeed.y * 1.7) + aSeed.x * 50.0));
      acc += nz * 0.4 * (1.0 - form);
    } else if (role < 1.5) {              // a person: goes dark when their day ends
      int s = int(aAux.x + 0.5);
      vec4 S = uArr[s];
      goal = S.xyz + tgt;
      float on = S.w;
      brT *= form * mix(0.11, 1.0, on);
      ct = mix(vec2(0.04, 0.55), aTCol.xy, on);
      cw = mix(0.0, cw, on);
    } else if (role < 2.5) {              // the agent's light
      goal = uArr[7].xyz + tgt;
      brT *= form * (1.0 + 1.6 * uT.z);
      cw = max(cw, 0.6 * uT.z);
    } else if (role < 3.5) {              // the faint circle
      brT *= form;
    } else if (role < 4.5) {              // dial band: bright only in weekday working hours
      float h = aAux.x;
      float ang = h / 24.0 * 6.2831853;
      goal = uQ.xyz + vec3(sin(ang), cos(ang), 0.0) * aAux.y * uQ.w + vec3(0.0, 0.0, tgt.z);
      float work = step(9.0, h) * (1.0 - step(19.0, h)) * (1.0 - uP.y);
      float da = mod(uP.x - ang + 62.831853, 6.2831853);
      brT *= uP.z * mix(0.16, 1.0, work);
      flash = brT * 2.2 * exp(-da * 5.0) * step(0.02, uT.w);
      ct = mix(vec2(0.06, 0.45), vec2(0.5, 0.05), work);
      cw = mix(0.0, 0.18, work);
      k = 120.0;
    } else if (role < 5.5) {              // hour ticks
      float ang = aAux.x / 24.0 * 6.2831853;
      goal = uQ.xyz + vec3(sin(ang), cos(ang), 0.0) * aAux.y * uQ.w;
      float da = mod(uP.x - ang + 62.831853, 6.2831853);
      brT *= uP.z;
      flash = brT * (1.0 + 2.5 * exp(-da * 3.0)) * step(0.02, uT.w) * step(da, 1.5);
      k = 140.0;
    } else if (role < 6.5) {              // the hand
      vec2 d = vec2(sin(uP.x), cos(uP.x));
      goal = uQ.xyz + vec3(d * aAux.x * 0.9 * uQ.w + vec2(d.y, -d.x) * aAux.y, aAux.z);
      gv = vec3(vec2(d.y, -d.x) * aAux.x * 0.9 * uQ.w * uG.x, 0.0);
      brT *= uP.z * 0.5;
      ct = vec2(0.55, 0.0); cw = 0.1; tw = 0.3;
      k = 320.0; z = 0.9;
    } else if (role < 7.5) {              // the question comet
      goal = uS.xyz + tgt;
      gv = uU.xyz;
      brT *= uS.w;
      k = 300.0; z = 0.85;
      tw = 1.0;
    } else if (role < 8.5) {              // the answer, straight back out
      float u = clamp(uT.x - aAux.w * 0.45, 0.0, 1.0);
      goal = mix(uArr[7].xyz, uG.yzw, u) + (aSeed.xyz - 0.5) * 0.02;
      brT *= uT.y * step(0.0005, u) * (1.0 - 0.5 * u);
      k = 320.0; z = 0.86;
      tw = 1.0;
    } else {
      goal = tgt;
      brT *= form;
      k = 10.0;
    }
  } else if (uMode == 6) {                // 06 one unbroken ribbon; the light catches questions; the ribbon winds into text
    k = 120.0; z = 0.8;
    if (role < 0.5) {
      float L = uQ.w;
      float sp = uQ.x;
      float u = fract(aAux.x + t * sp);
      float u0 = fract(aAux.x + (t - dt) * sp);
      float s = -L + 2.0 * L * u;
      vec3 c = ribbonAt(s, t);
      float twist = s * 2.2 + t * 1.3 + aAux.z * 2.1;
      vec2 o = vec2(cos(twist), sin(twist)) * aAux.y * uP.z;
      vec3 rp = c + (uG.x < 0.5 ? vec3(0.0, o.x, o.y) : vec3(o.x, 0.0, o.y));
      float taper = sm1((L - abs(s)) / 0.4);
      float e = sm1((t - uS.x - aAux2.y * uS.y) / uS.z);
      vec3 d = rp - tgt;
      goal = tgt + vec3(rot(d.xy, e * 2.6), d.z) * (1.0 - e);
      if (e < 0.001 && u < u0) { p = goal; v = vec3(0.0); }
      float form = sm1((t - aMeta.w * 0.5) / 0.7);
      k = mix(8.0, 160.0, max(form, e)); z = 0.82;
      brT *= mix(taper, 1.0, e) * max(form, 0.1);
      ct = mix(vec2(0.42 + 0.16 * aSeed.w, 0.05), aTCol.xy, e);
      cw = mix(0.08 + 0.25 * step(0.92, abs(aAux.y)), aTCol.z, e);
      tw = mix(0.7, aTCol.w, e);
      acc += nz * 0.6 * (1.0 - form);
    } else if (role < 1.5) {              // the agent's light
      goal = uT.xyz + tgt * uT.w;
      gv = uU.xyz;
      k = 200.0; z = 0.84;
      brT *= uU.w;
      tw = 1.0;
    } else if (role < 2.5) {              // incoming questions
      vec4 C = uArr[int(aAux.x + 0.5)];
      goal = C.xyz + tgt * (0.4 + 0.6 * C.w);
      gv = uArr[4 + int(aAux.x + 0.5)].xyz;
      k = 260.0; z = 0.85;
      brT *= C.w;
      tw = 1.0;
    } else {
      goal = tgt;
      brT *= 1.0 - 0.6 * sm1(t / 1.5);
      k = 10.0;
    }
  } else if (uMode == 7) {                // 07 review: the ribbon was one line of code; approved pieces stack into a checked rule list
    k = 140.0; z = 0.8;
    if (role < 1.5) {                     // code page (the line from scene 06 is role 0)
      float vis = role < 0.5 ? 1.0 : sm1((uP.x - aAux2.y) / 0.25);
      goal = vec3(uQ.xy, 0.0) + tgt * uQ.z;
      brT *= vis * (role < 0.5 ? uQ.w : mix(1.0, 0.55, uP.y));
      k = role < 0.5 ? mix(30.0, 200.0, sm1(t / 0.8)) : 120.0;
      if (role < 0.5) tw = mix(0.08, aTCol.w, sm1((t - 2.0) / 0.5));
      acc += nz * (1.0 - sm1(t / 0.8)) * 0.6;
    } else if (role < 2.5) {              // review comments and doc lines
      int f = int(aAux2.z + 0.5);
      vec4 C = uArr[f];
      vec4 S = uArr[8 + f];
      vec4 Rw = uArr[16 + f];
      vec3 rowLoc = aAux.yzw;
      float ap = sm1(S.x);
      goal = mix(C.xyz + tgt, Rw.xyz + rowLoc, ap) + vec3(0.0, -0.22 * S.y * S.y, 0.0);
      brT *= C.w * (1.0 - S.y) * (1.0 + 2.0 * S.z);
      ct = mix(aTCol.xy, vec2(0.93, 0.0), ap);
      ct = mix(ct, vec2(0.5, 0.0), S.z);
      cw = mix(aTCol.z, 0.32, ap) + 0.4 * S.z;
      tw = mix(aTCol.w, 0.4, ap);
      k = mix(120.0, 220.0, ap);
      acc += nz * S.y * 1.2;
    } else if (role < 3.5) {              // check marks on approved rows
      int f = int(aAux2.z + 0.5);
      float dr = sm1((uArr[8 + f].x - 0.6 - aAux2.y * 0.35) / 0.08);
      goal = uArr[16 + f].xyz + tgt;
      brT *= dr * uArr[f].w;
      k = 240.0;
    } else if (role < 4.5) {              // the person's approval light
      goal = uT.xyz + tgt;
      gv = uU.xyz;
      brT *= uT.w;
      k = 220.0; z = 0.85;
      tw = 1.0;
    } else {
      goal = tgt;
      brT *= 0.5;
      k = 10.0;
    }
  } else if (uMode == 8) {                // galaxy: a turning spiral disk behind the reading sections
    goal = galaxy(aSeed, uTime);
    k = uS.x; z = 0.9;
    nz *= 0.35;
    float rr = pow(aSeed.x, 1.35);
    float hue = fract(aSeed.w * 7.31 + aSeed.y * 3.17);
    ct = vec2(hue < 0.45 ? 0.08 : hue < 0.8 ? 0.5 : 0.95, sm1(rr * 1.6) * 0.8);
    cw = 0.55 * (1.0 - sm1(rr * 2.2));
    tw = 0.3;
    brT = (0.55 + 0.45 * aSeed.w) * (1.0 - 0.45 * rr) * uS.y;
    acc += nz;
  } else if (uMode == 9) {                // 08 a small city of nine boxes; one comet crosses a wall and is called back
    float form = sm1((t - aMeta.w * 1.1) / 0.8);
    k = mix(4.0, 150.0, form); z = 0.8;
    if (role < 2.5) {                     // edges, faces, base
      float wall = aAux.y * uP.y, wl = sm1(wall * 2.2);
      brT = role < 0.5 ? brT * max(form, 0.05) * (1.0 + 0.9 * wall) : max(brT * max(form, 0.05), 1.15 * wall);
      ct = mix(ct, vec2(0.0, 0.0), wl);
      cw = mix(cw, 0.0, wl);
      acc += nz * 0.5 * (1.0 - form);
    } else if (role < 3.5) {              // agent comets, each working inside its own box
      vec4 C = uArr[int(aAux.x + 0.5)];
      goal = C.xyz + tgt;
      gv = uArr[8 + int(aAux.x + 0.5)].xyz;
      brT *= C.w * form;
      k = 300.0; z = 0.86;
      tw = 1.0;
      float hit = aAux.x > 4.5 ? uP.x : 0.0;
      flash = brT * 1.5 * hit;
    } else if (role < 4.5) {              // the notice: two thin rings that grow from the crossing point to the comet
      float lag = aSeed.y < 0.62 ? 0.0 : 0.07;
      float rr2 = max(uQ.w - lag, 0.0);
      float a = aSeed.x * 6.2831853;
      goal = uQ.xyz + (uCamR * cos(a) + uCamU * sin(a)) * rr2 + aAux.xyz * 0.004;
      brT *= uP.z * (lag > 0.0 ? 0.55 : 1.0) * step(0.001, rr2);
      ct = vec2(0.2, 0.0); cw = 0.22;
      k = 900.0; z = 0.95;
      tw = 0.2;
    } else {
      brT *= form * 0.8;
      k = mix(3.0, 20.0, form);
    }
  } else if (uMode == 10) {               // 09 the ring again, one seat empty; the words open from it; a small signature
    float form = sm1((t - aMeta.w * 0.8) / 0.9);
    k = 110.0 * max(form, 0.04); z = 0.8;
    if (role < 1.5) {                     // people and the agent
      int s = int(aAux.x + 0.5);
      goal = uArr[s].xyz + tgt;
      brT *= form * uArr[s].w;
      acc += nz * 0.6 * (1.0 - form);
    } else if (role < 2.5) {              // the empty seat: a thin open circle
      goal = uT.xyz + tgt;
      brT *= uT.w * (0.85 + 0.15 * sin(uTime * 1.6 + aAux2.y * 6.28));
    } else if (role < 3.5) {              // petals that open from the empty seat, then gather into the signature
      float b = (t - uP.x - aMeta.w * 0.45) / 1.15;
      float g = (t - uP.y - aMeta.w * 0.55) / 0.9;
      vec3 seat = uT.xyz;
      vec3 sig = uQ.xyz + (uCamR * tgt.x + uCamU * tgt.y) * uQ.w;
      vec3 j = aSeed.xyz - 0.5;
      if (b < 0.0) {
        goal = seat + j * 0.03;
        brT = 0.0;
        k = 60.0;
      } else if (g < 0.0) {
        float e = eOut(min(b, 1.0));
        float a = aSeed.x * 6.2831853;
        vec3 top = uS.xyz + vec3(cos(a) * (0.2 + 0.7 * aSeed.y) * uS.w, (aSeed.z - 0.5) * 0.12 * uS.w, sin(a) * 0.15);
        vec3 mid = seat + vec3(cos(a) * 0.45 * uS.w, (0.05 + 0.08 * aSeed.w) * uS.w, sin(a) * 0.2);
        goal = bez(seat, mid, top, e);
        brT *= step(aSeed.z, 0.55) * sm1(b * 4.0) * mix(0.95, 0.2, sm1((b - 0.35) / 0.65));
        k = 90.0; z = 0.75;
        ct = vec2(mix(0.5, 0.9, aSeed.y), 0.1); cw = 0.35; tw = 0.22;
      } else {
        float e = sm1(g);
        goal = sig;
        k = mix(20.0, 230.0, e); z = 0.86;
        brT *= mix(0.6, 1.15, e);
        ct = vec2(0.5, 0.0); cw = mix(0.3, aTCol.z, e); tw = 0.3;
      }
    } else if (role < 4.5) {              // the faint circle
      brT *= form;
    } else {
      goal = tgt + vec3(sin(uTime * 0.11 + aSeed.x * 6.28), cos(uTime * 0.09 + aSeed.y * 6.28), 0.0) * 0.04;
      brT *= form;
      k = 10.0;
    }
  }

  if (sprung) {
    float ra = sm1(uPhaseT / uRamp);
    acc += spring(p, v, goal, gv, k * max(ra, 0.04), z) + nz * 0.6 * (1.0 - ra);
    v += acc * dt;
  }

  if (uPointer.w > 0.0) {
    vec4 clip = uVP * vec4(p, 1.0);
    if (clip.w > 0.05) {
      vec2 ndc = clip.xy / clip.w;
      vec2 d = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
      float r = length(d);
      if (r < uPointer.z) {
        float f = 1.0 - r / uPointer.z;
        vec3 push = uCamR * (d.x / max(r, 1e-4)) + uCamU * (d.y / max(r, 1e-4));
        v += push * f * f * uPointer.w * dt;
      }
    }
  }
  if (uVmax > 0.0) { float sp = length(v); if (sp > uVmax) v *= uVmax / sp; }
  p += v * dt;
  vec3 de = p - uEye;
  float dl = length(de);
  if (dl < 0.22) p = uEye + de / max(dl, 1e-4) * 0.22;
  if (brT < 0.002) br *= exp(-dt * 9.0);
  br += (brT - br) * (1.0 - exp(-dt * 5.0));
  br = max(br, flash);
  float cr = 1.0 - exp(-dt * uColRate);
  col.xy += (ct - col.xy) * cr;
  col.z += (cw - col.z) * cr;
  col.w += (tw - col.w) * cr;
  col.z = max(col.z, wf);
  vPos = vec4(p, br);
  vVel = vec4(v, 0.0);
  vCol = col;
}`;

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
uniform float uMaskA;
uniform int uRMode;
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
  float b = aPos.w * uBright * (1.0 + glow * 1.5 + min(speed * 0.06, 0.4));
  float ps = clamp(size, 1.0, uMaxPx);
  b *= clamp(pow(uPx / ps, 1.85), 0.004, 1.5);
  b *= smoothstep(0.18, 0.5, w / uFocus);
  vec2 mq = abs((clip.xy / w - uMask.xy) / uMask.zw);
  b *= 1.0 - uMaskA * (1.0 - smoothstep(0.78, 1.12, pow(pow(mq.x, 4.0) + pow(mq.y, 4.0), 0.25)));
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
uniform float uPx, uFocus, uBright, uTail, uGain, uMaxLen, uVar, uWhite, uLenK, uShift;
uniform vec2 uView;
uniform vec4 uMask;
uniform float uMaskA;
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
  float b = aPos.w * uBright * uGain * (1.0 - 0.55 * clamp(aCol.y, 0.0, 1.0)) * (1.0 - tailEnd) * min(1.0, smoothstep(0.2, 1.4, speed));
  b *= pow(clamp(28.0 / max(dl, 1.0), 0.0, 1.0), uLenK);
  b *= smoothstep(0.18, 0.5, ch.w / uFocus);
  vec2 mq = abs((ch.xy / max(ch.w, 0.06) - uMask.xy) / uMask.zw);
  b *= 1.0 - uMaskA * (1.0 - smoothstep(0.78, 1.12, pow(pow(mq.x, 4.0) + pow(mq.y, 4.0), 0.25)));
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

/* 장면마다 같은 번호의 입자를 같은 역할에 쓴다. 그래야 앞 장면의 끝 모양이 다음 장면의 시작 모양이 된다.
   에이전트 빛 → 사람 여섯 → 말풍선·할 일 카드·질문 별 → 띠·코드 한 줄 → 나머지 */
const PB = Math.round(N * 0.032);
const I_AG = 0, I_PP = PB, I_CD = 7 * PB, N_CD = Math.round(N * 0.07);
const I_RB = I_CD + N_CD, N_RB = Math.round(N * 0.3);
const I_RS = I_RB + N_RB, N_RS = N - I_RS;

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
  const topPx = (hb.length ? Math.max(...hb) : 100) + 14;
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

/* ---------------------------------------------------- 02 · 동료 원 */
function g2() {
  const g = geo(), T = g.tall;
  const ring = T ? { c: [0, g.cy + 0.06, 0], r: 0.28, s: 0.05 } : { c: [0, g.cy - 0.04, 0], r: 0.32, s: 0.058 };
  const at = a => [ring.c[0] + Math.cos(a) * ring.r, ring.c[1] + Math.sin(a) * ring.r, 0];
  const seat7 = k => at(Math.PI / 2 + k * TAU / 7);          // seat 0 at the top is the agent's
  const seat6 = k => at(Math.PI / 2 + (k + 0.5) * TAU / 6);   // six people before the agent joins
  const caller = 5;                                            // person 5 sits at seat7(6), upper right
  const cp = seat7(caller + 1);
  const bubble = T ? { c: [cp[0] + 0.32, cp[1] + 0.22, 0.03], w: 0.5, h: 0.2 } : { c: [cp[0] + 0.28, cp[1] + 0.3, 0.03], w: 0.46, h: 0.2 };
  const forest = T ? { x0: -0.86, x1: 0.86, y0: g.y1 - 0.56, y1: g.y1 - 0.04, rowH: 0.066 } : { x0: -g.w / 2 + 0.02, x1: -0.6, y0: g.cy - 0.5, y1: g.cy + 0.5, rowH: 0.08 };
  const db = T ? { c: [0, g.y0 + 0.27, 0], R: 0.32, H: 0.3 } : { c: [1.2, g.cy - 0.06, 0], R: 0.2, H: 0.46 };
  const cs = T ? 0.9 : 1;
  const cards = T ? [[0.56, cp[1] - 0.2, 0.08], [0.56, cp[1] - 0.44, 0.08]] : [[0.66, cp[1] + 0.03, 0.08], [0.66, cp[1] - 0.21, 0.08]];
  // where the beams reach: the near side of the forest and the top of the database
  const fA = T ? [0, forest.y0 + 0.02, 0] : [forest.x1 - 0.04, (forest.y0 + forest.y1) / 2, 0];
  const dA = T ? [0, db.c[1] + db.H / 2 + 0.02, 0] : [db.c[0] - db.R * 0.6, db.c[1] + db.H / 2, 0];
  return { T, ring, seat7, seat6, caller, cp, bubble, forest, db, cs, cards, fA, dA };
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
function ringShape(rand) {
  const G = g2(), T = G.T, sh = newShape('ring');
  blob(sh, I_AG, PB, rand, G.ring.s, 0.95, 0.6, 1.05, 1);
  for (let p = 0; p < 6; p++) blob(sh, I_PP + p * PB, PB, rand, G.ring.s, 0.5, 0.12, 0.95, 0, i => { sh.aux[i * 4] = p; });

  // the caller's speech bubble, grown out of the caller
  {
    const B = G.bubble, w = B.w, h = B.h, r = 0.05;
    const tip = [(G.cp[0] - B.c[0]) * 0.66, (G.cp[1] - B.c[1]) * 0.66];
    clearBox(); worldSpace();
    const x = -w / 2, y = -h / 2;
    sx.beginPath();
    sx.moveTo(x + r, y);
    sx.lineTo(x + w * 0.16, y); sx.lineTo(tip[0], tip[1]); sx.lineTo(x + w * 0.3, y);
    sx.lineTo(x + w - r, y); sx.arcTo(x + w, y, x + w, y + r, r);
    sx.lineTo(x + w, y + h - r); sx.arcTo(x + w, y + h, x + w - r, y + h, r);
    sx.lineTo(x + r, y + h); sx.arcTo(x, y + h, x, y + h - r, r);
    sx.lineTo(x, y + r); sx.arcTo(x, y, x + r, y, r);
    sx.closePath();
    sx.fillStyle = 'rgba(255,255,255,0.1)'; sx.fill();
    sx.strokeStyle = '#fff'; sx.lineWidth = 0.008; sx.stroke();
    sx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(x + w * 0.1, h * 0.12, w * 0.74, h * 0.13, h * 0.065); sx.fill();
    roundRect(x + w * 0.1, -h * 0.2, w * 0.48, h * 0.13, h * 0.065); sx.fill();
    sx.setTransform(1, 0, 0, 1, 0, 0);
    const dmax = Math.hypot(w, h) + Math.hypot(tip[0], tip[1]);
    take(N_CD, rand, (k, px, py, a, e) => {
      const i = I_CD + k;
      put(sh, i, px, py, (rand() - 0.5) * 0.01, 0.62 + 0.3 * a, 0.62, 0, e ? 0.42 : 0.16, 0.3);
      set4(sh.aux2, i, 7, Math.hypot(px - tip[0], py - tip[1]) / dmax, 0, 0);
      sh.meta[i * 4 + 3] = rand();
    });
  }

  // code forest (file trees) and the database, in the ribbon range
  const nFo = Math.round(N_RB * 0.6), nDb = N_RB - nFo;
  const F = G.forest, nt = 3, tw = (F.x1 - F.x0) / nt;
  const leaves = [];
  let i = I_RB;
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

  // the rest: the faint circle, beams, fragments that become the answer and the cards, dust
  const nCir = Math.round(N * 0.025), nBeam = Math.round(N * 0.06), nFrag = Math.round(N * 0.08);
  i = I_RS;
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
  dust(sh, i, N - i, rand, 8);

  sh.G = G;
  const F2 = G.forest;
  sh.anchors.code = T ? [0, F2.y1 + 0.02, 0] : [(F2.x0 + F2.x1) / 2, F2.y1 + 0.06, 0];
  sh.anchors.db = T ? [G.db.c[0] + G.db.R + 0.04, G.db.c[1], 0] : [G.db.c[0], G.db.c[1] + G.db.H / 2 + 0.12, 0];
  sh.labelAlign = T ? { db: 'left', ticket: 'left', pr: 'left' } : { ticket: 'left', pr: 'left' };
  sh.area = T ? 0.5 : 0.55;
  return sh;
}

/* ---------------------------------------------------- 03 · 말뜻 */
function g3() {
  const g = geo(), T = g.tall, G2 = g2();
  const card = T ? { w: 0.84, h: 0.4 } : { w: 0.62, h: 0.3 };
  const P1 = T ? [0, g.y1 - 0.42, 0.02] : [0, g.cy + 0.36, 0.02];
  const lineY = T ? g.cy + 0.12 : g.cy - 0.03;
  const P2 = T ? [0, g.y0 + 0.36, 0.02] : [0, g.y0 + 0.24, 0.02];
  return { T, card, P1, P2, lineY, start: G2.bubble.c, lx0: -halfW - 0.4, lx1: halfW + 0.4, G2 };
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
    sx.lineWidth = 0.008; roundRect(-w / 2, -h / 2, w, h, Math.min(0.04, h * 0.14)); sx.stroke();
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
function meaningShape(rand) {
  const G = g3(), T = G.T, sh = newShape('meaning');
  const { w, h } = G.card;
  // the ring stays where it was and dims: people and the agent keep their blobs
  blob(sh, I_AG, PB, rand, G.G2.ring.s, 0.95, 0.6, 1.0, 5, i => { sh.aux[i * 4] = 6; });
  for (let p = 0; p < 6; p++) blob(sh, I_PP + p * PB, PB, rand, G.G2.ring.s, 0.5, 0.12, 0.95, 5, i => { sh.aux[i * 4] = p; });

  // the hero card: frame, words and check, all from the bubble's particles
  const nFrame = Math.round(N_CD * 0.3), nCheck = Math.round(N_CD * 0.1), nWords = N_CD - nFrame - nCheck;
  const tang = scribbles(nFrame + nWords, rand, T ? 0.26 : 0.21);
  let i = I_CD, ti = 0;
  clearBox(); drawTodo(w, h, 'words');
  take(nWords, rand, (k, px, py, a) => {
    const s = tang[ti++];
    put(sh, i, px, py, (rand() - 0.5) * 0.01, 0.62 + 0.3 * a, 0.8, 0, 0.2, 0.3);
    set4(sh.aux, i, s[0], s[1], s[2], 0);
    set4(sh.aux2, i, 0, (px + w / 2) / w, 0, 0);
    sh.meta[i * 4 + 3] = rand();
    i++;
  });
  clearBox(); drawTodo(w, h, 'frame');
  take(nFrame, rand, (k, px, py, a) => {
    const s = tang[ti++];
    put(sh, i, px, py, (rand() - 0.5) * 0.01, 0.72 + 0.25 * a, 0.92, 0, 0.42, 0.3);
    set4(sh.aux, i, s[0], s[1], s[2], 0);
    set4(sh.aux2, i, 1, (px + w / 2) / w, 0, 0);
    sh.meta[i * 4 + 3] = rand();
    i++;
  });
  const P = cardParts(w, h);
  alongPoly(P.check, nCheck, rand, 0.007).forEach(q => {
    put(sh, i, q[0], q[1], 0.01, 1.0, 0.98, 0, 0.75, 0.3);
    set4(sh.aux, i, P.check[0][0], P.check[0][1], 0.01, 0);
    set4(sh.aux2, i, 2, q[2], 0, 0);
    i++;
  });

  // the straight line: no noise and no wobble; it draws outward from the point every card crosses
  const nLine = Math.round(N_RB * 0.16), nEcho = Math.round(N_RB * 0.16);
  i = I_RB;
  for (let k = 0; k < nLine; k++, i++) {
    const x = G.lx0 + (G.lx1 - G.lx0) * (k + rand()) / nLine;
    const spot = Math.exp(-x * x / 0.0018);
    put(sh, i, x, G.lineY + (rand() - 0.5) * 0.004, 0, 0.42 + 0.7 * spot, 0.9, 0, 0.45 + 0.4 * spot, 0.1);
    set4(sh.aux2, i, 3, Math.abs(x) / G.lx1, 0, 0);
  }
  // two later cards that cross at the same point
  const es = 0.62;
  for (let f = 0; f < 2; f++) {
    const n = f === 0 ? Math.round(nEcho / 2) : nEcho - Math.round(nEcho / 2);
    clearBox(); drawTodo(w * es, h * es, 'frame'); drawTodo(w * es, h * es, 'words');
    worldSpace(); sx.strokeStyle = '#fff'; sx.lineWidth = 0.007;
    const Pe = cardParts(w * es, h * es);
    sx.beginPath(); sx.moveTo(Pe.check[0][0], Pe.check[0][1]); sx.lineTo(Pe.check[1][0], Pe.check[1][1]); sx.lineTo(Pe.check[2][0], Pe.check[2][1]); sx.stroke();
    sx.setTransform(1, 0, 0, 1, 0, 0);
    take(n, rand, (k, px, py, a, e) => {
      put(sh, i, px, py, 0, 0.55 + 0.3 * a, 0.88, 0, e ? 0.4 : 0.15, 0.4);
      set4(sh.aux, i, f, 0, 0, 0);
      sh.aux2[i * 4] = 4;
      i++;
    });
  }
  dust(sh, i, I_RS - i, rand, 6, 0.8);
  dust(sh, I_RS, N - I_RS, rand, 6, 0.8);
  sh.G = G;
  sh.area = T ? 0.42 : 0.46;
  return sh;
}

/* ---------------------------------------------------- 04 · 기억 */
function g4() {
  const g = geo(), T = g.tall;
  const c = [0.05, g.cy, -1.35];
  const star = [0.04, g.cy + 0.04, -1.2];
  return { T, c, star, R: T ? [1.5, 2.6, 2.3] : [2.7, 1.5, 2.3] };
}
function memoryShape(rand) {
  const G = g4(), T = G.T, G3 = g3(), sh = newShape('memory');
  const cardSh = getShape('meaning');
  // the to-do card turns into the question star; aux keeps each particle's spot on the card
  const nStar = N_CD;
  for (let k = 0; k < nStar; k++) {
    const i = I_CD + k, o = i * 4;
    const core = k < nStar * 0.62;
    let lx, ly;
    if (core) { const r = 0.012 * Math.sqrt(-2 * Math.log(1 - 0.995 * rand())), a = rand() * TAU; lx = Math.cos(a) * r; ly = Math.sin(a) * r; }
    else { const arm = (rand() * 4) | 0, d = Math.pow(rand(), 1.6) * 0.17, a = arm * Math.PI / 2 + Math.PI / 4 * 0; lx = Math.cos(a) * d + (rand() - 0.5) * 0.004; ly = Math.sin(a) * d + (rand() - 0.5) * 0.004; }
    put(sh, i, lx, ly, 0, core ? 1.1 : 0.7, 0.97, 0, core ? 0.9 : 0.5, 0.6);
    set4(sh.aux, i, cardSh.tgt[o], cardSh.tgt[o + 1], cardSh.tgt[o + 2], 0);
    sh.aux2[o] = 3;
  }
  // past conversations: thousands of points with depth, in clumps and loose threads
  const clumps = [];
  for (let c = 0; c < 9; c++) clumps.push([G.c[0] + (rand() - 0.5) * G.R[0] * 1.4, G.c[1] + (rand() - 0.5) * G.R[1] * 1.3, G.c[2] + (rand() - 0.5) * G.R[2] * 1.4, 0.18 + rand() * 0.4]);
  // the points that light up, in order of distance from the star; they are ordinary points until then
  const nNode = 18, perNode = Math.round(N * 0.0011), nLine = Math.round(N * 0.07);
  const nodes = [];
  const spreadX = T ? 0.75 : 1.15, spreadY = T ? 1.0 : 0.6;
  for (let k = 0; k < nNode; k++) {
    const a = k * 2.39996 + (rand() - 0.5) * 0.5, rr = 0.2 + 0.85 * Math.sqrt((k + 0.6) / nNode);
    nodes.push([G.star[0] + Math.cos(a) * rr * spreadX, G.star[1] + Math.sin(a) * rr * spreadY, G.star[2] + (rand() - 0.5) * 0.7]);
  }
  nodes.sort((p, q) => Math.hypot(p[0] - G.star[0], (p[1] - G.star[1]) * 1.2, p[2] - G.star[2]) - Math.hypot(q[0] - G.star[0], (q[1] - G.star[1]) * 1.2, q[2] - G.star[2]));
  const edges = nodes.map((p, k) => {
    let best = G.star, bd = Math.hypot(p[0] - G.star[0], p[1] - G.star[1], p[2] - G.star[2]) * (k < 3 ? 0.5 : 1.15);
    for (let j = 0; j < k; j++) { const q = nodes[j], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = q; } }
    return [best, p, k];
  });
  let i = 0;
  const others = [];
  for (let k = 0; k < N; k++) if (k < I_CD || k >= I_CD + N_CD) others.push(k);
  let oi = 0;
  for (let k = 0; k < nNode; k++) {
    for (let m = 0; m < perNode; m++) {
      i = others[oi++];
      const p = nodes[k];
      put(sh, i, p[0] + gauss(rand) * 0.006, p[1] + gauss(rand) * 0.006, p[2] + gauss(rand) * 0.006, 0.9, 0.55 + 0.2 * rand(), 0, 0.2, 0.2);
      set4(sh.aux, i, k / (nNode - 1), m < perNode * 0.5 ? 1 : 0, 0, 0);
      sh.aux2[i * 4] = 1;
      sh.meta[i * 4 + 3] = rand();
    }
  }
  sh.lineStart = [];
  const segLen = edges.map(e => Math.hypot(e[0][0] - e[1][0], e[0][1] - e[1][1], e[0][2] - e[1][2]));
  const totLen = segLen.reduce((a, b) => a + b, 0);
  edges.forEach((e, k) => {
    const n = Math.max(20, Math.round(nLine * segLen[k] / totLen));
    for (let m = 0; m < n && oi < others.length; m++) {
      i = others[oi++];
      const u = (m + rand()) / n;
      put(sh, i, e[1][0], e[1][1], e[1][2], 0.32, 0.8, 0, 0.3, 0.2);
      set4(sh.aux, i, e[0][0], e[0][1], e[0][2], k / (nNode - 1));
      set4(sh.aux2, i, 2, u, 0, 0);
    }
  });
  while (oi < others.length) {
    i = others[oi++];
    let x, y, z;
    const r = rand();
    if (r < 0.55) { const c = clumps[(rand() * clumps.length) | 0]; x = c[0] + gauss(rand) * c[3]; y = c[1] + gauss(rand) * c[3] * 0.7; z = c[2] + gauss(rand) * c[3]; }
    else { const d = sdir(rand), rr = Math.cbrt(rand()); x = G.c[0] + d[0] * rr * G.R[0]; y = G.c[1] + d[1] * rr * G.R[1]; z = G.c[2] + d[2] * rr * G.R[2]; }
    const warm = rand();
    put(sh, i, x, y, z, 0.3 + 0.35 * rand(), warm < 0.5 ? 0.12 + 0.2 * rand() : 0.4 + 0.3 * rand(), 0.1 + 0.3 * rand(), 0.05 * rand(), 0.15);
    sh.aux2[i * 4] = 0;
    sh.meta[i * 4 + 3] = rand();
  }
  sh.G = G;
  sh.card = { c: G3.P2 };
  sh.nodes = nodes;
  sh.anchors.past = nodes[nNode - 1];
  // the label goes beside whichever lit point lands in the free part of the screen
  sh.anchorPick = { past: nodes };
  sh.labelAlign = { past: 'left' };
  sh.labelOff = { past: [12, -12] };
  sh.area = T ? 0.9 : 1.1;
  return sh;
}

/* ---------------------------------------------------- 05 · 언제든 */
function g5() {
  const g = geo(), T = g.tall;
  const ring = T ? { c: [0, g.cy + 0.04, 0], r: 0.4, s: 0.055 } : { c: [0, g.cy - 0.02, 0], r: 0.3, s: 0.055 };
  const dialR = T ? 0.84 : 0.62;
  const seat7 = k => { const a = Math.PI / 2 + k * TAU / 7; return [ring.c[0] + Math.cos(a) * ring.r, ring.c[1] + Math.sin(a) * ring.r, 0]; };
  const from = T ? [-1.45, g.cy + 0.6, 0.4] : [-2.1, g.cy + 0.5, 0.4];
  return { T, ring, dialR, dialC: [ring.c[0], ring.c[1], -0.28], seat7, from };
}
function anytimeShape(rand) {
  const G = g5(), T = G.T, sh = newShape('anytime');
  blob(sh, I_AG, PB, rand, G.ring.s, 0.95, 0.6, 1.05, 2);
  for (let p = 0; p < 6; p++) blob(sh, I_PP + p * PB, PB, rand, G.ring.s, 0.5, 0.12, 0.95, 1, i => { sh.aux[i * 4] = p; });
  let i = I_RS;
  const nCir = Math.round(N * 0.02), nBand = Math.round(N * 0.12), nTick = Math.round(N * 0.024), nHand = Math.round(N * 0.03);
  const nComet = Math.round(N * 0.012), nAns = Math.round(N * 0.035);
  circleLine(sh, i, nCir, rand, G.ring.c, G.ring.r, 3, 0.12); i += nCir;
  for (let k = 0; k < nBand; k++, i++) {
    const h = (k + rand()) / nBand * 24;
    put(sh, i, 0, 0, (rand() - 0.5) * 0.04, 0.5 + 0.3 * rand(), 0.5, 0.05, 0.1, 0.4);
    set4(sh.aux, i, h, G.dialR + (rand() - 0.5) * 0.035 + gauss(rand) * 0.006, 0, 0);
    sh.aux2[i * 4] = 4;
  }
  for (let k = 0; k < nTick; k++, i++) {
    const hr = k % 24, big = hr % 6 === 0;
    put(sh, i, 0, 0, 0, big ? 0.8 : 0.5, 0.6, 0, big ? 0.4 : 0.15, 0.2);
    set4(sh.aux, i, hr, G.dialR + 0.05 + rand() * (big ? 0.07 : 0.035), 0, 0);
    sh.aux2[i * 4] = 5;
  }
  for (let k = 0; k < nHand; k++, i++) {
    const u = Math.pow(rand(), 0.8);
    put(sh, i, 0, 0, 0, 0.7 + 0.3 * u, 0.8, 0, 0.3 + 0.4 * u, 0.6);
    set4(sh.aux, i, u, (rand() - 0.5) * 0.006 * (1.3 - u), (rand() - 0.5) * 0.01, 0);
    sh.aux2[i * 4] = 6;
  }
  for (let k = 0; k < nComet; k++, i++) {
    const r = 0.016 * Math.sqrt(-2 * Math.log(1 - 0.99 * rand())), d = sdir(rand);
    put(sh, i, d[0] * r, d[1] * r, d[2] * r, 1.0, 0.55, 0, 0.5, 1.0);
    sh.aux2[i * 4] = 7;
  }
  for (let k = 0; k < nAns; k++, i++) {
    put(sh, i, 0, 0, 0, 0.75, 0.95, 0, 0.55, 0.9);
    set4(sh.aux, i, 0, 0, 0, rand());
    sh.aux2[i * 4] = 8;
  }
  // the night sky the nebula turns into
  const g = geo();
  for (; i < N; i++) {
    const z = -0.8 - rand() * 3.0, sc = 1 + (-z) * 0.37;
    put(sh, i, (rand() - 0.5) * 2.3 * halfW * sc, g.cy + (rand() - 0.5) * 2.1 * halfH * sc, z, 0.14 + 0.32 * Math.pow(rand(), 2), rand() < 0.6 ? 0.2 + 0.2 * rand() : 0.7 + 0.3 * rand(), 0.2, 0.08 * rand(), 0.1);
    sh.aux2[i * 4] = 0;
    sh.meta[i * 4 + 3] = rand();
  }
  for (let k = I_CD; k < I_RS; k++) {
    const z = -0.8 - rand() * 3.0, sc = 1 + (-z) * 0.37;
    put(sh, k, (rand() - 0.5) * 2.3 * halfW * sc, g.cy + (rand() - 0.5) * 2.1 * halfH * sc, z, 0.14 + 0.32 * Math.pow(rand(), 2), rand() < 0.6 ? 0.2 + 0.2 * rand() : 0.7 + 0.3 * rand(), 0.2, 0.08 * rand(), 0.1);
    sh.aux2[k * 4] = 0;
    sh.meta[k * 4 + 3] = rand();
  }
  sh.G = G;
  sh.area = T ? 0.42 : 0.5;
  return sh;
}

/* ---------------------------------------------------- 06 · 하루 30분 */
function g6() {
  const g = geo(), T = g.tall;
  return {
    T, y: T ? g.cy - 0.22 : g.cy - 0.17, L: halfW + 0.35, amp: T ? 0.1 : 0.085, tube: T ? 0.04 : 0.042,
    text: T ? { cy: g.cy + 0.12, maxW: 1.64, lineH: 0.6 } : { cy: g.cy + 0.08, maxW: 1.8, lineH: 0.64 },
    post: T ? [0, g.cy + 0.48, 0.06] : [-0.05, g.cy + 0.3, 0.06],
    side: T ? [0.66, g.cy + 0.62, 0.06] : [1.12, g.cy + 0.5, 0.06]
  };
}
function ribbonShape(rand) {
  const G = g6(), T = G.T, sh = newShape('ribbon');
  blob(sh, I_AG, PB, rand, T ? 0.05 : 0.055, 0.95, 0.6, 1.05, 1);
  clearBox();
  drawText(fxWord('fx.30') || '30분', { cy: G.text.cy, maxW: G.text.maxW, lineH: G.text.lineH });
  const S = sample(N_RB, rand);
  const b = bounds(S.x, S.y, N_RB);
  for (let k = 0; k < N_RB; k++) {
    const i = I_RB + k, e = S.edge[k];
    put(sh, i, S.x[k], S.y[k], (rand() - 0.5) * 0.03, (0.62 + 0.38 * S.a[k]) * (e ? 1.15 : 1), 0.56, 0, e ? 0.45 : 0.12, 0.5);
    // flow phase, offset across the tube, twist; the winding runs along the ribbon
    const ph = (k + rand()) / N_RB;
    const off = Math.sqrt(rand()) * (rand() < 0.5 ? -1 : 1);
    set4(sh.aux, i, ph, off, rand() * TAU, 0);
    set4(sh.aux2, i, 0, 0.15 * ((S.x[k] - b.x0) / (b.x1 - b.x0)) + 0.85 * ((ph + 0.35) % 1), 0, 0);
    sh.meta[i * 4] = e;
    sh.meta[i * 4 + 3] = rand();
  }
  // incoming questions, three of them
  const nQ = Math.round(N_CD * 0.14);
  let i = I_CD;
  for (let q = 0; q < 3; q++) {
    for (let m = 0; m < nQ; m++, i++) {
      const r = 0.016 * Math.sqrt(-2 * Math.log(1 - 0.99 * rand())), d = sdir(rand);
      put(sh, i, d[0] * r, d[1] * r, d[2] * r, 1.0, 0.55, 0, 0.45, 1.0);
      set4(sh.aux, i, q, 0, 0, 0);
      sh.aux2[i * 4] = 2;
    }
  }
  dust(sh, i, I_RB - i, rand, 3, 0.7);
  dust(sh, I_PP, I_CD - I_PP, rand, 3, 0.7);
  dust(sh, I_RS, N - I_RS, rand, 3, 0.7);
  sh.G = G;
  sh.text = b;
  sh.area = S.area * 1.15 + 0.12;
  return sh;
}

/* ---------------------------------------------------- 07 · 리뷰 */
function g7() {
  const g = geo(), T = g.tall;
  if (T) {
    const top = g.y1 - 0.04;
    return {
      T, page: { x0: -0.84, x1: 0.84, y1: top, pitch: 0.075, n: 7, hi: 3 },
      frag: [[-0.42, g.cy + 0.5], [0.42, g.cy + 0.42], [-0.42, g.cy + 0.22], [0.42, g.cy + 0.14], [-0.42, g.cy - 0.06], [0.42, g.cy - 0.14]],
      fw: 0.62, fh: 0.12,
      list: { x: 0, y0: g.y0 + 0.12, pitch: 0.14, w: 1.2 }, from: [1.4, g.cy + 0.4, 0]
    };
  }
  return {
    T, page: { x0: -g.w / 2 + 0.04, x1: -0.42, y1: g.cy + 0.5, pitch: 0.11, n: 9, hi: 4 },
    frag: [[0.08, g.cy + 0.44], [0.46, g.cy + 0.27], [0.06, g.cy + 0.1], [0.46, g.cy - 0.07], [0.08, g.cy - 0.24], [0.46, g.cy - 0.41]],
    fw: 0.34, fh: 0.11,
    list: { x: 0.74, y0: g.cy - 0.3, pitch: 0.16, w: 0.56 }, from: [2.3, g.cy + 0.1, 0]
  };
}
const APPROVED = [1, 2, 4];
function reviewShape(rand) {
  const G = g7(), T = G.T, sh = newShape('review');
  const pg = G.page;
  // code tokens on each line of the page
  const lines = [];
  for (let j = 0; j < pg.n; j++) {
    const y = pg.y1 - (j + 0.5) * pg.pitch, ind = [0, 1, 1, 2, 2, 1, 2, 1, 0][j % 9] * 0.05;
    const toks = [];
    let x = pg.x0 + ind;
    const maxX = pg.x1 - (j === pg.hi ? 0 : rand() * 0.3);
    while (x < maxX - 0.04) { const tw = Math.min(maxX - x, 0.04 + rand() * 0.16); toks.push([x, tw]); x += tw + 0.018; }
    lines.push({ y, toks });
  }
  const drawLine = L => { const bh = T ? 0.02 : 0.024; L.toks.forEach(t => { roundRect(t[0], L.y - bh / 2, t[1], bh, bh / 2); sx.fill(); }); };
  // the ribbon becomes the highlighted line
  clearBox(); worldSpace(); sx.fillStyle = '#fff'; drawLine(lines[pg.hi]); sx.setTransform(1, 0, 0, 1, 0, 0);
  take(N_RB, rand, (k, px, py, a) => {
    const i = I_RB + k;
    put(sh, i, px, py, (rand() - 0.5) * 0.01, 0.4 + 0.2 * a, 0.62, 0, 0.3, 0.3);
    sh.aux2[i * 4] = 0;
  });
  // the rest of the page, which appears around it
  const nPage = Math.round(N * 0.1);
  let i = I_RS;
  clearBox(); worldSpace(); sx.fillStyle = '#fff'; lines.forEach((L, j) => { if (j !== pg.hi) drawLine(L); }); sx.setTransform(1, 0, 0, 1, 0, 0);
  take(nPage, rand, (k, px, py, a) => {
    put(sh, i, px, py, (rand() - 0.5) * 0.01, 0.55 + 0.25 * a, 0.35, 0, 0.06, 0.2);
    set4(sh.aux2, i, 1, Math.abs(py - lines[pg.hi].y) / (pg.pitch * pg.n * 0.5), 0, 0);
    i++;
  });
  // review fragments: doc lines (cream) and comments (clay); each has a row shape it takes when approved
  const nFr = Math.round(N * 0.024), rowW = G.list.w, rowH = 0.07;
  const drawFrag = f => {
    const doc = f % 2 === 0, w = G.fw, h = G.fh;
    worldSpace();
    sx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(-w / 2, -h / 2, w, h, 0.02); sx.fill();
    sx.strokeStyle = '#fff'; sx.lineWidth = 0.006; roundRect(-w / 2, -h / 2, w, h, 0.02); sx.stroke();
    sx.fillStyle = 'rgba(255,255,255,0.75)';
    if (doc) {
      roundRect(-w / 2 + 0.03, h * 0.12, w * 0.7, h * 0.14, h * 0.07); sx.fill();
      roundRect(-w / 2 + 0.03, -h * 0.22, w * 0.5, h * 0.14, h * 0.07); sx.fill();
    } else {
      sx.beginPath(); sx.arc(-w / 2 + h * 0.36, 0, h * 0.18, 0, TAU); sx.fill();
      roundRect(-w / 2 + h * 0.7, h * 0.08, w * 0.58, h * 0.14, h * 0.07); sx.fill();
      roundRect(-w / 2 + h * 0.7, -h * 0.22, w * 0.4, h * 0.14, h * 0.07); sx.fill();
    }
    sx.setTransform(1, 0, 0, 1, 0, 0);
  };
  const drawRow = () => {
    worldSpace();
    sx.fillStyle = '#fff';
    roundRect(-rowW / 2 + 0.085, -rowH * 0.12, rowW * 0.66, rowH * 0.24, rowH * 0.12); sx.fill();
    sx.strokeStyle = '#fff'; sx.lineWidth = 0.006;
    sx.strokeRect(-rowW / 2, -rowH * 0.32, rowH * 0.64, rowH * 0.64);
    sx.setTransform(1, 0, 0, 1, 0, 0);
  };
  clearBox(); drawRow();
  const rowS = sample(nFr, rand);
  for (let f = 0; f < 6; f++) {
    clearBox(); drawFrag(f);
    const fs = sample(nFr, rand);
    for (let k = 0; k < nFr; k++, i++) {
      const doc = f % 2 === 0;
      put(sh, i, fs.x[k], fs.y[k], (rand() - 0.5) * 0.01, 0.6 + 0.3 * fs.a[k], doc ? 0.78 : 0.2, 0, fs.edge[k] ? (doc ? 0.3 : 0.12) : 0.05, 0.45);
      set4(sh.aux, i, 0, rowS.x[k], rowS.y[k], 0);
      set4(sh.aux2, i, 2, 0, f, 0);
    }
  }
  // check marks drawn on the approved rows
  const nCk = Math.round(N * 0.004), cbx = -rowW / 2 + rowH * 0.32;
  APPROVED.forEach(f => {
    alongPoly([[cbx - rowH * 0.2, 0], [cbx - rowH * 0.04, -rowH * 0.18], [cbx + rowH * 0.24, rowH * 0.22]], nCk, rand, 0.005).forEach(q => {
      put(sh, i, q[0], q[1], 0.01, 1.0, 0.98, 0, 0.75, 0.3);
      set4(sh.aux2, i, 3, q[2], f, 0);
      i++;
    });
  });
  // the person's approval: one amber light, from the people range
  blob(sh, I_PP, PB, rand, T ? 0.04 : 0.045, 0.5, 0.3, 1.1, 4);
  dust(sh, I_PP + PB, I_RB - I_PP - PB, rand, 5, 0.6);
  dust(sh, I_AG, PB, rand, 5, 0.6);
  dust(sh, i, N - i, rand, 5, 0.6);
  sh.G = G;
  sh.lines = lines;
  sh.rowS = { w: rowW, h: rowH };
  const L = G.list;
  sh.anchors.rules = [L.x - rowW / 2, L.y0 + 2 * L.pitch + rowH * 0.5 + (T ? 0.07 : 0.06), 0];
  sh.anchors.review = T ? [-0.84, G.frag[0][1] + 0.12, 0] : [G.frag[0][0] - G.fw / 2, G.frag[0][1] + 0.12, 0];
  sh.labelAlign = { rules: 'left', review: 'left' };
  sh.area = T ? 0.44 : 0.5;
  return sh;
}

/* ---------------------------------------------------- 08 · 아홉 칸 */
function g8() {
  const g = geo(), T = g.tall;
  const s = T ? 0.31 : 0.3, gap = T ? 0.085 : 0.08;
  const H = [0.34, 0.52, 0.3, 0.44, 0.66, 0.4, 0.28, 0.48, 0.36];
  const boxes = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const k = r * 3 + c;
    boxes.push({ x: (c - 1) * (s + gap), z: (r - 1) * (s + gap), w: s, d: s, h: H[k] * (T ? 1.18 : 1) });
  }
  return { T, s, gap, boxes, ground: T ? g.cy - 0.32 : g.cy - 0.3 };
}
// the comets: which box each works in; comet 5 works in a front box and crosses into the box on its right
const CROSS = 7, INTO = 8;
const COMET_BOX = [0, 2, 3, 5, 4, CROSS];
function cityShape(rand) {
  const G = g8(), T = G.T, sh = newShape('city');
  const nEdge = Math.round(N * 0.42), nFace = Math.round(N * 0.2), nBase = Math.round(N * 0.08);
  const nCom = Math.round(N * 0.008), nRip = Math.round(N * 0.036);
  const y0 = G.ground;
  const cross = CROSS, into = INTO;
  const edgesOf = B => {
    const x0 = B.x - B.w / 2, x1 = B.x + B.w / 2, z0 = B.z - B.d / 2, z1 = B.z + B.d / 2, y1 = y0 + B.h;
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    return [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].map(e => [P[e[0]], P[e[1]]]);
  };
  // the wall between box 4 and box 5 flashes: it is x = right side of box 4
  const wallX = G.boxes[cross].x + G.boxes[cross].w / 2;
  const onWall = (x, k) => (k === cross && Math.abs(x - wallX) < 0.004) || (k === into && Math.abs(x - (G.boxes[into].x - G.boxes[into].w / 2)) < 0.004) ? 1 : 0;
  const lens = [];
  G.boxes.forEach((B, k) => edgesOf(B).forEach(e => lens.push([e, k, Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2])])));
  const totL = lens.reduce((a, b) => a + b[2], 0);
  let i = 0;
  for (let m = 0; m < nEdge; m++, i++) {
    let r = rand() * totL, q = 0;
    while (q < lens.length - 1 && r > lens[q][2]) { r -= lens[q][2]; q++; }
    const [e, k] = lens[q], u = rand();
    const x = e[0][0] + (e[1][0] - e[0][0]) * u, y = e[0][1] + (e[1][1] - e[0][1]) * u, z = e[0][2] + (e[1][2] - e[0][2]) * u;
    put(sh, i, x + (rand() - 0.5) * 0.004, y + (rand() - 0.5) * 0.004, z + (rand() - 0.5) * 0.004, 0.8, 0.56 + 0.26 * (k % 3) / 2, 0, 0.24, 0.2);
    set4(sh.aux, i, k, onWall(e[0][0], k) && onWall(e[1][0], k) ? 1 : 0, 0, 0);
    sh.aux2[i * 4] = 0;
    sh.meta[i * 4 + 3] = (k / 9) * 0.85 + rand() * 0.1;
  }
  // faint faces; the top face a little brighter
  const faceArea = G.boxes.map(B => 2 * (B.w + B.d) * B.h + B.w * B.d);
  const totA = faceArea.reduce((a, b) => a + b, 0);
  for (let m = 0; m < nFace; m++, i++) {
    let r = rand() * totA, k = 0;
    while (k < 8 && r > faceArea[k]) { r -= faceArea[k]; k++; }
    const B = G.boxes[k], side = rand() * (2 * (B.w + B.d) * B.h + B.w * B.d);
    let x, y, z, wall = 0;
    if (side < B.w * B.d) { x = B.x + (rand() - 0.5) * B.w; z = B.z + (rand() - 0.5) * B.d; y = y0 + B.h; }
    else {
      const f = (rand() * 4) | 0, u = rand() - 0.5;
      y = y0 + rand() * B.h;
      if (f === 0) { x = B.x - B.w / 2; z = B.z + u * B.d; } else if (f === 1) { x = B.x + B.w / 2; z = B.z + u * B.d; }
      else if (f === 2) { z = B.z - B.d / 2; x = B.x + u * B.w; } else { z = B.z + B.d / 2; x = B.x + u * B.w; }
      wall = (k === cross && f === 1) || (k === into && f === 0) ? 1 : 0;
    }
    put(sh, i, x, y, z, y > y0 + B.h - 0.001 ? 0.22 : 0.13, 0.45 + 0.4 * rand(), 0.3, 0.05, 0.1);
    set4(sh.aux, i, k, wall, 0, 0);
    sh.aux2[i * 4] = 1;
    sh.meta[i * 4 + 3] = (k / 9) * 0.85 + rand() * 0.1;
  }
  // a sheet on the crossed wall, dark until the comet goes through it
  const nWall = Math.round(N * 0.026), WB = G.boxes[cross];
  for (let m = 0; m < nWall; m++, i++) {
    put(sh, i, wallX, y0 + rand() * WB.h, WB.z + (rand() - 0.5) * WB.d, 0.02, 0.9, 0, 0.6, 0.1);
    set4(sh.aux, i, cross, 1, 0, 0);
    sh.aux2[i * 4] = 1;
    sh.meta[i * 4 + 3] = (cross / 9) * 0.85 + rand() * 0.1;
  }
  // the ground: a fine grid under the city
  const span = 1.5 * (G.s + G.gap) + 0.25;
  for (let m = 0; m < nBase; m++, i++) {
    const along = rand() * 2 - 1, which = (rand() * 9) | 0, horiz = rand() < 0.5;
    const v = (which / 8 * 2 - 1) * span;
    const x = horiz ? along * span : v, z = horiz ? v : along * span;
    put(sh, i, x, y0 - 0.002, z, 0.16 * (1 - 0.5 * Math.abs(along)), 0.3, 0.2, 0, 0.1);
    sh.aux2[i * 4] = 2;
    sh.meta[i * 4 + 3] = rand() * 0.6;
  }
  for (let c = 0; c < 6; c++) {
    for (let m = 0; m < nCom; m++, i++) {
      const r = 0.012 * Math.sqrt(-2 * Math.log(1 - 0.99 * rand())), d = sdir(rand);
      put(sh, i, d[0] * r, d[1] * r, d[2] * r, 1.0, 0.9, 0, 0.55, 1.0);
      set4(sh.aux, i, c, 0, 0, 0);
      sh.aux2[i * 4] = 3;
    }
  }
  // the notice: a thin shell that grows from the crossing point
  for (let m = 0; m < nRip; m++, i++) {
    const d = sdir(rand);
    put(sh, i, 0, 0, 0, 1.0, 0.2, 0, 0.22, 0.2);
    set4(sh.aux, i, d[0], d[1], d[2], 0);
    sh.aux2[i * 4] = 4;
  }
  dust(sh, i, N - i, rand, 5, 0.7);
  sh.G = G;
  sh.wallX = wallX;
  sh.area = T ? 0.7 : 0.8;
  return sh;
}

/* ---------------------------------------------------- 09 · 함께 */
function g9() {
  const g = geo(), T = g.tall, H = innerHeight;
  const cap = caps[8];
  const toY = px => (H / 2 - px) / pxPerUnit;
  let titleY = g.y0 - 0.1, sigY = g.y0 - 0.3, capTopY = g.y0;
  if (cap) {
    const t = cap.querySelector('h2'), s = cap.querySelector('.sig');
    if (t) { const r = settledRect(cap, t); titleY = toY((r.top + r.bottom) / 2); capTopY = toY(r.top); }
    if (s) { const r = settledRect(cap, s); sigY = toY((r.top + r.bottom) / 2); }
  }
  const top = g.y1;
  const r = T ? 0.36 : 0.3, s = T ? 0.05 : 0.055;
  const cy = Math.min(top - r - 0.12, (top + capTopY) / 2 + 0.04);
  const ring = { c: [0, cy, 0], r, s };
  // eight seats: the agent at the top, the empty one at the bottom nearest the words
  const seat = k => { const a = Math.PI / 2 + k * TAU / 8; return [Math.cos(a) * r, cy + Math.sin(a) * r, 0]; };
  return { T, ring, seat, empty: 4, titleY, sigY, capTopY, sigH: T ? 0.16 : 0.085 };
}
function togetherShape(rand) {
  const G = g9(), T = G.T, sh = newShape('together');
  blob(sh, I_AG, PB, rand, G.ring.s, 0.95, 0.6, 1.05, 1, i => { sh.aux[i * 4] = 0; });
  const people = [1, 2, 3, 5, 6, 7];
  for (let p = 0; p < 6; p++) blob(sh, I_PP + p * PB, PB, rand, G.ring.s, 0.5, 0.12, 0.95, 0, i => { sh.aux[i * 4] = people[p]; });
  let i = I_RS;
  const nSeat = Math.round(N * 0.018), nSig = Math.round(N * 0.055), nCir = Math.round(N * 0.02);
  for (let k = 0; k < nSeat; k++, i++) {
    const a = rand() * TAU, rr = G.ring.s * (1.05 + 0.08 * gauss(rand));
    put(sh, i, Math.cos(a) * rr, Math.sin(a) * rr, (rand() - 0.5) * 0.01, 0.42, 0.62, 0.1, 0.2, 0.1);
    set4(sh.aux2, i, 2, a / TAU, 0, 0);
  }
  // the signature, small, sampled once and kept for both languages
  clearBox();
  drawText('Kunsang Lee', { cy: 0, maxW: 2.0, lineH: 0.5, weight: 760 });
  const S = sample(nSig, rand);
  const b = bounds(S.x, S.y, nSig);
  const sc = G.sigH / (b.y1 - b.y0);
  for (let k = 0; k < nSig; k++, i++) {
    put(sh, i, (S.x[k] - (b.x0 + b.x1) / 2) * sc, (S.y[k] - (b.y0 + b.y1) / 2) * sc, 0, (0.62 + 0.38 * S.a[k]) * (S.edge[k] ? 1.15 : 1) * (T ? 1.55 : 1), 0.5, 0, S.edge[k] ? 0.42 : 0.1, 0.45);
    sh.aux2[i * 4] = 3;
    sh.meta[i * 4 + 3] = (S.x[k] - b.x0) / (b.x1 - b.x0) * 0.7 + rand() * 0.3;
  }
  circleLine(sh, i, nCir, rand, G.ring.c, G.ring.r, 4, 0.12); i += nCir;
  dust(sh, i, N - i, rand, 5, 0.7);
  dust(sh, I_CD, I_RS - I_CD, rand, 5, 0.7);
  sh.G = G;
  sh.sigW = (b.x1 - b.x0) * sc;
  sh.area = T ? 0.4 : 0.46;
  return sh;
}

const BUILD = { name: nameShape, ring: ringShape, meaning: meaningShape, memory: memoryShape, anytime: anytimeShape, ribbon: ribbonShape, review: reviewShape, city: cityShape, together: togetherShape };
const SEEDS = { name: 11, ring: 23, meaning: 37, memory: 41, anytime: 53, ribbon: 59, review: 61, city: 67, together: 71 };
const cache = new Map();
let curShape = null, warmTimer = 0, fontsReady = false;
function getShape(key) {
  let s = cache.get(key);
  if (!s) { s = BUILD[key](rng(SEEDS[key])); cache.set(key, s); }
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
const FREE = 0, ASSEMBLE = 1, RING = 2, MEANING = 3, MEMORY = 4, ANYTIME = 5, RIBBON = 6, REVIEW = 7, GALAXY = 8, CITY = 9, TOGETHER = 10;
const R_PLAIN = 0;
const U = {
  mode: 0, phaseT: 0, K: 0, zeta: 0.7, ramp: 0.8, stagger: 0, noise: 0, noiseFreq: 0.85, drag: 1.2, vmax: 0,
  kick: 0, kickR: 0, kickShell: 0, colRate: 2.5, arrN: 0,
  contain: new Float32Array(2), wind: new Float32Array(3), kickC: new Float32Array(3), kickBias: new Float32Array(3),
  P: new Float32Array(4), Q: new Float32Array(4), S: new Float32Array(4), T: new Float32Array(4), V: new Float32Array(4), G: new Float32Array(4)
};
// per-frame positions the CPU decides (seats, comets, cards); uploaded as uArr
const ARR = new Float32Array(32 * 4);
const R = {
  mode: 0, jitter: 0, white: 0.04, gain: 1, bright: 1, brightGoal: 1, trail: 0, bloom: 1, exposure: 1, pulse: 0, pulseT: 0, pulseGap: 0.12,
  dim: 1, dof: 0.6, tail: 0.045, vari: 0.1, maskA: 0.6, lenK: 0.55, shift: 0
};
function resetUniforms() {
  U.mode = FREE; U.phaseT = 0; U.K = 0; U.zeta = 0.7; U.ramp = 0.8; U.stagger = 0; U.noise = 0; U.noiseFreq = 0.85;
  U.drag = 1.2; U.vmax = 0; U.kick = 0; U.kickR = 0; U.kickShell = 0; U.colRate = 2.5; U.arrN = 0;
  U.contain[0] = 0.75; U.contain[1] = 8.0; U.wind.fill(0); U.kickBias.fill(0);
  U.P.fill(0); U.Q.fill(0); U.S.fill(0); U.T.fill(0); U.V.fill(0); U.G.fill(0);
  R.mode = R_PLAIN; R.jitter = 0; R.white = 0.04; R.gain = 1; R.trail = 0; R.bloom = 1; R.exposure = 1;
  R.pulse = 0; R.pulseT = 0; R.pulseGap = 0.12; R.dim = 1; R.dof = 0.6; R.tail = 0.045; R.vari = 0.1;
  R.maskA = 0.6; R.lenK = 0.55; R.shift = 0;
}
function free(noise, drag) { U.mode = FREE; U.noise = noise * 0.6; U.drag = drag * 1.3; U.noiseFreq = 0.7; U.P[3] = 1.5; }
function assemble(K, zeta, ramp, stagger, jit, noise) {
  U.mode = ASSEMBLE; U.K = K; U.zeta = zeta; U.ramp = ramp; U.stagger = stagger; U.P[0] = jit;
  U.noise = noise * 0.65; U.drag = 1.2; U.vmax = 5.5;
}
function hold() {
  U.mode = ASSEMBLE; U.phaseT = 99; U.K = 90; U.zeta = 0.72; U.ramp = 1; U.noise = 0.12; U.drag = 0;
  R.jitter = 0.0022;
}

/* 흩어짐: 입자에 한 번 속도를 더하고, 화면을 잠깐 밝히고, 카메라를 흔든다 */
let pendingKick = null, flashE = 0;
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
// keyframes [[time, [x, y, z]], ...], eased between each pair
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return L3(a[1], b[1], inOut((t - a[0]) / Math.max(1e-3, b[0] - a[0]))); }
  }
  return keys[keys.length - 1][1];
}
// the shape a scene needs, even before it is the current one (camera functions run every frame)
const shapeOf = key => (curShape && curShape.key === key ? curShape : getShape(key));

/* ---------------------------------------------------- 02 · 동료 */
const S2 = { j0: 0.8, j1: 2.2, call: 2.9, grow: 3.4, beam: 3.9, pull: 4.6, ans: 5.9, fold: 6.9, out: 8.2 };
function lightPath2(G, t) {
  const top = G.seat7(0);
  const from = G.T ? [1.35, top[1] + 1.0, 0.4] : [halfW + 0.45, top[1] + 0.5, 0.4];
  const ctrl = G.T ? [0.75, top[1] + 0.75, 0.3] : [1.15, top[1] + 0.62, 0.3];
  return B3(from, ctrl, top, inOut((t - S2.j0) / (S2.j1 - S2.j0)));
}
function cardPath2(G, k, t) {
  const c = G.cards[k], go = inOut((t - S2.out - k * 0.12) / 1.0);
  return [c[0] + go * (G.T ? 1.5 : 1.9), c[1] + go * 0.1, c[2]];
}
function ringFrame(t) {
  const sh = curShape, G = sh.G;
  U.mode = RING; U.phaseT = t; U.ramp = 0.6; U.noise = 0.45; U.noiseFreq = 0.9; U.colRate = 3;
  // the six make room as the light arrives
  const jn = sm((t - (S2.j1 - 0.75)) / 0.8);
  for (let p = 0; p < 6; p++) {
    const glow = p === G.caller ? 1.1 * win(t, S2.call, S2.ans + 0.7, 0.25, 0.6) : 0;
    arr(p, L3(G.seat6(p), G.seat7(p + 1), jn), 1 + glow);
  }
  const lp = lightPath2(G, t), lv = vel(tt => lightPath2(G, tt), t);
  const arrive = pulse(t, S2.j1, 3.2);
  set4v(U.T, lp[0], lp[1], lp[2], 1 + 0.12 * arrive);
  set4v(U.V, lv[0], lv[1], lv[2], sm((t - S2.j0) / 0.3) * (1 + 0.9 * arrive + 0.5 * win(t, S2.beam, S2.fold, 0.2, 0.4)));
  set4v(U.Q, G.cp[0], G.cp[1], G.cp[2], 1.2 * sm((t - S2.call - 0.15) / 0.5));
  arr(12, G.bubble.c, 1);
  U.S[0] = 1.15 * sm((t - S2.grow) / 0.8);
  U.S[1] = 1.05 * sm((t - S2.grow - 0.1) / 0.7);
  U.S[2] = sm((t - S2.beam) / 0.45);
  U.S[3] = win(t, S2.beam, S2.ans + 0.2, 0.2, 0.5);
  arr(10, G.fA, 1); arr(11, G.dA, 1);
  // once the answer is back, the code and the database step back so the two cards read
  U.P[0] = 0.62 * sm((t - S2.fold) / 0.6);
  set4v(U.G, S2.pull, S2.ans, S2.fold, sm((t - S2.out - 0.35) / 0.6));
  for (let k = 0; k < 2; k++) arr(8 + k, cardPath2(G, k, t), 1);
  R.trail = t < 0.7 ? 0.8 : (t > S2.j0 && t < S2.j1 + 0.3) || (t > S2.pull && t < S2.out + 1.1) ? 0.62 : 0.4;
  R.tail = 0.055; R.jitter = 0.001;
}

/* ---------------------------------------------------- 03 · 말뜻 */
const S3 = { move: 1.4, untangle: 2.2, check: 3.4, down: 3.9, downDur: 0.95, echo0: 5.2, echoGap: 0.85, echoDur: 1.0 };
function cardPath3(G, t) {
  if (t < S3.move) return L3(G.start, G.P1, inOut(t / S3.move));
  if (t < S3.down) return [G.P1[0], G.P1[1] + 0.008 * Math.sin((t - S3.move) * 2.2), G.P1[2]];
  return L3(G.P1, G.P2, inOut((t - S3.down) / S3.downDur));
}
function echoPath3(G, f, t) {
  const u = clamp((t - S3.echo0 - f * S3.echoGap) / S3.echoDur, 0, 1);
  return [0, mix(G.P1[1] + 0.06, G.lineY - 0.16, u), 0.02];
}
function meaningFrame(t) {
  const sh = curShape, G = sh.G, h = G.card.h;
  U.mode = MEANING; U.phaseT = t; U.ramp = 0.5; U.noise = 0.4; U.noiseFreq = 1.3; U.colRate = 3;
  const c = cardPath3(G, t), cv = vel(tt => cardPath3(G, tt), t);
  set4v(U.Q, c[0], c[1], c[2], mix(0.85, 1, sm(t / S3.move)));
  set4v(U.V, cv[0], cv[1], cv[2], 0);
  set4v(U.P, S3.untangle, 0.6, 1.06 * sm((t - S3.check) / 0.35), 1);
  set4v(U.T, 1 - sm((t - 0.1) / 1.0), 1, 0.8, 0);
  let hit = t > S3.down ? Math.exp(-Math.pow((c[1] - G.lineY) / (h * 0.5), 2)) : 0;
  for (let f = 0; f < 2; f++) {
    const t0 = S3.echo0 + f * S3.echoGap;
    const e = echoPath3(G, f, t), ev = vel(tt => echoPath3(G, f, tt), t);
    const b = 0.85 * sm((t - t0) / 0.25) * (1 - sm((G.lineY - e[1]) / 0.11));
    arr(f, e, 1);
    arr4(2 + f, b, ev[0], ev[1], ev[2]);
    hit = Math.max(hit, b * Math.exp(-Math.pow((e[1] - G.lineY) / (h * 0.31), 2)));
  }
  set4v(U.S, G.lineY, 0, hit, 1.05 * sm((t - 0.4) / 0.8));
  U.G[0] = t > S3.down && Math.abs(c[1] - G.lineY) < h * 0.6 ? 1 : 0;
  const G2 = G.G2;
  for (let k = 0; k < 7; k++) arr(4 + (k === 0 ? 6 : k - 1), G2.seat7(k), 1);
  R.trail = t < 1.5 ? 0.6 : 0.4; R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 04 · 기억 */
const S4 = { star: 0.15, fall0: 0.85, fall1: 2.3, light: 2.75, span: 2.3 };
function starPath4(sh, t) { return L3(sh.card.c, sh.G.star, inOut((t - S4.fall0) / (S4.fall1 - S4.fall0))); }
function memoryFrame(t, u, prev) {
  const sh = curShape, G = sh.G;
  U.mode = MEMORY; U.phaseT = t; U.ramp = 0.7; U.noise = 0.35; U.noiseFreq = 0.8; U.colRate = 2.4;
  const c = sm((t - S4.star) / 0.7);
  const sp = starPath4(sh, t), sv = vel(tt => starPath4(sh, tt), t);
  const glow = 1 + 1.1 * pulse(t, S4.light - 0.12, 2.0);
  set4v(U.P, c, 0, S4.light, S4.span);
  set4v(U.T, sh.card.c[0], sh.card.c[1], sh.card.c[2], 1);
  set4v(U.Q, sp[0], sp[1], sp[2], 1.2 * glow);
  set4v(U.V, sv[0], sv[1], sv[2], 0);
  U.S[0] = 0.3;
  if (prev < S4.light - 0.12 && t >= S4.light - 0.12) flashE = Math.max(flashE, 0.3);
  R.trail = t < 2.4 ? 0.62 : 0.42; R.tail = 0.05; R.dof = 1.15; R.jitter = 0.001;
  R.bloom = 1 + 0.35 * win(t, S4.light, S4.light + S4.span + 0.6, 0.4, 1.0);
}

/* ---------------------------------------------------- 05 · 언제든 */
const S5 = { dial: 0.6, sweep0: 1.6, sweep1: 5.0, h0: 16, h1: 34, off0: 19.2, offGap: 0.85, comet0: 5.35, comet1: 6.05, ans: 6.1 };
function handH(t) {
  const s = clamp((t - S5.sweep0) / (S5.sweep1 - S5.sweep0), 0, 1);
  return S5.h0 + (S5.h1 - S5.h0) * (s - 0.6 * Math.sin(2 * Math.PI * s) / (2 * Math.PI));
}
function cometFrom5(G) { return G.from; }
function cometPath5(G, t) {
  const a = G.seat7(0), f = cometFrom5(G);
  const ctrl = [mix(f[0], a[0], 0.55), Math.max(f[1], a[1]) + 0.25, 0.25];
  return B3(f, ctrl, a, inOut((t - S5.comet0) / (S5.comet1 - S5.comet0)));
}
function anytimeFrame(t) {
  const sh = curShape, G = sh.G;
  U.mode = ANYTIME; U.phaseT = t; U.ramp = 0.6; U.noise = 0.3; U.noiseFreq = 0.8; U.colRate = 2.2;
  const h = handH(t), h2 = handH(t + 0.02);
  const ang = h / 24 * Math.PI * 2;
  for (let p = 0; p < 6; p++) arr(p, G.seat7(p + 1), 1 - sm((h - (S5.off0 + p * S5.offGap)) / 0.35));
  arr(7, G.seat7(0), 1);
  set4v(U.P, ang, sm((h - 30.5) / 2.5), sm((t - S5.dial) / 1.0), 0);
  set4v(U.Q, G.dialC[0], G.dialC[1], G.dialC[2], 1);
  U.G[0] = (h2 - h) / 0.02 / 24 * Math.PI * 2;
  const f = cometFrom5(G);
  U.G[1] = f[0]; U.G[2] = f[1]; U.G[3] = f[2];
  const cp = cometPath5(G, t), cv = vel(tt => cometPath5(G, tt), t);
  set4v(U.S, cp[0], cp[1], cp[2], win(t, S5.comet0, S5.comet1 - 0.05, 0.15, 0.08));
  set4v(U.V, cv[0], cv[1], cv[2], 0);
  set4v(U.T, 1.45 * clamp((t - S5.ans) / 0.6, 0, 1), win(t, S5.ans, S5.ans + 1.05, 0.05, 0.45), pulse(t, S5.comet1, 2.4), t > S5.sweep0 - 0.1 && t < S5.sweep1 + 0.25 ? 1 : 0);
  R.trail = t > S5.comet0 - 0.2 && t < S5.ans + 1.2 ? 0.66 : 0.5; R.tail = 0.06; R.jitter = 0.0008; R.dof = 0.8;
}

/* ---------------------------------------------------- 06 · 하루 30분 */
const S6 = { q: [1.5, 2.6, 3.7], wind: 4.75, windSpan: 1.1, windDur: 1.0 };
function qSpot6(G, q) {
  const dx = G.T ? [-0.32, 0.36, -0.06][q] : [-0.42, 0.46, -0.12][q];
  return [G.post[0] + dx, G.y + (G.T ? 0.24 : 0.2), 0.05];
}
function agentPath6(G, t) {
  const start = shapeOf('anytime').G.seat7(0);
  const keys = [[0, start], [1.1, G.post]];
  S6.q.forEach((tq, q) => { const I = qSpot6(G, q); keys.push([tq, G.post], [tq + 0.5, I], [tq + 0.66, I], [tq + 1.0, G.post]); });
  keys.push([S6.wind - 0.2, G.post], [S6.wind + 0.6, G.side]);
  return track(keys, t);
}
function qPath6(G, q, t) {
  const I = qSpot6(G, q), tq = S6.q[q];
  const from = G.T ? [(q === 1 ? -1 : 1) * (halfW + 0.3), I[1] + 0.5, 0.2] : [I[0] + 1.0 * (q === 1 ? -1 : 1), geo().y1 + 0.55, 0.2];
  const u = clamp((t - tq + 0.12) / 0.78, 0, 1);
  return L3(from, I, u * u * (1.6 - 0.6 * u));
}
function ribbonFrame(t) {
  const sh = curShape, G = sh.G;
  U.mode = RIBBON; U.phaseT = t; U.ramp = 0.6; U.noise = 0.35; U.noiseFreq = 1.0; U.colRate = 2.6;
  set4v(U.Q, 0.085, G.amp, G.y, G.L);
  U.P[2] = G.tube;
  set4v(U.S, S6.wind, S6.windSpan, S6.windDur, 0);
  U.G[0] = 0;
  const ap = agentPath6(G, t), av = vel(tt => agentPath6(G, tt), t);
  let caught = 0;
  S6.q.forEach((tq, q) => {
    const qp = qPath6(G, q, t), qv = vel(tt => qPath6(G, q, tt), t);
    arr(q, qp, win(t, tq - 0.12, tq + 0.62, 0.15, 0.06));
    arr(4 + q, qv, 0);
    caught += pulse(t, tq + 0.66, 3.0);
  });
  set4v(U.T, ap[0], ap[1], ap[2], 1);
  set4v(U.V, av[0], av[1], av[2], 1 + 0.9 * caught);
  R.trail = t < 4.6 ? 0.55 : mix(0.55, 0.3, sm((t - 5.6) / 1.2)); R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 07 · 리뷰 */
const S7 = { pull0: 0.55, pull1: 2.0, page: 1.25, frag: 2.1, lightIn: 3.4, visits: [3.95, 4.6, 5.25], reject: 5.85, dim: 6.4 };
function pageView7(sh, t) {
  const G = sh.G, L = sh.lines[G.page.hi];
  const xc = (L.toks[0][0] + L.toks[L.toks.length - 1][0] + L.toks[L.toks.length - 1][1]) / 2, yc = L.y;
  const S0 = G.T ? 2.0 : 2.6, cy0 = shapeOf('ribbon').G.text.cy;
  const e = inOut((t - S7.pull0) / (S7.pull1 - S7.pull0));
  const S = mix(S0, 1, e), c = L3([0, cy0, 0], [xc, yc, 0], e);
  return [c[0] - xc * S, c[1] - yc * S, S];
}
function lightPath7(sh, t) {
  const G = sh.G, g = geo();
  const pts = APPROVED.map(f => [G.frag[f][0], G.frag[f][1] + G.fh * 0.5 + 0.07, 0.05]);
  const start = G.T ? [-1.35, G.frag[0][1] + 0.35, 0.1] : [-0.15, g.y1 + 0.35, 0.1];
  const exit = G.T ? [1.35, g.y1 + 0.2, 0.1] : [0.6, g.y1 + 0.4, 0.1];
  const v = S7.visits;
  return track([[S7.lightIn, start], [v[0], pts[0]], [v[0] + 0.25, pts[0]], [v[1], pts[1]], [v[1] + 0.25, pts[1]], [v[2], pts[2]], [v[2] + 0.35, pts[2]], [v[2] + 1.1, exit]], t);
}
function fragPath7(sh, f, t) {
  const G = sh.G, to = [G.frag[f][0], G.frag[f][1], 0.02];
  const u = inOut((t - S7.frag - f * 0.16) / 0.9);
  return B3(G.from, [mix(G.from[0], to[0], 0.5), to[1] + 0.25, 0.1], to, u);
}
function reviewFrame(t) {
  const sh = curShape, G = sh.G, L = G.list;
  U.mode = REVIEW; U.phaseT = t; U.ramp = 0.5; U.noise = 0.35; U.noiseFreq = 1.1; U.colRate = 3;
  const pv = pageView7(sh, t);
  set4v(U.Q, pv[0], pv[1], pv[2], mix(1.15, 0.8, sm((t - S7.pull1) / 0.6)));
  set4v(U.P, 1.3 * sm((t - S7.page) / 0.9), sm((t - S7.dim) / 0.8), 0, 0);
  // portrait: once the unapproved pieces are gone, the finished list rises into the space they left
  if (sh.liftY === undefined) {
    const pg = G.page, g = geo();
    sh.liftY = G.T ? Math.max(0, ((pg.y1 - pg.n * pg.pitch) + g.y0) / 2 - (L.y0 + L.pitch + 0.04)) : 0;
    sh.rulesBase = sh.anchors.rules ? sh.anchors.rules[1] : 0;
  }
  const lift = sh.liftY * sm((t - S7.dim - 0.3) / 1.0);
  if (sh.anchors.rules) sh.anchors.rules[1] = sh.rulesBase + lift;
  for (let f = 0; f < 6; f++) {
    const fp = fragPath7(sh, f, t);
    arr(f, fp, sm((t - S7.frag - f * 0.16) / 0.3));
    const k = APPROVED.indexOf(f);
    if (k >= 0) {
      const tv = S7.visits[k];
      arr4(8 + f, 1.05 * sm((t - tv - 0.05) / 0.6), 0, pulse(t, tv, 5), 0);
      arr(16 + f, [L.x, L.y0 + k * L.pitch + lift, 0.02], 1);
    } else {
      arr4(8 + f, 0, sm((t - S7.reject - f * 0.07) / 0.75), 0, 0);
      arr(16 + f, fp, 1);
    }
  }
  const lp = lightPath7(sh, t), lv = vel(tt => lightPath7(sh, tt), t);
  set4v(U.T, lp[0], lp[1], lp[2], sm((t - S7.lightIn) / 0.3) * (1 - sm((t - S7.visits[2] - 0.55) / 0.5)));
  set4v(U.V, lv[0], lv[1], lv[2], 0);
  R.trail = t < 2.2 ? 0.6 : 0.45; R.tail = 0.05; R.jitter = 0.0008;
}

/* ---------------------------------------------------- 08 · 아홉 칸 */
const S8 = { comets: 1.6, go: 3.6, home: 5.9 };
function orbit8(G, c, t) {
  const B = G.boxes[COMET_BOX[c]], w = t * (0.85 + 0.12 * c) + c * 1.7;
  return [B.x + Math.sin(w) * B.w * 0.27, G.ground + B.h * (0.38 + 0.22 * Math.sin(w * 0.7 + c)), B.z + Math.cos(w * 1.3) * B.d * 0.27];
}
// comet 5 works in a front box, crosses into the box on its right, and is called back
function crossPlan8(sh) {
  if (sh.plan) return sh.plan;
  const G = sh.G, A = G.boxes[CROSS], B = G.boxes[INTO];
  const P5 = [B.x + B.w * 0.06, G.ground + A.h * 0.46, A.z + 0.02];
  const start = orbit8(G, 5, S8.go), arriveB = S8.go + 0.95;
  const mid = [(start[0] + P5[0]) / 2, Math.max(start[1], P5[1]) + 0.05, (start[2] + P5[2]) / 2];
  const go = t => B3(start, mid, P5, inOut((t - S8.go) / (arriveB - S8.go)));
  let tc = arriveB;
  for (let tt = S8.go; tt <= arriveB; tt += 0.005) if (go(tt)[0] >= sh.wallX) { tc = tt; break; }
  const X = go(tc), tr = arriveB + 0.18;
  sh.plan = { P5, go, tc, X, tr, speed: dist3(P5, X) / (tr - tc), arriveB };
  return sh.plan;
}
function comet5(sh, t) {
  const G = sh.G, pl = crossPlan8(sh);
  if (t < S8.go) return orbit8(G, 5, t);
  if (t < pl.arriveB) return pl.go(t);
  if (t < pl.tr) return [pl.P5[0] + (t - pl.arriveB) * 0.05, pl.P5[1], pl.P5[2]];
  const back = orbit8(G, 5, S8.home), from = [pl.P5[0] + (pl.tr - pl.arriveB) * 0.05, pl.P5[1], pl.P5[2]];
  return B3(from, [(from[0] + back[0]) / 2, Math.max(from[1], back[1]) + 0.06, (from[2] + back[2]) / 2], back, inOut((t - pl.tr) / (S8.home - pl.tr)));
}
function cityFrame(t) {
  const sh = curShape, G = sh.G, pl = crossPlan8(sh);
  U.mode = CITY; U.phaseT = t; U.ramp = 0.8; U.noise = 0.5; U.noiseFreq = 0.9; U.colRate = 7;
  for (let c = 0; c < 6; c++) {
    const f = c === 5 ? tt => (tt > S8.home ? orbit8(G, 5, tt) : comet5(sh, tt)) : tt => orbit8(G, c, tt);
    const p = f(t), v = vel(f, t);
    arr(c, p, sm((t - S8.comets - c * 0.12) / 0.4));
    arr(8 + c, v, 0);
  }
  const r = t > pl.tc ? Math.min(t - pl.tc, pl.tr - pl.tc + 0.1) * pl.speed : 0;
  set4v(U.P, pulse(t, pl.tr, 3.5), pulse(t, pl.tc, 1.25), (t > pl.tc ? 1 : 0) * (1 - sm((t - pl.tr) / 0.4)), 0);
  set4v(U.Q, pl.X[0], pl.X[1], pl.X[2], r);
  R.trail = t < 1.2 ? 0.7 : 0.5; R.tail = 0.06 + 0.07 * sm((t - S8.go + 0.2) / 0.3) * (1 - sm((t - S8.home) / 0.4)); R.jitter = 0.0008; R.dof = 0.9;
  R.bloom = 1 + 0.5 * pulse(t, pl.tc, 2.5);
  R.dim = 0.14 + 0.86 * sm(t / 0.8);
}

/* ---------------------------------------------------- 09 · 함께 */
const S9 = { seat: 0.9, bloom: 1.6, reveal: 2.2, gather: 3.6 };
function togetherFrame(t, u, prev) {
  const sh = curShape, G = sh.G;
  U.mode = TOGETHER; U.phaseT = t; U.ramp = 0.6; U.noise = 0.4; U.noiseFreq = 0.9; U.colRate = 2.4;
  for (let k = 0; k < 8; k++) arr(k, G.seat(k), k === G.empty ? 0 : 1);
  const es = G.seat(G.empty);
  set4v(U.T, es[0], es[1], es[2], sm((t - S9.seat) / 0.6));
  set4v(U.P, S9.bloom, S9.gather, 0, 0);
  set4v(U.S, 0, G.titleY, 0.04, G.T ? 0.62 : 0.5);
  set4v(U.Q, 0, G.sigY, 0, 1);
  if (prev < S9.reveal && t >= S9.reveal && caps[8]) caps[8].classList.add('bloom');
  R.trail = t > S9.bloom - 0.1 && t < S9.gather + 1.6 ? 0.46 : 0.4; R.tail = 0.04; R.jitter = 0.0009;
  R.maskA = 0.8;
}

/* 장면마다 단계(steps)와 카메라를 둔다. 카메라 함수는 (장면 시간, 단계 이름)을 받아 목표 자리를 돌려주고,
   스프링이 그 자리를 따라간다. 마지막 단계는 끝없이 머문다 */
const SCENES = [
  { key: 'name', story: 3.2, camK: 5, from: { yaw: -0.42, pitch: 0.16, dz: 0.95, roll: 0.22 },
    cam: () => ({}),
    steps: [
      { name: 'chaos', dur: 0.35, gate: () => fontsReady, enter(first) { if (!first) explode(1.6, [0, 0, 0.8]); }, frame() { free(1.5, 0.9); R.trail = 0.86; R.tail = 0.06; } },
      { name: 'assemble', dur: 1.9, enter() { useShape('name'); }, frame(t, u) { assemble(64, 0.62, 0.62, 0.5, 0.2, 1.2); R.trail = mix(0.86, 0.3, sm(u)); R.tail = mix(0.06, 0.035, u); } },
      { name: 'hold', dur: Infinity, frame() { hold(); R.trail = 0.25; } }
    ] },
  { key: 'ring', story: 9.3, camK: 3.2,
    cam: t => ({ yaw: mix(-0.1, 0.07, sm(t / 8.5)), pitch: 0.05, dz: 0.02 }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('ring'); }, frame: ringFrame }] },
  { key: 'meaning', story: 7.1, camK: 3.2,
    cam: () => ({ pitch: 0.02 }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('meaning'); }, frame: meaningFrame }] },
  { key: 'memory', story: 7.4, camK: 2.4,
    cam: t => {
      const G = shapeOf('memory').G, s = G.star, u = inOut((t - 0.75) / 2.3);
      return { tx: s[0] * u, ty: s[1] * u, tz: s[2] * u, dz: mix(0, -0.5, u), yaw: mix(0, 0.5, u) + 0.12 * sm((t - 3) / 5), pitch: mix(0.02, 0.13, u) };
    },
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('memory'); }, frame: memoryFrame }] },
  { key: 'anytime', story: 7.2, camK: 2.4,
    cam: t => ({ yaw: mix(-0.08, 0.06, sm(t / 7)), pitch: 0.09, dz: 0.03 }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('anytime'); }, frame: anytimeFrame }] },
  { key: 'ribbon', story: 7.6, camK: 2.8,
    cam: t => ({ yaw: mix(-0.16, 0, sm((t - 3.4) / 2.4)), pitch: mix(0.05, 0, sm((t - 3.4) / 2.4)), dz: 0 }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('ribbon'); }, frame: ribbonFrame }] },
  { key: 'review', story: 7.4, camK: 3,
    cam: t => ({ dz: mix(-0.1, 0.03, inOut((t - S7.pull0) / (S7.pull1 - S7.pull0))) }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('review'); }, frame: reviewFrame }] },
  { key: 'city', story: 8.0, camK: 2.4,
    cam: (t, st) => {
      const G = shapeOf('city').G, ty = G.ground + 0.2;
      if (st === 'scatter') return { yaw: 1.05, pitch: 0.42, dz: 0.3, ty };
      const T = layout === 'tall';
      return { yaw: 1.0 - 0.75 * inOut(t / 9.5), pitch: T ? 0.5 : 0.46, dz: mix(0.18, T ? 0.02 : -0.02, sm(t / 3)), ty };
    },
    steps: [
      { name: 'scatter', dur: 0.6, enter() { explode(0.8, [0, 0.2, -0.15], undefined, 0, 0, 0.06); }, frame(t) { free(0.8, 1.5); R.trail = 0.3; R.tail = 0.02; R.dim = 1 - 0.86 * sm(t / 0.22); } },
      { name: 'build', dur: Infinity, enter() { useShape('city'); }, frame: cityFrame }
    ] },
  { key: 'together', story: 5.4, camK: 3,
    cam: () => ({ yaw: 0.04, pitch: 0.03 }),
    steps: [{ name: 'run', dur: Infinity, enter() { useShape('together'); }, frame: togetherFrame }] },
  { key: 'galaxy', story: 1, camK: 2.5,
    cam: () => ({}),
    steps: [
      { name: 'spin', dur: Infinity, frame(t) {
          const tall = layout === 'tall';
          U.mode = GALAXY; U.phaseT = t; U.noise = 0.25; U.noiseFreq = 0.8;
          U.P[0] = 1.08; U.P[1] = -0.42; U.P[2] = tall ? 1.25 : 1.75; U.P[3] = 0.05;
          U.Q[0] = tall ? 0.1 : 0.55; U.Q[1] = tall ? 0.2 : 0.0; U.Q[2] = -0.7; U.Q[3] = 0.16;
          U.S[0] = 3.0 * sm(t / 2.5) + 0.3; U.S[1] = 0.62;
          U.colRate = 1.2;
          R.trail = 0.55; R.dim = 0.85; R.jitter = 0.0012; R.tail = 0.03;
        } }
    ] }
];
const GALAXY_I = SCENES.length - 1;

let sceneIdx = 0, stepIdx = 0, stepT = 0, sceneT = 0, simTime = 1.0;
function enterStep(i, first) {
  stepIdx = i; stepT = 0;
  const st = SCENES[sceneIdx].steps[i];
  if (st.enter) st.enter(first);
}
function advanceSteps(dt) {
  const sc = SCENES[sceneIdx];
  stepT += dt; sceneT += dt;
  let st = sc.steps[stepIdx];
  while (stepT >= st.dur && stepIdx < sc.steps.length - 1) {
    const next = sc.steps[stepIdx + 1];
    if (st.gate && !st.gate()) { stepT = Math.min(stepT, st.dur); break; }
    const over = stepT - st.dur;
    enterStep(stepIdx + 1);
    stepT = over;
    st = next;
  }
}
// a tap: a local burst at the point; the springs pull everything back into the same scene
function scatterAt(px, py) {
  const w = unproject(px, py);
  explode(3.0, [0, 0, 0.5], w, 0.7);
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
let waitingFont = false;

function sceneFromScroll() {
  if (afterEl && afterEl.getBoundingClientRect().top < innerHeight * 0.5) return GALAXY_I;
  const mid = innerHeight * 0.5;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].getBoundingClientRect().bottom > mid) return i;
  }
  return sections.length - 1;
}
// scenes whose particles draw letters wait for Pretendard
function needsFont(i) { return i === 0 || i === 5 || i === 8; }
// the caption box of the scene in NDC (centre and half size, with a margin); particles fade inside it
const capRect = new Float32Array([0, -0.8, 0.5, 0.12]);
let capTopPx = 1e4;
function measureCap() {
  const c = caps[Math.min(sceneIdx, caps.length - 1)];
  if (!c || sceneIdx === GALAXY_I) { capRect[1] = -3; return; }
  let r = settledRect(c, c), my = 26;
  capTopPx = r.height ? r.top : 1e4;
  // the last scene keeps its signature and links outside the box, so only the words are masked
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
  const g = sc.cam(sceneT, sc.steps[stepIdx].name) || {};
  for (const k of CAMK) cam.goal[k] = g[k] || 0;
  cam.k = sc.camK || 6;
}
function show(i, first) {
  if (i === sceneIdx && !first) return;
  sceneIdx = i;
  sceneT = 0;
  waitingFont = !fontsReady && needsFont(i) && i !== 0;
  if (waitingFont) { stepIdx = 0; stepT = 0; } else enterStep(0, first);
  applyCamGoal();
  root.classList.toggle('in-sec', i === GALAXY_I);
  root.classList.toggle('at0', i === 0);
  root.classList.toggle('at-end', i === 8);
  caps.forEach((c2, k) => { if (!c2) return; c2.classList.toggle('on', k === i); if (k !== i) c2.classList.remove('bloom'); });
  measureCap();
  for (const k in lblEls) setLabel(k, false);
  syncUI(true);
}
function onScroll() { const i = sceneFromScroll(); if (i !== sceneIdx) show(i); }
addEventListener('scroll', onScroll, { passive: true });
// scrolling fast stretches the afterimage and pushes the camera forward a little; speed is read per simulation tick
let lastTickY = scrollY;
function readScrollSpeed(dt) {
  const dy = Math.abs(scrollY - lastTickY);
  lastTickY = scrollY;
  if (dy > 0 && dt > 0) warp.v = Math.max(warp.v, Math.min(dy / innerHeight / dt / 2.5, 1));
}
navBtns.forEach((b, i) => b.addEventListener('click', () => {
  const top = sections[i].getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + 2, behavior: 'instant' });
  onScroll();
}));

let uiScene = -1;
const barVal = bars.map(() => '');
function syncUI(force) {
  const i = Math.min(sceneIdx, sections.length - 1);
  if (force || uiScene !== sceneIdx) {
    uiScene = sceneIdx;
    navBtns.forEach((b, k) => { if (k === i && sceneIdx !== GALAXY_I) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  const prog = sceneIdx === GALAXY_I ? 1 : clamp(sceneT / SCENES[sceneIdx].story, 0, 1);
  bars.forEach((b, k) => {
    const v = k === i ? prog.toFixed(3) : k < i ? '1' : '0';
    if (barVal[k] !== v) { barVal[k] = v; b.style.transform = `scaleX(${v})`; }
  });
}

/* 이름표: 장면의 기준점을 화면 좌표로 옮겨 붙인다. 개수에는 붙이지 않는다 */
const LABELS = {
  ring: sh => {
    const G = sh.G, t = sceneT;
    for (let k = 0; k < 2; k++) {
      const c = cardPath2(G, k, t);
      sh.anchors[k ? 'pr' : 'ticket'] = [c[0] + 0.15 * G.cs + 0.035, c[1], c[2]];
    }
    return { code: t > S2.grow + 0.45, db: t > S2.grow + 0.55, ticket: t > S2.fold + 0.45 && t < S2.out + 0.3, pr: t > S2.fold + 0.55 && t < S2.out + 0.4 };
  },
  memory: () => ({ past: sceneT > S4.light + S4.span + 0.2 }),
  review: () => ({ review: sceneT > S7.frag + 0.8 && sceneT < S7.reject + 0.2, rules: sceneT > S7.visits[0] + 0.55 })
};
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
  if (!fn || !curShape || curShape.key !== sc.key || waitingFont) return;
  const want = fn(curShape);
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
  }
}

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
  const rt = pointer.down ? 0.3 : 0.18;
  const k = 1 - Math.exp(-dt * 10);
  pointer.s += (target - pointer.s) * k;
  pointer.r += (rt - pointer.r) * k;
  pointerU[0] = pointer.x; pointerU[1] = pointer.y; pointerU[2] = pointer.r; pointerU[3] = pointer.s > 0.05 ? pointer.s : 0;
  const px = pointer.active ? pointer.x : 0, py = pointer.active ? pointer.y : 0;
  parallax.x += (px - parallax.x) * (1 - Math.exp(-dt * 2));
  parallax.y += (py - parallax.y) * (1 - Math.exp(-dt * 2));
}

/* ------------------------------------------------------------ simulation */
function simulate(dt) {
  resetUniforms();
  const sc = SCENES[sceneIdx];
  const st = sc.steps[stepIdx];
  const prevT = stepT;
  U.phaseT = stepT;
  if (waitingFont) { free(2.0, 1.25); R.trail = 0.8; }
  else st.frame(stepT, st.dur === Infinity ? 0 : clamp(stepT / st.dur, 0, 1), prevT - dt);
  if (sceneIdx === 0 && stepIdx === 0) U.colRate = 0;
  if (pendingKick) {
    U.kick = pendingKick.mag; U.kickBias.set(pendingKick.bias); U.kickC.set(pendingKick.at); U.kickR = pendingKick.radius; U.kickShell = pendingKick.shell;
    pendingKick = null;
  }
  const u = simP.u;
  gl.useProgram(simP.p);
  gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, simTime); gl.uniform1f(u.uPhaseT, U.phaseT);
  gl.uniform1i(u.uMode, U.mode);
  gl.uniform1f(u.uK, U.K); gl.uniform1f(u.uZeta, U.zeta);
  gl.uniform1f(u.uRamp, U.ramp); gl.uniform1f(u.uStagger, U.stagger); gl.uniform1f(u.uNoise, U.noise);
  gl.uniform1f(u.uNoiseFreq, U.noiseFreq); gl.uniform1f(u.uDrag, U.drag); gl.uniform1f(u.uVmax, U.vmax);
  gl.uniform1f(u.uKick, U.kick); gl.uniform1f(u.uKickR, U.kickR); gl.uniform1f(u.uKickShell, U.kickShell);
  gl.uniform1f(u.uAspect, aspect); gl.uniform1f(u.uColRate, U.colRate);
  gl.uniform2fv(u.uContain, U.contain); gl.uniform3fv(u.uWind, U.wind);
  gl.uniform3fv(u.uKickC, U.kickC); gl.uniform3fv(u.uKickBias, U.kickBias);
  gl.uniform3fv(u.uEye, cam.eye); gl.uniform3fv(u.uCamR, cam.right); gl.uniform3fv(u.uCamU, cam.up); gl.uniform3fv(u.uCamF, cam.fwd);
  gl.uniform4fv(u.uP, U.P); gl.uniform4fv(u.uQ, U.Q); gl.uniform4fv(u.uS, U.S); gl.uniform4fv(u.uT, U.T); gl.uniform4fv(u.uU, U.V); gl.uniform4fv(u.uG, U.G);
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

  simTime += dt;
  if (waitingFont) { sceneT += dt; return; }
  advanceSteps(dt);
}
function tick(dt) {
  updatePointer(dt);
  readScrollSpeed(dt);
  warp.s += (warp.v - warp.s) * (1 - Math.exp(-dt * 8));
  warp.v *= Math.exp(-dt * 4);
  flashE *= Math.exp(-dt * 3.2);
  // particles still in the last scene's shape keep its brightness for a moment instead of jumping to the new shape's level
  R.bright += (R.brightGoal - R.bright) * (1 - Math.exp(-dt * 2.2));
  applyCamGoal();
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
  const bright = R.bright * R.gain * (HDR ? 1 : 0.6) * Math.sqrt((1 - R.trail) / 0.75) * (1 - trailK) / Math.max(1 - R.trail, 1e-3);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
  gl.viewport(0, 0, dst.w, dst.h);

  // comet tails under the points
  gl.useProgram(stP.p);
  const s = stP.u;
  gl.uniformMatrix4fv(s.uVP, false, VP);
  gl.uniform1f(s.uPx, px); gl.uniform1f(s.uFocus, cam.focus);
  gl.uniform1f(s.uBright, bright); gl.uniform1f(s.uTail, R.tail * (1 + 2.2 * warp.s)); gl.uniform1f(s.uGain, 0.3);
  gl.uniform1f(s.uMaxLen, 0.75); gl.uniform1f(s.uVar, R.vari); gl.uniform1f(s.uWhite, R.white);
  // tails stretched by fast scrolling spread the same light over a longer line instead of adding more
  gl.uniform1f(s.uLenK, Math.min(1, R.lenK + 0.35 * warp.s)); gl.uniform1f(s.uShift, R.shift);
  gl.uniform2f(s.uView, dst.w, dst.h); gl.uniform4fv(s.uMask, capRect); gl.uniform1f(s.uMaskA, R.maskA);
  palette(s);
  gl.bindVertexArray(streakVaos[cur]);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);

  gl.useProgram(ptP.p);
  const u = ptP.u;
  gl.uniformMatrix4fv(u.uVP, false, VP);
  gl.uniform1f(u.uFocus, cam.focus);
  gl.uniform1f(u.uPx, px);
  gl.uniform1f(u.uTime, simTime);
  gl.uniform1f(u.uBright, bright);
  gl.uniform1f(u.uWhite, R.white); gl.uniform1f(u.uJitter, R.jitter);
  gl.uniform1f(u.uPulse, R.pulse); gl.uniform1f(u.uPulseT, R.pulseT); gl.uniform1f(u.uPulseGap, R.pulseGap);
  gl.uniform1f(u.uDof, R.dof); gl.uniform1f(u.uVar, R.vari); gl.uniform1f(u.uMaxPx, 26 * dpr); gl.uniform1f(u.uShift, R.shift);
  gl.uniform4fv(u.uMask, capRect); gl.uniform1f(u.uMaskA, R.maskA);
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
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); GEO = null; measureCap(); for (const k in lblW) delete lblW[k]; onScroll(); }, 120); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
canvas.addEventListener('webglcontextrestored', () => location.reload());

/* ------------------------------------------------------------- fonts */
function fontsDone() {
  if (fontsReady) return;
  fontsReady = true;
  rebuildShapes();
  measureCap();
  if (waitingFont) { waitingFont = false; sceneT = 0; enterStep(0, true); }
  warmAll(CAPTURE ? 0 : 300);
}
function loadFonts() {
  const text = 'Kunsang Lee 이건상 30분 min';
  const go = () => {
    if (!document.fonts || !document.fonts.load) { fontsDone(); return; }
    const want = Promise.all([
      document.fonts.load(`800 80px "Pretendard Variable"`, text),
      document.fonts.load(`760 80px "Pretendard Variable"`, text)
    ]);
    Promise.race([want, new Promise(r => setTimeout(r, 2500))]).then(() => document.fonts.ready).then(fontsDone, fontsDone);
  };
  const link = document.getElementById('font-css');
  if (!link) { go(); return; }
  if (link.sheet && link.media === 'all') { go(); return; }
  link.addEventListener('load', () => setTimeout(go, 0), { once: true });
  link.addEventListener('error', fontsDone, { once: true });
  setTimeout(() => { if (!fontsReady) go(); }, 2600);
}

/* ------------------------------------------------------------- language */
/* 언어를 바꾸면 글 칸의 크기와 장면 6의 글자가 바뀐다. 입자를 한 번 흩은 뒤 새 모양으로 다시 모은다 */
addEventListener('fx:lang', () => {
  for (const k in lblW) delete lblW[k];
  rebuildShapes();
  measureCap();
  if (sceneIdx !== GALAXY_I) explode(1.5, [0, 0, 0.6]);
  warmAll(500);
});

/* ------------------------------------------------------------- start */
resize();
const startAt = sceneFromScroll();
sceneIdx = -1;
show(startAt, true);
snapCamera();
if (SCENES[startAt].from) {
  // the first visit starts the camera far off and lets it fly in
  const f = SCENES[startAt].from;
  for (const k of CAMK) { cam[k] = f[k] || 0; cam.vel[k] = 0; }
  buildView();
}
loadFonts();
window.__fxStarted = true;
raf = requestAnimationFrame(loop);

/* ------------------------------------------- hooks for capture and timing */
window.__story = {
  N, get hdr() { return HDR; },
  state: () => ({ scene: sceneIdx, key: SCENES[sceneIdx].key, step: SCENES[sceneIdx].steps[stepIdx].name, t: +sceneT.toFixed(3), fonts: fontsReady, layout, lang: root.lang }),
  step(n = 1) { for (let i = 0; i < n; i++) { tick(1 / 60); draw(1 / 60); } placeLabels(); syncUI(false); return this.state(); },
  show(i, fromPose) {
    show(i, true);
    snapCamera();
    if (fromPose && SCENES[i].from) { const f = SCENES[i].from; for (const k of CAMK) { cam[k] = f[k] || 0; cam.vel[k] = 0; } buildView(); }
    return this.state();
  },
  runTo(t) {
    const frames = Math.max(0, Math.round((t - sceneT) * 60));
    const quiet = Math.max(0, frames - 45);
    for (let i = 0; i < quiet; i++) tick(1 / 60);
    clearTrails();
    for (let i = quiet; i < frames; i++) { tick(1 / 60); draw(1 / 60); }
    placeLabels();
    syncUI(false);
    return this.state();
  },
  warm() { Object.keys(BUILD).forEach(getShape); return cache.size; },
  brights() { const r = {}; for (const k of Object.keys(BUILD)) r[k] = +brightFor(getShape(k)).toFixed(3); return r; },
  geo() { return Object.assign({}, geo()); },
  cityPlan() { const p = crossPlan8(getShape('city')); return { tc: +p.tc.toFixed(3), tr: +p.tr.toFixed(3), arriveB: +p.arriveB.toFixed(3) }; },
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
