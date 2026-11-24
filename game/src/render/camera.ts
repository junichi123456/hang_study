import * as THREE from 'three';

export const FOV = 40;
export const ELEVATION_DEG = 58;
export const FIT_RADIUS = 6.4;
export const TARGET = new THREE.Vector3(0, 0, 0.3);

export function fitDistance(aspect: number): number {
  const vFov = (FOV * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const d = FIT_RADIUS / Math.sin(Math.min(vFov, hFov) / 2);
  return Math.min(60, Math.max(10, d));
}

export function updateCamera(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  const aspect = width / Math.max(1, height);
  camera.fov = FOV;
  camera.aspect = aspect;
  const d = fitDistance(aspect);
  const el = (ELEVATION_DEG * Math.PI) / 180;
  camera.position.set(TARGET.x, TARGET.y + d * Math.sin(el), TARGET.z + d * Math.cos(el));
  camera.lookAt(TARGET);
  camera.near = 0.5; camera.far = 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
