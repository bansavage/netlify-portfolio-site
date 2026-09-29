uniform sampler2D tMap;
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform float uFog;
uniform vec2 uTile;

varying vec3 vWorld;
varying float vDepth;

void main() {
  // Sample in world space so the board tiles forever as the floor follows the camera.
  vec2 uv = vec2(vWorld.x / uTile.x + 0.5, vWorld.z / uTile.y);
  vec4 t = texture2D(tMap, uv);

  float mask = t.r;
  float second = t.g / max(mask, 0.002);
  float carry = t.b / max(mask, 0.002);
  vec3 col = mix(uA, uB, clamp(second, 0.0, 1.0));

  // Bright pulse fronts racing away down the traces.
  float band = fract(vWorld.z * 0.012 + uTime * 0.3);
  float pulse = smoothstep(0.0, 0.015, band) * (1.0 - smoothstep(0.015, 0.11, band));
  float glow = mask * (0.55 + 2.6 * pulse * carry);

  vec3 c = vec3(0.004, 0.008, 0.022) + col * glow;
  float fog = 1.0 - exp(-uFog * uFog * vDepth * vDepth);
  c = mix(c, vec3(0.008, 0.012, 0.04), fog);

  // 86% opaque so the mirrored city underneath shows through as a reflection.
  gl_FragColor = vec4(c, 0.86);
}
