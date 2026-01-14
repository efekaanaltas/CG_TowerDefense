import * as THREE from 'three';
import { TILE_SIZE } from '../data/Constants.js';

export class Interactable {
    constructor(scene, resourceManager, typeDef, x, y, z) {
        this.scene = scene;
        this.type = typeDef.type;
        
        this.mesh = resourceManager.getModel(typeDef.modelKey);
        
        if (typeDef.scale) {
            this.mesh.scale.set(typeDef.scale, typeDef.scale, typeDef.scale);
        }

        this.mesh.position.set(x * TILE_SIZE, y * TILE_SIZE, z * TILE_SIZE);
        
        // [NEW] Link mesh back to this class for Raycasting
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.userData.parentInteractable = this;
            }
        });
        this.mesh.userData.parentInteractable = this;

        scene.add(this.mesh);
    }

    // [NEW] Helper to set position
    setPosition(pos) {
        this.mesh.position.copy(pos);
    }
    
    // [NEW] Helper to rotate
    rotate(axis, amount) {
        this.mesh.rotation[axis] += amount;
    }
}