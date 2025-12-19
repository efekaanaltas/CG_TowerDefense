import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TILE_SIZE, MAP_LAYOUT, TOWER_TYPES, ENEMY_TYPES } from '../data/Constants.js';

import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Building } from '../entities/Building.js';
import { Projectile } from '../entities/Projectile.js';
import { Interactable } from '../entities/Interactable.js';

export class Game {
    constructor() {
        // State
        this.lives = 20;
        this.score = 0;
        this.cash = 400;
        this.isGameOver = false;
        this.keys = { w: false, a: false, s: false, d: false };
        this.lastSpawnTime = 0;
        this.selectedTowerIndex = 0;
        
        // Entities Lists
        this.enemies = [];
        this.towers = [];
        this.projectiles = [];
        this.interactables = [];

        this.init();
    }

    init() {
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
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // World Generation
        this.createLevel();
        
        // Entities
        this.player = new Player(this.scene);

        // Events
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        // UI (Basit tutuldu)
        this.injectUI();
        this.updateUI();

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
            const tower = new Building(this.scene, typeInfo, gridX, gridZ);
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
                this.scene.add(tile);
            }
        }
        
        // Örnek bir interactable ekle
        this.interactables.push(new Interactable(this.scene, 'Box', 2, 2));
    }

    spawnEnemy() {
        const typeDef = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
        const enemy = new Enemy(this.scene, typeDef);
        this.enemies.push(enemy);
    }




    // --- Loop ---
    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());

        const now = Date.now();

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
        if (now - this.lastSpawnTime > 2000) {
            this.spawnEnemy();
            this.lastSpawnTime = now;
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
            tower.update(this.enemies, now, (pos, dir, stats) => {
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