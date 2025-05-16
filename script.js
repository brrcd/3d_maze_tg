const SETTINGS = {
  movementSpeed: 0.1,
  rotationSpeed: 0.03,
  cameraDistance: 5,
  cameraHeight: 3,
  interactionDistance: 2.5,
  ditherPixelSize: 3,
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
  },
  targetFPS: 120,
  ambientMusic: {
    room: {
      path: 'assets/audio/ambient/room.mp3',
      volume: 0.2
    },
    corridor: {
      path: 'assets/audio/ambient/corridor.mp3',
      volume: 0.2
    },
    forest: {
      path: 'assets/audio/ambient/forest.mp3',
      volume: 0.2
    },
    fadeDuration: 2.0
  },
  zones: ['room', 'corridor', 'forest'],
  soundObjects: {
    activationDistance: 5,
    fullVolumeDistance: 3,
    deactivationDistance: 7,
    fadeSpeed: 0.1,
    maxVolume: 1
  },
  stepSoundVolumes: {
    wood: 0.3,
    forest: 0.3
  },
  stepSoundPaths: {
    wood: [
      'assets/audio/steps/step_wood_1.mp3',
      'assets/audio/steps/step_wood_2.mp3',
      'assets/audio/steps/step_wood_3.mp3',
      'assets/audio/steps/step_wood_4.mp3',
      'assets/audio/steps/step_wood_5.mp3',
      'assets/audio/steps/step_wood_6.mp3',
      'assets/audio/steps/step_wood_7.mp3',
      'assets/audio/steps/step_wood_8.mp3'
    ],
    forest: [
      'assets/audio/steps/step_leaves_1.mp3',
      'assets/audio/steps/step_leaves_2.mp3',
      'assets/audio/steps/step_leaves_3.mp3',
      'assets/audio/steps/step_leaves_4.mp3',
      'assets/audio/steps/step_leaves_5.mp3',
      'assets/audio/steps/step_leaves_6.mp3',
      'assets/audio/steps/step_leaves_7.mp3',
      'assets/audio/steps/step_leaves_8.mp3'
    ]
  },
  floorTypes: {
    0: 'wood',
    1: 'forest'
  },
  fogSettings: {
    room: { near: 100, far: 100, color: 0x87CEEB },
    corridor: { near: 100, far: 100, color: 0x87CEEB },
    forest: { near: 5, far: 10, color: 0x87CEEB } 
  }
};

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

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new THREE.GLTFLoader();
const fbxLoader = new THREE.FBXLoader();
const audioLoader = new THREE.AudioLoader();
const clock = new THREE.Clock();
const audioListener = new THREE.AudioListener();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.add(audioListener);

scene.add(new THREE.AmbientLight(0xFFFFFF));
const debugSphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.5),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
scene.add(debugSphere);

const gameState = {
  playerReady: false,
  levelLoaded: false,
  showCollisionDebug: false,
  gameStarted: false
};

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

const collidableObjects = [];
const interactableObjects = [];
const doors = [];
const collisionHelpers = [];

const audioSystem = {
  sound: new THREE.Audio(audioListener),
  stepSounds: {},
  currentSurfaceType: 'wood',
  currentFloorId: 0,
  doorSounds: {
    open: null,
    close: null
  },
  currentStepSound: 0,
  lastStepTime: 0,
  currentTargetVolume: null,
  volumeTweenInterval: null,
  ambientMusic: {
    currentZone: 'room',
    tracks: {},
    transitionStartTime: 0,
    isTransitioning: false,
    fromTrack: null,
    toTrack: null
  },
  soundObjects: [],
  activeSoundObject: null,
  currentSoundVolume: 0,

  init: function () {
    for (const surfaceType in SETTINGS.stepSoundPaths) {
      this.stepSounds[surfaceType] = [];
      this.loadStepSounds(surfaceType);
    }
    this.loadDoorSounds();
    this.sound.setVolume(0);
  },

  loadStepSounds: function (surfaceType) {
    SETTINGS.stepSoundPaths[surfaceType].forEach((path, index) => {
      const stepSound = new THREE.Audio(audioListener);
      audioLoader.load(path, (buffer) => {
        stepSound.setBuffer(buffer);
        stepSound.setVolume(SETTINGS.stepSoundVolumes[surfaceType]);
        this.stepSounds[surfaceType][index] = stepSound;
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
    const sounds = this.stepSounds[this.currentSurfaceType];
    if (!sounds || sounds.length === 0) return;

    const randomIndex = Math.floor(Math.random() * sounds.length);
    const stepSound = sounds[randomIndex];

    if (stepSound && stepSound.isPlaying) {
      stepSound.stop();
    }
    if (stepSound) {
      stepSound.play();
    }
  },

  loadAmbientMusic: function () {
    const promises = SETTINGS.zones.map(zone => {
      return new Promise((resolve) => {
        audioLoader.load(SETTINGS.ambientMusic[zone].path, (buffer) => {
          const sound = new THREE.Audio(audioListener);
          sound.setBuffer(buffer);
          sound.setLoop(true);
          sound.setVolume(0);
          sound.zone = zone;
          this.ambientMusic.tracks[zone] = sound;
          resolve();
        });
      });
    });

    return Promise.all(promises);
  },

  switchToZone: function (newZone) {
    if (this.ambientMusic.currentZone === newZone || this.ambientMusic.isTransitioning) return;

    this.ambientMusic.isTransitioning = true;
    this.ambientMusic.transitionStartTime = Date.now();
    this.ambientMusic.fromTrack = this.ambientMusic.tracks[this.ambientMusic.currentZone];
    this.ambientMusic.toTrack = this.ambientMusic.tracks[newZone];
    this.ambientMusic.currentZone = newZone;

    if (!this.ambientMusic.toTrack.isPlaying) {
      this.ambientMusic.toTrack.play();
    }
  },

  updateMusicTransition: function () {
    if (!this.ambientMusic.isTransitioning) return;

    const elapsed = (Date.now() - this.ambientMusic.transitionStartTime) / 1000;
    const progress = Math.min(elapsed / SETTINGS.ambientMusic.fadeDuration, 1);

    if (this.ambientMusic.fromTrack) {
      const fromVolume = SETTINGS.ambientMusic[this.ambientMusic.fromTrack.zone].volume;
      this.ambientMusic.fromTrack.setVolume(THREE.MathUtils.lerp(fromVolume, 0, progress));
    }

    const toVolume = SETTINGS.ambientMusic[this.ambientMusic.toTrack.zone].volume;
    this.ambientMusic.toTrack.setVolume(THREE.MathUtils.lerp(0, toVolume, progress));

    if (progress >= 1) {
      this.ambientMusic.isTransitioning = false;
      if (this.ambientMusic.fromTrack) {
        this.ambientMusic.fromTrack.pause();
      }
    }
  },

  addSoundObject: function (object, id) {
    let soundPath;
    switch (id) {
      case 0: soundPath = "assets/audio/music/picture_1.mp3";
        break;
      case 1: soundPath = "assets/audio/music/picture_2.mp3";
        break;
      case 2: soundPath = "assets/audio/music/picture_3.mp3";
        break;
      case 3: soundPath = "assets/audio/music/picture_4.mp3";
        break;
      case 4: soundPath = "assets/audio/music/picture_5.mp3";
        break;
      case 5: soundPath = "assets/audio/music/picture_6.mp3";
        break;
      case 6: soundPath = "assets/audio/music/picture_7.mp3";
        break;
      case 7: soundPath = "assets/audio/music/picture_8.mp3";
        break;
      case 8: soundPath = "assets/audio/music/picture_9.mp3";
        break;
      default: soundPath = "assets/audio/music/picture_1.mp3";
        break;
    }

    return new Promise((resolve, reject) => {
      audioLoader.load(soundPath,
        (buffer) => {

          const sound = new THREE.PositionalAudio(audioListener);
          sound.setBuffer(buffer);
          sound.setRefDistance(1);
          sound.setLoop(true);
          sound.setVolume(0);

          if (!object || !object.isObject3D) {
            console.error("Объект не существует или не является Object3D");
            return reject("Invalid object");
          }

          object.add(sound);
          object.userData.soundVolume = SETTINGS.soundObjects.maxVolume;

          const soundObj = {
            object: object,
            sound: sound,
            isPlaying: false
          };

          this.soundObjects.push(soundObj);
          resolve(soundObj);
        },
        undefined,
        (error) => {
          console.error("Ошибка загрузки аудио:", error);
          reject(error);
        }
      );
    });
  },

  updateSoundObjects: function (playerPosition) {
    this.soundObjects = this.soundObjects.filter(soundObj =>
      soundObj && soundObj.object && soundObj.sound
    );

    let closestObject = null;
    let closestDistance = Infinity;
    let targetVolume = 0.11;

    this.soundObjects.forEach(soundObj => {
      if (!soundObj.object || !soundObj.sound) return;

      const distance = playerPosition.distanceTo(soundObj.object.position);

      if (distance < SETTINGS.soundObjects.deactivationDistance && distance < closestDistance) {
        closestDistance = distance;
        closestObject = soundObj;
      }
    });

    if (closestObject) {
      if (closestDistance <= SETTINGS.soundObjects.fullVolumeDistance) {
        targetVolume = closestObject.object.userData.soundVolume;
      } else if (closestDistance <= SETTINGS.soundObjects.activationDistance) {
        const fadeRange = SETTINGS.soundObjects.activationDistance - SETTINGS.soundObjects.fullVolumeDistance;
        const fadeDistance = closestDistance - SETTINGS.soundObjects.fullVolumeDistance;
        targetVolume = closestObject.object.userData.soundVolume * (1 - (fadeDistance / fadeRange));
      };
    }

    const volumeDiff = targetVolume - this.currentSoundVolume;
    if (Math.abs(volumeDiff) > 0.01) {
      this.currentSoundVolume += volumeDiff * SETTINGS.soundObjects.fadeSpeed;
    } else {
      this.currentSoundVolume = targetVolume;
    }

    if (this.activeSoundObject !== closestObject) {
      if (this.activeSoundObject && this.activeSoundObject.sound && this.activeSoundObject.isPlaying) {
        this.activeSoundObject.sound.stop();
        this.activeSoundObject.isPlaying = false;
      }

      if (closestObject && closestObject.sound && this.currentSoundVolume > 0.01) {
        try {
          closestObject.sound.play();
          closestObject.isPlaying = true;
        } catch (e) {
          closestObject.isPlaying = false;
        }
      }

      this.activeSoundObject = closestObject;
    }

    if (this.activeSoundObject && this.activeSoundObject.sound) {
      this.activeSoundObject.sound.setVolume(this.currentSoundVolume);

      if (this.currentSoundVolume <= 0.01 && this.activeSoundObject.isPlaying) {
        this.activeSoundObject.sound.stop();
        this.activeSoundObject.isPlaying = false;
        this.activeSoundObject = null;
      }
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

    this.detectSurfaceType();

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
      this.cameraAngle -= joystickData.right.x * SETTINGS.rotationSpeed * 2;
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
    const doorLength = door.geometry.boundingBox.max.z - door.geometry.boundingBox.min.z;
    const isUsingWidth = doorWidth > 0.01
    const usedDimension = isUsingWidth ? doorWidth : doorLength
    const offset = isLeftHanded ? - usedDimension / 2 : usedDimension / 2;

    const hingePosition = new THREE.Vector3();
    hingePosition.copy(startPosition);
    if (isUsingWidth) {
      hingePosition.x = isClosed ? hingePosition.x + offset : hingePosition.x;
      hingePosition.z = isClosed ? hingePosition.z : hingePosition.z + offset;
    } else {
      hingePosition.x = isClosed ? hingePosition.x : hingePosition.x + offset;
      hingePosition.z = isClosed ? hingePosition.z - offset : hingePosition.z;
    }

    const angle = Math.PI / 2;
    const direction = isLeftHanded ? 1 : -1;
    const targetRotation = isClosed
      ? startRotation + direction * angle
      : startRotation - direction * angle;
    const targetPosition = new THREE.Vector3();
    targetPosition.copy(startPosition);

    if (isUsingWidth) {
      targetPosition.x = isClosed ? targetPosition.x + offset : targetPosition.x - offset;
      targetPosition.z = isClosed ? targetPosition.z - offset : targetPosition.z + offset;
    } else {
      targetPosition.x = isClosed ? targetPosition.x - offset : targetPosition.x + offset;
      targetPosition.z = isClosed ? targetPosition.z - offset : targetPosition.z + offset;
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

      if (isUsingWidth) {
        door.translateX(isLeftHanded ? usedDimension / 2 : - usedDimension / 2);
      } else {
        door.translateZ(isLeftHanded ? - usedDimension / 2 : usedDimension / 2);
      }

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
  },

  detectSurfaceType: function () {
    const raycaster = new THREE.Raycaster();
    raycaster.set(this.player.position, new THREE.Vector3(0, -1, 0));

    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;
      let floorInfo = this.getFloorInfo(intersectedObject);

      if (floorInfo) {
        audioSystem.currentSurfaceType = SETTINGS.floorTypes[floorInfo.floorId];
      } else {
        audioSystem.currentSurfaceType = 'wood';
      }
    }
  },

  getFloorInfo: function (object) {
    let current = object;
    while (current) {
      if (current.userData?.isFloor && current.userData.floorId !== undefined) {
        return {
          isFloor: true,
          floorId: current.userData.floorId
        };
      }
      current = current.parent;
    }
    return null;
  },
};

const joystickSystem = {
  init: function () {
    this.setupJoystick(document.getElementById('left-joystick'), 'left');
    this.setupJoystick(document.getElementById('right-joystick'), 'right');
  },

  setupJoystick: function (joystickElement, type) {
    const area = joystickElement.querySelector('.joystick-area');
    const thumb = joystickElement.querySelector('.joystick-thumb');

    let activeTouchId = null;
    let maxDist = 0;
    let baseRect = null;

    const initSizes = () => {
      const rect = area.getBoundingClientRect();
      maxDist = rect.width / 2.2;
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

const levelSystem = {
  load: function () {
    if (gameState.levelLoaded) return;

    const textures = [
      textureLoader.load('assets/textures/wood_floor.jpg'), // floorId = 0
      textureLoader.load('assets/textures/grass_floor.png') // floorId = 1
    ];
    textures.forEach(t => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    });

    gltfLoader.load('assets/levels/level_2.glb', (gltf) => {
      scene.add(gltf.scene);

      gltf.scene.traverse(child => {
        if (child.isMesh && child.userData?.isFloor && child.userData.floorId !== undefined) {
          const floorId = child.userData.floorId;

          if (child.geometry.attributes.uv) {
            const uvArray = child.geometry.attributes.uv.array;
            const bbox = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3();
            bbox.getSize(size);

            const scaleU = size.x / 2;
            const scaleV = size.z / 2;

            for (let i = 0; i < uvArray.length; i += 2) {
              uvArray[i] *= scaleU;
              uvArray[i + 1] *= scaleV;
            }

            child.geometry.attributes.uv.needsUpdate = true;
          }

          child.material = new THREE.MeshStandardMaterial({
            map: textures[floorId],
            roughness: floorId === 0 ? 0.8 : 0.9,
            metalness: floorId === 0 ? 0.2 : 0.1
          });
        }

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

        if (child.userData?.isSoundObject) {
          audioSystem.addSoundObject(
            child,
            child.userData.id
          ).catch(e => {
            console.error("Ошибка создания звукового объекта:", e);
          });
        }
      });

      if (gameState.showCollisionDebug) {
        collisionSystem.createCollisionHelpers();
      }

      gameState.levelLoaded = true;
      scene.fog = new THREE.Fog(0x87CEEB, 100, 150);
    });
  }
};

const zoneSystem = {
  triggers: [],
  lastTrigger: null,
  lastTriggerTime: 0,

  init: function () {
    this.findTriggers();
  },

  findTriggers: function () {
    scene.traverse((child) => {
      if (child.userData.isAmbientMusicSwitchTrigger) {
        child.box3 = new THREE.Box3().setFromObject(child);
        child.visible = false;
        this.triggers.push(child);
      }
    });
  },

  checkPlayerPosition: function (playerPosition) {
    if (!gameState.playerReady) return;

    const now = Date.now();
    if (now - this.lastTriggerTime < 1000) return;

    const playerSize = new THREE.Vector3(0.8, 1.5, 0.8);
    const playerBox = new THREE.Box3(
      playerPosition.clone().sub(playerSize),
      playerPosition.clone().add(playerSize)
    );

    for (const trigger of this.triggers) {
      if (playerBox.intersectsBox(trigger.box3) && trigger !== this.lastTrigger) {
        this.lastTrigger = trigger;
        this.lastTriggerTime = now;
        this.handleZoneTransition(playerPosition, trigger);
        break;
      }
    }
  },

  handleZoneTransition: function (playerPosition, trigger) {
    const fromZone = audioSystem.ambientMusic.currentZone;
    let toZone;

    if (fromZone === trigger.userData.zoneA) {
      return;
    } else {
      toZone = trigger.userData.zoneA;
    }
    audioSystem.switchToZone(toZone);

    this.updateFog(toZone);
  },

  updateFog: function (zone) {
    const fogSettings = SETTINGS.fogSettings[zone];
    if (!fogSettings || !scene.fog) return;

    const duration = 2500;
    const startTime = Date.now();
    const startNear = scene.fog.near;
    const startFar = scene.fog.far;
    const startColor = scene.fog.color.clone();

    const animateFog = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      scene.fog.near = THREE.MathUtils.lerp(startNear, fogSettings.near, progress);
      scene.fog.far = THREE.MathUtils.lerp(startFar, fogSettings.far, progress);
      scene.fog.color.lerpColors(startColor, new THREE.Color(fogSettings.color), progress);

      if (progress < 1) {
        requestAnimationFrame(animateFog);
      }
    };

    animateFog();
  }
};

const consoleLogger = {
  logs: [],
  maxLogs: 20,
  isVisible: false,

  init: function () {
    // Сохраняем оригинальные методы
    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };

    // Перехватываем console.log/warn/error
    console.log = (...args) => {
      this.addLog('log', ...args);
      original.log(...args);
    };
    console.warn = (...args) => {
      this.addLog('warn', ...args);
      original.warn(...args);
    };
    console.error = (...args) => {
      this.addLog('error', ...args);
      original.error(...args);
    };

    // Настройка UI
    const logsButton = document.getElementById('logs-button');
    const logsDisplay = document.getElementById('logs-display');

    // Обработчик для кликов (ПК)
    logsButton.addEventListener('click', (e) => {
      this.toggleLogsDisplay();
      e.preventDefault();
    });

    // Обработчик для тапов (мобильные)
    logsButton.addEventListener('touchstart', (e) => {
      this.toggleLogsDisplay();
      e.preventDefault();
    });

    // Предотвращаем всплытие событий
    logsDisplay.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
  },

  toggleLogsDisplay: function () {
    const logsDisplay = document.getElementById('logs-display');
    this.isVisible = !this.isVisible;
    logsDisplay.style.display = this.isVisible ? 'block' : 'none';
    if (this.isVisible) this.updateDisplay();
  },

  addLog: function (type, ...args) {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return arg.toString();
        }
      }
      return arg;
    }).join(' ');

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.isVisible) {
      this.updateDisplay();
    }
  },

  updateDisplay: function () {
    const logsDisplay = document.getElementById('logs-display');
    if (!logsDisplay) return;

    logsDisplay.innerHTML = this.logs
      .map(log => `<div class="log-entry">${log}</div>`)
      .join('');

    logsDisplay.scrollTop = logsDisplay.scrollHeight;
  }
};

function initGame() {
  postProcessingSystem.init();
  playerSystem.loadPlayerModel();
  controlSystem.init();
  introSystem.init();
  levelSystem.load();

  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-button');

  const handleStartGame = () => {
    resumeAudioContext();

    startScreen.style.display = 'none';
    gameState.gameStarted = true;

    audioSystem.init();
    // phoneSystem.init();

    audioSystem.loadAmbientMusic().then(() => {
      const roomMusic = audioSystem.ambientMusic.tracks['room'];
      if (roomMusic && !roomMusic.isPlaying) {
        roomMusic.setVolume(SETTINGS.ambientMusic.room.volume);
        roomMusic.play();
      }
    });

    setTimeout(() => {
      phoneSystem.startCall();
    }, SETTINGS.startPhone.startRingingDelay);
    zoneSystem.init();
  };

  startButton.addEventListener('click', handleStartGame);
  startButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleStartGame();
  });
}

let lastFrameTime = 0;
const frameTime = 1000 / SETTINGS.targetFPS;

function gameLoop(currentTime) {
  requestAnimationFrame(gameLoop);

  if (!lastFrameTime) lastFrameTime = currentTime;
  const deltaTime = currentTime - lastFrameTime;
  if (deltaTime < frameTime) return;

  lastFrameTime = currentTime;

  const delta = clock.getDelta();

  if (animationSystem.mixer) animationSystem.mixer.update(delta);
  if (gameState.playerReady) {
    playerSystem.handleMovement();
    playerSystem.updateCamera();
    playerSystem.checkInteractableProximity();
    zoneSystem.checkPlayerPosition(playerSystem.player.position);
    audioSystem.updateSoundObjects(playerSystem.player.position);
  }
  if (audioSystem.activeSoundObject) {
    debugSphere.position.copy(audioSystem.activeSoundObject.object.position);
    debugSphere.visible = true;
  } else {
    debugSphere.visible = false;
  }

  audioSystem.updateMusicTransition();

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

    startScreen.addEventListener('click', () => this.skipToNextPhrase());
    startScreen.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.skipToNextPhrase();
    });

    this.startTyping();
  },

  startTyping: function () {
    const textElement = document.getElementById('intro-text');
    const startButton = document.getElementById('start-button');

    if (this.currentPhraseIndex >= SETTINGS.introPhrases.length) {
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

        if (this.currentPhraseIndex === SETTINGS.introPhrases.length - 1) {
          startButton.style.display = 'block';
        }

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

      const textElement = document.getElementById('intro-text');
      textElement.textContent = SETTINGS.introPhrases[this.currentPhraseIndex];

      if (this.currentPhraseIndex === SETTINGS.introPhrases.length - 1) {
        document.getElementById('start-button').style.display = 'block';
      } else {
        setTimeout(() => {
          textElement.textContent = '';
          this.currentPhraseIndex++;
          this.startTyping();
        }, 300);
      }
    }
  }
};

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
      if (child.userData.isStartingPhone) {
        this.phoneObject = child;
        child.userData.isInteractable = true;
        interactableObjects.push(child);
      }
    });
  },
  startCall: function () {
    if (!gameState.gameStarted) return;
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

initGame();
gameLoop();

document.addEventListener('click', () => {
  if (audioSystem.sound.context.state === 'suspended') {
    audioSystem.sound.context.resume();
  }
}, { once: true });

function resumeAudioContext() {
  const ctx = audioSystem.sound.context;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Проверяем, существуют ли элементы перед добавлением обработчиков
  const logsButton = document.getElementById('logs-button');
  const logsDisplay = document.getElementById('logs-display');

  if (logsButton && logsDisplay) {
    consoleLogger.init();
  } else {
    console.error('Не удалось найти элементы для логгера');
  }
});
