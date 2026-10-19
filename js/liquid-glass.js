import * as THREE from "three/webgpu";

import {
  Fn,
  uv,
  texture,
  vec2,
  vec3,
  float,
  abs,
  length,
  max,
  min,
  pow,
  clamp,
  smoothstep,
  mix,
  normalize,
} from "three/tsl";

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x11131d, 1);

renderer.domElement.style.position = "fixed";
renderer.domElement.style.inset = "0";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.touchAction = "none";

document.body.prepend(renderer.domElement);

await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11131d);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);

camera.position.z = 19;

const columns = 6;
const rows = 4;
const total = 24;

const cardW = 2.75;
const cardH = 1.95;
const gapX = 0.34;
const gapY = 0.38;

const stepX = cardW + gapX;
const stepY = cardH + gapY;

const sphereRadius = 9.2;

const meshes = [];
const materials = [];

let dragX = 0;
let dragY = 0;
let velocityX = 0;
let velocityY = 0;

let pointerDown = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;

const cornerRadius = 0.14;
const bevelWidth = 0.12;
const bevelPower = 2.0;
const glassThickness = 0.12;

const refractionStrength = 0.025;
const colorDispersion = 0.0007;

const loader = new THREE.TextureLoader();

function makeGlassMaterial(map) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = Math.min(
    8,
    renderer.capabilities?.getMaxAnisotropy?.() ?? 4,
  );

  const material = new THREE.MeshBasicNodeMaterial();

  material.side = THREE.DoubleSide;
  material.transparent = true;
  material.depthWrite = true;

  const aspect = cardW / cardH;

  const roundedBoxDistance = Fn(([st]) => {
    const point = vec2(st.x.sub(0.5).mul(aspect), st.y.sub(0.5));

    const radius = Math.min(cornerRadius, 0.5 - 0.001);

    const q = abs(point).sub(vec2(aspect * 0.5 - radius, 0.5 - radius));

    return length(max(q, vec2(0.0)))
      .add(min(max(q.x, q.y), float(0.0)))
      .sub(radius);
  });

  const glassHeight = Fn(([st]) => {
    const distance = roundedBoxDistance(st);

    const edge = clamp(
      float(1.0).add(distance.div(float(bevelWidth))),
      0.0,
      1.0,
    );

    const profile = pow(
      max(float(1.0).sub(pow(edge, float(bevelPower))), float(0.0)),
      float(1.0 / bevelPower),
    );

    return profile.mul(float(glassThickness));
  });

  material.opacityNode = Fn(() => {
    const st = uv();
    const distance = roundedBoxDistance(st);

    return float(1.0).sub(smoothstep(float(-0.002), float(0.002), distance));
  })();

  material.colorNode = Fn(() => {
    const st = uv();
    const distance = roundedBoxDistance(st);

    const eps = 0.003;

    const hL = glassHeight(st.sub(vec2(eps, 0.0)));

    const hR = glassHeight(st.add(vec2(eps, 0.0)));

    const hD = glassHeight(st.sub(vec2(0.0, eps)));

    const hU = glassHeight(st.add(vec2(0.0, eps)));

    const dx = hR.sub(hL).div(float(2.0 * eps));
    const dy = hU.sub(hD).div(float(2.0 * eps));

    const normal = normalize(vec3(dx.negate(), dy.negate(), 1.0));

    const edge = clamp(
      float(1.0).add(distance.div(float(bevelWidth))),
      0.0,
      1.0,
    );

    const bevel = pow(
      max(float(1.0).sub(pow(edge, float(bevelPower))), float(0.0)),
      float(1.0 / bevelPower),
    );

    const bend = normal.xy.mul(bevel).mul(float(refractionStrength));

    const uvR = clamp(
      st.add(bend).add(vec2(colorDispersion, 0.0)),
      vec2(0.001, 0.001),
      vec2(0.999, 0.999),
    );

    const uvG = clamp(st.add(bend), vec2(0.001, 0.001), vec2(0.999, 0.999));

    const uvB = clamp(
      st.add(bend).sub(vec2(colorDispersion, 0.0)),
      vec2(0.001, 0.001),
      vec2(0.999, 0.999),
    );

    const red = texture(map, uvR).r;
    const green = texture(map, uvG).g;
    const blue = texture(map, uvB).b;

    const image = vec3(red, green, blue);

    const rimOuter = smoothstep(
      float(-bevelWidth * 1.15),
      float(-bevelWidth * 0.25),
      distance,
    );

    const rimInner = float(1.0).sub(
      smoothstep(float(-bevelWidth * 0.25), float(0.015), distance),
    );

    const rim = rimOuter.mul(rimInner);

    const edgeUV = clamp(
      st.add(
        normalize(vec3(distance, distance, float(0.001))).xy.mul(float(0.012)),
      ),
      vec2(0.001, 0.001),
      vec2(0.999, 0.999),
    );

    const edgeColor = texture(map, edgeUV).rgb;

    const coloredRim = mix(edgeColor, vec3(1.0, 1.0, 1.0), float(0.12));

    const highlight = pow(
      max(
        float(0.0),
        float(1.0).sub(length(st.sub(vec2(0.24, 0.82))).mul(3.2)),
      ),
      float(10.0),
    );

    const withRim = image.add(coloredRim.mul(rim).mul(0.1));

    const withHighlight = withRim.add(
      vec3(1.0, 1.0, 1.0).mul(highlight.mul(0.05)),
    );

    return withHighlight;
  })();

  return material;
}

for (let i = 0; i < total; i++) {
  const imageNumber = i + 1;
  const imagePath = `images/gdansk/${imageNumber}.jpg`;

  try {
    const map = await loader.loadAsync(imagePath);
    const material = makeGlassMaterial(map);

    const geometry = new THREE.PlaneGeometry(cardW, cardH, 32, 32);

    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData.index = i;
    mesh.userData.material = material;

    scene.add(mesh);
    meshes.push(mesh);
    materials.push(material);
  } catch (error) {
    console.error(`Nie udało się załadować: ${imagePath}`, error);
  }
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function updateCards() {
  const totalW = columns * stepX;
  const totalH = rows * stepY;

  for (const mesh of meshes) {
    const index = mesh.userData.index;
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = wrap(col * stepX + dragX + totalW / 2, totalW) - totalW / 2;

    const y = wrap(row * stepY + dragY + totalH / 2, totalH) - totalH / 2;

    const angleX = x / sphereRadius;
    const angleY = y / sphereRadius;

    const px = sphereRadius * Math.sin(angleX) * Math.cos(angleY);

    const py = sphereRadius * Math.sin(angleY);

    const pz = sphereRadius * (Math.cos(angleX) * Math.cos(angleY) - 1);

    mesh.position.set(px, py, pz);

    const normal = new THREE.Vector3(
      Math.sin(angleX) * Math.cos(angleY),
      Math.sin(angleY),
      Math.cos(angleX) * Math.cos(angleY),
    ).normalize();

    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    const distance = mesh.position.length();

    const scale = THREE.MathUtils.clamp(1 - distance * 0.012, 0.65, 1);

    mesh.scale.setScalar(scale);
  }
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  lastX = event.clientX;
  lastY = event.clientY;
  lastTime = performance.now();

  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;

  const now = performance.now();
  const dt = Math.max((now - lastTime) / 16.67, 0.5);

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;

  dragX += dx * 0.012;
  dragY -= dy * 0.012;

  velocityX = (dx * 0.012) / dt;
  velocityY = (-dy * 0.012) / dt;

  lastX = event.clientX;
  lastY = event.clientY;
  lastTime = now;
});

function stopDrag() {
  pointerDown = false;
}

renderer.domElement.addEventListener("pointerup", stopDrag);
renderer.domElement.addEventListener("pointercancel", stopDrag);
renderer.domElement.addEventListener("lostpointercapture", stopDrag);

renderer.domElement.addEventListener(
  "wheel",
  (event) => {
    dragX += event.deltaY * 0.003;
  },
  { passive: true },
);

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (!pointerDown) {
    dragX += velocityX;
    dragY += velocityY;

    velocityX *= 0.94;
    velocityY *= 0.94;
  }

  updateCards();
  renderer.render(scene, camera);
});
