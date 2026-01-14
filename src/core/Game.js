import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TILE_SIZE, MAP_LAYOUT, TOWER_TYPES, ENEMY_TYPES, WAVE_DATA } from '../data/Constants.js';
import { MODEL_PATHS, INTERACTABLE_TYPES } from '../data/Constants.js';

import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Building } from '../entities/Building.js';
import { Projectile } from '../entities/Projectile.js';
import { Interactable } from '../entities/Interactable.js';
import { ResourceManager } from './ResourceManager.js';
import { ShaderManager } from './ShaderManager.js';

export class Game {
    constructor() {
        this.lives = 20;
        this.score = 0;
        this.cash = 200;
        this.isGameOver = false;
        this.keys = { w: false, a: false, s: false, d: false };
        this.lastSpawnTime = 0;
        this.selectedTowerIndex = 0;
        this.resourceManager = new ResourceManager();
        this.clock = new THREE.Clock();

        this.gameMode = 'STANDARD';

        this.currentWaveIndex = 0;
        this.isWaveActive = false;
        this.spawnQueue = [];
        this.lastSpawnTime = 0;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.groundTiles = [];
        this.ghostTower = null;
        this.lastHoveredTile = null;
        
        this.enemies = [];
        this.towers = [];
        this.projectiles = [];
        this.interactables = [];

        this.scene = new THREE.Scene();
        this.shaderManager = new ShaderManager(this.scene);
        this.resourceManager = new ResourceManager(this.shaderManager);

        this.gameState = "PLAYING";
        this.isPaused = false;
        this.isMenuOpen = false;
        
        this.transitionProgress = 0;
        this.transitionDuration = 2.0;
        this.cruiseHeight = 40;
        this.startCamPos = new THREE.Vector3();
        this.startTarget = new THREE.Vector3();
        this.endCamPos = new THREE.Vector3();
        this.endTarget = new THREE.Vector3();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.heldObject = null;
        this.holdDistance = 5;
        this.rotateAxis = 'y';
        this.rotateSpeed = 0.05;
        this.pickupRadius = 1.5;

        this.isAutoStart = false;
        this.towerStats = {};
        
        TOWER_TYPES.forEach(t => this.towerStats[t.name] = 0);

        this.bgMusic = new Audio('/assets/bg_music.mp3'); 
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0.2;
        this.isMuted = false;

        this.init();
    }

    async init() {

        this.injectUI();
    
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-screen';
        loadingDiv.style = "position:absolute; top:0; left:0; width:100%; height:100%; background:#000; color:#fff; display:flex; justify-content:center; align-items:center; z-index:999; font-size:30px;";
        loadingDiv.innerText = "LOADING ASSETS...";
        document.body.appendChild(loadingDiv);

        try {
            await this.resourceManager.loadAll(MODEL_PATHS);
            document.body.removeChild(loadingDiv);
        } catch (err) {
            loadingDiv.innerText = "ERROR LOADING ASSETS";
            console.error(err);
            return;
        }

        this.scene.background = new THREE.Color(0x222222);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(10, 8, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };
        
        this.controls.enableZoom = true;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 30;
        this.controls.maxPolarAngle = Math.PI / 2.5;

        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);
        
        const mapWidth = 20 * TILE_SIZE;
        const mapDepth = 15 * TILE_SIZE;
        const mapCenterX = (mapWidth - TILE_SIZE) / 2;
        const mapCenterZ = (mapDepth - TILE_SIZE) / 2;
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(mapCenterX, 30, mapCenterZ);
        dirLight.castShadow = true;
        
        dirLight.target.position.set(mapCenterX, 0, mapCenterZ);
        this.scene.add(dirLight.target);
        
        const shadowMargin = 3;
        dirLight.shadow.camera.left = -mapWidth / 2 - shadowMargin;
        dirLight.shadow.camera.right = mapWidth / 2 + shadowMargin;
        dirLight.shadow.camera.top = mapDepth / 2 + shadowMargin;
        dirLight.shadow.camera.bottom = -mapDepth / 2 - shadowMargin;
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 50;
        
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.bias = -0.0001;
        
        this.scene.add(dirLight);

        const textureLoader = new THREE.TextureLoader();
        const skyTexture = textureLoader.load('/assets/skybox.jpg');
        skyTexture.mapping = THREE.EquirectangularReflectionMapping;
        skyTexture.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = skyTexture;
        this.scene.environment = skyTexture;

        this.createLevel();
        this.createEnvironment();
        this.createCreditsArea();

        this.player = new Player(this.scene, this.resourceManager);

        this.spotlightInteractable = this.interactables.find(i => i.type === 'Spotlight');
        
        if (this.spotlightInteractable) {
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.001), 
                new THREE.MeshBasicMaterial({color: 0xffaa00})
            );
            bulb.position.y = 1.0;
            this.spotlightInteractable.mesh.add(bulb);
        }

        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('click', (e) => this.onMouseClick(e));

        this.updateUI();

    }

    onMouseDown(event) {
        console.log("onmouseodnw");
        if (this.gameState !== "PLAYING" || this.isPaused) return;

        if (event.button === 0) {
            if (this.heldObject) {
                console.log("Dropped:", this.heldObject.type);
                this.heldObject = null;
            } else {
                this.attemptPickup();
            }
        }
    }

    attemptPickup() {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const interactableMeshes = this.interactables.map(i => i.mesh);

        const intersects = this.raycaster.intersectObjects(interactableMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            
            if (hit.distance > 15) return;

            let targetMesh = hit.object;
            while(targetMesh && !targetMesh.userData.parentInteractable) {
                targetMesh = targetMesh.parent;
            }

            if (targetMesh && targetMesh.userData.parentInteractable) {
                this.heldObject = targetMesh.userData.parentInteractable;
                console.log("Picked up:", this.heldObject.type);
            }
        }
    }

    injectUI() {
        const startScreen = document.createElement('div');
        startScreen.id = 'start-screen';
        startScreen.style = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #111;
            
            background-image: url('/assets/menu_bg.jpeg'); 
            
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;

            display: flex; flex-direction: column; align-items: center;
            
            justify-content: flex-start;
            padding-top: 350px;
            box-sizing: border-box;
            z-index: 200; font-family: sans-serif;
        `;

        const stdSave = this.loadGameData('STANDARD');
        const endlessSave = this.loadGameData('ENDLESS');

        let menuHTML = `
            <p style="color: white; font-size: 40px; color: #FFD700; margin-bottom: 40px;">Select Game Mode</p>
            
            <div style="display: flex; gap: 40px;">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button id="btn-mode-standard" style="padding: 20px 40px; font-size: 24px; font-weight: bold; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 10px; min-width: 250px;">
                        STANDARD MODE
                    </button>
                    ${stdSave ? `
                    <button id="btn-continue-standard" style="padding: 10px; font-size: 16px; cursor: pointer; background: #1e7e34; color: #ddd; border: 1px solid #fff; border-radius: 5px;">
                        Continue (Wave ${stdSave.waveIndex + 1})
                    </button>` : ''}
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button id="btn-mode-endless" style="padding: 20px 40px; font-size: 24px; font-weight: bold; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 10px; min-width: 250px;">
                        ENDLESS MODE
                    </button>
                    ${endlessSave ? `
                    <button id="btn-continue-endless" style="padding: 10px; font-size: 16px; cursor: pointer; background: #a71d2a; color: #ddd; border: 1px solid #fff; border-radius: 5px;">
                        Continue (Wave ${endlessSave.waveIndex + 1})
                    </button>` : ''}
                </div>
            </div>
        `;

        startScreen.innerHTML = menuHTML;
        document.body.appendChild(startScreen);

        document.getElementById('btn-mode-standard').onclick = () => {
            this.clearSave('STANDARD');
            this.startGame('STANDARD');
        };

        document.getElementById('btn-mode-endless').onclick = () => {
            this.clearSave('ENDLESS');
            this.startGame('ENDLESS');
        };

        if (stdSave) {
            document.getElementById('btn-continue-standard').onclick = () => {
                this.startGame('STANDARD', true);
            };
        }

        if (endlessSave) {
            document.getElementById('btn-continue-endless').onclick = () => {
                this.startGame('ENDLESS', true);
            };
        }

        const dropdownBtn = document.createElement('button');
        dropdownBtn.id = 'dropdown-toggle';
        dropdownBtn.innerHTML = '🏗️ BUILD MENU';
        dropdownBtn.style = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 30px; font-size: 16px; font-weight: bold; background: rgba(0,150,0,0.8); color: white; border: 2px solid #00FF00; border-radius: 8px; cursor: pointer; z-index: 10; display: none; font-family: sans-serif;";
        dropdownBtn.onclick = () => {
            this.toggleBuildMenu();
            dropdownBtn.blur();
        };
        document.body.appendChild(dropdownBtn);
        
        const bar = document.createElement('div');
        bar.id = 'tower-bar';
        bar.style = "position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%); display: none; gap: 10px; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px; z-index: 10; border: 2px solid #00FF00;";
        
        TOWER_TYPES.forEach((type, index) => {
            const btn = document.createElement('div');
            btn.innerHTML = `<b>${type.name}</b><br>$${type.cost}`;
            btn.style = "color: white; background: #444; padding: 10px; cursor: pointer; border: 2px solid transparent; text-align: center; font-family: sans-serif; font-size: 12px; min-width: 60px; user-select: none; transition: all 0.2s;";
            btn.id = `btn-tower-${index}`;
            btn.onmouseover = () => { if (btn.style.borderColor !== 'rgb(0, 255, 0)') btn.style.background = '#555'; };
            btn.onmouseout = () => { if (btn.style.borderColor !== 'rgb(0, 255, 0)') btn.style.background = '#444'; };
            btn.onclick = (e) => {
                e.stopPropagation();
                this.selectedTowerIndex = index;
                this.updateTowerSelectionUI();
                btn.blur();
            };
            bar.appendChild(btn);
        });
        document.body.appendChild(bar);
        
        const delOverlay = document.createElement('div');
        delOverlay.id = "delete-overlay";
        delOverlay.style = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; text-align: center; display: none; font-family: sans-serif; border-radius: 10px; z-index: 20;";
        delOverlay.innerHTML = "<h3>Sell Tower?</h3><p>Refund: 50%</p><button id='btn-confirm-del' style='padding:5px 10px; margin-right:10px; cursor:pointer;'>CONFIRM (Space)</button> <button id='btn-cancel-del' style='padding:5px 10px; cursor:pointer;'>CANCEL (Esc)</button>";
        document.body.appendChild(delOverlay);
        document.getElementById('btn-confirm-del').onclick = () => this.confirmDelete();
        document.getElementById('btn-cancel-del').onclick = () => this.cancelDelete();

        let sb = document.getElementById('score-board');
        if (!sb) {
            sb = document.createElement('div');
            sb.id = 'score-board';
            sb.style = "position: absolute; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.5); padding: 10px; font-family: sans-serif; user-select: none; display: none; border-radius: 5px;";
            document.body.appendChild(sb);
        }

        const autoBtn = document.createElement('div');
        autoBtn.id = 'btn-auto-start';
        autoBtn.style = `
            position: absolute; bottom: 80px; right: 20px;
            width: 40px; height: 40px; 
            background: #333; border: 2px solid #555; border-radius: 5px;
            display: none; cursor: pointer;
            align-items: center; justify-content: center; z-index: 10;
        `;
        
        const triangle = document.createElement('div');
        triangle.id = 'auto-start-icon';
        triangle.style = `
            width: 0; height: 0; 
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-left: 14px solid #FF0000;
            margin-left: 4px;
        `;
        
        autoBtn.appendChild(triangle);
        
        autoBtn.onclick = () => {
            this.isAutoStart = !this.isAutoStart;
            triangle.style.borderLeftColor = this.isAutoStart ? '#00FF00' : '#FF0000';
            
            if (this.isAutoStart && !this.isWaveActive) {
                this.startNextWave();
            }
        };
        document.body.appendChild(autoBtn);

        const goScreen = document.createElement('div');
        goScreen.id = "game-over-screen";
        goScreen.style = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); color: #FF0000; display: none; flex-direction: column; align-items: center; justify-content: center; font-family: 'Arial', sans-serif; z-index: 100;";
        goScreen.innerHTML = `
            <h1 style="font-size: 60px; margin-bottom: 20px; text-shadow: 2px 2px 0px #000;">GAME OVER</h1>
            <p style="color: white; font-size: 24px;">Final Score: <span id="final-score">0</span></p>
            <button id="btn-restart" style="margin-top: 30px; padding: 15px 40px; font-size: 20px; cursor: pointer; background: #fff; border: none; border-radius: 5px; font-weight: bold;">TRY AGAIN</button>
        `;
        document.body.appendChild(goScreen);
        document.getElementById('btn-restart').onclick = () => { window.location.reload(); };

        const waveBtn = document.createElement('button');
        waveBtn.id = 'btn-next-wave';
        waveBtn.innerText = 'START WAVE 1';
        waveBtn.style = `
            position: absolute; bottom: 20px; right: 20px;
            padding: 15px 30px; font-size: 20px; font-weight: bold;
            background: #ffc107; border: none; border-radius: 5px;
            cursor: pointer; z-index: 10; box-shadow: 0 4px #e0a800;
            font-family: sans-serif; color: #000;
        `;
        
        waveBtn.onclick = () => this.startNextWave();
        
        document.body.appendChild(waveBtn);

        const endScreen = document.createElement('div');
        endScreen.id = 'end-screen';
        endScreen.style = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); 
            color: white; 
            display: none; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            font-family: 'Arial', sans-serif; 
            z-index: 200;
        `;
        document.body.appendChild(endScreen);

        const helpOverlay = document.createElement('div');
        helpOverlay.id = 'help-overlay';
        helpOverlay.style = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85); 
            color: #fff; 
            display: none; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            z-index: 150; 
            font-family: 'Arial', sans-serif;
            text-align: center;
        `;

        helpOverlay.innerHTML = `
            <h2 style="font-size: 40px; color: #FFD700; margin-bottom: 30px; border-bottom: 2px solid #FFD700; padding-bottom: 10px;">CONTROLS & HELP</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left; font-size: 20px;">
                <div style="font-weight: bold; color: #aaa;">W, A, S, D</div>
                <div>Move Character</div>
                
                <div style="font-weight: bold; color: #aaa;">Mouse Left</div>
                <div>Select / Place Tower & Pick up toy</div>

                <div style="font-weight: bold; color: #aaa;">Mouse Wheel</div>
                <div>Zoom Camera</div>
                
                <div style="font-weight: bold; color: #aaa;">Mouse Right</div>
                <div>Rotate Camera</div>
                
                <div style="font-weight: bold; color: #aaa;">SPACE</div>
                <div>Sell Tower (stand on tower)</div>

                <div style="font-weight: bold; color: #aaa;">B</div>
                <div>Toggle Build Menu</div>

                <div style="font-weight: bold; color: #aaa;">M</div>
                <div>Show / Hide Credits</div>

                <div style="font-weight: bold; color: #aaa;">H</div>
                <div>Show / Hide Help</div>
                
                <div style="font-weight: bold; color: #aaa;">P</div>
                <div>Switch Shaders</div>

                <div style="font-weight: bold; color: #aaa;">Q, E</div>
                <div>Rotate Toy</div>

                <div style="font-weight: bold; color: #aaa;">R</div>
                <div>Change Toy Rotation Axis</div>
            </div>

            <button id="btn-exit-menu" style="margin-top: 30px; padding: 10px 30px; background: #dc3545; color: white; border: none; border-radius: 5px; font-size: 18px; cursor: pointer;">
                SAVE & EXIT TO MENU
            </button>
            <p style="margin-top: 30px; font-style: italic; color: #888;">Reminder: Leaving the game deletes all of your buildings sell or lose all of them.</p>

            <p style="margin-top: 10px; font-style: italic; color: #888;">Press 'H' to Resume Game</p>

            <div style="position: absolute; bottom: 130px; right: 40px; text-align: center; color: #00FF00;">
            <div style="font-size: 14px; margin-bottom: 5px;">Auto Start Next Wave</div>
            <div style="font-size: 60px; line-height: 20px;">&#8600;</div> </div>
        `;

        document.body.appendChild(helpOverlay);

        document.getElementById('btn-exit-menu').onclick = () => {
            this.saveGame();
            window.location.reload();
        };

        const muteBtn = document.createElement('div');
        muteBtn.id = 'btn-mute';
        muteBtn.style = `
            position: absolute; top: 20px; right: 20px;
            width: 50px; height: 50px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid #fff; border-radius: 50%;
            color: white; font-size: 24px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            z-index: 300; user-select: none;
            transition: background 0.2s;
        `;
        
        muteBtn.innerText = '🔊';

        muteBtn.onclick = () => this.toggleMusic();
        
        muteBtn.onmouseenter = () => muteBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        muteBtn.onmouseleave = () => muteBtn.style.background = 'rgba(0, 0, 0, 0.5)';

        document.body.appendChild(muteBtn);
    }

    toggleMusic() {
        const btn = document.getElementById('btn-mute');
        
        if (this.isMuted) {
            this.bgMusic.play().catch(e => console.log("Audio play failed:", e));
            this.isMuted = false;
            if (btn) btn.innerText = '🔊';
        } else {
            this.bgMusic.pause();
            this.isMuted = true;
            if (btn) btn.innerText = '🔇';
        }
    }

    updateTowerSelectionUI() {
        document.querySelectorAll('[id^="btn-tower-"]').forEach(b => b.style.borderColor = "transparent");
        const activeBtn = document.getElementById(`btn-tower-${this.selectedTowerIndex}`);
        if(activeBtn) activeBtn.style.borderColor = "#00FF00";
        
        if (this.isMenuOpen) {
            this.createGhostTower();
        }
    }

    toggleBuildMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        const towerBar = document.getElementById('tower-bar');
        const dropdownBtn = document.getElementById('dropdown-toggle');
        
        if (this.isMenuOpen) {
            towerBar.style.display = 'flex';
            dropdownBtn.innerHTML = '✖ CLOSE MENU';
            dropdownBtn.style.background = 'rgba(150,0,0,0.8)';
            dropdownBtn.style.borderColor = '#FF0000';
            this.showGrid();
            this.createGhostTower();
        } else {
            towerBar.style.display = 'none';
            dropdownBtn.innerHTML = '🏗️ BUILD MENU';
            dropdownBtn.style.background = 'rgba(0,150,0,0.8)';
            dropdownBtn.style.borderColor = '#00FF00';
            this.hideGrid();
            this.hideGhostTower();
        }
    }

    showGrid() {
        if (!this.gridHelper) {
            const gridGroup = new THREE.Group();
            
            for (let col = 0; col <= 20; col++) {
                const xPos = (col - 0.5) * TILE_SIZE;
                const points = [
                    new THREE.Vector3(xPos, 0.3, -TILE_SIZE / 2),
                    new THREE.Vector3(xPos, 0.3, 15 * TILE_SIZE - TILE_SIZE / 2)
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ 
                    color: 0x00FF00, 
                    transparent: true, 
                    opacity: 0.5 
                });
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
            
            for (let row = 0; row <= 15; row++) {
                const zPos = (row - 0.5) * TILE_SIZE;
                const points = [
                    new THREE.Vector3(-TILE_SIZE / 2, 0.3, zPos),
                    new THREE.Vector3(20 * TILE_SIZE - TILE_SIZE / 2, 0.3, zPos)
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ 
                    color: 0x00FF00, 
                    transparent: true, 
                    opacity: 0.5 
                });
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
            
            this.gridHelper = gridGroup;
            this.scene.add(this.gridHelper);
        } else {
            this.gridHelper.visible = true;
        }
    }

    hideGrid() {
        if (this.gridHelper) {
            this.gridHelper.visible = false;
        }
    }

    createGhostTower() {
        if (this.ghostTower) {
            this.hideGhostTower();
        }

        const typeInfo = TOWER_TYPES[this.selectedTowerIndex];
        const modelKey = typeInfo.modelKey;
        
        const model = this.resourceManager.getModel(modelKey);
        const ghostModel = model.clone();
        
        ghostModel.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
                child.material.depthWrite = false;
            }
        });

        ghostModel.scale.set(typeInfo.modelScale, typeInfo.modelScale, typeInfo.modelScale);
        ghostModel.visible = false;
        
        this.ghostTower = ghostModel;
        this.scene.add(this.ghostTower);
    }

    hideGhostTower() {
        if (this.ghostTower) {
            this.scene.remove(this.ghostTower);
            this.ghostTower = null;
        }
    }

    updateGhostTower(gridX, gridZ, isValid) {
        if (!this.ghostTower) return;

        this.ghostTower.position.set(gridX * TILE_SIZE, 1, gridZ * TILE_SIZE);
        this.ghostTower.visible = true;

        const color = isValid ? 0x00FF00 : 0xFF0000;
        this.ghostTower.traverse((child) => {
            if (child.isMesh && child.material && child.material.color) {
                child.material.color.setHex(color);
            }
        });
    }

onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        if (this.isMenuOpen && !this.isGameOver) {
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const intersects = this.raycaster.intersectObjects(this.groundTiles);

            if (intersects.length > 0) {
                const hoveredTile = intersects[0].object;
                const gridX = hoveredTile.userData.gridX;
                const gridZ = hoveredTile.userData.gridZ;

                const typeInfo = TOWER_TYPES[this.selectedTowerIndex];
                if (this.ghostTower && this.ghostTower.userData.towerType !== this.selectedTowerIndex) {
                    this.createGhostTower();
                }
                if (this.ghostTower) {
                    this.ghostTower.userData.towerType = this.selectedTowerIndex;
                }

                const tileType = hoveredTile.userData.tileType;
                const existingTower = this.towers.find(t => {
                    const tPos = t.mesh.position;
                    return Math.round(tPos.x / TILE_SIZE) === gridX && Math.round(tPos.z / TILE_SIZE) === gridZ;
                });

                const isValid = (tileType === 1 && !existingTower && this.cash >= typeInfo.cost);
                this.updateGhostTower(gridX, gridZ, isValid);
            } else {
                if (this.ghostTower) this.ghostTower.visible = false;
            }
        } else {
            if (this.ghostTower) this.ghostTower.visible = false;
        }
    }

    hideGrid() {
        if (this.gridHelper) {
            this.gridHelper.visible = false;
        }
    }

    saveGame() {
        const saveData = {
            waveIndex: this.currentWaveIndex,
            cash: this.cash,
            lives: this.lives,
            score: this.score,
            towerStats: this.towerStats,
        };
        
        localStorage.setItem(`td_save_${this.gameMode}`, JSON.stringify(saveData));
        console.log("Game Saved:", this.gameMode);
    }

    loadGameData(mode) {
        const data = localStorage.getItem(`td_save_${mode}`);
        return data ? JSON.parse(data) : null;
    }

    clearSave(mode) {
        localStorage.removeItem(`td_save_${mode}`);
    }

    createEnvironment() {
        const rows = MAP_LAYOUT.length;
        const cols = MAP_LAYOUT[0].length;
        
        const layers = 3; 

        const placeMountain = (x, z, layerIndex) => {
            const mountain = this.resourceManager.getModel('mountain');
            
            mountain.position.set(x * TILE_SIZE, 0, z * TILE_SIZE);

            mountain.position.x += (Math.random() - 0.5) * 0.5 * TILE_SIZE;
            mountain.position.z += (Math.random() - 0.5) * 0.5 * TILE_SIZE;
            
            let minScale, maxScale;
            if (layerIndex === 0) { minScale = 1.0; maxScale = 1.5; }
            else if (layerIndex === 1) { minScale = 2.0; maxScale = 3.0; }
            else { minScale = 4.0; maxScale = 6.0; }

            const scale = 6 + minScale + Math.random() * (maxScale - minScale);
            mountain.scale.set(scale, scale, scale);

            mountain.rotation.y = Math.random() * Math.PI * 2;
            
            mountain.rotation.x = (Math.random() - 0.5) * 0.2;
            mountain.rotation.z = (Math.random() - 0.5) * 0.2;

            this.scene.add(mountain);
        };

        for (let l = 0; l < layers; l++) {
            const dist = 1 + (l * 2); 

            const startX = -dist;
            const endX = cols + dist;
            const startZ = -dist;
            const endZ = rows + dist;

            const step = l === 0 ? 1 : (l === 1 ? 2 : 3);

            for (let x = startX; x < endX; x += step) {
                placeMountain(x, -dist, l);
                placeMountain(x, rows + dist - 1, l);
            }

            for (let z = startZ; z < endZ; z += step) {
                placeMountain(-dist, z, l);
                placeMountain(cols + dist - 1, z, l);
            }
        }
    }

    startGame(mode, loadSave = false) {
        this.gameMode = mode;

        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';

        if (loadSave) {
            const savedData = this.loadGameData(mode);
            if (savedData) {
                this.currentWaveIndex = savedData.waveIndex;
                this.cash = savedData.cash;
                this.lives = savedData.lives;
                this.score = savedData.score;
                this.towerStats = savedData.towerStats;
                console.log("Game Loaded from Wave: " + this.currentWaveIndex);
            }
        } else {
            this.currentWaveIndex = 0;
            this.cash = 200;
            this.lives = 20;
            this.score = 0;
        }

        const autoBtn = document.getElementById('btn-auto-start');
        if (autoBtn) autoBtn.style.display = 'flex';

        const dropdownBtn = document.getElementById('dropdown-toggle');
        if (dropdownBtn) dropdownBtn.style.display = 'block';

        if (!this.isMuted) {
            this.bgMusic.play().catch(error => {
                console.warn("Otomatik oynatma engellendi, kullanıcı etkileşimi bekleniyor.", error);
            });
        }
        
        const waveBtn = document.getElementById('btn-next-wave');
        if (waveBtn) {
            waveBtn.innerText = `START WAVE ${this.currentWaveIndex + 1}`;
            waveBtn.style.display = 'block';
        }

        this.updateTowerSelectionUI();
        this.updateUI();
        this.animate();
    }

    updateEnemies(now, delta) {
        const wave = WAVE_DATA[this.currentWaveIndex];

        if (this.isWaveActive && this.spawnQueue.length > 0) {
            if (now - this.lastSpawnTime > wave.spawnDelay) {
                const typeKey = this.spawnQueue.shift();
                this.spawnEnemy(typeKey);
                this.lastSpawnTime = now;
            }
        }

        if (this.isWaveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
            this.endWave();
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(delta);

            if (enemy.reachedEnd) {
                this.scene.remove(enemy.mesh);
                this.enemies.splice(i, 1);
                this.lives--;
                this.updateUI();
                if (this.lives <= 0) this.endGame();
            }
        }
    }

    startNextWave() {
        if (this.isWaveActive) return;

        let waveData;

        if (this.currentWaveIndex < WAVE_DATA.length) {
            waveData = WAVE_DATA[this.currentWaveIndex];
        } 
        else {
            if (this.gameMode === 'ENDLESS') {
                waveData = this.generateEndlessWave(this.currentWaveIndex);
            } else {
                return;
            }
        }

        this.spawnQueue = [];
        
        for (const [typeKey, count] of Object.entries(waveData.enemies)) {
            for (let i = 0; i < count; i++) {
                this.spawnQueue.push(typeKey);
            }
        }
        
        this.spawnQueue.sort(() => Math.random() - 0.5);

        this.currentWaveData = waveData; 

        this.isWaveActive = true;
        document.getElementById('btn-next-wave').style.display = 'none';
        this.updateUI();
    }

    generateEndlessWave(levelIndex) {
        const endlessLevel = levelIndex - WAVE_DATA.length + 1; 

        const healthMult = 5.0 + (endlessLevel * 0.5); 
        
        const baseCount = 50; 
        const totalEnemies = baseCount + (endlessLevel * 5);

        const delay = Math.max(100, 200 - (endlessLevel * 5));

        const impRatio = Math.min(0.4, 0.2 + (endlessLevel * 0.01));
        const golemRatio = Math.min(0.4, 0.2 + (endlessLevel * 0.01));
        
        const impCount = Math.floor(totalEnemies * impRatio);
        const golemCount = Math.floor(totalEnemies * golemRatio);
        const normalCount = totalEnemies - impCount - golemCount;

        return {
            enemies: {
                normal: normalCount,
                ice_golem: golemCount,
                fire_imp: impCount
            },
            spawnDelay: delay,
            healthMultiplier: healthMult
        };
    }

    endWave() {
        this.isWaveActive = false;
        this.currentWaveIndex++;

        if (this.gameMode === 'STANDARD' && this.currentWaveIndex >= WAVE_DATA.length) {
            this.showEndStats("VICTORY!", "#28a745");
            return;
        }
        
        const btn = document.getElementById('btn-next-wave');
        
        if (this.isAutoStart) {
            if (btn) btn.style.display = 'none';
            setTimeout(() => {
                if (!this.isGameOver) this.startNextWave();
            }, 2000); 
        } else {
            if (btn) {
                btn.innerText = `START WAVE ${this.currentWaveIndex + 1}`;
                btn.style.display = 'block';
            }
        }
        
        this.cash += 70;
        this.updateUI();
        this.saveGame();
    }

    onKeyDown(e) {
        if (this.isGameOver) return;
        const key = e.key.toLowerCase();

        if (this.pendingDeleteTower) {
            if (key === ' ') this.confirmDelete();
            if (key === 'escape') this.cancelDelete();
            return;
        }

        this.keys[key] = true;
        
        if (key === 'b') this.toggleBuildMenu();
        
        if (key === ' ') {
            this.handleSpaceSellTower();
        }

        if (key === 'r') {
            if (this.rotateAxis === 'x') this.rotateAxis = 'y';
            else if (this.rotateAxis === 'y') this.rotateAxis = 'z';
            else this.rotateAxis = 'x';
            console.log("Rotation Axis:", this.rotateAxis);
            this.updateUI();
        }

        if (key === 'p') {
            this.shaderManager.toggleShaders();
        }

        if (key === 'h') {
            this.toggleHelp();
            return;
        }

        if (e.key.toLowerCase() === 'm') {
            if (this.gameState === "PLAYING") {
                this.startTransitionToCredits();
            } else if (this.gameState === "CREDITS") {
                this.startTransitionToGame();
            }
        }
    }

    onMouseClick(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'DIV' && e.target.id.includes('btn')) {
            return;
        }
        
        if (this.isGameOver || !this.isMenuOpen) return;

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.groundTiles);
        
        if (intersects.length > 0) {
            const clickedTile = intersects[0].object;
            const gridX = clickedTile.userData.gridX;
            const gridZ = clickedTile.userData.gridZ;
            
            this.attemptBuild(gridX, gridZ);
        }
    }

    handleSpaceSellTower() {
        const pos = this.player.getGridPosition();
        
        const existingTower = this.towers.find(t => {
            const tPos = t.mesh.position;
            return Math.round(tPos.x / TILE_SIZE) === pos.x && Math.round(tPos.z / TILE_SIZE) === pos.z;
        });

        if (existingTower) {
            this.pendingDeleteTower = existingTower;
            document.getElementById('delete-overlay').style.display = 'block';
        }
    }

    handleSpaceInteraction() {
        const pos = this.player.getGridPosition();
        
        const existingTower = this.towers.find(t => {
            const tPos = t.mesh.position;
            return Math.round(tPos.x / TILE_SIZE) === pos.x && Math.round(tPos.z / TILE_SIZE) === pos.z;
        });

        if (existingTower) {
            this.pendingDeleteTower = existingTower;
            document.getElementById('delete-overlay').style.display = 'block';
        } else {
            this.attemptBuild(pos.x, pos.z);
        }
    }

    attemptBuild(gridX, gridZ) {
        if (gridZ < 0 || gridZ >= MAP_LAYOUT.length || gridX < 0 || gridX >= MAP_LAYOUT[0].length) return;
        if (MAP_LAYOUT[gridZ][gridX] !== 1) {
            console.log("Buraya inşa edilemez!");
            return;
        }

        const existingTower = this.towers.find(t => {
            const tPos = t.mesh.position;
            return Math.round(tPos.x / TILE_SIZE) === gridX && Math.round(tPos.z / TILE_SIZE) === gridZ;
        });

        if (existingTower) {
            return;
        }

        const typeInfo = TOWER_TYPES[this.selectedTowerIndex];
        
        if (this.cash >= typeInfo.cost) {
            this.cash -= typeInfo.cost;
            const tower = new Building(this.scene, this.resourceManager, typeInfo.modelScale, typeInfo, gridX, gridZ);
            this.towers.push(tower);
            this.towerStats[typeInfo.name]++;
            this.updateUI();
        } else {
            console.log("Yetersiz para!");
        }
    }

    confirmDelete() {
        if (this.pendingDeleteTower) {
            const refund = Math.floor(this.pendingDeleteTower.stats.cost / 2);
            this.cash += refund;
            
            this.pendingDeleteTower.dispose();
            this.towers = this.towers.filter(t => t !== this.pendingDeleteTower);
            
            this.updateUI();
        }
        this.cancelDelete();
    }

    cancelDelete() {
        this.pendingDeleteTower = null;
        document.getElementById('delete-overlay').style.display = 'none';
    }

    startTransitionToCredits() {
        this.gameState = "TRANSITION";
        this.isPaused = true;
        this.transitionProgress = 0;
        
        this.startCamPos.copy(this.camera.position);
        this.startTarget.copy(this.controls.target);
        
        this.endCamPos.copy(this.creditsCameraPos);
        this.endTarget.copy(this.creditsTarget);
        
        this.targetState = "CREDITS";   
    }

    startTransitionToGame() {
        this.gameState = "TRANSITION";
        this.transitionProgress = 0;
        
        this.startCamPos.copy(this.camera.position);
        this.startTarget.copy(this.controls.target);
        
        this.endTarget.copy(this.player.mesh.position);
        
        this.endCamPos.copy(this.player.mesh.position).add(new THREE.Vector3(0, 10, 10));
        
        this.targetState = "PLAYING";
    }

    toggleHelp() {
        if (this.gameState !== "PLAYING" && this.gameState !== "HELP") return;

        const el = document.getElementById('help-overlay');
        
        if (this.gameState === "HELP") {
            el.style.display = 'none';
            this.gameState = "PLAYING";
            this.isPaused = false;
        } else {
            el.style.display = 'flex';
            this.gameState = "HELP";
            this.isPaused = true;
        }
    }

    createLevel() {
        const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.5, TILE_SIZE);
        const matBuildable = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const matPath = new THREE.MeshStandardMaterial({ color: 0xC2B280 });
        const matGoal = new THREE.MeshStandardMaterial({ color: 0xFF0000 });

        for(let row = 0; row < MAP_LAYOUT.length; row++) {
            for(let col = 0; col < MAP_LAYOUT[row].length; col++) {
                let type = MAP_LAYOUT[row][col];
                let material = type === 1 ? matBuildable : (type === 2 ? matGoal : matPath);
                const tile = new THREE.Mesh(geometry, material);
                this.shaderManager.applyCustomMaterial(tile);
                tile.position.set(col * TILE_SIZE, 0, row * TILE_SIZE);
                tile.receiveShadow = true;
                tile.userData.gridX = col;
                tile.userData.gridZ = row;
                tile.userData.tileType = type;
                this.scene.add(tile);
                this.groundTiles.push(tile);
            }
        }

        const testObjects = [
            { x: 2, y: 1, z: 10, typeIndex: 0 },
            { x: 3, y: 1, z: 10, typeIndex: 1 },
            { x: 4, y: 1, z: 10, typeIndex: 2 },
            { x: 5, y: 1, z: 10, typeIndex: 3 }
        ];

        testObjects.forEach(obj => {
            const typeDef = INTERACTABLE_TYPES[obj.typeIndex];
            const interactable = new Interactable(this.scene, this.resourceManager, typeDef, obj.x, obj.y, obj.z);
            this.interactables.push(interactable);
        });
    }

    createCreditsArea() {
        const cx = 100;
        const cz = 0;
        const scale = 8;

        const credits = this.resourceManager.getModel('credits');
        credits.position.set(cx-10, 0, cz-2);
        credits.scale.set(scale, scale, scale);

        this.scene.add(credits);
        
        this.creditsTarget = new THREE.Vector3(cx, 0, cz);
        
        this.creditsCameraPos = new THREE.Vector3(cx, 20, cz);
    }

    spawnEnemy(typeKey) {
        const baseStats = ENEMY_TYPES.find(e => e.type === typeKey);

        if (baseStats) {
            const currentWave = this.currentWaveData || WAVE_DATA[this.currentWaveIndex];
            const multiplier = currentWave.healthMultiplier || 1;

            const finalStats = {
                ...baseStats,
                hp: baseStats.hp * multiplier
            };

            const enemy = new Enemy(this.scene, finalStats, this.dangerPoints);
            this.enemies.push(enemy);
        }
    }

    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        const now = Date.now();

        if (this.heldObject) {
            const playerPos = this.player.mesh.position;
            const playerRot = this.player.mesh.rotation.y;
            
            const cameraDir = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDir);
            
            const offsetX = Math.sin(playerRot) * this.holdDistance;
            const offsetZ = Math.cos(playerRot) * this.holdDistance;
            
            const verticalOffset = cameraDir.y * 3.0; 

            const targetPos = new THREE.Vector3(
                playerPos.x + offsetX,
                playerPos.y + 5 + verticalOffset,
                playerPos.z + offsetZ
            );
            
            this.heldObject.mesh.position.lerp(targetPos, 0.2);

            if (this.keys['q']) this.heldObject.rotate(this.rotateAxis, -this.rotateSpeed);
            if (this.keys['e']) this.heldObject.rotate(this.rotateAxis, this.rotateSpeed);
        }

        if (this.spotlightInteractable) {
            const mesh = this.spotlightInteractable.mesh;
            
            const sourcePos = mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
            
            const localDir = new THREE.Vector3(0, -1, 0).normalize();
            
            const worldDir = localDir.applyQuaternion(mesh.quaternion).normalize();
            
            this.shaderManager.updateSpotLight(sourcePos, worldDir);
        }

        if (this.gameState === "TRANSITION") {
            this.transitionProgress += delta / this.transitionDuration;
            
            if (this.transitionProgress >= 1) {
                this.transitionProgress = 1;
                this.gameState = this.targetState;
                
                if (this.gameState === "PLAYING") {
                    this.isPaused = false;
                    this.controls.enabled = true;
                    this.controls.target.copy(this.endTarget);
                    this.shaderManager.update(now);
                } else {
                    this.controls.enabled = false;
                }
            }

            const t = this.transitionProgress;

            this.controls.target.lerpVectors(this.startTarget, this.endTarget, t);

            const risePhase = 0.20;
            const travelPhase = 0.80;

            const currentPos = new THREE.Vector3();

            if (t < risePhase) {
                const phaseT = t / risePhase;
                
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                currentPos.copy(this.startCamPos);
                currentPos.y = THREE.MathUtils.lerp(this.startCamPos.y, this.cruiseHeight, smoothT);
            } 
            else if (t < travelPhase) {
                const phaseT = (t - risePhase) / (travelPhase - risePhase);
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                currentPos.x = THREE.MathUtils.lerp(this.startCamPos.x, this.endCamPos.x, smoothT);
                currentPos.z = THREE.MathUtils.lerp(this.startCamPos.z, this.endCamPos.z, smoothT);
                currentPos.y = this.cruiseHeight;
            } 
            else {
                const phaseT = (t - travelPhase) / (1 - travelPhase);
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                currentPos.copy(this.endCamPos);
                currentPos.y = THREE.MathUtils.lerp(this.cruiseHeight, this.endCamPos.y, smoothT);
            }

            this.camera.position.copy(currentPos);
            
            this.controls.update(); 

            if (this.shaderManager) {
                this.shaderManager.update(now); 
            }
            
            this.renderer.render(this.scene, this.camera);
            return;
        }
        if (this.gameState === "CREDITS") {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if(!this.isPaused){
            const oldPlayerPos = this.player.mesh.position.clone();

            this.player.update(this.keys, this.camera);

            const newPlayerPos = this.player.mesh.position;
            const deltaX = newPlayerPos.x - oldPlayerPos.x;
            const deltaZ = newPlayerPos.z - oldPlayerPos.z;

            this.camera.position.x += deltaX;
            this.camera.position.z += deltaZ;

            this.controls.target.copy(newPlayerPos);
            
            this.controls.update();

            if (this.isWaveActive) {
                const waveData = WAVE_DATA[this.currentWaveIndex];

                if (this.spawnQueue.length > 0) {
                    if (now - this.lastSpawnTime > waveData.spawnDelay) {
                        
                        const enemyType = this.spawnQueue.shift(); 
                        this.spawnEnemy(enemyType);
                        
                        this.lastSpawnTime = now;
                    }
                } 
                else if (this.enemies.length === 0) {
                    this.endWave();
                }
            }

            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                enemy.update();
                
                if (enemy.reachedGoal) {
                    this.lives--;
                    enemy.dispose();
                    this.enemies.splice(i, 1);
                    this.updateUI();
                    if (this.lives <= 0) this.endGame();
                } else if (enemy.isDead) {
                    this.score += 20;
                    this.cash += 15;
                    enemy.dispose();
                    this.enemies.splice(i, 1);
                    this.updateUI();
                }
            }

            this.towers.forEach(tower => {
                tower.update(this.enemies, now, delta, (pos, dir, stats) => {
                    this.projectiles.push(new Projectile(this.scene, pos, dir, stats));
                });
            });

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const proj = this.projectiles[i];
                proj.update(this.enemies);
                if (proj.shouldRemove) {
                    proj.dispose();
                    this.projectiles.splice(i, 1);
                }
            }
        }

        this.shaderManager.update(now);
        this.renderer.render(this.scene, this.camera);
    }

    endGame() {
        if (this.isGameOver) return;

        this.isGameOver = true;
        this.showEndStats("GAME OVER", "#DC3545");
    }

    showEndStats(title, color) {
        const screen = document.getElementById('end-screen');
        const autoBtn = document.getElementById('btn-auto-start');
        const waveBtn = document.getElementById('btn-next-wave');
        
        if (autoBtn) autoBtn.style.display = 'none';
        if (waveBtn) waveBtn.style.display = 'none';

        let statsHTML = `
            <h1 style="font-size: 60px; margin-bottom: 20px; color: ${color}; text-shadow: 2px 2px 0 #000;">${title}</h1>
            
            <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; min-width: 400px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:22px;">
                    <span>Total Score:</span> <span style="color:#FFD700">${this.score}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:22px;">
                    <span>Waves Survived:</span> <span>${this.currentWaveIndex} / ${WAVE_DATA.length}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:22px;">
                    <span>Remaining Lives:</span> <span style="color:#FF6666">${this.lives}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:22px;">
                    <span>Remaining Cash:</span> <span style="color:#85bb65">$${this.cash}</span>
                </div>
                
                <hr style="border:0; border-top:1px solid #555; margin: 20px 0;">
                <h3 style="text-align:center; margin-bottom:15px;">Towers Built</h3>
        `;

        for (const [name, count] of Object.entries(this.towerStats)) {
            statsHTML += `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:18px; color:#aaa;">
                    <span>${name}:</span> <span>${count}</span>
                </div>
            `;
        }

        statsHTML += `
            </div>
            
            <button id="btn-return-menu" style="
                margin-top: 30px; 
                padding: 15px 40px; 
                font-size: 20px; 
                cursor: pointer; 
                background: #fff; 
                border: none; 
                border-radius: 5px; 
                font-weight: bold;
                transition: 0.2s;
            ">RETURN TO MAIN MENU</button>
        `;

        screen.innerHTML = statsHTML;
        screen.style.display = 'flex';

        document.getElementById('btn-return-menu').onclick = () => {
            window.location.reload();
        };
    }

    updateUI() {
        const board = document.getElementById('score-board');
        if(board) {
            const displayWave = Math.min(this.currentWaveIndex + 1, WAVE_DATA.length);
            
            board.innerHTML = `
                Wave: <span style="color:#FFD700">${displayWave} / ${WAVE_DATA.length}</span> | 
                Lives: ${this.lives} | 
                Score: ${this.score} | 
                Cash: $${this.cash}
            `;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}