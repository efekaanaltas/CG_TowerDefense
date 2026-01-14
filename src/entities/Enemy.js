import * as THREE from 'three';
import { TILE_SIZE, WAYPOINTS } from '../data/Constants.js';

export class Enemy {
    constructor(scene, typeDef) {
        this.scene = scene;
        this.mesh = this.createMesh(typeDef.color);
        
        const startNode = WAYPOINTS[0];
        this.mesh.position.set(startNode.x * TILE_SIZE, 1, startNode.z * TILE_SIZE);
        
        this.hp = typeDef.hp;
        this.weakness = typeDef.weakness;
        this.speed = 0.05;
        this.currentPointIndex = 0;
        
        this.isDead = false;
        this.reachedGoal = false;

        scene.add(this.mesh);
    }

    createMesh(color) {
        const geometry = new THREE.SphereGeometry(0.6, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.userData.entity = this; 
        return mesh;
    }

    takeDamage(amount, element) {
        let finalDamage = amount;
        
        if (this.weakness !== 'none' && this.weakness === element) {
            finalDamage *= 2.0; 
        } else if (this.weakness !== 'none' && element !== 'physical' && this.weakness !== element) {
            finalDamage *= 0.5;
        }

        this.hp -= finalDamage;

        const mat = this.mesh.material;
        
        if (mat.uniforms && mat.uniforms.uEmissive) {
            mat.uniforms.uEmissive.value.setHex(0xFFFFFF);
            setTimeout(() => {
                if(this.mesh) mat.uniforms.uEmissive.value.setHex(0x000000);
            }, 50);
        } 
        else if (mat.emissive) {
            mat.emissive.setHex(0xFFFFFF);
            setTimeout(() => {
                if(this.mesh) mat.emissive.setHex(0x000000);
            }, 50);
        }

        if (this.hp <= 0) {
            this.isDead = true;
        }
    }

    update() {
        const targetIndex = this.currentPointIndex + 1;
        
        if (targetIndex >= WAYPOINTS.length) {
            this.reachedGoal = true;
            return;
        }

        const target = WAYPOINTS[targetIndex];
        const tx = target.x * TILE_SIZE;
        const tz = target.z * TILE_SIZE;

        const dx = tx - this.mesh.position.x;
        const dz = tz - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < 0.1) {
            this.currentPointIndex++;
        } else {
            this.mesh.position.x += (dx / dist) * this.speed;
            this.mesh.position.z += (dz / dist) * this.speed;
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}