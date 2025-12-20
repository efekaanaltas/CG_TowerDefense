import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ResourceManager {
    constructor() {
        this.assets = new Map(); // Yüklenen modelleri burada saklayacağız
        this.loader = new GLTFLoader();
    }

    // Tüm modelleri yükleyen fonksiyon
    async loadAll(paths) {
        const promises = [];

        for (const [key, url] of Object.entries(paths)) {
            const p = new Promise((resolve, reject) => {
                this.loader.load(
                    url,
                    (gltf) => {
                        // Modelin gölgelerini aç
                        gltf.scene.traverse((child) => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        this.assets.set(key, gltf.scene);
                        console.log(`Model loaded: ${key}`);
                        resolve();
                    },
                    undefined, // Progress callback (istenirse eklenebilir)
                    (error) => {
                        console.error(`Error loading ${key}:`, error);
                        reject(error);
                    }
                );
            });
            promises.push(p);
        }

        // Hepsinin bitmesini bekle
        await Promise.all(promises);
    }

    // Modelin bir kopyasını (Clone) döndürür
    getModel(key) {
        const original = this.assets.get(key);
        if (!original) {
            console.warn(`Model not found: ${key}`);
            // Model bulunamazsa yedek olarak kırmızı bir küp döndür
            return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xff0000}));
        }
        return original.clone();
    }
}