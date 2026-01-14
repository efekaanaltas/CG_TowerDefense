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


export class Game {
    constructor() {
        // State
        this.lives = 20;
        this.score = 0;
        this.cash = 10000;
        this.isGameOver = false;
        this.keys = { w: false, a: false, s: false, d: false };
        this.lastSpawnTime = 0;
        this.selectedTowerIndex = 0;
        this.resourceManager = new ResourceManager();
        this.clock = new THREE.Clock();

        this.gameMode = 'STANDARD';

        this.currentWaveIndex = 0;      // Kaçıncı dalgadayız?
        this.isWaveActive = false;      // Şu an savaş var mı?
        this.spawnQueue = [];           // Doğmayı bekleyen düşman listesi
        this.lastSpawnTime = 0;         // En son ne zaman düşman doğdu?
        
        // Raycasting for mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.groundTiles = [];          // Store tile meshes for raycasting
        this.ghostTower = null;         // Preview tower
        this.lastHoveredTile = null;    // Track which tile we're hovering
        
        // Entities Lists
        this.enemies = [];
        this.towers = [];
        this.projectiles = [];
        this.interactables = [];

        // --- CAMERA STATE ---
        this.gameState = "PLAYING"; // "PLAYING", "TRANSITION", "CREDITS"
        this.isPaused = false;      // Oyunu durdurmak için
        this.isMenuOpen = false;    // Dropdown menu açık mı?
        
        // Geçiş Değişkenleri
        this.transitionProgress = 0;
        this.transitionDuration = 2.0; // 2 saniye sürsün
        this.cruiseHeight = 40;
        this.startCamPos = new THREE.Vector3();
        this.startTarget = new THREE.Vector3();
        this.endCamPos = new THREE.Vector3();
        this.endTarget = new THREE.Vector3();

        // --- AUTO START & STATS ---
        this.isAutoStart = false; // Otomatik başlatma açık mı?
        this.towerStats = {};     // Hangi kuleden kaç tane dikildi? { 'Turret': 5, 'Shotgun': 2 }
        
        // Tower Stats'i sıfırla
        TOWER_TYPES.forEach(t => this.towerStats[t.name] = 0);

        this.bgMusic = new Audio('/assets/bg_music.mp3'); 
        this.bgMusic.loop = true;   // Sürekli başa sarsın
        this.bgMusic.volume = 0.3;  // Sesi %30 yapalım (Kullanıcıyı sağır etmeyelim)
        this.isMuted = false;       // Başlangıçta sessiz değil

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
        this.scene = new THREE.Scene();
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
        this.controls.maxPolarAngle = Math.PI / 2; // Yerin altına girmeyi engelle

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);
        
        // Calculate map dimensions and center
        const mapWidth = 20 * TILE_SIZE;   // 40 units
        const mapDepth = 15 * TILE_SIZE;   // 30 units
        const mapCenterX = (mapWidth - TILE_SIZE) / 2;  // 19
        const mapCenterZ = (mapDepth - TILE_SIZE) / 2;  // 14
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(mapCenterX, 30, mapCenterZ);
        dirLight.castShadow = true;
        
        // CRITICAL: Set light target to map center so shadow camera looks at the right place
        dirLight.target.position.set(mapCenterX, 0, mapCenterZ);
        this.scene.add(dirLight.target);  // Must add target to scene!
        
        // Shadow camera bounds (relative to target, not world origin)
        const shadowMargin = 3;
        dirLight.shadow.camera.left = -mapWidth / 2 - shadowMargin;
        dirLight.shadow.camera.right = mapWidth / 2 + shadowMargin;
        dirLight.shadow.camera.top = mapDepth / 2 + shadowMargin;
        dirLight.shadow.camera.bottom = -mapDepth / 2 - shadowMargin;
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 50;
        
        // High resolution shadow map
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.bias = -0.0001;
        
        this.scene.add(dirLight);

        // World Generation
        this.createLevel();
        this.createCreditsArea();
        
        // Entities
        this.player = new Player(this.scene, this.resourceManager);

        // Events
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener('click', (e) => this.onMouseClick(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));

        this.updateUI();

    }

    injectUI() {
        // --- 0. START SCREEN ---
        const startScreen = document.createElement('div');
        startScreen.id = 'start-screen';
        startScreen.style = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #111;
            /* Arkaplan görselin varsa buraya ekle */
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            z-index: 200; font-family: sans-serif;
        `;

        // Kayıt var mı kontrol et
        const stdSave = this.loadGameData('STANDARD');
        const endlessSave = this.loadGameData('ENDLESS');

        // HTML İçeriği
        let menuHTML = `
            <h1 style="font-size: 80px; color: #FFD700; text-shadow: 4px 4px 0 #000; margin-bottom: 10px;">TOWER DEFENSE</h1>
            <p style="color: white; font-size: 20px; margin-bottom: 40px;">Select Game Mode</p>
            
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

        // --- BUTON EVENTLERİ ---

        // New Game: Standard
        document.getElementById('btn-mode-standard').onclick = () => {
            this.clearSave('STANDARD'); // Yeni oyun, eski kaydı sil
            this.startGame('STANDARD');
        };

        // New Game: Endless
        document.getElementById('btn-mode-endless').onclick = () => {
            this.clearSave('ENDLESS');
            this.startGame('ENDLESS');
        };

        // Continue: Standard
        if (stdSave) {
            document.getElementById('btn-continue-standard').onclick = () => {
                this.startGame('STANDARD', true); // true = loadGame
            };
        }

        // Continue: Endless
        if (endlessSave) {
            document.getElementById('btn-continue-endless').onclick = () => {
                this.startGame('ENDLESS', true); // true = loadGame
            };
        }


        // --- 1. Dropdown Tower Menu (Başlangıçta GİZLİ) ---
        // Dropdown Toggle Button
        const dropdownBtn = document.createElement('button');
        dropdownBtn.id = 'dropdown-toggle';
        dropdownBtn.innerHTML = '🏗️ BUILD MENU';
        dropdownBtn.style = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 30px; font-size: 16px; font-weight: bold; background: rgba(0,150,0,0.8); color: white; border: 2px solid #00FF00; border-radius: 8px; cursor: pointer; z-index: 10; display: none; font-family: sans-serif;";
        dropdownBtn.onclick = () => {
            this.toggleBuildMenu();
            dropdownBtn.blur(); // Remove focus to prevent space from re-triggering
        };
        document.body.appendChild(dropdownBtn);
        
        // Tower Selection Bar (Hidden by default)
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
                e.stopPropagation(); // Prevent event bubbling
                this.selectedTowerIndex = index;
                this.updateTowerSelectionUI();
                // Remove focus from button to prevent space key from re-triggering
                btn.blur();
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

        // --- MEVCUT SCORE BOARD GÜNCELLEMESİ ---
        // Eğer varsa içini temizle veya yeniden oluştur
        let sb = document.getElementById('score-board');
        if (!sb) {
            sb = document.createElement('div');
            sb.id = 'score-board';
            sb.style = "position: absolute; top: 10px; left: 10px; color: white; background: rgba(0,0,0,0.5); padding: 10px; font-family: sans-serif; user-select: none; display: none; border-radius: 5px;";
            document.body.appendChild(sb);
        }

        // --- AUTO START BUTONU ---
        const autoBtn = document.createElement('div');
        autoBtn.id = 'btn-auto-start';
        autoBtn.style = `
            position: absolute; bottom: 80px; right: 20px;
            width: 40px; height: 40px; 
            background: #333; border: 2px solid #555; border-radius: 5px;
            display: none; cursor: pointer;
            align-items: center; justify-content: center; z-index: 10;
        `;
        
        // İçindeki Üçgen (CSS ile yapıyoruz)
        const triangle = document.createElement('div');
        triangle.id = 'auto-start-icon';
        triangle.style = `
            width: 0; height: 0; 
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-left: 14px solid #FF0000; /* Başlangıçta Kırmızı */
            margin-left: 4px; /* Ortalamak için */
        `;
        
        autoBtn.appendChild(triangle);
        
        // Tıklama Olayı
        autoBtn.onclick = () => {
            this.isAutoStart = !this.isAutoStart;
            // Rengi değiştir
            triangle.style.borderLeftColor = this.isAutoStart ? '#00FF00' : '#FF0000';
            
            // Eğer dalga aktif değilse ve auto açıldıysa hemen başlat (Opsiyonel)
            if (this.isAutoStart && !this.isWaveActive) {
                this.startNextWave();
            }
        };
        document.body.appendChild(autoBtn);

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

        // --- YENİ BİTİŞ EKRANI (STATS SCREEN) ---
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
        // İçerik dinamik doldurulacak
        document.body.appendChild(endScreen);

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
                
                <div style="font-weight: bold; color: #aaa;">Mouse Left</div>
                <div>Place Tower (menu must be open)</div>

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
                
            </div>

            <button id="btn-exit-menu" style="margin-top: 30px; padding: 10px 30px; background: #dc3545; color: white; border: none; border-radius: 5px; font-size: 18px; cursor: pointer;">
                SAVE & EXIT TO MENU
            </button>
            <p style="margin-top: 40px; font-style: italic; color: #888;">Reminder: Leaving the game deletes all of your buildings sell or lose all of them.</p>

            <p style="margin-top: 40px; font-style: italic; color: #888;">Press 'H' to Resume Game</p>

            <div style="position: absolute; bottom: 130px; right: 40px; text-align: center; color: #00FF00;">
            <div style="font-size: 14px; margin-bottom: 5px;">Auto Start Next Wave</div>
            <div style="font-size: 60px; line-height: 20px;">&#8600;</div> </div>
        `;

        document.body.appendChild(helpOverlay);

        // Ana Menü Butonu Olayı
        document.getElementById('btn-exit-menu').onclick = () => {
            this.saveGame(); // Çıkarken kaydet
            window.location.reload(); // Sayfayı yenileyerek ana menüye dön (En temiz yöntem)
        };

        // --- MUSIC TOGGLE BUTTON ---
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
        
        // Hoparlör ikonu (Emoji kullanıyoruz, pratik çözüm)
        muteBtn.innerText = '🔊';

        muteBtn.onclick = () => this.toggleMusic();
        
        // Hover efekti
        muteBtn.onmouseenter = () => muteBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        muteBtn.onmouseleave = () => muteBtn.style.background = 'rgba(0, 0, 0, 0.5)';

        document.body.appendChild(muteBtn);
    }

    toggleMusic() {
        const btn = document.getElementById('btn-mute');
        
        if (this.isMuted) {
            // Sesi Aç
            this.bgMusic.play().catch(e => console.log("Audio play failed:", e));
            this.isMuted = false;
            if (btn) btn.innerText = '🔊'; // Sesli ikonu
        } else {
            // Sesi Kapat
            this.bgMusic.pause();
            this.isMuted = true;
            if (btn) btn.innerText = '🔇'; // Sessiz ikonu
        }
    }

    updateTowerSelectionUI() {
        // Tüm butonların kenarlığını temizle
        document.querySelectorAll('[id^="btn-tower-"]').forEach(b => b.style.borderColor = "transparent");
        // Seçili olanı yeşil yap
        const activeBtn = document.getElementById(`btn-tower-${this.selectedTowerIndex}`);
        if(activeBtn) activeBtn.style.borderColor = "#00FF00";
        
        // Recreate ghost tower when selection changes
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
        // Create grid lines if they don't exist
        if (!this.gridHelper) {
            const gridGroup = new THREE.Group();
            
            // Grid lines should be at tile edges, not centers
            // Tiles are centered at (col*TILE_SIZE, row*TILE_SIZE) and extend ±TILE_SIZE/2
            // So edges are at (col - 0.5) * TILE_SIZE
            
            // Create vertical lines (along Z axis) - 21 lines for 20 columns
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
            
            // Create horizontal lines (along X axis) - 16 lines for 15 rows
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
        
        // Clone the model for ghost preview
        const model = this.resourceManager.getModel(modelKey);
        const ghostModel = model.clone();
        
        // Make it semi-transparent
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

        // Position ghost at grid location
        this.ghostTower.position.set(gridX * TILE_SIZE, 1, gridZ * TILE_SIZE);
        this.ghostTower.visible = true;

        // Change color based on validity
        this.ghostTower.traverse((child) => {
            if (child.isMesh) {
                if (isValid) {
                    child.material.color.setHex(0x00FF00); // Green for valid
                } else {
                    child.material.color.setHex(0xFF0000); // Red for invalid
                }
            }
        });
    }

    onMouseMove(e) {
        if (!this.isMenuOpen || this.isGameOver) {
            if (this.ghostTower) this.ghostTower.visible = false;
            return;
        }

        // Calculate mouse position
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check intersection with ground tiles
        const intersects = this.raycaster.intersectObjects(this.groundTiles);

        if (intersects.length > 0) {
            const hoveredTile = intersects[0].object;
            const gridX = hoveredTile.userData.gridX;
            const gridZ = hoveredTile.userData.gridZ;

            // Check if we need to recreate ghost (tower type changed)
            const typeInfo = TOWER_TYPES[this.selectedTowerIndex];
            if (this.ghostTower && this.ghostTower.userData.towerType !== this.selectedTowerIndex) {
                this.createGhostTower();
            }
            if (this.ghostTower) {
                this.ghostTower.userData.towerType = this.selectedTowerIndex;
            }

            // Check if placement is valid
            const tileType = hoveredTile.userData.tileType;
            const existingTower = this.towers.find(t => {
                const tPos = t.mesh.position;
                return Math.round(tPos.x / TILE_SIZE) === gridX && Math.round(tPos.z / TILE_SIZE) === gridZ;
            });

            const isValid = tileType === 1 && !existingTower && this.cash >= typeInfo.cost;
            
            this.updateGhostTower(gridX, gridZ, isValid);
        } else {
            // Hide ghost when not hovering over tiles
            if (this.ghostTower) this.ghostTower.visible = false;
        }
    }

    hideGrid() {
        if (this.gridHelper) {
            this.gridHelper.visible = false;
        }
    }

    saveGame() {
        // Sadece dalga arası (Wave Active değilken) veya çıkışta kaydetmek en güvenlisidir.
        const saveData = {
            waveIndex: this.currentWaveIndex,
            cash: this.cash,
            lives: this.lives,
            score: this.score,
            towerStats: this.towerStats,
            // Not: Kulelerin yerlerini kaydetmek çok karmaşık olduğu için
            // basit sistemde oyuncuya parasını verip leveli baştan kurduruyoruz.
        };
        
        // Moduna göre ayrı isimle kaydet (save_STANDARD, save_ENDLESS)
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

    startGame(mode, loadSave = false) {
        this.gameMode = mode;

        // 1. Menüyü gizle
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';

        // Eğer Kayıttan Devam ediyorsak verileri yükle
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
            // Yeni oyun ise sıfırla (Constructor'daki defaultlar kalabilir ama garanti olsun)
            this.currentWaveIndex = 0;
            this.cash = 10000;
            this.lives = 20;
            this.score = 0;
        }

        // Auto Start butonunu göster
        const autoBtn = document.getElementById('btn-auto-start');
        if (autoBtn) autoBtn.style.display = 'flex';

        const dropdownBtn = document.getElementById('dropdown-toggle');
        if (dropdownBtn) dropdownBtn.style.display = 'block';

        if (!this.isMuted) {
            // .play() bir Promise döndürür, hata olursa (tarayıcı engellerse) yakalayalım
            this.bgMusic.play().catch(error => {
                console.warn("Otomatik oynatma engellendi, kullanıcı etkileşimi bekleniyor.", error);
            });
        }
        
        // Eğer 'Continue' dediğimizde dalga butonunun metnini güncellememiz gerekir
        const waveBtn = document.getElementById('btn-next-wave');
        if (waveBtn) {
            waveBtn.innerText = `START WAVE ${this.currentWaveIndex + 1}`;
            waveBtn.style.display = 'block';
        }

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
        if (this.isWaveActive) return;

        // --- ENDLESS MOD MANTIĞI ---
        let waveData;

        // Durum 1: Halihazırda tanımlı dalgalar (İlk 20 level)
        if (this.currentWaveIndex < WAVE_DATA.length) {
            waveData = WAVE_DATA[this.currentWaveIndex];
        } 
        // Durum 2: Tanımlı dalgalar bitti (Level 21+)
        else {
            // Eğer STANDART moddaysak oyun zaten bitmiş olmalıydı (endWave kontrol ediyor)
            // Ama ENDLESS moddaysak yeni dalga üretiyoruz:
            if (this.gameMode === 'ENDLESS') {
                waveData = this.generateEndlessWave(this.currentWaveIndex);
            } else {
                return; // Hata koruması
            }
        }

        // --- MEVCUT SPAWN MANTIĞI ---
        this.spawnQueue = [];
        
        // waveData içinden düşmanları kuyruğa ekle
        for (const [typeKey, count] of Object.entries(waveData.enemies)) {
            for (let i = 0; i < count; i++) {
                this.spawnQueue.push(typeKey);
            }
        }
        
        this.spawnQueue.sort(() => Math.random() - 0.5);

        // Spawn Delay ve Health Multiplier ayarları
        // Not: generateEndlessWave fonksiyonu bu değerleri de döndürecek.
        // Eğer normal waves ise spawnDelay zaten var. Multiplier'ı da spawnEnemy'de kullanıyoruz.
        
        // Bu değerleri Game sınıfına geçici olarak kaydedebilirsin ki spawnEnemy erişebilsin
        this.currentWaveData = waveData; 

        this.isWaveActive = true;
        document.getElementById('btn-next-wave').style.display = 'none';
        this.updateUI();
    }

    generateEndlessWave(levelIndex) {
        // 20. levelden sonra ne kadar ilerledik?
        const endlessLevel = levelIndex - WAVE_DATA.length + 1; 

        // Çarpanlar (Her tur %10 - %20 zorlaşsın)
        // Örnek: Level 21 için multiplier 5.0 (son wave) * 1.1
        const healthMult = 5.0 + (endlessLevel * 0.5); 
        
        // Düşman Sayısı (Her tur biraz artsın ama 100-150 civarında sınırlansın ki CPU yanmasın)
        const baseCount = 50; 
        const totalEnemies = Math.min(150, baseCount + (endlessLevel * 5));

        // Spawn Delay (Düşmanlar hızla gelsin, min 100ms)
        const delay = Math.max(100, 200 - (endlessLevel * 5));

        // Düşman Dağılımı (Rastgelelik katalım)
        // İlerledikçe güçlü düşman oranı artar
        const impRatio = Math.min(0.5, 0.2 + (endlessLevel * 0.01)); // %50'ye kadar çıkar
        const golemRatio = Math.min(0.4, 0.2 + (endlessLevel * 0.01)); // %40'a kadar çıkar
        
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
        this.currentWaveIndex++; // Bir sonraki dalgaya geç

        // --- STANDARD MOD BİTİŞİ ---
        if (this.gameMode === 'STANDARD' && this.currentWaveIndex >= WAVE_DATA.length) {
            this.showEndStats("VICTORY!", "#28a745");
            return;
        }
        
        // --- ENDLESS MOD (Asla bitmez, sadece ölünce biter) ---
        // Eğer index 20'yi geçerse buton yine de görünsün
        
        // Buton Yönetimi (Auto Start vb.)
        const btn = document.getElementById('btn-next-wave');
        
        if (this.isAutoStart) {
            if (btn) btn.style.display = 'none';
            setTimeout(() => {
                if (!this.isGameOver) this.startNextWave();
            }, 2000); 
        } else {
            if (btn) {
                // Level 21, 22... diye yazsın
                btn.innerText = `START WAVE ${this.currentWaveIndex + 1}`;
                btn.style.display = 'block';
            }
        }
        
        // İstersen dalga bitince oyuncuya bonus para ver
        this.cash += 100;
        this.updateUI();
        this.saveGame();
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
        
        // 'B' tuşu: Build menüsünü aç/kapa
        if (key === 'b') this.toggleBuildMenu();
        
        // Space artık sadece kule silmek için (oyuncu üzerindeyse)
        if (key === ' ') {
            this.handleSpaceSellTower();
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
        // Ignore clicks on UI elements
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'DIV' && e.target.id.includes('btn')) {
            return;
        }
        
        if (this.isGameOver || !this.isMenuOpen) return;

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check intersection with ground tiles
        const intersects = this.raycaster.intersectObjects(this.groundTiles);
        

        if (intersects.length > 0) {
            const clickedTile = intersects[0].object;
            const gridX = clickedTile.userData.gridX;
            const gridZ = clickedTile.userData.gridZ;
            
            // Attempt to build tower at clicked position
            this.attemptBuild(gridX, gridZ);
        }
    }

    handleSpaceSellTower() {
        const pos = this.player.getGridPosition();
        
        // Check if there's a tower where the player is standing
        const existingTower = this.towers.find(t => {
            const tPos = t.mesh.position;
            return Math.round(tPos.x / TILE_SIZE) === pos.x && Math.round(tPos.z / TILE_SIZE) === pos.z;
        });

        if (existingTower) {
            // Start delete confirmation
            this.pendingDeleteTower = existingTower;
            document.getElementById('delete-overlay').style.display = 'block';
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

        // Check if there's already a tower at this position
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
            // Modüler yapıda Building sınıfını kullanıyoruz
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
        { x: 4, y: 1, z: 10, typeIndex: 2 }
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
        // 1. Düşman tipinin temel özelliklerini al (Can, Hız vb.)
        const baseStats = ENEMY_TYPES.find(e => e.type === typeKey);

        if (baseStats) {
            // 2. Şu anki dalganın bilgilerini al
            const currentWave = this.currentWaveData || WAVE_DATA[this.currentWaveIndex];
            const multiplier = currentWave.healthMultiplier || 1;

            const finalStats = {
                ...baseStats,
                hp: baseStats.hp * multiplier
            };

            // 4. Enemy sınıfına güncellenmiş (güçlendirilmiş) özellikleri gönder
            const enemy = new Enemy(this.scene, finalStats);
            this.enemies.push(enemy);
        }
    }

    // --- Loop ---
    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta(); // Three.Clock kullanıyorsan
        const now = Date.now();

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

        this.renderer.render(this.scene, this.camera);
    }

    endGame() {
        if (this.isGameOver) return; // Zaten bitmişse tekrar çalıştırma

        this.isGameOver = true;
        this.showEndStats("GAME OVER", "#DC3545");
    }

    showEndStats(title, color) {
        const screen = document.getElementById('end-screen');
        const autoBtn = document.getElementById('btn-auto-start');
        const waveBtn = document.getElementById('btn-next-wave');
        
        // Diğer butonları gizle
        if (autoBtn) autoBtn.style.display = 'none';
        if (waveBtn) waveBtn.style.display = 'none';

        // İstatistik HTML'ini oluştur
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

        // Hangi binadan kaç tane dikildi?
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

        // Ana Menüye Dönüş (Sayfayı Yenile)
        document.getElementById('btn-return-menu').onclick = () => {
            window.location.reload();
        };
    }

    updateUI() {
        const board = document.getElementById('score-board');
        if(board) {
            // currentWaveIndex 0'dan başlar, o yüzden +1 ekliyoruz.
            // Eğer oyun bittiyse (Index > Length) son leveli göster.
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