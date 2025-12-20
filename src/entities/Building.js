import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Building {
    constructor(scene, resourceManager, scale, typeInfo, x, z) {
        this.scene = scene;
        this.stats = { ...typeInfo };
        this.cooldown = 0;
        
        this.mesh = resourceManager.getModel(typeInfo.modelKey);
        
        this.mesh.position.set(x * TILE_SIZE, 0, z * TILE_SIZE);
        
        this.mesh.scale.set(scale, scale, scale); 

        scene.add(this.mesh);
    }

    update(enemies, now, addProjectileCallback) {
        if (now - this.cooldown < this.stats.fireRate) return;

        let closestEnemy = null;
        let minDist = Infinity;

        for (const enemy of enemies) {
            const dist = this.mesh.position.distanceTo(enemy.mesh.position);
            if (dist < this.stats.range && dist < minDist) {
                minDist = dist;
                closestEnemy = enemy;
            }
        }

        if (closestEnemy) {
            // Merminin kulenin tepesinden çıkması için mesh pozisyonuna biraz Y ekleyebilirsin
            const firePos = this.mesh.position.clone();
            firePos.y += 2.8;

            this.fire(closestEnemy, addProjectileCallback, firePos);
            this.cooldown = now;
        }
    }

    fire(targetEnemy, addProjectile, firePos) {
        const count = this.stats.shotCount || 1;
        const spread = this.stats.spread || 0;

        for(let i=0; i<count; i++) {
            const direction = new THREE.Vector3()
                .subVectors(targetEnemy.mesh.position, firePos)
                .normalize();
            
            if (count > 1) {
                const angleOffset = (i - (count - 1) / 2) * spread;
                direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);
            }

            addProjectile(firePos, direction, this.stats);
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}