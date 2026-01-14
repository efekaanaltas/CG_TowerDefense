import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ResourceManager {
    constructor(shaderManager) {
        this.assets = new Map();
        this.loader = new GLTFLoader();
        this.shaderManager = shaderManager;
    }

    async loadAll(paths) {
        const promises = [];
        for (const [key, url] of Object.entries(paths)) {
            const p = new Promise((resolve, reject) => {
                this.loader.load(url, (gltf) => {
                    gltf.scene.traverse((child) => {
                        if (child.isMesh) {
                            if (this.shaderManager) {
                                this.shaderManager.applyCustomMaterial(child);
                            }
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    this.assets.set(key, gltf); 
                    
                    console.log(`Model loaded: ${key}`);
                    resolve();
                }, undefined, reject);
            });
            promises.push(p);
        }
        await Promise.all(promises);
    }

    getModel(key) {
        const gltf = this.assets.get(key);
        
        if (!gltf) {
            console.warn(`Model not found: ${key}`);
            return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xff0000}));
        }

        const clone = gltf.scene.clone();
        clone.animations = gltf.animations;

        return clone;
    }
}