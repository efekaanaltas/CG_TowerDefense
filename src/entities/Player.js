import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Player {
    constructor(scene, resourceManager) {
        this.scene = scene;
        this.speed = 0.15;

        // [DEĞİŞİKLİK] Küp yerine modeli yükle
        this.mesh = resourceManager.getModel('player');
        
        // Başlangıç Pozisyonu
        this.mesh.position.set(2, 0.1, 2); // Y değerini modele göre ayarla (gömülmesin)

        // Ölçeklendirme (Model çok büyük veya küçükse buradan ayarla)
        const scale = 5;
        this.mesh.scale.set(scale, scale, scale); 

        // Eğer modelin yüzü varsayılan olarak arkaya bakıyorsa döndür
        // this.mesh.rotation.y = Math.PI;

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