import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Building {
    constructor(scene, resourceManager, scale, typeInfo, x, z) {
        this.scene = scene;
        this.stats = { ...typeInfo };
        this.cooldown = 0;
        this.shouldRotate = typeInfo.shouldRotate || false;
        
        this.mesh = resourceManager.getModel(typeInfo.modelKey);
        
        this.mesh.position.set(x * TILE_SIZE, 0.2, z * TILE_SIZE);
        this.mesh.scale.set(scale, scale, scale); 

        this.mixer = null;
        
        if (this.mesh.animations && this.mesh.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            const clip = this.mesh.animations[0];
            const action = this.mixer.clipAction(clip);
            action.play();
        }

        scene.add(this.mesh);
    }

    update(enemies, now, delta, addProjectileCallback) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
        if (now - this.cooldown < this.stats.fireRate && !this.shouldRotate) return;

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

            if (this.shouldRotate) {
                const targetPos = closestEnemy.mesh.position.clone();
                targetPos.y = this.mesh.position.y;
                this.mesh.lookAt(targetPos);
                this.mesh.rotateY(Math.PI/2);
            }

            
            if (now - this.cooldown >= this.stats.fireRate){
                const firePos = this.mesh.position.clone();
                firePos.y += 1.8;
                this.fire(closestEnemy, addProjectileCallback, firePos);
                this.cooldown = now;
            }
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