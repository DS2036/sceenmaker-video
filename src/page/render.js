// Draait in headless Chromium. Rendert code-lagen met de exacte Blender-camera over het beauty-frame.
// Occlusie: per pixel afstand van de letter vs. afstand uit het dieptebeeld van Blender.
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

let renderer, scene, camera, cfg, depthUniform;
const texLoader = new THREE.TextureLoader();
const load = (url) => new Promise((ok, fail) => texLoader.load(url, ok, undefined, fail));

// Zelfde vorm als blender/build.py depth_builder: wit = near, zwart = far en lucht.
const OCCLUDE = /* glsl */ `
  uniform sampler2D uDepth; uniform vec2 uRes; uniform vec2 uNearFar; uniform float uBias;
  varying vec3 vWPos;
  bool occluded() {
    float v = texture2D(uDepth, gl_FragCoord.xy / uRes).r;
    if (v < 0.002) return false;
    float disp = 1.0 / uNearFar.y + v * (1.0 / uNearFar.x - 1.0 / uNearFar.y);
    return 1.0 / disp + uBias < distance(vWPos, cameraPosition);
  }
`;

function withOcclusion(material, enabled) {
  if (!enabled) return material;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, depthUniform);
    sh.vertexShader = "varying vec3 vWPos;\n" + sh.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = OCCLUDE + sh.fragmentShader.replace(
      "void main() {", "void main() {\n if (occluded()) discard;");
  };
  return material;
}

/** Lokale assen: x = rechts (voor wie naar de gevel kijkt), y = omhoog (wereld Z), z = normaal. */
function placeOnPlane(obj, position, normal) {
  const n = new THREE.Vector3(...normal).normalize();
  const up = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  const realUp = new THREE.Vector3().crossVectors(n, right);
  obj.matrixAutoUpdate = false;
  obj.matrix.makeBasis(right, realUp, n).setPosition(...position);
}

window.setup = async (c) => {
  cfg = c;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(c.width, c.height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, c.width / c.height, 0.05, 2000);
  camera.up.set(0, 0, 1);
  depthUniform = {
    uDepth: { value: null },
    uRes: { value: new THREE.Vector2(c.width, c.height) },
    uNearFar: { value: new THREE.Vector2(...c.nearFar) },
    uBias: { value: c.occlusionBias },
  };

  // Licht uit dezelfde zonrichting als Blender, hemel als vullicht.
  const sun = new THREE.DirectionalLight(0xfff4e5, 2.6);
  sun.position.set(...c.sunDirection).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xd6e2ef, 0x6f8f6a, 1.1));

  const fonts = {};
  for (const l of c.layers) {
    fonts[l.font] ??= await new FontLoader().loadAsync(`/three/examples/fonts/${l.font}.typeface.json`);
    // Typeface-fonts: hoofdletterhoogte ≈ 0,72 × size.
    const g = new TextGeometry(l.text, { font: fonts[l.font], size: l.height / 0.72, depth: l.depth, curveSegments: 8, bevelEnabled: l.depth > 0.01, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z + 0.002);
    const mat = withOcclusion(new THREE.MeshStandardMaterial({ color: l.color, metalness: l.metalness, roughness: l.roughness }), l.occlusion === "depth");
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    placeOnPlane(mesh, l.anchor.position, l.anchor.normal);
    // Schaduwvanger op de gevel zelf: alleen de schaduw van de letters wordt zichtbaar.
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.5, h + 1.5), withOcclusion(new THREE.ShadowMaterial({ opacity: 0.32 }), l.occlusion === "depth"));
    catcher.receiveShadow = true;
    placeOnPlane(catcher, l.anchor.position, l.anchor.normal);
    scene.add(mesh, catcher);
  }
  return true;
};

window.renderFrame = async (f, beautyUrl, depthUrl) => {
  const [beauty, depth] = await Promise.all([load(beautyUrl), load(depthUrl)]);
  beauty.colorSpace = THREE.SRGBColorSpace;
  depth.colorSpace = THREE.NoColorSpace;
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  depth.generateMipmaps = false;
  scene.background?.dispose?.();
  scene.background = beauty;
  depthUniform.uDepth.value?.dispose?.();
  depthUniform.uDepth.value = depth;

  const hfov = 2 * Math.atan(cfg.sensorWidth / 2 / f.focalLength);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect));
  camera.position.set(...f.position);
  camera.lookAt(...f.target);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
};
window.ready = true;
