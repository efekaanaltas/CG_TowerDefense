import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Interactable {
    constructor(scene, resourceManager, typeDef, x, y, z) {
        this.scene = scene;
        this.type = typeDef.type;
        
        // Modeli ResourceManager'dan al
        this.mesh = resourceManager.getModel(typeDef.modelKey);
        
        // Scale ayarı
        if (typeDef.scale) {
            this.mesh.scale.set(typeDef.scale, typeDef.scale, typeDef.scale);
        }

        // Pozisyonu ayarla
        this.mesh.position.set(x * TILE_SIZE, y * TILE_SIZE, z * TILE_SIZE);
        
        scene.add(this.mesh);
    }

    interact() {
        console.log("Interacted with " + this.type);
        // İleride buraya model animasyonu ekleyebilirsin
    }
}