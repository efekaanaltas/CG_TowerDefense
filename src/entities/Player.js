import * as THREE from 'three';
import { TILE_SIZE, MAP_LAYOUT } from '../data/Constants.js';

export class Player {
    constructor(scene, resourceManager) {
        this.scene = scene;
        this.speed = 0.15;

        this.mesh = resourceManager.getModel('player');
        this.mesh.position.set(2, 0.1, 2);

        const scale = 5;
        this.mesh.scale.set(scale, scale, scale); 

        scene.add(this.mesh);
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
            
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z);

            inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            this.mesh.position.addScaledVector(inputVector, this.speed);

            const targetRotation = Math.atan2(inputVector.x, inputVector.z);
            let rotDiff = targetRotation - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.2; 
        }

        const mapWidth = MAP_LAYOUT[0].length * TILE_SIZE;
        const mapHeight = MAP_LAYOUT.length * TILE_SIZE;

        const padding = 0.5; 

        if (this.mesh.position.x < padding) {
            this.mesh.position.x = padding;
        } 
        else if (this.mesh.position.x > mapWidth - padding - 1) {
            this.mesh.position.x = mapWidth - padding - 1;
        }

        if (this.mesh.position.z < padding) {
            this.mesh.position.z = padding;
        } 
        else if (this.mesh.position.z > mapHeight - padding - 1) {
            this.mesh.position.z = mapHeight - padding - 1;
        }
    }
}