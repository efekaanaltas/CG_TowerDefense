import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Building {
    constructor(scene, typeInfo, x, z) {
        this.scene = scene;
        this.stats = { ...typeInfo }; // Özellikleri kopyala
        this.cooldown = 0;
        
        this.mesh = this.createMesh(typeInfo.color);
        this.mesh.position.set(x * TILE_SIZE, 1, z * TILE_SIZE);
        
        scene.add(this.mesh);
    }

    createMesh(color) {
        const geometry = new THREE.ConeGeometry(0.8, 2, 8);
        const material = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
    }

    update(enemies, now, addProjectileCallback) {
        // Ateş etme süresi geldi mi?
        if (now - this.cooldown < this.stats.fireRate) return;

        let closestEnemy = null;
        let minDist = Infinity;

        // Menzildeki en yakın düşmanı bul
        // Not: Enemy sınıfındaki mesh'e erişmek için enemy.mesh.position kullanıyoruz
        for (const enemy of enemies) {
            const dist = this.mesh.position.distanceTo(enemy.mesh.position);
            if (dist < this.stats.range && dist < minDist) {
                minDist = dist;
                closestEnemy = enemy;
            }
        }

        if (closestEnemy) {
            this.fire(closestEnemy, addProjectileCallback);
            this.cooldown = now;
        }
    }

    fire(targetEnemy, addProjectile) {
        const count = this.stats.shotCount || 1;
        const spread = this.stats.spread || 0;

        for(let i=0; i<count; i++) {
            const direction = new THREE.Vector3()
                .subVectors(targetEnemy.mesh.position, this.mesh.position)
                .normalize();
            
            if (count > 1) {
                const angleOffset = (i - (count - 1) / 2) * spread;
                direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);
            }

            // Mermi yaratma isteğini Game.js'e gönder
            addProjectile(this.mesh.position, direction, this.stats);
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}