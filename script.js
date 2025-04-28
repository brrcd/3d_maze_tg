// Основные настройки и константы
const SETTINGS = {
  movementSpeed: 0.1,
  rotationSpeed: 0.03,
  cameraDistance: 5,
  cameraHeight: 3,
  interactionDistance: 2.5,
  ditherPixelSize: 3,
  stepSoundVolume: 0.3,
  doorSoundVolume: 0.5,
  musicVolume: 0.001,
  introPhrases: [
    "Добро пожаловать в лабораторию",
    "Здесь происходят странные вещи",
    "Сможете ли вы найти выход?",
  ],
  typingSpeed: 50,
  phraseDelay: 2000,
  startPhone: {
    ringingVolume: 0.8,
    startRingingDelay: 10000
  }
};

// Инициализация сцены и рендерера
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "low-power"
});
renderer.setPixelRatio(3);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.LinearEncoding;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

// Основные системы
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new THREE.GLTFLoader();
const fbxLoader = new THREE.FBXLoader();
const audioLoader = new THREE.AudioLoader();
const clock = new THREE.Clock();
const audioListener = new THREE.AudioListener();

// Камера
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.add(audioListener);

// Освещение
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Состояние игры
const gameState = {
  playerReady: false,
  levelLoaded: false,
  showCollisionDebug: false,
  gameStarted: false
};

// Управление
const keyboardState = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false
};

const joystickData = {
  left: { x: 0, y: 0, active: false },
  right: { x: 0, y: 0, active: false }
};

// Коллекции объектов
const collidableObjects = [];
const interactableObjects = [];
const doors = [];
const collisionHelpers = [];

// Аудио
const audioSystem = {
  sound: new THREE.Audio(audioListener),
  stepSounds: [],
  doorSounds: {
    open: null,
    close: null
  },
  currentStepSound: 0,
  lastStepTime: 0,
  currentTargetVolume: null,
  volumeTweenInterval: null,

  init: function () {
    this.loadMusic();
    this.loadStepSounds();
    this.loadDoorSounds();
  },

  loadMusic: function () {
    audioLoader.load('assets/audio/music/platformer_1_underscore_modern.wav', (buffer) => {
      this.sound.setBuffer(buffer);
      this.sound.setLoop(true);
      this.sound.setVolume(SETTINGS.musicVolume);
    });
  },

  loadStepSounds: function () {
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
      audioLoader.load(path, (buffer) => {
        stepSound.setBuffer(buffer);
        stepSound.setVolume(SETTINGS.stepSoundVolume);
        this.stepSounds[index] = stepSound;
      });
    });
  },

  loadDoorSounds: function () {
    audioLoader.load('assets/audio/door/door_open.mp3', (buffer) => {
      const openSound = new THREE.Audio(audioListener);
      openSound.setBuffer(buffer);
      openSound.setVolume(SETTINGS.doorSoundVolume);
      this.doorSounds.open = openSound;
    });

    audioLoader.load('assets/audio/door/door_close.mp3', (buffer) => {
      const closeSound = new THREE.Audio(audioListener);
      closeSound.setBuffer(buffer);
      closeSound.setVolume(SETTINGS.doorSoundVolume);
      this.doorSounds.close = closeSound;
    });
  },

  playRandomStepSound: function () {
    if (this.stepSounds.length === 0) return;

    const randomIndex = Math.floor(Math.random() * this.stepSounds.length);
    const stepSound = this.stepSounds[randomIndex];

    if (stepSound && stepSound.isPlaying) {
      stepSound.stop();
    }
    if (stepSound) {
      stepSound.play();
    }
  },

  tweenVolumeTo: function (targetVolume, speed = 0.05) {
    if (this.currentTargetVolume === targetVolume) return;
    this.currentTargetVolume = targetVolume;

    if (this.volumeTweenInterval) clearInterval(this.volumeTweenInterval);

    this.volumeTweenInterval = setInterval(() => {
      const current = this.sound.getVolume();
      const diff = targetVolume - current;

      if (Math.abs(diff) < 0.01) {
        this.sound.setVolume(targetVolume);
        if (targetVolume === 0 && this.sound.isPlaying) {
          this.sound.pause();
        }
        clearInterval(this.volumeTweenInterval);
        this.volumeTweenInterval = null;
        this.currentTargetVolume = null;
        return;
      }

      const direction = diff > 0 ? 1 : -1;
      this.sound.setVolume(current + direction * speed);
    }, 100);
  }
};

// Система анимации
const animationSystem = {
  mixer: null,
  animations: {},
  currentAction: null,
  lastAnimation: '',

  loadAnimation: function (name, path) {
    fbxLoader.load(path, (animFbx) => {
      this.animations[name] = animFbx.animations[0];
    });
  },

  playAnimation: function (name) {
    if (!this.animations[name] || !this.mixer) return;
    if (this.lastAnimation === name) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }

    this.currentAction = this.mixer.clipAction(this.animations[name]);
    this.currentAction.reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(0.2)
      .play();

    this.lastAnimation = name;
  }
};

// Система коллизий
const collisionSystem = {
  checkCollision: function (position) {
    if (!gameState.playerReady) return { collision: false, slideVector: new THREE.Vector3() };

    const playerSize = new THREE.Vector3(0.8, 1.5, 0.8);
    const playerBox = new THREE.Box3(
      new THREE.Vector3().copy(position).sub(playerSize),
      new THREE.Vector3().copy(position).add(playerSize)
    );

    if (gameState.showCollisionDebug) {
      const playerHelper = collisionHelpers.find(h => h.box === playerBox);
      if (playerHelper) {
        playerHelper.box.copy(playerBox);
      }
    }

    let collision = false;
    let slideVector = new THREE.Vector3();

    for (const child of collidableObjects) {
      const isClosedDoor = child.userData.isDoor && child.userData.isClosed;

      if ((child.userData.isCollidable && !child.userData.isDoor) || isClosedDoor) {
        if (!child.box3) {
          child.box3 = new THREE.Box3().setFromObject(child);
        }

        if (playerBox.intersectsBox(child.box3)) {
          collision = true;
          const overlap = new THREE.Vector3();
          child.box3.getCenter(overlap).sub(position);

          if (Math.abs(overlap.x) > Math.abs(overlap.z)) {
            overlap.z = 0;
          } else {
            overlap.x = 0;
          }

          slideVector.add(overlap.normalize());
        }
      }
    }

    return {
      collision,
      slideVector: slideVector.normalize()
    };
  },

  createCollisionHelpers: function () {
    this.removeCollisionHelpers();

    collidableObjects.forEach(obj => {
      if (obj.box3) {
        const helper = new THREE.Box3Helper(obj.box3, 0x00ff00);
        scene.add(helper);
        collisionHelpers.push(helper);

        if (obj.name.includes('player')) {
          const playerHelper = new THREE.Box3Helper(obj.box3, 0xff0000);
          scene.add(playerHelper);
          collisionHelpers.push(playerHelper);
        }
      }
    });
  },

  removeCollisionHelpers: function () {
    collisionHelpers.forEach(helper => {
      scene.remove(helper);
    });
    collisionHelpers.length = 0;
  }
};

// Система управления игроком
const playerSystem = {
  player: null,
  cameraAngle: 0,
  cameraTargetPosition: new THREE.Vector3(),
  currentCameraDistance: SETTINGS.cameraDistance,
  currentInteractable: null,

  createFallbackPlayer: function () {
    this.player = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({ color: 0xff0000 })
    );
    this.player.position.y = 0.5;
    scene.add(this.player);
    gameState.playerReady = true;
  },

  loadPlayerModel: function () {
    fbxLoader.load(
      'assets/models/Hazmat_Character.fbx',
      (fbx) => {
        this.player = fbx;
        this.player.name = 'player';
        this.player.scale.set(0.01, 0.01, 0.01);
        this.player.position.y = 0;
        this.player.rotation.y = Math.PI;

        this.player.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(this.player);
        gameState.playerReady = true;
        animationSystem.mixer = new THREE.AnimationMixer(this.player);

        animationSystem.loadAnimation('Running', 'assets/models/animations/Hazmat_Character_Running.fbx');
        animationSystem.loadAnimation('Running1', 'assets/models/animations/Hazmat_Character_Running1.fbx');
        animationSystem.loadAnimation('Walking', 'assets/models/animations/Hazmat_Character_Walking.fbx');
        animationSystem.loadAnimation('Idle', 'assets/models/animations/Hazmat_Character_Idle.fbx');

        if (fbx.animations && fbx.animations.length > 0) {
          const action = animationSystem.mixer.clipAction(fbx.animations[0]);
          action.play();
          action.setLoop(THREE.LoopRepeat);
        }
      },
      undefined,
      (error) => {
        console.error('Error loading FBX:', error);
        this.createFallbackPlayer();
      }
    );
  },

  updateCamera: function () {
    if (!gameState.playerReady) return;

    const desiredCamX = this.player.position.x + Math.sin(this.cameraAngle) * SETTINGS.cameraDistance;
    const desiredCamZ = this.player.position.z + Math.cos(this.cameraAngle) * SETTINGS.cameraDistance;
    this.cameraTargetPosition.set(
      desiredCamX,
      this.player.position.y + SETTINGS.cameraHeight,
      desiredCamZ
    );

    const raycaster = new THREE.Raycaster();
    raycaster.set(
      this.player.position,
      this.cameraTargetPosition.clone().sub(this.player.position).normalize()
    );

    const walls = collidableObjects.filter(obj =>
      obj.userData.isCollidable && !obj.userData.isDoor
    );

    const intersects = raycaster.intersectObjects(walls, true);
    let targetDistance = SETTINGS.cameraDistance;

    if (intersects.length > 0 && intersects[0].distance < SETTINGS.cameraDistance) {
      targetDistance = Math.max(1, intersects[0].distance - 0.5);
    }

    this.currentCameraDistance = THREE.MathUtils.lerp(
      this.currentCameraDistance,
      targetDistance,
      0.1
    );

    const smoothCamX = this.player.position.x + Math.sin(this.cameraAngle) * this.currentCameraDistance;
    const smoothCamZ = this.player.position.z + Math.cos(this.cameraAngle) * this.currentCameraDistance;

    camera.position.lerp(
      new THREE.Vector3(smoothCamX, this.player.position.y + SETTINGS.cameraHeight, smoothCamZ),
      0.2
    );

    camera.lookAt(this.player.position.x, this.player.position.y + 1, this.player.position.z);
  },

  handleMovement: function () {
    if (!gameState.playerReady || !gameState.gameStarted) return;

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

    const moveVector = new THREE.Vector3();

    if (keyboardState.KeyW) moveVector.add(cameraDirection);
    if (keyboardState.KeyS) moveVector.sub(cameraDirection);
    if (keyboardState.KeyA) moveVector.add(cameraRight);
    if (keyboardState.KeyD) moveVector.sub(cameraRight);

    if (joystickData.left.active) {
      moveVector.add(cameraDirection.clone().multiplyScalar(joystickData.left.y));
      moveVector.add(cameraRight.clone().multiplyScalar(-joystickData.left.x));
    }

    if (moveVector.length() > 0) {
      moveVector.normalize().multiplyScalar(SETTINGS.movementSpeed);
    }

    if (moveVector.length() > 0) {
      const newPosition = this.player.position.clone().add(moveVector);
      const { collision, slideVector } = collisionSystem.checkCollision(newPosition);

      if (collision) {
        const tryX = this.player.position.clone();
        tryX.x = newPosition.x;
        if (!collisionSystem.checkCollision(tryX).collision) {
          this.player.position.x = tryX.x;
        }

        const tryZ = this.player.position.clone();
        tryZ.z = newPosition.z;
        if (!collisionSystem.checkCollision(tryZ).collision) {
          this.player.position.z = tryZ.z;
        }

        if (slideVector.length() > 0.01) {
          const slideDirection = new THREE.Vector3()
            .crossVectors(slideVector, new THREE.Vector3(0, 1, 0))
            .normalize();

          const slideMove = slideDirection.multiplyScalar(moveVector.dot(slideDirection));
          const slidePosition = this.player.position.clone().add(slideMove);

          if (!collisionSystem.checkCollision(slidePosition).collision) {
            this.player.position.copy(slidePosition);
          }
        }
      } else {
        this.player.position.copy(newPosition);
      }

      if (moveVector.length() > 0.01) {
        this.player.rotation.y = Math.atan2(moveVector.x, moveVector.z);
      }

      animationSystem.playAnimation('Running1');
      if (Date.now() - audioSystem.lastStepTime > 330) {
        audioSystem.lastStepTime = Date.now();
        audioSystem.playRandomStepSound();
      }
    } else {
      animationSystem.playAnimation('Idle');
      audioSystem.lastStepTime = 0;
    }

    if (joystickData.right.active) {
      this.cameraAngle += joystickData.right.x * SETTINGS.rotationSpeed * 2;
    }

    this.updateCamera();
  },

  checkInteractableProximity: function () {
    if (!gameState.playerReady || !gameState.gameStarted) return;

    let closestDistance = Infinity;
    let closestObject = null;

    interactableObjects.forEach(obj => {
      const distance = this.player.position.distanceTo(obj.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestObject = obj;
        // console.log("closest object " + obj + " distance " + distance);
      }
    });

    const isClose = closestDistance < SETTINGS.interactionDistance;
    this.currentInteractable = isClose ? closestObject : null;

    const actionButton = document.getElementById('action-button');
    if (isClose) {
      actionButton.style.background = 'rgba(255, 255, 255, 0.8)';
      actionButton.style.transform = 'scale(1.05)';
    } else {
      actionButton.style.background = 'rgba(255, 255, 255, 0.3)';
      actionButton.style.transform = 'scale(1)';
    }

    return isClose;
  },

  handleAction: function () {
    if (!this.currentInteractable) return;

    if (this.currentInteractable.userData.isDoor) {
      this.toggleDoor(this.currentInteractable);
    } else if (this.currentInteractable.userData.isRinging) {
      phoneSystem.stopCall();
      // Здесь можно добавить логику ответа на звонок
      console.log("Звонок принят!");
    }
  },

  toggleDoor: function (door) {
    if (door.userData.isAnimating) return;
    door.userData.isAnimating = true;

    const isClosed = door.userData.isClosed;
    const isLeftHanded = door.userData.isLeftHanded;
    const duration = isClosed ? 1000 : 300;

    const startRotation = door.rotation.y;
    const startPosition = door.position.clone();

    const doorWidth = door.geometry.boundingBox.max.x - door.geometry.boundingBox.min.x;
    const offset = isLeftHanded ? -doorWidth / 2 : doorWidth / 2;

    const hingePosition = new THREE.Vector3();
    hingePosition.copy(startPosition);
    hingePosition.x = isClosed ? hingePosition.x + offset : hingePosition.x;
    hingePosition.z = isClosed ? hingePosition.z : hingePosition.z + offset;

    const angle = Math.PI / 2;
    const direction = isLeftHanded ? 1 : -1;
    const targetRotation = isClosed
      ? startRotation + direction * angle
      : startRotation - direction * angle;
    const targetPosition = new THREE.Vector3();
    targetPosition.copy(startPosition);
    if (!isClosed) {
      targetPosition.x -= offset;
      targetPosition.z += offset;
    }
    else {
      targetPosition.x += offset;
      targetPosition.z -= offset;
    }

    if (isClosed && audioSystem.doorSounds.open) {
      audioSystem.doorSounds.open.play();
    } else if (!isClosed && audioSystem.doorSounds.close) {
      audioSystem.doorSounds.close.play();
    }

    const startTime = Date.now();

    const animateDoor = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeOutQuad(progress);

      const currentRotation = startRotation + (targetRotation - startRotation) * easedProgress;

      door.position.copy(hingePosition);
      door.rotation.y = currentRotation;
      door.translateX(isLeftHanded ? doorWidth / 2 : -doorWidth / 2);

      if (progress < 1) {
        requestAnimationFrame(animateDoor);
      } else {
        door.position.copy(targetPosition);
        door.rotation.y = targetRotation;
        door.userData.isClosed = !door.userData.isClosed;
        door.userData.isAnimating = false;
      }
    };

    animateDoor();
  },

  easeOutQuad: function (t) {
    return t * (2 - t);
  }
};

// Система джойстиков
const joystickSystem = {
  init: function () {
    this.setupJoystick(document.getElementById('left-joystick'), 'left');
    this.setupJoystick(document.getElementById('right-joystick'), 'right');
  },

  setupJoystick: function (joystickElement, type) {
    const area = joystickElement.querySelector('.joystick-area');
    const thumb = joystickElement.querySelector('.joystick-thumb');
    const isHorizontalOnly = type === 'right';

    let activeTouchId = null;
    let maxDist = 0;
    let baseRect = null;

    const initSizes = () => {
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
    };

    initSizes();

    const updatePosition = (clientX, clientY, isStart) => {
      initSizes();

      let x = clientX - baseRect.centerX;
      let y = clientY - baseRect.centerY;

      if (isHorizontalOnly) {
        y = 0;
      }

      const dist = Math.min(Math.sqrt(x * x + y * y), maxDist);
      const angle = Math.atan2(y, x);

      const nx = dist * Math.cos(angle);
      const ny = dist * Math.sin(angle);

      joystickData[type].x = nx / maxDist;
      joystickData[type].y = isHorizontalOnly ? 0 : -ny / maxDist;
      joystickData[type].active = true;

      if (isStart) {
        thumb.style.transition = 'none';
      }

      thumb.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    };

    const resetPosition = () => {
      joystickData[type] = { x: 0, y: 0, active: false };
      thumb.style.transition = 'transform 0.2s ease-out';
      thumb.style.transform = 'translate(-50%, -50%)';
    };

    const handleStart = (clientX, clientY, id) => {
      if (!gameState.gameStarted) return;

      activeTouchId = id;
      updatePosition(clientX, clientY, true);
    };

    const handleMove = (clientX, clientY) => {
      if (activeTouchId !== null) {
        updatePosition(clientX, clientY, false);
      }
    };

    const handleEnd = () => {
      resetPosition();
      activeTouchId = null;
    };

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

    window.addEventListener('resize', initSizes);
  }
};

// Система пост-обработки
const postProcessingSystem = {
  composer: null,

  init: function () {
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat
      }
    );

    this.composer = new THREE.EffectComposer(renderer, renderTarget);

    const renderPass = new THREE.RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    const ditherPass = new THREE.ShaderPass(DitherShader);
    ditherPass.renderToScreen = true;
    this.composer.addPass(ditherPass);

    DitherShader.uniforms.tDiffuse.value = renderTarget.texture;
    DitherShader.uniforms.resolution.value.set(
      window.innerWidth,
      window.innerHeight
    );

    this.composer.render();
  }
};

// Шейдер для дизеринга
const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    pixelSize: { value: SETTINGS.ditherPixelSize }
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
    
    float bayer2x2(vec2 coord) {
      coord = mod(coord, 2.0);
      return coord.x + coord.y * 0.5;
    }
    
    void main() {
      vec2 pixelCoord = floor(vUv * resolution / pixelSize) * pixelSize;
      vec2 uv = pixelCoord / resolution;
      
      vec4 color = texture2D(tDiffuse, uv);
      
      float threshold = bayer2x2(gl_FragCoord.xy / pixelSize);
      float ditherAmount = 0.5;
      vec3 quantized = floor(color.rgb * 4.0 + threshold * ditherAmount) / 4.0;
      
      gl_FragColor = vec4(quantized, color.a);
    }
  `
};

// Система управления
const controlSystem = {
  init: function () {
    this.setKeyboardListeners();
    this.setJoystickListeners();
    this.setActionButtonListener();
  },

  setKeyboardListeners: function () {
    document.addEventListener('keydown', (e) => {
      if (!gameState.gameStarted) return;
      if (e.code in keyboardState) {
        keyboardState[e.code] = true;
        e.preventDefault();
      }

      if (e.key === 'F1') {
        gameState.showCollisionDebug = !gameState.showCollisionDebug;
        if (gameState.showCollisionDebug) {
          collisionSystem.createCollisionHelpers();
        } else {
          collisionSystem.removeCollisionHelpers();
        }
        console.log('Collision debug:', gameState.showCollisionDebug ? 'ON' : 'OFF');
      }
    });

    document.addEventListener('keyup', (e) => {
      if (!gameState.gameStarted) return;
      if (e.code in keyboardState) {
        keyboardState[e.code] = false;
        e.preventDefault();
      }
    });
  },

  setJoystickListeners: function () {
    joystickSystem.init();
  },

  setActionButtonListener: function () {
    const actionButton = document.getElementById('action-button');
    actionButton.addEventListener('click', () => playerSystem.handleAction());
    actionButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      playerSystem.handleAction();
    });
  }
};

// Система загрузки уровня
const levelSystem = {
  load: function () {
    if (gameState.levelLoaded) return;

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

        if (child.userData?.isDoor) {
          doors.push(child);
          child.userData.isInteractable = true;
          child.userData.isClosed = true;
          collidableObjects.push(child);
        }
      });

      if (gameState.showCollisionDebug) {
        collisionSystem.createCollisionHelpers();
      }

      gameState.levelLoaded = true;
    });
  }
};

// Инициализация игры
function initGame() {
  // Инициализация систем
  audioSystem.init();
  postProcessingSystem.init();
  playerSystem.loadPlayerModel();
  controlSystem.init();
  introSystem.init();
  levelSystem.load();

  // Обработчики событий
  document.addEventListener('click', () => {
    if (audioSystem.sound.context.state === 'suspended') {
      audioSystem.sound.context.resume();
    }
  }, { once: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    DitherShader.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('pagehide', () => {
    if (audioSystem.sound.context && audioSystem.sound.context.state !== 'closed') {
      audioSystem.sound.context.close();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (audioSystem.sound && audioSystem.sound.isPlaying) {
      audioSystem.sound.stop();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (audioSystem.sound && audioSystem.sound.isPlaying) {
        audioSystem.sound.pause();
      }
      audioSystem.stepSounds.forEach(sound => {
        if (sound && sound.isPlaying) sound.stop();
      });
    }
  });

  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.onEvent('close', () => {
      if (audioSystem.sound && audioSystem.sound.isPlaying) {
        audioSystem.sound.stop();
      }
    });
  }

  // Стартовый экран
  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-button');

  startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    gameState.gameStarted = true;

    phoneSystem.init();
    setTimeout(() => {
      phoneSystem.startCall();
    }, SETTINGS.startPhone.startRingingDelay);
  });

  startButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startScreen.style.display = 'none';
    gameState.gameStarted = true;

    phoneSystem.init();
    setTimeout(() => {
      phoneSystem.startCall();
    }, SETTINGS.startPhone.startRingingDelay);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      introSystem.skipToNextPhrase();
    }
  });

  document.getElementById('start-screen').addEventListener('click', () => {
    introSystem.skipToNextPhrase();
  });
}

function gameLoop(currentTime) {
  requestAnimationFrame(gameLoop);
  const delta = clock.getDelta();

  if (animationSystem.mixer) animationSystem.mixer.update(delta);
  if (gameState.playerReady) {
    playerSystem.handleMovement();
    playerSystem.updateCamera();
    playerSystem.checkInteractableProximity();
  }

  postProcessingSystem.composer.render();
}

const introSystem = {
  currentPhraseIndex: 0,
  typingInterval: null,
  isTyping: false,

  init: function () {
    const startScreen = document.getElementById('start-screen');
    startScreen.innerHTML = `
      <div id="intro-text" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: orange;
        font-family: 'Courier New', monospace;
        font-size: 24px;
        text-align: center;
        width: 80%;
      "></div>
      <button id="start-button" style="
        position: absolute;
        top: 70%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 10px 20px;
        font-size: 18px;
        display: none;
        cursor: pointer;
        background: rgba(255,255,255,0.2);
        color: orange;
        border: 1px solid white;
        border-radius: 5px;
      ">НАЧАТЬ ДЕНЬ</button>
    `;

    this.startTyping();
  },

  startTyping: function () {
    const textElement = document.getElementById('intro-text');
    const startButton = document.getElementById('start-button');

    if (this.currentPhraseIndex >= SETTINGS.introPhrases.length) {
      // Все фразы показаны - показываем кнопку
      textElement.style.display = 'none';
      startButton.style.display = 'block';
      return;
    }

    this.isTyping = true;
    const phrase = SETTINGS.introPhrases[this.currentPhraseIndex];
    let charIndex = 0;

    textElement.textContent = '';

    this.typingInterval = setInterval(() => {
      textElement.textContent += phrase[charIndex];
      charIndex++;

      if (charIndex >= phrase.length) {
        clearInterval(this.typingInterval);
        this.isTyping = false;

        // Показываем кнопку после последней фразы
        if (this.currentPhraseIndex === SETTINGS.introPhrases.length - 1) {
          startButton.style.display = 'block';
        }

        // Переход к следующей фразе после задержки
        setTimeout(() => {
          if (this.currentPhraseIndex < SETTINGS.introPhrases.length - 1) {
            textElement.textContent = '';
            this.currentPhraseIndex++;
            this.startTyping();
          }
        }, SETTINGS.phraseDelay);
      }
    }, SETTINGS.typingSpeed);
  },

  skipToNextPhrase: function () {
    if (this.isTyping) {
      clearInterval(this.typingInterval);
      this.isTyping = false;

      // Показываем полную текущую фразу
      const textElement = document.getElementById('intro-text');
      textElement.textContent = SETTINGS.introPhrases[this.currentPhraseIndex];

      // Если это последняя фраза - показываем кнопку
      if (this.currentPhraseIndex === SETTINGS.introPhrases.length - 1) {
        document.getElementById('start-button').style.display = 'block';
      } else {
        // Через короткую задержку переходим к следующей фразе
        setTimeout(() => {
          textElement.textContent = '';
          this.currentPhraseIndex++;
          this.startTyping();
        }, 300);
      }
    }
  }
};

// Система телефонных звонков
const phoneSystem = {
  phoneObject: null,
  phoneSound: null,
  callTimeout: null,
  init: function () {
    this.loadPhoneSound();
    this.findPhoneObject();
  },
  loadPhoneSound: function () {
    const phoneAudio = new THREE.Audio(audioListener);
    audioLoader.load('assets/audio/phone/phone.mp3', (buffer) => {
      phoneAudio.setBuffer(buffer);
      phoneAudio.setVolume(SETTINGS.startPhone.ringingVolume);
      phoneAudio.setLoop(true);
      this.phoneSound = phoneAudio;
    });
  },
  findPhoneObject: function () {
    scene.traverse((child) => {
      if (child.userData.isPhone) {
        this.phoneObject = child;
        child.userData.isInteractable = true;
        interactableObjects.push(child);
      }
    });
  },
  startCall: function () {
    if (this.phoneSound && !this.phoneSound.isPlaying) {
      this.phoneSound.play();
      if (this.phoneObject) {
        this.phoneObject.userData.isRinging = true;
      }
    }
  },
  stopCall: function () {
    if (this.phoneSound && this.phoneSound.isPlaying) {
      this.phoneSound.stop();
      if (this.phoneObject) {
        this.phoneObject.userData.isRinging = false;
      }
    }
  }
};

// Запуск игры
initGame();
gameLoop();