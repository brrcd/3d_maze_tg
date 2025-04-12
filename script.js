// 1. Инициализация сцены, камеры и рендерера
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
scene.background = new THREE.Color(0x87CEEB); // Голубой фон (небо)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraDistance = 5; // Дистанция от игрока
const cameraHeight = 2;   // Высота камеры над игроком

let cameraAngle = 0; // Угол поворота камеры вокруг игрока
const movementSpeed = 0.1;
const rotationSpeed = 0.03;

function updateCamera() {
  // Камера вращается вокруг игрока
  const camX = player.position.x + Math.sin(cameraAngle) * cameraDistance;
  const camZ = player.position.z + Math.cos(cameraAngle) * cameraDistance;

  camera.position.set(camX, player.position.y + cameraHeight, camZ);
  camera.lookAt(player.position.x, player.position.y, player.position.z);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. Освещение
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// 3. Персонаж (красный куб)
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshPhongMaterial({ color: 0xff0000 })
);
player.position.y = 0.5; // Чтобы не "тонул" в полу
scene.add(player);

// 4. Пол
const groundTexture = textureLoader.load('assets/textures/Horror_Floor_12-128x128.png');
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(10, 10); // Повторяем текстуру 10x10
groundTexture.anisotropy = 16; // Улучшаем качество при наклоне камеры
const groundMaterial = new THREE.MeshStandardMaterial({
  map: groundTexture,
  roughness: 0.8,
  metalness: 0.2
});

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  groundMaterial
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Замените текущий код создания стен на этот:
const walls = [];
const wallGeometry = new THREE.BoxGeometry(1, 2, 1);
const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });

// Создаем массив стен и добавляем их в сцену
const wallPositions = [
  { x: 3, z: 0 }, { x: -3, z: 0 }, { x: 0, z: 3 }, { x: 0, z: -3 },
  { x: 2, z: 2 }, { x: -2, z: -2 }
];

wallPositions.forEach(pos => {
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.position.set(pos.x, 1, pos.z);
  scene.add(wall);
  walls.push(wall); // Сохраняем ссылки на стены для коллизий
});

walls.forEach(pos => {
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.position.set(pos.x, 1, pos.z);
  scene.add(wall);
});

function checkCollision(position) {
  const playerSize = 0.5;
  const playerBox = new THREE.Box3(
    new THREE.Vector3().copy(position).subScalar(playerSize),
    new THREE.Vector3().copy(position).addScalar(playerSize)
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
  // Получаем направление камеры (горизонтальная плоскость)
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();

  // Вектор "вправо" перпендикулярен направлению камеры
  const right = new THREE.Vector3();
  right.crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();

  // Вектор движения
  const moveVector = new THREE.Vector3();

  if (joystickData.left.active) {
    moveVector.add(direction.multiplyScalar(joystickData.left.y * movementSpeed));
    moveVector.add(right.multiplyScalar(-joystickData.left.x * movementSpeed));
  }

  // Вращение камеры от правого джойстика
  if (joystickData.right.active) {
    cameraAngle += joystickData.right.x * rotationSpeed * 2;
  }


  // Применяем движение
  const newPosition = player.position.clone().add(moveVector);

  // Проверка коллизий и скольжение
  const { collision, slideVector } = checkCollision(newPosition);

  if (collision) {
    // Пробуем движение по отдельным осям
    const tryPosition = player.position.clone();

    // Проверка по X
    tryPosition.x = newPosition.x;
    if (!checkCollision(tryPosition).collision) {
      player.position.copy(tryPosition);
    }

    // Проверка по Z
    tryPosition.copy(player.position);
    tryPosition.z = newPosition.z;
    if (!checkCollision(tryPosition).collision) {
      player.position.copy(tryPosition);
    }

    // Скольжение вдоль стены
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

  updateCamera();
}

// 7. Адаптивность под размер окна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Глобальные переменные для джойстиков
const joystickData = {
  left: { x: 0, y: 0, active: false },
  right: { x: 0, y: 0, active: false }
};
const activeTouches = {};

// Инициализация джойстиков
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

  // Храним последнее активное касание для этого джойстика
  let activeTouchId = null;

  area.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Только левая кнопка мыши
      activeTouchId = 'mouse'; // Уникальный ID для мыши
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
    // Ищем первое свободное касание для этого джойстика
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

// 8. Главный цикл
function animate() {
  requestAnimationFrame(animate);
  handlePlayerMovement();
  updateCamera();
  renderer.render(scene, camera);
}
animate();
