import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ResourceManager {
    constructor(shaderManager) { // Inject ShaderManager
        this.assets = new Map();
        this.loader = new GLTFLoader();
        this.shaderManager = shaderManager; 
    }

    async loadAll(paths) {
        const promises = [];

        for (const [key, url] of Object.entries(paths)) {
            const p = new Promise((resolve, reject) => {
                this.loader.load(
                    url,
                    (gltf) => {
                        // Traverse and convert materials immediately
                        gltf.scene.traverse((child) => {
                            if (child.isMesh) {
                                // Apply our custom shader!
                                if (this.shaderManager) {
                                    this.shaderManager.applyCustomMaterial(child);
                                }
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        
                        this.assets.set(key, gltf.scene);
                        //this.debugGLTF(key);
                        console.log(`Model loaded and shader applied: ${key}`);
                        resolve();
                    },
                    undefined,
                    (error) => {
                        console.error(`Error loading ${key}:`, error);
                        reject(error);
                    }
                );
            });
            promises.push(p);
        }

        await Promise.all(promises);
    }

    getModel(key) {
        const original = this.assets.get(key);
        if (!original) {
            console.warn(`Model not found: ${key}`);
            return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xff0000}));
        }
        // Clone logic is tricky with custom shaders if uniforms aren't cloned deeply.
        // For simplicity, SkeletonUtils.clone is better, but here simple clone() works 
        // because we want them to share the same Light Uniforms references, 
        // but have unique Position/Maps.
        const clone = original.clone(true); 
        
        // Re-bind uniforms that might need to be unique per instance if you change them later (like opacity)
        // But for lights, sharing references is actually good.
        return clone;
    }

    // Add this helper method to ResourceManager.js
    debugGLTF(key) {
        const model = this.assets.get(key);
        if (!model) {
            console.warn(`Model ${key} not found.`);
            return;
        }

        console.group(`🔎 Inspecting Model: ${key}`);
        model.traverse((child) => {
            if (child.isMesh) {
                console.group(`Mesh: ${child.name || 'Unnamed'}`);
                console.log("Geometry Attributes:", child.geometry.attributes);
                
                // Check Material Properties
                const mat = child.material; // This might be your Custom Shader or the original PBR
                if (mat.uniforms) {
                    console.log("Shader Uniforms:", mat.uniforms);
                    console.log("Defines:", mat.defines);
                } else {
                    console.log("Original Material:", mat);
                    console.log(" - Map (Diffuse):", mat.map);
                    console.log(" - Color:", mat.color);
                    console.log(" - Vertex Colors:", child.geometry.attributes.color ? "YES" : "NO");
                    console.log(" - Transparent:", mat.transparent);
                    console.log(" - Opacity:", mat.opacity);
                }
                console.groupEnd();
            }
        });
        console.groupEnd();
    }
}