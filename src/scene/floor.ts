import * as THREE from 'three';
import fragmentShader from './shaders/floor.frag.glsl?raw';
import vertexShader from './shaders/floor.vert.glsl?raw';

export function createFloor(circuit: THREE.Texture, fogDensity: number) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      tMap: { value: circuit },
      uTime: { value: 0 },
      uA: { value: new THREE.Color(0x3df2ff) },
      uB: { value: new THREE.Color(0xc04dff) },
      uFog: { value: fogDensity },
      uTile: { value: new THREE.Vector2(160, 160) },
    },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(320, 1000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return { mesh, material };
}
