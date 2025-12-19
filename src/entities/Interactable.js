import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Interactable {
    constructor(scene, type, x, z) {
        this.scene = scene;
        this.type = type;
        this.mesh = this.createMesh(type);
        this.mesh.position.set(x * TILE_SIZE, 0.5, z * TILE_SIZE);
        scene.add(this.mesh);
    }

    createMesh(type) {
        // Tipine göre farklı obje döndürebilirsin
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const material = new THREE.MeshStandardMaterial({ color: 0x8A2BE2 }); // Mor renk
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
    }

    // Oyuncu 'E'ye basınca ne olacak?
    interact() {
        console.log("Interacted with " + this.type);
        // Animasyon oynat, ses çal vs.
    }
}