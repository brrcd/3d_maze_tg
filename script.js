const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();
const audioListener = new THREE.AudioListener();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.add(audioListener);
const cameraDistance = 5;
const cameraHeight = 2;

const sound = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();

audioLoader.load('assets/audio/music/platformer_1_underscore_modern.wav', function (buffer) {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.001);
});

let cameraAngle = 0;
const movementSpeed = 0.1;
const rotationSpeed = 0.03;

function updateCamera() {
  if (!playerReady) return; // Не обновляем камеру без игрока

  const camX = player.position.x + Math.sin(cameraAngle) * cameraDistance;
  const camZ = player.position.z + Math.cos(cameraAngle) * cameraDistance;
  camera.position.set(camX, player.position.y + cameraHeight, camZ);
  camera.lookAt(player.position.x, player.position.y, player.position.z);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

let player;
let playerReady = false;

// Фолбэк-игрок (красный куб)
function createFallbackPlayer() {
  player = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0xff0000 })
  );
  player.position.y = 0.5;
  scene.add(player);
  playerReady = true;
}

// Загрузка FBX модели
const fbxLoader = new THREE.FBXLoader();
fbxLoader.load(
  'assets/models/Hazmat_Character.fbx',
  (fbx) => {
    player = fbx;
    player.name = 'player';
    player.scale.set(0.01, 0.01, 0.01);
    player.position.y = 0.5;
    player.rotation.y = Math.PI;

    player.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(player);
    playerReady = true;
  },
  (xhr) => {
    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  (error) => {
    console.error('Error loading FBX:', error);
    createFallbackPlayer();
  }
);

const groundTexture = textureLoader.load('assets/textures/Horror_Floor_12-128x128.png');
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(10, 10);
groundTexture.anisotropy = 16;
const groundMaterial = new THREE.MeshStandardMaterial({
  map: groundTexture,
  roughness: 0.8,
  metalness: 0.2
});

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 40),
  groundMaterial
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const walls = [];
const basicMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.8,
  metalness: 0.2
});

const wallTexture = textureLoader.load('assets/textures/Horror_Brick_01-128x128.png');
const wallMaterial = new THREE.MeshStandardMaterial({
  map: wallTexture,
  roughness: 1,
  metalness: 0.2,
  side: THREE.DoubleSide
});
wallMaterial.map.repeat.set(30, 2);
wallMaterial.map.wrapS = THREE.RepeatWrapping;
wallMaterial.map.wrapT = THREE.RepeatWrapping;
const wallMaterials = [
  wallMaterial, // Правая грань (x+)
  wallMaterial,  // Левая грань (x-)
  basicMaterial,  // Верхняя грань (y+)
  basicMaterial,  // Нижняя грань (y-)
  basicMaterial, // Передняя грань (z+)
  basicMaterial  // Задняя грань (z-)
];

const wallGeometry = new THREE.BoxGeometry(1, 2, 30);

const wallPositions = [
  { x: 3, z: 0 }, { x: -3, z: 0 }
];

wallPositions.forEach(pos => {
  const wall = new THREE.Mesh(wallGeometry, wallMaterials);
  wall.position.set(pos.x, 1, pos.z);
  scene.add(wall);
  walls.push(wall);
});

function checkCollision(position) {
  if (!playerReady) return { collision: false, slideVector: new THREE.Vector3() };

  const playerSize = new THREE.Vector3(0.8, 1.5, 0.8); // Подберите под вашу модель
  const playerBox = new THREE.Box3(
    new THREE.Vector3().copy(position).sub(playerSize),
    new THREE.Vector3().copy(position).add(playerSize)
  );

  let collision = false;
  let slideVector = new THREE.Vector3();

  walls.forEach(wall => {
    const wallBox = new THREE.Box3().setFromObject(wall);
    if (playerBox.intersectsBox(wallBox)) {
      collision = true;
      const overlap = new THREE.Vector3();
      wallBox.getCenter(overlap).sub(position);

      if (Math.abs(overlap.x) > Math.abs(overlap.z)) {
        overlap.z = 0;
      } else {
        overlap.x = 0;
      }

      slideVector.add(overlap.normalize());
    }
  });

  return {
    collision,
    slideVector: slideVector.normalize()
  };
}

function handlePlayerMovement() {
  if (!playerReady) return;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();

  const moveVector = new THREE.Vector3();

  if (joystickData.left.active) {
    moveVector.add(direction.multiplyScalar(joystickData.left.y * movementSpeed));
    moveVector.add(right.multiplyScalar(-joystickData.left.x * movementSpeed));
  }

  if (joystickData.right.active) {
    cameraAngle += joystickData.right.x * rotationSpeed * 2;
  }

  const newPosition = player.position.clone().add(moveVector);

  const { collision, slideVector } = checkCollision(newPosition);

  if (collision) {
    const tryPosition = player.position.clone();

    tryPosition.x = newPosition.x;
    if (!checkCollision(tryPosition).collision) {
      player.position.copy(tryPosition);
    }

    tryPosition.copy(player.position);
    tryPosition.z = newPosition.z;
    if (!checkCollision(tryPosition).collision) {
      player.position.copy(tryPosition);
    }

    if (moveVector.length() > 0) {
      const slideDirection = new THREE.Vector3()
        .crossVectors(slideVector, new THREE.Vector3(0, 1, 0))
        .normalize();

      const slidePosition = player.position.clone()
        .add(slideDirection.multiplyScalar(moveVector.dot(slideDirection)));

      if (!checkCollision(slidePosition).collision) {
        player.position.copy(slidePosition);
      }
    }
  } else {
    player.position.copy(newPosition);
  }

  if (moveVector.length() > 0) {
    player.rotation.y = Math.atan2(
      moveVector.x,
      moveVector.z
    );
  }

  updateCamera();
}

// 7. Адаптивность под размер окна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const joystickData = {
  left: { x: 0, y: 0, active: false },
  right: { x: 0, y: 0, active: false }
};
const activeTouches = {};

function initJoysticks() {
  const leftJoystick = document.getElementById('left-joystick');
  const rightJoystick = document.getElementById('right-joystick');

  setupJoystick(leftJoystick, 'left');
  setupJoystick(rightJoystick, 'right');
}

function setupJoystick(joystickElement, type) {
  const area = joystickElement.querySelector('.joystick-area');
  const thumb = joystickElement.querySelector('.joystick-thumb');
  const rect = joystickElement.getBoundingClientRect();
  const center = { x: rect.width / 2, y: rect.height / 2 };
  const maxDist = rect.width / 3;

  let activeTouchId = null;

  area.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      activeTouchId = 'mouse';
      activeTouches.mouse = type;
      updateJoystick({
        clientX: e.clientX,
        clientY: e.clientY
      }, true);
    }
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (activeTouchId === 'mouse') {
      updateJoystick({
        clientX: e.clientX,
        clientY: e.clientY
      }, false);
    }
    e.preventDefault();
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && activeTouchId === 'mouse') {
      resetJoystick();
      delete activeTouches.mouse;
      activeTouchId = null;
    }
    e.preventDefault();
  });

  area.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (!activeTouches[touch.identifier] && !activeTouchId) {
        activeTouchId = touch.identifier;
        activeTouches[touch.identifier] = type;
        updateJoystick(touch, true);
        break;
      }
    }
    e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        updateJoystick(touch, false);
        break;
      }
    }
    e.preventDefault();
  });

  document.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        resetJoystick();
        delete activeTouches[touch.identifier];
        activeTouchId = null;
        break;
      }
    }
    e.preventDefault();
  });

  function updateJoystick(touch, isStart) {
    const x = touch.clientX - rect.left - center.x;
    const y = touch.clientY - rect.top - center.y;
    const dist = Math.min(Math.sqrt(x * x + y * y), maxDist);
    const angle = Math.atan2(y, x);

    const nx = dist * Math.cos(angle);
    const ny = dist * Math.sin(angle);

    joystickData[type].x = nx / maxDist;
    joystickData[type].y = -ny / maxDist;
    joystickData[type].active = true;

    if (isStart) {
      thumb.style.transition = 'none';
    }
    thumb.style.transform = `translate(${nx}px, ${ny}px)`;
  }

  function resetJoystick() {
    joystickData[type] = { x: 0, y: 0, active: false };
    thumb.style.transition = 'transform 0.2s ease-out';
    thumb.style.transform = 'translate(-50%, -50%)';
  }
}

initJoysticks();

const cdGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.01, 24);
const cdMaterial = new THREE.MeshPhongMaterial({
  color: 0x00ffff,
  shininess: 100,
  specular: 0x111111
});

const cd = new THREE.Mesh(cdGeometry, cdMaterial);
cd.position.set(1, 1, -10);
cd.rotation.z = Math.PI / 2;
scene.add(cd);

cd.material.emissiveIntensity = 0.5;
// cd.material.emissiveMap = cdTexture;

function checkPlayerProximity() {
  if (!playerReady) return false; // Проверка готовности

  const distance = player.position.distanceTo(cd.position);
  const isClose = distance < 2.5;

  if (isClose) {
    if (!sound.isPlaying) sound.play();
    tweenVolumeTo(0.5);
    cd.material.emissiveIntensity = 0.5;
  } else {
    tweenVolumeTo(0);
    cd.material.emissiveIntensity = 0;
  }

  return isClose;
}

const cdAnimation = {
  active: false,
  startTime: 0,
  duration: 2000,
  baseY: 1,
  height: 0.3,
  rotation: Math.PI
};

let volumeTweenInterval = null;
let currentTargetVolume = null;

function tweenVolumeTo(targetVolume, speed = 0.05) {
  if (currentTargetVolume === targetVolume) return;
  currentTargetVolume = targetVolume;

  if (volumeTweenInterval) clearInterval(volumeTweenInterval);

  volumeTweenInterval = setInterval(() => {
    const current = sound.getVolume();
    const diff = targetVolume - current;

    if (Math.abs(diff) < 0.01) {
      sound.setVolume(targetVolume);
      if (targetVolume === 0 && sound.isPlaying) {
        sound.pause();
      }
      clearInterval(volumeTweenInterval);
      volumeTweenInterval = null;
      currentTargetVolume = null;
      return;
    }

    const direction = diff > 0 ? 1 : -1;
    sound.setVolume(current + direction * speed);
  }, 100);
}

function animateCD(deltaTime) {
  if (!cdAnimation.active) {
    if (checkPlayerProximity()) {
      cdAnimation.active = true;
      cdAnimation.startTime = Date.now();
    }
    return;
  }

  const elapsed = Date.now() - cdAnimation.startTime;
  const progress = Math.min(elapsed / cdAnimation.duration, 1);

  cd.position.y = cdAnimation.baseY + (Math.sin(progress * Math.PI) * cdAnimation.height);
  cd.rotation.y = progress * cdAnimation.rotation;

  if (progress >= 1) {
    cdAnimation.active = false;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();

  if (playerReady) {
    animateCD(deltaTime);
    handlePlayerMovement();
    updateCamera();
  }

  renderer.render(scene, camera);
}

// Обработчик клика для разблокировки аудио
document.addEventListener('click', () => {
  if (sound.context.state === 'suspended') {
    sound.context.resume();
  }
}, { once: true });

animate();

window.addEventListener('pagehide', () => {
  if (sound.context && sound.context.state !== 'closed') {
    sound.context.close();
  }
});

window.addEventListener('beforeunload', () => {
  if (sound && sound.isPlaying) {
    sound.stop(); // или sound.pause();
  }
});

// И на всякий случай:
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (sound && sound.isPlaying) {
      sound.pause(); // пауза при сворачивании
    }
  }
});

if (window.Telegram && Telegram.WebApp) {
  Telegram.WebApp.onEvent('close', () => {
    if (sound && sound.isPlaying) {
      sound.stop();
    }
  });
}