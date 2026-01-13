import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ResourceManager {
    constructor(shaderManager) {
        this.assets = new Map(); // Yüklenen modelleri burada saklayacağız
        this.loader = new GLTFLoader();
        this.shaderManager = shaderManager; 
    }

    // Tüm modelleri yükleyen fonksiyon
    async loadAll(paths) {
        const promises = [];
        for (const [key, url] of Object.entries(paths)) {
            const p = new Promise((resolve, reject) => {
                this.loader.load(url, (gltf) => {
                    // Gölgeleri aç
                    gltf.scene.traverse((child) => {
                        if (child.isMesh) {
                            if (this.shaderManager) {
                                this.shaderManager.applyCustomMaterial(child);
                            }
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    // [ÖNEMLİ] Sadece gltf.scene değil, TÜM GLTF objesini saklıyoruz
                    // Çünkü animasyonlar gltf.animations içinde duruyor.
                    this.assets.set(key, gltf); 
                    
                    console.log(`Model loaded: ${key}`);
                    resolve();
                }, undefined, reject);
            });
            promises.push(p);
        }
        await Promise.all(promises);
    }

    // Modelin bir kopyasını (Clone) döndürür
    getModel(key) {
        const gltf = this.assets.get(key); // Artık bu bir GLTF objesi
        
        if (!gltf) {
            console.warn(`Model not found: ${key}`);
            return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xff0000}));
        }

        // Modeli kopyala (Scene graph)
        const clone = gltf.scene.clone();

        // [HİLE BURADA] Orijinal animasyonları klonlanan mesh'e "yama" yapıyoruz.
        // Böylece Building.js içinde this.mesh.animations diyebileceğiz.
        clone.animations = gltf.animations;

        return clone; // Hala tek bir obje (Mesh/Group) dönüyor, yapın bozulmadı.
    }
}