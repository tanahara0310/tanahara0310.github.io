// 背景の海: 水面の高さ場を波動方程式で解き、上から覗いた浅瀬〜沖を描く

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 高さ場の 1 ステップ（r: 高さ, g: 速度）。uShift はスクロールに合わせて中身をずらす量（テクセル）
const SIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uShift;
uniform float uDamp;
in vec2 vUv;
out vec4 o;
float h(vec2 uv) {
  return (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 0.0 : texture(uState, uv).r;
}
void main() {
  vec2 uv = vUv - vec2(0.0, uShift * uTexel.y);
  if (uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.0); return; }
  vec4 s = texture(uState, uv);
  float avg = 0.25 * (h(uv - vec2(uTexel.x, 0.0)) + h(uv + vec2(uTexel.x, 0.0)) +
                      h(uv - vec2(0.0, uTexel.y)) + h(uv + vec2(0.0, uTexel.y)));
  s.g += (avg - s.r) * 2.0;
  s.g *= uDamp;
  s.r += s.g;
  vec2 e = min(vUv, 1.0 - vUv) / (uTexel * 12.0);
  s.rg *= mix(0.92, 1.0, clamp(min(e.x, e.y), 0.0, 1.0));
  o = s;
}`;

// 水滴を落とす（余弦形の盛り上がりを足す）
const DROP_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uStrength;
uniform float uAspect;
in vec2 vUv;
out vec4 o;
void main() {
  vec4 s = texture(uState, vUv);
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float x = max(0.0, 1.0 - length(d) / uRadius);
  s.r += (0.5 - 0.5 * cos(x * 3.14159265)) * uStrength;
  o = s;
}`;

const NW = 10;

const RENDER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform vec2 uView;
uniform float uPxScale;
uniform float uTime;
uniform float uScroll;
uniform float uDepth;
uniform float uPxPerM;
uniform float uLight;
uniform float uSimAmp;
uniform vec4 uWaveA[${NW}];
uniform vec2 uWaveB[${NW}];

const float PI = 3.14159265;
const float PARALLAX = 0.55;

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec2 hash22(vec2 p) { return vec2(pcg2d(uvec2(ivec2(floor(p)) + 65536))) * (1.0 / 4294967295.0); }
float hash12(vec2 p) { return hash22(p).x; }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s / 0.875;
}

// 波の和の勾配
vec2 waves(vec2 x, float t) {
  vec2 grad = vec2(0.0);
  for (int i = 0; i < ${NW}; i++) {
    vec2 d = uWaveA[i].xy;
    float k = uWaveA[i].z;
    float th = k * dot(d, x) - uWaveB[i].x * t + uWaveB[i].y;
    grad += uWaveA[i].w * k * cos(th) * d;
  }
  return grad;
}

// ボロノイの境目までの距離（F2 - F1）
float voroEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = hash22(i + g);
      vec2 o = 0.5 + 0.42 * sin(t * (0.45 + 0.5 * h.yx) + 6.2831 * h);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

// 海底の集光の模様。境目を明るい線にし、R と B は線の太さをずらして分光させる
vec3 causticPattern(vec2 p, float t, float width) {
  p += 0.34 * vec2(sin(p.y * 0.83 + t * 0.9), sin(p.x * 0.71 - t * 0.8));
  p += 0.12 * vec2(sin(p.y * 2.3 - t * 1.3), sin(p.x * 2.1 + t * 1.1));
  float e1 = voroEdge(p, t);
  float e2 = voroEdge(p * 1.63 + 4.3, t * 1.25);
  vec3 wv = width * vec3(1.12, 1.0, 0.9);
  vec3 c1 = 1.0 - smoothstep(vec3(0.0), wv, vec3(e1));
  vec3 c2 = 1.0 - smoothstep(vec3(0.0), wv * 0.85, vec3(e2));
  float vary = 0.3 + 1.0 * smoothstep(0.2, 0.85, vnoise(p * 0.28 + t * 0.05));
  return (c1 * c1 + 0.2 * c2 * c2) * vary;
}

vec3 sandAlbedo(vec2 p) {
  float n = fbm(p * 1.3);
  float n2 = vnoise(p * 7.0 + 13.0);
  vec3 a = mix(vec3(0.70, 0.66, 0.55), vec3(0.86, 0.83, 0.72), n);
  a *= (0.9 + 0.2 * n2) * (0.84 + 0.3 * vnoise(p * 0.35 + 5.0));
  float patchM = smoothstep(0.62, 0.72, vnoise(p * 0.16 + 41.0) * 0.7 + vnoise(p * 0.41 + 17.0) * 0.3);
  a = mix(a, vec3(0.16, 0.20, 0.13) * (0.7 + 0.6 * n2), patchM * 0.65);
  return a;
}

// 砂紋の法線
vec3 sandNormal(vec2 p) {
  vec2 dir = normalize(vec2(0.8, 0.6));
  float w = vnoise(p * 0.5) * 6.0 + vnoise(p * 1.7 + 3.0) * 2.5;
  float f = 2.0 * PI / 0.24;
  float c = cos(dot(p, dir) * f + w);
  vec2 g = dir * c * 0.2 * (0.4 + 0.6 * vnoise(p * 0.23 + 9.0));
  return normalize(vec3(-g, 1.0));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uPxScale;
  vec2 sp = vec2(frag.x, uView.y - frag.y);
  vec2 xs = (sp + vec2(0.0, uScroll)) / uPxPerM;
  vec2 xf0 = (sp + vec2(0.0, uScroll * PARALLAX)) / uPxPerM;
  float D = uDepth;
  float t = uTime;

  // 水面: 波＋クリックの波紋
  vec2 g = waves(xs, t);

  vec2 tx = uSimTexel;
  float hC = texture(uSim, vUv).r;
  float hL = texture(uSim, vUv - vec2(tx.x, 0.0)).r;
  float hR = texture(uSim, vUv + vec2(tx.x, 0.0)).r;
  float hU = texture(uSim, vUv + vec2(0.0, tx.y)).r;
  float hD = texture(uSim, vUv - vec2(0.0, tx.y)).r;
  float hRU = texture(uSim, vUv + tx).r;
  float hLD = texture(uSim, vUv - tx).r;
  float hRD = texture(uSim, vUv + vec2(tx.x, -tx.y)).r;
  float hLU = texture(uSim, vUv + vec2(-tx.x, tx.y)).r;
  float tm = uView.x * tx.x / uPxPerM;
  vec2 gSim = vec2(hR - hL, hD - hU) / (2.0 * tm) * uSimAmp;
  vec3 HSim = vec3(hR - 2.0 * hC + hL, hU - 2.0 * hC + hD, -(hRU - hLU - hRD + hLD) * 0.25) / (tm * tm) * uSimAmp;
  g += gSim;

  vec3 N = normalize(vec3(-g, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);

  // 屈折して海底へ
  const float ETA = 1.0 / 1.333;
  vec3 T = refract(-V, N, ETA);
  vec2 off = T.xy / max(-T.z, 0.2) * D;
  off *= 1.0 / (1.0 + length(off) * 0.8);
  vec2 xf = xf0 + off;

  // 集光: 海底の模様（深いほど大きくぼやける）× 波紋による屈折の写像のヤコビアン
  float deepK = smoothstep(2.0, 30.0, D);
  float cellM = mix(0.85, 1.6, deepK);
  vec3 pat = causticPattern(xf / cellM + vec2(0.0, 7.0), t * 0.7, mix(0.10, 0.30, deepK));
  vec3 caust = vec3(0.85) + pat * mix(0.75, 0.2, deepK);

  float simBlur = exp(-0.5 * pow(D * 0.06, 2.0));
  vec3 kr = vec3(0.246, 0.250, 0.255) * D;
  vec3 Hr = HSim * simBlur;
  vec3 detJ = (1.0 + kr * Hr.x) * (1.0 + kr * Hr.y) - kr * kr * Hr.z * Hr.z;
  caust *= min(1.0 / max(abs(detJ), vec3(0.3)), vec3(3.0));

  // 海底
  vec3 alb = sandAlbedo(xf);
  vec3 Ls = normalize(vec3(-0.30, -0.36, 1.0));
  vec3 LsW = normalize(vec3(Ls.xy * ETA, Ls.z));
  float lam = max(dot(sandNormal(xf), LsW), 0.0);

  // 水の吸収・散乱（Beer–Lambert と一次散乱）
  vec3 sigA = vec3(0.85, 0.080, 0.032);
  vec3 sigS = vec3(0.012, 0.016, 0.021);
  vec3 sigT = sigA + sigS;
  float cosS = LsW.z;
  vec3 Esun = vec3(1.0, 0.96, 0.90) * 3.8 * uLight;
  vec3 Esky = vec3(0.55, 0.76, 1.0) * 0.9 * uLight;
  vec3 Tdown = exp(-sigT * D / cosS);
  vec3 Tup = exp(-sigT * D);
  vec3 Ef = Esun * cosS * Tdown * caust * lam + Esky * Tup * 0.55;
  vec3 Lf = alb / PI * Ef * Tup;
  vec3 kk = sigT * (1.0 + 1.0 / cosS);
  vec3 Lin = sigS * (Esun + Esky) / (4.0 * PI) * (1.0 - exp(-kk * D)) / kk * 3.2;
  vec3 Lsub = Lf + Lin;

  // 水面の反射とサンキラ
  float NoV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(vec3(0.80, 0.90, 0.97), vec3(0.36, 0.58, 0.92), clamp(R.z, 0.0, 1.0)) * 1.3 * uLight;
  vec3 Hh = normalize(Ls + V);
  float nh = max(dot(N, Hh), 0.0);
  float spec = pow(nh, 5000.0) * 140.0 + pow(nh, 260.0) * 1.6;
  vec3 col = mix(Lsub, sky, F) + spec * F * vec3(1.0, 0.95, 0.86) * uLight;

  // 波紋の斜面を太陽の向きで照らす
  float rip = dot(gSim, -normalize(Ls.xy));
  col += uLight * vec3(0.72, 0.9, 1.0) * (max(rip, 0.0) * 1.8 - max(-rip, 0.0) * 0.4) * mix(0.5, 1.0, deepK);

  // 浮遊物（深いところだけ）
  float snow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 46.0 + fi * 26.0;
    vec2 q = (sp + vec2(sin(t * 0.13 + fi * 2.0) * 18.0, uScroll * (0.62 + 0.1 * fi) - t * (5.0 + fi * 3.0))) / sc;
    vec2 id = floor(q);
    vec2 r = hash22(id + fi * 17.0);
    float dd = length(fract(q) - (0.2 + 0.6 * r)) * sc;
    float size = 0.5 + 1.3 * hash12(id * 1.3 + fi * 5.0);
    snow += step(0.6, hash12(id * 1.7 + fi + 3.0)) * smoothstep(size + 1.0, size * 0.2, dd) * (0.35 + 0.65 * r.y);
  }
  col += snow * vec3(0.5, 0.72, 0.82) * smoothstep(7.0, 20.0, D) * 0.10 * uLight;

  col = aces(col * 0.9);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(luma), col, 1.35), 0.0);
  vec2 c = vUv - 0.5;
  col *= 1.0 - dot(c, c) * 0.55;
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reducedMotion?: boolean, getScroll: () => number, depth?: number, light?: number }} opts
 */
export function createOcean(canvas, opts) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  const hasHalf = hasFloat || !!gl.getExtension('EXT_color_buffer_half_float');
  const hasFloatLinear = !!gl.getExtension('OES_texture_float_linear');
  const formats = [];
  if (hasFloat && hasFloatLinear) formats.push([gl.RGBA32F, gl.FLOAT]);
  if (hasHalf) formats.push([gl.RGBA16F, gl.HALF_FLOAT]);
  if (!formats.length) return null;

  let sim, drop, render;
  try {
    sim = program(gl, SIM_FS);
    drop = program(gl, DROP_FS);
    render = program(gl, RENDER_FS);
  } catch (e) {
    console.warn('[ocean]', e);
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const rnd = mulberry32(20261001);
  const waveA = new Float32Array(NW * 4);
  const waveB = new Float32Array(NW * 2);
  for (let i = 0; i < NW; i++) {
    const lam = 0.6 + 2.6 * Math.pow(rnd(), 1.3);
    const k = (2 * Math.PI) / lam;
    const ang = 0.55 + (rnd() - 0.5) * 2.6;
    const steep = 0.035 + rnd() * 0.025;
    waveA.set([Math.cos(ang), Math.sin(ang), k, steep / k], i * 4);
    waveB.set([Math.sqrt(9.8 * k) * 0.5, rnd() * Math.PI * 2], i * 2);
  }

  let fmt = null;
  let targets = [];
  let simW = 0, simH = 0, cur = 0;
  let viewW = 0, viewH = 0, pxScale = 1, quality = 1;

  function makeTarget(w, h, [internal, type]) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (ok) {
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    return { tex, fb };
  }

  function buildSim(w, h) {
    for (const t of targets) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    targets = [];
    const candidates = fmt ? [fmt] : formats;
    for (const f of candidates) {
      const a = makeTarget(w, h, f);
      const b = a && makeTarget(w, h, f);
      if (a && b) { fmt = f; targets = [a, b]; break; }
      if (a) { gl.deleteFramebuffer(a.fb); gl.deleteTexture(a.tex); }
    }
    simW = w; simH = h; cur = 0;
    return targets.length === 2;
  }

  function pxPerM() {
    return Math.min(190, Math.max(72, viewW / 10));
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) {
      viewW = viewH = 0;
      return true;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = Math.sqrt(1.5e6 / (w * h));
    pxScale = Math.max(0.35, Math.min(dpr, budget) * quality);
    canvas.width = Math.round(w * pxScale);
    canvas.height = Math.round(h * pxScale);
    const aspectChanged = !viewH || Math.abs(w / h - viewW / viewH) > 0.15 || Math.abs(w - viewW) / viewW > 0.2;
    viewW = w; viewH = h;
    if (aspectChanged) {
      const sw = Math.round(Math.min(512, Math.max(160, w / 3.4)));
      const sh = Math.max(64, Math.round((sw * h) / w));
      if (!buildSim(sw, sh)) return false;
    }
    return true;
  }

  if (!buildSim(4, 4) || !resize()) return null;

  const drops = [];
  let lastScroll = opts.getScroll();
  let shiftAcc = 0;
  let time = 0;
  let depth = opts.depth ?? 1.2, depthTarget = depth;
  let light = opts.light ?? 1, lightTarget = light;
  let last = performance.now();
  let frameAcc = 0, frameCount = 0;
  let raf = 0;
  let alive = true;

  function quad() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function pass(prog, setup) {
    const dst = targets[1 - cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[cur].tex);
    gl.uniform1i(prog.loc.uState, 0);
    setup(prog.loc);
    quad();
    cur = 1 - cur;
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(100, now - last);
    last = now;
    if (!viewW && (!resize() || !viewW)) return;
    const dt = dtMs / 1000;
    if (!opts.reducedMotion) time += dt * 0.55;

    depth += (depthTarget - depth) * Math.min(1, dt * 3);
    light += (lightTarget - light) * Math.min(1, dt * 3);

    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, simW, simH);

    const scroll = opts.getScroll();
    shiftAcc += ((scroll - lastScroll) * simH) / viewH;
    lastScroll = scroll;
    let shift = Math.trunc(shiftAcc);
    shiftAcc -= shift;

    while (drops.length) {
      const d = drops.shift();
      pass(drop, (loc) => {
        gl.uniform2f(loc.uCenter, d.x / viewW, 1 - d.y / viewH);
        gl.uniform1f(loc.uRadius, d.r / viewH);
        gl.uniform1f(loc.uStrength, d.s);
        gl.uniform1f(loc.uAspect, viewW / viewH);
      });
    }

    const steps = Math.max(1, Math.min(4, Math.round(dtMs / 8.33)));
    for (let i = 0; i < steps; i++) {
      const s = i === 0 ? shift : 0;
      pass(sim, (loc) => {
        gl.uniform2f(loc.uTexel, 1 / simW, 1 / simH);
        gl.uniform1f(loc.uShift, s);
        gl.uniform1f(loc.uDamp, 0.995);
      });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(render.p);
    const L = render.loc;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[cur].tex);
    gl.uniform1i(L.uSim, 0);
    gl.uniform2f(L.uSimTexel, 1 / simW, 1 / simH);
    gl.uniform2f(L.uView, viewW, viewH);
    gl.uniform1f(L.uPxScale, canvas.width / viewW);
    gl.uniform1f(L.uTime, time);
    gl.uniform1f(L.uScroll, scroll);
    gl.uniform1f(L.uDepth, depth);
    gl.uniform1f(L.uPxPerM, pxPerM());
    gl.uniform1f(L.uLight, light);
    gl.uniform1f(L.uSimAmp, 0.03);
    gl.uniform4fv(L.uWaveA, waveA);
    gl.uniform2fv(L.uWaveB, waveB);
    quad();

    // 重いときは描画解像度を下げる
    if (dtMs < 100) {
      frameAcc += dtMs;
      frameCount++;
      if (frameCount >= 60) {
        const avg = frameAcc / frameCount;
        frameAcc = 0; frameCount = 0;
        if (avg > 22 && quality > 0.45) {
          quality *= 0.8;
          resize();
          if (quality <= 0.45) document.documentElement.classList.add('low-fx');
        }
      }
    }
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    cancelAnimationFrame(raf);
    document.documentElement.classList.add('no-webgl');
  });

  raf = requestAnimationFrame(frame);

  return {
    /** クリック位置（CSS px）に水滴を落とす */
    drop(x, y, radius = 26, strength = 1) {
      if (drops.length < 16) drops.push({ x, y, r: radius, s: strength });
    },
    setDepth(m) { depthTarget = m; },
    setLight(l) { lightTarget = l; },
    resize,
    get format() { return fmt && (fmt[1] === gl.FLOAT ? 'RGBA32F' : 'RGBA16F'); },
  };
}
