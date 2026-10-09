/* =================================================================== the eclipse
   Umbra's opening picture: standing in the umbra of a total eclipse. Drawn by the GPU, like a photograph
   rather than a drawing: the sky's colours are the ones of a real twilight sky (taken row by row from a
   photo, centre and edges), and the light is added the way a camera sees it (in linear light, then a soft
   shoulder, film grain, a little vignette). The moon slides over the sun; the sky darkens into that
   twilight; beads of light and a diamond ring; then the corona, the prominences, a few stars.
   No dependencies: the website uses this same file (it's copied there by the build).
   makeEclipse(canvas) → { P (the scene's numbers), to(target, ms, ease), run(), stop(), destroy(), still() } or null (no WebGL2) */
function makeEclipse(canvas, opt) {
  opt = opt || {};
  let gl = null;
  try { gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
  if (!gl) return null;

  // the sky, 48 rows top to bottom: the middle of the photo, and its edges
  const MID = "012f9d0032a10135a40237a9013bae003eb10141b60145ba0148be014cc2014fc60153c90256cb045acf085dd20c61d51166d7176ada1d6fdc2574df2e79e0387fe34285e44d8be55791e86497ea719deb7fa2ec8ea8ed9cafeeacb5efbabcefcac3f0d9ccf0e8d5f1f4dceffbe3ecffebebfff1eafff3e4fef2daffeec4fee49cfed166feae3dfd822fe94442ab284a";
  const EDGE = "012c96012d99012f9e0032a10135a40137a7013aac003db00140b30143b70046bb0149bf014dc20151c40154c90357cc075cce0d60d01365d21668d51d6dd82571d92c77dc347ddf3c82e14688e2528ee35e94e56c9be77ba2e88ba8ea9cb0ecaab5ebb9bbeac5c0e7d0c4e5dacae2e1cfdee8d2d7edd2cbf5d2baf8cc9ff7bb78f2a057e98048d15646872e43492347";

  const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uSun;      // the sun's centre, in pixels from the top left
uniform float uR;       // its radius, in pixels
uniform vec2 uMoon;     // the moon's centre, from the sun's, in sun radii
uniform float uK;       // the moon's radius, in sun radii
uniform float uVis;     // how much of the sun shows (0..1)
uniform float uDark;    // 0 day .. 1 totality
uniform float uCorona;
uniform float uRing;
uniform vec2 uRingDir;
uniform float uStars;
uniform float uFade;
uniform float uDim;
uniform float uHor;     // how low the horizon's glow sits (1 = as in the photo)
uniform float uGrain;
uniform sampler2D uSky;
out vec4 o;

uint hash3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
float h3(vec3 p) { return float(hash3(uvec3(ivec3(floor(p)) + 4096))) * (1.0 / 4294967296.0); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = h3(i), n100 = h3(i + vec3(1, 0, 0)), n010 = h3(i + vec3(0, 1, 0)), n110 = h3(i + vec3(1, 1, 0));
  float n001 = h3(i + vec3(0, 0, 1)), n101 = h3(i + vec3(1, 0, 1)), n011 = h3(i + vec3(0, 1, 1)), n111 = h3(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 4.1); a *= 0.5; }
  return s;
}
float h2(vec2 p) { return float(hash3(uvec3(uvec2(ivec2(floor(p)) + 65536), 7u))) * (1.0 / 4294967296.0); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = p / uRes;
  float px = 1.0 / uR;                       // one pixel, in sun radii
  vec2 d = (p - uSun) / uR;
  float r = length(d);
  vec2 dir = d / max(r, 1e-4);
  vec2 md = d - uMoon;
  float rm = length(md);

  // ---- the sky: the photo's twilight, its glow pressed toward the horizon, centred a little toward the sun
  float y = clamp(pow(uv.y, uHor), 0.0, 1.0);
  float glowX = mix(0.5, uSun.x / uRes.x, 0.35);
  float edge = pow(clamp(abs(uv.x - glowX) * 2.0, 0.0, 1.0), 1.4);
  float tx = (y * 47.0 + 0.5) / 48.0;
  vec3 night = lin(mix(texture(uSky, vec2(tx, 0.25)).rgb, texture(uSky, vec2(tx, 0.75)).rgb, edge));
  // the gentle low-frequency unevenness of a real sky
  night *= 1.0 + 0.05 * (noise(vec3(uv * vec2(2.2, 1.4), uTime * 0.01)) - 0.5);
  // before totality: the same twilight, brighter (more light in the air), a little paler
  float lit = pow(1.0 - uDark, 1.4);
  vec3 sky = mix(night, vec3(dot(night, vec3(0.3, 0.55, 0.15))), lit * 0.2) * (1.0 + 2.4 * lit * pow(1.0 - y, 1.5));
  // in totality the sky is darkest around the sun, lightest at the horizon
  sky *= mix(1.0, 0.5 + 0.5 * smoothstep(0.0, 7.0, r), uDark * 0.85);
  sky *= 1.0 - uDim;

  // ---- what's beyond the atmosphere, hidden by the moon: the sun, the corona, prominences, stars
  float aa = 1.5 * px;
  float inMoon = 1.0 - smoothstep(uK - aa, uK + aa, rm);
  vec3 space = vec3(0.0);
  // the sun's disc, darker toward its edge
  float inSun = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  float limb = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  space += inSun * vec3(1.0, 0.94, 0.84) * 9.0 * (0.45 + 0.55 * sqrt(limb));
  // the corona: streamers along the sun's equator, plumes at its poles, fine rays everywhere
  if (uCorona > 0.001 && r < 9.0) {
    float t = uTime * 0.012;
    vec2 eqd = vec2(cos(-0.42), sin(-0.42));
    float eq = pow(abs(dot(dir, eqd)), 2.5);
    float n1 = fbm(vec3(dir * 3.1, r * 0.33 - t));
    float n2 = fbm(vec3(dir * 13.0, r * 0.85 - t * 2.0));
    float n3 = noise(vec3(dir * 42.0, r * 1.6 - t * 3.0));
    float streak = 0.22 + 2.1 * n1 * n1 * n1 + 0.32 * n2 + 0.1 * n3;
    float rr = max(r, 1.0);
    float k = 0.9 * pow(rr, -7.0) + 0.3 * pow(rr, -mix(3.1, 1.85, eq)) * streak * (0.55 + 0.9 * eq);
    k += (1.0 - eq) * pow(n3, 3.0) * 0.5 * pow(rr, -4.2);
    vec3 cc = mix(vec3(1.0, 0.96, 0.9), vec3(0.8, 0.87, 1.0), smoothstep(1.1, 3.5, r));
    space += cc * k * uCorona * 1.25 * smoothstep(9.0, 6.5, r);
    // prominences: a few rose-red tongues just past the edge
    if (r < 1.2) {
      float pr = smoothstep(0.6, 0.78, fbm(vec3(dir * 7.0, 3.0 + t * 0.4)));
      space += vec3(1.0, 0.22, 0.32) * pr * exp(-max(r - 1.0, 0.0) / 0.03) * smoothstep(0.96, 1.0, r) * 2.4 * uCorona;
    }
  }
  // stars, and a bright planet near the sun
  if (uStars > 0.001) {
    vec2 g = p / max(14.0, uR * 0.22);
    vec2 cell = floor(g);
    float s = h2(cell);
    vec2 at = vec2(h2(cell + 17.0), h2(cell + 41.0));
    float dd = length(fract(g) - at);
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + s * 1.7) + s * 40.0);
    float star = smoothstep(0.986, 1.0, s) * exp(-dd * dd * 600.0) * 7.0 * tw;
    space += vec3(0.85, 0.9, 1.0) * star * uStars * (1.0 - smoothstep(0.55, 0.85, uv.y));
    vec2 vp = uSun + vec2(-3.6, 1.9) * uR;
    space += vec3(1.0, 0.97, 0.9) * exp(-pow(length(p - vp) / max(1.2, uR * 0.035), 2.0)) * 3.0 * uStars;
  }
  vec3 col = sky * mix(1.0, 0.07, inMoon * smoothstep(0.5, 1.0, uDark)) + space * (1.0 - inMoon);
  col += inMoon * vec3(0.004, 0.006, 0.011) * uDark;     // earthshine

  // ---- light in the air and the lens: glare from what's left of the sun
  float dc = max(max(r - 1.0, -(rm - uK)), 0.0);
  float glare = 1.3 * exp(-dc / 0.08) + 0.32 * exp(-dc / 0.6) + 0.1 * exp(-dc / 3.5);
  col += vec3(1.0, 0.93, 0.8) * glare * pow(uVis, 0.6) * (1.0 - 0.75 * inMoon * inSun);
  // the diamond ring: one bead of the sun, rays, and its halo; a pink flash of the chromosphere beside it
  if (uRing > 0.001) {
    vec2 rp = d - uRingDir * 0.995;
    float rd = length(rp);
    float ang = atan(rp.y, rp.x);
    float rays = pow(max(cos(ang * 3.0 + 0.5), 0.0), 140.0) * 0.6 + pow(max(cos(ang * 2.0 - 0.3), 0.0), 220.0) * 0.4;
    float wide = (1.0 * exp(-rd / 0.22) + 0.16 * exp(-rd / 1.5)) * (1.0 - 0.85 * inMoon);
    col += vec3(1.0, 0.97, 0.92) * (7.0 * exp(-rd / 0.03) + wide + rays * exp(-rd / 0.9) * (1.0 - inMoon)) * uRing;
    float chrom = exp(-abs(rm - uK) / 0.012) * pow(max(dot(normalize(md + 1e-5), uRingDir), 0.0), 6.0);
    col += vec3(1.0, 0.28, 0.42) * chrom * 1.6 * uRing;
  }

  // ---- the photograph: a soft shoulder for the brightest light, vignette, grain, dither
  col = mix(col, 1.0 - 0.25 * exp(-(col - 0.75) / 0.25), step(0.75, col));
  col *= uFade;
  vec3 c = pow(max(col, 0.0), vec3(1.0 / 2.2));
  vec2 vq = (uv - 0.5) * vec2(1.05, 1.0);
  c *= 1.0 - 0.2 * pow(length(vq) * 1.3, 2.4);
  float gn = h2(p + vec2(floor(uTime * 24.0) * 37.0, 11.0)) - 0.5;
  c += gn * uGrain * (0.6 + 0.4 * (1.0 - c));
  c += (h2(p * 1.7 + 3.0) - 0.5) / 255.0;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const err = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(err || "shader"); }
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  } catch (e) {
    if (opt.onError) opt.onError(e);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  // the sky's colours as a 48 × 2 picture, smoothed between rows by the GPU
  const px = new Uint8Array(48 * 2 * 4);
  [MID, EDGE].forEach((hex, row) => {
    for (let i = 0; i < 48; i++) for (let c = 0; c < 3; c++) px[(row * 48 + i) * 4 + c] = parseInt(hex.substr(i * 6 + c * 2, 2), 16);
    for (let i = 0; i < 48; i++) px[(row * 48 + i) * 4 + 3] = 255;
  });
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 48, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const U = {};
  for (const n of ["uRes", "uTime", "uSun", "uR", "uMoon", "uK", "uVis", "uDark", "uCorona", "uRing", "uRingDir", "uStars", "uFade", "uDim", "uHor", "uGrain", "uSky"]) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uSky, 0);

  /* ---- the scene, in a few numbers anything can animate ----
     x, y: where the sun is (fractions of the width and height); size: its radius (fraction of the shorter side);
     c: the moon's way across, -1 (just touching, before) .. 0 (centred) .. 1 (just leaving);
     fade: 0 black .. 1; dim: darkens the sky for words on it; hor: how low the horizon glows; tilt: the moon's path */
  const P = Object.assign({ x: 0.5, y: 0.36, size: 0.075, c: -0.6, fade: 0, dim: 0, hor: 1.7, tilt: -0.32, stars: 1, grain: 0.022 }, opt.start);
  const K = 1.035; // the moon looks a little bigger than the sun: totality lasts
  const PATH = 2.05; // how far the moon is from the sun's centre at c = ±1, in sun radii (K + 1 and a little)
  // how much of a circle of radius 1 is covered by one of radius K, d apart
  const covered = (dd) => {
    if (dd >= 1 + K) return 0;
    if (dd <= K - 1) return Math.PI;
    const a = Math.acos((dd * dd + 1 - K * K) / (2 * dd)), b = Math.acos((dd * dd + K * K - 1) / (2 * dd * K));
    return a + K * K * b - 0.5 * Math.sqrt(Math.max(0, (-dd + 1 + K) * (dd + 1 - K) * (dd - 1 + K) * (dd + 1 + K)));
  };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---- animation: a handful of tweens on P, eased
  const EASE = {
    linear: (t) => t,
    inOut: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    // slow at both ends, slower into the end (the moon settling)
    settle: (t) => 1 - Math.pow(1 - t, 2.2) * (1 - 0.15 * t),
  };
  let tweens = [];
  /* the scene's own clock: it moves with the frames, never more than a frame's worth at once, so a busy
     page (Gmail loading underneath) holds the eclipse still for a moment instead of making it jump */
  let clock = 0, wall = 0;
  const tick = (now) => { if (wall) clock += Math.min(Math.max(now - wall, 0), 34); wall = now; return clock; };
  function to(target, ms, ease, then) {
    // (not running: a still picture, which simply becomes the new one)
    if (!running) { Object.assign(P, target); if (then) then(); try { draw(performance.now()); } catch (e) { /* not drawn yet */ } return api; }
    const now = clock;
    const fn = typeof ease === "function" ? ease : EASE[ease || "inOut"];
    for (const k of Object.keys(target)) tweens = tweens.filter((tw) => tw.k !== k);
    const keys = Object.keys(target);
    keys.forEach((k, i) => tweens.push({ k, from: P[k], to: target[k], t0: now, ms: Math.max(1, ms || 0), fn, then: i === keys.length - 1 ? then : null }));
    if (!raf && running) raf = requestAnimationFrame(frame);
    return api;
  }
  function step(now) {
    if (!tweens.length) return;
    const done = [];
    tweens = tweens.filter((tw) => {
      const u = Math.min(1, (now - tw.t0) / tw.ms);
      P[tw.k] = tw.from + (tw.to - tw.from) * tw.fn(u);
      if (u >= 1) { if (tw.then) done.push(tw.then); return false; }
      return true;
    });
    for (const fn of done) try { fn(); } catch (e) { /* the caller's own trouble */ }
  }

  // ---- size: fewer pixels than the screen (it's all soft light), more when the computer keeps up
  let q = opt.quality || (Math.min(window.devicePixelRatio || 1, 2) > 1.5 ? 0.6 : 0.85);
  const fit = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    const s = Math.min(window.devicePixelRatio || 1, 2) * q;
    const cw = Math.max(2, Math.round(w * s)), ch = Math.max(2, Math.round(h * s));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  };

  let raf = 0, running = false, frames = 0, slow = 0, last = 0, drawn = 0, poked = 0;
  // when nothing is moving (only the corona's slow drift and the grain), fewer frames: kinder to a battery
  const idleFps = opt.idleFps || 60;
  function draw(now) {
    fit();
    const W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);
    const R = Math.max(2, P.size * Math.min(W, H));
    const dd = Math.abs(P.c) * PATH;
    const vis = Math.max(0, 1 - covered(dd) / Math.PI);
    const dark = 1 - Math.pow(vis, 0.45);
    const edgeGap = dd - (K - 1); // how much of the sun's far edge is still out (in sun radii)
    const ring = smooth(0.004, 0.016, edgeGap) * (1 - smooth(0.028, 0.075, edgeGap));
    const ux = Math.cos(P.tilt), uy = Math.sin(P.tilt);
    const mx = ux * P.c * PATH, my = uy * P.c * PATH;
    const ml = Math.hypot(mx, my) || 1;
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, clock / 1000);
    gl.uniform2f(U.uSun, P.x * W, P.y * H);
    gl.uniform1f(U.uR, R);
    gl.uniform2f(U.uMoon, mx, my);
    gl.uniform1f(U.uK, K);
    gl.uniform1f(U.uVis, vis);
    gl.uniform1f(U.uDark, dark);
    gl.uniform1f(U.uCorona, 1 - smooth(0.0, 0.025, vis));
    gl.uniform1f(U.uRing, ring);
    gl.uniform2f(U.uRingDir, -mx / ml, -my / ml);
    gl.uniform1f(U.uStars, P.stars * (1 - smooth(0.0, 0.07, vis)));
    gl.uniform1f(U.uFade, P.fade);
    gl.uniform1f(U.uDim, P.dim);
    gl.uniform1f(U.uHor, P.hor);
    gl.uniform1f(U.uGrain, P.grain);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    raf = 0;
    if (!running) return;
    // a slow computer gets fewer pixels (checked over the first second or so, then left alone)
    if (last && frames < 90) {
      const dt = now - last;
      if (dt > 24) slow++;
      if (++frames % 30 === 0 && slow > 12 && q > 0.42) { q = Math.max(0.42, q - 0.14); slow = 0; }
      else if (frames % 30 === 0) slow = 0;
    }
    last = now;
    const moving = tweens.length > 0 || now - poked < 600;
    step(tick(now));
    if (moving || idleFps >= 60 || now - drawn >= 1000 / idleFps - 4) { draw(now); drawn = now; }
    raf = requestAnimationFrame(frame);
  }
  const api = {
    P,
    to,
    EASE,
    run() { if (running) return api; running = true; last = 0; wall = 0; raf = requestAnimationFrame(frame); return api; },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; return api; },
    // one frame, now (for a still picture when motion is reduced)
    still() { step(clock); draw(performance.now()); return api; },
    busy: () => tweens.length > 0,
    // something changed P by hand (a scroll): full speed for a moment
    poke() { poked = performance.now(); },
    destroy() {
      api.stop();
      tweens = [];
      try { gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); } catch (e) { /* already gone */ }
    },
  };
  return api;
}
