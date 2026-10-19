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
  normalize,
} from "three/tsl";

const grid = document.querySelector(".foto-grid--glass");

if (!grid) {
  console.warn("Liquid Glass: galeria nie została znaleziona.");
} else if (!navigator.gpu) {
  console.warn("WebGPU niedostępne. Pozostawiam zwykłą galerię.");
} else {
  startGallery(grid).catch((error) => {
    console.error("Liquid Glass error:", error);
  });
}

async function startGallery(grid) {
  const images = [...grid.querySelectorAll(".foto-item img")];

  if (images.length === 0) {
    throw new Error("Nie znaleziono zdjęć w galerii.");
  }

  const imagePaths = images.map((img) => img.getAttribute("src"));

  grid.style.position = "relative";
  grid.style.overflow = "hidden";

  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  renderer.setClearColor(0x000000, 0);

  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.zIndex = "1";

  await renderer.init();

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  camera.position.z = 17;

  const total = imagePaths.length;
  const columns = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(total * 1.5))));
  const rows = Math.ceil(total / columns);

  const cardW = 2.55;
  const cardH = 1.78;
  const gapX = 0.28;
  const gapY = 0.3;

  const stepX = cardW + gapX;
  const stepY = cardH + gapY;
  const sphereRadius = 8.8;

  const cornerRadius = 0.14;
  const bevelWidth = 0.12;
  const bevelPower = 2.0;
  const glassThickness = 0.12;

  const refractionStrength = 0.022;
  const colorDispersion = 0.0005;

  const loader = new THREE.TextureLoader();
  const meshes = [];

  let dragX = 0;
  let dragY = 0;
  let velocityX = 0;
  let velocityY = 0;

  let pointerDown = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;

  function makeGlassMaterial(map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;

    const material = new THREE.MeshBasicNodeMaterial();

    material.side = THREE.DoubleSide;
    material.transparent = true;
    material.depthWrite = true;

    const aspect = cardW / cardH;

    const roundedBoxDistance = Fn(([st]) => {
      const point = vec2(st.x.sub(0.5).mul(aspect), st.y.sub(0.5));

      const radius = Math.min(cornerRadius, 0.499);

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
      const distance = roundedBoxDistance(uv());

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

      const image = vec3(
        texture(map, uvR).r,
        texture(map, uvG).g,
        texture(map, uvB).b,
      );

      const rimOuter = smoothstep(
        float(-bevelWidth),
        float(-bevelWidth * 0.55),
        distance,
      );

      const rimInner = float(1.0).sub(
        smoothstep(float(-bevelWidth * 0.55), float(-0.003), distance),
      );

      const rim = rimOuter.mul(rimInner);

      const coloredRim = image.mul(float(1.1)).add(vec3(0.008, 0.008, 0.008));

      const highlight = pow(
        max(
          float(0.0),
          float(1.0).sub(length(st.sub(vec2(0.24, 0.82))).mul(3.2)),
        ),
        float(10.0),
      );

      const withRim = image.add(coloredRim.mul(rim).mul(0.1));

      return withRim.add(vec3(1.0, 1.0, 1.0).mul(highlight.mul(0.045)));
    })();

    return material;
  }

  const loadedMeshes = await Promise.all(
    imagePaths.map(async (path, index) => {
      const map = await loader.loadAsync(path);
      const material = makeGlassMaterial(map);

      const geometry = new THREE.PlaneGeometry(cardW, cardH, 32, 32);

      const mesh = new THREE.Mesh(geometry, material);

      mesh.userData.index = index;

      scene.add(mesh);
      meshes.push(mesh);

      return mesh;
    }),
  );

  grid.appendChild(renderer.domElement);
  grid.classList.add("is-webgpu-ready");

  function wrap(value, size) {
    return ((value % size) + size) % size;
  }

  function updateCards() {
    const totalW = columns * stepX;
    const totalH = rows * stepY;

    const bounds = grid.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);

    camera.aspect = width / height;

    camera.position.z = Math.max(9.5, 17 * Math.max(1, 1.15 / camera.aspect));

    camera.updateProjectionMatrix();

    for (const mesh of loadedMeshes) {
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
      if (event.shiftKey) {
        event.preventDefault();
        dragX += event.deltaY * 0.003;
      }
    },
    { passive: false },
  );

  renderer.domElement.addEventListener("contextmenu", (event) =>
    event.preventDefault(),
  );

  function resize() {
    const bounds = grid.getBoundingClientRect();

    const width = Math.max(1, Math.round(bounds.width));

    const height = Math.max(1, Math.round(bounds.height));

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(grid);

  window.addEventListener("resize", resize);

  resize();

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
}
