const scene = new THREE.Scene();
const actionButton = document.getElementById('action-button');
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();
const audioListener = new THREE.AudioListener();
scene.background = new THREE.Color(0x87CEEB);

const gltfLoader = new THREE.GLTFLoader();

const keyboardState = {
  KeyW: false, // вперед
  KeyA: false, // влево
  KeyS: false, // назад
  KeyD: false  // вправо
};

const collidableObjects = [];
const interactableObjects = [];

gltfLoader.load('assets/levels/start_3.glb', (gltf) => {
  scene.add(gltf.scene);

  gltf.scene.traverse(child => {
    if (child.userData?.isCollidable) {
      child.box3 = new THREE.Box3().setFromObject(child);
      collidableObjects.push(child);
    }

    if (child.userData?.isInteractable) {
      interactableObjects.push(child);
    }
  });

  if (window.showCollisionDebug) {
    createCollisionHelpers();
  }
});

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.add(audioListener);
const cameraDistance = 5;
const cameraHeight = 3;

const sound = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();

audioLoader.load('assets/audio/music/platformer_1_underscore_modern.wav', function (buffer) {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.001);
});

const stepSounds = [];
let currentStepSound = 0;
let stepSoundInterval = null;
let lastStepTime = 0;

function loadStepSounds() {
  const stepSoundPaths = [
    'assets/audio/steps/step_wood_1.ogg',
    'assets/audio/steps/step_wood_2.ogg',
    'assets/audio/steps/step_wood_3.ogg',
    'assets/audio/steps/step_wood_4.ogg',
    'assets/audio/steps/step_wood_5.ogg',
    'assets/audio/steps/step_wood_6.ogg',
    'assets/audio/steps/step_wood_7.ogg',
    'assets/audio/steps/step_wood_8.ogg'
  ];

  stepSoundPaths.forEach((path, index) => {
    const stepSound = new THREE.Audio(audioListener);
    audioLoader.load(path, function (buffer) {
      stepSound.setBuffer(buffer);
      stepSound.setVolume(0.3); // громкость
      stepSounds[index] = stepSound;
    });
  });
}

loadStepSounds();

function playRandomStepSound() {
  if (stepSounds.length === 0) return;

  // Выбираем случайный звук шага
  const randomIndex = Math.floor(Math.random() * stepSounds.length);
  const stepSound = stepSounds[randomIndex];

  // Если звук загружен, воспроизводим
  if (stepSound && stepSound.isPlaying) {
    stepSound.stop();
  }
  if (stepSound) {
    stepSound.play();
  }
}

let cameraAngle = 0;
const movementSpeed = 0.1;
const rotationSpeed = 0.03;

// Добавляем в начало файла
const cameraTargetPosition = new THREE.Vector3();
let currentCameraDistance = cameraDistance; // Текущее расстояние камеры (для плавности)

function updateCamera() {
  if (!playerReady) return;

  // 1. Вычисляем желаемую позицию камеры без учёта препятствий
  const desiredCamX = player.position.x + Math.sin(cameraAngle) * cameraDistance;
  const desiredCamZ = player.position.z + Math.cos(cameraAngle) * cameraDistance;
  cameraTargetPosition.set(
    desiredCamX,
    player.position.y + cameraHeight,
    desiredCamZ
  );

  // 2. Проверяем коллизии камеры с окружением
  const raycaster = new THREE.Raycaster();
  raycaster.set(
    player.position,
    cameraTargetPosition.clone().sub(player.position).normalize()
  );

  // Фильтруем только коллизионные объекты (стены, но не двери)
  const walls = collidableObjects.filter(obj =>
    obj.userData.isCollidable && !obj.userData.isDoor
  );

  const intersects = raycaster.intersectObjects(walls, true);
  let targetDistance = cameraDistance;

  // Если есть препятствие - уменьшаем расстояние
  if (intersects.length > 0 && intersects[0].distance < cameraDistance) {
    targetDistance = Math.max(1, intersects[0].distance - 0.5); // Минимальная дистанция = 1
  }

  // 3. Плавно изменяем текущее расстояние (Lerp)
  currentCameraDistance = THREE.MathUtils.lerp(
    currentCameraDistance,
    targetDistance,
    0.1 // Коэффициент плавности (0.1 = медленно, 0.5 = быстро)
  );

  // 4. Финальная позиция камеры с плавностью и коллизиями
  const smoothCamX = player.position.x + Math.sin(cameraAngle) * currentCameraDistance;
  const smoothCamZ = player.position.z + Math.cos(cameraAngle) * currentCameraDistance;

  // Плавное перемещение камеры (Lerp)
  camera.position.lerp(
    new THREE.Vector3(smoothCamX, player.position.y + cameraHeight, smoothCamZ),
    0.2 // Коэффициент плавности движения
  );

  // Камера всегда смотрит на игрока
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z); // +1 чтобы смотреть не в ноги
}

const renderer = new THREE.WebGLRenderer({
  antialias: false, // Отключаем сглаживание
  powerPreference: "low-power" // Эмулируем слабый GPU
});
renderer.setPixelRatio(3); // Фиксируем пиксельное соотношение
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.LinearEncoding; // Отключаем гамма-коррекцию
renderer.toneMapping = THREE.NoToneMapping; // Отключаем тональное отображение

document.body.appendChild(renderer.domElement);

const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    pixelSize: { value: 3 } // Увеличиваем для более заметного эффекта
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    
    // Улучшенный алгоритм дизеринга
    float bayer2x2(vec2 coord) {
      coord = mod(coord, 2.0);
      return coord.x + coord.y * 0.5;
    }
    
    void main() {
      // Понижаем разрешение
      vec2 pixelCoord = floor(vUv * resolution / pixelSize) * pixelSize;
      vec2 uv = pixelCoord / resolution;
      
      vec4 color = texture2D(tDiffuse, uv);
      
      // Применяем дизеринг
      float threshold = bayer2x2(gl_FragCoord.xy / pixelSize);
      float ditherAmount = 0.5; // от 0 (нет дизеринга) до 1 (максимум)
      vec3 quantized = floor(color.rgb * 4.0 + threshold * ditherAmount) / 4.0;
      
      gl_FragColor = vec4(quantized, color.a);
    }
  `
};

let composer;

function initPostProcessing() {
  // 1. Создаём рендер-таргет для композитора
  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter, // Важно для пиксельного вида
      format: THREE.RGBAFormat
    }
  );

  // 2. Инициализируем композитор с этим таргетом
  composer = new THREE.EffectComposer(renderer, renderTarget);

  // 3. Создаём и добавляем RenderPass
  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 4. Создаём и настраиваем ShaderPass
  const ditherPass = new THREE.ShaderPass(DitherShader);
  ditherPass.renderToScreen = true;
  composer.addPass(ditherPass);

  // 5. Вручную устанавливаем текстуру для шейдера
  DitherShader.uniforms.tDiffuse.value = renderTarget.texture;
  DitherShader.uniforms.resolution.value.set(
    window.innerWidth,
    window.innerHeight
  );

  // 6. Принудительный первый рендер
  composer.render();
}

initPostProcessing();

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

const fbxLoader = new THREE.FBXLoader();
let mixer;
let animations = {};
let currentAction;

fbxLoader.load(
  'assets/models/Hazmat_Character.fbx',
  (fbx) => {
    player = fbx;
    player.name = 'player';
    player.scale.set(0.01, 0.01, 0.01);
    player.position.y = 0;
    player.rotation.y = Math.PI;

    player.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(player);
    playerReady = true;
    mixer = new THREE.AnimationMixer(player);

    // 2. Проверяем доступные анимации
    loadAnimation('Running', 'assets/models/animations/Hazmat_Character_Running.fbx');
    loadAnimation('Running1', 'assets/models/animations/Hazmat_Character_Running1.fbx');
    loadAnimation('Walking', 'assets/models/animations/Hazmat_Character_Walking.fbx');
    loadAnimation('Idle', 'assets/models/animations/Hazmat_Character_Idle.fbx');

    // 3. Если есть анимации - проигрываем первую
    if (fbx.animations && fbx.animations.length > 0) {
      const action = mixer.clipAction(fbx.animations[0]);
      action.play();

      // Для циклической анимации:
      action.setLoop(THREE.LoopRepeat);
    } else {
      console.warn('No animations found in the model');
    }
  },
  (xhr) => {
    // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  (error) => {
    console.error('Error loading FBX:', error);
    createFallbackPlayer();
  }
);

// Добавляем в начало файла
const collisionHelpers = []; // Массив для хранения визуализаций

// Функция для создания визуализации коллизий
function createCollisionHelpers() {
  // Удаляем старые хелперы, если есть
  removeCollisionHelpers();

  collidableObjects.forEach(obj => {
    if (obj.box3) {
      // Создаем Box3Helper (зеленый проводной куб)
      const helper = new THREE.Box3Helper(obj.box3, 0x00ff00);
      scene.add(helper);
      collisionHelpers.push(helper);

      // Для игрока создаем красный куб (если нужно)
      if (obj.name.includes('player')) {
        const playerHelper = new THREE.Box3Helper(obj.box3, 0xff0000);
        scene.add(playerHelper);
        collisionHelpers.push(playerHelper);
      }
    }
  });
}

// Функция для удаления хелперов
function removeCollisionHelpers() {
  collisionHelpers.forEach(helper => {
    scene.remove(helper);
  });
  collisionHelpers.length = 0;
}

function loadAnimation(name, path) {
  fbxLoader.load(path, (animFbx) => {
    animations[name] = animFbx.animations[0];
    // console.log(`Анимация ${name} загружена`);
  });
}

let lastAnimation = '';
function playAnimation(name) {
  if (!animations[name] || !mixer) {
    return;
  }
  if (lastAnimation === name) return; // Не прерывать текущую анимацию

  if (currentAction) {
    currentAction.fadeOut(0.2); // Плавное затухание
  }

  currentAction = mixer.clipAction(animations[name]);
  currentAction.reset()
    .setEffectiveTimeScale(1)
    .setEffectiveWeight(1)
    .fadeIn(0.2) // Плавное появление
    .play();

  lastAnimation = name;
}

function checkCollision(position) {
  if (!playerReady) return { collision: false, slideVector: new THREE.Vector3() };

  const playerSize = new THREE.Vector3(0.8, 1.5, 0.8);
  const playerBox = new THREE.Box3(
    new THREE.Vector3().copy(position).sub(playerSize),
    new THREE.Vector3().copy(position).add(playerSize)
  );

  if (window.showCollisionDebug) {
    const playerHelper = collisionHelpers.find(h => h.box === playerBox);
    if (playerHelper) {
      playerHelper.box.copy(playerBox);
    }
  }

  let collision = false;
  let slideVector = new THREE.Vector3();

  for (const child of collidableObjects) {
    if (!child.box3) {
      continue;
    }
    if (playerBox.intersectsBox(child.box3)) {
      collision = true;
      const overlap = new THREE.Vector3();
      child.box3.getCenter(overlap).sub(position);

      // Определяем направление "выталкивания"
      if (Math.abs(overlap.x) > Math.abs(overlap.z)) {
        overlap.z = 0;
      } else {
        overlap.x = 0;
      }

      slideVector.add(overlap.normalize());
    }
  }

  return {
    collision,
    slideVector: slideVector.normalize()
  };
}

function handlePlayerMovement() {
  if (!playerReady) return;

  // Получаем направление камеры (без учета наклона по Y)
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0;
  cameraDirection.normalize();

  // Боковое направление (перпендикулярно камере)
  const cameraRight = new THREE.Vector3();
  cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

  // Вектор движения (изначально нулевой)
  const moveVector = new THREE.Vector3();

  // Управление WASD (относительно камеры)
  if (keyboardState.KeyW) moveVector.add(cameraDirection); // Вперед
  if (keyboardState.KeyS) moveVector.sub(cameraDirection); // Назад
  if (keyboardState.KeyA) moveVector.add(cameraRight);     // Влево
  if (keyboardState.KeyD) moveVector.sub(cameraRight);     // Вправо

  // Управление левым стиком (аналогично WASD)
  if (joystickData.left.active) {
    moveVector.add(cameraDirection.clone().multiplyScalar(joystickData.left.y));
    moveVector.add(cameraRight.clone().multiplyScalar(-joystickData.left.x));
  }

  // Нормализуем вектор, если это диагональ
  if (moveVector.length() > 0) {
    moveVector.normalize().multiplyScalar(movementSpeed);
  }

  // Применяем движение с учетом коллизий и скольжения
  if (moveVector.length() > 0) {
    const newPosition = player.position.clone().add(moveVector);
    const { collision, slideVector } = checkCollision(newPosition);

    if (collision) {
      // Пробуем двигаться только по X
      const tryX = player.position.clone();
      tryX.x = newPosition.x;
      if (!checkCollision(tryX).collision) {
        player.position.x = tryX.x;
      }

      // Пробуем двигаться только по Z
      const tryZ = player.position.clone();
      tryZ.z = newPosition.z;
      if (!checkCollision(tryZ).collision) {
        player.position.z = tryZ.z;
      }

      // Скольжение вдоль препятствия
      if (slideVector.length() > 0.01) {
        const slideDirection = new THREE.Vector3()
          .crossVectors(slideVector, new THREE.Vector3(0, 1, 0))
          .normalize();

        const slideMove = slideDirection.multiplyScalar(moveVector.dot(slideDirection));
        const slidePosition = player.position.clone().add(slideMove);

        if (!checkCollision(slidePosition).collision) {
          player.position.copy(slidePosition);
        }
      }
    } else {
      player.position.copy(newPosition);
    }

    // Поворот персонажа в сторону движения
    if (moveVector.length() > 0.01) {
      player.rotation.y = Math.atan2(moveVector.x, moveVector.z);
    }

    // Анимация и звуки шагов
    playAnimation('Running1');
    if (Date.now() - lastStepTime > 330) {
      lastStepTime = Date.now();
      playRandomStepSound();
    }
  } else {
    playAnimation('Idle');
    lastStepTime = 0;
  }

  // Вращение камеры правым стиком
  if (joystickData.right.active) {
    cameraAngle += joystickData.right.x * rotationSpeed * 2;
  }

  updateCamera();
}

// 7. Адаптивность под размер окна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  DitherShader.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
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
  const isHorizontalOnly = type === 'right';

  let activeTouchId = null;
  let maxDist = 0;
  let baseRect = null;

  // Инициализация размеров
  function initSizes() {
    const rect = area.getBoundingClientRect();
    maxDist = isHorizontalOnly ? rect.width / 2.5 : rect.width / 2.2;
    baseRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }

  // Инициализируем при первом запуске
  initSizes();

  // Обработчик для обновления позиции
  function updatePosition(clientX, clientY, isStart) {
    // Обновляем размеры на случай изменения layout
    initSizes();

    let x = clientX - baseRect.centerX;
    let y = clientY - baseRect.centerY;

    // Для правого джойстика - только горизонтальное движение
    if (isHorizontalOnly) {
      y = 0;
    }

    // Ограничиваем расстояние от центра
    const dist = Math.min(Math.sqrt(x * x + y * y), maxDist);
    const angle = Math.atan2(y, x);

    const nx = dist * Math.cos(angle);
    const ny = dist * Math.sin(angle);

    // Обновляем данные управления
    joystickData[type].x = nx / maxDist;
    joystickData[type].y = isHorizontalOnly ? 0 : -ny / maxDist;
    joystickData[type].active = true;

    // Плавное появление при первом касании
    if (isStart) {
      thumb.style.transition = 'none';
    }

    // Применяем трансформацию
    thumb.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  // Сброс позиции
  function resetPosition() {
    joystickData[type] = { x: 0, y: 0, active: false };
    thumb.style.transition = 'transform 0.2s ease-out';
    thumb.style.transform = 'translate(-50%, -50%)';
  }

  // Обработчики событий
  function handleStart(clientX, clientY, id) {
    activeTouchId = id;
    updatePosition(clientX, clientY, true);
  }

  function handleMove(clientX, clientY) {
    if (activeTouchId !== null) {
      updatePosition(clientX, clientY, false);
    }
  }

  function handleEnd() {
    resetPosition();
    activeTouchId = null;
  }

  // Мышиные события
  area.addEventListener('mousedown', (e) => {
    if (e.button === 0 && activeTouchId === null) {
      handleStart(e.clientX, e.clientY, 'mouse');
    }
  });

  document.addEventListener('mousemove', (e) => {
    handleMove(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && activeTouchId === 'mouse') {
      handleEnd();
    }
  });

  // Сенсорные события
  area.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (activeTouchId === null && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      handleStart(touch.clientX, touch.clientY, touch.identifier);
    }
  });

  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (activeTouchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (touch) {
        handleMove(touch.clientX, touch.clientY);
      }
    }
  });

  document.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (activeTouchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (touch) {
        handleEnd();
      }
    }
  });

  // Реинициализация при изменении размера окна
  window.addEventListener('resize', initSizes);
}

initJoysticks();

function checkInteractableProximity() {
  if (!playerReady) return false;

  let closestDistance = Infinity;
  let closestObject = null;

  interactableObjects.forEach(obj => {
    const distance = player.position.distanceTo(obj.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestObject = obj;
    }
  });

  const isClose = closestDistance < 2.5;

  if (isClose) {
    actionButton.style.background = 'rgba(255, 255, 255, 0.8)';
    actionButton.style.transform = 'scale(1.05)';
  } else {
    actionButton.style.background = 'rgba(255, 255, 255, 0.3)';
    actionButton.style.transform = 'scale(1)';
  }

  return isClose;
}

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

const targetFPS = 120;
const frameTime = 1000 / targetFPS;
let lastFrameTime = 0;

function animate(currentTime) {
  requestAnimationFrame(animate);

  if (!lastFrameTime) lastFrameTime = currentTime;

  const deltaTime = currentTime - lastFrameTime;
  if (deltaTime < frameTime) return;

  lastFrameTime = currentTime;

  const delta = clock.getDelta();

  if (mixer) mixer.update(delta);
  if (playerReady) {
    handlePlayerMovement();
    updateCamera();
    checkInteractableProximity();
  }

  composer.render();
}

requestAnimationFrame(animate);

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
    stepSounds.forEach(sound => {
      if (sound && sound.isPlaying) sound.stop();
    });
  }
});

if (window.Telegram && Telegram.WebApp) {
  Telegram.WebApp.onEvent('close', () => {
    if (sound && sound.isPlaying) {
      sound.stop();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    window.showCollisionDebug = !window.showCollisionDebug;
    if (window.showCollisionDebug) {
      createCollisionHelpers();
    } else {
      removeCollisionHelpers();
    }
    console.log('Collision debug:', window.showCollisionDebug ? 'ON' : 'OFF');
  }
});

// Обработка нажатий (по скан-кодам)
document.addEventListener('keydown', (e) => {
  if (e.code in keyboardState) {
    keyboardState[e.code] = true;
    e.preventDefault();
  }
});

// Обработка отпусканий (по скан-кодам)
document.addEventListener('keyup', (e) => {
  if (e.code in keyboardState) {
    keyboardState[e.code] = false;
    e.preventDefault();
  }
});