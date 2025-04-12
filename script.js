// 1. Инициализация сцены, камеры и рендерера
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();
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
  new THREE.PlaneGeometry(20, 40),
  groundMaterial
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Замените текущий код создания стен на этот:
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
wallMaterial.map.repeat.set(30, 2); // Измените при необходимости
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
// wallMaterial.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
const wallGeometry = new THREE.BoxGeometry(1, 2, 30);

// Создаем массив стен и добавляем их в сцену
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

const cdGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.01, 24);
const cdMaterial = new THREE.MeshPhongMaterial({
  color: 0x00ffff, // Голубой цвет
  shininess: 100,
  specular: 0x111111
});

const cd = new THREE.Mesh(cdGeometry, cdMaterial);
cd.position.set(1, 1, -10); // Позиция над полом
cd.rotation.z = Math.PI / 2;
scene.add(cd);

// 3. Проверка приближения игрока
function checkPlayerProximity() {
  const distance = player.position.distanceTo(cd.position);
  return distance < 2.0; // Активация в радиусе 2 единиц
}

// 2. Параметры анимации (обновленные для вертикального положения)
const cdAnimation = {
  active: false,
  startTime: 0,
  duration: 2000,
  baseY: 1,    // Начальная высота
  height: 0.3,   // Амплитуда движения вверх-вниз
  rotation: Math.PI // Вращение на 180 градусов
};

// 3. Обновленная функция анимации
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

  // Вертикальное движение (вдоль оси Y)
  cd.position.y = cdAnimation.baseY + (Math.sin(progress * Math.PI) * cdAnimation.height);

  // Вращение вокруг вертикальной оси (Z)
  cd.rotation.y = progress * cdAnimation.rotation;

  if (progress >= 1) {
    cdAnimation.active = false;
    // onCDAnimationComplete();
  }
}

// 8. Главный цикл
function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta(); // THREE.Clock
  animateCD(deltaTime);
  handlePlayerMovement();
  updateCamera();
  renderer.render(scene, camera);
}

animate();
