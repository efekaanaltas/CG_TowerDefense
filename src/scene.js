import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene() {
    // --- CONSTANTS & CONFIG ---
    const TILE_SIZE = 2;
    
    // Tower Definitions
    const TOWER_TYPES = [
        {
            name: "Turret",
            cost: 50,
            color: 0xFFFF00, // Yellow
            range: 8,
            fireRate: 800,
            damage: 30,
            element: "physical",
            shotCount: 1,
            spread: 0
        },
        {
            name: "Shotgun",
            cost: 120,
            color: 0xFFA500, // Orange
            range: 6,
            fireRate: 1200,
            damage: 20, // Per pellet
            element: "physical",
            shotCount: 3, // Shoots 3 pellets
            spread: 0.3   // Angle spread
        },
        {
            name: "Pyro",
            cost: 200,
            color: 0xFF0000, // Red
            range: 7,
            fireRate: 200, // Very fast
            damage: 5,
            element: "fire",
            shotCount: 1,
            spread: 0
        },
        {
            name: "Cryo",
            cost: 150,
            color: 0x00FFFF, // Cyan
            range: 10,
            fireRate: 1500, // Slow
            damage: 80, // High Damage
            element: "ice",
            shotCount: 1,
            spread: 0
        }
    ];

    // Enemy Definitions
    const ENEMY_TYPES = [
        { type: "normal", color: 0x888888, hp: 100, weakness: "none" },
        { type: "ice_golem", color: 0x00FFFF, hp: 150, weakness: "fire" }, // Weak to Pyro
        { type: "fire_imp", color: 0xFF4400, hp: 80, weakness: "ice" }     // Weak to Cryo
    ];

    // Map: 0=Path, 1=Buildable, 2=Goal
    const mapLayout = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

    const waypoints = [
        { x: 0, z: 1 }, { x: 4, z: 1 }, { x: 4, z: 3 }, { x: 10, z: 3 },
        { x: 10, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 8 }, { x: 13, z: 8 },
        { x: 13, z: 10 }, { x: 19, z: 10 }
    ];

    // --- STATE VARIABLES ---
    let scene, camera, renderer, controls;
    let player, gridGroup;
    let animationId;
    const keys = { w: false, a: false, s: false, d: false };

    // Game Logic
    let lives = 20;
    let score = 0;
    let cash = 400; // Start with more cash to test towers
    let isGameOver = false;
    let lastSpawnTime = 0;
    
    // Interaction State
    let selectedTowerIndex = 0; // Default to first tower
    let pendingDeleteTower = null; // Stores tower we are confirming to delete

    // Arrays
    const enemies = []; 
    const towers = [];
    const projectiles = [];

    // --- FUNCTIONS ---

    function init() {
        injectUI(); // Create buttons and overlays
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222222);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(10, 8, 15);
        
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false; 
        controls.minDistance = 15; 
        controls.maxDistance = 15; 
        controls.maxPolarAngle = Math.PI / 2; 

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        scene.add(dirLight);

        createLevel();
        createPlayer();

        window.addEventListener('resize', onWindowResize);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
        
        updateUI();
    }

    // [NEW] Creates HTML UI elements via JS
    function injectUI() {
        // 1. Tower Selection Bar
        const bar = document.createElement('div');
        bar.style = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;";
        
        TOWER_TYPES.forEach((type, index) => {
            const btn = document.createElement('div');
            btn.innerHTML = `<b>${type.name}</b><br>$${type.cost}`;
            btn.style = "color: white; background: #444; padding: 10px; cursor: pointer; border: 2px solid transparent; text-align: center; font-family: sans-serif; font-size: 12px; min-width: 60px;";
            btn.id = `btn-tower-${index}`;
            
            btn.onclick = () => {
                // Update selection visually and logically
                selectedTowerIndex = index;
                document.querySelectorAll('[id^="btn-tower-"]').forEach(b => b.style.borderColor = "transparent");
                btn.style.borderColor = "#00FF00"; // Highlight green
            };
            bar.appendChild(btn);
        });
        document.body.appendChild(bar);
        
        // Highlight default
        setTimeout(() => document.getElementById('btn-tower-0').style.borderColor = "#00FF00", 100);

        // 2. Delete Confirmation Overlay
        const delOverlay = document.createElement('div');
        delOverlay.id = "delete-overlay";
        delOverlay.style = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; text-align: center; display: none; font-family: sans-serif;";
        delOverlay.innerHTML = "<h3>Sell Tower?</h3><p>Refund: 50%</p><button id='btn-confirm-del'>CONFIRM (Space)</button> <button id='btn-cancel-del'>CANCEL</button>";
        document.body.appendChild(delOverlay);

        document.getElementById('btn-confirm-del').onclick = confirmDelete;
        document.getElementById('btn-cancel-del').onclick = cancelDelete;

        // 3. Game Over Screen
        const goScreen = document.createElement('div');
        goScreen.id = "game-over";
        goScreen.style = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: black; color: red; display: flex; align-items: center; justify-content: center; font-size: 50px; font-family: sans-serif; display: none; z-index: 100;";
        goScreen.innerHTML = "GAME OVER<br><span style='font-size:20px; color:white'>Refresh to restart</span>";
        document.body.appendChild(goScreen);
    }

    function onKeyDown(e) {
        if (isGameOver) return;
        const key = e.key.toLowerCase();
        
        // If delete prompt is showing, intercept Space
        if (pendingDeleteTower) {
            if (key === ' ') confirmDelete();
            if (key === 'escape') cancelDelete();
            return;
        }

        keys[key] = true;
        if (key === ' ') handleSpaceInteraction();
    }

    // [NEW] Smart Interaction: Build or Sell
    function handleSpaceInteraction() {
        const gridX = Math.round(player.position.x / TILE_SIZE);
        const gridZ = Math.round(player.position.z / TILE_SIZE);

        // Check for existing tower
        const existingTower = towers.find(t => 
            Math.round(t.position.x / TILE_SIZE) === gridX && 
            Math.round(t.position.z / TILE_SIZE) === gridZ
        );

        if (existingTower) {
            // Initiate Delete
            pendingDeleteTower = existingTower;
            document.getElementById('delete-overlay').style.display = 'block';
        } else {
            // Attempt Build
            attemptBuildTower(gridX, gridZ);
        }
    }

    function confirmDelete() {
        if (pendingDeleteTower) {
            const refund = Math.floor(pendingDeleteTower.userData.cost / 2);
            cash += refund;
            
            // Remove Mesh
            scene.remove(pendingDeleteTower);
            
            // Remove from Array
            const idx = towers.indexOf(pendingDeleteTower);
            if (idx > -1) towers.splice(idx, 1);
            
            updateUI();
        }
        cancelDelete(); // Hide UI
    }

    function cancelDelete() {
        pendingDeleteTower = null;
        document.getElementById('delete-overlay').style.display = 'none';
    }

    function attemptBuildTower(gridX, gridZ) {
        if (gridZ < 0 || gridZ >= mapLayout.length || gridX < 0 || gridX >= mapLayout[0].length) return;
        if (mapLayout[gridZ][gridX] !== 1) return;
        
        const typeInfo = TOWER_TYPES[selectedTowerIndex];

        if (cash < typeInfo.cost) {
            console.log("Not enough cash!");
            return;
        }

        createTower(gridX, gridZ, typeInfo);
        cash -= typeInfo.cost;
        updateUI();
    }

    function createTower(x, z, typeInfo) {
        // [NEW] Distinct shapes/colors could be added here. 
        // For now, we vary color and scale slightly.
        const geometry = new THREE.ConeGeometry(0.8, 2, 8);
        const material = new THREE.MeshStandardMaterial({ color: typeInfo.color });
        const tower = new THREE.Mesh(geometry, material);
        this.shaderManager.applyCustomMaterial(tower);
        
        tower.position.set(x * TILE_SIZE, 1, z * TILE_SIZE);
        tower.castShadow = true;
        
        // Save stats to the object
        tower.userData = { 
            ...typeInfo, // Copy all stats (damage, element, spread, etc)
            cooldown: 0
        }; 
        
        scene.add(tower);
        towers.push(tower);
    }

    function updateTowers() {
        const now = Date.now();

        towers.forEach(tower => {
            if (now - tower.userData.cooldown < tower.userData.fireRate) return;

            let closestEnemy = null;
            let minDist = Infinity;

            for (const enemy of enemies) {
                const dist = tower.position.distanceTo(enemy.position);
                if (dist < tower.userData.range && dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            }

            if (closestEnemy) {
                // [NEW] Fire logic handles multiple pellets (Shotgun)
                fireWeapon(tower, closestEnemy);
                tower.userData.cooldown = now;
            }
        });
    }

    function fireWeapon(tower, targetEnemy) {
        const count = tower.userData.shotCount || 1;
        const spread = tower.userData.spread || 0;

        for(let i=0; i<count; i++) {
            // Calculate base direction
            const direction = new THREE.Vector3().subVectors(targetEnemy.position, tower.position).normalize();
            
            // [NEW] Apply Spread (Shotgun logic)
            if (count > 1) {
                // Calculate an angle offset centered around 0
                const angleOffset = (i - (count - 1) / 2) * spread;
                direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);
            }

            shootProjectile(tower, direction);
        }
    }

function shootProjectile(tower, direction) {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: tower.userData.color }); 
        const bullet = new THREE.Mesh(geometry, material);
        this.shaderManager.applyCustomMaterial(bullet);
        
        bullet.position.copy(tower.position);
        //bullet.position.y += 1.5; 

        bullet.userData = {
            direction: direction,
            speed: 0.2, // [FIX] Slower bullets
            damage: tower.userData.damage,
            element: tower.userData.element,
            startPos: tower.position.clone(), // [FIX] Remember start point
            maxRange: tower.userData.range      // [FIX] Remember max range
        };

        scene.add(bullet);
        projectiles.push(bullet);
    }

function updateProjectiles() {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const bullet = projectiles[i];
            
            // 1. Move Bullet
            bullet.position.addScaledVector(bullet.userData.direction, bullet.userData.speed);

            // 2. Range Check [FIX]
            // If bullet is too far from its tower, remove it
            const distanceTraveled = bullet.position.distanceTo(bullet.userData.startPos);
            if (distanceTraveled > bullet.userData.maxRange) {
                scene.remove(bullet);
                projectiles.splice(i, 1);
                continue;
            }

            // 3. Collision Detection
            let hit = false;
            for (const enemy of enemies) {
                // [FIX] Increased Hitbox from 0.6 to 1.0 to ensure hits register
                if (bullet.position.distanceTo(enemy.position) < 1.0) {
                    applyDamage(enemy, bullet.userData);
                    hit = true;
                    break; 
                }
            }

            if (hit) {
                scene.remove(bullet);
                projectiles.splice(i, 1);
            }
        }
    }

function applyDamage(enemy, bulletData) {
        let finalDamage = bulletData.damage;
        const weakness = enemy.userData.weakness; // 'fire', 'ice', or 'none'
        const element = bulletData.element;       // 'fire', 'ice', or 'physical'

        // 1. Weakness Bonus (2x Damage)
        if (weakness !== 'none' && weakness === element) {
            finalDamage *= 2.0; 
        } 
        // 2. Elemental Resistance (0.5x Damage)
        // If the enemy has a weakness (e.g. Fire Imp), they resist other elements (Ice/Water)
        // But 'physical' bullets always deal normal damage.
        else if (weakness !== 'none' && element !== 'physical' && weakness !== element) {
            finalDamage *= 0.5;
        }

        enemy.userData.hp -= finalDamage;
        
        // Visual Hit Feedback (Flash White)
        enemy.material.emissive.setHex(0xFFFFFF);
        setTimeout(() => {
            if(enemy) enemy.material.emissive.setHex(0x000000);
        }, 50);

        if (enemy.userData.hp <= 0) killEnemy(enemy);
    }

    function killEnemy(enemy) {
        const index = enemies.indexOf(enemy);
        if (index > -1) {
            scene.remove(enemy);
            enemies.splice(index, 1);
            score += 20;
            cash += 15; 
            updateUI();
        }
    }

    function createLevel() {
        gridGroup = new THREE.Group();
        const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.5, TILE_SIZE);
        const matBuildable = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const matPath = new THREE.MeshStandardMaterial({ color: 0xC2B280 });
        const matGoal = new THREE.MeshStandardMaterial({ color: 0xFF0000 });

        for(let row = 0; row < mapLayout.length; row++) {
            for(let col = 0; col < mapLayout[row].length; col++) {
                let type = mapLayout[row][col];
                let material = type === 1 ? matBuildable : (type === 2 ? matGoal : matPath);
                
                const tile = new THREE.Mesh(geometry, material);
                this.shaderManager.applyCustomMaterial(tile, material);
                tile.position.set(col * TILE_SIZE, 0, row * TILE_SIZE);
                tile.receiveShadow = true;
                gridGroup.add(tile);
            }
        }
        scene.add(gridGroup);
        gridGroup.position.set(0, 0, 0); 
    }

    function createPlayer() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x0000FF });
        player = new THREE.Mesh(geometry, material);
        this.shaderManager.applyCustomMaterial(tile, material);
        player.position.set(2, 1, 2); // Safe spot
        player.castShadow = true;
        scene.add(player);
    }

    function spawnEnemy() {
        // [NEW] Pick Random Enemy Type
        const typeDef = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];

        const geometry = new THREE.SphereGeometry(0.6, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: typeDef.color });
        const enemy = new THREE.Mesh(geometry, material);
        this.shaderManager.applyCustomMaterial(tile, material);
        
        const startNode = waypoints[0];
        enemy.position.set(startNode.x * TILE_SIZE, 1, startNode.z * TILE_SIZE);
        enemy.castShadow = true;
        
        enemy.userData = {
            currentPointIndex: 0,
            speed: 0.05,
            hp: typeDef.hp,
            weakness: typeDef.weakness
        };

        scene.add(enemy);
        enemies.push(enemy);
    }

    function updateEnemies() {
        const now = Date.now();
        if (now - lastSpawnTime > 2000) { // Faster spawn
            spawnEnemy();
            lastSpawnTime = now;
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            const data = enemy.userData;
            const targetIndex = data.currentPointIndex + 1;
            
            if (targetIndex >= waypoints.length) {
                scene.remove(enemy);
                enemies.splice(i, 1);
                
                // [NEW] Lives Logic
                lives -= 1;
                updateUI();
                if (lives <= 0) endGame();
                
                continue;
            }

            const target = waypoints[targetIndex];
            const tx = target.x * TILE_SIZE;
            const tz = target.z * TILE_SIZE;

            const dx = tx - enemy.position.x;
            const dz = tz - enemy.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);

            if (dist < 0.1) {
                data.currentPointIndex++;
            } else {
                enemy.position.x += (dx / dist) * data.speed;
                enemy.position.z += (dz / dist) * data.speed;
            }
        }
    }

    function endGame() {
        isGameOver = true;
        document.getElementById('game-over').style.display = 'flex';
    }

    function updatePlayerMovement() {
        if (pendingDeleteTower) return; // Freeze player during prompts

        const speed = 0.15;
        let inputVector = new THREE.Vector3(0, 0, 0);
        
        if (keys['w']) inputVector.z += 1; 
        if (keys['s']) inputVector.z -= 1; 
        if (keys['a']) inputVector.x += 1; 
        if (keys['d']) inputVector.x -= 1; 

        if (inputVector.length() > 0) {
            inputVector.normalize();
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z);

            inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            player.position.addScaledVector(inputVector, speed);

            const targetRotation = Math.atan2(inputVector.x, inputVector.z);
            let rotDiff = targetRotation - player.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            player.rotation.y += rotDiff * 0.2; 
        }

        controls.target.copy(player.position);
        controls.update();
    }

    function updateUI() {
        const board = document.getElementById('score-board');
        if(board) board.innerText = `Lives: ${lives} | Score: ${score} | Cash: $${cash}`;
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        if (isGameOver) return; // Stop loop if game over

        animationId = requestAnimationFrame(animate);
        updatePlayerMovement();
        updateEnemies();
        updateTowers();
        updateProjectiles();
        renderer.render(scene, camera);
    }

    return {
        start: () => {
            init();
            animate();
        },
        stop: () => {
            cancelAnimationFrame(animationId);
        }
    };
}