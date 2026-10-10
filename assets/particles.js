/* Kunsang Lee · 입자 이야기. drafts/F 의 입자 엔진(WebGL2 변환 피드백, 스프링, curl 노이즈, 잔상·블룸)을 바탕으로
   원근 카메라·피사계 심도·혜성 꼬리를 더했다. 장면 2~7 은 스토리보드의 사물(얼굴·말풍선·아이콘·방패·조각)을 입자로 짓고,
   입자로 읽히지 않는 작은 표시(이목구비·말풍선 속 줄·글리프)는 그 위 선명한 층(#ov)에 그린다. 장면 진행은 스크롤 위치에 묶여 있다.
   맨 위에서 열고 손대지 않으면 페이지를 한 번 저절로 장면 8 까지 내리고, 사용자가 스크롤하려는 입력을 하면 그 자리에서 손에 넘긴다. */
(() => {
'use strict';

/* ------------------------------------------------------------------ setup */
const qs = new URLSearchParams(location.search);
const CAPTURE = qs.has('capture');
const SHOW_FPS = qs.has('fps');
// ?dpr=1 이나 ?dpr=2 는 그림 해상도를 그 배율로 고정한다(화질 문제 재현용). 고정하면 느려도 낮추지 않는다
const DPR_FIX = qs.has('dpr') ? Math.min(3, Math.max(0.5, +qs.get('dpr') || 1)) : 0;
const root = document.documentElement;
if (!root.classList.contains('fx')) return;
// prefers-reduced-motion: every scene shows its last frame as a still picture
const STILL = root.classList.contains('still');
const SMALL = Math.min(innerWidth, innerHeight) < 560 || matchMedia('(pointer: coarse)').matches;
/* 입자 수. N 은 버퍼에 담는 전체 입자, N0 은 4차까지의 입자 수다. 01·08 의 이름, 본문 뒤 은하, 에이전트, 장면 뒤 먼지는 N0 을 기준으로 두어
   전과 같고, 장면 02~07 은 N0 위에 더한 입자를 사물에 나눠 01 이름 글자만큼 촘촘하게 채운다. 어느 그림에도 쓰지 않는 입자는 빛을 끄고 그리지 않는다.
   넓은 화면은 8만 개를 더해 07 처럼 사물이 많은 장면도 이름 밀도의 약 0.8배로 채운다. 좁은 화면(휴대폰)은 GPU 가 약하므로
   화면 넓이로 치면 2만 개를 더할 자리에 1.6만 개만 더하고, 그만큼 덜 채운다 */
const N = Math.max(8000, Math.min(160000, +(qs.get('n') || (SMALL ? 48000 : 120000))));
const N0 = Math.min(SMALL ? 32000 : 40000, N);

const canvas = document.getElementById('gl');
let gl = null;
try {
  gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false,
    preserveDrawingBuffer: CAPTURE, powerPreference: 'high-performance'
  });
} catch { gl = null; }
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

/* 모드: 0 흩어짐 1 모이기·멈춤(이름) 2 장면 그림 8 은하(본문 뒤) 10 연락.
   0번부터 PB 개는 늘 에이전트(역할 20). 장면 2~7 의 나머지 입자는 사물 하나에 붙고(역할 1),
   먼지는 29, 쓰지 않는 입자는 30. 사물 k 는 uArr[4k..4k+3] 을 읽는다:
   (자리 xyz, 크기) · (보임, 두 모양 사이, 빛, 점토색) · (조각 1 의 점토색, 시야 밖 바닥 밝기, 흰빛, 그려진 몫) · (이번 걸음의 자리 속도, 입자를 그만큼 실어 나른다, 날아가며 모양이 바뀌는 동안 더할 스프링 세기).
   aAux2.z 는 사물마다 입자가 제자리에서 떠도는 폭(CSS px)이다.
   uPhaseT 는 스크롤에 묶인 장면 진행 시간, uRT 는 장면에 들어온 뒤 흐른 실제 시간(입자가 모이는 속도에만 쓴다) */
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
uniform vec4 uP, uQ, uS, uT, uU, uPointer, uAg, uAgV;
uniform vec4 uSight;
uniform vec4 uLive;   // (world units per CSS px, how much the picture wanders, how fast the agent swirls, dust light against the scene's brightness)
uniform vec4 uArr[160];
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
// a particle's slow wander around its place, up to amp CSS px across the screen. Each particle keeps its own two rates,
// so a shape that stands still keeps moving inside while its outline stays where it is
vec3 wander(float amp){
  float a = uTime * (1.3 + 1.9 * aSeed.y) + aSeed.x * 6.2832;
  float b = uTime * (1.1 + 2.1 * aSeed.w) + aSeed.z * 6.2832;
  return bb(vec2(sin(a), cos(b))) * amp * uLive.x * uLive.y;
}
struct St { vec3 p; vec3 v; vec3 goal; vec3 gv; float k; float z; float brT; float rate; vec2 ct; float cw; float tw; float flash; vec3 acc; };

// 20: the agent, a cream ball with a white core, the same size on screen in every scene
// each particle circles the centre at its own speed, some one way and some the other, and drifts in and out a little,
// so the ball stays round and keeps moving while the agent waits; the whole ball also swells and settles slowly, like breathing
void agentRole(inout St s){
  vec3 o = aTgt.xyz;
  o.xy = rot(o.xy, uTime * (0.6 + 1.6 * aSeed.y) * (aSeed.z < 0.5 ? -1.0 : 1.0) * uLive.z);
  o *= 1.0 + 0.05 * uLive.z * sin(uTime * (1.4 + 1.6 * aSeed.w) + aSeed.x * 6.2832);
  o *= 1.0 + 0.04 * uLive.z * sin(uTime * 1.7);
  s.goal = uAg.xyz + o * uAgV.w;
  s.gv = uAgV.xyz;
  s.k = 320.0; s.z = 0.86;
  s.brT *= uAg.w;
  s.tw = 0.45;
}
// 07: the agent sees a circle on the slanted floor. A point's world xy goes back to storyboard px (uArr[152] = origin xy, 1 / scale)
// and onto the floor (uArr[153] = focal length, eye height, horizon y, centre x); uSight = (floor x, floor depth, radius, amount).
// Inside 87% of the radius the floor is whole, it darkens over the last 13% and beyond it sinks to floorB.
// A tile (tile 1) is lit as a whole by where its middle is: its floor point goes to the nearest place on the tile grid
// (uArr[154] = column step, row step, nearest row) and it darkens from 80% of the radius, so no cut piece of a tile is left at the edge
float sightK(vec3 p, float floorB, float tile){
  if (floorB <= 0.0 || uSight.w <= 0.0) return 1.0;
  vec4 M = uArr[152], P = uArr[153];
  vec2 q = vec2(p.x - M.x, M.y - p.y) * M.z;
  float Z = P.x * P.y / max(q.y - P.z, 1.0);
  vec2 f = vec2((q.x - P.w) * Z / P.x, Z);
  if (tile > 0.5) { vec4 G = uArr[154]; f = vec2(floor(f.x / G.x + 0.5) * G.x, G.z + floor((f.y - G.z) / G.y + 0.5) * G.y); }
  float d = length(f - uSight.xy) / max(uSight.z, 1e-4);
  return mix(1.0, floorB, smoothstep(tile > 0.5 ? 0.8 : 0.87, 1.0, d) * uSight.w);
}
// faint specks behind the picture drift slowly; in 07 they go dark with the rest outside the agent's view
void dustRole(inout St s, float form){
  s.goal = aTgt.xyz + vec3(sin(uTime * 0.11 + aSeed.x * 6.28), cos(uTime * 0.09 + aSeed.y * 6.28), sin(uTime * 0.07 + aSeed.z * 6.28)) * 0.04 + wander(2.0);
  s.brT *= form * sightK(s.p, 1e-4, 0.0) * uLive.w;
  s.k = 12.0;
}
// 1: a particle of one object. aTgt.xyz and aAux.xyz are its place in the object's first and second shape,
// aMeta = (unused, part, where along the stroke it is drawn, stagger). A hidden object's particles wait unlit
// in a loose cloud around it and gather when it shows
void objRole(inout St s, float form){
  int k = int(aAux2.y + 0.5) * 4;
  vec4 A = uArr[k];
  vec4 B = uArr[k + 1];
  vec4 C = uArr[k + 2];
  float on = clamp(B.x * 1.4 - aMeta.w * 0.4, 0.0, 1.0);
  vec3 home = A.xyz + mix(aTgt.xyz, aAux.xyz, B.y) * A.w;
  vec3 loose = A.xyz + aTgt.xyz * 1.7 + (aSeed.xyz - 0.5) * vec3(0.3, 0.3, 0.5);
  s.goal = mix(loose, home + wander(aAux2.z), on);
  // a walking object carries its particles with it; the last few percent are left to the spring, so they follow a step behind
  s.p.xy += uArr[k + 3].xy * uDt * on * (0.92 + 0.08 * aSeed.w);
  float drawn = aMeta.z <= C.w + 1e-4 ? 1.0 : 0.0;
  float clay = max(B.w, C.x * step(0.5, aMeta.y));
  s.brT = aTgt.w * on * on * drawn * max(0.0, 1.0 + B.z) * sightK(home, C.y, uArr[k + 3].w);
  // 07: the floor goes dark as soon as the view has left it, with no faint trace behind
  if (C.y > 0.0 && uSight.w > 0.0) s.rate = 18.0;
  s.ct = vec2(mix(mix(aTCol.x, aAux.w, B.y), 0.02, clay), aTCol.y);
  s.cw = aTCol.z + C.z + 0.25 * max(B.z, 0.0);
  s.tw = aTCol.w;
  s.k = 150.0 * max(form, 0.04) * (1.0 + uArr[k + 3].z); s.z = 0.8;
}
`;
/* 08 · 연락: 입자가 모여 이름이 되고, 연락처 링크마다 옅은 빛 테두리가 둘린다 */
const SIM_M10 = `
void m10(inout St s, float form){
  float role = aAux2.x;
  if (role < 2.5) {                       // the name and the lines around the links
    s.goal = aTgt.xyz + wander(1.0) * form;
    s.k = 150.0 * max(form, 0.04); s.z = 0.8;
    s.brT *= form;
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
  s.goal = aTgt.xyz; s.gv = vec3(0.0); s.k = 0.0; s.z = 0.8; s.brT = aTgt.w; s.rate = 5.0;
  s.ct = aTCol.xy; s.cw = aTCol.z; s.tw = aTCol.w; s.flash = 0.0; s.acc = vec3(0.0);
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
    s.acc += (aTgt.xyz + wander(1.0) * a - s.p) * kk - s.v * (2.0 * uZeta * sqrt(kk) + uDrag * (1.0 - a)) + nz * (1.0 - 0.9 * a) + cloud(s.p, 1.5) * (1.0 - a) * uP.y;
    s.v += s.acc * dt;
    sprung = false;
  } else if (uMode == 8) {                // galaxy: a turning spiral disk behind the reading sections
    s.goal = galaxy(aSeed, uTime);
    s.k = uS.x; s.z = 1.0;
    nz *= 0.04;
    float rr = pow(aSeed.x, 1.35);
    float hue = fract(aSeed.w * 7.31 + aSeed.y * 3.17);
    s.ct = vec2(hue < 0.45 ? 0.08 : hue < 0.8 ? 0.5 : 0.95, sm1(rr * 1.6) * 0.8);
    s.cw = 0.55 * (1.0 - sm1(rr * 2.2));
    s.tw = 0.3;
    // the disk keeps the first N0 particles, as many as it always had; the rest stay unlit
    s.brT = (0.55 + 0.45 * aSeed.w) * (1.0 - 0.45 * rr) * uS.y * (gl_VertexID < ${N0} ? 1.0 : 0.0);
    s.acc += nz;
  } else {
    bool keep = gl_VertexID >= uKeep.x && gl_VertexID < uKeep.y;
    float form = keep ? 1.0 : sm1((uRT - aMeta.w * uStagger) / uForm);
    s.k = 120.0 * max(form, 0.04);
    if (role > 19.5 && role < 20.5) agentRole(s);
    else if (role > 28.5 && role < 29.5) dustRole(s, form);
    else if (role > 29.5) { s.brT = 0.0; s.k = 8.0; }
    else if (uMode == 10) m10(s, form);
    else if (role > 0.5 && role < 1.5) objRole(s, form);
    else { s.brT = 0.0; s.k = 8.0; }
    s.acc += nz * (1.0 - form) * 0.8;
  }

  if (sprung) {
    bool held = (gl_VertexID >= uKeep.x && gl_VertexID < uKeep.y) || (uAgKeep > 0.5 && role > 19.5 && role < 20.5);
    float ra = held ? 1.0 : sm1(uRT / uRamp);
    s.acc += spring(s.p, s.v, s.goal, s.gv, s.k * max(ra, 0.04), s.z) + nz * 0.6 * (1.0 - ra);
    s.v += s.acc * dt;
  }
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
  br += (s.brT - br) * (1.0 - exp(-dt * s.rate));
  br = max(br, s.flash);
  float cr = 1.0 - exp(-dt * uColRate);
  col.xy += (s.ct - col.xy) * cr;
  col.z += (s.cw - col.z) * cr;
  col.w += (s.tw - col.w) * cr;
  vPos = vec4(s.p, br);
  vVel = vec4(s.v, 0.0);
  vCol = col;
}`;

const SIM_VS = SIM_HEAD + SIM_M10 + SIM_MAIN;
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
uniform float uPx, uFocus, uTime, uBright, uWhite, uJitter, uPulse, uPulseT, uPulseGap, uDof, uVar, uMaxPx, uShift, uTwk;
uniform vec4 uMask;
uniform float uMaskA, uTopA, uFixB;
uniform int uRMode, uFixEnd;
uniform vec3 uClay, uAmber, uCream;
out vec3 vCol;
out float vSoft;
${PAL}
void main(){
  // a particle without light (most of the unused ones) is sent off screen instead of drawn black
  if (aPos.w < 1e-4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; vCol = vec3(0.0); vSoft = 0.0; return; }
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
  // each particle glints at its own slow rate; a shape's overall light stays the same
  b *= 1.0 + uTwk * sin(uTime * (1.5 + 2.5 * aSeed.w) + aSeed.x * 37.0);
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
  if (gl_InstanceID < uAgEnd) L = min(L, uAgMax);   // the agent's tail is capped (AG_TAIL), so a fast agent stays a round disc
  vec3 head = aPos.xyz;
  vec3 tail = head - (speed > 1e-4 ? v / speed : vec3(0.0)) * L;
  vec4 ch = uVP * vec4(head, 1.0);
  vec4 cT = uVP * vec4(tail, 1.0);
  float vis = step(0.06, ch.w) * step(0.06, cT.w) * smoothstep(0.2, 1.0, speed) * step(0.02, aCol.w) * step(1e-4, aPos.w);
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
  // 채널마다 따로 누르면 빽빽한 호박색이 노랗게 바래므로, 밝기만 누르고 색 비율을 지킨 값과 반씩 섞는다
  vec3 x = c + b;
  float L = dot(x, vec3(0.2126, 0.7152, 0.0722));
  vec3 keep = min(x * ((1.0 - exp(-L)) / max(L, 1e-4)), vec3(1.0));
  vec3 m = mix(1.0 - exp(-x), keep, 0.6) * uDim;
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
    P[i * 4 + 3] = (0.45 + 0.55 * r()) * (i < N0 ? 1 : 0);
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
// 해상도를 낮출지 재는 값(40_engine.js 의 dropCheck). calm 까지는 느린 프레임을 세지 않는다. 처음 2초는 글꼴·모양을 짓느라 세지 않는다
const drop = { avg: 16.7, slowMs: 0, fastMs: 0, calm: performance.now() + 2000, ups: 0 };
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
// a particle's dot in CSS px before its own size and blur: smaller on short screens
const dotCss = () => clamp(2.3 * Math.sqrt(pxPerUnit / 450), 1.4, 2.9);
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
    clearShapes();
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
  dpr = DPR_FIX || Math.min(window.devicePixelRatio || 1, dprCap);
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
function zPart(v) { v &= 0xfff; v = (v | (v << 8)) & 0x00ff00ff; v = (v | (v << 4)) & 0x0f0f0f0f; v = (v | (v << 2)) & 0x33333333; return (v | (v << 1)) & 0x55555555; }
function zUn(v) { v &= 0x55555555; v = (v | (v >> 1)) & 0x33333333; v = (v | (v >> 2)) & 0x0f0f0f0f; v = (v | (v >> 4)) & 0x00ff00ff; return (v | (v >> 8)) & 0xffff; }
// Z keys of the lab pixels with alpha above thr, in order: two counting passes over the 12-bit halves give the same order as
// sorting the keys, in a fifth of the time, so building the scene shapes during scene 01 holds up fewer frames
const zCnt = new Int32Array(4096);
function zKeys(img, thr) {
  let n = 0;
  for (let p = 0, P = CW * CH; p < P; p++) if (img[p * 4 + 3] > thr) n++;
  let a = new Int32Array(n), b = new Int32Array(n);
  for (let y = 0, p = 0, j = 0; y < CH; y++) {
    const zy = zPart(y) << 1;
    for (let x = 0; x < CW; x++, p++) if (img[p * 4 + 3] > thr) a[j++] = zPart(x) | zy;
  }
  for (let sh = 0; sh < 24; sh += 12) {
    zCnt.fill(0);
    for (let j = 0; j < n; j++) zCnt[(a[j] >> sh) & 4095]++;
    for (let k = 0, s = 0; k < 4096; k++) { const c = zCnt[k]; zCnt[k] = s; s += c; }
    for (let j = 0; j < n; j++) { const v = a[j]; b[zCnt[(v >> sh) & 4095]++] = v; }
    const t = a; a = b; b = t;
  }
  return a;
}
function sample(n, rand) {
  const img = sx.getImageData(0, 0, CW, CH).data;
  const P = CW * CH;
  for (let p = 0; p < P; p++) alphaMap[p] = img[p * 4 + 3];
  // pixels in Z order, so samples taken at even steps along the list spread evenly in both directions; weights stop
  // growing at 40% alpha, so overlapping strokes and fades inside a filled shape don't crowd one part of it
  const key = zKeys(img, 12), cnt = key.length;
  const idx = new Int32Array(cnt), cum = new Float64Array(cnt);
  let tot = 0, sum = 0;
  for (let j = 0; j < cnt; j++) {
    const p = zUn(key[j] >> 1) * CW + zUn(key[j]), a = alphaMap[p];
    tot += Math.min(1, a / 102); sum += a; idx[j] = p; cum[j] = tot;
  }
  const out = { x: new Float32Array(n), y: new Float32Array(n), a: new Float32Array(n), edge: new Uint8Array(n), area: sum / 255 / (PPU * PPU) };
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


/* 0번부터 PB 개는 어느 장면에서나 에이전트다. 작은 화면은 에이전트가 화면에서 작고 이름 점은 더 촘촘해서, 같은 수로는
   속이 이름보다 성기고 어둡게 비어 보인다. 그래서 두 배를 준다 */
const PB = Math.round(N0 * (SMALL ? 0.064 : 0.032));
const I_AG = 0;
const AGS = () => layout === 'tall' ? 0.075 : 0.058;
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
  for (let i = 1; i < caps.length - 1; i++) {
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

/* 장면 뒤 먼지: 화면 넓이에 맞춘 수만큼 깊이 흩어 둔다(1440×900 에서 약 8,800). 좁은 화면은 점이 작게 그려져 입자의 10% 를 밑돌지 않게 한다.
   장면 밝기는 사물이 모인 넓이로 정해지는데 먼지는 그 값을 나눠 지워서(DUST_K / R.bright), 어느 장면에서나 같은 밝기로 깔린다 */
const DUST_PX = 0.0068, DUST_K = 1.36;
const dustCount = () => Math.round(clamp(innerWidth * innerHeight * DUST_PX, N0 * 0.1, N0 * 0.24));
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
// particles a picture does not use: unlit (role 30), waiting where dust would be. Shapes built in steps place IDLE_STEP of them a step
function idle(sh, i0, i1, rand) { if (i1 > i0) dust(sh, i0, i1 - i0, rand, 30, 0); }
const IDLE_STEP = 16384;

// 01 · 이름 하나만 입자 글자로
function nameShape(rand) {
  const tall = layout === 'tall';
  const sh = newShape('name');
  clearBox();
  const cy = tall ? 0.2 : 0.07;
  drawText('Kunsang Lee', tall ? { cy, maxW: 1.8, lineH: 0.5 } : { cy, maxW: 2.75, lineH: 0.66 });
  const S = sample(N0, rand);
  const b = bounds(S.x, S.y, N0);
  for (let i = 0; i < N0; i++) {
    const e = S.edge[i];
    put(sh, i, S.x[i], S.y[i], (rand() - 0.5) * 0.04, (0.62 + 0.38 * S.a[i]) * (e ? 1.15 : 1), 0.5, 0, e ? 0.42 : 0.1, 0.45);
    sh.meta[i * 4] = e;
    sh.meta[i * 4 + 3] = (S.x[i] - b.x0) / (b.x1 - b.x0) * 0.75 + rand() * 0.2;
  }
  idle(sh, N0, N, rand);
  sh.area = S.area;
  sh.center = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0];
  return sh;
}

// the agent: a flat white disc with a clear rim inside a short soft glow, like the storyboard's agent. Half the particles
// fill the disc evenly, three in sixteen trace the rim, four in sixteen make a thin glow just outside it, the last spread faint
function agentInto(sh, rand) {
  const rc = AGS() * 0.6;
  for (let k = 0; k < PB; k++) {
    const i = I_AG + k, d = sdir(rand);
    const a = rand() * TAU, ca = Math.cos(a), sa = Math.sin(a);
    if (k % 16 < 8) {
      const e = Math.sqrt(rand()) * 0.97, r = rc * e;
      put(sh, i, ca * r, sa * r, (rand() - 0.5) * rc * 0.2, 0.95, 0.97, 0.05, 0.72 - 0.3 * e * e, 0.12);
    } else if (k % 16 < 11) {
      const r = rc * (0.97 + 0.04 * rand());
      put(sh, i, ca * r, sa * r, (rand() - 0.5) * rc * 0.1, 1.05, 0.97, 0, 0.5, 0.12);
    } else if (k % 16 < 15) {
      const u = Math.pow(rand(), 1.5), r = rc * (1.12 + 0.5 * u);
      put(sh, i, ca * r, sa * r, d[2] * r * 0.3, 0.26 * (1.1 - 0.5 * u), 0.95, 0, 0.2, 0.06);
    } else {
      const u = Math.pow(rand(), 1.6), r = rc * (1.05 + 1.0 * u);
      put(sh, i, ca * r, sa * r, d[2] * r * 0.3, 0.08 * (1.15 - 0.45 * u), 0.92, 0.6, 0, 0.06);
    }
    sh.aux2[i * 4] = 20;
    sh.meta[i * 4 + 3] = rand();
  }
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

/* ------------------------------------------------------- scene objects */
/* 장면 2~7 의 그림은 스토리보드의 사물(얼굴·말풍선·아이콘·방패·조각) 몇 개로 짓는다. 사물마다 모양을 화면 밖 캔버스에 그려
   입자 자리를 뽑고, 매 프레임에는 사물의 자리·크기·보임만 uArr 로 올린다. 숨은 사물의 입자는 그 둘레에 빛 없이 떠 있다가
   보일 때 모여든다. 좌표는 넓은 화면이 스토리보드 그대로(640×360), 좁은 화면은 320×400 칸에 같은 사물을 세로로 다시 놓는다.
   스토리보드 칸 아래쪽은 장면 설명 자리라 비어 있으므로, 넓은 화면은 높이 SEE_W 만 그림 자리에 맞추고 장면마다 그림의 세로 가운데(mid)를 둔다 */
const LEAD = 0.5;
const VW_W = 640, VH_W = 360, VW_T = 320, VH_T = 400, SEE_W = 304;
function frameOf(L) {
  const g = geo();
  const s = Math.min(g.w / L.VW, g.h / (L.see || L.VH));
  return { s, VW: L.VW, VH: L.VH, cy: g.cy, mid: L.mid === undefined ? L.VH / 2 : L.mid };
}
const vw = (F, x, y, z = 0) => [(x - F.VW / 2) * F.s, F.cy + (F.mid - y) * F.s, z];
function rrq(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
const lerp2 = (p, q, k) => [mix(p[0], q[0], k), mix(p[1], q[1], k)];
const qpt = (p0, p1, p2, k) => lerp2(lerp2(p0, p1, k), lerp2(p1, p2, k), k);

/* 넓은 사물(말풍선·창·원통·카드)은 속을 옅게 칠하고 테두리를 진하게 그린다. 알파를 그대로 무게로 뽑으면 테두리 화소 하나가
   속 화소의 10~20배 입자를 가져가 속이 빈 사물로 읽혔다. even(속 화소의 무게, 선 화소가 1)을 주면 속이 고르게 차고, 선 위 점을
   속의 점보다 LINE_B / FILL_B 배 밝게 하고 조금 더 희게(LINE_WH) 두어 모양이 읽힌다. 속의 알파는 그림에서 가장 흔한 알파 값으로 찾는다.
   사물마다 점 밝기의 평균을 1 로 맞춰, 고르게 채워도 사물의 빛은 알파대로 뽑던 때와 같다. 입자 수는 sceneShape 가 정한다.
   속을 칠한 사물에 쓴다. 속에 선 표시(#ov)가 들어가는 상자는 hollow 로 외곽선만 쓴다(아래).
   fb 를 주면 속 점을 그만큼 더 어둡게 둔다. 속이 거의 빈 틀(06 문서·편집기·PR 카드, 07 파일 타일)은 그대로 둔다.
   사물의 점은 01 이름 점처럼 흐림을 0(OBJ_SOFT)으로 둔다 */
const FILL_B = 1.0, LINE_B = 2.4, LINE_WH = 0.2, OBJ_SOFT = 0;
/* 속에 선 표시(#ov)가 들어가는 상자(말풍선·편집기·원통·카드·모니터·방패)는 hollow 를 달아 외곽선에만 입자를 둔다. 속을 점으로 채우면
   그 위의 글줄·아이콘이 점에 묻혀 읽히지 않았다(사용자 의견, 2026-10-10). 그림의 칠(알파 0.3 이하)은 버리고 선(0.6 이상)만,
   알파가 HOLLOW_A 를 넘는 만큼을 무게로 Z 순서에 따라 고르게 뽑는다. 입자 수는 선 사물처럼 선 넓이의 LINE_D 배이고 점 하나는 이름 점과 같다.
   속에서 빠진 입자는 쉬는 입자가 된다. hollow2 는 두 번째 모양에만 건다 */
const HOLLOW_A = 115;
/* 테두리를 가진 사물(말풍선·창·원통·카드·방패·타일)과 그 사이를 잇는 선은 solid 를 달아 선명한 층(#ov)에 실선으로 그린다(사용자 의견, 2026-10-10).
   solid 사물은 입자를 받지 않는다. 실선 뒤에 입자가 남아 있으면 마우스나 탭에 밀려 드러났다(사용자 의견, 같은 날). 그 몫은 쉬는 입자(빛 없음)가 되고,
   실선은 장면의 marks 가 사물의 보임을 따라 서서히 나타나고 사라지게 그린다 */
// draw one object around its anchor in vpx units and keep the alpha as a sampling table
function inkMap(F, w, h, draw, even, hollow) {
  setBox(w * F.s + 0.03, h * F.s + 0.03);
  const k = PPU * F.s;
  sx.setTransform(k, 0, 0, k, CW / 2, CH / 2);
  sx.lineCap = 'round'; sx.lineJoin = 'round'; sx.setLineDash([]);
  sx.strokeStyle = '#fff'; sx.fillStyle = '#fff';
  draw(sx);
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalAlpha = 1;
  const img = sx.getImageData(0, 0, CW, CH).data, P = CW * CH;
  if (hollow) {
    let top = HOLLOW_A + 1;
    for (let p = 0; p < P; p++) if (img[p * 4 + 3] > top) top = img[p * 4 + 3];
    const key = zKeys(img, HOLLOW_A), n = key.length, idx = new Int32Array(n), cum = new Float64Array(n);
    let tot = 0;
    for (let j = 0; j < n; j++) {
      const p = zUn(key[j] >> 1) * CW + zUn(key[j]);
      tot += (img[p * 4 + 3] - HOLLOW_A) / (top - HOLLOW_A); idx[j] = p; cum[j] = tot;
    }
    return { idx, cum, tot, W: CW, H: CH, ink: tot / (PPU * PPU) };
  }
  let cnt = 0, raw = 0;
  for (let p = 0; p < P; p++) { const a = img[p * 4 + 3]; if (a > 8) { cnt++; raw += a; } }
  const ink = raw / 255 / (PPU * PPU);
  if (!even) {
    const idx = new Int32Array(cnt), cum = new Float64Array(cnt);
    let tot = 0;
    for (let p = 0, j = 0; p < P; p++) { const a = img[p * 4 + 3]; if (a > 8) { tot += a; idx[j] = p; cum[j] = tot; j++; } }
    return { idx, cum, tot, W: CW, H: CH, ink };
  }
  // the fill is the commonest alpha, the lines run up to the highest; a pixel's weight and how much of a line it is follow from its alpha
  const hist = new Int32Array(256);
  for (let p = 0; p < P; p++) hist[img[p * 4 + 3]]++;
  let a0 = 1, a1 = 255;
  for (let a = 2; a < 256; a++) if (hist[a] > hist[a0]) a0 = a;
  while (a1 > a0 + 1 && !hist[a1]) a1--;
  const rim = new Uint8Array(P), key = zKeys(img, 0), n = key.length;
  const idx = new Int32Array(n), cum = new Float64Array(n);
  let tot = 0;
  for (let j = 0; j < n; j++) {
    const p = zUn(key[j] >> 1) * CW + zUn(key[j]), a = img[p * 4 + 3], s = clamp((a - a0) / (a1 - a0), 0, 1);
    rim[p] = Math.round(s * 255);
    tot += a < a0 ? even * a / a0 : even + (1 - even) * s; idx[j] = p; cum[j] = tot;
  }
  return { idx, cum, tot, W: CW, H: CH, ink, rim };
}
// n points of a map; for an even map, s says how much of a line each point sits on (0 fill, 1 line)
function pickPts(M, n, rand) {
  const out = { x: new Float32Array(n), y: new Float32Array(n) };
  if (M.rim) out.s = new Float32Array(n);
  if (!M.idx.length) return out;
  const pix = new Int32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) { const r = (i + rand()) / n * M.tot; while (j < M.idx.length - 1 && M.cum[j] < r) j++; pix[i] = M.idx[j]; }
  shuffle(pix, rand);
  for (let i = 0; i < n; i++) {
    const p = pix[i];
    out.x[i] = ((p % M.W) + rand() - M.W / 2) / PPU; out.y[i] = (M.H / 2 - (((p / M.W) | 0) + rand())) / PPU;
    if (M.rim) out.s[i] = M.rim[p] / 255;
  }
  return out;
}
// points made by a generator in vpx: [x, y, reveal u, part]
function genPts(list, F, ox, oy) {
  const n = list.length, out = { x: new Float32Array(n), y: new Float32Array(n), u: new Float32Array(n), part: new Float32Array(n) };
  list.forEach((p, i) => { out.x[i] = (p[0] - ox) * F.s; out.y[i] = -(p[1] - oy) * F.s; out.u[i] = p[2] || 0; out.part[i] = p[3] || 0; });
  return out;
}
/* 사물 하나: name, 그림 상자 w×h(vpx) 와 draw(c) 또는 gen(n, rand), 색 온도 temp(0 점토 0.5 호박 1 크림), 밝기 b, 떠도는 폭 live.
   byPlace(x, y) 를 주면 사물 가운데에서 본 자리(vpx)마다 밝기 배율 b·점 크기 soft·떠도는 폭 live 를 정한다.
   abs 이면 그림 좌표가 화면 칸 그대로다. draw2 나 morph 는 두 번째 모양(uArr 의 '두 모양 사이' 로 오간다),
   part·u 는 입자마다 조각 번호·그려지는 순서를 준다. 이목구비·말풍선 속 줄 같은 작은 표시는 입자로 뽑지 않고 선명한 층(#ov)에 그린다.
   사물 점 하나는 01 이름 점과 크기·밝기·흐림이 같다(OBJ_SOFT, 장면 밝기는 이름 장면과 같은 값). 개수로 나눠 어둡게 하지 않고,
   사물이 얼마나 밝아 보일지는 점 수(밀도)로 정한다. 사물은 넓이만큼 01 이름 글자와 같은 밀도(NAME_K 배)로 입자를 받는다.
   넓이는 그린 잉크(알파의 합)이고, 고르게 채우는 사물(even)은 속을 온전한 넓이로 센다.
   선은 점 한두 개 폭이라 옆줄 점이 틈을 메워 주지 않으므로, 이름만큼 빽빽해 보이도록 넓이당 LINE_D 배를 받는다.
   even 도 fill 도 없는 사물은 선으로 본다. 속을 채운 모양(달, 빛줄기 끝점)은 fill 을 단다.
   얼굴은 이름 점과 같은 밝기·흐림 0 의 점으로 채운 원이고, 둘레에 옅은 빛무리를 둔다(faceLook). 원 안은 넓이당 FACE_D 배를 받는다.
   입자가 모자라면 모든 사물의 몫을 같은 비율로 줄인다.
   짓는 일은 사물 하나의 그림, 사물 하나의 점 뽑기처럼 단계로 나뉜다. 미리 지을 때(warmAll)는 몇 단계씩 나눠 짓고, 그 밖에는 한 번에 짓는다 */
const NAME_K = 1, LINE_D = 2, FACE_D = 1.2;
// particles per world unit² inside the letters of the 01 name
const nameDens = () => N0 / getShape('name').area;
// an object's area in world units²: its ink, or for an evenly filled object its whole inside (the lines count a little more)
const fullArea = (o, M, s2) => M ? (M.rim ? M.tot / o.even / (PPU * PPU) : M.ink) : (o.ink || 100) * s2;
function sceneShape(key, L, specs, rand) {
  const g = shapeSteps(key, L, specs, rand);
  return stepped ? g : runAll(g);
}
function runAll(g) {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
function* shapeSteps(key, L, specs, rand) {
  const F = frameOf(L), sh = newShape(key);
  sh.L = L;
  agentInto(sh, rand);
  const s2 = F.s * F.s, cx = L.VW / 2, cy = L.VH / 2;
  const wrap = (o, d) => o.abs ? c => { c.translate(-cx, -cy); d(c); } : d;
  const maps = [], maps2 = [];
  for (const o of specs) { const m = o.draw && !o.solid; maps.push(m ? inkMap(F, o.w, o.h, wrap(o, o.draw), o.even, o.hollow) : null); if (m) yield; }
  for (const o of specs) {
    const m = o.draw2 && !o.solid;
    maps2.push(m ? inkMap(F, o.w, o.h, wrap(o, o.draw2), o.even2 === undefined ? o.even : o.even2, o.hollow2 === undefined ? o.hollow : o.hollow2) : null);
    if (m) yield;
  }
  const nDust = dustCount(), dn = NAME_K * nameDens();
  const want = specs.map((o, k) => o.n === 0 || o.solid ? 0 : Math.max(24, Math.round(dn * (o.byPlace ? FACE_D : o.even || o.fill ? 1 : LINE_D) * fullArea(o, maps[k], s2))));
  const room = N - PB - nDust, mu = Math.min(1, room / Math.max(1, want.reduce((a, b) => a + b, 0)));
  const cnt = want.map(w => Math.floor(w * mu));
  sh.nObj = cnt;
  let i = PB;
  sh.O = {};
  for (let k = 0; k < specs.length; k++) {
    const o = specs[k];
    sh.O[o.name] = k;
    if (o.n === 0 || o.solid) continue;
    const n = cnt[k];
    const P = maps[k] ? pickPts(maps[k], n, rand) : genPts(o.gen(n, rand), F, o.abs ? cx : 0, o.abs ? cy : 0);
    const P2 = maps2[k] ? pickPts(maps2[k], n, rand) : null;
    const t1 = o.temp === undefined ? 1 : o.temp, t2 = o.temp2 === undefined ? t1 : o.temp2;
    const fb = o.fb === undefined ? FILL_B : o.fb;
    // an evenly filled object keeps the light it had when its particles followed the alpha: the mean of its dots' light is 1
    let lbm = 1;
    if (P.s) { let a = 0; for (let q = 0; q < n; q++) a += mix(fb, LINE_B, P.s[q]); lbm = a / Math.max(1, n); }
    for (let q = 0; q < n && i < N; q++, i++) {
      const lx = P.x[q], ly = P.y[q], vx = lx / F.s + (o.abs ? cx : 0), vy = -ly / F.s + (o.abs ? cy : 0);
      let bx = lx, by = ly;
      if (P2) { bx = P2.x[q]; by = P2.y[q]; }
      else if (o.morph) { const m = o.morph(vx, vy); bx = (m[0] - (o.abs ? cx : 0)) * F.s; by = -(m[1] - (o.abs ? cy : 0)) * F.s; }
      const z = (o.z || 0) + (rand() - 0.5) * 0.02;
      const pl = o.byPlace ? o.byPlace(lx / F.s, ly / F.s) : { b: 1, soft: o.soft === undefined ? OBJ_SOFT : o.soft, live: o.live === undefined ? LINE_LIVE : o.live };
      const lb = P.s ? mix(fb, LINE_B, P.s[q]) / lbm : 1;
      put(sh, i, lx, ly, z, (o.b === undefined ? 1 : o.b) * pl.b * lb * (0.8 + 0.4 * rand()), t1, pl.soft,
        (o.white === undefined ? 0.08 : o.white) + (P.s ? LINE_WH * P.s[q] : 0), o.tail === undefined ? 0.3 : o.tail);
      set4(sh.aux, i, bx, by, z, t2);
      set4(sh.aux2, i, 1, k, pl.live, 0);
      set4(sh.meta, i, 0, P.part ? P.part[q] : o.part ? o.part(vx, vy) : 0, P.u ? P.u[q] : o.u ? o.u(vx, vy) : 0, rand());
      if (q % 8192 === 8191) yield;
    }
    yield;
  }
  for (let q = 0; q < nDust && i < N; q++, i++) dust(sh, i, 1, rand, 29);
  for (; i < N; i += IDLE_STEP) { idle(sh, i, Math.min(N, i + IDLE_STEP), rand); yield; }
  sh.F = F; sh.spec = specs; sh.solid = specs.some(o => o.solid);
  // a story dot is as bright as a name dot: the scene takes the name's brightness (brightFor)
  sh.area = getShape('name').area;
  sh.fixEnd = PB;
  return sh;
}

/* 스토리보드의 그림 낱말. 흰 잉크의 알파가 입자 밀도가 된다.
   입자는 제자리에서 조금씩 떠돈다(CSS px): 얼굴처럼 채운 모양은 더 크게, 선은 선이 굵어 보이지 않을 만큼만.
   얼굴은 스토리보드의 얼굴 빛처럼 원 둘레에 옅은 빛무리를 두른다. 원은 이름 점처럼 또렷한 점으로 채우고 가운데를 조금 밝게 두며,
   빛무리 입자는 더 흐리고 더 멀리 떠돌아서 원과 이목구비는 제자리에 있고 가장자리만 일렁인다 */
const FACE_T = 0.5, FACE_LIVE = 0.7, LINE_LIVE = 0.6, FACE_GLOW = 1.25, FACE_HALO_LIVE = 1.2, FACE_B = 1, FACE_HALO_A = 0.18;
const faceLook = r => (x, y) => {
  const d = Math.hypot(x, y) / r;
  return d <= 1 ? { b: FACE_B * (1.06 - 0.12 * d * d), soft: 0, live: FACE_LIVE } : { b: FACE_B * 0.4, soft: 0.2, live: FACE_HALO_LIVE };
};
const INK = {
  face: r => c => {
    const g = c.createRadialGradient(0, 0, r, 0, 0, r * FACE_GLOW);
    g.addColorStop(0, `rgba(255,255,255,${FACE_HALO_A})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * FACE_GLOW, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  },
  bubble: (w, h, right) => c => {
    rrq(c, -w / 2, -h / 2, w, h, 8);
    c.globalAlpha = 0.1; c.fill();
    c.globalAlpha = 1; c.lineWidth = 1.7; c.stroke();
    const tx = right ? w / 2 - 13 : -w / 2 + 13, dir = right ? 1 : -1;
    c.beginPath(); c.moveTo(tx - 4, h / 2 - 0.5); c.lineTo(tx + 4, h / 2 - 0.5); c.lineTo(tx + dir * 8, h / 2 + 8); c.closePath(); c.fill();
  },
  code: c => {
    c.globalAlpha = 0.06; rrq(c, -28, -21, 56, 42, 5); c.fill();
    c.globalAlpha = 0.95; c.lineWidth = 1.5; rrq(c, -28, -21, 56, 42, 5); c.stroke();
    c.beginPath(); c.moveTo(-28, -11); c.lineTo(28, -11); c.stroke();
  },
  // the whole outline filled faintly and the top a little more, so filled evenly (even) the top still reads as the lid; hollow keeps only the strokes
  cyl: c => {
    c.globalAlpha = 0.05; c.beginPath(); c.ellipse(0, -18, 18, 6, 0, Math.PI, TAU); c.lineTo(18, 18); c.ellipse(0, 18, 18, 6, 0, 0, Math.PI); c.closePath(); c.fill();
    c.globalAlpha = 0.3; c.beginPath(); c.ellipse(0, -18, 18, 6, 0, 0, TAU); c.fill();
    c.globalAlpha = 0.95; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, -18, 18, 6, 0, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-18, -18); c.lineTo(-18, 18); c.moveTo(18, -18); c.lineTo(18, 18); c.stroke();
    c.beginPath(); c.ellipse(0, 0, 18, 6, 0, 0, Math.PI); c.stroke();
    c.beginPath(); c.ellipse(0, 18, 18, 6, 0, 0, Math.PI); c.stroke();
  },
  card: c => {
    c.globalAlpha = 0.06; rrq(c, -44, -17, 88, 34, 6); c.fill();
    c.globalAlpha = 0.8; c.lineWidth = 1.4; rrq(c, -44, -17, 88, 34, 6); c.stroke();
  },
  shield: c => {
    c.beginPath(); c.moveTo(0, -13); c.lineTo(11, -9); c.lineTo(11, 1); c.quadraticCurveTo(11, 9, 0, 14); c.quadraticCurveTo(-11, 9, -11, 1); c.lineTo(-11, -9); c.closePath();
    c.globalAlpha = 0.12; c.fill(); c.globalAlpha = 1; c.lineWidth = 1.8; c.stroke();
  },
  pill: c => {
    rrq(c, -17, -8, 34, 16, 8); c.globalAlpha = 0.1; c.fill(); c.globalAlpha = 0.9; c.lineWidth = 1.4; c.stroke();
    c.globalAlpha = 0.85; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.stroke();
  },
  moon: r => c => {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(r * 0.47, -r * 0.35, r * 0.91, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
  }
};
// a soft dot, for the answers coming back along a beam
const dotGen = r => (n, rand) => { const o = []; for (let q = 0; q < n; q++) { const g = r * 0.55 * Math.sqrt(-2 * Math.log(1 - 0.995 * rand())), a = rand() * TAU; o.push([Math.cos(a) * g, Math.sin(a) * g]); } return o; };
// a thin curve that is drawn from its start: u is where along it a particle sits
const curveGen = (p0, p1, p2) => (n, rand) => {
  const o = [];
  for (let q = 0; q < n; q++) { const u = (q + rand()) / n, p = qpt(p0, p1, p2, u); o.push([p[0] + (rand() - 0.5) * 1.1, p[1] + (rand() - 0.5) * 1.1, u]); }
  return o;
};

/* ---------------------------------------------------- layouts */
const LAYOUT = {
  team: {
    W: { VW: VW_W, VH: VH_W, see: SEE_W, mid: 136, C: [320, 150], R: 84, fr: 14, code: [70, 150], db: [592, 150], tk: [470, 84], pr: [470, 122],
      bL: [[-12, -6], [170, 24], [96, 128]], bR: [[12, -6], [470, 24], [568, 128]], q: [-46, -30], a: [66, -24] },
    T: { VW: VW_T, VH: VH_T, C: [160, 214], R: 72, fr: 14, code: [62, 62], db: [258, 62], tk: [106, 352], pr: [214, 352],
      bL: [[-10, -8], [118, 104], [90, 84]], bR: [[10, -8], [202, 104], [240, 86]], q: [-44, -30], a: [62, -28] }
  },
};
const lay = key => LAYOUT[key][layout === 'tall' ? 'T' : 'W'];

/* ---------------------------------------------------- 02 · 동료 같은 에이전트 */
const seats2 = L => [-90, -30, 30, 90, 150, 210].map(d => [L.C[0] + L.R * Math.cos(d * Math.PI / 180), L.C[1] + L.R * Math.sin(d * Math.PI / 180)]);
const CALLER = 4;
function beam2(L, side) { const A = seats2(L)[0], b = L[side]; return [[A[0] + b[0][0], A[1] + b[0][1]], b[1], b[2]]; }
function teamShape(rand) {
  const L = lay('team');
  const specs = [{ name: 'ring', w: 2 * L.R + 8, h: 2 * L.R + 8, draw: c => { c.lineWidth = 1.3; c.beginPath(); c.arc(0, 0, L.R, 0, TAU); c.stroke(); }, b: 0.28, temp: 0.85, solid: true }];
  for (let i = 1; i < 6; i++) specs.push({ name: 'f' + i, w: 2 * L.fr * FACE_GLOW + 6, h: 2 * L.fr * FACE_GLOW + 6, draw: INK.face(L.fr), temp: FACE_T, white: 0.03, byPlace: faceLook(L.fr) });
  const bl = beam2(L, 'bL'), br = beam2(L, 'bR');
  specs.push(
    { name: 'q', w: 64, h: 58, draw: INK.bubble(58, 36, true), temp: 0.5, hollow: true, solid: true },
    { name: 'code', w: 62, h: 48, draw: INK.code, hollow: true, solid: true },
    { name: 'db', w: 42, h: 52, draw: INK.cyl, hollow: true, solid: true },
    { name: 'bL', abs: true, gen: curveGen(...bl), n: 0, solid: true },
    { name: 'bR', abs: true, gen: curveGen(...br), n: 0, solid: true },
    { name: 'dL', gen: dotGen(2.6), ink: 40, b: 1.0, temp: 0.7, white: 0, fill: true },
    { name: 'dR', gen: dotGen(2.6), ink: 40, b: 1.0, temp: 0.7, white: 0, fill: true },
    { name: 'a', w: 64, h: 58, draw: INK.bubble(58, 36, false), hollow: true, solid: true },
    { name: 'tk', w: 94, h: 40, draw: INK.card, hollow: true, solid: true },
    { name: 'pr', w: 94, h: 40, draw: INK.card, hollow: true, solid: true }
  );
  return sceneShape('team', L, specs, rand);
}

/* ---------------------------------------------------- registry */
const BUILD = {
  name: nameShape, team: teamShape, recall: recallShape, day: r => deskShape('day', false, r), night: r => deskShape('night', true, r),
  rules: rulesShape, board: boardShape, contact: contactShape
};
const SEEDS = { name: 11, team: 23, recall: 37, day: 41, night: 53, rules: 61, board: 67, contact: 71 };
const FIXEND = { name: 0, team: PB, recall: PB, day: PB, night: PB, rules: PB, board: PB, contact: PB };
const cache = new Map();
let curShape = null, warmTimer = 0, fontsReady = false;
// pend: the shape warmAll is building step by step; stepped: sceneShape hands back its steps instead of running them
let pend = null, stepped = false;
function keep(key, s) {
  if (s.fixEnd === undefined) s.fixEnd = FIXEND[key];
  cache.set(key, s);
  return s;
}
function getShape(key) {
  const s = cache.get(key);
  if (s) return s;
  if (pend && pend.key === key) { const g = pend.g; pend = null; return keep(key, runAll(g)); }
  return keep(key, BUILD[key](rng(SEEDS[key])));
}
function clearShapes() { cache.clear(); pend = null; }
/* 나머지 장면의 모양은 장면 01 동안 미리 짓는다. 한 장면을 한 번에 지으면 그 프레임이 장면에 따라 15~40ms 밀렸으므로,
   한 번에 WARM_MS 동안만 단계를 짓고 다음 틱으로 넘긴다. 짓던 장면이 먼저 필요해지면 getShape 가 남은 단계를 한 번에 짓는다 */
const WARM_MS = 6;
function warmAll(delay = 60) {
  clearTimeout(warmTimer);
  if (!fontsReady) return;
  const step = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < WARM_MS) {
      if (pend) {
        const r = pend.g.next();
        if (r.done) { keep(pend.key, r.value); pend = null; }
        continue;
      }
      const k = Object.keys(BUILD).find(key => !cache.has(key));
      if (!k) return;
      stepped = true;
      try {
        const s = BUILD[k](rng(SEEDS[k]));
        if (s.next) pend = { key: k, g: s }; else keep(k, s);
      } finally { stepped = false; }
    }
    warmTimer = setTimeout(step, 16);
  };
  warmTimer = setTimeout(step, delay);
}
function brightFor(s) {
  const dens = N0 / (s.area * pxPerUnit * pxPerUnit);
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
  clearShapes();
  if (curShape) useShape(curShape.key);
}
/* ---------------------------------------------------- 08 · 연락 */
function g9() {
  const g = geo(), T = g.tall, W = innerWidth, H = innerHeight;
  const toW = (px, py) => [(px - W / 2) / pxPerUnit, (H / 2 - py) / pxPerUnit, 0];
  const c = caps[LAST];
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
  return { name, btns };
}
// built in steps like the scene shapes (sceneShape): the name, the light around the links and the dust, then the unused particles
function contactShape(rand) {
  const g = contactSteps(rand);
  return stepped ? g : runAll(g);
}
function* contactSteps(rand) {
  const G = g9(), sh = newShape('contact');
  agentInto(sh, rand);
  const next = cursor([[PB, N0]]);
  const nName = Math.round(N0 * 0.68);
  clearBox();
  drawText('Kunsang Lee', { cy: G.name.cy, maxW: G.name.maxW, lineH: G.name.lineH });
  const S = sample(nName, rand), b = bounds(S.x, S.y, nName);
  yield;
  for (let k = 0; k < nName; k++) {
    const i = next(), e = S.edge[k];
    put(sh, i, S.x[k], S.y[k], (rand() - 0.5) * 0.04, (0.6 + 0.4 * S.a[k]) * (e ? 1.15 : 1), 0.5, 0, e ? 0.42 : 0.1, 0.45);
    sh.aux2[i * 4] = 2;
    sh.meta[i * 4 + 3] = (S.x[k] - b.x0) / (b.x1 - b.x0) * 0.7 + rand() * 0.2;
  }
  // a faint line of light around each contact link
  const nH = Math.round(N0 * 0.05), per = Math.floor(nH / Math.max(1, G.btns.length));
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
  for (let i = next(); i >= 0; i = next()) dust(sh, i, 1, rand, 29, 0.5);
  yield;
  for (let i = N0; i < N; i += IDLE_STEP) { idle(sh, i, Math.min(N, i + IDLE_STEP), rand); yield; }
  sh.fixEnd = PB;
  sh.area = S.area * 1.15;
  return sh;
}
/* -------------------------------------------------------------- director */
const FREE = 0, ASSEMBLE = 1, STORY = 2, GALAXY = 8, CONTACT = 10;
// how far each particle's light swings around its own level while a picture stands
const TWINKLE = 0.14;
const U = {
  mode: 0, phaseT: 0, rt: 0, snap: 0, form: 0.8, K: 0, zeta: 0.7, ramp: 0.8, stagger: 0, noise: 0, noiseFreq: 0.85, drag: 1.2, vmax: 0,
  kick: 0, kickR: 0, kickShell: 0, colRate: 2.5, arrN: 0,
  contain: new Float32Array(2), wind: new Float32Array(3), kickC: new Float32Array(3), kickBias: new Float32Array(3),
  P: new Float32Array(4), Q: new Float32Array(4), S: new Float32Array(4), T: new Float32Array(4), V: new Float32Array(4),
  Ag: new Float32Array(4), AgV: new Float32Array(4), sight: new Float32Array(4),
  live: new Float32Array(4)
};
// per-frame state of the scene objects the CPU decides (place, how visible, morph, glow); uploaded as uArr.
// Objects take four entries each from the start, so a scene holds at most 40. A scene may keep entries of its own:
// 07 uArr[152..154] (the floor and its tile grid, so 38 objects)
const ARR = new Float32Array(160 * 4);
const R = {
  mode: 0, jitter: 0, twk: 0, white: 0.04, gain: 1, bright: 1, brightGoal: 1, trail: 0, bloom: 1, exposure: 1, pulse: 0, pulseT: 0, pulseGap: 0.12,
  dim: 1, dof: 0.6, tail: 0.045, vari: 0.1, maskA: 0.6, lenK: 0.55, shift: 0, topA: 0, bg0: 1, bg1: 0, fixEnd: 0, par: 1
};
function resetUniforms() {
  U.mode = FREE; U.phaseT = 0; U.rt = 0; U.snap = 0; U.form = 0.8; U.K = 0; U.zeta = 0.7; U.ramp = 0.8; U.stagger = 0; U.noise = 0; U.noiseFreq = 0.85;
  U.drag = 1.2; U.vmax = 0; U.kick = 0; U.kickR = 0; U.kickShell = 0; U.colRate = 2.5; U.arrN = 0; U.keep0 = 0; U.keep1 = 0;
  U.contain[0] = 0.75; U.contain[1] = 8.0; U.wind.fill(0); U.kickBias.fill(0);
  U.P.fill(0); U.Q.fill(0); U.S.fill(0); U.T.fill(0); U.V.fill(0);
  U.Ag.fill(0); U.AgV.fill(0); U.AgV[3] = 1; U.sight.fill(0);
  set4v(U.live, 1 / pxPerUnit, 1, 1, DUST_K / Math.max(0.2, R.bright));
  ARR.fill(0);
  R.mode = 0; R.jitter = 0; R.twk = 0; R.white = 0.04; R.gain = 1; R.trail = 0; R.bloom = 1; R.exposure = 1;
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
  R.jitter = 0.0022; R.twk = TWINKLE;
}
// the shared settings of a story scene
function story(mode, T, rt, o) {
  U.mode = mode; U.phaseT = T; U.rt = rt;
  U.form = o.form || 0.8; U.stagger = o.stagger === undefined ? 0.35 : o.stagger; U.ramp = o.ramp || 0.6;
  U.noise = o.noise === undefined ? 0.4 : o.noise; U.noiseFreq = o.nf || 0.9; U.colRate = o.col || 2.6;
  R.tail = o.tail || 0.05; R.jitter = o.jit || 0.0008; R.twk = TWINKLE;
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
function vel(f, t) { const a = f(t), b = f(t + 0.02); return [(b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02, (b[2] - a[2]) / 0.02]; }
// the shape a scene needs, even before it is the current one
const shapeOf = key => (curShape && curShape.key === key ? curShape : getShape(key));

/* 에이전트는 어느 장면에서나 화면에서 같은 크기로 보이도록, 카메라에서 떨어진 만큼 키운다 */
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

/* ---------------------------------------------------- 03·04·05 (스토리보드 17판) */
/* 03 · 말뜻을 알아듣고 기억하는 에이전트: 지난 대화는 잇는 선 없이 작은 말풍선 구름으로 떠 있고, 뜻이 비슷한 것끼리 무리 지어 있다.
   사람이 기억이 안 나는 얼굴로 물으면 에이전트가 질문을 호박색 작은 점으로 바꿔 구름 속 뜻이 가까운 자리에 놓는다. 그 자리에서 원이 넓어지며
   가장 가까운 셋이 가까운 것부터 밝아지고 나머지는 어두워진다. 셋은 에이전트 옆에 선 없이 나란히 놓이고, 답이 생기면 사람의 눈이 동그래지며
   빛살이 번쩍인 뒤 웃는다.
   말풍선 51 개는 한 장면의 사물 한도를 넘으므로 사물 목록 밖에서 #ov 에 바로 그린다. 구름은 3.0 초에 정면(yaw 0)에서 멈추고,
   그때 질문 자리가 페이지 평면(z 0)에 오도록 구름 전체를 깊이 방향으로 민다. 그래서 점·원·셋의 자리는 스토리보드 좌표로 바로 놓인다.
   말풍선·질문 점·원·셋은 #ov 의 실선으로 그린다(사용자 의견, 2026-10-10: 입자로 그리면 말풍선 모양이 깨진다). 구름 말풍선은 입자 층과 같은
   카메라로 매 프레임 투영해 먼 것부터 그리고, 멀수록 작고 옅고 가늘다. 말풍선·질문 점·원·셋에는 입자를 두지 않는다 */
Object.assign(LAYOUT, {
  recall: {
    W: { VW: VW_W, VH: VH_W, see: SEE_W, mid: 176, G: [474, 176], Rg: 152, ns: 1.15, Rf: 48, fr: 17, ask: [70, 258], qb: [126, 206], b0: [168, 198],
      c1: [205, 150], ag: [250, 156], c2: [350, 148], a: [220, 100], tl: [40, 74] },
    T: { VW: VW_T, VH: VH_T, G: [162, 112], Rg: 124, ns: 1.6, Rf: 39, fr: 17, ask: [56, 356], qb: [106, 300], b0: [140, 294],
      c1: [196, 268], ag: [232, 284], c2: [200, 190], a: [222, 228], tl: [40, 56] }
  },
  /* 04·05 의 책상은 왼쪽을 향해 있어, 오른쪽에서 온 동료는 담당자의 등 뒤에서 말을 건다. home 은 에이전트가 있다가 오는 곳(화면 밖 오른쪽 위),
     a1 은 둘 사이에서 답하는 자리, ctl4·ctl5 는 04·05 에서 날아오는 곡선의 조절점이다.
     두 얼굴 사이를 띄우고(넓은 화면 130, 좁은 화면 100) 에이전트가 그 사이, 얼굴보다 조금 위에 끼어들어 답한다(사용자 의견, 2026-10-10).
     질문 말풍선은 동료 머리 위에서 꼬리를 담당자 쪽(왼쪽 아래)으로, 답 말풍선은 에이전트 위에서 꼬리를 동료 쪽(오른쪽 아래)으로 둔다.
     에이전트는 질문 말풍선 위로 넘어와 거의 곧게 내려앉는다. 곡선 길이는 날아오는 0.85 초 동안 AG_V 를 넘지 않을 만큼이다.
     달은 왼쪽 위(모니터 위)에 두어 에이전트가 오는 길과 떨어진다. 위아래로 짧아진 그림이 가운데 오도록 mid 를 다시 맞춘다 */
  desk: {
    W: { VW: VW_W, VH: VH_W, see: SEE_W, mid: 180, line: [143, 341, 248], mon: [177, 182, 62, 42], stand: [208, 224, 248], fp: [283, 218], fr: 18,
      q4: [447, 218], in: 740, qb: [462, 164], ab: [350, 157], a1: [366, 200], home: [680, 130], ctl4: [375, 45], ctl5: [375, 45], moon: [190, 100] },
    T: { VW: VW_T, VH: VH_T, mid: 230, line: [28, 168, 300], mon: [32, 242, 52, 38], stand: [58, 280, 300], fp: [122, 270], fr: 18,
      q4: [256, 270], in: 380, qb: [264, 222], ab: [174, 207], a1: [190, 256], home: [380, 110], ctl4: [160, 125], ctl5: [160, 125], moon: [70, 150] }
  }
});

// a cloud point turned by yaw, then by pitch (x right, y down, z away from the viewer)
function turn3(p, yaw, pitch) {
  let [x, y, z] = p;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  [x, z] = [x * cs - z * sn, x * sn + z * cs];
  const cp = Math.cos(pitch), spp = Math.sin(pitch);
  [y, z] = [y * cp - z * spp, y * spp + z * cp];
  return [x, y, z];
}
// the storyboard's view of it, with the storyboard's own perspective. The cloud is laid out in this view, as in the storyboard
function proj3(p, yaw, pitch, cx, cy, R) { const [x, y, z] = turn3(p, yaw, pitch), f = 2.6 / (2.6 + z); return [cx + x * R * f, cy + y * R * f, f, z]; }
// the storyboard's cloud (V3, the same seed): three right by the question's spot, three more of its kind just past them, six other groups,
// and nothing else near the spot. qz is how far the spot sits in depth once the cloud has stopped
const V3 = (() => {
  const r = rng(11), pitch = 0.32, P2 = p => proj3(p, 0, pitch, 474, 176, 132);
  const q = [-0.40, 0.14, -0.40], qp = P2(q), add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const nodes = [[0.115, -0.045, 0.02], [-0.15, -0.105, 0.04], [0.055, 0.235, -0.05]].map(d => ({ p: add(q, d), s: 1.05 }));
  const g = () => (r() + r() + r() - 1.5) * 0.22;
  const far = p => { const s = P2(p); return Math.hypot(s[0] - qp[0], s[1] - qp[1]) > 62 && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.42; };
  for (let k = 0; k < 3; k++) {
    let p, n = 0;
    do {
      const a = r() * TAU, b = (r() - 0.5) * 1.2, d = 0.46 + 0.08 * r();
      p = add(q, [Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d * 0.8, Math.sin(a) * Math.cos(b) * d]);
    } while (!far(p) && ++n < 80);
    nodes.push({ p, s: 0.8 + 0.4 * r() });
  }
  [[[0.45, -0.32, 0.22], 9], [[0.05, 0.55, 0.30], 8], [[-0.22, -0.55, -0.10], 8], [[0.58, 0.28, -0.30], 7], [[-0.62, -0.20, 0.50], 7], [[0.15, -0.05, 0.65], 6]].forEach(([cc, n]) => {
    for (let k = 0; k < n; k++) {
      let p, m = 0;
      do { p = [cc[0] + g(), cc[1] + g(), cc[2] + g()]; } while (!far(p) && ++m < 80);
      nodes.push({ p, s: 0.8 + 0.4 * r() });
    }
  });
  return { nodes, q, pitch, qz: turn3(q, 0, pitch)[2] };
})();
// where a cloud point lands in the site. The engine's camera adds the perspective, and the spots the scene marks (the question's and its
// three nearest) sit on the page once the cloud has stopped, so none is added here. The storyboard enlarges that corner by its
// perspective (about 1.15), which the layouts' Rg and ns carry instead
function cloudPt(L, p, yaw) { const [x, y] = turn3(p, yaw, V3.pitch); return [L.G[0] + x * L.Rg, L.G[1] + y * L.Rg]; }
// 1 from a to b, easing in and out over e on either side: while something moves, the afterimage is kept short (trail)
const win = (t, a, b, e = 0.15) => sm(seg(t, a - e, a)) * (1 - sm(seg(t, b, b + e)));
// a node's half-width in storyboard units before the layout's node scale
const nodeS = nd => (3 + 2 * (nd.s - 0.8)) * 1.45;
// a small filled speech bubble of half-width s with its tail at the lower left (the storyboard's miniBubble)
function miniTail(s) { const w = 2 * s, h = 1.45 * s; return [[-w / 2 + s * 0.35, h / 2 - 0.4], [-w / 2 + s * 0.3, h / 2 + s * 0.6], [-w / 2 + s * 0.95, h / 2 - 0.4]]; }
const miniInk = s => c => {
  const w = 2 * s, h = 1.45 * s, t = miniTail(s);
  rrq(c, -w / 2, -h / 2, w, h, s * 0.5); c.fill();
  c.beginPath(); c.moveTo(t[0][0], t[0][1]); c.lineTo(t[1][0], t[1][1]); c.lineTo(t[2][0], t[2][1]); c.closePath(); c.fill();
};
// the dot of the question and the three found ones beside the agent (half-width 9.5), at the layout's node scale. The dot is drawn
// half again as wide as it ever shows (6.6) and scaled down (it was sized so its particles could show the bubble's outline closing into it)
const QD_S = 9.9, M3_S = 9.5;
function recallShape(rand) {
  const L = lay('recall'), sq = QD_S * L.ns, sm3 = M3_S * L.ns;
  const fc = (name, r) => ({ name, w: 2 * r * FACE_GLOW + 6, h: 2 * r * FACE_GLOW + 6, draw: INK.face(r), temp: FACE_T, white: 0.03, byPlace: faceLook(r) });
  const m3 = name => ({ name, w: 2 * sm3 + 6, h: 2 * sm3 + 6, draw: miniInk(sm3), fill: true, solid: true });
  const specs = [
    { name: 'cloud', n: 0 },
    fc('ask', L.fr),
    { name: 'q', w: 64, h: 58, draw: INK.bubble(58, 36, false), temp: 0.5, hollow: true, solid: true },
    { name: 'a', w: 64, h: 58, draw: INK.bubble(58, 36, true), hollow: true, solid: true },
    // its second shape is the question bubble's outline, which closes into the dot
    { name: 'qd', w: 66, h: 60, draw: miniInk(sq), draw2: INK.bubble(58, 36, false), hollow2: true, temp: 0.5, fill: true, solid: true },
    { name: 'ring', w: 2 * L.Rf + 8, h: 2 * L.Rf + 8, draw: c => { c.lineWidth = 1.3; c.beginPath(); c.arc(0, 0, L.Rf, 0, TAU); c.stroke(); }, b: 0.9, solid: true },
    m3('m0'), m3('m1'), m3('m2')
  ];
  return sceneShape('recall', L, specs, rand);
}
// the cloud turns slowly and eases to a stop (yaw 0) at 3.0, before the question lands, with the question's spot facing front
function recallYaw(t) {
  const W0 = 0.14, T1 = 2.4, T2 = 3.0, u = clamp(t - T1, 0, T2 - T1);
  return W0 * (Math.min(t, T1) + u - u * u / (2 * (T2 - T1))) - W0 * (T1 + (T2 - T1) / 2);
}
function recallState(L, t) {
  const o = {}, yaw = recallYaw(t), k3 = L.Rf / 48;
  const Q = cloudPt(L, V3.q, yaw), P = [0, 1, 2].map(i => cloudPt(L, V3.nodes[i].p, yaw));
  // the search: a circle widens from the question's spot; whatever it reaches lights up, nearest first, and the rest dims
  const rad = t < 3.8 ? 0 : L.Rf * (1 - Math.pow(1 - seg(t, 3.8, 5.6), 1.6));
  const lit = P.map(p => rad <= 0 ? 0 : sm((rad - Math.hypot(p[0] - Q[0], p[1] - Q[1])) / (5 * k3)));
  o.cloud = { at: L.G, vis: sm(seg(t, -0.5, 0)) };
  o.ask = { at: L.ask, vis: 1, scale: 1 + 0.07 * bump(t, 7.82, 0.16) };
  o.q = bub(L.qb, t, 0.95);
  o.q.scale *= 1 + 0.06 * bump(t, 2.25, 0.15);
  o.a = bub(L.a, t, 7.2);
  // the question becomes a small amber dot: the outline of the question bubble closes into it beside the bubble, it goes into the agent,
  // and the agent sends it out to its spot in the cloud, where it stays. Inside the agent's light it is hidden.
  // All of it is drawn in solid lines (recallMarks), with no particles
  const qd = { at: L.qb, vis: 1, morph: 1, scale: 1 };
  if (t >= 2.2) {
    qd.morph = 0;
    if (t < 2.46) { const k = sm(seg(t, 2.2, 2.46)); qd.at = lerp2(L.qb, L.b0, k); qd.morph = 1 - k; qd.scale = mix(1, 6.4 / QD_S, k); }
    else if (t < 2.9) { const k = sm(seg(t, 2.45, 2.9)); qd.at = qpt(L.b0, L.c1, L.ag, k); qd.scale = 6.4 * (1 - 0.25 * k) / QD_S; }
    else if (t < 3.0) { qd.at = L.ag; qd.scale = 4.8 / QD_S; }
    else { const k = sm(seg(t, 3.0, 3.65)); qd.at = qpt(L.ag, L.c2, [Q[0], Q[1]], k); qd.scale = mix(4.8, 6.6, k) * (1 + 0.18 * bump(t, 3.72, 0.14)) / QD_S; }
    qd.glow = -0.85 * (1 - sm(Math.hypot(qd.at[0] - L.ag[0], qd.at[1] - L.ag[1]) / 14));
  }
  o.qd = qd;
  o.ring = { at: [Q[0], Q[1]], vis: 1, scale: Math.max(0.02, rad / L.Rf),
    glow: clamp(rad / (0.25 * L.Rf), 0, 1) * (0.8 - 0.35 * sm(seg(t, 5.6, 6.4))) - 1 };
  // the lit three come out and line up beside the agent, nearest on the left, with nothing joining them; the ones in the cloud stay lit
  const m = [];
  for (let q = 0; q < 3; q++) {
    const k = outCubic(seg(t, 5.9 + q * 0.16, 6.6 + q * 0.16)), from = P[q], to = [L.ag[0] + (q - 1) * L.tl[0], L.ag[1] + L.tl[1]];
    const ctl = [mix(from[0], to[0], 0.55), Math.max(from[1], to[1]) + 26 * k3], s = mix(nodeS(V3.nodes[q]) * L.ns * 1.35, M3_S * L.ns, k);
    o['m' + q] = { at: k > 0 ? qpt(from, ctl, to, k) : [from[0], from[1]], vis: 1, scale: s / (M3_S * L.ns) };
    m.push({ k, s });
  }
  const p = pulseOf(bump(t, 2.93, 0.2) + bump(t, 5.9, 0.22) + bump(t, 7.15, 0.22));
  const moving = Math.max(win(t, 2.45, 2.9), win(t, 3.0, 3.65), win(t, 5.9, 6.92), win(t, 7.2, 7.6));
  return { o, yaw, dim: sm(seg(t, 4.0, 5.4)), lit, Q, P, rad, m, agGlow: p.glow, agSize: p.size, trail: mix(0.3, 0.1, moving) };
}
function recallAg(L) { return L.ag; }
// a soft round light of radius r in storyboard units, for what the storyboard lights with a glow
function haloAt(sh, x, y, a, r, rgb, peak) {
  mk(sh, x, y, a, c => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rgb},${peak})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  });
}
// the line widths (CSS px) of 03's small bubbles: the cloud's at the page's depth (thinner farther off), the three that come out, and the
// amber question dot, a little heavier as what the eye should follow
const CLOUD_W = 1.1, M3_W = 1.4, QD_W = 1.7;
// miniInk's bubble as a solid line: a rounded box of half-width s with its tail at the lower left, lw CSS px wide, faintly tinted inside
function miniLine(c, s, col, lw, fillA = 0.06) {
  const w = 2 * s, h = 1.45 * s, q = miniTail(s);
  boxLine(c, -w / 2, -h / 2, w, h, s * 0.5, col, 1, lw, fillA);
  c.fillStyle = col(1); c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.closePath(); c.fill();
}
// the cloud's bubbles, far ones first. Each is turned by yaw and pitch, pushed back by qz
// and goes through the page camera, so far ones come out smaller; they are also fainter and thinner. The rest dim as the search lights
// the nearest three, which grow a quarter and go fully bright
function cloudLines(sh, S, a) {
  const L = sh.L, F = sh.F, R = L.Rg * F.s, G = vw(F, L.G[0], L.G[1]), at = w => project(w[0], w[1], w[2]);
  const c0 = at([G[0], G[1], 0]), c1 = at([G[0] + 8 * F.s, G[1], 0]);
  if (!c0 || !c1 || !(a > 0.004)) return;
  const s0 = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const all = V3.nodes.map((nd, i) => { const [x, y, z] = turn3(nd.p, S.yaw, V3.pitch); return { nd, i, w: [G[0] + x * R, G[1] - y * R, (V3.qz - z) * R] }; });
  all.sort((u, v) => u.w[2] - v.w[2]);
  for (const { nd, i, w } of all) {
    const p = at(w), q = at([w[0] + 8 * F.s, w[1], w[2]]);
    if (!p || !q) continue;
    const f = clamp(Math.hypot(q[0] - p[0], q[1] - p[1]) / s0, 0.7, 1.3), lk = i < 3 ? S.lit[i] : 0, base = 0.85 * (0.55 + 0.45 * f);
    mkAt(p, q, a * (lk > 0 ? mix(base, 1, lk) : base * (1 - 0.72 * S.dim)), c => miniLine(c, nodeS(nd) * L.ns * (1 + 0.25 * lk), creamA, CLOUD_W * f * (1 + 0.3 * lk)));
  }
}
function recallMarks(sh, S, D, a, t) {
  const L = sh.L, o = S.o, d = D.o, CR = '246,236,223', AM = '255,168,77', ca = a * Math.min(o.cloud.vis, d.cloud.vis);
  // the faint inside of the search circle
  if (S.rad > 0) {
    mk(sh, S.Q[0], S.Q[1], a, c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, S.rad);
      g.addColorStop(0, `rgba(${CR},0.02)`); g.addColorStop(0.8, `rgba(${CR},0.05)`); g.addColorStop(1, `rgba(${CR},0.09)`);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, S.rad, 0, TAU); c.fill();
    });
  }
  // the light around the found three in the cloud, then the cloud
  S.lit.forEach((lk, q) => { if (lk > 0) haloAt(sh, S.P[q][0], S.P[q][1], ca, nodeS(V3.nodes[q]) * L.ns * (1 + 0.25 * lk) * 3.4, CR, 0.3 * lk); });
  cloudLines(sh, S, ca);
  // the search circle, fainter once the three have been found
  if (S.rad > 0) mk(sh, S.Q[0], S.Q[1], a * mix(0.75, 0.45, sm(seg(t, 5.6, 6.4))), c => { c.strokeStyle = creamA(1); c.lineWidth = px(SW.link); c.beginPath(); c.arc(0, 0, S.rad, 0, TAU); c.stroke(); });
  // the question bubble's outline closing into the dot beside it, then the dot with its light (hidden inside the agent's)
  if (t >= 2.2 && t < 2.5) {
    const k = sm(seg(t, 2.2, 2.46)), w = mix(58, 12.8 * L.ns, k), h = mix(36, 9.28 * L.ns, k);
    mk(sh, o.qd.at[0], o.qd.at[1], a * 0.9 * (1 - sm(seg(t, 2.42, 2.5))), c => boxLine(c, -w / 2, -h / 2, w, h, mix(8, 3.2 * L.ns, k), amberA, 1, mix(SW.bub, QD_W, k), mix(0.08, 0.12, k)));
  }
  if (t >= 2.42) {
    const qa = a * seg(t, 2.42, 2.48) * (1 + o.qd.glow), s = QD_S * L.ns * o.qd.scale;
    haloAt(sh, o.qd.at[0], o.qd.at[1], qa, s * 3.2, AM, t >= 3.65 ? 0.32 : 0.22);
    mk(sh, o.qd.at[0], o.qd.at[1], qa, c => miniLine(c, s, amberA, QD_W, 0.12));
  }
  // the three as they come out and line up beside the agent
  S.m.forEach((m, q) => {
    if (m.k <= 0) return;
    const p = o['m' + q].at;
    haloAt(sh, p[0], p[1], a, m.s * 3, CR, 0.24 - 0.14 * sm(seg(t, 6.6 + q * 0.16, 7.0 + q * 0.16)));
    mk(sh, p[0], p[1], a, c => miniLine(c, m.s, creamA, M3_W));
  });
  const ex = exprOf(t, [[0, 'neutral'], [0.8, 'recall'], [7.7, 'aha'], [9.1, 'happy']]), ray = t >= 7.7 && t < 8.3 ? seg(t, 7.7, 8.3) : 0;
  mkP(sh, L.ask[0], L.ask[1], a, c => { c.scale(o.ask.scale, o.ask.scale); face345(c, L.fr, ex); rays(c, L.fr, ray); });
  mk(sh, o.q.at[0], o.q.at[1], a * Math.min(o.q.vis, d.q.vis), c => { c.scale(o.q.scale, o.q.scale); bubbleLine(c, 58, 36, false, amberA); lines3(c, 58, AMBER_S); });
  mk(sh, o.a.at[0], o.a.at[1], a * Math.min(o.a.vis, d.a.vis), c => { c.scale(o.a.scale, o.a.scale); bubbleLine(c, 58, 36, true, creamA); lines3(c, 58, CREAM_S); });
}

/* 03~05 의 얼굴: 함께 쓰는 이목구비(feat)에 이 장면들이 더하는 셋. look 은 무표정한 눈을 스토리보드의 한 점 쪽(얼굴에서 본 dx, dy)으로 돌리고,
   flip 은 얼굴을 좌우로 뒤집어 'focus' 가 왼쪽 화면을 보게 한다 */
function face345(c, r, x) {
  if (x.flip) c.scale(-1, 1);
  const k = x.k || 0, look = x.look && x.flip ? [-x.look[0], x.look[1]] : x.look;
  feat345(c, r, x.e, x.e2 ? 1 - k : 1, look);
  if (x.e2) feat345(c, r, x.e2, k, look);
}
function feat345(c, r, e, al, look) {
  if (e !== 'recall' && e !== 'aha' && !(look && e === 'neutral')) { feat(c, r, e, al); return; }
  if (al <= 0 || c === under) return;
  c.save();
  c.globalAlpha *= al;
  c.strokeStyle = FEAT; c.fillStyle = FEAT; c.lineWidth = Math.max(1.4, r * 0.12);
  const ex = r * 0.36, ey = -r * 0.1, dot = (x, y, rr) => { c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); };
  if (e === 'recall') {
    // trying to remember: the eyes up to one side, the mouth a short slanted line
    [-1, 1].forEach(d => dot(d * ex - r * 0.14, ey - r * 0.2, r * 0.11));
    c.beginPath(); c.moveTo(-r * 0.04, r * 0.47); c.lineTo(r * 0.24, r * 0.37); c.stroke();
  } else if (e === 'aha') {
    // "ah": round eyes and a small round mouth
    [-1, 1].forEach(d => dot(d * ex, ey - r * 0.05, r * 0.165));
    c.beginPath(); c.ellipse(0, r * 0.45, r * 0.11, r * 0.14, 0, 0, TAU); c.fill();
  } else {
    const l = Math.hypot(look[0], look[1]) || 1, lx = look[0] / l * r * 0.13, ly = look[1] / l * r * 0.1;
    [-1, 1].forEach(d => dot(d * ex + lx, ey + ly, r * 0.11));
    c.beginPath(); c.moveTo(-r * 0.24, r * 0.38); c.lineTo(r * 0.24, r * 0.38); c.stroke();
  }
  c.restore();
}
// the "ah" over a face: five short amber strokes shoot out around its top and fade, q from 0 to 1
function rays(c, r, q) {
  if (!(q > 0 && q < 1)) return;
  const len = r * 0.55 * outCubic(seg(q, 0, 0.3)), r0 = r * (1.24 + 0.22 * outCubic(q));
  c.save();
  c.globalAlpha *= 1 - sm(seg(q, 0.5, 1));
  c.strokeStyle = AMBER_S; c.lineWidth = Math.max(1.6, r * 0.11);
  [[-90, 1], [-60, 0.85], [-120, 0.85], [-32, 0.66], [-148, 0.66]].forEach(([dg, f]) => {
    const th = dg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    c.beginPath(); c.moveTo(cs * r0, sn * r0); c.lineTo(cs * (r0 + len * f), sn * (r0 + len * f)); c.stroke();
  });
  c.restore();
}

/* 04·05 · 낮과 밤의 책상: 에이전트는 담당자 곁이 아니라 화면 밖 오른쪽 위에 있다가, 동료가 담당자의 등 뒤에서 말을 걸면 날아와
   둘 사이에서 대신 답한다. 담당자는 낮에는 끝까지 모니터만 보고, 밤에는 그대로 잔다 */
// the floor line and the stand. The screen is its own object: only its frame takes particles (hollow), so its lines stay readable
function deskInk(L) {
  return c => {
    c.globalAlpha = 0.6; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(L.line[0], L.line[2]); c.lineTo(L.line[1], L.line[2]); c.stroke();
    c.globalAlpha = 0.95; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(L.stand[0], L.stand[1]); c.lineTo(L.stand[0], L.stand[2]); c.stroke();
  };
}
// at night the screen is off: only its frame shows, with nothing inside
function screenInk(L, off) {
  return c => {
    const m = L.mon;
    if (!off) { c.globalAlpha = 0.08; rrq(c, m[0], m[1], m[2], m[3], 4); c.fill(); }
    c.globalAlpha = 0.95; c.lineWidth = 1.5; rrq(c, m[0], m[1], m[2], m[3], 4); c.stroke();
  };
}
// the desk as solid lines: the floor, the stand and the monitor's frame. k is how bright they are (05's dark room: 0.45, as the particles
// were at glow -0.55); at night the screen is off, so its frame has no tint inside
function deskLines(sh, L, a, k, night) {
  mkS(sh, a * k, (c, P) => {
    const l0 = P(L.line[0], L.line[2]), l1 = P(L.line[1], L.line[2]), s0 = P(L.stand[0], L.stand[1]), s1 = P(L.stand[0], L.stand[2]);
    c.strokeStyle = creamA(0.55); c.lineWidth = SW.ring; c.beginPath(); c.moveTo(l0[0], l0[1]); c.lineTo(l1[0], l1[1]); c.stroke();
    c.strokeStyle = creamA(0.8); c.lineWidth = SW.box; c.beginPath(); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke();
  });
  const m = L.mon;
  mk(sh, m[0], m[1], a * k, c => boxLine(c, 0, 0, m[2], m[3], 4, creamA, 0.8, SW.box, night ? 0 : 0.05));
}
function deskShape(key, night, rand) {
  const L = lay('desk');
  const fc = (name, r) => ({ name, w: 2 * r * FACE_GLOW + 6, h: 2 * r * FACE_GLOW + 6, draw: INK.face(r), temp: FACE_T, white: 0.03, byPlace: faceLook(r) });
  const screen = { name: 'screen', abs: true, w: L.VW, h: L.VH, draw: screenInk(L, night), b: 0.8, solid: true };
  if (!night) screen.hollow = true;
  const specs = [{ name: 'desk', abs: true, w: L.VW, h: L.VH, draw: deskInk(L), b: 0.8, solid: true }, screen, fc('fp', L.fr), fc('ask', 16),
    { name: 'q', w: 64, h: 58, draw: INK.bubble(58, 36, false), temp: 0.5, hollow: true, solid: true },
    { name: 'a', w: 64, h: 58, draw: INK.bubble(58, 36, true), hollow: true, solid: true }];
  if (night) specs.push({ name: 'moon', w: 40, h: 40, draw: INK.moon(17), b: 0.65, white: 0.02, fill: true });
  return sceneShape(key, L, specs, rand);
}
// a trip at an even pace in the middle that eases in over its first fifth and out over its last three tenths. Its fastest pace is a third
// above the mean, where a smooth step goes half again above it and the agent would fall behind the engine's speed cap (AG_V)
function cruise(u) {
  const a = 0.2, b = 0.3, v = 1 / (1 - a / 2 - b / 2);
  u = clamp(u, 0, 1);
  return u < a ? v * u * u / (2 * a) : u <= 1 - b ? v * (a / 2 + u - a) : 1 - v * (1 - u) * (1 - u) / (2 * b);
}
// a point along a quadratic curve by the share of its length, so an even share is an even pace on screen
function alongQ(p0, p1, p2, u) {
  const n = 32, S = [0];
  let prev = p0;
  for (let i = 1; i <= n; i++) { const p = qpt(p0, p1, p2, i / n); S.push(S[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const d = clamp(u, 0, 1) * S[n];
  let i = 1;
  while (i < n && S[i] < d) i++;
  return qpt(p0, p1, p2, (i - 1 + (d - S[i - 1]) / ((S[i] - S[i - 1]) || 1)) / n);
}
const FLY = 0.85;
// 04, once (사용자 의견, 2026-10-10): a colleague walks up behind the person and speaks; the agent comes from home, answers between the
// two and stays there to the end, as in 05. The person keeps working all scene
const DAY = { t0: 0.4, q: 2.0, go: 2.8, a: 3.75, h: 4.45 };
// where the agent is in 04: k runs from 0 at home to 1 between the two; null before it sets off
const dayTrip = (L, t) => t < DAY.go ? null : cruise(seg(t, DAY.go, DAY.go + FLY));
// it fades in over the first quarter of the way in and out over the last quarter of the way home
const tripGlow = k => k === null ? 0 : clamp(k / 0.25, 0, 1);
function dayState(L, t) {
  const o = {};
  o.desk = { abs: true, vis: 1 };
  o.screen = { abs: true, vis: 1 };
  o.fp = { at: L.fp, vis: 1 };
  o.ask = { at: [mix(L.in, L.q4[0], outCubic(seg(t, DAY.t0, DAY.t0 + 1.4))), L.q4[1]], vis: t >= DAY.t0 ? 1 : 0 };
  o.q = bub(L.qb, t, DAY.q);
  o.a = bub(L.ab, t, DAY.a);
  const k = dayTrip(L, t), p = pulseOf(bump(t, DAY.go + FLY, 0.2) + bump(t, DAY.a, 0.2));
  // before the scene starts the agent leaves the last scene's spot for home, fading out on the way
  const g = t < 0 ? 1 - sm(seg(t, -0.5, -0.15)) : tripGlow(k);
  const mv = Math.max(win(t, -0.5, -0.15), win(t, DAY.t0, DAY.t0 + 1.4), win(t, DAY.go, DAY.go + FLY));
  return { o, agGlow: g * p.glow, agSize: p.size, trail: mix(0.3, 0.1, mv) };
}
function dayAg(L, t) { const k = dayTrip(L, t); return k === null ? L.home : alongQ(L.home, L.ctl4, L.a1, k); }
function dayMarks(sh, S, D, a, t) {
  const L = sh.L, o = S.o, d = D.o;
  deskLines(sh, L, a, 1, false);
  monitor(sh, L, a, 1, true);
  mkP(sh, L.fp[0], L.fp[1], a, c => face345(c, L.fr, { e: 'focus', flip: true }));
  const ex = exprOf(t, [[0, 'neutral'], [DAY.h, 'happy']]);
  ex.look = [L.fp[0] - o.ask.at[0], L.fp[1] - o.ask.at[1]];
  mkP(sh, o.ask.at[0], o.ask.at[1], a * Math.min(o.ask.vis, d.ask.vis), c => face345(c, 16, ex));
  mk(sh, o.q.at[0], o.q.at[1], a * Math.min(o.q.vis, d.q.vis), c => { c.scale(o.q.scale, o.q.scale); bubbleLine(c, 58, 36, false, amberA); lines3(c, 58, AMBER_S); });
  mk(sh, o.a.at[0], o.a.at[1], a * Math.min(o.a.vis, d.a.vis), c => { c.scale(o.a.scale, o.a.scale); bubbleLine(c, 58, 36, true, creamA); lines3(c, 58, CREAM_S); });
}
// 05: the agent comes the way it came in 04, over the colleague's question, to the spot between the two
const nightTrip = t => t < 4.4 ? null : cruise(seg(t, 4.4, 5.25));
function nightState(L, t) {
  const o = {};
  o.desk = { abs: true, vis: 1, glow: -0.55 };
  o.screen = { abs: true, vis: 1, glow: -0.55 };
  o.fp = { at: L.fp, vis: 1, glow: -0.5 };
  o.moon = { at: L.moon, vis: 1 };
  o.ask = { at: [mix(L.in, L.q4[0], outCubic(seg(t, 0.5, 1.9))), L.q4[1]], vis: t >= 0.5 ? 1 : 0 };
  // with no one to answer, the question shrinks down onto the speaker's head and dims; it fills out again once the agent has come
  const sh = sm(seg(t, 2.7, 3.25)) * (1 - sm(seg(t, 5.05, 5.35))), s = 1 - 0.5 * sh;
  o.q = bub([L.qb[0], L.qb[1] + 18 * (1 - s)], t, 2.0);
  o.q.scale *= s; o.q.glow = -0.6 * sh;
  o.a = bub(L.ab, t, 5.35);
  const k = nightTrip(t), p = pulseOf(bump(t, 5.25, 0.22));
  const g = t < 0 ? 1 - sm(seg(t, -0.5, -0.15)) : tripGlow(k);
  const mv = Math.max(win(t, -0.5, -0.15), win(t, 0.5, 1.9), win(t, 4.4, 5.25));
  return { o, agGlow: g * p.glow, agSize: p.size, trail: mix(0.3, 0.1, mv) };
}
function nightAg(L, t) { const k = nightTrip(t); return k === null ? L.home : alongQ(L.home, L.ctl5, L.a1, k); }
function nightMarks(sh, S, D, a, t) {
  const L = sh.L, o = S.o, d = D.o;
  deskLines(sh, L, a, 0.45, true);
  monitor(sh, L, a, 0.15, false);
  // the sleeper's face is already dimmed by its particles (glow); its closed eyes stay solid, or the bright dots show through the lines
  mkP(sh, L.fp[0], L.fp[1], a, c => face345(c, L.fr, { e: 'sleep' }));
  zzz(sh, L.fp[0] - 16, L.fp[1] - 20, a * 0.6, -1);
  const ex = exprOf(t, [[0, 'neutral'], [2.7, 'worried'], [6.0, 'happy']]);
  ex.look = [L.fp[0] - o.ask.at[0], L.fp[1] - o.ask.at[1]];
  mkP(sh, o.ask.at[0], o.ask.at[1], a * Math.min(o.ask.vis, d.ask.vis), c => face345(c, 16, ex));
  mk(sh, o.q.at[0], o.q.at[1], a * Math.min(o.q.vis, d.q.vis) * (1 + o.q.glow), c => { c.scale(o.q.scale, o.q.scale); bubbleLine(c, 58, 36, false, amberA); lines3(c, 58, AMBER_S); });
  mk(sh, o.a.at[0], o.a.at[1], a * Math.min(o.a.vis, d.a.vis), c => { c.scale(o.a.scale, o.a.scale); bubbleLine(c, 58, 36, true, creamA); lines3(c, 58, CREAM_S); });
}
/* ---------------------------------------------------- 06 · ai-ready (스토리보드 17판) */
/* 프로젝트 테두리 안에 문서·편집기·에이전트가 있고, 그 오른쪽에 프로젝트와 따로 선 세로 빛 막(검사 층), 그 너머에 main 줄이 있다.
   규칙 두 줄이 문서에서 빠져나와 검사 층에 박힌 방패가 되고 문서는 짧아진다. PR 은 검사 층을 지나 브랜치 줄을 그리며 main 에 합류해
   그 자리의 점 하나로 줄어든다. 실수(주황 조각)가 든 PR 은 main 앞에서 멈추고 사람이 같은 조각이 든 말풍선으로 지적한다.
   에이전트가 그 조각을 검사 층에 세 번째 방패로 세우면 같은 실수는 검사 층에서 걸린다.
   브랜치 줄은 합류하는 동안만 보이고 점이 놓인 뒤 옅어져 사라진다(사용자 의견, 2026-10-10). 멈춘 PR 의 갈래는 점선과 ✕ 로 남았다가,
   고친 PR 이 같은 갈래를 따라 내려오면 지나간 만큼 실선이 되고 ✕ 는 카드 밑에서 사라진다. 고친 PR 은 그 갈래가 향하던 자리에 합류한다.
   검사 층은 가운데가 가장 밝고 양옆·위아래로 사라지는 빛 띠로, 입자가 아니라 선명한 층(#ov)에 매끈한 그러데이션으로 그린다(layerBand6).
   PR 이 지나거나 걸리면 그 자리의 밝기·색만 바뀐다.
   테두리를 가진 사물(프로젝트·문서·편집기·PR 카드·방패·말풍선)과 문서의 규칙 줄, main 줄·머지 점·브랜치 줄은 모두 선명한 층(#ov)에
   실선으로 그린다(사용자 의견, 2026-10-10). 이 사물들에는 입자를 두지 않고, 실선이 사물의 보임을 따라 서서히 나타나고 사라진다.
   main 줄·머지 점·브랜치 줄은 같은 화면 점(sp, mkS)으로 그려서, 합류한 브랜치 줄의 끝이 그 머지 점 가운데에 닿는다.
   좁은 화면(L6T)은 320×400 칸에서 흐름을 아래로 돌린다. 위에 프로젝트, 가운데 가로 검사 층, 그 아래 왼쪽에 사람과 말풍선,
   오른쪽에 세로로 내려가는 main 이 온다. PR 이 지나는 길의 자리(길을 따라 u, 길을 가로질러 v)는 두 배치가 같은 식으로 쓰고,
   f6 이 그 자리를 화면 칸으로 옮긴다(좁은 화면은 u 와 v 를 바꾼다). 나머지(프로젝트·문서·편집기·사람·말풍선·에이전트 길)는 칸 좌표다 */
const L6 = { VW: VW_W, VH: VH_W, see: SEE_W, mid: 178, LX: 336, LY: [14, 346], LANE: 214, MY: 300, SL: [158, 270, 214], FORM: [236, 214], RET: [262, 214],
  AT: 302, PAST: 370, M: [458, 488], PF: [572, 100], fr: 18, CB: [500, 62], LOOK: [-1, 0], HOME: [200, 150], AGB: [446, 104], DROP: [366, 184],
  doc: [36, 48, 96, 112, 68], RY: [72, 94, 116, 138], RL: [60, 46, 66, 50], ed: [36, 176, 226, 128],
  rows: [206, 222, 238, 254, 270, 286], lens: [150, 112, 166, 92, 138, 104], proj: [16, 30, 278, 296], old: [398, 428], mainX: [372, 414, 640, 700],
  RX: 150, AGC: { go: [[310, 100], [400, 150]], cr: [430, 170], back: [340, 60] }, xs: 1, stopD: 27 };
// the narrow layout. LX, LY, LANE, MY, SL, M, AT, PAST, FORM[0], RET[0], old, mainX are flow places (see f6); the rest are frame places.
// The selected code rows are the editor's bottom two, so the card made on them slides straight down out of the project.
// The card is wider than tall, so it stops further from main across the flow (stopD) to leave the same gap as on wide screens
const L6T = { VW: VW_T, VH: VH_T, TR: 1, LX: 204, LY: [6, 314], LANE: 170, MY: 256, SL: [100, 240, 170], FORM: [120, 170], RET: [132, 170],
  AT: 176, PAST: 238, M: [306, 326], PF: [40, 352], fr: 18, CB: [84, 308], LOOK: [0.7, -0.7], HOME: [108, 136], AGB: [128, 314], DROP: [140, 236],
  doc: [20, 18, 72, 104, 64], RY: [40, 60, 80, 100], RL: [40, 30, 44, 32], ed: [124, 18, 180, 124],
  rows: [128, 112, 96, 80, 64, 48], lens: [120, 90, 133, 74, 110, 83], proj: [8, 6, 304, 144], old: [266, 286], mainX: [240, 262, 372, 398],
  RX: 108, AGC: { go: [[48, 196], [130, 250]], cr: [110, 272], back: [120, 180] }, xs: 1.35, stopD: 36 };
// a flow place [along, across] in frame units
const f6 = (L, p) => L.TR ? [p[1], p[0]] : p;
// the PRs: s lines picked, f card made, g at the check layer, p past it, e merged into main (or stopped); back = sent back to the project
const PR6 = [{ s: 2.25, f: 2.45, g: 2.9, p: 3.15, e: 3.6, r: 0 }, { s: 4.15, f: 4.35, g: 4.8, p: 5.05, e: 5.5, r: 1, bad: 1, stop: 1, back: 6.35 },
  { s: 8.7, f: 8.9, g: 9.35, bad: 1, block: 1, back: 10.95 }, { f: 11.55, g: 11.95, p: 12.2, e: 12.65, r: 1, fixed: 1 }];
// the agent goes to the comment, takes its fragment, carries it to the layer and sets it as the third shield
const GO6 = 6.55, TK6 = 7.15, CR6 = 7.45, DP6 = 8.0, SH6 = 8.2, ENF6 = [0, 2];
// a small thing that is made on the spot (a PR card, a merged point, a shield, a piece). It grows out of a point as it pops (scale),
// the way the storyboard draws it. These are solid objects with no particles (20_objects); glow and stiff are what their particles
// took before. lit is how far it has lit up; its marks follow lit a tenth of a second behind (mk67)
const made67 = (at, lit, scale, glow = 0, extra) => Object.assign({ at, vis: 1, lit, scale: Math.max(0.05, scale), glow: lit - 1 + glow * lit, stiff: 3 }, extra);
const bez6 = (p0, p1, p2, p3, k) => { const u = 1 - k; return [0, 1].map(d => u * u * u * p0[d] + 3 * u * u * k * p1[d] + 3 * u * k * k * p2[d] + k * k * k * p3[d]); };
// a polyline walked by arc length
function walk67(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  return { len, at: u => { const d = clamp(u, 0, 1) * len; let i = 1; while (i < pts.length - 1 && cum[i] < d) i++; return lerp2(pts[i - 1], pts[i], clamp((d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1)); } };
}
// the branch line from just past the layer, bending down into main at each merge point, and how far along it the stopped PR halts.
// The merge points M come right after the old commits at the same spacing (30 units, 20 on narrow screens; 사용자 의견, 2026-10-10)
function routes6(L) {
  if (L.RT) return L.RT;
  L.RT = L.M.map(mx => {
    const a = [L.PAST, L.LANE], p = [a];
    for (let i = 1; i <= 30; i++) p.push(bez6(a, [mix(L.PAST, mx, 0.6), L.LANE], [mx, mix(L.LANE, L.MY, 0.3)], [mx, L.MY], i / 30));
    return walk67(p);
  });
  let u = 0;
  while (u < 1 && L.RT[1].at(u)[1] < L.MY - L.stopD) u += 0.005;
  L.stopU = u;
  return L.RT;
}
// where each PR card is: null before it is made and after it has gone into main (or back into the project).
// The held card and the fixed one after it are one card, so it does not fade between them
function cards6(L, t) {
  const RT = routes6(L);
  return PR6.map(P => {
    if (t < P.f) return null;
    const st = P.fixed ? L.RET[0] : L.FORM[0];
    let x = st, y = L.LANE, a = 1, s = P.fixed ? 1 : pop(t, P.f), hit = 0, ok = 0, fix = P.fixed ? 1 : 0;
    if (t < P.g) x = mix(st, L.AT, sm(seg(t, P.fixed ? P.f : P.f + 0.2, P.g)));
    else if (P.block) {
      if (t >= PR6[3].f) return null;
      if (t < P.back) { x = L.AT + Math.sin(t * 64) * 2.6 * bump(t, P.g + 0.12, 0.14); hit = 0.55 + 0.45 * Math.sin((t - P.g) * 9) ** 2; }
      else { x = mix(L.AT, L.RET[0], sm(seg(t, P.back, P.back + 0.25))); fix = sm(seg(t, P.back + 0.32, P.back + 0.55)); }
    } else if (t < P.p) { x = mix(L.AT, L.PAST, seg(t, P.g, P.p)); ok = bump(t, (P.g + P.p) / 2, 0.18); }
    else if (P.stop) {
      if (t < P.back) { [x, y] = RT[1].at(L.stopU * outCubic(seg(t, P.p, P.e))); x += Math.sin(t * 60) * 2 * bump(t, P.e + 0.06, 0.1); }
      else {
        const q = t - P.back;
        if (q < 0.35) [x, y] = RT[1].at(L.stopU * (1 - sm(q / 0.35)));
        else if (q < 0.55) x = mix(L.PAST, L.AT, sm((q - 0.35) / 0.2));
        // its light goes out by 0.8 so the particles, which follow their light about 0.15 s behind, are dark when the storyboard's
        // card is gone (0.95)
        else { x = mix(L.AT, L.RET[0], sm(seg(q, 0.55, 0.8))); a = 1 - sm(seg(q, 0.65, 0.8)); }
      }
    } else if (t < P.e) [x, y] = RT[P.r].at(sm(seg(t, P.p, P.e)));
    // it shrinks into its point on main, and its light goes out as the point lights up
    else { x = L.M[P.r]; y = L.MY; s = 1 - sm(seg(t, P.e + 0.05, P.e + 0.45)); a = 1 - sm(seg(t, P.e + 0.25, P.e + 0.45)); }
    if (a <= 0 || s <= 0.02) return null;
    [x, y] = f6(L, [x, y]);
    return { x, y, a, s, hit, ok, fix, bad: !!P.bad, lit: P.fixed ? 1 : sm(seg(t, P.f, P.f + 0.12)), grow: !P.fixed && t < P.f + 0.35 };
  });
}
// a soft elliptical glow (storyboard eglow) along its long axis: its alpha dy from the middle
const eg6 = (dy, ry, al) => { const r = Math.abs(dy) / ry; return al * (r < 0.45 ? 1 - 0.58 * r / 0.45 : r < 1 ? 0.42 * (1 - (r - 0.45) / 0.55) : 0); };
/* 검사 층을 따라 64 칸의 빛(크림·주황). 스토리보드는 알파 .26 의 막 위에 빛을 더했으므로 같은 비율(빛 / .26)로 입자 밝기를 더한다.
   방패가 박힌 자리의 작은 부풂, 박힐 때와 PR 이 지날 때 위아래로 번지는 빛, 걸린 PR 앞의 주황 번짐과 새 방패를 세울 때의 주황 빛 */
function light6(L, t) {
  const [y0, y1] = L.LY, n = 64, lc = new Float32Array(n), lo = new Float32Array(n), B = PR6[2];
  const add = (arr, y, ry, al) => { if (al > 0.001) for (let j = 0; j < n; j++) arr[j] += eg6(y0 + j * (y1 - y0) / (n - 1) - y, ry, al) / 0.26; };
  const pulse = (arr, from, q, dur, al) => {
    if (q <= 0 || q >= dur) return;
    const d = q * 270, f = al * (1 - q / dur) ** 2;
    [from - d, from + d].forEach(yy => { const e = Math.min(1, (yy - y0) / 50, (y1 - yy) / 50); if (e > 0) add(arr, yy, 28, f * e); });
  };
  [[L.SL[0], 2.07], [L.SL[1], 2.19], [L.SL[2], SH6]].forEach(([y, t0]) => { add(lc, y, 30, 0.1 * seg(t, t0, t0 + 0.28)); pulse(lc, y, t - t0, 0.9, 0.22); });
  PR6.forEach(P => { if (!P.p) return; const tc = (P.g + P.p) / 2; add(lc, L.LANE, 34, 0.4 * bump(t, tc, 0.3)); pulse(lc, L.LANE, t - tc, 1.2, 0.42); });
  const k = sm(seg(t, B.g, B.g + 0.15)) * (1 - sm(seg(t, B.back, B.back + 0.35)));
  add(lo, L.LANE, 26 + 64 * sm(seg(t, B.g, B.g + 0.7)), 0.6 * k * (0.6 + 0.4 * Math.sin((t - B.g) * 9) ** 2));
  pulse(lo, L.LANE, t - B.g, 1, 0.36);
  if (t >= SH6 - 0.05 && t < SH6 + 0.6) add(lo, L.LANE, 34, 0.4 * (1 - seg(t, SH6, SH6 + 0.6)));
  return { lc, lo };
}
function rulesState(L, t) {
  const o = {}, fin = sm(seg(t, -0.5, -0.1)), [DX, , DW, DH0] = L.doc, DY = L.doc[1], shrink = sm(seg(t, 1.9, 2.3)), B = PR6[2], P = L.proj;
  const passK = PR6.reduce((m, q) => q.p ? Math.max(m, bump(t, (q.g + q.p) / 2, 0.2)) : m, 0);
  const blk = t >= B.g && t < B.back ? (0.6 + 0.4 * Math.sin((t - B.g) * 9) ** 2) * sm(seg(t, B.g, B.g + 0.15)) : 0;
  o.proj = { at: [P[0] + P[2] / 2, P[1] + P[3] / 2], vis: fin };
  o.main = { at: f6(L, [(L.mainX[0] + L.mainX[3]) / 2, L.MY]), vis: fin };
  o.dots = { at: f6(L, [(L.old[0] + L.old[1]) / 2, L.MY]), vis: fin };
  o.layer = { at: f6(L, [L.LX, (L.LY[0] + L.LY[1]) / 2]), vis: fin };
  o.doc = { at: [DX + DW / 2, DY + DH0 / 2], vis: fin, morph: shrink };
  o.ed = { at: [L.ed[0] + L.ed[2] / 2, L.ed[1] + L.ed[3] / 2], vis: fin };
  // the agent reads the rules top to bottom; the two a check can enforce light up, leave the document and roll up into shields in the layer
  L.RY.forEach((ry, i) => {
    const hi = bump(t, 0.6 + i / 3 * 0.65, 0.2), e = ENF6.indexOf(i), cx = DX + 24 + L.RL[i] / 2;
    if (e < 0) { o['r' + i] = { at: [cx, mix(ry, L.RY[i === 1 ? 0 : 1], shrink)], vis: fin, glow: 0.6 * hi }; return; }
    const t0 = 1.42 + e * 0.12, k = outCubic(seg(t, t0, t0 + 0.65));
    o['r' + i] = { at: lerp2([cx, ry], f6(L, [L.LX, L.SL[e]]), k), vis: fin, morph: sm(k), stiff: k > 0 && k < 1 ? 2 : 0,
      glow: k < 1 ? 0.6 * Math.max(hi, bump(t, 1.35, 0.2)) : 0.8 * Math.min(1, bump(t, 2.17 + e * 0.12, 0.3) + passK) };
  });
  const cs = cards6(L, t);
  let cur = null;
  cs.forEach(q => { if (q) cur = q; });
  if (cur) o.pr = made67([cur.x, cur.y], cur.a * cur.lit, cur.s, 0.9 * cur.ok + 0.25 * cur.hit, { clay: cur.hit > 0 ? 1 : 0, stiff: cur.grow ? 3 : 1.5 });
  else {
    // a card that has gone stays where it went until its light is out (a merged one on its point, the one sent back spread out where it faded),
    // then crosses unlit and quickly to where the next card is made. Gathered to a point any sooner, its last light would add up to a spot
    const nx = PR6.find(q => t < q.f), P1 = PR6[1], last = PR6.filter(q => q.r !== undefined && !q.stop && t >= q.e).pop();
    if (t >= P1.back + 0.8 && t < P1.back + 1.35) o.pr = made67(f6(L, [L.RET[0], L.LANE]), 0, 1, 0, { stiff: 4 });
    else o.pr = made67(f6(L, last && t < last.e + 0.6 ? [L.M[last.r], L.MY] : nx ? [nx.fixed ? L.RET[0] : L.FORM[0], L.LANE] : [L.M[PR6[3].r], L.MY]), 0, 0, 0, { stiff: 4 });
  }
  // a merged PR is one more point on main
  [[0, 'm0'], [3, 'm3']].forEach(([i, nm]) => {
    const q = PR6[i];
    o[nm] = made67(f6(L, [L.M[q.r], L.MY]), sm(seg(t, q.e + 0.15, q.e + 0.3)), sm(seg(t, q.e + 0.15, q.e + 0.5)), 1.2 * bump(t, q.e + 0.5, 0.35));
  });
  // the comment's fragment: in the bubble, then in the agent's hand, then pressed into the layer where the third shield stands up
  const ag = rulesAg(L, t), cb = bub(L.CB, t, 5.65, 7.45);
  if (t < TK6) o.frag = { at: [L.CB[0] + 6 * cb.scale, L.CB[1] + cb.scale], vis: cb.vis, lit: cb.vis, scale: cb.scale };
  else if (t < SH6) {
    const src = [L.CB[0] + 6, L.CB[1] + 1], hold = [ag[0] + 16, ag[1] - 14];
    let p = hold, fs = 1.25, gl = 1;
    if (t < CR6) { const k = sm(seg(t, TK6, CR6)); p = lerp2(src, hold, k); fs = 1 + 0.25 * k; gl = k; }
    else if (t >= DP6) { const k = sm(seg(t, DP6, SH6)); p = lerp2(hold, f6(L, [L.LX, L.LANE]), k); fs = 1.25 - 0.75 * k; }
    o.frag = { at: p, vis: 1, lit: 1, scale: fs, glow: 0.6 * gl, stiff: 1 };
  } else o.frag = made67(f6(L, [L.LX, L.LANE]), 0, 0);
  // the third shield grows out of the point where the fragment went into the layer
  o.sh3 = made67(f6(L, [L.LX, L.SL[2]]), sm(seg(t, SH6 - 0.05, SH6 + 0.07)), pop(t, SH6 - 0.05),
    0.8 * Math.min(1.5, bump(t, SH6 + 0.2, 0.35) + (t > SH6 + 0.5 ? passK + blk * 0.5 : 0)), { clay: blk > 0 ? 1 : 0 });
  o.cb = cb;
  o.pf = { at: L.PF, vis: fin };
  const p = pulseOf(bump(t, 1.35, 0.2) + bump(t, 2.4, 0.2) + bump(t, 4.3, 0.2) + bump(t, TK6 + 0.05, 0.2) + bump(t, SH6, 0.22) + bump(t, 8.85, 0.2) + bump(t, 11.27, 0.25));
  // while the rule lines fly, a short afterimage keeps each a single shape instead of a smear
  const flying = sm(seg(t, 1.35, 1.45)) * (1 - sm(seg(t, 2.3, 2.4)));
  // and while the agent crosses the picture (to the bubble, to the layer, home, to the held PR), as in 02 and 07
  const span = (a, b) => sm(seg(t, a - 0.05, a + 0.05)) * (1 - sm(seg(t, b - 0.05, b + 0.05)));
  const travel = Math.max(span(GO6, TK6), span(CR6, DP6), span(SH6 + 0.07, GO6 + 2.15), span(10.85, 11.1), span(11.6, 11.9));
  const lt = light6(L, t);
  return { o, cs, blk, lc: lt.lc, lo: lt.lo, agGlow: p.glow, agSize: p.size, trail: Math.min(mix(0.3, 0.12, flying), mix(0.3, 0.1, travel)) };
}
function rulesAg(L, t) {
  const H = L.HOME, RY = L.RY, X = L.RX, C = L.AGC;
  let ag = H;
  if (t >= 0.4 && t < 0.6) ag = lerp2(H, [X, RY[0]], sm(seg(t, 0.4, 0.6)));
  else if (t >= 0.6 && t < 1.35) ag = [X, mix(RY[0], RY[3], sm(seg(t, 0.6, 1.3)))];
  else if (t >= 1.35 && t < 1.75) ag = lerp2([X, RY[3]], H, sm(seg(t, 1.38, 1.72)));
  if (t >= GO6 && t < TK6) ag = bez6(H, C.go[0], C.go[1], L.AGB, sm(seg(t, GO6, TK6)));
  else if (t >= TK6 && t < CR6) ag = L.AGB;
  else if (t >= CR6 && t < DP6) ag = qpt(L.AGB, C.cr, L.DROP, sm(seg(t, CR6, DP6)));
  else if (t >= DP6 && t < SH6 + 0.07) ag = L.DROP;
  else if (t >= SH6 + 0.07 && t < GO6 + 2.15) ag = qpt(L.DROP, C.back, H, sm(seg(t, SH6 + 0.07, GO6 + 2.15)));
  // it fixes the held PR where the PR came back to
  return lerp2(ag, f6(L, [L.RET[0] + 16, L.LANE - 34]), sm(seg(t, 10.85, 11.1)) * (1 - sm(seg(t, 11.6, 11.9))));
}
/* 06 검사 층(사용자 의견, 2026-10-10). 입자 대신 매끈한 빛 띠를 #ov 에 그린다. 가운데가 밝고 양옆(LAYER6.core·halo 단위)과
   위아래 17% 에서 사라지며 테두리·눈금은 없다. light6 의 64칸 빛만큼 PR 이 지나는 자리가 밝아지고(lc, 크림), 걸린 자리는 주황으로 번진다(lo).
   LAYER6.a 가 한가운데의 알파다. 실선 방패가 먼저 읽히도록 8차의 입자 띠보다 어둡게 둔다. 띠는 화면 밖 캔버스(lay6)에 그려 두고,
   빛이 바뀐 프레임에만 다시 그린다 */
const LAYER6 = { a: 0.16, max: 0.75, core: 7, halo: 18, w: 76 };
let lay6 = null, lay6Key = '';
function layerBand6(sh, L, S, a) {
  const o = S.o.layer, w = LAYER6.w, h = L.LY[1] - L.LY[0], n = 64;
  mk(sh, o.at[0], o.at[1], a * o.vis, c => {
    if (c === under) return;
    // on narrow screens the layer lies across: the flow's along and across trade places, as in f6
    if (L.TR) c.transform(0, 1, 1, 0, 0, 0);
    const T = c.getTransform(), s = Math.hypot(T.a, T.b), W = Math.max(1, Math.ceil(w * s)), H = Math.max(1, Math.ceil(h * s));
    if (!lay6) lay6 = document.createElement('canvas');
    let key = W + 'x' + H;
    for (let j = 0; j < n; j++) key += ',' + (S.lc[j] + 2 * S.lo[j]).toFixed(3) + (S.lo[j] > 0.001 ? 'o' + S.lo[j].toFixed(3) : '');
    if (key !== lay6Key) {
      lay6Key = key;
      if (lay6.width !== W || lay6.height !== H) { lay6.width = W; lay6.height = H; }
      const g = lay6.getContext('2d');
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
      let gr = g.createLinearGradient(0, 0, 0, H);
      for (let j = 0; j < n; j++) {
        const u = j / (n - 1), lc = S.lc[j], lo = S.lo[j], e = sm(Math.min(u, 1 - u) / 0.17), m = clamp(1.6 * lo / (1 + lc + lo), 0, 1);
        const k = Math.min(LAYER6.max, LAYER6.a * e * (1 + lc + lo));
        gr.addColorStop(u, `rgba(${Math.round(mix(246, 235, m))},${Math.round(mix(236, 102, m))},${Math.round(mix(223, 61, m))},${k.toFixed(4)})`);
      }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in';
      gr = g.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24 - 0.5) * w;
        gr.addColorStop(i / 24, `rgba(0,0,0,${(0.7 * Math.exp(-((x / LAYER6.core) ** 2)) + 0.3 * Math.exp(-((x / LAYER6.halo) ** 2))).toFixed(4)})`);
      }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    c.drawImage(lay6, -w / 2, -h / 2, w, h);
  });
}
const CR67 = a => `rgba(246,236,223,${a})`;
// the branch icon and two code lines of a PR card; the mistake is an orange stretch of the first line
function prGlyph6(c, bad) {
  c.strokeStyle = CR67(0.9); c.fillStyle = CR67(0.9); c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(-14, -7); c.lineTo(-14, 7); c.moveTo(-14, 3); c.quadraticCurveTo(-14, -3, -8.5, -4.5); c.stroke();
  [[-14, -7.5], [-14, 7.5], [-7.5, -5.5]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.9, 0, TAU); c.fill(); });
  c.lineWidth = 2.4; c.strokeStyle = CR67(0.7); c.beginPath(); c.moveTo(-3, -4); c.lineTo(15, -4); c.moveTo(-3, 4); c.lineTo(10, 4); c.stroke();
  if (bad > 0) { c.globalAlpha *= bad; c.strokeStyle = CLAY_S; c.lineWidth = 2.6; c.beginPath(); c.moveTo(3, -4); c.lineTo(13, -4); c.stroke(); }
}
// the comment's fragment: the mistaken bit and the line under it
function fragGlyph6(c) {
  c.strokeStyle = CLAY_S; c.lineWidth = 3; c.beginPath(); c.moveTo(-7, -4); c.lineTo(7, -4); c.stroke();
  c.lineWidth = 1.8; c.beginPath(); c.moveTo(-9, 4); c.lineTo(9, 4); c.stroke();
}
const xGlyph67 = (c, sz) => { c.strokeStyle = CLAY_S; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-sz, -sz); c.lineTo(sz, sz); c.moveTo(sz, -sz); c.lineTo(-sz, sz); c.stroke(); };
// cream to clay by k (a blocked shield or card), at alpha al
const CC67 = (k, al) => `rgba(${Math.round(mix(246, 235, k))},${Math.round(mix(236, 102, k))},${Math.round(mix(223, 61, k))},${al})`;
// the solid outlines (사용자 의견, 2026-10-10). A shape is filled with the background first (dark in the under pass too), so the dust and
// the layer's light do not show through it and its inner marks read on a clear ground; its line is SW.box CSS px (px)
function shieldLine(c, col) {
  c.beginPath(); c.moveTo(0, -13); c.lineTo(11, -9); c.lineTo(11, 1); c.quadraticCurveTo(11, 9, 0, 14); c.quadraticCurveTo(-11, 9, -11, 1); c.lineTo(-11, -9); c.closePath();
  c.fillStyle = 'rgba(10,8,7,0.9)'; c.fill(); c.fillStyle = CR67(0.06); c.fill();
  c.strokeStyle = col; c.lineWidth = px(SW.box); c.stroke();
}
// the document with its folded corner, h high (its bottom comes up as its two rules leave)
function docLine6(c, w, h) {
  const f = 14;
  c.beginPath(); c.moveTo(6, 0); c.lineTo(w - f, 0); c.lineTo(w, f); c.lineTo(w, h - 6); c.quadraticCurveTo(w, h, w - 6, h); c.lineTo(6, h); c.quadraticCurveTo(0, h, 0, h - 6); c.lineTo(0, 6); c.quadraticCurveTo(0, 0, 6, 0); c.closePath();
  c.fillStyle = CR67(0.05); c.fill(); c.strokeStyle = CR67(0.75); c.lineWidth = px(SW.box); c.stroke();
  c.beginPath(); c.moveTo(w - f, 0); c.lineTo(w - f, f); c.lineTo(w, f); c.stroke();
}
// a rule of the document: a bullet and a line, brighter while the agent reads it
function ruleLine6(c, RL, al) {
  c.fillStyle = CR67(al); c.beginPath(); c.arc(-RL / 2 - 10, 0, 2, 0, TAU); c.fill();
  c.strokeStyle = CR67(al); c.lineWidth = 3; c.beginPath(); c.moveTo(-RL / 2, 0); c.lineTo(RL / 2, 0); c.stroke();
}
// how much a made67 thing is lit up beyond its pop (the glow it was made with)
const made67G = o => o.lit > 0.001 ? Math.max(0, (o.glow + 1 - o.lit) / o.lit) : 0;
function rulesMarks(sh, S, D, a, t) {
  const L = sh.L, o = S.o, RT = routes6(L), [EX, EY, EW, EH] = L.ed, [DX, DY, DW, DH0, DH1] = L.doc, PJ = L.proj, vis = o.proj.vis;
  layerBand6(sh, L, S, a);
  // the project: a line only, as the agent works inside it
  mk(sh, PJ[0] + PJ[2] / 2, PJ[1] + PJ[3] / 2, a * vis, c => { rrq(c, -PJ[2] / 2, -PJ[3] / 2, PJ[2], PJ[3], 14); c.strokeStyle = CR67(0.5); c.lineWidth = px(SW.ring); c.stroke(); });
  mk(sh, DX, DY, a * vis, c => docLine6(c, DW, mix(DH0, DH1, o.doc.morph)));
  // the editor, then its window buttons, </>, code lines; the lines a PR takes are boxed while the card is made
  mk(sh, EX, EY, a * vis, c => { boxLine(c, 0, 0, EW, EH, 8, CR67, 0.7); c.beginPath(); c.moveTo(0, 16); c.lineTo(EW, 16); c.stroke(); });
  const selK = PR6.map(P => P.s === undefined ? 0 : sm(seg(t, P.s, P.s + 0.15)) * (1 - sm(seg(t, P.f + 0.05, P.f + 0.25))));
  const sel = Math.max(...selK), selBad = PR6.some((P, i) => P.bad && selK[i] > 0);
  mk(sh, EX, EY, a, c => {
    c.fillStyle = CR67(0.4);
    [9, 16, 23].forEach(x => { c.beginPath(); c.arc(x, 8, 1.5, 0, TAU); c.fill(); });
    const gx = EW - 20, gy = 8;
    c.strokeStyle = CR67(0.6); c.lineWidth = 1.2; c.beginPath();
    c.moveTo(gx - 6, gy - 3.5); c.lineTo(gx - 9.5, gy); c.lineTo(gx - 6, gy + 3.5); c.moveTo(gx + 6, gy - 3.5); c.lineTo(gx + 9.5, gy); c.lineTo(gx + 6, gy + 3.5);
    c.moveTo(gx + 1.8, gy - 4.5); c.lineTo(gx - 1.8, gy + 4.5); c.stroke();
    c.lineWidth = 3;
    L.rows.forEach((y, i) => { c.strokeStyle = CR67(0.5 + 0.4 * (i < 2 ? sel : 0)); c.beginPath(); c.moveTo(16, y - EY); c.lineTo(16 + L.lens[i], y - EY); c.stroke(); });
    if (selBad) { c.globalAlpha *= sel; c.strokeStyle = CLAY_S; c.beginPath(); c.moveTo(16 + L.lens[0] * 0.55, L.rows[0] - EY); c.lineTo(16 + L.lens[0] * 0.8, L.rows[0] - EY); c.stroke(); }
  });
  if (sel > 0) mk(sh, EX, EY, a * sel, c => {
    rrq(c, 8, Math.min(L.rows[0], L.rows[1]) - EY - 10, Math.max(L.lens[0], L.lens[1]) + 18, Math.abs(L.rows[1] - L.rows[0]) + 20, 5);
    if (c !== under) { c.fillStyle = CR67(0.07); c.fill(); }
    c.strokeStyle = CR67(0.6); c.lineWidth = 1.2; c.stroke();
  });
  // the rules. The two a check can enforce fly to the layer, the line fading into a shield's outline, which shows its ✓ once it is whole
  L.RY.forEach((ry, i) => {
    const r = o['r' + i], m = r.morph || 0, g = Math.min(1, r.glow || 0), RL = L.RL[i];
    if (m < 0.7) mk(sh, r.at[0], r.at[1], a * r.vis * (1 - sm(seg(m, 0.2, 0.7))), c => ruleLine6(c, RL, 0.6 + 0.4 * g));
    if (m > 0.3) mk(sh, r.at[0], r.at[1], a * r.vis * sm(seg(m, 0.3, 0.8)), c => {
      const k = mix(0.55, 1, sm(seg(m, 0.3, 1)));
      c.scale(k, k); shieldLine(c, CR67(Math.min(1, 0.75 + 0.25 * g)));
      if (m > 0.6) { c.globalAlpha *= sm(seg(m, 0.6, 1)); shieldGlyph(c); }
    });
  });
  // while the third shield holds the same mistake back (its orange flash) it turns orange and shows an orange ✕, then its ✓ again
  const PB = PR6[2], xk = sm(seg(t, PB.g, PB.g + 0.15)) * (1 - sm(seg(t, PB.back, PB.back + 0.2)));
  if (o.sh3.lit > 0) mk(sh, ...o.sh3.at, a * o.sh3.lit * sm(seg(o.sh3.scale, 0.15, 0.6)), c => {
    c.scale(o.sh3.scale, o.sh3.scale);
    shieldLine(c, CC67(S.blk, Math.min(1, 0.75 + 0.2 * made67G(o.sh3))));
    if (xk < 1) { c.save(); c.globalAlpha *= 1 - xk; shieldGlyph(c); c.restore(); }
    if (xk > 0) { c.globalAlpha *= xk; xGlyph67(c, 3.6 * L.xs); }
  });
  // main, its points and the branch lines go through the same screen points, so a merged branch ends in the middle of its point
  const mx = L.mainX, mw = mx[3] - mx[0];
  mkS(sh, a * vis, (c, P) => {
    if (c === under) return;
    const A = P(...f6(L, [mx[0], L.MY])), Z = P(...f6(L, [mx[3], L.MY])), g = c.createLinearGradient(A[0], A[1], Z[0], Z[1]);
    g.addColorStop(0, CR67(0)); g.addColorStop((mx[1] - mx[0]) / mw, CR67(0.8)); g.addColorStop((mx[2] - mx[0]) / mw, CR67(0.8)); g.addColorStop(1, CR67(0));
    c.strokeStyle = g; c.lineWidth = 1.6; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Z[0], Z[1]); c.stroke();
  });
  // branch lines, from u0 to u1 along route r. A dashed one is drawn from its far end, so its dashes stay put while its near end moves
  const branch = (r, u0, u1, al, dash) => mkS(sh, a * al, (c, P) => {
    if (u1 <= u0 || al <= 0 || c === under) return;
    c.strokeStyle = CREAM_S; c.lineWidth = SW.ring; if (dash) c.setLineDash([4, 4]);
    c.beginPath();
    for (let i = 0; i <= 60; i++) { const p = P(...f6(L, RT[r].at(dash ? mix(u1, u0, i / 60) : mix(u0, u1, i / 60)))); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    c.stroke();
  });
  // the line ends at the card's edge, not under it
  const head = (P, u) => { const q = S.cs[PR6.indexOf(P)]; return q && t < P.e ? Math.max(0, u - 24 * q.s / RT[P.r].len) : u; };
  // a merged branch shows while its card goes down it and fades out once its point is on main
  const fade = P => 0.36 * (1 - sm(seg(t, P.e + 0.3, P.e + 0.85)));
  const P0 = PR6[0], P1 = PR6[1], P3 = PR6[3], u3 = t >= P3.p ? head(P3, sm(seg(t, P3.p, P3.e))) : 0;
  if (t >= P0.p) branch(P0.r, 0, head(P0, sm(seg(t, P0.p, P0.e))), fade(P0));
  // the stopped PR's branch turns dashed and ends in ✕ before main. The fixed PR comes down the same branch: the line turns solid as far
  // as its card has gone, and the ✕ goes while the card lies over it (its middle 2 units before to 12 past the ✕'s place on the branch;
  // the line ends 24 behind the middle)
  if (t >= P1.p && t < P1.back) branch(1, 0, head(P1, L.stopU * outCubic(seg(t, P1.p, P1.e))), 0.36);
  if (t >= P1.back) {
    branch(1, u3, L.stopU, 0.42, true);
    const p = RT[1].at(L.stopU), e = f6(L, [p[0], p[1] + 6]), lr = RT[1].len;
    const xa = sm(seg(t, P1.back + 0.3, P1.back + 0.5)) * (1 - sm(seg(u3, L.stopU - 26 / lr, L.stopU - 12 / lr)));
    if (xa > 0) mk(sh, e[0], e[1], a * xa, c => xGlyph67(c, 4 * L.xs));
  }
  if (t >= P3.p) branch(1, 0, u3, fade(P3));
  // the stretch from the layer to where the branches part shows with them
  const stub = Math.max(t >= P0.p ? fade(P0) : 0, t >= P1.p ? (t < P3.e ? 0.36 : fade(P3)) : 0);
  if (stub > 0) mkS(sh, a * stub, (c, P) => {
    if (c === under) return;
    const p = P(...f6(L, [L.LX + 20, L.LANE])), q = P(...f6(L, [L.PAST, L.LANE]));
    c.strokeStyle = CREAM_S; c.lineWidth = 1; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
  });
  // the points on main: two from before, and one for each merged PR, which pops as the card shrinks into it
  const dot = (x, y, al, s) => mk(sh, x, y, al, c => { if (c === under) return; c.fillStyle = CR67(0.92); c.beginPath(); c.arc(0, 0, 4.6 * s, 0, TAU); c.fill(); });
  L.old.forEach(x => dot(...f6(L, [x, L.MY]), a * vis, 1));
  ['m0', 'm3'].forEach(nm => { const m = o[nm]; if (m.lit > 0) dot(...m.at, a * m.lit, m.scale); });
  // a ring spreads from each new point on main
  [PR6[0], PR6[3]].forEach(P => {
    const rk = seg(t, P.e + 0.2, P.e + 0.6);
    if (rk > 0 && rk < 1) mk(sh, ...f6(L, [L.M[P.r], L.MY]), a * 0.55 * (1 - rk), c => { if (c === under) return; c.strokeStyle = CREAM_S; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 6 + 15 * outCubic(rk), 0, TAU); c.stroke(); });
  });
  // the card lies on top of what it passes (the project's edge in front of the layer does not run through it); orange while it is held back
  const q = S.cs.reduce((m, v) => v || m, null);
  if (q) mk(sh, q.x, q.y, a * o.pr.lit, c => {
    c.scale(q.s, q.s); rrq(c, -23, -14, 46, 28, 7);
    if (c !== under) { c.fillStyle = 'rgba(10,8,7,0.92)'; c.fill(); }
    c.strokeStyle = CC67(q.hit, Math.min(1, 0.8 + 0.2 * q.ok + 0.2 * q.hit)); c.lineWidth = px(SW.box); c.stroke();
    prGlyph6(c, q.bad ? 1 - q.fix : 0);
  });
  // the comment (the person's, amber): a line of the code and the mistaken fragment, which the agent then carries
  mk(sh, L.CB[0], L.CB[1], a * o.cb.vis, c => {
    c.scale(o.cb.scale, o.cb.scale); bubbleLine(c, 58, 36, !L.TR, amberA);
    c.strokeStyle = CR67(0.7); c.lineWidth = 3; c.beginPath(); c.moveTo(-17, -3); c.lineTo(-5, -3); c.stroke();
  });
  if (o.frag.lit > 0) mk(sh, o.frag.at[0], o.frag.at[1], a * o.frag.lit, c => { const s = o.frag.scale; c.scale(s, s); fragGlyph6(c); });
  // the person watches from a little way off, its eyes fixed toward the project, the layer and the PRs (L.LOOK) all scene
  const [dx, dy] = L.LOOK, dl = Math.hypot(dx, dy), r = L.fr;
  mkP(sh, L.PF[0], L.PF[1], a * o.pf.vis, c => { c.translate(dx / dl * r * 0.13, dy / dl * r * 0.1); face(c, r, exprOf(t, [[0, 'neutral'], [5.6, 'frown'], [7.5, 'neutral'], [9.6, 'happy']])); });
}
const fc67 = (name, r) => ({ name, w: 2 * r * FACE_GLOW + 6, h: 2 * r * FACE_GLOW + 6, draw: INK.face(r), temp: FACE_T, white: 0.03, byPlace: faceLook(r) });
function rulesShape(rand) {
  const L = lay('rules'), [, , DW, DH0, DH1] = L.doc, [, , EW, EH] = L.ed, [, , PW, PH] = L.proj, top = 20, kk = (DH1 - top) / (DH0 - top);
  const mx = L.mainX, mw = mx[3] - mx[0], dot = c => { c.beginPath(); c.arc(0, 0, 4.6, 0, TAU); c.fill(); };
  const TR = L.TR, od = L.old[1] - L.old[0], ly = L.LY[1] - L.LY[0];
  const specs = [
    { name: 'proj', w: PW + 6, h: PH + 6, b: 0.45, solid: true, draw: c => { c.lineWidth = 1.2; rrq(c, -PW / 2, -PH / 2, PW, PH, 14); c.stroke(); } },
    // main fades in from the layer's side and runs on past the picture's edge
    { name: 'main', w: TR ? 8 : mw + 6, h: TR ? mw + 6 : 8, b: 0.7, solid: true, draw: c => {
      if (TR) c.rotate(Math.PI / 2);
      const g = c.createLinearGradient(-mw / 2, 0, mw / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop((mx[1] - mx[0]) / mw, '#fff'); g.addColorStop((mx[2] - mx[0]) / mw, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = g; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-mw / 2, 0); c.lineTo(mw / 2, 0); c.stroke();
    } },
    { name: 'dots', w: TR ? 14 : od + 14, h: TR ? od + 14 : 14, fill: true, white: 0.12, solid: true, draw: c => [-1, 1].forEach(s => { c.save(); c.translate(...f6(L, [s * od / 2, 0])); dot(c); c.restore(); }) },
    // the band is drawn on #ov (layerBand6); as a solid object the layer has no particles
    { name: 'layer', w: TR ? ly + 6 : 84, h: TR ? 84 : ly + 6, draw: c => { if (TR) c.rotate(Math.PI / 2); layerInk6(L)(c); }, b: 0.42, solid: true },
    // the document: its bottom comes up when its two rules leave
    { name: 'doc', w: DW + 6, h: DH0 + 6, b: 0.75, solid: true, draw: c => { c.translate(-DW / 2, -DH0 / 2); docInk6(c, DW, DH0); },
      morph: (x, y) => { const yy = y + DH0 / 2; return [x, (yy < top ? yy : top + (yy - top) * kk) - DH0 / 2]; } }
  ];
  L.RY.forEach((ry, i) => {
    const RL = L.RL[i], o = { name: 'r' + i, w: RL + 34, h: 34, b: 0.85, solid: true,
      draw: c => { c.beginPath(); c.arc(-RL / 2 - 10, 0, 2, 0, TAU); c.fill(); c.lineWidth = 3; c.beginPath(); c.moveTo(-RL / 2, 0); c.lineTo(RL / 2, 0); c.stroke(); } };
    if (ENF6.includes(i)) { o.draw2 = INK.shield; o.hollow2 = true; o.tail = 0.1; }
    specs.push(o);
  });
  specs.push(
    { name: 'ed', w: EW + 6, h: EH + 6, b: 0.6, solid: true, draw: c => { c.translate(-EW / 2, -EH / 2); c.lineWidth = 1.1; rrq(c, 0, 0, EW, EH, 8); c.stroke(); c.beginPath(); c.moveTo(0, 16); c.lineTo(EW, 16); c.stroke(); } },
    { name: 'pr', w: 52, h: 34, b: 0.9, tail: 0.15, solid: true, draw: c => { c.lineWidth = 1.3; rrq(c, -23, -14, 46, 28, 7); c.stroke(); } },
    { name: 'm0', w: 14, h: 14, draw: dot, fill: true, white: 0.12, solid: true },
    { name: 'm3', w: 14, h: 14, draw: dot, fill: true, white: 0.12, solid: true },
    { name: 'sh3', w: 30, h: 34, draw: INK.shield, hollow: true, tail: 0.1, solid: true },
    { name: 'frag', w: 26, h: 16, temp: 0, white: 0.02, tail: 0.15, draw: fragGlyph6, solid: true },
    { name: 'cb', w: 64, h: 58, draw: INK.bubble(58, 36, !TR), temp: 0.5, hollow: true, solid: true },
    fc67('pf', L.fr)
  );
  return sceneShape('rules', L, specs, rand);
}
// the check layer: a band of light brightest down its middle (storyboard sheetImg), fading out sideways and over its top and bottom 17%.
// Particles follow the ink, so the storyboard's own profile (half its light in a 15 px halo) sent three dots in four to the halo and the
// band read as an even column of sand. Here most of the ink is in the 6 px middle and the bloom gives the soft sides; where the band is
// under 7% of its middle it has no particles, as a few dots out there would read as stray dust. Every dot is as bright as any other,
// so the band takes particles like a thick line (LINE_D) rather than a fill: its middle is then about as dense as the name
function layerInk6(L) {
  const h = L.LY[1] - L.LY[0], w = 76, cut = v => Math.max(0, (v - 0.07) / 0.93);
  const prof = d => 0.6 * cut(0.8 * Math.exp(-((d / 6) ** 2)) + 0.2 * Math.exp(-((d / 14) ** 2)));
  return c => {
    let g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    for (let i = 0; i <= 38; i++) { const u = i / 38; g.addColorStop(u, `rgba(255,255,255,${prof((u - 0.5) * w).toFixed(4)})`); }
    c.fillStyle = g; c.fillRect(-w / 2, -h / 2, w, h);
    c.globalCompositeOperation = 'destination-in';
    g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    for (let i = 0; i <= 20; i++) { const u = i / 20; g.addColorStop(u, `rgba(0,0,0,${cut(sm(Math.min(u, 1 - u) / 0.17)).toFixed(4)})`); }
    c.fillStyle = g; c.fillRect(-w / 2, -h / 2, w, h);
    c.globalCompositeOperation = 'source-over';
  };
}
// a page with a folded corner
function docInk6(c, w, h) {
  const f = 14;
  c.beginPath(); c.moveTo(6, 0); c.lineTo(w - f, 0); c.lineTo(w, f); c.lineTo(w, h - 6); c.quadraticCurveTo(w, h, w - 6, h); c.lineTo(6, h); c.quadraticCurveTo(0, h, 0, h - 6); c.lineTo(0, 6); c.quadraticCurveTo(0, 0, 6, 0); c.closePath();
  c.lineWidth = 1.2; c.stroke();
  c.beginPath(); c.moveTo(w - f, 0); c.lineTo(w - f, f); c.lineTo(w, f); c.stroke();
}

/* ---------------------------------------------------- 07 · AFA (스토리보드 17판) */
/* 비스듬히 내려다본 바닥에 파일 타일이 줄지어 있고(같은 줄은 모양이 같다), 에이전트에게는 둘레의 타원 안만 보인다. 처음에는 바닥이 전혀
   보이지 않다가, 사람이 부탁하면 에이전트가 바닥으로 들어가 크게 휘어 도는 길로 걸으며 작업할 자리를 찾는다. 한 칸이 빠진 줄 앞에 멈춰
   동그란 조각을 넣으려 하면 빈칸 안의 작은 방패(테스트)가 주황으로 번쩍이며 막고, 바로 옆 파일과 같은 모양으로 만들어 넣으면 줄이 이어진다.
   타일·빈칸 양옆 파일·동그란 조각·복사본·빈칸 방패·부탁 말풍선은 선명한 층(#ov)에 실선으로 그린다(사용자 의견, 2026-10-10).
   시야는 바닥 위의 원(비스듬히 보면 타원)이고, 타일은 한가운데가 시야의 80% 를 넘으면 통째로 옅어진다(tileSight7). 시야 안 바닥의
   옅은 빛과 타일 속 코드 줄도 같은 시야 값을 곱해 그린다. 입자는 장면에 들어올 때만 모이고, 셰이더가 입자 자리를 바닥 좌표로 되돌려 시야를 잰다(10_sim sightK) */
// the floor (tile size, column and row steps, nearest row) is the same on every screen; the camera looking at it is the layout's (cam)
const FL7 = { w: 0.075, px: 0.105, pz: 0.17, z0: 1 };
const L7 = { VW: VW_W, VH: VH_W, see: 316, mid: 172, pp: [42, 46], fr: 17, rq: [102, 30], HI: 0, HJ: 2, NI: 1, R: 0.245, HOV: 4,
  cam: { F: 933, Hc: 0.6, Hy: -226, cx: 320 }, pan: 0, tw: 300, tsS: 0.66, tsX: 3.6 };
// narrow screens: the 320x400 frame and a closer camera, so tiles, the view and the check are about twice as large as the wide frame
// shrunk to a phone. The walk is then wider than the picture, so the camera follows the agent across (pan 1: the agent stays in the
// middle and the floor moves under it, which keeps the view inside the picture). The check in the gap is drawn larger (tsS, tsX),
// and the view is wider while the agent is far back (rz, view7)
const L7T = { VW: VW_T, VH: VH_T, pp: [44, 62], fr: 17, rq: [106, 44], HI: 0, HJ: 2, NI: 1, R: 0.245, HOV: 4,
  cam: { F: 760, Hc: 0.6, Hy: -80, cx: 160 }, pan: 1, rz: 0.6, tw: 380, tsS: 0.9, tsX: 6.4 };
const ROWS7 = ['tag', 'folder', 'doc', 'tag', 'folder'], Zr7 = j => FL7.z0 + (4 - j) * FL7.pz, Xc7 = i => i * FL7.px;
const XH7 = Xc7(L7.HI), ZH7 = Zr7(L7.HJ), XN7 = Xc7(L7.NI), ZS7 = ZH7 - FL7.pz / 2, XS7 = XH7 + FL7.px / 3;
// after the stop: the round piece is made, pushed into the gap, held, pushed back and dropped; then the look next door and the copy.
// There is no answer bubble: the row's light running on through the gap and the person's pleased face (THAPPY7, just after it) say it is done
const T07 = 1.2, T17 = 4.6, TP7 = 4.9, TA7 = 5.15, TJ7 = 5.55, TB7 = 6.35, TR7 = 7.4, TC7 = 8.05, LAND7 = 8.95, THAPPY7 = 9.6;
const P07 = [XH7 - 0.022, ZS7 - 0.027], P17 = [XH7 - 0.006, ZH7 - 0.055], P27 = [XH7 - 0.052, ZS7 - 0.031];
const flP7 = (C, X, Z, up = 0) => { const k = C.F / Z; return [C.cx + X * k, C.Hy + C.Hc * k - up * k]; };
// a tile's own ±20 units laid on the floor at (X, Z), lifted up and scaled by s
function flT7(c, C, X, Z, up = 0, s = 1) { const k = C.F / Z, k2 = C.F / (Z * Z), m = FL7.w / 40 * s, p = flP7(C, X, Z, up); c.transform(k * m, 0, X * k2 * m, C.Hc * k2 * m, p[0], p[1]); }
// one outline per row: a document with a folded corner, a folder with a tab, a tag with a pointed end; round is the piece made without looking next door
const FLK7 = { doc: [[-12, -5, 22], [-12, 3, 15], [-12, 11, 19]], folder: [[-12, 1, 22], [-12, 9, 15]], tag: [[-13, -5, 18], [-13, 3, 12], [-13, 11, 15]], round: [[-11, -7, 22], [-11, 0, 15], [-11, 7, 19]] };
function flShape7(c, kind) {
  c.beginPath();
  if (kind === 'doc') { const h = 20, f = 9, r = 3; c.moveTo(-h + r, -h); c.lineTo(h - f, -h); c.lineTo(h, -h + f); c.lineTo(h, h - r); c.quadraticCurveTo(h, h, h - r, h); c.lineTo(-h + r, h); c.quadraticCurveTo(-h, h, -h, h - r); c.lineTo(-h, -h + r); c.quadraticCurveTo(-h, -h, -h + r, -h); c.closePath(); }
  else if (kind === 'folder') { c.moveTo(-20, -19); c.lineTo(-6, -19); c.lineTo(-2, -13); c.lineTo(20, -13); c.lineTo(20, 20); c.lineTo(-20, 20); c.closePath(); }
  else if (kind === 'tag') { c.moveTo(-20, -17); c.lineTo(8, -17); c.lineTo(21, 0); c.lineTo(8, 17); c.lineTo(-20, 17); c.closePath(); }
  else c.arc(0, 0, 21, 0, TAU);
}
// a tile's outline in storyboard px (the line width stays 1.2 px however the tile is slanted)
function tileInk7(c, C, X, Z, kind, up = 0, s = 1) {
  c.save(); flT7(c, C, X, Z, up, s); flShape7(c, kind); c.restore();
  c.lineWidth = 1.2; c.stroke();
  if (kind === 'doc') { c.save(); flT7(c, C, X, Z, up, s); c.beginPath(); c.moveTo(11, -20); c.lineTo(11, -11); c.lineTo(20, -11); c.restore(); c.stroke(); }
}
// a smooth path through floor points, walked by arc length; the walk speeds up, keeps its pace and slows to the stop
function path7(L) {
  if (L.path) return L.path;
  const pts = [[-0.43, 1.73], [-0.27, 1.615], [-0.05, 1.59], [0.15, 1.585], [0.245, 1.5], [0.225, 1.35], [0.18, 1.27], [0.1, 1.255], [XS7, ZS7]], out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) {
      const u = k / 20, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3)));
    }
  }
  out.push(pts[pts.length - 1]);
  L.path = walk67(out);
  return L.path;
}
const wk7 = x => { const a = 0.15, d = 0.25, v = 1 / (1 - a / 2 - d / 2); return x < a ? v * x * x / (2 * a) : x < 1 - d ? v * (x - a / 2) : 1 - v * (1 - x) * (1 - x) / (2 * d); };
// where on the floor the agent is and how far it sees. With rz (narrow screens) the radius grows with depth (Z / ZS7) ** rz, so the
// view stays wide on a phone while the agent is far back; at the stop (ZS7) it is L.R
const view7 = (L, t) => { const A = path7(L).at(wk7(seg(t, T07, T17))); return { A, R: L.R * (L.rz ? (A[1] / ZS7) ** L.rz : 1) * sm(seg(t, T07 + 0.15, T07 + 0.55)) }; };
// the camera at time t: the layout's own, its middle moved by pan of the agent's offset from it
function cam7(L, t) {
  const c = L.cam;
  if (!L.pan) return c;
  const A = view7(L, t).A;
  return { F: c.F, Hc: c.Hc, Hy: c.Hy, cx: c.cx - L.pan * A[0] * c.F / A[1] };
}
// how lit a floor point is: whole inside 87% of the view, darkening over the last 13%, nothing beyond (the same as sightK)
const sight7 = (v, X, Z) => { if (v.R <= 0) return 0; const d = Math.hypot(X - v.A[0], Z - v.A[1]) / v.R; return d >= 1 ? 0 : 1 - sm((d - 0.87) / 0.13); };
// how lit a whole tile is, by where its middle (X, Z) is: it darkens from 80% of the view (the same as sightK for a tile)
const tileSight7 = (v, X, Z) => { if (v.R <= 0) return 0; return 1 - sm((Math.hypot(X - v.A[0], Z - v.A[1]) / v.R - 0.8) / 0.2); };
// the tiles the view ever comes near: only these get particles. Next to the gap (left and right) and the gap itself are objects of their own
function tiles7(L) {
  if (L.tiles) return L.tiles;
  const near = new Set();
  for (let t = T07; t <= 11.5; t += 0.02) {
    const v = view7(L, t);
    for (let j = 0; j < 5; j++) for (let i = -7; i <= 7; i++) if (Math.hypot(Xc7(i) - v.A[0], Zr7(j) - v.A[1]) <= v.R + 0.07) near.add(j * 100 + i + 50);
  }
  L.tiles = [...near].map(k => ({ i: (k % 100) - 50, j: Math.floor(k / 100) })).filter(q => q.j !== L.HJ || Math.abs(q.i - L.HI) > 1);
  return L.tiles;
}
function boardState(L, t) {
  // outside the view the floor goes fully dark: under 0.002 the particle light also falls off fast (12_main), so a tile the view has left goes out at once
  const o = {}, v = view7(L, t), C = cam7(L, t), fin = sm(seg(t, -0.5, -0.1)), F7 = 1e-4;
  const rowK = i => bump(t, LAND7 + 0.35 + 0.14 * Math.abs(i - L.NI), 0.22), refK = bump(t, TR7, 0.3) + bump(t, TR7 + 0.45, 0.35);
  // the tiles' particles were placed for the layout's own camera; dx moves them with the camera (30_scenes putObj)
  o.tiles = { abs: true, dx: C.cx - L.cam.cx, vis: fin, floor: F7, tile: 1 };
  o.nL = { at: flP7(C, XH7 - FL7.px, ZH7), vis: fin, floor: F7, tile: 1, glow: 0.6 * rowK(L.HI - 1) };
  o.nR = { at: flP7(C, XN7, ZH7), vis: fin, floor: F7, tile: 1, glow: 0.5 * refK + 0.6 * rowK(L.NI) };
  // the copy of the neighbour: lifted off it, slid over the gap and set down; once down it is part of the floor and the row runs on evenly
  // until then it lies on the neighbour itself, so the copy peels off it
  let cp = made67(flP7(C, XN7, ZH7), 0, 1, 0, { floor: F7 });
  if (t >= TC7) {
    const up = t < LAND7 ? 0.02 * sm(seg(t, TC7, TC7 + 0.25)) * (1 - sm(seg(t, TC7 + 0.7, LAND7))) : 0, X = mix(XN7, XH7, sm(seg(t, TC7 + 0.25, TC7 + 0.7)));
    cp = made67(flP7(C, X, ZH7, up), sm(seg(t, TC7, TC7 + 0.15)), 1,
      t >= LAND7 ? 0.9 * Math.min(1.2, bump(t, LAND7 + 0.05, 0.3) + 0.6 * rowK(L.HI) + 0.25 * sm(seg(t, LAND7, LAND7 + 0.45))) : 0.3, { floor: F7, stiff: t < LAND7 ? 3 : 0 });
  }
  o.cp = cp;
  // the round piece: made beside the agent, pushed into the mouth of the gap, held by the check standing in it, pushed back out and dropped
  let rd = made67(flP7(C, ...(t < TP7 ? P07 : P27), 0.012), 0, t < TP7 ? 0 : 0.75 * P07[1] / P27[1], 0, { floor: F7 });
  if (t >= TP7 && t < 7.05) {
    let [X, Z] = P07, up = 0.012;
    if (t >= TA7 && t < TJ7) { const k = sm(seg(t, TA7, TJ7)); [X, Z] = lerp2(P07, P17, k); up = mix(0.012, 0.014, k); }
    if (t >= TJ7 && t < TB7) { const q = t - TJ7; X = P17[0] + Math.sin(t * 80) * 0.0016 * Math.exp(-q * 2.4); Z = P17[1] + 0.005 * Math.max(bump(q, 0.2, 0.14), bump(q, 0.55, 0.14)); up = 0.014; }
    if (t >= TB7) { const k = outCubic(seg(t, TB7, TB7 + 0.3)); [X, Z] = lerp2(P17, P27, k); up = mix(0.014, 0.012, k); }
    const out = sm(seg(t, 6.65, 7.05));
    // it fades where it was dropped, as the storyboard has it, instead of scattering
    rd = made67(flP7(C, X, Z, up), sm(seg(t, TP7, TP7 + 0.12)) * (1 - out), pop(t, TP7) * (1 - 0.25 * out) * P07[1] / Z, 0, { XZ: [X, Z, up], floor: F7, stiff: t < TP7 + 0.35 ? 3 : 1 });
  }
  o.rd = rd;
  // the check stands up in the back half of the gap, so the piece pressed into the gap's mouth stops just in front of it
  const jam = t >= TJ7 && t < TB7 ? 0.6 + 0.4 * Math.sin((t - TJ7) * 11) ** 2 : 0;
  const sk = t >= TJ7 - 0.05 && t < TB7 + 0.25 ? sm(seg(t, TJ7 - 0.05, TJ7 + 0.05)) * (1 - sm(seg(t, TB7, TB7 + 0.25))) : 0, sz = Math.max(0.05, pop(t, TJ7 - 0.05));
  const tp = flP7(C, XH7, ZH7 + 0.025);
  o.ts = made67([tp[0], tp[1] - 14 * L.tsS * sz], sk, L.tsS * sz, 0.8 * jam, { floor: F7, clay: 1 });
  o.pp = { at: L.pp, vis: fin };
  o.rq = bub(L.rq, t, 0.6);
  const p = pulseOf(bump(t, T07, 0.2) + bump(t, T17, 0.22) + bump(t, TP7, 0.22) + bump(t, TR7, 0.2) + bump(t, TC7 + 0.05, 0.2));
  // a short afterimage while the agent walks and while the copy is carried, so neither leaves a smear (as 02 does for its walk)
  const moving = Math.max(sm(seg(t, T07, T07 + 0.3)) * (1 - sm(seg(t, T17 - 0.3, T17))), sm(seg(t, TC7, TC7 + 0.1)) * (1 - sm(seg(t, LAND7 - 0.05, LAND7 + 0.1))));
  return { o, v, C, jam, sk, sz, rowK, refK, agGlow: p.glow, agSize: p.size, trail: mix(0.3, 0.1, moving) };
}
function boardAg(L, t) {
  const p = flP7(cam7(L, t), ...view7(L, t).A);
  return [p[0], p[1] - L.HOV + (t < T07 ? Math.sin(t * 2.4) * 1.5 : 0)];
}
// the view on the floor, and how to take a particle's world place back to storyboard px and onto the floor (sightK)
function boardUniforms(sh, S) {
  const F = sh.F, o = vw(F, 0, 0);
  set4v(U.sight, S.v.A[0], S.v.A[1], S.v.R, 1);
  arr4(152, o[0], o[1], 1 / F.s, 0);
  arr4(153, S.C.F, S.C.Hc, S.C.Hy, S.C.cx);
  arr4(154, FL7.px, FL7.pz, FL7.z0, 0);
}
// a tile's code lines, as bright as the whole tile (v: the view; null when the tile is lifted into the light)
function codeLines7(c, C, v, X, Z, kind, al, up = 0, s = 1, lineK) {
  const k = C.F / Z;
  c.lineWidth = Math.max(1, 1.9 * k / 730 * s);
  FLK7[kind].forEach(([u, w, n], j) => {
    const f = al * (v ? tileSight7(v, X, Z) : 1);
    if (f <= 0.004) return;
    c.save(); flT7(c, C, X, Z, up, s); c.beginPath(); c.moveTo(u, w); c.lineTo(u + n, w); c.restore();
    c.strokeStyle = CR67(f * (lineK ? lineK(j) : 0.55)); c.stroke();
  });
}
/* 시야 안 바닥 빛의 세기. 1 이 8차까지의 밝기이고, 지금은 그 절반이다. 0 이면 바닥 빛을 그리지 않는다(들어 올린 조각의 속 칠도 이 빛을 따른다) */
const FLOOR7 = 0.5;
const floorK7 = u => FLOOR7 * (0.065 + 0.075 * (1 - sm(u / 0.87))) * (1 - sm((u - 0.87) / 0.13));
function boardMarks(sh, S, D, a, t) {
  const L = sh.L, o = S.o, v = S.v, C = cam7(L, t);
  if (v.R > 0) {
    // light on the floor inside the view, like a lamp: brightest in the middle, still lit up to the edge, where it darkens over the last 13%
    // to the background. No line marks the edge. Nested floor discs keep the light on the floor's slant
    if (FLOOR7 > 0) mk(sh, 0, 0, a, c => {
      if (c === under) return;
      const prof = floorK7, us = [];
      for (let k = 0; k < 14; k++) us.push(0.87 * (1 - k / 14));
      for (let k = 1; k <= 8; k++) us.unshift(0.87 + 0.13 * k / 8);
      us.sort((x, y) => y - x);
      let prev = 0;
      c.fillStyle = 'rgb(246,236,223)';
      us.forEach((u, k) => {
        const f = prof(k + 1 < us.length ? (u + us[k + 1]) / 2 : u / 2);
        if (f <= prev) return;
        c.globalAlpha = a * (1 - (1 - f) / (1 - prev)); prev = f;
        c.beginPath();
        for (let q = 0; q <= 72; q++) { const th = q / 72 * TAU, p = flP7(C, v.A[0] + v.R * u * Math.cos(th), v.A[1] + v.R * u * Math.sin(th)); if (q) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
        c.closePath(); c.fill();
      });
    }, true);
    // the code lines of the tiles in view, and a soft light under a tile that is being read or that the row's light runs through
    mk(sh, 0, 0, a, c => {
      if (c === under) return;
      // a piece held above the floor (the round one, the copy while lifted) is solid, as the storyboard fills it: it hides what lies under it.
      // It is filled with the lit floor's own tone, a little lighter, so it reads as a raised piece and not as a dark hole in the light
      const body = (X, Z, up, s, kind, k) => {
        if (k <= 0.004) return;
        const u = v.R > 0 ? Math.hypot(X - v.A[0], Z - v.A[1]) / v.R : 2, f = floorK7(u) + 0.05;
        c.save(); flT7(c, C, X, Z, up, 0.86 * s); flShape7(c, kind); c.restore();
        c.save(); c.globalAlpha *= k; c.fillStyle = `rgb(${[10, 8, 7].map((b, i) => Math.round(b + f * ([246, 236, 223][i] - b))).join(',')})`; c.fill(); c.restore();
      };
      // a tile's solid outline, as bright as the whole tile (the view's edge takes it whole, never part of it)
      const outline = (X, Z, kind, al, up = 0, s = 1) => {
        if (al <= 0.004) return;
        c.save(); flT7(c, C, X, Z, up, s); flShape7(c, kind); c.restore();
        c.strokeStyle = CR67(Math.min(1, al)); c.lineWidth = px(SW.ring); c.stroke();
        if (kind === 'doc') { c.save(); flT7(c, C, X, Z, up, s); c.beginPath(); c.moveTo(11, -20); c.lineTo(11, -11); c.lineTo(20, -11); c.restore(); c.stroke(); }
      };
      const lit = g => 0.62 + 0.38 * Math.min(1, Math.max(0, g || 0));
      tiles7(L).forEach(q => { const X = Xc7(q.i), Z = Zr7(q.j); outline(X, Z, ROWS7[q.j], 0.62 * tileSight7(v, X, Z)); codeLines7(c, C, v, X, Z, ROWS7[q.j], 1); });
      outline(XH7 - FL7.px, ZH7, 'doc', tileSight7(v, XH7 - FL7.px, ZH7) * lit(o.nL.glow));
      outline(XN7, ZH7, 'doc', tileSight7(v, XN7, ZH7) * lit(o.nR.glow));
      const pool = (X, Z, up, g) => {
        const k = sight7(v, X, Z) * g;
        if (k <= 0.004) return;
        const p = flP7(C, X, Z, up), r = 52 * C.F / Z / 730;
        c.save(); c.translate(p[0], p[1]); c.scale(1, C.Hc / Z * 1.3);
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, CR67(0.24 * k)); gr.addColorStop(1, CR67(0));
        c.fillStyle = gr; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore();
      };
      pool(XH7 - FL7.px, ZH7, 0, 0.6 * S.rowK(L.HI - 1));
      pool(XN7, ZH7, 0, S.refK + 0.6 * S.rowK(L.NI));
      codeLines7(c, C, v, XH7 - FL7.px, ZH7, 'doc', 1);
      codeLines7(c, C, v, XN7, ZH7, 'doc', 1, 0, 1, j => 0.55 + 0.45 * bump(t, TR7 + 0.15 + j * 0.15, 0.16));
      // the agent reads its neighbour: a thin line of light passes down over it, kept inside the tile's outline
      const rk = seg(t, TR7 + 0.1, TR7 + 0.6);
      if (rk > 0 && rk < 1) {
        c.save(); flT7(c, C, XN7, ZH7); flShape7(c, 'doc'); c.clip();
        const y = -20 + 40 * rk, g = c.createLinearGradient(0, y - 5, 0, y + 5);
        g.addColorStop(0, CR67(0)); g.addColorStop(0.5, CR67(0.45)); g.addColorStop(1, CR67(0));
        c.fillStyle = g; c.fillRect(-20, y - 5, 40, 10); c.restore();
      }
      if (o.cp.lit > 0) {
        const up = t < LAND7 ? 0.02 * sm(seg(t, TC7, TC7 + 0.25)) * (1 - sm(seg(t, TC7 + 0.7, LAND7))) : 0, X = mix(XN7, XH7, sm(seg(t, TC7 + 0.25, TC7 + 0.7)));
        if (t >= LAND7) pool(XH7, ZH7, 0, bump(t, LAND7 + 0.05, 0.3) + 0.6 * S.rowK(L.HI) + 0.25 * sm(seg(t, LAND7, LAND7 + 0.45)));
        body(X, ZH7, up, 1, 'doc', o.cp.lit * up / 0.02);
        outline(X, ZH7, 'doc', o.cp.lit * (up > 0 ? 1 : tileSight7(v, X, ZH7)) * lit(made67G(o.cp)), up);
        codeLines7(c, C, up > 0 ? null : v, X, ZH7, 'doc', o.cp.lit, up);
        // the copy settles: its outline spreads once over the floor
        const lk = seg(t, LAND7, LAND7 + 0.5);
        if (lk > 0 && lk < 1) { c.save(); c.globalAlpha *= 0.65 * (1 - lk); c.strokeStyle = CREAM_S; c.save(); flT7(c, C, XH7, ZH7, 0, 1 + 0.45 * lk); flShape7(c, 'doc'); c.restore(); c.lineWidth = 1.4; c.stroke(); c.restore(); }
      }
      if (o.rd.lit > 0) {
        const [X, Z, up] = o.rd.XZ, k = o.rd.lit, s = o.rd.scale * Z / P07[1];
        body(X, Z, up, s, 'round', k);
        outline(X, Z, 'round', k * 0.85, up, s);
        codeLines7(c, C, null, X, Z, 'round', k, up, s);
      }
    }, true);
  }
  // the check standing in the gap shows an orange ✕ from the moment it stands up (it is there to stop the piece), and a larger ✕
  // stays over the gap once the round piece is pushed back
  if (S.sk > 0) mk(sh, o.ts.at[0], o.ts.at[1], a * o.ts.lit, c => { const s = L.tsS * S.sz; c.scale(s, s); shieldLine(c, CC67(1, Math.min(1, 0.8 + 0.2 * S.jam))); xGlyph67(c, L.tsX); });
  const xa = sm(seg(t, TB7 + 0.08, TB7 + 0.25)) * (1 - sm(seg(t, 7.15, 7.3)));
  if (xa > 0) { const p = flP7(C, XH7, ZH7, 0.012 + 0.006 * sm(seg(t, TB7 + 0.08, TB7 + 0.4))); mk(sh, p[0], p[1], a * xa, c => xGlyph67(c, 5.5)); }
  mkP(sh, L.pp[0], L.pp[1], a * o.pp.vis, c => face(c, L.fr, exprOf(t, [[0, 'neutral'], [THAPPY7, 'happy']])));
  mk(sh, L.rq[0], L.rq[1], a * o.rq.vis, c => { c.scale(o.rq.scale, o.rq.scale); bubbleLine(c, 58, 36, false, amberA); lines3(c, 58, AMBER_S); });
}
function boardShape(rand) {
  const L = lay('board'), b = 0.8, C = L.cam;
  const tile = (name, X, Z, kind, up = 0) => { const p = flP7(C, X, Z, up); return { name, w: 90, h: 50, b, solid: true, draw: c => { c.translate(-p[0], -p[1]); tileInk7(c, C, X, Z, kind, up); } }; };
  const specs = [
    { name: 'tiles', abs: true, w: L.VW + L.tw, h: L.VH, b, solid: true, draw: c => tiles7(L).forEach(q => tileInk7(c, C, Xc7(q.i), Zr7(q.j), ROWS7[q.j])) },
    tile('nL', XH7 - FL7.px, ZH7, 'doc'), tile('nR', XN7, ZH7, 'doc'), tile('cp', XH7, ZH7, 'doc'), tile('rd', P07[0], P07[1], 'round', 0.012),
    { name: 'ts', w: 30, h: 34, draw: INK.shield, hollow: true, temp: 0, white: 0.02, tail: 0.1, solid: true },
    fc67('pp', L.fr),
    { name: 'rq', w: 64, h: 58, draw: INK.bubble(58, 36, false), temp: 0.5, hollow: true, solid: true }
  ];
  return sceneShape('board', L, specs, rand);
}
Object.assign(LAYOUT, { rules: { W: L6, T: L6T }, board: { W: L7, T: L7T } });

/* ------------------------------------------------------- scene timelines */
/* 장면 2~7 은 스토리보드의 시간표를 그대로 옮긴다. 이야기 시간 T 의 처음 LEAD 초는 앞 장면의 입자가 새 사물로 모여드는 몫이라
   스토리보드 시각은 t = T - LEAD 다. state(L, t) 가 사물마다 자리·보임을 내면 프레임마다 uArr 에 올리고,
   marks 가 선명한 층(#ov)에 이목구비·말풍선 속 줄·글리프처럼 입자로 읽히지 않는 작은 표시를 그린다 */
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const bump = (t, at, w) => Math.max(0, 1 - Math.abs(t - at) / w);
const backOut = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const pop = (t, a) => backOut(seg(t, a, a + 0.32));
// a speech bubble pops in at t0 and, when out is given, fades over 0.3 s from then
const said = (t, t0, out) => t < t0 ? 0 : seg(t, t0, t0 + 0.1) * (out === undefined ? 1 : 1 - sm(seg(t, out, out + 0.3)));
const bub = (at, t, t0, out) => ({ at, vis: said(t, t0, out), scale: Math.max(0.05, pop(t, t0)) });
function exprOf(t, steps) {
  let cur = steps[0][1];
  for (let i = 1; i < steps.length; i++) {
    const [a, ex] = steps[i];
    if (t < a) return { e: cur };
    if (t < a + 0.25) return { e: cur, e2: ex, k: sm(seg(t, a, a + 0.25)) };
    cur = ex;
  }
  return { e: cur };
}
const pulseOf = p => ({ glow: 1 + 0.5 * Math.min(1, p), size: 1 + 0.2 * Math.min(1, p) });

/* 02 · 동료 같은 에이전트: 동료 얼굴 고리의 빈자리에 에이전트가 나타나고, 부르면 코드베이스와 데이터베이스에서 근거를 가져와 답하고
   티켓과 PR 을 만든다 */
function teamState(L, t) {
  const S = seats2(L), A = S[0], o = {};
  const dim = 1 - 0.7 * sm(seg(t, 4.6, 5.2));
  // the ring and the faces gather while the last scene's particles are still on their way, so they are whole by the storyboard's start
  o.ring = { at: L.C, vis: sm(seg(t, -0.5, 0)) };
  for (let i = 1; i < 6; i++) o['f' + i] = { at: S[i], vis: sm(seg(t, -0.55 + 0.05 * i, -0.3 + 0.05 * i)) };
  o.q = bub([S[CALLER][0] + L.q[0], S[CALLER][1] + L.q[1]], t, 1.8);
  const ic = sm(seg(t, 2.2, 2.7));
  o.code = { at: L.code, vis: ic, glow: dim - 1 };
  o.db = { at: L.db, vis: ic, glow: dim - 1 };
  // the fetch lines fade out once the cards come, so nothing crosses them
  const bk = sm(seg(t, 2.3, 2.8)), ba = dim * (1 - 0.75 * sm(seg(t, 3.3, 3.6))) * (1 - sm(seg(t, 4.5, 5.1)));
  o.bL = { abs: true, vis: sm(seg(t, 1.6, 2.1)), drawn: bk, glow: ba - 1 };
  o.bR = { abs: true, vis: sm(seg(t, 1.6, 2.1)), drawn: bk, glow: ba - 1 };
  const bl = beam2(L, 'bL'), br = beam2(L, 'bR'), back = outCubic(seg(t, 2.8, 3.4));
  const dv = sm(seg(t, 2.62, 2.8)) * (1 - sm(seg(t, 3.36, 3.48)));
  o.dL = { at: qpt(bl[2], bl[1], bl[0], back), vis: dv };
  o.dR = { at: qpt(br[2], br[1], br[0], back), vis: dv };
  o.a = bub([A[0] + L.a[0], A[1] + L.a[1]], t, 3.5);
  o.a.glow = (dim * 0.5 + 0.5) - 1;
  o.tk = { at: L.tk, vis: outCubic(seg(t, 4.6, 5.0)) };
  o.pr = { at: L.pr, vis: outCubic(seg(t, 4.75, 5.15)) };
  const ak = pop(t, 0.7), p = pulseOf(bump(t, 2.3, 0.25) + bump(t, 3.45, 0.25));
  return { o, dim, agGlow: clamp(ak, 0, 1) * p.glow, agSize: Math.max(0.05, ak) * p.size };
}
const teamAg = (L, t) => seats2(L)[0];
function teamMarks(sh, S, D, a, t) {
  const L = sh.L, seats = seats2(L), o = S.o, d = D.o, on = n => Math.min(o[n].vis, d[n].vis);
  // the ring between the faces: arcs from seat to seat, stopping short of each face and of the agent's seat
  mkS(sh, a * on('ring') * 0.3, (c, P) => {
    const gap = (L.fr * FACE_GLOW + 4) / L.R;
    c.strokeStyle = creamA(1); c.lineWidth = SW.ring;
    for (let i = 0; i < 6; i++) {
      const a0 = (-90 + 60 * i) * Math.PI / 180 + gap, a1 = (-30 + 60 * i) * Math.PI / 180 - gap;
      c.beginPath();
      for (let j = 0; j <= 16; j++) { const u = mix(a0, a1, j / 16), s = P(L.C[0] + L.R * Math.cos(u), L.C[1] + L.R * Math.sin(u)); j ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }
      c.stroke();
    }
  });
  // the fetch lines, drawn from the agent out as they reach the editor and the database
  ['bL', 'bR'].forEach(n => mkS(sh, a * on(n) * Math.max(0, 1 + (o[n].glow || 0)) * 0.55, (c, P) => {
    const b = beam2(L, n);
    c.strokeStyle = creamA(1); c.lineWidth = SW.link;
    qLineS(c, P, b[0], b[1], b[2], o[n].drawn);
  }));
  mk(sh, L.code[0], L.code[1], a * on('code') * S.dim, codeLine);
  mk(sh, L.db[0], L.db[1], a * on('db') * S.dim, cylLine);
  mk(sh, o.q.at[0], o.q.at[1], a * on('q'), c => { c.scale(o.q.scale, o.q.scale); bubbleLine(c, 58, 36, true, amberA); });
  mk(sh, o.a.at[0], o.a.at[1], a * on('a') * (S.dim * 0.5 + 0.5), c => { c.scale(o.a.scale, o.a.scale); bubbleLine(c, 58, 36, false, creamA); });
  mk(sh, L.tk[0], L.tk[1], a * on('tk'), c => boxLine(c, -44, -17, 88, 34, 6, creamA, 0.7));
  mk(sh, L.pr[0], L.pr[1], a * on('pr'), c => boxLine(c, -44, -17, 88, 34, 6, creamA, 0.7));
  for (let i = 1; i < 6; i++) {
    const ex = i === CALLER ? exprOf(t, [[0, 'neutral'], [3.85, 'happy']]) : { e: 'neutral' };
    mkP(sh, seats[i][0], seats[i][1], a * Math.min(o['f' + i].vis, d['f' + i].vis), c => face(c, L.fr, ex));
  }
  mk(sh, o.q.at[0], o.q.at[1], a * Math.min(o.q.vis, d.q.vis), c => { c.scale(o.q.scale, o.q.scale); lines3(c, 58, AMBER_S); });
  const ic = a * Math.min(o.code.vis, d.code.vis) * S.dim;
  mk(sh, L.code[0], L.code[1], ic, codeGlyph);
  mk(sh, o.a.at[0], o.a.at[1], a * Math.min(o.a.vis, d.a.vis) * (S.dim * 0.5 + 0.5), c => { c.scale(o.a.scale, o.a.scale); lines3(c, 58, CREAM_S); });
  mk(sh, L.tk[0], L.tk[1], a * Math.min(o.tk.vis, d.tk.vis), c => cardGlyph(c, 'ticket', seg(t, 5.1, 5.4)));
  mk(sh, L.pr[0], L.pr[1], a * Math.min(o.pr.vis, d.pr.vis), c => cardGlyph(c, 'pr', seg(t, 5.3, 5.6)));
}

/* ------------------------------------------------------- frames */
let lastState = null, objKey = null;
const OBJP = new Float32Array(40 * 2), OBJV = new Float32Array(40 * 2);
// one object's state into uArr, four vec4 each (see objRole). The anchor's exact velocity this step carries its particles along,
// so a walking face keeps its features on it; a jump to a new place is left to the springs
function putObj(sh, name, o, dt, fresh) {
  const k = sh.O[name];
  if (k === undefined || !o) return;
  // an object drawn in frame places (abs) sits on the frame's middle, moved by dx when the scene's camera moves (07 on narrow screens)
  const F = sh.F, p = sh.spec[k].abs ? vw(F, F.VW / 2 + (o.dx || 0), F.VH / 2) : vw(F, o.at[0], o.at[1]);
  const vis = o.vis === undefined ? 1 : o.vis, j = k * 2;
  const dx = p[0] - OBJP[j], dy = p[1] - OBJP[j + 1];
  if (!fresh && dt > 0 && vis > 0.01 && dx * dx + dy * dy < 1) { OBJV[j] = dx / dt; OBJV[j + 1] = dy / dt; }
  else { OBJV[j] = 0; OBJV[j + 1] = 0; }
  OBJP[j] = p[0]; OBJP[j + 1] = p[1];
  const b = k * 4;
  arr4(b, p[0], p[1], p[2], o.scale === undefined ? 1 : o.scale);
  arr4(b + 1, vis, o.morph || 0, o.glow || 0, o.clay || 0);
  arr4(b + 2, o.clay1 || 0, o.floor || 0, o.white || 0, o.drawn === undefined ? 1 : o.drawn);
  arr4(b + 3, OBJV[j], OBJV[j + 1], o.stiff || 0, o.tile ? 1 : 0);
}
// the crisp layer comes in once the particles have had time to gather into the scene's shapes (faces, the agent); the solid
// outlines, which have no particles, come in with it and then follow their objects' visibility
const markA = () => sm(seg(rt, 0.45, 1.1));
function storyFrame(T, rt, dt) {
  const sc = SCENES[sceneIdx], sh = curShape, L = sh.L, t = T - LEAD;
  story(STORY, T, rt, { form: 0.8, stagger: 0.35, ramp: 0.6, noise: 0.4, col: 2.6 });
  const S = sc.state(L, t);
  const fresh = objKey !== sh || rt < 1e-6;
  objKey = sh;
  for (const name in S.o) putObj(sh, name, S.o[name], dt, fresh);
  if (sc.uniforms) sc.uniforms(sh, S);
  agent(tt => { const p = sc.agentAt(L, tt - LEAD); return vw(sh.F, p[0], p[1], 0.02); }, T, S.agGlow === undefined ? 1 : S.agGlow, S.agSize || 1);
  R.trail = 0.3; R.tail = 0.045; R.maskA = 0.6; R.jitter = 0.0006;
  // a scene may shorten the afterimage while something flies across it; the gain keeps the still parts as bright as at 0.3
  if (S.trail !== undefined) { R.trail = S.trail; R.gain = Math.sqrt((1 - S.trail) / 0.7); }
  if (sc.bg) { R.bg0 = sc.bg[0]; R.bg1 = sc.bg[1]; }
  lastState = S;
}

/* ------------------------------------------------------- the crisp layer */
const ovc = document.getElementById('ov');
const ovx = ovc ? ovc.getContext('2d') : null;
const FEAT = '#2a1a0e', CREAM_S = 'rgba(246,236,223,0.92)', AMBER_S = 'rgba(255,168,77,0.95)', CLAY_S = '#eb663d';
let ovDirty = false;
// the marks' own pixel ratio: the screen's (at most 2, or ?dpr=), not lowered when the particles are (dropCheck)
let od = 1;
/* 탭하면 그 둘레 입자가 흩어진다(scatterAt). 그 위의 표시는 밑의 입자가 밀려난 만큼 지우고, 입자가 돌아오면 다시 보인다.
   x, y: 탭한 곳, r: 흩어지는 반지름(월드 0.7)의 화면 크기(CSS px), t: 탭한 뒤 지난 시간(초).
   BURST_K: 표시 밑의 입자가 밀린 거리를 한가운데 입자가 가장 멀리 밀리는 거리(r 의 약 6%, 1440 에서 약 19px)로 나눈 값.
   이 값이 BURST_K[0] 를 넘으면 표시가 옅어지기 시작하고 BURST_K[1] 에서 다 지워진다. 비율이라 좁은 화면에서도 같은 만큼 지운다.
   실선 사물이 있는 장면에서는 밑에서 흩어지는 입자가 없으므로, 층 전체는 BURST_SOLID 까지만 옅어진다(그 이상 지우면 사물이 깜빡여 보였다).
   얼굴 이목구비만 BURST_K 대로 지운다(mkP) */
let ovBurst = null;
const BURST_K = [0.13, 0.5], BURST_SOLID = 0.25;
// how far the particles have gone at time t after a tap, as a share of the farthest (0.1초에 가장 멀리 갔다가 0.4초면 돌아옴, 캡처로 잼)
const burstH = t => t < 0.1 ? sm(t / 0.07) : Math.exp(-(((t - 0.1) / 0.145) ** 2));
// how much of a mark at screen point p (CSS px) a tap takes away, 0~1: the rule of the gradient at the end of drawMarks
function burstAt(p) {
  if (!ovBurst || !p) return 0;
  const b = ovBurst, m = Math.exp(-((Math.hypot(p[0] - b.x, p[1] - b.y) / b.r) ** 2)) * burstH(b.t);
  return clamp((m - BURST_K[0]) / (BURST_K[1] - BURST_K[0]), 0, 1);
}
/* 실선의 굵기는 화면 크기와 상관없이 CSS px 로 정한다(SW). mk 는 그리는 단위 하나가 몇 CSS px 인지(mkU)를 두고, px(v) 가 CSS px 를 그 단위로 바꾼다.
   스토리보드(1 단위 ≈ 1.03 CSS px)의 굵기·알파를 바탕으로, 테두리는 안쪽 선(글줄·아이콘)보다 가늘고 옅게 둔다 */
let mkU = 1, uw = 1.2;
const px = v => v / mkU;
const SW = { bub: 1.6, box: 1.4, ring: 1.2, link: 1.3 };
const creamA = a => `rgba(246,236,223,${a})`, amberA = a => `rgba(255,168,77,${a})`;
/* 사물 점이 01 이름 점만큼 밝아서, 그 위에 크림·호박색 선을 그대로 그리면 점과 섞여 잘 보이지 않는다. 그래서 표시마다 같은 그림을
   바탕색(UNDER_C)으로, 선을 UNDER_W(그림 단위)만큼 굵게 한 번 먼저 그려 선 둘레의 점을 가린 뒤 원래 색으로 그린다.
   under 는 ovx 를 감싸 선·칠 색과 선 굵기만 바꿔 넘긴다. 얼굴 이목구비(어두운 색)와 zzz(어두운 바탕 위)는 이 단계를 건너뛴다.
   그라데이션으로 칠하는 빛(07 의 슬롯·맞는 자리)은 선이 아니므로 이 단계에서 투명하게 둔다. 바탕색으로 칠하면 빛 둘레가 어두운 원으로 남았다 */
const UNDER_C = 'rgba(10,8,7,0.8)', UNDER_W = 1.2;
const underFn = new Map();
const under = ovx ? new Proxy(ovx, {
  get: (c, k) => {
    const v = c[k];
    if (typeof v !== 'function') return v;
    if (!underFn.has(k)) underFn.set(k, v.bind(c));
    return underFn.get(k);
  },
  set: (c, k, v) => { c[k] = k === 'strokeStyle' || k === 'fillStyle' ? (typeof v === 'string' ? UNDER_C : 'rgba(0,0,0,0)') : k === 'lineWidth' ? v + uw : v; return true; }
}) : null;
// a storyboard point of shape sh on screen, in CSS px
function sp(sh, x, y) { const w = vw(sh.F, x, y); return project(w[0], w[1], w[2]); }
// draw in storyboard units around (x, y); whole marks the frame origin instead, for lines between far points
function mk(sh, x, y, a, fn, whole) {
  if (!(a > 0.004)) return;
  mkAt(sp(sh, whole ? 0 : x, whole ? 0 : y), sp(sh, (whole ? 0 : x) + 8, whole ? 0 : y), a, fn);
}
// the same around screen point p, with q the screen point 8 storyboard units to its right (03's cloud: at the depth of each bubble)
function mkAt(p, q, a, fn) {
  if (!p || !q || !(a > 0.004)) return;
  const s = Math.hypot(q[0] - p[0], q[1] - p[1]) / 8 * od;
  mkU = s / od; uw = UNDER_W;
  ovx.setTransform(s, 0, 0, s, p[0] * od, p[1] * od);
  ovx.globalAlpha = Math.min(1, a);
  ovx.lineCap = 'round'; ovx.lineJoin = 'round'; ovx.setLineDash([]);
  ovx.save(); fn(under); ovx.restore();
  ovx.save(); fn(ovx); ovx.restore();
}
/* 넓게 걸친 선(고리·잇는 선)은 점마다 화면에 투영해 CSS px 로 그린다. 그림 하나를 한 가운데의 배율로 늘리면 카메라가 비스듬할 때
   끝이 어긋난다. P(x, y) 는 스토리보드 점의 화면 자리(CSS px), 굵기는 CSS px 그대로다 */
function mkS(sh, a, fn) {
  if (!(a > 0.004)) return;
  const P = (x, y) => sp(sh, x, y) || [0, 0], c0 = sp(sh, sh.F.VW / 2, sh.F.VH / 2), c1 = sp(sh, sh.F.VW / 2 + 8, sh.F.VH / 2);
  if (!c0 || !c1) return;
  mkU = 1; uw = UNDER_W * Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / 8;
  ovx.setTransform(od, 0, 0, od, 0, 0);
  ovx.globalAlpha = Math.min(1, a);
  ovx.lineCap = 'round'; ovx.lineJoin = 'round'; ovx.setLineDash([]);
  ovx.save(); fn(under, P); ovx.restore();
  ovx.save(); fn(ovx, P); ovx.restore();
}
/* 마우스가 입자를 밀어내는 정도(0~1)를 화면 점(CSS px)에서 잰다. 실선 장면에서는 #ov 전체를 지우지 않고, 입자 위에 얹힌 표시(얼굴 이목구비)만
   그 얼굴 가운데에서 잰 만큼 옅어진다(mkP). 실선 사물은 입자가 아니므로 마우스에 밀리지 않는다 */
function pushAt(p) {
  if (!p || !(pointerU[3] > 0)) return 0;
  const x = (pointerU[0] + 1) / 2 * innerWidth, y = (1 - pointerU[1]) / 2 * innerHeight, r = pointerU[2] * innerHeight / 2 * 1.1, k = Math.min(1, pointerU[3] / 26);
  const u = Math.hypot(p[0] - x, p[1] - y) / r;
  return k * (u < 0.6 ? mix(0.95, 0.6, u / 0.6) : u < 1 ? mix(0.6, 0, (u - 0.6) / 0.4) : 0);
}
// after a tap the face goes with its particles (BURST_K); drawMarks then takes up to BURST_SOLID off the whole layer, so that share is
// given back here (worked out at the face's middle)
function mkP(sh, x, y, a, fn) {
  if (!sh.solid) { mk(sh, x, y, a, fn); return; }
  const p = sp(sh, x, y), f = burstAt(p);
  mk(sh, x, y, a * (1 - pushAt(p)) * (1 - f) / (1 - BURST_SOLID * f), fn);
}
// solid outlines, drawn around (0, 0) in storyboard units inside mk: the inside is tinted faintly (dark in the under pass, so nothing
// drifting behind shows through) and the line is SW CSS px wide
function boxLine(c, x, y, w, h, r, col, al, lw = SW.box, fillA = 0.05) {
  rrq(c, x, y, w, h, r);
  c.fillStyle = col(fillA); c.fill();
  c.strokeStyle = col(al); c.lineWidth = px(lw); c.stroke();
}
function bubbleLine(c, w, h, right, col) {
  boxLine(c, -w / 2, -h / 2, w, h, 8, col, 0.9, SW.bub, 0.08);
  const tx = right ? w / 2 - 13 : -w / 2 + 13, dir = right ? 1 : -1;
  c.fillStyle = col(0.9); c.beginPath(); c.moveTo(tx - 4, h / 2 - 0.5); c.lineTo(tx + 4, h / 2 - 0.5); c.lineTo(tx + dir * 8, h / 2 + 8); c.closePath(); c.fill();
}
function codeLine(c) {
  boxLine(c, -28, -21, 56, 42, 5, creamA, 0.8);
  c.beginPath(); c.moveTo(-28, -11); c.lineTo(28, -11); c.stroke();
}
function cylLine(c) {
  c.fillStyle = creamA(0.05); c.beginPath(); c.ellipse(0, -18, 18, 6, 0, Math.PI, TAU); c.lineTo(18, 18); c.ellipse(0, 18, 18, 6, 0, 0, Math.PI); c.closePath(); c.fill();
  c.strokeStyle = creamA(0.8); c.lineWidth = px(SW.box);
  c.beginPath(); c.ellipse(0, -18, 18, 6, 0, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(-18, -18); c.lineTo(-18, 18); c.moveTo(18, -18); c.lineTo(18, 18); c.stroke();
  c.beginPath(); c.ellipse(0, 0, 18, 6, 0, 0, Math.PI); c.stroke();
  c.beginPath(); c.ellipse(0, 18, 18, 6, 0, 0, Math.PI); c.stroke();
}
// a quadratic curve from its start to k of the way, through screen points
function qLineS(c, P, p0, p1, p2, k) {
  if (k <= 0) return;
  c.beginPath();
  const n = Math.max(2, Math.ceil(28 * k));
  for (let i = 0; i <= n; i++) { const q = qpt(p0, p1, p2, k * i / n), s = P(q[0], q[1]); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }
  c.stroke();
}
function feat(c, r, e, al) {
  if (al <= 0 || c === under) return;
  c.save();
  c.globalAlpha *= al;
  c.strokeStyle = FEAT; c.fillStyle = FEAT; c.lineWidth = Math.max(1.4, r * 0.12);
  const ex = r * 0.36, ey = -r * 0.1, P = () => c.beginPath(), S = () => c.stroke(), eyes = (dy = 0.04) => [-1, 1].forEach(d => { P(); c.arc(d * ex, ey + r * dy, r * 0.11, 0, TAU); c.fill(); });
  if (e === 'neutral') { eyes(0); P(); c.moveTo(-r * 0.24, r * 0.38); c.lineTo(r * 0.24, r * 0.38); S(); }
  else if (e === 'happy') { [-1, 1].forEach(d => { P(); c.arc(d * ex, ey + r * 0.08, r * 0.16, Math.PI, TAU); S(); }); P(); c.arc(0, r * 0.1, r * 0.42, 0.18 * Math.PI, 0.82 * Math.PI); S(); }
  else if (e === 'focus') { [-1, 1].forEach(d => { P(); c.arc(d * ex + r * 0.26, ey + r * 0.04, r * 0.115, 0, TAU); c.fill(); }); P(); c.moveTo(r * 0.12, r * 0.42); c.lineTo(r * 0.36, r * 0.42); S(); }
  else if (e === 'sleep') { [-1, 1].forEach(d => { P(); c.arc(d * ex, ey - r * 0.04, r * 0.16, 0, Math.PI); S(); }); P(); c.arc(r * 0.05, r * 0.44, r * 0.09, 0, TAU); S(); }
  else if (e === 'worried' || e === 'frown') {
    const w = e === 'worried';
    eyes();
    [-1, 1].forEach(d => { P(); c.moveTo(d * (ex + r * (w ? 0.18 : 0.2)), ey - r * (w ? 0.22 : 0.36)); c.lineTo(d * (ex - r * 0.14), ey - r * (w ? 0.36 : 0.22)); S(); });
    P(); c.arc(0, r * 0.66, r * 0.26, 1.22 * Math.PI, 1.78 * Math.PI); S();
  }
  c.restore();
}
function face(c, r, x) { const k = x.k || 0; feat(c, r, x.e, x.e2 ? 1 - k : 1); if (x.e2) feat(c, r, x.e2, k); }
function lines3(c, w, col) {
  c.strokeStyle = col; c.lineWidth = 1.5;
  [0.78, 0.6, 0.4].forEach((f, i) => { c.beginPath(); c.moveTo(-w / 2 + 9, (i - 1) * 8); c.lineTo(-w / 2 + 9 + (w - 18) * f, (i - 1) * 8); c.stroke(); });
}
function shieldGlyph(c, col) { c.strokeStyle = col || CREAM_S; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, 0); c.lineTo(-1.2, 3.8); c.lineTo(5.5, -4); c.stroke(); }
function codeGlyph(c) {
  c.fillStyle = CREAM_S; c.strokeStyle = CREAM_S;
  [-21, -15.5, -10].forEach(d => { c.beginPath(); c.arc(d, -16, 1.4, 0, TAU); c.fill(); });
  c.lineWidth = 1.7; c.beginPath();
  c.moveTo(-9, -1); c.lineTo(-16, 5.5); c.lineTo(-9, 12); c.moveTo(9, -1); c.lineTo(16, 5.5); c.lineTo(9, 12); c.moveTo(3.5, -3); c.lineTo(-3.5, 14);
  c.stroke();
}
function cardGlyph(c, kind, ck) {
  c.strokeStyle = CREAM_S; c.lineWidth = 1; c.strokeRect(-34, -5, 9, 10);
  if (ck > 0) {
    const p = [[-33, 0], [-30, 3], [-24, -5]], k1 = clamp(ck * 2, 0, 1), k2 = clamp(ck * 2 - 1, 0, 1);
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(mix(p[0][0], p[1][0], k1), mix(p[0][1], p[1][1], k1));
    if (k2 > 0) c.lineTo(mix(p[1][0], p[2][0], k2), mix(p[1][1], p[2][1], k2));
    c.stroke();
  }
  c.lineWidth = 1.2; c.translate(12, 0);
  if (kind === 'ticket') {
    const w = 36, h = 22;
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, -4); c.arc(w / 2, 0, 4, -Math.PI / 2, Math.PI / 2, true); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.lineTo(-w / 2, 4); c.arc(-w / 2, 0, 4, Math.PI / 2, -Math.PI / 2, true); c.closePath(); c.stroke();
    c.setLineDash([2, 2]); c.beginPath(); c.moveTo(7, -h / 2 + 3); c.lineTo(7, h / 2 - 3); c.stroke(); c.setLineDash([]);
  } else {
    const cir = (x, y) => { c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.stroke(); };
    cir(-9, -9); cir(-9, 9); cir(9, 9);
    c.beginPath(); c.moveTo(-9, -5.8); c.lineTo(-9, 5.8); c.moveTo(9, 5.8); c.lineTo(9, -5); c.quadraticCurveTo(9, -9, 5, -9); c.lineTo(-2, -9); c.moveTo(1.5, -12.5); c.lineTo(-2, -9); c.lineTo(1.5, -5.5); c.stroke();
  }
}
// the screen of the person who knows: lines of work scroll up while they type
function monitor(sh, L, a, mon, typing) {
  const m = L.mon, ws = [38, 26, 44, 20, 32, 40, 24];
  const Ln = typing ? 3 + simTime * 1.1 : 3.999, n = Math.floor(Ln), part = Ln - n;
  mk(sh, m[0], m[1], a * 0.8 * mon, c => {
    c.beginPath(); c.rect(2, 3, m[2] - 4, m[3] - 8); c.clip();
    c.strokeStyle = CREAM_S; c.lineWidth = 1.2;
    const ga = c.globalAlpha, up = sm(clamp(part * 4 - 3, 0, 1));
    for (let k = 0; k < 4; k++) {
      const idx = n - 3 + k;
      if (idx < 0) continue;
      const f = idx === n ? part : 1, y = 10 + k * 8 - 8 * up;
      // the top line fades while it slides up, so it leaves over the slide (about 0.23 s) instead of the two frames it took to
      // cross the clip, which changed the screen's light by about 10% at once
      c.globalAlpha = k ? ga : ga * (1 - up);
      c.beginPath(); c.moveTo(8, y); c.lineTo(8 + ws[idx % ws.length] * f, y); c.stroke();
    }
  });
}
// dir -1 floats them up to the left (05: the colleague's question sits up to the right of the sleeper's head)
function zzz(sh, x, y, a, dir = 1) {
  for (let k = 0; k < 3; k++) {
    const ph = (simTime * 0.5 + k / 3) % 1;
    // one font size, grown with a scale: with a new font size every frame the browser resolves the font and draws the glyph
    // afresh each time, which made this scene's frames about six times as costly as the others' and dropped frames
    mk(sh, x + dir * ph * 26, y - ph * 40, a * Math.sin(ph * Math.PI) * 0.9, c => {
      if (c === under) return;
      const k = (10 + ph * 8) / 18; c.scale(k, k);
      if (zImg) { c.drawImage(zImg, -Z_BOX / 2, -Z_BOX / 2, Z_BOX, Z_BOX); return; }
      c.fillStyle = CREAM_S; c.font = `700 18px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('z', 0, 0);
    });
  }
}
// the letter itself is drawn once, when the fonts are ready (fontsDone), into a canvas of its own and copied after: drawing it as text
// cost 2~10ms of one #ov frame each time 05 came in (the browser set the font up again then), even with a 'z' drawn at load
const Z_BOX = 24, Z_RES = 5;
let zImg = null;
function warmZ() {
  const cv = document.createElement('canvas'), c = cv.getContext('2d');
  if (!c) return;
  cv.width = cv.height = Z_BOX * Z_RES; c.scale(Z_RES, Z_RES);
  c.fillStyle = CREAM_S; c.font = `700 18px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('z', Z_BOX / 2, Z_BOX / 2);
  zImg = cv;
}
/* 장면이 바뀌면 떠난 장면의 실선은 바로 지우지 않고 새 장면의 처음 OV_OUT 초(rt) 동안 옅어진다. 그동안 입자는 새 장면의 모양으로 날아간다 */
const OV_OUT = 0.35;
let ovPrev = null;
function drawMarks() {
  if (!ovx) return;
  od = DPR_FIX || Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(innerWidth * od), H = Math.round(innerHeight * od);
  if (ovc.width !== W || ovc.height !== H) { ovc.width = W; ovc.height = H; ovDirty = true; }
  const sc = SCENES[sceneIdx], sh = curShape;
  const live = !!(sc.marks && lastState && sh && sh.key === sc.key && !waitingFont && objKey === sh);
  const prev = ovPrev && (!live || ovPrev.sh !== sh) && rt < OV_OUT ? ovPrev : null;
  if (!live && !prev && !ovDirty) return;
  ovx.setTransform(1, 0, 0, 1, 0, 0);
  ovx.clearRect(0, 0, W, H);
  ovDirty = false;
  if (prev) { ovDirty = true; prev.sc.marks(prev.sh, prev.S, prev.D, prev.a * (1 - sm(rt / OV_OUT)), prev.t); }
  if (!live) return;
  const a = markA();
  if (a <= 0) return;
  ovDirty = true;
  const t = storyT - LEAD, D = sc.state(sh.L, t - 0.22);
  sc.marks(sh, lastState, D, a, t);
  ovPrev = { sc, sh, S: lastState, D, a, t };
  ovx.setTransform(1, 0, 0, 1, 0, 0);
  ovx.globalAlpha = 1;
  // where the pointer pushes the particles aside, the marks drawn on them give way with them (scenes with solid outlines: mkP)
  if (pointerU[3] > 0 && !sh.solid) {
    const px = (pointerU[0] + 1) / 2 * W, py = (1 - pointerU[1]) / 2 * H, r = pointerU[2] * H / 2 * 1.1, k = Math.min(1, pointerU[3] / 26);
    const g = ovx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(0,0,0,${0.95 * k})`); g.addColorStop(0.6, `rgba(0,0,0,${0.6 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ovx.globalCompositeOperation = 'destination-out';
    ovx.fillStyle = g; ovx.fillRect(px - r, py - r, 2 * r, 2 * r);
    ovx.globalCompositeOperation = 'source-over';
  }
  // after a tap: the particles move about exp(-(거리/r)²)·burstH(t) times the most the middle moves. a mark goes once its particles
  // have moved BURST_K[1] of that and is whole again under BURST_K[0]; with solid outlines the layer goes down by BURST_SOLID at most
  if (ovBurst) {
    const b = ovBurst, h = burstH(b.t), cap = sh.solid ? BURST_SOLID : 1;
    const x = b.x * od, y = b.y * od, r = b.r * 1.9 * od, g = ovx.createRadialGradient(x, y, 0, x, y, r);
    for (let i = 0; i <= 8; i++) {
      const u = i / 8 * 1.9, m = Math.exp(-u * u) * h;
      g.addColorStop(i / 8, `rgba(0,0,0,${(cap * clamp((m - BURST_K[0]) / (BURST_K[1] - BURST_K[0]), 0, 1)).toFixed(3)})`);
    }
    ovx.globalCompositeOperation = 'destination-out';
    ovx.fillStyle = g; ovx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ovx.globalCompositeOperation = 'source-over';
  }
}
/* ---------------------------------------------------- 08 · 연락 */
// the agent's work ends in scene 7: here it fades where it stood, and only the name and the contact links stay
function contactFrame(t, rt, dt) {
  story(CONTACT, t, rt, { form: 0.9, stagger: 0.45, ramp: 0.6, noise: 0.35, col: 2.4 });
  const pb = shapeOf('board'), p7 = boardAg(pb.L, SCENES[LAST - 1].Tend - LEAD), from = vw(pb.F, p7[0], p7[1], 0.02);
  agent(() => from, t, 1 - sm(clamp(t / 0.7, 0, 1)));
  R.trail = 0.4; R.tail = 0.04; R.jitter = 0.0009; R.maskA = 0.8; R.par = 0;
}
function galaxyFrame(t) {
  const tall = layout === 'tall';
  // resetUniforms clears U.rt every frame; without it the spring stays at 4% and the particles never reach the disk,
  // drifting on their own for as long as the body is read
  U.mode = GALAXY; U.phaseT = t; U.rt = t; U.noise = 0.25; U.noiseFreq = 0.8;
  U.P[0] = 1.08; U.P[1] = -0.42; U.P[2] = tall ? 1.25 : 1.75; U.P[3] = 0.025;
  U.Q[0] = tall ? 0.1 : 0.55; U.Q[1] = tall ? 0.2 : 0.0; U.Q[2] = -0.7; U.Q[3] = 0.16;
  U.S[0] = 3.0 * sm(t / 2.5) + 0.3; U.S[1] = 0.4;
  U.colRate = 1.2;
  R.trail = 0.55; R.dim = 0.85; R.jitter = 0; R.twk = 0; R.tail = 0.03; R.fixEnd = 0;
}

/* ------------------------------------------------------------ the scenes */
/* Tend 은 장면이 끝나는 이야기 시간(앞 장면에서 모여드는 LEAD 초 + 스토리보드 길이), ev 는 쫓는 속도에 상한을 두는 사건 구간의 끝이다.
   카메라는 정면에서 아주 조금만 돈다. 선명한 층이 입자 그림과 어긋나지 않을 만큼이다 */
const SCENES = [
  { key: 'name', real: true, camK: 5, from: { yaw: -0.42, pitch: 0.16, dz: 0.95, roll: 0.22 }, cam: () => ({}) },
  { key: 'team', Tend: 6.5, ev: 6.1, camK: 3, cam: t => ({ yaw: mix(-0.05, 0.05, sm(t / 6.5)), pitch: 0.03 }),
    frame: storyFrame, state: teamState, agentAt: teamAg, marks: teamMarks },
  { key: 'recall', Tend: 11.1, ev: 9.9, camK: 3, cam: () => ({ pitch: 0.02 }),
    frame: storyFrame, state: recallState, agentAt: recallAg, marks: recallMarks },
  { key: 'day', Tend: 6.9, ev: 5.25, camK: 3, cam: t => ({ yaw: mix(0.04, -0.03, sm(t / 6.9)), pitch: 0.03 }), bg: [1.5, 1.1],
    frame: storyFrame, state: dayState, agentAt: dayAg, marks: dayMarks },
  { key: 'night', Tend: 8.5, ev: 6.8, camK: 3, cam: t => ({ yaw: mix(0.03, -0.02, sm(t / 8.5)), pitch: 0.03 }), bg: [0.45, 0],
    frame: storyFrame, state: nightState, agentAt: nightAg, marks: nightMarks },
  { key: 'rules', Tend: 14.1, ev: 13.4, camK: 3, cam: t => ({ dz: mix(-0.03, 0.02, sm(t / 14.1)) }),
    frame: storyFrame, state: rulesState, agentAt: rulesAg, marks: rulesMarks },
  { key: 'board', Tend: 11.6, ev: 11.2, camK: 3, cam: t => ({ yaw: mix(-0.04, 0.03, sm(t / 11.6)), pitch: 0.03 }),
    frame: storyFrame, state: boardState, agentAt: boardAg, marks: boardMarks, uniforms: boardUniforms },
  { key: 'contact', Tend: 3.6, ev: 1.8, camK: 3, cam: () => ({}), frame: contactFrame },
  { key: 'galaxy', real: true, camK: 2.5, cam: () => ({}) }
];
const GALAXY_I = SCENES.length - 1, LAST = GALAXY_I - 1;
/* ------------------------------------------------------- scroll and UI */
const sections = [...document.querySelectorAll('.scene')];
const caps = sections.map(s => s.querySelector('.cap'));
const afterEl = document.querySelector('.after');
const navBtns = [...document.querySelectorAll('#tabs button')];
const bars = navBtns.map(b => b.querySelector('.bar i'));
const tabsEl = document.getElementById('tabs');

/* 장면 진행은 스크롤에 묶는다. 장면 구간 안에서 화면 가운데가 지난 비율 f 로 목표 이야기 시간 Tend × min(f / 0.8, 1) 을 정하고
   (끝 20% 는 마지막 모양에 머문다. 장면 8 은 본문이 화면에 들어오기 전에 끝나도록 끝 절반), 그리는 시간은 그 목표를 쫓는다. 사건 구간에서는 쫓는 속도에 상한을 두어 휙 넘겨도
   사건이 보이게 하고, 목표가 한 장면 넘게 앞서거나 뒤처지면 바로 그 장면으로 건너뛴다. 장면 1 과 본문 뒤 은하는 실제 시간으로 돈다 */
const KCH = 6, VMIN = 0.6, VEV = 1.5, VEVB = 3, VREST = 10;
/* 스크롤이 IDLE_S 초 동안 움직이지 않으면 그 장면의 시계를 실제 시간으로 이어 돌려 장면 끝까지 보여 준다. 처음 연 사람은 한두 번
   스크롤하고 멈추는데, 시계가 스크롤 위치에 서 버리면 반쯤 그린 그림을 장면의 전부로 받아들인다(2026-10-10 리뷰). 페이지는 움직이지
   않고, 끝에 닿으면 끝 화면에 머물며 다음 장면으로 넘어가지 않는다. 이렇게 재생한 시각(played)은 아래로 다시 스크롤해도 뒤로 감기지
   않는다. 위로 스크롤하면 시계는 스크롤 위치를 따른다 */
const IDLE_S = 0.4;
let played = 0, idleFor = 0, scrollAt = -1, upward = false;
let sceneIdx = -1, storyT = 0, rt = 0, realT = 0, simTime = 1.0;
let manual = false, manualTo = 0, waitingFont = false, nameAt = -1;
const lastAg = new Float32Array(4);
let agSpd = 0;
/* 에이전트는 장면이 바뀌어도 한 빛이다. 장면이 원하는 자리로 미끄러지되 화면 긴 변의 AG_V 배/초보다 빨리 가지 않아 혜성이 되지 않는다.
   에이전트 입자의 꼬리는 원판 반지름의 AG_TAIL 배까지만 그린다. 1.6배(AGS 기준)까지 그리던 때는 빠르게 옮겨 갈 때 꼬리가 원판 위에 겹쳐
   하얗게 뭉친 알약 모양이 됐다(06, 2026-10-10). 0 이면 움직여도 스토리보드처럼 둥근 점 원판이고, 뒤에 옅은 잔상만 남는다 */
const AG_V = 0.8, AG_TAIL = 0, agPos = new Float32Array(3);
let agLive = false, agInit = false;
const isStory = i => !SCENES[i].real;
function scrollTarget() {
  if (afterEl && afterEl.getBoundingClientRect().top < innerHeight * 0.5) return { i: GALAXY_I, f: 0 };
  const mid = innerHeight * 0.5;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    if (r.bottom > mid) return { i, f: clamp((mid - r.top) / Math.max(1, r.height), 0, 1) };
  }
  return { i: sections.length - 1, f: 1 };
}
const FULL = i => i === LAST ? 0.5 : 0.8;
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
function needsFont(i) { const k = SCENES[i].key; return k === 'name' || k === 'contact'; }
// the caption box of the scene in NDC (centre and half size, with a margin); particles fade inside it
const capRect = new Float32Array([0, -0.8, 0.5, 0.12]);
function measureCap() {
  const c = caps[Math.min(sceneIdx, caps.length - 1)];
  if (!c || sceneIdx === GALAXY_I) { capRect[1] = -3; return; }
  let r = settledRect(c, c), my = 26;
  // the last scene keeps the contact links outside the box, so only the words are masked
  const h = c.querySelector('h2'), p = c.querySelector('.sub');
  if (sceneIdx === LAST && h && p) {
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
  sceneIdx = i; storyT = t0; rt = 0; realT = 0; nameAt = -1; played = 0;
  calmFor(600);
  const sc = SCENES[i];
  waitingFont = !fontsReady && needsFont(i) && sc.key !== 'name';
  if (isStory(i) && !waitingFont) useShape(sc.key);
  if (sc.key === 'name' && how !== 'first') explode(1.6, [0, 0, 0.8]);
  applyCamGoal();
  if (how === 'show') snapCamera();
  root.classList.toggle('in-sec', i === GALAXY_I);
  root.classList.toggle('at0', i === 0);
  root.classList.toggle('at-end', i === LAST);
  // the links in words that are off screen leave the keyboard order through CSS (.cap without .on); the words stay readable.
  // the tabs leave it while the body is read
  caps.forEach((c, k) => { if (c) c.classList.toggle('on', k === i); });
  if (tabsEl) tabsEl.inert = i === GALAXY_I;
  measureCap();
  syncUI(true);
}
const go = (i, t0) => enter(i, t0, 'go');
function direct(dt) {
  if (manual) { if (storyT < manualTo) storyT = Math.min(manualTo, storyT + dt); return; }
  if (waitingFont) return;
  const y = scrollY;
  if (scrollAt < 0 || Math.abs(y - scrollAt) > 0.5) { if (scrollAt >= 0) upward = y < scrollAt; scrollAt = y; idleFor = 0; }
  else idleFor += dt;
  const tg = scrollTarget(), i = sceneIdx, sc = SCENES[i];
  if (tg.i === i) {
    if (!isStory(i)) return;
    // the auto-play moves the page itself and keeps its own pace
    const idle = idleFor >= IDLE_S && !ap.on;
    if (idle) upward = false;
    const tt = tgtT(i, tg.f), goal = upward ? tt : Math.max(tt, played), was = storyT;
    storyT = chase(storyT, goal, sc, dt);
    if (idle) storyT = Math.max(storyT, Math.min(sc.Tend, was + dt));
    played = upward ? 0 : Math.max(played, storyT);
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
  if (i !== sceneIdx) enter(i, 0, 'go');
}));

/* 첫 진입 자동 재생: 맨 위에서 열고 아무것도 건드리지 않으면 장면 1 의 이름이 모인 뒤 페이지를 프로그램으로 천천히 내린다.
   장면 진행은 그대로 스크롤에 묶여 있어 탭과 진행 막대도 함께 움직인다. 장면마다 AP_T 초 동안 이야기 시간을 1배속으로 보여 주고
   (Tend 를 넘는 몫은 마지막 모양에 머문다) AP_GLIDE 초 동안 다음 장면 첫머리로 미끄러진다. 장면 8 의 마지막 모양에서 한 번 끝나고
   본문으로 내려가거나 되풀이하지 않는다. 사용자가 직접 넘기려는 입력(휠·트랙패드, 터치로 끌기, 스크롤 키, 스크롤바, 장면 탭·목차 클릭)을
   하면 그 자리에서 끝나고 다시 켜지지 않는다. 포인터를 움직이거나 입자를 누르는 것, 한/EN 버튼과 연락처 링크는 끝내지 않는다 */
const AP_T = [0, 8.7, 13.4, 9.1, 10.8, 15.6, 13.0, 5.0];
const AP_PAUSE = 1.2, AP_GLIDE = 0.8, AP_GLIDE0 = 0.9;
// __apTaken: the visitor already scrolled with keys or moved focus before this script ran (index.html)
const ap = { on: false, over: STILL || (CAPTURE ? !qs.has('autoplay') : qs.has('noauto') || !!location.hash || !!window.__apTaken), ph: 'wait', i: 0, t: 0, ya: 0, yb: 0, setY: -1, el: 0 };
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
  // play: the scene's story time runs at 1x from the moment the director has entered it (after fonts)
  if (sceneIdx === ap.i && !waitingFont) ap.t += dt;
  const sc = SCENES[ap.i], T = Math.min(ap.t, sc.Tend);
  apScroll(Math.max(ap.yb, docY(ap.i, FULL(ap.i) * T / sc.Tend)));
  if (ap.t >= AP_T[ap.i]) {
    if (ap.i === LAST) { ap.over = true; ap.on = false; ap.ph = 'end'; root.classList.remove('autoplay'); return; }
    ap.ph = 'glide'; ap.i++; ap.t = 0; ap.ya = scrollY;
  }
}
// inputs that mean "I will scroll myself"; scroll events are not read, so the program's own scrolling never counts
addEventListener('wheel', apStop, { passive: true, capture: true });
addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown' || k === 'Home' || k === 'End' || k === 'Escape' || k === 'Tab') apStop();
  else if ((k === ' ' || k === 'Spacebar') && !(e.target && e.target.closest && e.target.closest('button,input,select,textarea,summary,[contenteditable]'))) apStop();
}, true);
let apTouch = null;
addEventListener('touchstart', e => { const t = e.touches[0]; apTouch = t && e.touches.length === 1 ? [t.clientX, t.clientY] : null; if (e.touches.length > 1) apStop(); }, { passive: true, capture: true });
addEventListener('touchmove', e => { const t = e.touches[0]; if (!apTouch || !t || Math.hypot(t.clientX - apTouch[0], t.clientY - apTouch[1]) > 6) apStop(); }, { passive: true, capture: true });
// a press on the scrollbar (classic scrollbars sit outside the client area)
addEventListener('mousedown', e => { const d = document.documentElement; if (e.clientX >= d.clientWidth || e.clientY >= d.clientHeight) apStop(); }, true);
document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('a[href^="#"],#tabs button')) apStop(); }, true);
// moving focus with the keyboard (or a screen reader) also takes over; a mouse click on the 한/EN button does not show :focus-visible
document.addEventListener('focusin', e => { const t = e.target; if (t && t.matches && t.matches(':focus-visible')) apStop(); }, true);
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

/* --------------------------------------------------------------- pointer */
const pointer = { x: 0, y: 0, active: false, down: false, s: 0, r: 0.18, downAt: 0, dx: 0, dy: 0, moveAt: -1e9 };
const pointerU = new Float32Array(4);
function stageOn() { return !STILL && sceneIdx !== GALAXY_I; }
function setPointer(e) { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = 1 - e.clientY / innerHeight * 2; }
function onUI(e) { return !!(e.target && e.target.closest && e.target.closest('a,button,input,label,summary,select,textarea,.top,.tabs,.after,footer,.lang')); }
addEventListener('pointermove', e => {
  if (!stageOn()) { pointer.active = false; return; }
  setPointer(e);
  pointer.moveAt = performance.now();
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
  // a resting mouse lets the particles settle back, so a cursor left on a face does not keep a hole in it
  const moving = performance.now() - pointer.moveAt < 700;
  const target = pointer.active ? (pointer.down ? 48 : moving ? 26 : 0) : 0;
  const rr = pointer.down ? 0.3 : 0.18;
  const k = 1 - Math.exp(-dt * 10);
  pointer.s += (target - pointer.s) * k;
  pointer.r += (rr - pointer.r) * k;
  pointerU[0] = pointer.x; pointerU[1] = pointer.y; pointerU[2] = pointer.r; pointerU[3] = pointer.s > 0.05 ? pointer.s : 0;
  if (ovBurst && (ovBurst.t += dt) > 0.5) ovBurst = null;
  const px = pointer.active && R.par ? pointer.x : 0, py = pointer.active && R.par ? pointer.y : 0;
  parallax.x += (px - parallax.x) * (1 - Math.exp(-dt * 2));
  parallax.y += (py - parallax.y) * (1 - Math.exp(-dt * 2));
}
// a tap: a local burst at the point; the springs pull everything back into the same scene
function scatterAt(px, py) {
  const w = unproject(px, py);
  explode(3.0, [0, 0, 0.5], w, 0.7);
  // the marks over the scattered particles fade with them (drawMarks)
  const c = project(w[0], w[1], w[2]), e = project(w[0] + 0.7 * cam.right[0], w[1] + 0.7 * cam.right[1], w[2] + 0.7 * cam.right[2]);
  if (c && e) { const r = Math.hypot(e[0] - c[0], e[1] - c[1]); ovBurst = { x: c[0], y: c[1], r, t: 0 }; }
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
  if (sc.key === 'name') nameFrame(realT);
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
    lastAg.set(U.Ag);
  }
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
  gl.uniform4fv(u.uP, U.P); gl.uniform4fv(u.uQ, U.Q); gl.uniform4fv(u.uS, U.S); gl.uniform4fv(u.uT, U.T); gl.uniform4fv(u.uU, U.V);
  gl.uniform4fv(u.uAg, U.Ag); gl.uniform4fv(u.uAgV, U.AgV);
  gl.uniform4fv(u.uSight, U.sight); gl.uniform4fv(u.uLive, U.live);
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
  simTime += dt; rt += dt;
}
let bgS0 = 1, bgS1 = 0;
// dt drives the particles and is capped at 1/20 s so a slow frame cannot throw them; dw is the time that really passed (up to
// 0.25 s, so a long stall such as coming back to the tab only moves the story a little), and the story, scene 1 and the auto-play
// keep to it. With both at the cap a slow phone used to play the story at about 0.85x (390 at dpr 3, 2026-10-10)
function tick(dt, dw = dt) {
  updatePointer(dt);
  autoplay(dw);
  readScrollSpeed(dt);
  warp.s += (warp.v - warp.s) * (1 - Math.exp(-dt * 8));
  warp.v *= Math.exp(-dt * 4);
  flashE *= Math.exp(-dt * 3.2);
  topA += (R.topA - topA) * (1 - Math.exp(-dt * 4));
  bgS0 += (R.bg0 - bgS0) * (1 - Math.exp(-dt * 3));
  bgS1 += (R.bg1 - bgS1) * (1 - Math.exp(-dt * 3));
  // particles still in the last scene's shape keep its brightness for a moment instead of jumping to the new shape's level
  R.bright += (R.brightGoal - R.bright) * (1 - Math.exp(-dt * 2.2));
  direct(dw);
  applyCamGoal();
  stepCamera(dt);
  const n = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < n; i++) simulate(dt / n);
  realT += dw;
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
  const decay = trailK > 0 ? Math.pow(trailK, dt * 60) : 0;
  gl.uniform1f(fadeP.u.uDecay, decay);
  quad(fadeP, dst);

  const px = dpr * dotCss();
  // the scene's own afterimage keeps its glow; the extra afterimage from fast scrolling only smears and never brightens.
  // A longer frame lets the afterimage fade further and lays down that much more light, so the picture keeps one brightness
  // at 60 or 120 Hz and through a dropped frame (otherwise every uneven frame shows as a flicker)
  const base = R.gain * (HDR ? 1 : 0.6) * Math.sqrt((1 - R.trail) / 0.75) * (1 - decay) / Math.max(1 - R.trail, 1e-3);
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
  gl.uniform1i(s.uAgEnd, PB); gl.uniform1f(s.uAgMax, AGS() * 0.6 * U.AgV[3] * AG_TAIL);
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
  gl.uniform1f(u.uWhite, R.white); gl.uniform1f(u.uJitter, R.jitter); gl.uniform1f(u.uTwk, R.twk);
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

/* 움직임 줄이기: 장면이 바뀔 때만 그 장면의 마지막 화면을 화면 밖에서 끝까지 돌려 놓고 한 번 그린 뒤 멈춘다 */
let stillKey = '';
function stillFrame() {
  const tg = scrollTarget();
  const key = [tg.i, layout, root.lang, fontsReady, innerWidth, innerHeight].join('|');
  if (key === stillKey) return;
  stillKey = key;
  manual = true;
  enter(tg.i, 0, 'show');
  storyT = manualTo = isStory(tg.i) ? SCENES[tg.i].Tend : 0;
  for (let k = 0; k < 160; k++) tick(1 / 60);
  clearTrails();
  for (let k = 0; k < 24; k++) { tick(1 / 60); draw(1 / 60); }
  drawMarks();
  syncUI(true);
}

/* ------------------------------------------------------------- the loop */
const perf = { frames: 0, sum: 0, list: [], js: 0 };
const fpsEl = document.getElementById('fps');
if (SHOW_FPS && fpsEl) fpsEl.hidden = false;
let last = 0, raf = 0, fpsShown = 0, skip = false, carry = 0;
/* 그림 해상도 낮추기. 프레임 간격의 이동 평균(약 0.3초)이 24ms 를 넘는 시간이 3초 쌓이면 해상도를 1배로 낮춘다. 장면이 바뀌거나
   탭이 돌아온 직후, 창 크기·글꼴·언어가 바뀐 직후처럼 까닭을 아는 느린 프레임은 calm 동안 세지 않는다. 낮춘 뒤 8초 동안 프레임이
   제때(평균 18ms 안) 나오면 한 번만 다시 올려 본다. 낮추거나 올릴 때 콘솔에 한 줄 남긴다. 전에는 21ms 넘는 프레임이 45개 쌓이면
   바로 낮추고 다시 올리지 않았으며, 장면을 짓느라 밀린 프레임도 셌다. 표시(#ov)는 낮추지 않는다(30_scenes.js 의 od) */
function calmFor(ms) { drop.calm = Math.max(drop.calm, performance.now() + ms); }
function dropCheck(ms, now) {
  if (DPR_FIX || now < drop.calm) return;
  drop.avg += (Math.min(ms, 100) - drop.avg) * 0.05;
  if (dprCap > 1) {
    drop.slowMs = drop.avg > 24 ? drop.slowMs + ms : Math.max(0, drop.slowMs - ms);
    if (drop.slowMs > 3000 && dpr > 1) {
      console.info(`particles: drawing at 1x, frames averaged ${drop.avg.toFixed(0)} ms for 3 s (scene ${sceneIdx + 1})`);
      dprCap = 1; drop.slowMs = drop.fastMs = 0; resize(); calmFor(1000);
    }
  } else if (drop.ups < 1 && (window.devicePixelRatio || 1) > 1) {
    drop.fastMs = drop.avg < 18 ? drop.fastMs + ms : 0;
    if (drop.fastMs > 8000) {
      console.info(`particles: back to full resolution, frames averaged ${drop.avg.toFixed(0)} ms for 8 s`);
      dprCap = 2; drop.ups++; drop.fastMs = 0; resize(); calmFor(1000);
    }
  }
}
function loop(now) {
  raf = requestAnimationFrame(loop);
  const t0 = performance.now();
  const ms = last ? now - last : 16.7;
  last = now;
  if (CAPTURE) return;
  if (STILL) { stillFrame(); return; }
  // behind the reading sections the cloud only drifts, so half the frames are enough
  if (sceneIdx === GALAXY_I && !SHOW_FPS) { skip = !skip; if (skip) { carry += ms; return; } }
  const fms = ms + carry; carry = 0;
  perf.frames++; perf.sum += ms; if (perf.list.length < 20000) perf.list.push(ms);
  dropCheck(ms, now);
  const dt = Math.min(fms / 1000, 1 / 20);
  tick(dt, Math.min(fms / 1000, 0.25));
  draw(dt);
  drawMarks();
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
  else if (!raf) { last = 0; calmFor(1000); raf = requestAnimationFrame(loop); }
});
let resizeTimer = 0;
addEventListener('resize', () => { ap.setY = -1; calmFor(1000); clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); GEO = null; measureCap(); }, 120); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
canvas.addEventListener('webglcontextrestored', () => location.reload());

/* ------------------------------------------------------------- fonts */
function fontsDone() {
  if (fontsReady) return;
  fontsReady = true;
  calmFor(1000);
  rebuildShapes();
  measureCap();
  if (waitingFont) { waitingFont = false; rt = 0; useShape(SCENES[sceneIdx].key); }
  warmZ();
  warmAll(CAPTURE ? 0 : 300);
}
function loadFonts() {
  const text = 'Kunsang Lee z';
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
/* 언어를 바꾸면 장면 설명 칸의 크기가 바뀌어 그림 자리도 달라진다. 입자를 한 번 흩은 뒤 새 모양으로 다시 모은다 */
addEventListener('fx:lang', () => {
  calmFor(1000);
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
  state: () => ({ scene: sceneIdx, key: SCENES[sceneIdx].key, t: +storyT.toFixed(3), rt: +rt.toFixed(2), real: +realT.toFixed(2), manual, fonts: fontsReady, layout, lang: root.lang,
    auto: { on: ap.on, over: ap.over, ph: ap.ph, i: ap.i, t: +ap.t.toFixed(2), el: +ap.el.toFixed(2) }, y: scrollY }),
  step(n = 1) { for (let i = 0; i < n; i++) { tick(1 / 60); draw(1 / 60); } drawMarks(); syncUI(false); return this.state(); },
  // capture: show a scene from its start and play it at its own pace, apart from the scroll
  show(i, fromPose) {
    manual = true; manualTo = 0;
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
    drawMarks();
    syncUI(false);
    return this.state();
  },
  setT(t) { manual = true; storyT = manualTo = t; return this.state(); },
  // capture: hand over to scene i the way scrolling does, then let story time run at 1x
  chain(i) { manual = true; go(i, 0); manualTo = 1e9; return this.state(); },
  runFor(sec) { const n = Math.round(sec * 60); for (let k = 0; k < n; k++) { tick(1 / 60); draw(1 / 60); } drawMarks(); syncUI(false); return this.state(); },
  // capture: where a scene object stands on screen (CSS px)
  px(name) { const sh = curShape, S = lastState; if (!sh || !S || !S.o[name] || !S.o[name].at) return null; return sp(sh, S.o[name].at[0], S.o[name].at[1]); },
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
