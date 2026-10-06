/* 이건상 · 입자 이야기. drafts/F 의 입자 엔진(WebGL2 변환 피드백, 스프링, curl 노이즈, 잔상·블룸)을 바탕으로
   원근 카메라 비행·피사계 심도·혜성 꼬리·워프 터널을 더했다. 스크롤한 위치의 장면을 한 번 연출한 뒤 멈추고,
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
   온도 0 은 점토, 0.5 는 호박, 1 은 크림. 모델이 읽는 말뜻은 어둡고 크고 흐린 점토로, 정책이 보는 사실은
   작고 또렷한 크림에 긴 꼬리로, 사람의 글은 호박으로 둔다. */
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

/* 모드: 0 흩어짐 1 모이기·멈춤 2 기둥 쌓기 3 시계 은하 4 티켓 5 한 점으로 6 피어나기 7 정책 함수 흐름
   8 은하(본문 뒤) 9 워프 터널 10 이중 나선 */
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
uniform int uMode, uLaneN;
uniform float uK, uZeta, uRamp, uStagger, uNoise, uNoiseFreq, uDrag, uVmax, uKick, uKickR, uKickShell, uReset, uAspect, uColRate;
uniform vec2 uContain;
uniform vec3 uWind, uKickC, uKickBias, uEye, uCamR, uCamU, uCamF;
uniform vec4 uP, uQ, uS, uT, uU, uG, uPointer;
uniform vec4 uLanes[24];
uniform mat4 uVP;
out vec4 vPos;
out vec4 vVel;
out vec4 vCol;
${NOISE}
float eInOut(float s){ s = clamp(s, 0.0, 1.0); return s < 0.5 ? 4.0*s*s*s : 1.0 - pow(-2.0*s + 2.0, 3.0) * 0.5; }
float eBack(float s, float c1){ float u = s - 1.0; return 1.0 + (c1 + 1.0)*u*u*u + c1*u*u; }
float eOut(float s){ s = 1.0 - clamp(s, 0.0, 1.0); return 1.0 - s*s*s; }
float sm1(float x){ x = clamp(x, 0.0, 1.0); return x*x*(3.0 - 2.0*x); }
vec2 rot(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a); float s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
vec3 sphereDir(vec2 s){ float z = s.x*2.0 - 1.0; float a = s.y*6.2831853; float r = sqrt(max(0.0, 1.0 - z*z)); return vec3(cos(a)*r, sin(a)*r, z); }
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
// 정책 함수: x = uG.x 에 선 사각 틀. ax = (높이 -1..1, 깊이 -1..1, x 흔들림, 난수)
vec3 gatePt(vec4 ax){
  float y = uG.y + ax.x * uG.z + 0.008 * sin(uTime * 1.6 + ax.w * 37.0);
  return vec3(uG.x + ax.z, y, ax.y * uG.w);
}
// 시계 은하: 원판 좌표(x 오른쪽, y 위, z 법선) → 세계. uP.x 기울기, uP.y 돌림, uQ.xyz 중심
vec3 dialPt(vec3 l){
  float cb = cos(uP.x); float sb = sin(uP.x);
  vec3 w = vec3(l.x, l.y*cb + l.z*sb, -l.y*sb + l.z*cb);
  w.xy = rot(w.xy, uP.y);
  return uQ.xyz + w;
}
vec3 galLocal(vec4 sd, float t, float R, float spin){
  float rr = pow(sd.x, 1.3);
  float r = R * (0.04 + 0.96 * rr);
  float arm = floor(sd.y * 3.0);
  float sp = sd.z - 0.5; sp = sp * sp * sp * 8.0;
  float a = arm * 2.0943951 + rr * 4.4 + sp * (0.35 + 0.65 * rr) - t * spin * (1.3 - 0.7 * rr);
  float h = (sd.w - 0.5) * 0.1 * (1.0 - 0.75 * rr);
  return vec3(cos(a) * r, sin(a) * r, h);
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
// 워프 터널: 카메라 축을 둘러싼 고리들이 앞에서 다가와 카메라 뒤로 지나간다. uU = (속도, 길이, 반지름, 비틀림)
vec3 warpGoal(vec4 sd, float t, out vec3 gv, out float dd){
  float len = uU.y;
  float spd = uU.x;
  float r = uU.z * (0.14 + pow(sd.x, 0.7));
  float th = sd.y * 6.2831853 + t * uU.w;
  dd = fract(sd.z + t * spd / len);
  float depth = len * 0.88 - dd * len;
  vec3 radial = uCamR * cos(th) + uCamU * sin(th);
  gv = -uCamF * spd + (-uCamR * sin(th) + uCamU * cos(th)) * r * uU.w;
  return uEye + uCamF * depth + radial * r;
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

  if (uMode == 0) {                       // free: swirling curl-noise cloud
    acc += nz + cloud(p, uP.w) + uWind;
    if (uQ.w != 0.0) { vec3 r = p - uQ.xyz; acc += vec3(-r.z, 0.0, r.x) * uQ.w / (0.4 + length(r.xz)); }
    v += acc * dt;
    v *= exp(-uDrag * dt);
  } else if (uMode == 1) {                // assemble / hold: spring to target
    float delay = aMeta.w * uStagger + aSeed.x * uP.x;
    float a = sm1((uPhaseT - delay) / uRamp);
    float k = uK * a;
    acc += (tgt - p) * k - v * (2.0 * uZeta * sqrt(k) + uDrag * (1.0 - a)) + nz * (1.0 - 0.9 * a) + cloud(p, 1.5) * (1.0 - a) * uP.y;
    v += acc * dt;
  } else if (uMode == 2) {                // weekly columns: bricks fall in order and land with a bounce
    float cy = aAux.x;
    float td = aAux.y;
    float t = uPhaseT;
    vec3 goal; vec3 gv = vec3(0.0); float k; float z;
    if (aAux2.x > 0.5) {                  // base line, drawn left to right
      float on = step(aAux2.y + 1e-3, uS.w);
      goal = on > 0.5 ? tgt : vec3(tgt.x, tgt.y - 0.3, tgt.z + 0.2);
      brT *= on;
      k = 70.0; z = 0.75;
      acc += nz * 0.25 * (1.0 - on);
    } else if (t < td) {
      goal = vec3(tgt.x + (aSeed.x - 0.5) * 0.5, uS.x + 0.2 + aSeed.y * 0.9, tgt.z + (aSeed.z - 0.5) * 1.1);
      k = 6.0; z = 0.5;
      acc += nz * 0.55;
      brT *= 0.55;
      tw = 0.18;
    } else {
      float tf = t - td;
      float s = tf / uS.y;
      float yb;
      if (s < 1.0) { yb = uS.x + (cy - uS.x) * s * s; gv.y = 2.0 * (cy - uS.x) * s / uS.y; }
      else {
        float tau = tf - uS.y; float e = exp(-tau * 9.0);
        yb = cy + uS.z * e * sin(tau * 26.0);
        gv.y = uS.z * e * (26.0 * cos(tau * 26.0) - 9.0 * sin(tau * 26.0));
        flash = brT * (1.0 + 2.2 * exp(-tau * 6.0));
        wf = 0.8 * exp(-tau * 5.0);
      }
      goal = vec3(tgt.x, yb + tgt.y - cy, tgt.z);
      k = tf < 0.12 ? mix(30.0, 320.0, tf / 0.12) : 320.0; z = 0.85;
    }
    float ra = sm1(uPhaseT / uRamp);
    acc += spring(p, v, goal, gv, k * max(ra, 0.04), z) + nz * 0.6 * (1.0 - ra);
    v += acc * dt;
  } else if (uMode == 3) {                // clock galaxy: a turning disk, a dial, a sweeping hand, a question comet
    float role = aAux2.x;
    float R = uQ.w;
    vec3 goal; vec3 gv = vec3(0.0); float k = 34.0; float z = 0.72;
    if (role < 0.5) {
      goal = dialPt(galLocal(aSeed, uPhaseT, R, uS.x));
      vec3 g0 = dialPt(galLocal(aSeed, uPhaseT - 0.02, R, uS.x));
      gv = (goal - g0) / 0.02;
      float rr = pow(aSeed.x, 1.3);
      float hue = fract(aSeed.w * 7.31 + aSeed.y * 3.17);
      ct = vec2(mix(0.95, hue < 0.45 ? 0.08 : hue < 0.8 ? 0.5 : 0.95, sm1(rr * 2.5)), 0.15 + 0.6 * rr);
      cw = mix(0.75, 0.08, sm1(rr * 3.0));
      tw = 0.35;
      brT = (0.55 + 0.45 * aSeed.w) * (1.0 - 0.35 * rr);
    } else if (role < 1.5) {
      float th = aAux.x;
      goal = dialPt(vec3(sin(th) * aAux.y * R, cos(th) * aAux.y * R, aAux.z));
      k = 90.0; z = 0.8;
      ct = vec2(0.9, 0.0); cw = 0.3; tw = 0.3;
      brT = aAux.w;
      float passed = uS.z - th;
      if (passed > 0.0) { flash = brT * (1.25 + 2.4 * exp(-passed * 2.4)); wf = 0.9 * exp(-passed * 2.0); }
    } else if (role < 2.5) {
      float Th = uP.w;
      vec2 dir = vec2(sin(Th), cos(Th));
      vec2 perp = vec2(dir.y, -dir.x);
      float f = aAux.x;
      goal = dialPt(vec3(dir * (f * R * 0.95) + perp * aAux.y, aAux.z));
      gv = (goal - dialPt(vec3(rot(dir, 0.02 * uS.w) * (f * R * 0.95) + perp * aAux.y, aAux.z))) / 0.02;
      k = 300.0; z = 0.9;
      ct = vec2(1.0, 0.0); cw = 0.55; tw = 1.0;
      brT = 0.5 * uS.y;
    } else {
      ct = vec2(0.5, 0.0); cw = aAux.w > 0.5 ? 0.45 : 0.12; tw = 1.0;
      brT = aAux.w > 0.5 ? 1.15 : 0.9;
      if (uU.w < 0.5) { goal = uT.xyz + aAux.xyz * uT.w; gv = uU.xyz; k = 140.0; z = 0.8; }
      else {
        goal = dialPt(galLocal(aSeed, uPhaseT, R * 0.5, uS.x));
        k = 30.0;
      }
    }
    float ra = sm1(uPhaseT / uRamp);
    acc += spring(p, v, goal, gv, k * max(ra, 0.03), z) + nz * 0.7 * (1.0 - ra);
    v += acc * dt;
  } else if (uMode == 4) {                // ticket: rigid 3D shards, gate, record line, the person's answer
    float role = aAux2.x;
    vec3 goal; float k = 300.0; float z = 0.866;
    if (role < 0.5) {
      vec2 C = aAux.xy; float r = aAux.z;
      vec2 away = C - uQ.xy;
      float dist = length(away);
      vec2 dirv = normalize(away / max(dist, 1e-3) + vec2(-0.8, 0.0));
      float u = uP.x;
      float spd = mix(0.45, 1.0, fract(r * 7.31)) * (0.5 + 0.25 / (dist + 0.25));
      vec3 D = vec3(dirv * spd * u * 0.85, (fract(r * 5.13) - 0.32) * 2.1 * u);
      D.y -= 0.1 * u * u;
      vec3 axis = normalize(vec3(fract(r * 3.7) - 0.5, fract(r * 9.1) - 0.5, fract(r * 1.3) - 0.5) + vec3(0.0, 0.0, 1e-3));
      float ang = (fract(r * 13.7) - 0.5) * 5.2 * u;
      vec3 rel = rotAxis(tgt - vec3(C, 0.0), axis, ang);
      goal = vec3(C, 0.0) + D + rel + vec3(uQ.zw, 0.0);
      goal += vec3(sin(uTime * 1.3 + r * 20.0), cos(uTime * 1.1 + r * 17.0), sin(uTime * 0.9 + r * 11.0)) * 0.04 * uP.z;
      goal.xy += (vec2(fract(r * 3.7), fract(r * 9.1)) - 0.5) * uP.y * 0.016 * sin(uTime * 90.0 + r * 40.0);
      float crossed = sm1((p.x - uG.x) / 0.15) * uS.w;
      ct = mix(aTCol.xy, vec2(1.0, 0.0), crossed);
      cw = mix(cw, 0.62, crossed);
      tw = mix(tw, 1.0, max(crossed, u));
      brT *= mix(1.0, 0.72, uP.z) * (1.0 + 0.4 * crossed);
      flash = brT * (1.0 + 3.0 * uU.x);
      wf = 0.9 * uU.x;
    } else if (role < 1.5) {
      goal = gatePt(aAux);
      k = 120.0; z = 0.8;
      float hit = uU.x * exp(-pow((aAux.x * uG.z + uG.y - uQ.w) / 0.25, 2.0));
      flash = brT * (1.0 + 4.0 * hit + 1.6 * uU.y);
      wf = 0.8 * max(hit, uU.y);
    } else if (role < 2.5) {
      float on = step(aAux2.y + 1e-3, uP.w);
      goal = on > 0.5 ? tgt : aAux.xyz;
      brT *= on;
      k = on > 0.5 ? 220.0 : 60.0;
    } else if (role > 3.5) {
      float on = step(aAux2.y + 1e-3, uS.z);
      goal = on > 0.5 ? tgt : aAux.xyz;
      brT *= on;
      k = on > 0.5 ? 160.0 : 50.0; z = 0.8;
    } else if (aAux2.y < 0.5) {
      float on = step(aAux2.y * 2.0 + 1e-3, uS.y);
      goal = on > 0.5 ? tgt : aAux.xyz;
      brT *= on;
      k = on > 0.5 ? 160.0 : 50.0; z = 0.8;
    } else {
      float s = uS.x;
      vec3 src = aAux.xyz; vec3 dst = uT.xyz;
      vec3 jit = (aSeed.xyz - 0.5) * 0.12;
      if (s <= 0.0) {
        goal = src + jit * 0.8 + vec3(sin(uTime * 2.0 + aSeed.x * 30.0), cos(uTime * 1.7 + aSeed.y * 30.0), 0.0) * 0.02;
        brT *= uS.y; k = 40.0; z = 0.6;
      } else if (s < 1.0) {
        float e = eInOut(s);
        vec3 m = mix(src, dst, e);
        m.y += sin(3.14159 * e) * 0.3;
        m.z += sin(3.14159 * e) * 0.35;
        goal = m + jit * (0.15 + 0.5 * (1.0 - e));
        k = 170.0; z = 0.75;
        tw = 1.0; wf = 0.35;
      } else {
        float tau = max(uPhaseT - uT.w, 0.0);
        goal = dst + normalize(jit + vec3(1e-3)) * (0.15 + tau * 0.6);
        brT *= exp(-tau * 2.5);
        k = 30.0; z = 0.6;
      }
    }
    float ra = sm1(uPhaseT / uRamp);
    acc += spring(p, v, goal, vec3(0.0), k * max(ra, 0.04), z) + nz * 0.6 * (1.0 - ra);
    v += acc * dt;
  } else if (uMode == 5) {                // collapse: vortex into one point
    float a = sm1((uPhaseT - aSeed.x * uStagger) / uRamp);
    vec3 toC = uQ.xyz - p;
    float k = uK * a;
    acc += toC * k - v * (2.0 * uZeta * sqrt(k) + uDrag * (1.0 - a));
    acc.xy += vec2(-toC.y, toC.x) * uP.x;
    acc.xz += vec2(-toC.z, toC.x) * uP.z;
    acc += nz * (1.0 - a);
    v += acc * dt;
    brT *= mix(1.0, uP.y, a);
    wf = uP.w * a;
    tw = 1.0;
  } else if (uMode == 6) {                // bloom: spiral out of the point into the target
    float s = clamp((uPhaseT - aMeta.w * uStagger - aSeed.x * 0.12) / uRamp, 0.0, 1.0);
    float e = eBack(s, 0.9);
    vec3 c = uQ.xyz;
    float phi = uP.x * (1.0 - eOut(s)) * (0.75 + 0.5 * aSeed.y);
    vec2 rel = rot((tgt.xy - c.xy) * e, phi);
    vec3 goal = vec3(c.xy + rel, mix(c.z, tgt.z, e));
    acc += (goal - p) * 320.0 - v * 30.0;
    v += acc * dt;
  } else if (uMode == 7) {                // gate: each message flies in once; meaning is scraped off and settles, facts pass and stack up
    float role = aAux2.x;
    vec3 goal; vec3 gv = vec3(0.0); float k = 150.0; float z = 0.75;
    float a = sm1(uPhaseT / uRamp);
    if (role > 1.5) {
      goal = gatePt(aAux);
      k = 120.0; z = 0.8;
      float hit = 0.0;
      vec2 me = vec2(goal.y, goal.z);
      for (int m = 0; m < 24; m++) {
        if (m >= uLaneN) break;
        vec4 ln = uLanes[m];
        float X = uP.x + max(uPhaseT - ln.z, 0.0) * ln.w;
        float dx = X - uG.x;
        float tm = exp(-dx * dx / 0.03) * step(-0.25, dx) * step(ln.z, uPhaseT);
        vec2 d2 = me - ln.xy;
        hit += tm * exp(-dot(d2, d2) / 0.03);
      }
      flash = brT * (1.0 + 3.2 * min(hit, 1.5));
      wf = 0.85 * min(hit, 1.0);
    } else {
      float spd = aAux.w;
      float t0 = aAux.z;
      float live = step(t0, uPhaseT);
      float X = uP.x + max(uPhaseT - t0, 0.0) * spd;
      vec3 off = tgt;
      float x = X + off.x;
      float gx = uG.x;
      float vis = live * sm1((x - uP.x) / 0.5);
      if (x < gx) {
        goal = vec3(x, aAux.x + off.y, aAux.y + off.z);
        gv = vec3(spd * live, 0.0, 0.0);
      } else if (role < 0.5) {
        // scraped off at the gate: embers fall to the floor beside the gate, spread and cool to a dim bed
        float tau = (x - gx) / spd;
        vec2 rd = vec2(aSeed.y - 0.5, aSeed.z - 0.5);
        float e = clamp(tau / 1.1, 0.0, 1.0);
        float y0 = aAux.x + off.y;
        float yF = uS.x + (0.5 - abs(rd.x)) * 0.07 * (1.0 - 2.0 * abs(rd.y));
        float sp = sm1(tau / 1.4);
        goal = vec3(gx - 0.03 - (0.06 + 0.62 * aSeed.w) * sp,
                    mix(y0, yF, e * e),
                    aAux.y + off.z * (1.0 - e) + rd.y * 0.95 * sp);
        k = 45.0; z = 0.85;
        ct = vec2(mix(0.34, 0.0, sm1(tau / 1.3)), 1.0);
        tw = 0.7;
        vis *= (1.0 + 1.5 * exp(-tau * 5.0)) * mix(1.0, 0.3, sm1(tau / 1.6));
        wf = 0.7 * exp(-tau * 7.0);
      } else {
        // facts pass and slide into their row of the list on the right (aAux2.y row y, aAux2.z row x)
        float tau = (x - gx) / spd;
        float e = sm1(tau / 1.0);
        vec3 pass = vec3(x, aAux.x + off.y, aAux.y + off.z);
        vec3 slot = vec3(aAux2.z + off.x * 0.85, aAux2.y + off.y * 0.85, off.z * 0.3);
        goal = mix(pass, slot, e);
        gv = vec3(spd, 0.0, 0.0) * (1.0 - e);
        k = 170.0; z = 0.8;
        vis *= 1.0 + 0.8 * exp(-tau * 3.0);
        wf = 0.75 * exp(-tau * 4.0);
      }
      brT *= vis;
    }
    k *= max(a, 0.03);
    acc += spring(p, v, goal, gv, k, z) + nz * (1.0 - a);
    v += acc * dt;
  } else if (uMode == 8) {                // galaxy: a turning spiral disk behind the reading sections
    vec3 goal = galaxy(aSeed, uTime);
    acc += spring(p, v, goal, vec3(0.0), uS.x, 0.9) + nz * 0.35;
    v += acc * dt;
    float rr = pow(aSeed.x, 1.35);
    float hue = fract(aSeed.w * 7.31 + aSeed.y * 3.17);
    ct = vec2(hue < 0.45 ? 0.08 : hue < 0.8 ? 0.5 : 0.95, sm1(rr * 1.6) * 0.8);
    cw = 0.55 * (1.0 - sm1(rr * 2.2));
    tw = 0.3;
    brT = (0.55 + 0.45 * aSeed.w) * (1.0 - 0.45 * rr) * uS.y;
  } else if (uMode == 9) {                // warp: the cloud becomes rings that rush past the camera
    vec3 gv; float dd;
    vec3 goal = warpGoal(aSeed, uTime, gv, dd);
    vec3 g0; float dd0;
    warpGoal(aSeed, uTime - dt, g0, dd0);
    float a = sm1(uPhaseT / uRamp);
    if (dd < dd0 && a > 0.98) { p = goal; v = gv; }
    acc += spring(p, v, goal, gv, 70.0 * a + 1.0, 0.85);
    v += acc * dt;
    ct = vec2(mix(ct.x, 0.55, 0.7), 0.0);
    cw = 0.12; tw = 1.0;
    brT = 0.75 + 0.35 * aSeed.w;
  } else if (uMode == 10) {               // double helix: warp rings wind into two strands that turn about one axis
    float role = aAux2.x;
    vec3 base = role > 0.5 ? aAux.xyz : tgt;
    vec3 goal = rotAxis(base, uT.xyz, uT.w);
    if (role > 0.5) goal += uCamR * tgt.x + uCamU * tgt.y - uCamF * tgt.z;
    vec3 gv = cross(uT.xyz, goal) * uS.x;
    float delay = aMeta.w * uStagger + aSeed.x * uP.x;
    float a = sm1((uPhaseT - delay) / uRamp);
    if (uS.y > 0.0) {
      vec3 wv; float dd;
      vec3 wg = warpGoal(aSeed, uTime, wv, dd);
      goal = mix(wg, goal, a);
      gv = mix(wv, gv, a);
      a = 1.0;
    }
    float k = uK * max(a, 0.02);
    acc += spring(p, v, goal, gv, k, uZeta) + nz * (1.0 - 0.85 * a);
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
/* 주별 질문 스레드 수(합 235). 6/8 주부터 9/21 주까지, 마지막 주는 이틀치 */
const WEEKS = [16, 6, 3, 2, 5, 1, 7, 3, 2, 33, 27, 26, 37, 35, 26, 6];

// target position, brightness and colour (temperature, softness, white, tail)
function put(sh, i, x, y, z, b, temp, soft, white, tail) {
  const o = i * 4;
  sh.tgt[o] = x; sh.tgt[o + 1] = y; sh.tgt[o + 2] = z; sh.tgt[o + 3] = b;
  sh.tcol[o] = temp; sh.tcol[o + 1] = soft; sh.tcol[o + 2] = white; sh.tcol[o + 3] = tail;
}
function bounds(xs, ys, n) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]); }
  return { x0, x1, y0, y1 };
}

// 01 · 이름. 큰 이름 아래 작은 한 줄
function nameShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('name');
  const [nA, nB] = split([0.85, 0.15]);
  clearBox();
  const A = drawText('이건상.', tall ? { cy: 0.22, maxW: 1.74, lineH: 0.62 } : { cy: 0.17, maxW: 2.5, lineH: 0.7 });
  const SA = sample(nA, rand);
  clearBox();
  const subY = tall ? 0.22 - A.h / 2 - 0.2 : 0.17 - A.h / 2 - 0.2;
  drawText('백엔드 개발자', tall ? { cy: subY, maxW: 1.3, lineH: 0.15, weight: 700, track: 0.02 } : { cy: subY, maxW: 1.2, lineH: 0.112, weight: 700, track: 0.02 });
  const SB = sample(nB, rand);
  const bA = bounds(SA.x, SA.y, nA);
  for (let i = 0; i < nA; i++) {
    const e = SA.edge[i];
    put(sh, i, SA.x[i], SA.y[i], (rand() - 0.5) * 0.04, (0.62 + 0.38 * SA.a[i]) * (e ? 1.15 : 1), 0.5, 0, e ? 0.42 : 0.1, 0.45);
    sh.meta[i * 4] = e;
    sh.meta[i * 4 + 3] = (SA.x[i] - bA.x0) / (bA.x1 - bA.x0) * 0.75 + rand() * 0.2;
  }
  for (let k = 0; k < nB; k++) {
    const i = nA + k;
    put(sh, i, SB.x[k], SB.y[k], (rand() - 0.5) * 0.01, 0.95, 0.95, 0, 0.88, 0.3);
    sh.meta[i * 4 + 3] = 0.8 + rand() * 0.2;
  }
  sh.area = SA.area + SB.area * 2.2;
  return sh;
}

// 02 · 주별 기둥. 질문 스레드 하나가 벽돌 하나. 벽돌은 넓고 깊은 판이라 위에서 보면 도시처럼 보인다
function weeksShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('weeks');
  const span = tall ? 1.82 : 2.8, x0 = -span / 2, colW = span / 16;
  const base = tall ? -0.92 : -0.62, H = tall ? 1.95 : 1.3;
  const pitch = H / 37, bh = pitch * 0.74, bw = colW * 0.64, bd = colW * 0.6;
  const nLine = Math.round(N * 0.025);
  const bricks = [];
  WEEKS.forEach((n, w) => { for (let k = 0; k < n; k++) bricks.push({ w, k }); });
  const B = bricks.length;
  const per = (N - nLine) / B;
  const fall = 0.42;
  const lx0 = x0 + colW * 0.12, lx1 = x0 + span - colW * 0.12, ly = base - pitch * 0.62;
  let i = 0;
  for (; i < nLine; i++) {
    const u = rand();
    put(sh, i, lx0 + (lx1 - lx0) * u, ly + (rand() - 0.5) * 0.005, (rand() - 0.5) * bd * 0.5, 0.5, 0.95, 0, 0.82, 0.2);
    sh.aux2[i * 4] = 1; sh.aux2[i * 4 + 1] = u;
    sh.meta[i * 4 + 3] = u;
  }
  sh.land = new Float32Array(B);
  bricks.forEach((b, bi) => {
    const end = Math.min(N, nLine + Math.round((bi + 1) * per));
    const cx = x0 + colW * (b.w + 0.5), cy = base + pitch * (b.k + 0.5);
    const td = 0.3 + (bi / B) * 2.6 + rand() * 0.04;
    sh.land[bi] = td + fall;
    const partial = b.w === 15;
    const warm = 0.06 + rand() * 0.1;
    const temp = 0.4 + rand() * 0.2;
    for (; i < end; i++) {
      let ux = rand() * 2 - 1, uy = rand() * 2 - 1, uz = rand() * 2 - 1;
      if (rand() < 0.6) { const ax = (rand() * 3) | 0; if (ax === 0) ux = ux < 0 ? -1 : 1; else if (ax === 1) uy = uy < 0 ? -1 : 1; else uz = uz < 0 ? -1 : 1; }
      const edge = (Math.abs(ux) > 0.92) + (Math.abs(uy) > 0.92) + (Math.abs(uz) > 0.92) >= 2;
      put(sh, i, cx + ux * bw / 2, cy + uy * bh / 2, uz * bd / 2, (partial ? 0.5 : 0.9) * (edge ? 1.25 : 1), temp, 0, edge ? 0.4 : warm, 0.75);
      sh.aux[i * 4] = cy; sh.aux[i * 4 + 1] = td;
      sh.meta[i * 4 + 3] = bi / B;
    }
  });
  sh.cloudY = tall ? 1.25 : 0.82;
  sh.fall = fall;
  sh.bounce = tall ? 0.03 : 0.022;
  sh.area = B * bw * bh * 1.4;
  sh.anchors = {
    w0: [x0 + colW * (tall ? 0 : 0.5), ly - (tall ? 0.13 : 0.085), bd * 0.5],
    w12: [x0 + colW * 12.5, base + pitch * 37 + (tall ? 0.12 : 0.075), 0],
    w15: [x0 + colW * (tall ? 16 : 15.5), ly - (tall ? 0.13 : 0.085), bd * 0.5]
  };
  sh.labelAlign = tall ? { w15: 'right', w0: 'left' } : {};
  return sh;
}

// 03 · 96초. 기울어진 은하가 시계판이 되어 돌고, 바늘이 한 바퀴 돈 뒤 한 점으로 빨려 들어갔다가 숫자로 터져 나온다
const C_GAL = 0, C_TICK = 1, C_HAND = 2, C_COMET = 3;
function clockShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('clock');
  const L = tall
    ? { cy: 0.3, numH: 0.62, maxW: 1.62, R: 0.84, c: [0, 0.3, 0], tilt: 0.78, spin: 0.22, from: [-1.55, 1.2, 0.5], ctrl: [-0.8, 1.15, 0.3] }
    : { cy: 0.1, numH: 0.9, maxW: 2.2, R: 0.9, c: [0, 0.06, 0], tilt: 0.92, spin: 0.3, from: [-2.7, 0.45, 0.6], ctrl: [-1.2, 0.62, 0.35] };
  clearBox();
  const numH = L.numH, unitH = numH * 0.46;
  const d = drawText('96', { cx: -0.2, cy: L.cy, maxW: L.maxW * 0.72, lineH: numH, weight: 820, track: -0.03 });
  drawText('초', { cx: -0.2 + d.w / 2 + 0.06 * numH, cy: L.cy - d.h / 2 + unitH / 2, maxW: 1, lineH: unitH, weight: 760, align: 'left' });
  const SF = sample(N, rand);
  const bF = bounds(SF.x, SF.y, N);
  const shiftX = -(bF.x0 + bF.x1) / 2;
  const [nG, nT, nH] = split([0.67, 0.11, 0.07, 0.15]);
  const nC = N - nG - nT - nH;
  clearBox();
  drawMessage(0, 0, 0.44, 0.15, { lines: 2, fill: 0.22 });
  const SC = sample(nC, rand);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const e = SF.edge[i];
    put(sh, i, SF.x[i] + shiftX, SF.y[i], (rand() - 0.5) * 0.04, (0.62 + 0.38 * SF.a[i]) * (e ? 1.15 : 1), 0.62, 0, e ? 0.5 : 0.16, 0.5);
    sh.meta[o] = e;
    sh.meta[o + 3] = (SF.x[i] - bF.x0) / (bF.x1 - bF.x0) * 0.5 + rand() * 0.25;
    if (i < nG) {
      sh.aux2[o] = C_GAL;
    } else if (i < nG + nT) {
      const k = (rand() * 60) | 0, long = k % 5 === 0;
      sh.aux[o] = k / 60 * Math.PI * 2 + (rand() - 0.5) * 0.008;
      sh.aux[o + 1] = 1.04 - rand() * (long ? 0.11 : 0.05);
      sh.aux[o + 2] = (rand() - 0.5) * 0.012;
      sh.aux[o + 3] = long ? 1.15 : 0.75;
      sh.aux2[o] = C_TICK;
    } else if (i < nG + nT + nH) {
      sh.aux[o] = Math.pow(rand(), 0.7);
      sh.aux[o + 1] = (rand() - 0.5) * 0.014;
      sh.aux[o + 2] = (rand() - 0.5) * 0.01;
      sh.aux2[o] = C_HAND;
    } else {
      const k = i - nG - nT - nH;
      sh.aux[o] = SC.x[k]; sh.aux[o + 1] = SC.y[k]; sh.aux[o + 2] = (rand() - 0.5) * 0.02;
      sh.aux[o + 3] = SC.edge[k];
      sh.aux2[o] = C_COMET;
    }
  }
  sh.L = L;
  sh.area = SF.area;
  sh.anchors = { q: [0, 0, 0] };
  sh.labelAlign = { q: 'left' };
  return sh;
}
// the question's path: from the upper left it curls into the dial centre (world space, scene time t)
function cometAt(L, t) {
  const t0 = 0.25, t1 = 1.75;
  const s = clamp((t - t0) / (t1 - t0), 0, 1);
  const e = s * s * (3 - 2 * s);
  // a quadratic curve from the upper left that bends down into the middle of the disk, staying on screen
  const c = L.c, f = L.from, m = L.ctrl, a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, d = e * e;
  return {
    p: [a * f[0] + b * m[0] + d * c[0], a * f[1] + b * m[1] + d * c[1], a * f[2] + b * m[2] + d * c[2]],
    scale: mix(1, 0.35, e),
    s
  };
}

// 04 · 스레드 하나에 세션 하나. 두 가닥이 꼬인 나선: 한 가닥은 Slack 스레드, 다른 가닥은 세션, 가로대가 둘을 하나씩 잇는다
const H_KIND_RUNG = 0, H_KIND_SESSION = 1, H_KIND_THREAD = 2, H_KIND_OTHER = 3;
function helixShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('helix');
  const Hx = tall
    ? { L: 2.3, r: 0.36, turns: 1.55, K: 10, axis: [0, 1, 0], e1: [1, 0, 0], e2: [0, 0, 1], glyph: 0.15 }
    : { L: 3.1, r: 0.4, turns: 2.1, K: 15, axis: [1, 0, 0], e1: [0, 1, 0], e2: [0, 0, 1], glyph: 0.13 };
  const ax = Hx.axis, e1 = Hx.e1, e2 = Hx.e2;
  const W = (u, a, rr) => {
    const c = Math.cos(a) * rr, s = Math.sin(a) * rr;
    return [ax[0] * u + e1[0] * c + e2[0] * s, ax[1] * u + e1[1] * c + e2[1] * s, ax[2] * u + e1[2] * c + e2[2] * s];
  };
  const [nS, nR, nT, nO] = split([0.2, 0.11, 0.21, 0.2, 0.28]);
  const nD = N - nS - nR - nT - nO;
  const K = Hx.K, L = Hx.L, r = Hx.r;
  const phi = k => Math.PI * 2 * Hx.turns * (k + 0.5) / K;
  const uk = k => -L / 2 + (k + 0.5) / K * L;
  const ord = u => (L / 2 - u) / L;
  const A = [], Bp = [];
  for (let k = 0; k < K; k++) { A.push(W(uk(k), phi(k), r)); Bp.push(W(uk(k), phi(k) + Math.PI, r)); }
  let i = 0;
  // strands
  for (let k = 0; k < nS; k++, i++) {
    const s = rand(), bStrand = k % 2;
    const u = -L / 2 - 0.12 + s * (L + 0.24);
    const a = Math.PI * 2 * Hx.turns * (u + L / 2) / L + (bStrand ? Math.PI : 0);
    const p = W(u, a, r + (rand() - 0.5) * 0.012);
    const fade = sm(Math.min(u + L / 2 + 0.12, L / 2 + 0.12 - u) / 0.3);
    put(sh, i, p[0], p[1], p[2] + (rand() - 0.5) * 0.008, 0.8 * fade, bStrand ? 0.92 : 0.5, 0, 0.3, 0.6);
    sh.meta[i * 4] = H_KIND_OTHER; sh.meta[i * 4 + 3] = ord(u);
  }
  // rungs
  for (let k = 0; k < nR; k++, i++) {
    const q = k % K, e = rand();
    const a0 = A[q], b0 = Bp[q];
    const p = [mix(a0[0], b0[0], e), mix(a0[1], b0[1], e), mix(a0[2], b0[2], e)];
    put(sh, i, p[0] + (rand() - 0.5) * 0.006, p[1] + (rand() - 0.5) * 0.006, p[2] + (rand() - 0.5) * 0.006, 0.42, 0.9, 0, 0.35, 0.4);
    sh.meta[i * 4] = H_KIND_RUNG; sh.meta[i * 4 + 1] = e; sh.meta[i * 4 + 2] = q; sh.meta[i * 4 + 3] = ord(uk(q));
  }
  // thread nodes: a small message (avatar dot, name bar, two lines), always facing the camera
  clearBox();
  const g = Hx.glyph;
  drawMessage(0, 0, g * 1.5, g, { lines: 2, fill: 0.24 });
  const SG = sample(nT, rand);
  for (let k = 0; k < nT; k++, i++) {
    const q = k % K, o = i * 4, c = A[q];
    put(sh, i, SG.x[k], SG.y[k], 0, (0.7 + 0.3 * SG.a[k]) * (SG.edge[k] ? 1.2 : 1), 0.5, 0, SG.edge[k] ? 0.42 : 0.12, 0.45);
    sh.aux[o] = c[0]; sh.aux[o + 1] = c[1]; sh.aux[o + 2] = c[2];
    sh.aux2[o] = 1;
    sh.meta[o] = H_KIND_THREAD; sh.meta[o + 2] = q; sh.meta[o + 3] = ord(uk(q));
  }
  // session orbs: a white core inside a soft halo
  for (let k = 0; k < nO; k++, i++) {
    const q = k % K, o = i * 4, c = Bp[q];
    const core = rand() < 0.45;
    const rr = core ? 0.03 * Math.cbrt(rand()) : 0.05 + rand() * 0.035;
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
    put(sh, i, Math.sin(ph) * Math.cos(th) * rr, Math.sin(ph) * Math.sin(th) * rr, Math.cos(ph) * rr,
      core ? 1.2 : 0.5, core ? 0.95 : 0.35, core ? 0 : 0.7, core ? 0.8 : 0.2, 0.4);
    sh.aux[o] = c[0]; sh.aux[o + 1] = c[1]; sh.aux[o + 2] = c[2];
    sh.aux2[o] = 1;
    sh.meta[o] = H_KIND_SESSION; sh.meta[o + 2] = q; sh.meta[o + 3] = ord(uk(q));
  }
  // dust: a slow, soft cloud around the helix that gives the depth
  for (let k = 0; k < nD; k++, i++) {
    const u = -L / 2 - 0.7 + rand() * (L + 1.4);
    const a = rand() * Math.PI * 2, rr = 0.55 + Math.pow(rand(), 0.6) * 1.3;
    const p = W(u, a, rr);
    put(sh, i, p[0], p[1], p[2], 0.22 + rand() * 0.22, rand() * 0.35, 0.85, 0.05, 0.2);
    sh.meta[i * 4] = H_KIND_OTHER; sh.meta[i * 4 + 3] = ord(u);
  }
  sh.Hx = Hx; sh.A = A; sh.B = Bp;
  sh.area = 0.9;
  sh.anchors = { thread: [0, 0, 0], session: [0, 0, 0] };
  sh.labelAlign = tall ? { thread: 'right', session: 'left' } : { thread: 'right', session: 'right' };
  return sh;
}

// 정책 함수 틀: 사각 테두리는 밝고 막은 옅다
function gateParts(sh, from, to, rand, role) {
  for (let i = from; i < to; i++) {
    const o = i * 4, frame = rand() < 0.6;
    let yf, zf;
    if (frame) {
      if (rand() < 0.5) { yf = rand() < 0.5 ? -1 : 1; zf = rand() * 2 - 1; }
      else { zf = rand() < 0.5 ? -1 : 1; yf = rand() * 2 - 1; }
      yf += (rand() - 0.5) * 0.012; zf += (rand() - 0.5) * 0.012;
    } else {
      yf = rand() * 2 - 1; zf = rand() * 2 - 1;
    }
    sh.aux[o] = yf; sh.aux[o + 1] = zf; sh.aux[o + 2] = (rand() - 0.5) * (frame ? 0.006 : 0.014); sh.aux[o + 3] = rand();
    sh.aux2[o] = role;
    const corner = frame && Math.abs(yf) > 0.97 && Math.abs(zf) > 0.9;
    sh.tgt[o + 3] = frame ? (corner ? 1.5 : 1.0) : 0.16;
    sh.tcol[o] = 0.95; sh.tcol[o + 1] = frame ? 0 : 0.8; sh.tcol[o + 2] = frame ? 0.5 : 0.15; sh.tcol[o + 3] = 0.2;
  }
}

// 05 · 정책 함수. 글이 한 번씩 날아와 틀을 지난다. 본문(말뜻)은 깎여 불티처럼 틀 옆 바닥에 내려앉고,
// 머리(누가·언제)만 지나가 오른쪽에 한 줄씩 쌓인다
function gateShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('gate');
  const G = tall ? { x: -0.3, y: 0.2, h: 0.92, d: 0.48 } : { x: -0.2, y: 0.04, h: 0.64, d: 0.58 };
  const lanes = tall ? [0.95, 0.72, 0.49, 0.26, 0.03, -0.2, -0.43, -0.66] : [0.52, 0.36, 0.2, 0.04, -0.12, -0.28, -0.44];
  const perLane = 3;
  const mw = tall ? 0.42 : 0.38, mh = tall ? 0.12 : 0.105;
  const nGate = Math.round(N * 0.1);
  const M = lanes.length * perLane;
  const per = Math.floor((N - nGate) / M);
  const nFact = Math.round(per * 0.3), nMean = per - nFact;
  // message template: header (avatar, name, time) = facts, body lines = meaning
  clearBox();
  worldSpace();
  const x = -mw / 2, y = -mh / 2;
  sx.fillStyle = '#fff';
  sx.beginPath(); sx.arc(x + mh * 0.32, y + mh * 0.68, mh * 0.2, 0, Math.PI * 2); sx.fill();
  roundRect(x + mh * 0.66, y + mh * 0.74, mw * 0.3, mh * 0.13, mh * 0.065); sx.fill();
  roundRect(x + mh * 0.66 + mw * 0.34, y + mh * 0.75, mw * 0.12, mh * 0.1, mh * 0.05); sx.fill();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  const SFa = sample(nFact * M, rand);
  clearBox();
  worldSpace();
  sx.fillStyle = '#fff';
  roundRect(x + mh * 0.66, y + mh * 0.43, mw - mh * 0.8, mh * 0.12, mh * 0.06); sx.fill();
  roundRect(x + mh * 0.66, y + mh * 0.16, (mw - mh * 0.8) * 0.66, mh * 0.12, mh * 0.06); sx.fill();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  const SMe = sample(nMean * M, rand);
  const start = tall ? -1.75 : -2.3;
  const spd0 = tall ? 0.8 : 1.0;
  // one entry time per message, in a shuffled order; the list on the right fills top-down in that order
  const order = shuffle([...Array(M).keys()], rand);
  const rank = new Int32Array(M);
  order.forEach((m, r) => { rank[m] = r; });
  const listX = tall ? G.x + 0.82 : G.x + 1.02;
  const listTop = tall ? 1.02 : 0.6, listBot = tall ? -0.56 : -0.58;
  const pitch = (listTop - listBot) / (M - 1);
  const laneU = new Float32Array(96);
  let i = 0, fi = 0, mi = 0, m = 0;
  let lastLand = 0;
  for (let l = 0; l < lanes.length; l++) {
    for (let q = 0; q < perLane; q++, m++) {
      const ly = lanes[l], lz = (rand() - 0.5) * (tall ? 0.6 : 0.7);
      const r = rank[m];
      const t0 = 0.3 + r / M * 2.7 + rand() * 0.08;
      const spd = spd0 * (0.92 + rand() * 0.16);
      lastLand = Math.max(lastLand, t0 + (G.x - start + mw / 2) / spd + 1.0);
      laneU[m * 4] = ly; laneU[m * 4 + 1] = lz; laneU[m * 4 + 2] = t0; laneU[m * 4 + 3] = spd;
      const rowY = listTop - r * pitch;
      for (let k = 0; k < per; k++, i++) {
        const o = i * 4, fact = k < nFact;
        const px = fact ? SFa.x[fi] : SMe.x[mi], py = fact ? SFa.y[fi] : SMe.y[mi];
        if (fact) fi++; else mi++;
        if (fact) put(sh, i, px, py, (rand() - 0.5) * 0.015, 1.15, 0.97, 0, 0.55, 1.0);
        else put(sh, i, px, py, (rand() - 0.5) * 0.025, 0.95, 0.16 + rand() * 0.1, 0.75, 0.04, 0.3);
        sh.aux[o] = ly; sh.aux[o + 1] = lz; sh.aux[o + 2] = t0; sh.aux[o + 3] = spd;
        sh.aux2[o] = fact ? 1 : 0; sh.aux2[o + 1] = rowY; sh.aux2[o + 2] = listX;
      }
    }
  }
  gateParts(sh, i, N, rand, 2);
  const floorY = G.y - G.h + 0.03;
  sh.G = G; sh.flow = [start, 0]; sh.lanes = laneU; sh.laneN = m; sh.floor = floorY; sh.done = lastLand;
  sh.area = (SFa.area + SMe.area) * M * 0.35 + 0.05;
  sh.anchors = {
    gate: [G.x, G.y + G.h + (tall ? 0.12 : 0.08), 0],
    meaning: tall ? [G.x - 0.4, floorY - 0.3, 0] : [G.x - 0.14, G.y - G.h * 0.5, G.d],
    facts: [listX - mw * 0.42, listTop + (tall ? 0.13 : 0.09), 0]
  };
  sh.labelAlign = { meaning: tall ? 'center' : 'right', facts: 'left' };
  return sh;
}

// 06 · 초안 먼저. 티켓이 틀에 부딪혀 산산이 흩어진 채 멈춰 있다가, 사람의 답이 닿은 뒤에야 다시 모여 지나간다
const T_ROLE_TICKET = 0, T_ROLE_GATE = 1, T_ROLE_LINE = 2, T_ROLE_HUMAN = 3, T_ROLE_DRAFT = 4;
function ticketShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('ticket');
  const L = tall
    ? { w: 0.52, h: 0.32, G: { x: 0.3, y: 0.02, h: 0.5, d: 0.42 }, start: [-0.5, 0.02], end: [0.63, 0.02], draft: [-0.12, 1.12, 0.96, 0.17], human: [-0.12, 0.86, 0.96, 0.17], line: [0.38, 0.89, -0.3] }
    : { w: 0.66, h: 0.4, G: { x: 0.4, y: 0.02, h: 0.6, d: 0.5 }, start: [-0.58, 0.02], end: [1.04, 0.02], draft: [-1.08, 0.64, 0.56, 0.13], human: [-1.08, 0.44, 0.56, 0.13], line: [0.71, 1.37, -0.33] };
  const [nT, nG, nL, nH] = split([0.6, 0.08, 0.06, 0.13, 0.13]);
  const nD = N - nT - nG - nL - nH;
  const w = L.w, h = L.h;
  // ticket template in local space: body, a perforation with notches, an icon and text lines
  clearBox();
  worldSpace();
  const x = -w / 2, y = -h / 2, perf = x + w * 0.7, rr = h * 0.12;
  sx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(x, y, w, h, rr); sx.fill();
  sx.strokeStyle = '#fff'; sx.lineWidth = 0.01;
  roundRect(x, y, w, h, rr); sx.stroke();
  sx.globalCompositeOperation = 'destination-out';
  sx.beginPath(); sx.arc(perf, y, h * 0.09, 0, Math.PI * 2); sx.fill();
  sx.beginPath(); sx.arc(perf, y + h, h * 0.09, 0, Math.PI * 2); sx.fill();
  sx.globalCompositeOperation = 'source-over';
  sx.fillStyle = '#fff';
  for (let k = 0; k < 7; k++) { const yy = y + h * (0.16 + k * 0.1); sx.fillRect(perf - 0.004, yy, 0.008, h * 0.05); }
  roundRect(x + w * 0.07, y + h * 0.66, h * 0.17, h * 0.17, h * 0.04); sx.fill();
  roundRect(x + w * 0.07 + h * 0.25, y + h * 0.7, w * 0.3, h * 0.08, h * 0.04); sx.fill();
  sx.fillStyle = 'rgba(255,255,255,0.75)';
  roundRect(x + w * 0.07, y + h * 0.43, w * 0.52, h * 0.065, h * 0.03); sx.fill();
  roundRect(x + w * 0.07, y + h * 0.27, w * 0.38, h * 0.065, h * 0.03); sx.fill();
  roundRect(perf + w * 0.06, y + h * 0.62, w * 0.17, h * 0.07, h * 0.035); sx.fill();
  roundRect(perf + w * 0.06, y + h * 0.42, w * 0.12, h * 0.07, h * 0.035); sx.fill();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  const ST = sample(nT, rand);
  // shards: dense around the impact on the right edge
  const IMP = [w / 2, 0];
  const seeds = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI * (0.5 + rand()), r = 0.03 + rand() * 0.16; seeds.push([IMP[0] + Math.cos(a) * r, IMP[1] + Math.sin(a) * r]); }
  for (let gx = 0; gx < 6; gx++) for (let gy = 0; gy < 4; gy++) seeds.push([x + (gx + 0.5) * w / 6 + (rand() - 0.5) * w * 0.1, y + (gy + 0.5) * h / 4 + (rand() - 0.5) * h * 0.16]);
  const owner = new Int32Array(nT);
  const cxs = new Float64Array(seeds.length), cys = new Float64Array(seeds.length), cnt = new Float64Array(seeds.length);
  for (let k = 0; k < nT; k++) {
    let d1 = 1e9, k1 = 0;
    for (let q = 0; q < seeds.length; q++) { const dx = ST.x[k] - seeds[q][0], dy = ST.y[k] - seeds[q][1], dd = dx * dx + dy * dy; if (dd < d1) { d1 = dd; k1 = q; } }
    owner[k] = k1; cxs[k1] += ST.x[k]; cys[k1] += ST.y[k]; cnt[k1]++;
  }
  const shardR = seeds.map(() => rand());
  const thick = tall ? 0.026 : 0.032;
  let i = 0;
  for (let k = 0; k < nT; k++, i++) {
    const o = i * 4, q = owner[k], e = ST.edge[k];
    const face = rand() < 0.5 ? -1 : 1;
    put(sh, i, ST.x[k], ST.y[k], face * thick * (e ? rand() : 1), (0.6 + 0.4 * ST.a[k]) * (e ? 1.2 : 1), 0.66, 0, e ? 0.42 : 0.12, 0.55);
    sh.aux[o] = cxs[q] / Math.max(1, cnt[q]); sh.aux[o + 1] = cys[q] / Math.max(1, cnt[q]); sh.aux[o + 2] = shardR[q];
    sh.aux2[o] = T_ROLE_TICKET;
    sh.meta[o + 3] = (ST.x[k] - x) / w * 0.7 + rand() * 0.3;
  }
  gateParts(sh, i, i + nG, rand, T_ROLE_GATE);
  i += nG;
  // the record line: a short block and a long bar
  const [rx0, rx1, ry] = L.line;
  for (let k = 0; k < nL; k++, i++) {
    const o = i * 4, u = rand();
    const lx = rx0 + (rx1 - rx0) * u;
    const blk = u < 0.08;
    put(sh, i, lx, ry + (rand() - 0.5) * (blk ? 0.04 : 0.012), (rand() - 0.5) * 0.01, blk ? 1.15 : 0.95, 1, 0, 0.55, 0.6);
    sh.aux[o] = L.G.x + 0.02; sh.aux[o + 1] = ry; sh.aux[o + 2] = 0;
    sh.aux2[o] = T_ROLE_LINE; sh.aux2[o + 1] = u;
  }
  // the bot's draft (soft clay), then the person's reply (amber) under it
  const pill = (spec, n, role, temp, soft) => {
    clearBox();
    drawMessage(spec[0], spec[1], spec[2], spec[3], { lines: 1, fill: 0.2 });
    const SP = sample(n, rand);
    const left = spec[0] - spec[2] / 2, av = [left + spec[3] * 0.42, spec[1]];
    for (let k = 0; k < n; k++, i++) {
      const o = i * 4;
      const order = (SP.x[k] - left) / spec[2];
      put(sh, i, SP.x[k], SP.y[k], (rand() - 0.5) * 0.01, (0.62 + 0.4 * SP.a[k]) * (SP.edge[k] ? 1.15 : 1) * (soft ? 1.25 : 1), temp, soft, SP.edge[k] ? (soft ? 0.18 : 0.4) : 0.1, role === T_ROLE_HUMAN ? 0.9 : 0.3);
      sh.aux2[o] = role;
      if (role === T_ROLE_HUMAN && k % 5 < 2) {
        // the travelling part of the reply; waits inside the pill
        sh.aux[o] = SP.x[k]; sh.aux[o + 1] = SP.y[k]; sh.aux[o + 2] = 0;
        sh.aux2[o + 1] = 0.5 + rand() * 0.5;
      } else {
        sh.aux[o] = av[0]; sh.aux[o + 1] = av[1]; sh.aux[o + 2] = 0;
        sh.aux2[o + 1] = role === T_ROLE_HUMAN ? clamp(order, 0, 0.999) * 0.5 : clamp(order, 0, 0.999);
      }
    }
  };
  pill(L.draft, nD, T_ROLE_DRAFT, 0.1, 0.55);
  pill(L.human, nH, T_ROLE_HUMAN, 0.5, 0);
  sh.L = L; sh.IMP = IMP;
  sh.area = ST.area + 0.12;
  const G = L.G;
  sh.anchors = {
    deny: [G.x - (tall ? 0.1 : 0.07), G.y + G.h - 0.02, 0],
    draft: tall ? [L.draft[0] + L.draft[2] / 2 - 0.05, L.draft[1] + L.draft[3] / 2 + 0.1, 0] : [L.draft[0] + L.draft[2] / 2 + 0.06, L.draft[1], 0],
    answer: tall ? [L.human[0] - L.human[2] / 2 + 0.04, L.human[1] - L.human[3] / 2 - 0.1, 0] : [L.human[0] + L.human[2] / 2 + 0.06, L.human[1], 0],
    allow: [G.x + (tall ? 0.06 : 0.07), G.y + G.h - 0.02, 0],
    record: [(rx0 + rx1) / 2, ry - (tall ? 0.13 : 0.085), 0]
  };
  sh.labelAlign = tall ? { answer: 'left', deny: 'right', allow: 'left' } : { draft: 'left', answer: 'left', deny: 'right', allow: 'left' };
  return sh;
}

// 07 · 같이 이야기해요
function helloShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('hello');
  clearBox();
  if (tall) {
    drawText('같이', { cy: 0.62, maxW: 1.0, lineH: 0.34 });
    drawText('이야기해요', { cy: 0.14, maxW: 1.72, lineH: 0.34 });
  } else {
    drawText('같이 이야기해요', { cy: 0.22, maxW: 2.6, lineH: 0.42 });
  }
  const S = sample(N, rand);
  const b = bounds(S.x, S.y, N);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rmax = Math.hypot(b.x1 - cx, b.y1 - cy);
  for (let i = 0; i < N; i++) {
    const e = S.edge[i];
    put(sh, i, S.x[i], S.y[i], (rand() - 0.5) * 0.03, (0.62 + 0.38 * S.a[i]) * (e ? 1.15 : 1), 0.56, 0, e ? 0.45 : 0.12, 0.6);
    sh.meta[i * 4] = e;
    sh.meta[i * 4 + 3] = Math.hypot(S.x[i] - cx, S.y[i] - cy) / rmax * 0.85 + rand() * 0.15;
  }
  sh.center = [cx, cy, 0];
  sh.area = S.area;
  return sh;
}

const BUILD = { name: nameShape, weeks: weeksShape, clock: clockShape, helix: helixShape, gate: gateShape, ticket: ticketShape, hello: helloShape };
const SEEDS = { name: 11, weeks: 23, clock: 37, helix: 41, gate: 53, ticket: 59, hello: 67 };
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

/* -------------------------------------------------------------- director */
const FREE = 0, ASSEMBLE = 1, WEEKS_M = 2, CLOCK_M = 3, TICKET_M = 4, COLLAPSE = 5, BLOOM = 6, GATE_M = 7, GALAXY = 8, WARP = 9, HELIX_M = 10;
const R_PLAIN = 0, R_HELIX = 1;
const U = {
  mode: 0, phaseT: 0, K: 0, zeta: 0.7, ramp: 0.8, stagger: 0, noise: 0, noiseFreq: 0.85, drag: 1.2, vmax: 0,
  kick: 0, kickR: 0, kickShell: 0, colRate: 2.5, laneN: 0, lanes: null,
  contain: new Float32Array(2), wind: new Float32Array(3), kickC: new Float32Array(3), kickBias: new Float32Array(3),
  P: new Float32Array(4), Q: new Float32Array(4), S: new Float32Array(4), T: new Float32Array(4), V: new Float32Array(4), G: new Float32Array(4)
};
const R = {
  mode: 0, jitter: 0, white: 0.04, gain: 1, bright: 1, brightGoal: 1, trail: 0, bloom: 1, exposure: 1, pulse: 0, pulseT: 0, pulseGap: 0.12,
  dim: 1, dof: 0.6, tail: 0.045, vari: 0.1, maskA: 0.6, lenK: 0.55, shift: 0
};
function resetUniforms() {
  U.mode = FREE; U.phaseT = 0; U.K = 0; U.zeta = 0.7; U.ramp = 0.8; U.stagger = 0; U.noise = 0; U.noiseFreq = 0.85;
  U.drag = 1.2; U.vmax = 0; U.kick = 0; U.kickR = 0; U.kickShell = 0; U.colRate = 2.5; U.laneN = 0;
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
function gateU(G) { U.G[0] = G.x; U.G[1] = G.y; U.G[2] = G.h; U.G[3] = G.d; }

/* 폭발: 입자에 한 번 속도를 더하고, 화면을 잠깐 밝히고, 카메라를 흔든다 */
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

const lerp2 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
// ticket choreography in scene time
const TK = { impact: 2.3, shatter: 0.8, draft: 3.4, human: 4.5, pulse: 5.3, arrive: 6.2, rebuild: 1.0, go: 7.45, pass: 1.25, rec: 8.6 };
function ticketOffset(L, t) {
  const appr = [L.G.x - L.w / 2 - 0.015, L.start[1]];
  if (t < 1.55) return L.start;
  if (t < TK.impact) { const u = clamp((t - 1.55) / (TK.impact - 1.55), 0, 1); return lerp2(L.start, appr, u * u * u); }
  if (t < TK.go) return appr;
  return lerp2(appr, L.end, inOut((t - TK.go) / TK.pass));
}
// clock choreography in step time: the hand starts and stops softly but runs almost evenly
const CK = { sweep0: 1.85, sweep1: 3.75, absorb: 1.75 };
function handAngle(t) {
  const s = clamp((t - CK.sweep0) / (CK.sweep1 - CK.sweep0), 0, 1);
  return Math.PI * 2 * (s - 0.6 * Math.sin(2 * Math.PI * s) / (2 * Math.PI));
}
function warpU() {
  U.V[0] = 7.0; U.V[1] = 9.0; U.V[2] = layout === 'tall' ? 1.05 : 1.35; U.V[3] = 0.35;
}
// the helix sways about its own axis by up to half a radian, on scene time so the steps join without a jump
let helixAng = 0;
function helixU() {
  const Hx = curShape.Hx;
  U.T[0] = Hx.axis[0]; U.T[1] = Hx.axis[1]; U.T[2] = Hx.axis[2]; U.T[3] = helixAng;
  U.S[0] = 0.3;
}

/* 장면마다 단계(steps)와 카메라를 둔다. 카메라 함수는 (장면 시간, 단계 이름)을 받아 목표 자리를 돌려주고,
   스프링이 그 자리를 따라간다. 마지막 단계는 끝없이 머문다 */
const SCENES = [
  { key: 'name', story: 3.2, camK: 5, from: { yaw: -0.42, pitch: 0.16, dz: 0.95, roll: 0.22 },
    cam: () => ({}),
    steps: [
      { name: 'chaos', dur: 0.35, gate: () => fontsReady, enter(first) { if (!first) explode(1.6, [0, 0, 0.8]); }, frame() { free(1.5, 0.9); U.Q[3] = 1.1; R.trail = 0.86; R.tail = 0.06; } },
      { name: 'assemble', dur: 1.9, enter() { useShape('name'); }, frame(t, u) { assemble(64, 0.62, 0.62, 0.5, 0.2, 1.2); R.trail = mix(0.86, 0.3, sm(u)); R.tail = mix(0.06, 0.035, u); } },
      { name: 'hold', dur: Infinity, frame() { hold(); R.trail = 0.25; } }
    ] },
  { key: 'weeks', story: 4.4, camK: 3.2,
    cam: t => {
      const u = sm((t - 1.3) / 2.8);
      return { yaw: mix(-0.62, -0.16, u), pitch: mix(0.42, 0.1, u), dz: mix(0.3, 0.04, u), ty: mix(-0.06, 0.02, u) };
    },
    steps: [
      { name: 'burst', dur: 0.45, enter() { useShape('weeks'); explode(1.2, [0, 1.3, 0.5]); }, frame() { free(1.6, 1.2); R.trail = 0.85; } },
      { name: 'drop', dur: Infinity, frame(t) {
          const sh = curShape;
          U.mode = WEEKS_M; U.phaseT = t; U.ramp = 0.6; U.noise = 0.9; U.noiseFreq = 0.9;
          U.S[0] = sh.cloudY; U.S[1] = sh.fall; U.S[2] = sh.bounce; U.S[3] = sm((t - 0.15) / 0.7);
          R.trail = mix(0.8, 0.3, sm((t - 2.6) / 1.2)); R.jitter = 0.0012; R.tail = 0.05; R.white = mix(-0.12, 0.04, sm((t - 2.6) / 1.2));
        } }
    ] },
  { key: 'clock', story: 7.2, camK: 3.6,
    cam: (t, st) => {
      if (st === 'burst' || st === 'spin') return { yaw: 0.1 + 0.06 * t, pitch: 0.14, dz: -0.04, roll: -0.05 };
      if (st === 'implode' || st === 'point') return { yaw: 0.36, pitch: 0.12, dz: -0.32, roll: 0.06 };
      if (st === 'nova') return { yaw: 0.2, pitch: 0.06, dz: 0.12 };
      return {};
    },
    steps: [
      { name: 'burst', dur: 0.35, enter() { useShape('clock'); explode(1.0); }, frame() { free(1.6, 1.2); R.trail = 0.8; } },
      { name: 'spin', dur: 4.1, frame(t) {
          const sh = curShape, L = sh.L;
          U.mode = CLOCK_M; U.phaseT = t; U.ramp = 0.6; U.noise = 0.6;
          U.P[0] = L.tilt; U.P[1] = -0.36; U.Q[0] = L.c[0]; U.Q[1] = L.c[1]; U.Q[2] = L.c[2]; U.Q[3] = L.R;
          U.S[0] = L.spin;
          const Th = handAngle(t), Th2 = handAngle(t + 0.02);
          U.P[3] = Th; U.S[2] = Th; U.S[3] = (Th2 - Th) / 0.02;
          U.S[1] = sm((t - 1.5) / 0.35);
          const c0 = cometAt(L, t), c1 = cometAt(L, t + 0.02);
          U.T[0] = c0.p[0]; U.T[1] = c0.p[1]; U.T[2] = c0.p[2]; U.T[3] = c0.scale;
          U.V[0] = (c1.p[0] - c0.p[0]) / 0.02; U.V[1] = (c1.p[1] - c0.p[1]) / 0.02; U.V[2] = (c1.p[2] - c0.p[2]) / 0.02;
          U.V[3] = t > CK.absorb ? 1 : 0;
          U.colRate = 3.0;
          R.trail = t > CK.sweep0 - 0.2 && t < CK.sweep1 + 0.3 ? 0.68 : 0.8; R.tail = 0.06; R.jitter = 0.001;
          R.bloom = 1 + 0.5 * sm((t - 3.2) / 0.6);
        } },
      { name: 'implode', dur: 0.95, frame(t, u) {
          const c = curShape.L.c;
          U.mode = COLLAPSE; U.phaseT = t; U.K = 30; U.zeta = 0.5; U.ramp = 0.55; U.stagger = 0.3; U.drag = 1.0; U.noise = 0.8;
          U.P[0] = 11 * (1 - 0.5 * u); U.P[1] = 0.1; U.P[2] = 3; U.P[3] = 0.22; U.Q[0] = c[0]; U.Q[1] = c[1]; U.Q[2] = c[2];
          R.trail = 0.86; R.white = mix(-0.22, 0.04, u); R.bloom = 1.5 + u; R.tail = 0.07; R.lenK = 0.9; R.shift = 0.32;
        } },
      { name: 'point', dur: 0.3, frame(t) {
          const c = curShape.L.c;
          U.mode = COLLAPSE; U.phaseT = 99; U.K = 240; U.zeta = 0.9; U.ramp = 1; U.drag = 0; U.P[1] = 0.1; U.P[3] = 0.55; U.Q[0] = c[0]; U.Q[1] = c[1]; U.Q[2] = c[2];
          R.trail = 0.6; R.gain = 1 + 0.35 * sm(t / 0.3); R.bloom = 2.6; R.white = 0.7;
        } },
      { name: 'nova', dur: 0.5, enter() { explode(3.3, [0, 0, 0.7], curShape.L.c, 0, 1, 0.6); }, frame() {
          free(0.5, 0.3); U.contain[1] = 0.4; U.P[3] = 0.4; U.colRate = 6; R.trail = 0.9; R.tail = 0.075; R.white = -0.12; R.bloom = 1.4; R.shift = 0.3;
        } },
      { name: 'assemble', dur: 2.1, frame(t, u) { assemble(70, 0.6, 0.8, 0.55, 0.22, 0.8); R.trail = mix(0.88, 0.3, sm(u)); R.tail = mix(0.07, 0.035, u); } },
      { name: 'hold', dur: Infinity, frame() { hold(); R.trail = 0.25; } }
    ] },
  { key: 'helix', story: 5.0, camK: 3.2,
    cam: (t, st) => {
      if (st === 'warp') return { dz: -0.08 };
      const u = sm((t - 1.6) / 2.6);
      if (layout === 'tall') return { yaw: mix(0, 0.34, u), pitch: mix(0, -0.08, u) + 0.03 * Math.sin(t * 0.3) * u, dz: mix(-0.08, 0.02, u) };
      return { yaw: mix(0, 0.36, u) + 0.04 * Math.sin(t * 0.28) * u, pitch: mix(0, 0.2, u), dz: mix(-0.08, 0.06, u) };
    },
    steps: [
      { name: 'warp', dur: 1.5, enter() { useShape('helix'); explode(0.8, [0, 0, 1.6], undefined, 0, 0, 0.3); }, frame(t) {
          U.mode = WARP; U.phaseT = t; U.ramp = 0.45; warpU();
          R.trail = 0.9; R.tail = 0.06; R.bloom = 1.5; R.dof = 0.9; R.white = -0.15; R.shift = 0.25;
        } },
      { name: 'wind', dur: 2.5, frame(t) {
          U.mode = HELIX_M; helixU(); U.S[1] = 1; U.V[0] = 7.0; U.V[1] = 9.0; U.V[2] = layout === 'tall' ? 1.05 : 1.35; U.V[3] = 0.35;
          U.K = 90; U.zeta = 0.8; U.ramp = 0.9; U.stagger = 1.05; U.P[0] = 0.25; U.noise = 0.3;
          R.trail = mix(0.9, 0.4, sm(t / 2.2)); R.tail = mix(0.06, 0.04, sm(t / 2.2)); R.bloom = mix(1.5, 1, sm(t / 2));
        } },
      { name: 'turn', dur: Infinity, frame(t) {
          U.mode = HELIX_M; helixU(); U.phaseT = 99; U.K = 90; U.zeta = 0.8; U.ramp = 1; U.noise = 0.1;
          R.mode = R_HELIX; R.pulse = 1; R.pulseT = t; R.pulseGap = 0.13;
          R.trail = 0.35; R.jitter = 0.0012;
        } }
    ] },
  { key: 'gate', story: 4.4, camK: 2.6,
    cam: t => {
      const u = sm(t / 3.2);
      if (layout === 'tall') return { yaw: mix(0.62, 0.3, u) + 0.04 * Math.sin(t * 0.35) * u, pitch: mix(0.2, 0.08, u), dz: mix(-0.02, 0.03, u) };
      return { yaw: mix(0.82, 0.42, u) + 0.05 * Math.sin(t * 0.35) * u, pitch: mix(0.26, 0.1, u), dz: mix(-0.06, 0.02, u), ty: 0.02 };
    },
    steps: [
      { name: 'scatter', dur: 0.4, enter() { useShape('gate'); explode(1.2); }, frame() { free(1.6, 1.2); R.trail = 0.8; } },
      { name: 'flow', dur: Infinity, frame(t) {
          const sh = curShape;
          U.mode = GATE_M; U.phaseT = t; U.ramp = 1.3; U.noise = 0.55; U.noiseFreq = 1.1;
          U.P[0] = sh.flow[0]; U.P[1] = sh.flow[1];
          U.lanes = sh.lanes; U.laneN = sh.laneN;
          gateU(sh.G);
          U.colRate = 4.0;
          R.trail = mix(0.8, 0.55, sm(t / 1.5)); R.jitter = 0.001; R.tail = 0.06; R.vari = 0.06;
        } }
    ] },
  { key: 'ticket', story: 9.4, camK: 3,
    cam: t => {
      const hit = t > TK.impact && t < TK.arrive ? sm((t - TK.impact) / 0.3) * (1 - sm((t - TK.human) / 1.2)) : 0;
      return { yaw: mix(0.26, 0.08, sm(t / 9)), pitch: 0.07, dz: 0.02 - 0.12 * hit, ty: 0.02 };
    },
    steps: [
      { name: 'run', dur: Infinity, enter() { useShape('ticket'); explode(0.9); }, frame(t, u, prev) {
          const sh = curShape, L = sh.L;
          U.mode = TICKET_M; U.phaseT = t; U.ramp = 0.9; U.noise = 0.5;
          gateU(L.G);
          const off = ticketOffset(L, t);
          U.Q[0] = sh.IMP[0]; U.Q[1] = sh.IMP[1]; U.Q[2] = off[0]; U.Q[3] = off[1];
          let s = 0;
          if (t >= TK.impact && t < TK.arrive) s = outCubic((t - TK.impact) / TK.shatter);
          else if (t >= TK.arrive) s = 1 - outBack((t - TK.arrive) / TK.rebuild, 1.4);
          U.P[0] = s;
          U.P[1] = t >= TK.impact ? Math.exp(-(t - TK.impact) * 9) * (t - TK.impact < 0.35 ? 1 : 0) : (t > TK.impact - 0.25 ? 0.4 : 0);
          U.P[2] = sm((t - TK.impact - 0.5) / 0.6) * (1 - sm((t - TK.arrive) / 0.3));
          U.P[3] = sm((t - TK.rec) / 0.7);
          U.S[0] = t < TK.pulse ? -1 : (t - TK.pulse) / (TK.arrive - TK.pulse);
          U.S[1] = sm((t - TK.human) / 0.5);
          U.S[2] = sm((t - TK.draft) / 0.5);
          U.S[3] = t > TK.go - 0.2 ? 1 : 0;
          const appr = [L.G.x - L.w / 2 - 0.015, L.start[1]];
          U.T[0] = appr[0] - (layout === 'tall' ? 0.16 : 0.24); U.T[1] = appr[1]; U.T[2] = 0; U.T[3] = TK.arrive;
          U.V[0] = t >= TK.impact ? Math.exp(-(t - TK.impact) * 5) : 0;
          U.V[1] = t >= TK.go + 0.25 ? Math.exp(-(t - TK.go - 0.25) * 4) : 0;
          U.colRate = 3.2;
          R.trail = t < 0.8 ? 0.8 : (t > TK.impact && t < TK.impact + 0.9) || (t > TK.pulse && t < TK.arrive + 0.6) || (t > TK.go && t < TK.go + 1) ? 0.7 : 0.4;
          R.jitter = 0.0014; R.tail = 0.055;
          if (prev < TK.impact && t >= TK.impact) { flashE = Math.max(flashE, 0.85); shake(0.7); }
          if (prev < TK.go + 0.25 && t >= TK.go + 0.25) flashE = Math.max(flashE, 0.4);
          if (t > TK.impact && t < TK.impact + 0.2) R.white = 0.04 + 0.5 * (1 - (t - TK.impact) / 0.2);
        } }
    ] },
  { key: 'hello', story: 5.4, camK: 3.4,
    cam: (t, st) => {
      if (st === 'collapse' || st === 'point') return { dz: 0.14, roll: 0.07, yaw: -0.14 };
      if (st === 'nova') return { dz: 0.1, yaw: -0.05 };
      return {};
    },
    steps: [
      { name: 'collapse', dur: 1.2, enter() { useShape('hello'); }, frame(t, u) {
          const c = curShape.center;
          U.mode = COLLAPSE; U.phaseT = t; U.K = 28; U.zeta = 0.55; U.ramp = 0.65; U.stagger = 0.3; U.drag = 1.0; U.noise = 1.0; U.noiseFreq = 2.8;
          U.P[0] = 11 * sm(t / 0.35) * (1 - sm(u)); U.P[1] = 0.08; U.P[2] = 2.5; U.P[3] = 0.22; U.Q[0] = c[0]; U.Q[1] = c[1]; U.Q[2] = c[2];
          // the dense record card must not flare when the afterimage gets longer, so trail and bloom come in slowly and the gain offsets the longer trail
          const a = sm(t / 0.7);
          R.trail = mix(0.4, 0.86, a); R.bloom = mix(1.0, 1.4 + u, a); R.gain = mix(Math.sqrt((1 - R.trail) / 0.6), 1, sm((u - 0.45) / 0.55));
          R.white = mix(-0.22, 0.04, u); R.tail = 0.07; R.lenK = 0.9; R.shift = 0.32;
          R.maskA = 1;
        } },
      { name: 'point', dur: 0.45, frame(t) {
          const c = curShape.center;
          U.mode = COLLAPSE; U.phaseT = 99; U.K = 240; U.zeta = 0.9; U.ramp = 1; U.drag = 0; U.P[1] = 0.08; U.P[3] = 0.55; U.Q[0] = c[0]; U.Q[1] = c[1]; U.Q[2] = c[2];
          R.trail = 0.6; R.gain = 1 + 0.35 * sm(t / 0.45); R.bloom = 2.8; R.white = 0.7;
          R.maskA = 1;
        } },
      { name: 'nova', dur: 0.55, enter() { explode(3.4, [0, 0, 0.75], curShape.center, 0, 1, 0.6); }, frame() {
          free(0.5, 0.3); U.contain[1] = 0.4; U.P[3] = 0.4; U.colRate = 6; R.trail = 0.9; R.tail = 0.08; R.white = -0.12; R.bloom = 1.4; R.shift = 0.3;
          R.maskA = 1;
        } },
      { name: 'assemble', dur: 2.3, frame(t, u) {
          assemble(64, 0.62, 0.85, 0.7, 0.22, 0.8); R.trail = mix(0.88, 0.3, sm(u)); R.tail = mix(0.08, 0.035, u);
          R.maskA = 1 - 0.4 * sm((u - 0.5) / 0.5);
        } },
      { name: 'hold', dur: Infinity, frame() { hold(); R.trail = 0.25; } }
    ] },
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
  if (sc.key === 'helix') helixAng = 0.5 * Math.sin(sceneT * 0.3);
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
// rotate v about the unit axis k by angle a (same as rotAxis in the shader)
function rotVec(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cx = k[1] * v[2] - k[2] * v[1], cy = k[2] * v[0] - k[0] * v[2], cz = k[0] * v[1] - k[1] * v[0];
  return [v[0] * c + cx * s + k[0] * d * (1 - c), v[1] * c + cy * s + k[1] * d * (1 - c), v[2] * c + cz * s + k[2] * d * (1 - c)];
}

/* ------------------------------------------------------- scroll and UI */
const sections = [...document.querySelectorAll('.scene')];
const caps = sections.map(s => s.querySelector('.cap'));
const afterEl = document.querySelector('.after');
const navBtns = [...document.querySelectorAll('#tabs button')];
const bars = navBtns.map(b => b.querySelector('.bar i'));
const curEl = document.getElementById('cur');
const n235 = document.getElementById('n235');
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
function needsFont(i) { return i === 0 || i === 2 || i === 6; }
// the caption box of the scene in NDC (centre and half size, with a margin); particles fade inside it
const capRect = new Float32Array([0, -0.8, 0.5, 0.12]);
function measureCap() {
  const c = caps[Math.min(sceneIdx, caps.length - 1)];
  if (!c || sceneIdx === GALAXY_I) { capRect[1] = -3; return; }
  const r = c.getBoundingClientRect();
  if (!r.height) return;
  const mx = Math.min(70, innerWidth * 0.06), my = 26;
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
  if (SCENES[i].key === 'helix') helixAng = 0;
  waitingFont = !fontsReady && needsFont(i) && i !== 0;
  if (waitingFont) { stepIdx = 0; stepT = 0; } else enterStep(0, first);
  applyCamGoal();
  root.classList.toggle('in-sec', i === GALAXY_I);
  root.classList.toggle('at0', i === 0);
  caps.forEach((c2, k) => c2 && c2.classList.toggle('on', k === i));
  measureCap();
  if (n235) n235.textContent = i === 1 ? '0' : '235';
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
    if (curEl) curEl.textContent = String(i + 1).padStart(2, '0');
  }
  const prog = sceneIdx === GALAXY_I ? 1 : clamp(sceneT / SCENES[sceneIdx].story, 0, 1);
  bars.forEach((b, k) => {
    const v = k === i ? prog.toFixed(3) : k < i ? '1' : '0';
    if (barVal[k] !== v) { barVal[k] = v; b.style.transform = `scaleX(${v})`; }
  });
}

/* 이름표: 장면의 기준점을 화면 좌표로 옮겨 붙인다 */
const stepName = () => SCENES[sceneIdx].steps[stepIdx].name;
const LABELS = {
  weeks: sh => {
    const t = sceneT - 0.45;
    let end12 = 0;
    for (let k = 0, c = 0; k < WEEKS.length; k++) { c += WEEKS[k]; if (k === 12) { end12 = sh.land[c - 1]; break; } }
    return { w0: t > 0.8, w15: t > 0.8, w12: t > end12 + 0.3 };
  },
  clock: sh => {
    let on = stepName() === 'spin' && stepT > 0.45 && stepT < 1.55;
    if (on) {
      const c = cometAt(sh.L, stepT);
      sh.anchors.q = [c.p[0] + 0.3 * c.scale + 0.04, c.p[1] + 0.05, c.p[2]];
      // only while the comet itself is on screen and below the name block
      const p = project(c.p[0], c.p[1], c.p[2]);
      on = !!p && p[0] > 30 && p[0] < innerWidth - 120 && p[1] > 130 && p[1] < innerHeight - 140;
    }
    return { q: on };
  },
  helix: sh => {
    const Hx = sh.Hx, tall = layout === 'tall', q = tall ? Hx.K - 1 : 0;
    const a = rotVec(sh.A[q], Hx.axis, helixAng), b = rotVec(sh.B[q], Hx.axis, helixAng);
    // the thread glyphs face the camera, so the label sits beside them along the camera's right axis
    const cr = cam.right, off = (p, d) => [p[0] + cr[0] * d, p[1] + cr[1] * d, p[2] + cr[2] * d];
    if (tall) { sh.anchors.thread = off(a, -0.15); sh.anchors.session = off(b, 0.12); }
    else { sh.anchors.thread = off(a, -0.17); sh.anchors.session = off(b, -0.12); }
    const on = stepName() === 'turn';
    return { thread: on && stepT > 0.2, session: on && stepT > 0.5 };
  },
  gate: sh => {
    const t = stepName() === 'flow' ? stepT : -1;
    return { gate: t > 0.5, meaning: t > 2.2, facts: t > 1.9 };
  },
  ticket: () => {
    const t = sceneT;
    return { deny: t > TK.impact + 0.05 && t < TK.arrive + 0.2, draft: t > TK.draft + 0.25, answer: t > TK.human + 0.25, allow: t > TK.go + 0.55, record: t > TK.rec + 0.35 };
  }
};
function setLabel(k, on) {
  if (lblOn[k] === on) return;
  lblOn[k] = on;
  lblEls[k].classList.toggle('on', on);
}
function placeLabels() {
  const sc = SCENES[sceneIdx];
  const fn = LABELS[sc.key];
  if (!fn || !curShape || curShape.key !== sc.key || waitingFont) return;
  const want = fn(curShape);
  const align = curShape.labelAlign || {};
  for (const k in want) {
    const el = lblEls[k], a = curShape.anchors[k];
    if (!el || !a) continue;
    if (want[k] || lblOn[k]) {
      const p = project(a[0], a[1], a[2]);
      if (p) {
        // keep the whole label inside the screen
        if (!lblW[k]) lblW[k] = el.offsetWidth;
        const w = lblW[k], m = 10, al = align[k];
        const lo = al === 'left' ? m : al === 'right' ? w + m : w / 2 + m;
        const hi = al === 'left' ? innerWidth - w - m : al === 'right' ? innerWidth - m : innerWidth - w / 2 - m;
        const x = clamp(p[0], lo, Math.max(lo, hi)), y = clamp(p[1], 60, innerHeight - 90);
        const tx = al === 'left' ? '0' : al === 'right' ? '-100%' : '-50%';
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(${tx},-50%)`;
      }
    }
    setLabel(k, !!want[k]);
  }
  if (sc.key === 'weeks' && n235) {
    const t = sceneT - 0.45;
    let c = 0;
    for (let k = 0; k < curShape.land.length; k++) if (curShape.land[k] <= t) c++;
    const s = String(c);
    if (n235.textContent !== s) n235.textContent = s;
  }
}

/* --------------------------------------------------------------- pointer */
const pointer = { x: 0, y: 0, active: false, down: false, s: 0, r: 0.18, downAt: 0, dx: 0, dy: 0 };
const pointerU = new Float32Array(4);
function stageOn() { return sceneIdx !== GALAXY_I; }
function setPointer(e) { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = 1 - e.clientY / innerHeight * 2; }
function onUI(e) { return !!(e.target && e.target.closest && e.target.closest('a,button,input,label,summary,select,textarea,.top,.tabs,.after,footer')); }
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
  if (sc.key === 'gate' && curShape && curShape.key === 'gate') U.S[0] = curShape.floor;
  if (sc.key === 'helix') U.S[0] = 0.3 * 0.5 * Math.cos(sceneT * 0.3);
  if (pendingKick) {
    U.kick = pendingKick.mag; U.kickBias.set(pendingKick.bias); U.kickC.set(pendingKick.at); U.kickR = pendingKick.radius; U.kickShell = pendingKick.shell;
    pendingKick = null;
  }
  const u = simP.u;
  gl.useProgram(simP.p);
  gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, simTime); gl.uniform1f(u.uPhaseT, U.phaseT);
  gl.uniform1i(u.uMode, U.mode); gl.uniform1i(u.uLaneN, U.laneN);
  gl.uniform1f(u.uK, U.K); gl.uniform1f(u.uZeta, U.zeta);
  gl.uniform1f(u.uRamp, U.ramp); gl.uniform1f(u.uStagger, U.stagger); gl.uniform1f(u.uNoise, U.noise);
  gl.uniform1f(u.uNoiseFreq, U.noiseFreq); gl.uniform1f(u.uDrag, U.drag); gl.uniform1f(u.uVmax, U.vmax);
  gl.uniform1f(u.uKick, U.kick); gl.uniform1f(u.uKickR, U.kickR); gl.uniform1f(u.uKickShell, U.kickShell);
  gl.uniform1f(u.uAspect, aspect); gl.uniform1f(u.uColRate, U.colRate);
  gl.uniform2fv(u.uContain, U.contain); gl.uniform3fv(u.uWind, U.wind);
  gl.uniform3fv(u.uKickC, U.kickC); gl.uniform3fv(u.uKickBias, U.kickBias);
  gl.uniform3fv(u.uEye, cam.eye); gl.uniform3fv(u.uCamR, cam.right); gl.uniform3fv(u.uCamU, cam.up); gl.uniform3fv(u.uCamF, cam.fwd);
  gl.uniform4fv(u.uP, U.P); gl.uniform4fv(u.uQ, U.Q); gl.uniform4fv(u.uS, U.S); gl.uniform4fv(u.uT, U.T); gl.uniform4fv(u.uU, U.V); gl.uniform4fv(u.uG, U.G);
  if (U.laneN && U.lanes && u.uLanes) gl.uniform4fv(u.uLanes, U.lanes);
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
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); measureCap(); for (const k in lblW) delete lblW[k]; onScroll(); }, 120); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
canvas.addEventListener('webglcontextrestored', () => location.reload());

/* ------------------------------------------------------------- fonts */
function fontsDone() {
  if (fontsReady) return;
  fontsReady = true;
  ['name', 'clock', 'hello'].forEach(k => cache.delete(k));
  if (waitingFont) { waitingFont = false; sceneT = 0; enterStep(0, true); }
  warmAll(CAPTURE ? 0 : 300);
}
function loadFonts() {
  const text = '이건상.백엔드 개발자96초같이 이야기해요';
  const go = () => {
    if (!document.fonts || !document.fonts.load) { fontsDone(); return; }
    const want = Promise.all([
      document.fonts.load(`800 80px "Pretendard Variable"`, text),
      document.fonts.load(`700 80px "Pretendard Variable"`, text)
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
  state: () => ({ scene: sceneIdx, key: SCENES[sceneIdx].key, step: SCENES[sceneIdx].steps[stepIdx].name, t: +sceneT.toFixed(3), fonts: fontsReady, layout }),
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
