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
        // State
        this.lives = 20;
        this.score = 0;
        this.cash = 1000;
        this.isGameOver = false;
        this.keys = { w: false, a: false, s: false, d: false };
        this.lastSpawnTime = 0;
        this.selectedTowerIndex = 0;
        this.resourceManager = new ResourceManager();
        this.clock = new THREE.Clock();

        this.currentWaveIndex = 0;      // Kaçıncı dalgadayız?
        this.isWaveActive = false;      // Şu an savaş var mı?
        this.spawnQueue = [];           // Doğmayı bekleyen düşman listesi
        this.lastSpawnTime = 0;         // En son ne zaman düşman doğdu?
        
        // Entities Lists
        this.enemies = [];
        this.towers = [];
        this.projectiles = [];
        this.interactables = [];

        this.scene = new THREE.Scene();
        this.shaderManager = new ShaderManager(this.scene);
        this.resourceManager = new ResourceManager(this.shaderManager);

        // --- CAMERA STATE ---
        this.gameState = "PLAYING"; // "PLAYING", "TRANSITION", "CREDITS"
        this.isPaused = false;      // Oyunu durdurmak için
        
        // Geçiş Değişkenleri
        this.transitionProgress = 0;
        this.transitionDuration = 2.0; // 2 saniye sürsün
        this.cruiseHeight = 40;
        this.startCamPos = new THREE.Vector3();
        this.startTarget = new THREE.Vector3();
        this.endCamPos = new THREE.Vector3();
        this.endTarget = new THREE.Vector3();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.heldObject = null;       // Currently held Interactable
        this.holdDistance = 5;        // How far in front of camera to hold
        this.rotateAxis = 'y';        // Current rotation axis ('x', 'y', 'z')
        this.rotateSpeed = 0.05;
        this.pickupRadius = 1.5;      // Physics radius for detection (optional visual aid)

        this.init();
    }

    async init() {

        this.injectUI();
    
        // 1. Loading Ekranını Göster (Basit bir text)
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-screen';
        loadingDiv.style = "position:absolute; top:0; left:0; width:100%; height:100%; background:#000; color:#fff; display:flex; justify-content:center; align-items:center; z-index:999; font-size:30px;";
        loadingDiv.innerText = "LOADING ASSETS...";
        document.body.appendChild(loadingDiv);

        // 2. Modelleri Yükle
        try {
            await this.resourceManager.loadAll(MODEL_PATHS);
            // Yükleme bitince Loading ekranını kaldır
            document.body.removeChild(loadingDiv);
        } catch (err) {
            loadingDiv.innerText = "ERROR LOADING ASSETS";
            console.error(err);
            return; // Hata varsa oyunu başlatma
        }

        // Scene Setup
        this.scene.background = new THREE.Color(0x222222);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(10, 8, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.controls.mouseButtons = {
            LEFT: null,                 // Sol tık: Kameraya etki etmesin (Kule dikmek için serbest kalsın)
            MIDDLE: THREE.MOUSE.DOLLY,  // Orta tık: Yakınlaşma/Uzaklaşma (Tekerlek de çalışır)
            RIGHT: THREE.MOUSE.ROTATE   // Sağ tık: Döndürme (Orbit)
        };
        
        this.controls.enableZoom = true; // Zoom'a izin ver
        this.controls.minDistance = 5;   // En fazla ne kadar yaklaşabilir
        this.controls.maxDistance = 30;  // En fazla ne kadar uzaklaşabilir
        this.controls.maxPolarAngle = Math.PI / 2.5; // Yerin altına girmeyi engelle

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const textureLoader = new THREE.TextureLoader();
        const skyTexture = textureLoader.load('/assets/skybox.jpg'); // Make sure you have this file!
        skyTexture.mapping = THREE.EquirectangularReflectionMapping;
        skyTexture.colorSpace = THREE.SRGBColorSpace; // Ensure colors look correct
        this.scene.background = skyTexture;
        this.scene.environment = skyTexture;

        // World Generation
        this.createLevel();
        this.createCreditsArea();

        // Entities
        this.player = new Player(this.scene, this.resourceManager);

        this.spotlightInteractable = this.interactables.find(i => i.type === 'Spotlight');
        
        if (this.spotlightInteractable) {
            // Optional: Visual bulb
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.2), 
                new THREE.MeshBasicMaterial({color: 0xffaa00})
            );
            bulb.position.y = 1.0;
            this.spotlightInteractable.mesh.add(bulb);
        }

        // Events
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));

        this.updateUI();

    }

    onMouseMove(event) {
        // Normalize mouse position (-1 to +1)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onMouseDown(event) {
        if (this.gameState !== "PLAYING" || this.isPaused) return;

        if (event.button === 0) { // Left Click
            if (this.heldObject) {
                // Drop Object
                console.log("Dropped:", this.heldObject.type);
                this.heldObject = null;
            } else {
                // Try Pickup
                this.attemptPickup();
            }
        }
    }

    attemptPickup() {
        // 1. Update Raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 2. Get meshes of all interactables
        // Note: interactables array contains classes, we need their meshes
        // Some interactables might be Groups (GLTF), so we raycast against the group or children
        const interactableMeshes = this.interactables.map(i => i.mesh);

        // 3. Intersect
        const intersects = this.raycaster.intersectObjects(interactableMeshes, true); // true = recursive

        if (intersects.length > 0) {
            // Find the first hit that belongs to an Interactable
            const hit = intersects[0];
            
            // Check distance (don't pick up things across the map)
            if (hit.distance > 15) return;

            // Traverse up to find the object with userData.parentInteractable
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
        // --- 0. START SCREEN (BAŞLANGIÇ MENÜSÜ) ---
        const startScreen = document.createElement('div');
        startScreen.id = 'start-screen';
        // Arkaplan görseli için 'background-image' kısmına kendi görselinin yolunu koyabilirsin.
        startScreen.style = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #111;
            background-image: url('https://via.placeholder.com/1920x1080/222/fff?text=Tower+Defense+BG'); 
            background-size: cover; background-position: center;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            z-index: 200; font-family: sans-serif;
        `;

        startScreen.innerHTML = `
            <h1 style="font-size: 80px; color: #FFD700; text-shadow: 4px 4px 0 #000; margin-bottom: 10px;">TOWER DEFENSE??</h1>
            <p style="color: white; font-size: 20px; margin-bottom: 40px; text-shadow: 1px 1px 0 #000;">Build, defend, survive!(Daha yaratıcı fikri olan değiştirebilir)</p>
            <button id="btn-start-game" style="
                padding: 20px 60px; font-size: 30px; font-weight: bold; cursor: pointer;
                background: #28a745; color: white; border: none; border-radius: 10px;
                box-shadow: 0 5px 0 #1e7e34; transition: transform 0.1s;">
                PLAY GAME
            </button>
        `;
        document.body.appendChild(startScreen);

        // Başlat Butonu Olayı
        const startBtn = document.getElementById('btn-start-game');
        startBtn.onclick = () => {
            // Butona basınca animasyon efekti
            startBtn.style.transform = "scale(0.95)";
            setTimeout(() => {
                this.startGame(); // Oyunu başlatan fonksiyonu çağır
            }, 100);
        };


        // --- 1. Tower Selection Bar (Başlangıçta GİZLİ) ---
        const bar = document.createElement('div');
        bar.id = 'tower-bar'; // ID ekledik ki kolayca açıp kapatabilelim
        bar.style = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: none; gap: 10px; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; z-index: 10;";
        
        TOWER_TYPES.forEach((type, index) => {
            const btn = document.createElement('div');
            btn.innerHTML = `<b>${type.name}</b><br>$${type.cost}`;
            btn.style = "color: white; background: #444; padding: 10px; cursor: pointer; border: 2px solid transparent; text-align: center; font-family: sans-serif; font-size: 12px; min-width: 60px; user-select: none;";
            btn.id = `btn-tower-${index}`;
            btn.onclick = () => {
                this.selectedTowerIndex = index;
                this.updateTowerSelectionUI();
            };
            bar.appendChild(btn);
        });
        document.body.appendChild(bar);
        
        // --- 2. Delete Overlay (Aynen Kalıyor) ---
        const delOverlay = document.createElement('div');
        delOverlay.id = "delete-overlay";
        delOverlay.style = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; text-align: center; display: none; font-family: sans-serif; border-radius: 10px; z-index: 20;";
        delOverlay.innerHTML = "<h3>Sell Tower?</h3><p>Refund: 50%</p><button id='btn-confirm-del' style='padding:5px 10px; margin-right:10px; cursor:pointer;'>CONFIRM (Space)</button> <button id='btn-cancel-del' style='padding:5px 10px; cursor:pointer;'>CANCEL (Esc)</button>";
        document.body.appendChild(delOverlay);
        document.getElementById('btn-confirm-del').onclick = () => this.confirmDelete();
        document.getElementById('btn-cancel-del').onclick = () => this.cancelDelete();

        // --- 3. Score Board (Başlangıçta GİZLİ) ---
        if (!document.getElementById('score-board')) {
            const sb = document.createElement('div');
            sb.id = 'score-board';
            sb.style = "position: absolute; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.5); padding: 10px; font-family: sans-serif; user-select: none; display: none;";
            document.body.appendChild(sb);
        }

        // --- 4. Game Over Screen (Aynen Kalıyor) ---
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

        // --- NEXT WAVE BUTTON ---
        const waveBtn = document.createElement('button');
        waveBtn.id = 'btn-next-wave';
        waveBtn.innerText = 'START WAVE 1'; // İlk başta 1. dalga yazar
        waveBtn.style = `
            position: absolute; bottom: 20px; right: 20px;
            padding: 15px 30px; font-size: 20px; font-weight: bold;
            background: #ffc107; border: none; border-radius: 5px;
            cursor: pointer; z-index: 10; box-shadow: 0 4px #e0a800;
            font-family: sans-serif; color: #000;
        `;
        
        // Butona basınca dalgayı başlat
        waveBtn.onclick = () => this.startNextWave();
        
        // Eğer oyun en başta "Start Game" ile başlıyorsa bu buton gizli başlayabilir, 
        // startGame() içinde görünür yapabilirsin. Şimdilik görünür ekliyoruz.
        document.body.appendChild(waveBtn);

        // --- 5. HELP OVERLAY (YARDIM MENÜSÜ) ---
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

        // İçerik (Tuşlar ve açıklamalar)
        helpOverlay.innerHTML = `
            <h2 style="font-size: 40px; color: #FFD700; margin-bottom: 30px; border-bottom: 2px solid #FFD700; padding-bottom: 10px;">CONTROLS & HELP</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; font-size: 20px;">
                <div style="font-weight: bold; color: #aaa;">W, A, S, D</div>
                <div>Move Character</div>

                <div style="font-weight: bold; color: #aaa;">SPACE</div>
                <div>Build / Sell Tower</div>

                <div style="font-weight: bold; color: #aaa;">Mouse Left</div>
                <div>Select Tower Type / Pick Up Toy</div>
                
                <div style="font-weight: bold; color: #aaa;">Mouse Right</div>
                <div>Rotate Camera</div>

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

            <p style="margin-top: 40px; font-style: italic; color: #888;">Press 'H' to Resume Game</p>
        `;

        document.body.appendChild(helpOverlay);
    }

    updateTowerSelectionUI() {
        // Tüm butonların kenarlığını temizle
        document.querySelectorAll('[id^="btn-tower-"]').forEach(b => b.style.borderColor = "transparent");
        // Seçili olanı yeşil yap
        const activeBtn = document.getElementById(`btn-tower-${this.selectedTowerIndex}`);
        if(activeBtn) activeBtn.style.borderColor = "#00FF00";
    }

    startGame() {
        // 1. Menüyü gizle
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';

        // 2. Oyun UI elemanlarını görünür yap
        const towerBar = document.getElementById('tower-bar');
        const scoreBoard = document.getElementById('score-board');
        
        if (towerBar) towerBar.style.display = 'flex';
        if (scoreBoard) scoreBoard.style.display = 'block';

        // 3. Oyun döngüsünü başlat
        this.updateTowerSelectionUI(); // Seçimi görselleştir
        this.updateUI(); // Puanı yazdır
        this.animate(); // Sonsuz döngü başlasın!
    }

    updateEnemies(now, delta) {
        const wave = WAVE_DATA[this.currentWaveIndex];

        // Kuyrukta düşman varsa ve süre geldiyse doğur
        if (this.isWaveActive && this.spawnQueue.length > 0) {
            if (now - this.lastSpawnTime > wave.spawnDelay) {
                const typeKey = this.spawnQueue.shift(); // En öndeki düşmanı al
                this.spawnEnemy(typeKey);
                this.lastSpawnTime = now;
            }
        }

        // Dalga bitti mi? (Kuyruk boş ve sahnede düşman kalmadı)
        if (this.isWaveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
            this.endWave();
        }

        // Mevcut düşmanları hareket ettir
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
        // Eğer dalga zaten sürüyorsa veya tüm dalgalar bittiyse işlem yapma
        if (this.isWaveActive || this.currentWaveIndex >= WAVE_DATA.length) return;

        const waveData = WAVE_DATA[this.currentWaveIndex];
        this.spawnQueue = [];

        // 1. Düşmanları listeye doldur
        // Örn: { normal: 2, ice_golem: 1 } => ['normal', 'normal', 'ice_golem']
        for (const [typeKey, count] of Object.entries(waveData.enemies)) {
            for (let i = 0; i < count; i++) {
                this.spawnQueue.push(typeKey);
            }
        }

        // 2. Listeyi Karıştır (Shuffle) - Rastgele gelmeleri için
        this.spawnQueue.sort(() => Math.random() - 0.5);

        // 3. Dalgayı Aktif Et
        this.isWaveActive = true;
        
        // 4. Butonu Gizle
        const btn = document.getElementById('btn-next-wave');
        if (btn) btn.style.display = 'none';
    }

    endWave() {
        this.isWaveActive = false;
        this.currentWaveIndex++; // Bir sonraki dalgaya geç

        const btn = document.getElementById('btn-next-wave');
        if (btn) {
            // Oyun bitti mi kontrolü
            if (this.currentWaveIndex >= WAVE_DATA.length) {
                btn.innerText = "VICTORY! (Restart)";
                btn.onclick = () => window.location.reload();
                btn.style.background = "#28a745"; // Yeşil renk
            } else {
                btn.innerText = `START WAVE ${this.currentWaveIndex + 1}`;
            }
            btn.style.display = 'block'; // Butonu tekrar göster
        }
        
        // İstersen dalga bitince oyuncuya bonus para ver
        this.cash += 100;
        this.updateUI();
    }

    onKeyDown(e) {
        if (this.isGameOver) return;
        const key = e.key.toLowerCase();

        // Eğer silme penceresi açıksan Space onayla, Esc iptal et
        if (this.pendingDeleteTower) {
            if (key === ' ') this.confirmDelete();
            if (key === 'escape') this.cancelDelete();
            return;
        }

        this.keys[key] = true;
        
        // Normal oyun akışında Space'e basılırsa
        if (key === ' ') {
            this.handleSpaceInteraction();
        }

        if (key === 'p') {
            this.shaderManager.toggleShaders();
        }

        if (key === 'r') {
            if (this.rotateAxis === 'x') this.rotateAxis = 'y';
            else if (this.rotateAxis === 'y') this.rotateAxis = 'z';
            else this.rotateAxis = 'x';
            console.log("Rotation Axis:", this.rotateAxis);
            this.updateUI(); // Optional: display current axis
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

    handleSpaceInteraction() {
        const pos = this.player.getGridPosition();
        
        // Oyuncunun durduğu yerde kule var mı?
        const existingTower = this.towers.find(t => {
            const tPos = t.mesh.position;
            return Math.round(tPos.x / TILE_SIZE) === pos.x && Math.round(tPos.z / TILE_SIZE) === pos.z;
        });

        if (existingTower) {
            // VARSA: Silme onayı başlat
            this.pendingDeleteTower = existingTower;
            document.getElementById('delete-overlay').style.display = 'block';
        } else {
            // YOKSA: İnşa etmeyi dene
            this.attemptBuild(pos.x, pos.z);
        }
    }

    attemptBuild(gridX, gridZ) {
        // Harita sınırları ve zemin kontrolü
        if (gridZ < 0 || gridZ >= MAP_LAYOUT.length || gridX < 0 || gridX >= MAP_LAYOUT[0].length) return;
        if (MAP_LAYOUT[gridZ][gridX] !== 1) {
            console.log("Buraya inşa edilemez!");
            return;
        }

        const typeInfo = TOWER_TYPES[this.selectedTowerIndex];
        
        if (this.cash >= typeInfo.cost) {
            this.cash -= typeInfo.cost;
            // Modüler yapıda Building sınıfını kullanıyoruz
            const tower = new Building(this.scene, this.resourceManager, typeInfo.modelScale, typeInfo, gridX, gridZ);
            this.towers.push(tower);
            this.updateUI();
        } else {
            console.log("Yetersiz para!");
        }
    }

    confirmDelete() {
        if (this.pendingDeleteTower) {
            const refund = Math.floor(this.pendingDeleteTower.stats.cost / 2);
            this.cash += refund;
            
            // Kuleyi sahneden ve diziden sil
            this.pendingDeleteTower.dispose();
            this.towers = this.towers.filter(t => t !== this.pendingDeleteTower);
            
            this.updateUI();
        }
        this.cancelDelete(); // Pencereyi kapat
    }

    cancelDelete() {
        this.pendingDeleteTower = null;
        document.getElementById('delete-overlay').style.display = 'none';
    }

    startTransitionToCredits() {
        this.gameState = "TRANSITION";
        this.isPaused = true;
        this.transitionProgress = 0;
        
        // Nereden başlıyoruz?
        this.startCamPos.copy(this.camera.position);
        this.startTarget.copy(this.controls.target);
        
        // Nereye gidiyoruz?
        this.endCamPos.copy(this.creditsCameraPos);
        this.endTarget.copy(this.creditsTarget);
        
        this.targetState = "CREDITS";   
    }

    startTransitionToGame() {
        this.gameState = "TRANSITION";
        this.transitionProgress = 0;
        
        // Credits'ten geri dönüyoruz
        this.startCamPos.copy(this.camera.position);
        this.startTarget.copy(this.controls.target);
        
        // Oyuncuya geri dön
        // Oyuncunun pozisyonunu hedefle
        this.endTarget.copy(this.player.mesh.position);
        
        // Kamera oyuncunun arkasında klasik açısına dönsün
        // Mevcut açıdan sapmaması için şöyle hesaplayabiliriz:
        // (Veya sabit bir ofset verebilirsin: player + (0, 10, 10))
        this.endCamPos.copy(this.player.mesh.position).add(new THREE.Vector3(0, 10, 10));
        
        this.targetState = "PLAYING";
    }

    toggleHelp() {
        // Eğer oyun zaten "TRANSITION" veya "CREDITS" modundaysa yardım açılmasın
        if (this.gameState !== "PLAYING" && this.gameState !== "HELP") return;

        const el = document.getElementById('help-overlay');
        
        // Şu anki duruma göre tersini yap
        if (this.gameState === "HELP") {
            // Kapat ve Oyuna Dön
            el.style.display = 'none';
            this.gameState = "PLAYING";
            this.isPaused = false;
        } else {
            // Aç ve Oyunu Durdur
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
                this.scene.add(tile);
            }
        }

        const testObjects = [
            { x: 2, y: 1, z: 10, typeIndex: 0 },
            { x: 3, y: 1, z: 10, typeIndex: 1 },
            { x: 4, y: 1, z: 10, typeIndex: 2 },
            { x: 5, y: 1, z: 10, typeIndex: 3 } // [NEW] Spawn the Spotlight object
        ];

        testObjects.forEach(obj => {
            const typeDef = INTERACTABLE_TYPES[obj.typeIndex];
            const interactable = new Interactable(this.scene, this.resourceManager, typeDef, obj.x, obj.y, obj.z);
            this.interactables.push(interactable);
        });
    }

    createCreditsArea() {
        // Uzak bir konum
        const cx = 100;
        const cz = 0;
        const scale = 8;

        const credits = this.resourceManager.getModel('credits');
        credits.position.set(cx-10, 0, cz-2);
        credits.scale.set(scale, scale, scale);
        // credits.rotation.y = ;

        this.scene.add(credits);
        
        // Hedef (Kameranın bakacağı nokta)
        this.creditsTarget = new THREE.Vector3(cx, 0, cz);
        
        // Kamera Pozisyonu (Tam tepeden bakması için X ve Z hedefle aynı, Y yüksek)
        this.creditsCameraPos = new THREE.Vector3(cx, 20, cz);
    }

    spawnEnemy(typeKey) {
        // String olarak gelen key'i (örn: "ice_golem"), ENEMY_TYPES dizisinde arayıp buluyoruz
        const typeDef = ENEMY_TYPES.find(e => e.type === typeKey);

        if (typeDef) {
            // Enemy sınıfına direkt bulduğumuz objeyi gönderiyoruz (Senin Enemy.js yapına uygun)
            const enemy = new Enemy(this.scene, typeDef);
            this.enemies.push(enemy);
        }
    }

    // --- Loop ---
    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta(); // Three.Clock kullanıyorsan
        const now = Date.now();

// --- HELD OBJECT LOGIC ---
        if (this.heldObject) {
            const playerPos = this.player.mesh.position;
            const playerRot = this.player.mesh.rotation.y;
            
            // [NEW] Get Camera Pitch
            const cameraDir = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDir);
            
            // Calculate offsets
            const offsetX = Math.sin(playerRot) * this.holdDistance;
            const offsetZ = Math.cos(playerRot) * this.holdDistance;
            
            // [NEW] Apply vertical movement based on looking up/down
            // cameraDir.y is ~1 when looking up, ~-1 when looking down
            const verticalOffset = cameraDir.y * 3.0; 

            const targetPos = new THREE.Vector3(
                playerPos.x + offsetX,
                playerPos.y + 5 + verticalOffset, // Base height + Camera pitch
                playerPos.z + offsetZ
            );
            
            this.heldObject.mesh.position.lerp(targetPos, 0.2);

            // Rotation Logic (Q/E)
            if (this.keys['q']) this.heldObject.rotate(this.rotateAxis, -this.rotateSpeed);
            if (this.keys['e']) this.heldObject.rotate(this.rotateAxis, this.rotateSpeed);
        }

        if (this.spotlightInteractable) {
            const mesh = this.spotlightInteractable.mesh;
            
            // [FIX 1] Offset the light source UP so it's not inside the floor.
            // (Assumes the mesh pivot is at the bottom/feet)
            const sourcePos = mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
            
            // [FIX 2] Use a "Forward-Down" vector. 
            // (0, 0, 1) is straight forward (invisible on flat ground).
            // (0, -1, 0) is straight down (doesn't rotate with Q/E properly).
            // (0, -1, 1) points 45 degrees down-forward, perfect for a spotlight.
            const localDir = new THREE.Vector3(0, -1, 0).normalize();
            
            const worldDir = localDir.applyQuaternion(mesh.quaternion).normalize();
            
            this.shaderManager.updateSpotLight(sourcePos, worldDir);
        }

        // --- TRANSITION STATE ---
        if (this.gameState === "TRANSITION") {
            this.transitionProgress += delta / this.transitionDuration; // 2 saniye sürsün
            
            // Geçiş bitti mi?
            if (this.transitionProgress >= 1) {
                this.transitionProgress = 1;
                this.gameState = this.targetState;
                
                // Eğer oyuna döndüysek kontrolleri aç, Credits ise kilitle
                if (this.gameState === "PLAYING") {
                    this.isPaused = false;
                    this.controls.enabled = true;
                    this.controls.target.copy(this.endTarget);
                    this.shaderManager.update(now);
                } else {
                    this.controls.enabled = false; // Oyuncu kamerayı oynatamasın
                }
            }

            const t = this.transitionProgress;

            // 1. HEDEF (Target) Hareketi: Dümdüz interpolasyon (Lerp)
            // Kameranın baktığı yer A'dan B'ye doğrusal kaysın
            this.controls.target.lerpVectors(this.startTarget, this.endTarget, t);

            // 2. KAMERA POZİSYONU Hareketi: (Yüksel -> Git -> Alçal)
            // Zaman dilimlerini belirliyoruz
            const risePhase = 0.20;   // İlk %20: Yükselme
            const travelPhase = 0.80; // %20-%80: İlerleme, Son %20: Alçalma

            const currentPos = new THREE.Vector3();

            if (t < risePhase) {
                // --- AŞAMA 1: YÜKSELME ---
                // t değerini bu aşama için 0-1 arasına ölçekle (normalize et)
                const phaseT = t / risePhase;
                
                // SmoothStep hareketi yumuşatır (yavaş başla, yavaş dur)
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                // X ve Z sabit (başlangıçta), Y yükseliyor
                currentPos.copy(this.startCamPos);
                currentPos.y = THREE.MathUtils.lerp(this.startCamPos.y, this.cruiseHeight, smoothT);
            } 
            else if (t < travelPhase) {
                // --- AŞAMA 2: İLERLEME ---
                // t değerini bu aşama için 0-1 arasına ölçekle
                const phaseT = (t - risePhase) / (travelPhase - risePhase);
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                // Y sabit (Tepe noktası), X ve Z hedefe gidiyor
                // startCamPos ve endCamPos arasında X/Z geçişi yapıyoruz
                currentPos.x = THREE.MathUtils.lerp(this.startCamPos.x, this.endCamPos.x, smoothT);
                currentPos.z = THREE.MathUtils.lerp(this.startCamPos.z, this.endCamPos.z, smoothT);
                currentPos.y = this.cruiseHeight;
            } 
            else {
                // --- AŞAMA 3: ALÇALMA ---
                // t değerini bu aşama için 0-1 arasına ölçekle
                const phaseT = (t - travelPhase) / (1 - travelPhase);
                const smoothT = THREE.MathUtils.smoothstep(phaseT, 0, 1);

                // X ve Z hedefte sabit, Y alçalıyor
                currentPos.copy(this.endCamPos);
                // Yüksekten -> Hedef Yüksekliğine in
                currentPos.y = THREE.MathUtils.lerp(this.cruiseHeight, this.endCamPos.y, smoothT);
            }

            this.camera.position.copy(currentPos);
            
            // Target değiştiği için update şart
            this.controls.update(); 
            
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // --- CREDITS STATE ---
        if (this.gameState === "CREDITS") {
            // SABİT BEKLEME
            // Kullanıcı müdahale edemez, kamera tam tepeden bakıyor.
            // Hiçbir şey yapma, sadece render al.
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // --- PLAYING STATE ---
        if(!this.isPaused){
            // 1. Oyuncunun eski pozisyonunu kaydet
            const oldPlayerPos = this.player.mesh.position.clone();

            // 2. Player Update (Oyuncuyu hareket ettir)
            this.player.update(this.keys, this.camera);

            // 3. Oyuncu ne kadar yer değiştirdi? (Delta)
            const newPlayerPos = this.player.mesh.position;
            const deltaX = newPlayerPos.x - oldPlayerPos.x;
            const deltaZ = newPlayerPos.z - oldPlayerPos.z;

            // 4. Kamerayı da oyuncunun gittiği kadar taşı
            // Bu sayede aradaki mesafe ve açı bozulmaz, ama zoom çalışmaya devam eder.
            this.camera.position.x += deltaX;
            this.camera.position.z += deltaZ;

            // 5. OrbitControls'un hedefini (pivot noktasını) güncelle
            this.controls.target.copy(newPlayerPos);
            
            this.controls.update();

            // 2. Spawn Enemies
            if (this.isWaveActive) {
                const waveData = WAVE_DATA[this.currentWaveIndex];

                // Kuyrukta hala düşman varsa ve süre dolduysa
                if (this.spawnQueue.length > 0) {
                    if (now - this.lastSpawnTime > waveData.spawnDelay) {
                        
                        // Kuyruğun başından bir düşman tipi al
                        const enemyType = this.spawnQueue.shift(); 
                        this.spawnEnemy(enemyType);
                        
                        this.lastSpawnTime = now;
                    }
                } 
                // Kuyruk bitti VE sahnede hiç düşman kalmadıysa -> DALGA BİTTİ
                else if (this.enemies.length === 0) {
                    this.endWave();
                }
            }

            // 3. Enemies Update
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

            // 4. Towers Update
            this.towers.forEach(tower => {
                tower.update(this.enemies, now, delta, (pos, dir, stats) => {
                    // Projectile Callback
                    this.projectiles.push(new Projectile(this.scene, pos, dir, stats));
                });
            });

            // 5. Projectiles Update
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
        if (this.isGameOver) return; // Zaten bitmişse tekrar çalıştırma

        this.isGameOver = true;
        
        // Final skorunu yazdır
        const scoreSpan = document.getElementById('final-score');
        if (scoreSpan) scoreSpan.innerText = this.score;

        // Ekranı görünür yap (display: flex sayesinde ortalanır)
        const screen = document.getElementById('game-over-screen');
        if (screen) screen.style.display = 'flex';
    }

    updateUI() {
        const board = document.getElementById('score-board');
        if(board) board.innerText = `Lives: ${this.lives} | Score: ${this.score} | Cash: $${this.cash}`;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}