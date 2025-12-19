import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Player {
    constructor(scene) {
        this.mesh = this.createMesh();
        this.mesh.position.set(2, 1, 2);
        this.speed = 0.15;
        scene.add(this.mesh);
    }

    createMesh() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x0000FF });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
    }

    getPosition() {
        return this.mesh.position;
    }

    getGridPosition() {
        return {
            x: Math.round(this.mesh.position.x / TILE_SIZE),
            z: Math.round(this.mesh.position.z / TILE_SIZE)
        };
    }

    update(keys, camera) {
        let inputVector = new THREE.Vector3(0, 0, 0);
        
        if (keys['w']) inputVector.z += 1; 
        if (keys['s']) inputVector.z -= 1; 
        if (keys['a']) inputVector.x += 1; 
        if (keys['d']) inputVector.x -= 1; 

        if (inputVector.length() > 0) {
            inputVector.normalize();
            
            // Kameranın baktığı yöne göre hareket et
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z);

            inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            this.mesh.position.addScaledVector(inputVector, this.speed);

            // Karakteri gittiği yöne döndür
            const targetRotation = Math.atan2(inputVector.x, inputVector.z);
            let rotDiff = targetRotation - this.mesh.rotation.y;
            // Açıyı normalize et (kısa yoldan dönmesi için)
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.2; 
        }
    }
}