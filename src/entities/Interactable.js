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

        // [FIX] Link the mesh back to this class instance
        // We traverse because the raycaster might hit a child mesh (like a wheel),
        // but we want to pick up the whole object.
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.userData.parentInteractable = this;
            }
        });
        // Also attach to the root group/mesh
        this.mesh.userData.parentInteractable = this;
        
        scene.add(this.mesh);
    }

    // [NEW] Helper for rotation (Game.js uses this)
    rotate(axis, amount) {
        this.mesh.rotation[axis] += amount;
    }

    interact() {
        console.log("Interacted with " + this.type);
    }
}