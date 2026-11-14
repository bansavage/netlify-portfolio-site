/* Bansavage bundle. One export: Bansavage.mountForm(canvas, options) draws the live chrome form. It has no React components. */
(function () {
  'use strict';

  /* Each arm: direction x, y, z; neck start; rest length; neck radius; bulb radius; reach; cycle seconds; cycle offset. */
  var LOBES = [
    [0.15, 0.95, 0.27, 0.05, 0.53, 0.11, 0.21, 0.18, 11, 0],
    [0.92, 0.05, 0.39, 0.05, 0.51, 0.115, 0.215, 0.17, 13.5, 0.35],
    [-0.8, 0.25, 0.55, 0.05, 0.54, 0.105, 0.2, 0.19, 9.5, 0.62],
    [-0.15, -0.35, -0.92, 0.05, 0.52, 0.11, 0.21, 0.18, 16, 0.15],
    [0.35, -0.9, 0.26, 0.05, 0.5, 0.1, 0.195, 0.17, 12.2, 0.8]
  ];
  var AXES = [0.8164966, 0.5773503, 0, -0.4082483, 0.5773503, 0.7071068, -0.4082483, 0.5773503, -0.7071068];
  var VERT = 'attribute vec2 aPos;\nvoid main() {\n  gl_Position = vec4(aPos, 0.0, 1.0);\n}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes;',
    'uniform mat3 uRot;',
    'uniform vec4 uA[12];',
    'uniform vec4 uB[12];',
    'uniform float uN;',
    'uniform float uCore;',
    'uniform float uK;',
    'uniform float uWarp;',
    'uniform vec3 uPh;',
    'uniform float uTime;',
    'uniform float uSheen;',
    'const float FOCAL = 3.1;',
    'const float RB = 1.05;',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float drop(float t, float d, vec4 q) {',
    '  float k = t * q.w - d * q.z;',
    '  if (k < 0.0) return length(vec2(d, t)) - q.y;',
    '  if (k > q.w * q.x) return length(vec2(d, t - q.x)) - (q.y - q.z * q.x);',
    '  return d * q.w + t * q.z - q.y;',
    '}',
    'float map(vec3 pw) {',
    '  vec3 p = uRot * pw;',
    '  p += uWarp * sin(p.yzx * 2.4 + uPh) + 0.4 * uWarp * sin(p.zxy * 5.1 + uPh.zxy);',
    '  float d = length(p) - uCore;',
    '  for (int i = 0; i < 12; i++) {',
    '    if (float(i) >= uN) break;',
    '    vec4 a = uA[i];',
    '    float t = dot(p, a.xyz);',
    '    d = smin(d, drop(t - a.w, length(p - a.xyz * t), uB[i]), uK);',
    '  }',
    '  return d * 0.8;',
    '}',
    'vec3 envMap(vec3 d) {',
    '  float y = d.y;',
    '  float az = atan(d.z, d.x + 0.00001) + uTime * 0.04;',
    '  vec3 sky = mix(vec3(0.97, 0.98, 1.0), vec3(0.24, 0.29, 0.40), smoothstep(0.0, 0.9, y));',
    '  vec3 gnd = mix(vec3(0.03, 0.035, 0.05), vec3(0.90, 0.90, 0.92), smoothstep(0.0, 0.75, -y));',
    '  vec3 col = mix(gnd, sky, smoothstep(-0.015, 0.015, y));',
    '  float strip = smoothstep(0.86, 0.97, 0.5 + 0.5 * sin(az * 2.0 + 0.7));',
    '  col = mix(col, vec3(1.0), 0.85 * strip * smoothstep(0.04, 0.22, y) * (1.0 - smoothstep(0.55, 0.8, y)));',
    '  float flag = smoothstep(0.80, 0.95, 0.5 + 0.5 * sin(az * 3.0 - 1.1));',
    '  col = mix(col, vec3(0.05, 0.06, 0.09), 0.6 * flag * (1.0 - smoothstep(0.35, 0.7, abs(y))));',
    '  col = mix(col, vec3(1.0), smoothstep(0.84, 0.93, y));',
    '  return col;',
    '}',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);',
    '  vec3 ro = vec3(0.0, 0.7, 3.4);',
    '  vec3 fw = normalize(-ro);',
    '  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));',
    '  vec3 up = cross(rt, fw);',
    '  vec3 rd = normalize(uv.x * rt + uv.y * up + FOCAL * fw);',
    '  float bq = dot(ro, rd);',
    '  float cq = dot(ro, ro) - RB * RB;',
    '  float disc = bq * bq - cq;',
    '  if (disc < 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  float sq = sqrt(disc);',
    '  float t = -bq - sq;',
    '  float tFar = -bq + sq;',
    '  float pix = 2.0 / (min(uRes.x, uRes.y) * FOCAL);',
    '  bool hit = false;',
    '  float best = 1.0;',
    '  float tBest = t;',
    '  for (int i = 0; i < 80; i++) {',
    '    float h = map(ro + rd * t);',
    '    float m = h / t;',
    '    if (m < best) { best = m; tBest = t; }',
    '    if (h < 0.0005 * t) { hit = true; break; }',
    '    t += h;',
    '    if (t > tFar) break;',
    '  }',
    '  float alpha = 1.0;',
    '  if (!hit) {',
    '    alpha = clamp(1.0 - best / pix, 0.0, 1.0);',
    '    if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '    t = tBest;',
    '  }',
    '  vec3 p = ro + rd * t;',
    '  vec2 e = vec2(0.0015, -0.0015);',
    '  vec3 n = normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));',
    '  float ndv = clamp(dot(n, -rd), 0.0, 1.0);',
    '  vec3 r = reflect(rd, n);',
    '  vec3 col = envMap(r);',
    '  col *= mix(vec3(0.84, 0.86, 0.90), vec3(1.0), pow(1.0 - ndv, 5.0));',
    '  float occ = 1.0;',
    '  float tt = 0.03;',
    '  for (int k = 0; k < 9; k++) {',
    '    float h2 = map(p + r * tt);',
    '    occ = min(occ, 14.0 * h2 / tt);',
    '    tt += clamp(h2, 0.02, 0.18);',
    '  }',
    '  occ = clamp(occ, 0.0, 1.0);',
    '  col *= mix(0.25, 1.0, occ);',
    '  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + (1.0 - ndv) * 0.8 + dot(n, vec3(0.31, 0.17, 0.23))) + uTime * 0.12);',
    '  col *= mix(vec3(1.0), 0.72 + 0.56 * hue, uSheen * (0.25 + 0.75 * (1.0 - ndv)));',
    '  col *= 1.0 - 0.42 * pow(1.0 - ndv, 3.0);',
    '  vec3 l1 = normalize(vec3(-0.5, 0.8, 0.6));',
    '  col += vec3(0.9) * pow(max(dot(r, l1), 0.0), 160.0);',
    '  col = clamp(col, 0.0, 1.0);',
    '  gl_FragColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  function num(v, d) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? d : n;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function ease(x) {
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  /* One arm's cycle: extend, hold, contract, rest. */
  function armCurve(u) {
    if (u < 0.32) { return ease(u / 0.32); }
    if (u < 0.46) { return 1; }
    if (u < 0.82) { return 1 - ease((u - 0.46) / 0.36); }
    return 0;
  }

  function initGL() {
    try {
      var c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      var gl = c.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
      if (!gl) { return null; }
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, VERT);
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, FRAG);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.log('[Bansavage] shader: ' + gl.getShaderInfoLog(fs));
        return null;
      }
      var pr = gl.createProgram();
      gl.attachShader(pr, vs);
      gl.attachShader(pr, fs);
      gl.bindAttribLocation(pr, 0, 'aPos');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
        console.log('[Bansavage] link: ' + gl.getProgramInfoLog(pr));
        return null;
      }
      gl.useProgram(pr);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      var u = {
        res: gl.getUniformLocation(pr, 'uRes'),
        rot: gl.getUniformLocation(pr, 'uRot'),
        a: gl.getUniformLocation(pr, 'uA[0]'),
        b: gl.getUniformLocation(pr, 'uB[0]'),
        n: gl.getUniformLocation(pr, 'uN'),
        core: gl.getUniformLocation(pr, 'uCore'),
        k: gl.getUniformLocation(pr, 'uK'),
        warp: gl.getUniformLocation(pr, 'uWarp'),
        ph: gl.getUniformLocation(pr, 'uPh'),
        time: gl.getUniformLocation(pr, 'uTime'),
        sheen: gl.getUniformLocation(pr, 'uSheen')
      };
      return { gl: gl, canvas: c, u: u };
    } catch (err) {
      return null;
    }
  }

  function mountForm(canvas, options) {
    var opts = options || {};
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (err) { ctx = null; }
    var glx = initGL();
    var s = {
      raf: 0, last: 0, spin: 0.7, clock: 0, arm: 0, top: null, kick: 0,
      scale: 1, acc: 0, n: 0, errs: 0, drawn: false, dead: false
    };
    var m = new Float32Array(9);
    var ua = new Float32Array(48);
    var ub = new Float32Array(48);

    function pose(t, ta, reach) {
      var count = LOBES.length;
      for (var n = 0; n < count; n++) {
        var o = LOBES[n];
        var vx = o[0] + 0.03 * Math.sin(t * 0.11 + n * 1.7);
        var vy = o[1] + 0.03 * Math.sin(t * 0.13 + n * 2.9);
        var vz = o[2] + 0.03 * Math.sin(t * 0.09 + n * 4.1);
        var vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        vx = vx / vl;
        vy = vy / vl;
        vz = vz / vl;
        var u = ta / o[8] + o[9];
        u = u - Math.floor(u);
        var e = armCurve(u);
        var r1 = o[6] * (1.06 - 0.12 * e);
        var r0 = o[5] * (1.1 - 0.22 * e);
        var d1 = Math.min(o[4] + o[7] * reach * e, 0.98 - r1);
        var d0 = o[3];
        var hh = Math.max(d1 - d0, Math.abs(r1 - r0) + 0.03);
        var bb = (r0 - r1) / hh;
        var aa = Math.sqrt(Math.max(0, 1 - bb * bb));
        ua[n * 4] = vx;
        ua[n * 4 + 1] = vy;
        ua[n * 4 + 2] = vz;
        ua[n * 4 + 3] = d0;
        ub[n * 4] = hh;
        ub[n * 4 + 1] = r0;
        ub[n * 4 + 2] = bb;
        ub[n * 4 + 3] = aa;
      }
      return count;
    }

    function matrix(angle) {
      var c = Math.cos(angle);
      var sn = Math.sin(angle);
      var cz = Math.cos(0.17);
      var sz = Math.sin(0.17);
      var cx = Math.cos(0.1);
      var sx = Math.sin(0.1);
      for (var i = 0; i < 3; i++) {
        var x = AXES[i * 3];
        var y = AXES[i * 3 + 1];
        var z = AXES[i * 3 + 2];
        var x1 = x * c + z * sn;
        var z1 = z * c - x * sn;
        var x2 = x1 * cz - y * sz;
        var y2 = x1 * sz + y * cz;
        m[i] = x2;
        m[3 + i] = y2 * cx - z1 * sx;
        m[6 + i] = y2 * sx + z1 * cx;
      }
    }

    function orb(x, y, r) {
      var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#b9c1ca');
      g.addColorStop(1, '#3f4650');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Flat drawing for browsers without WebGL. */
    function draw2d(w, h, count) {
      ctx.clearRect(0, 0, w, h);
      var cx = w * 0.5;
      var cy = h * 0.5;
      var k = Math.min(w, h) * 0.44;
      var orbs = [{ x: 0, y: 0, z: 0, r: 0.23 }];
      for (var n = 0; n < count; n++) {
        var d1 = ua[n * 4 + 3] + ub[n * 4];
        var ox = ua[n * 4] * d1;
        var oy = ua[n * 4 + 1] * d1;
        var oz = ua[n * 4 + 2] * d1;
        orbs.push({
          x: ox * m[0] + oy * m[1] + oz * m[2],
          y: ox * m[3] + oy * m[4] + oz * m[5],
          z: ox * m[6] + oy * m[7] + oz * m[8],
          r: ub[n * 4 + 1] - ub[n * 4 + 2] * ub[n * 4]
        });
      }
      orbs.sort(function (p, q) { return p.z - q.z; });
      for (var i = 0; i < orbs.length; i++) {
        var o = orbs[i];
        orb(cx + o.x * k, cy - o.y * k, o.r * k);
      }
    }

    function frame(now) {
      if (!ctx || canvas.isConnected === false) { return; }
      var spin = clamp(num(opts.spin, 1), 0, 3);
      var reach = clamp(num(opts.reach, 1), 0, 1.3);
      var pace = clamp(num(opts.pace, 1), 0.2, 2);
      var sheen = clamp(num(opts.sheen, 0.5), 0, 1);
      var reduce = false;
      try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { reduce = false; }
      var dt = s.last ? Math.min((now - s.last) / 1000, 0.1) : 0;
      s.last = now;
      var cssW = canvas.clientWidth;
      var cssH = canvas.clientHeight;
      if (!cssW || !cssH) { return; }
      var rect = canvas.getBoundingClientRect();
      if (s.top === null) { s.top = rect.top; }
      var dy = opts.scroll === false ? 0 : clamp(s.top - rect.top, -400, 400);
      s.top = rect.top;
      s.kick = clamp((s.kick + dy * 0.004) * Math.exp(-dt * 2.2), -2.2, 2.2);
      var vh = window.innerHeight || 0;
      if (vh > 0 && (rect.bottom < -80 || rect.top > vh + 80)) { return; }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = clamp(Math.round(cssW * dpr * s.scale), 64, 1000);
      var h = clamp(Math.round(cssH * dpr * s.scale), 64, 1000);
      var resized = false;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        resized = true;
      }
      if (reduce) {
        if (s.drawn && !resized) { return; }
        dt = 0;
      } else if (dt > 0) {
        s.acc += dt;
        s.n += 1;
        if (s.n >= 40) {
          if (s.acc / s.n > 0.034 && s.scale > 0.5) { s.scale = Math.max(0.5, s.scale - 0.25); }
          s.acc = 0;
          s.n = 0;
        }
      }
      s.spin += dt * (0.13 * spin + s.kick);
      s.clock += dt;
      s.arm += dt * pace;
      var t = s.clock;
      var count = pose(t, s.arm, reach);
      matrix(s.spin);
      if (glx && glx.gl.isContextLost()) { glx = null; }
      if (glx) {
        var gl = glx.gl;
        var gc = glx.canvas;
        var u = glx.u;
        if (gc.width !== w || gc.height !== h) {
          gc.width = w;
          gc.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
        gl.uniformMatrix3fv(u.rot, false, m);
        gl.uniform4fv(u.a, ua);
        gl.uniform4fv(u.b, ub);
        gl.uniform1f(u.n, count);
        gl.uniform1f(u.core, 0.18);
        gl.uniform1f(u.k, 0.1);
        gl.uniform1f(u.warp, 0.02);
        gl.uniform3f(u.ph, (t * 0.17) % 6.2831853, (t * 0.14) % 6.2831853, (t * 0.12) % 6.2831853);
        gl.uniform1f(u.time, t % 628.3185);
        gl.uniform1f(u.sheen, sheen);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(gc, 0, 0);
      } else {
        draw2d(w, h, count);
      }
      s.drawn = true;
    }

    function tick(now) {
      if (s.dead) { return; }
      s.raf = requestAnimationFrame(tick);
      try {
        frame(now);
      } catch (err) {
        glx = null;
        s.errs += 1;
        if (s.errs > 3) {
          cancelAnimationFrame(s.raf);
          s.raf = 0;
        }
      }
    }

    s.raf = requestAnimationFrame(tick);

    return {
      set: function (next) {
        if (!next) { return; }
        for (var key in next) {
          if (Object.prototype.hasOwnProperty.call(next, key)) { opts[key] = next[key]; }
        }
      },
      destroy: function () {
        s.dead = true;
        if (s.raf) {
          cancelAnimationFrame(s.raf);
          s.raf = 0;
        }
        if (glx) {
          try {
            var ext = glx.gl.getExtension('WEBGL_lose_context');
            if (ext) { ext.loseContext(); }
          } catch (err) {
            glx = null;
          }
        }
        glx = null;
      }
    };
  }

  window.Bansavage = window.Bansavage || {};
  window.Bansavage.mountForm = mountForm;
})();
