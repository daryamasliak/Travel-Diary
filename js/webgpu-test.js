import * as THREE from "three/webgpu";
import { float } from "three/tsl";

const status = document.querySelector("#status");

async function main() {
  if (!navigator.gpu) {
    status.textContent = "WebGPU niedostępne — sprawdź przeglądarkę.";
    return;
  }

  try {
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
    });

    await renderer.init();

    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10121c);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.z = 4;

    const geometry = new THREE.IcosahedronGeometry(1, 3);

    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = float(0.8);

    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    status.textContent = "WebGPU działa!";

    function animate() {
      sphere.rotation.y += 0.008;
      sphere.rotation.x += 0.004;

      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(animate);

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  } catch (error) {
    console.error(error);
    status.textContent = "Błąd WebGPU — sprawdź Console.";
  }
}

main();
