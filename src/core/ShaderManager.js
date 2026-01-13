import * as THREE from 'three';
import { phong_vertex } from '../shaders/phong_vertex.js';
import { phong_fragment } from '../shaders/phong_fragment.js';

export class ShaderManager {
    constructor(scene) {
        this.scene = scene;

        const texLoader = new THREE.TextureLoader();
        this.globalNormalMap = texLoader.load('/assets/normal.jpg');
        
        // 2. [NEW] Configure it to repeat/tile
        // This prevents it from looking stretched on large objects like the ground
        this.globalNormalMap.wrapS = THREE.RepeatWrapping;
        this.globalNormalMap.wrapT = THREE.RepeatWrapping;
        
        // ... (Keep your globalUniforms defined as before)
        this.globalUniforms = {
            ambientColor: { value: new THREE.Color(0x404040) },
            dirLight: { 
                value: { 
                    direction: new THREE.Vector3(10, 20, 10).normalize(), 
                    color: new THREE.Color(0xffffff) 
                } 
            },
            spotLight: { 
                value: { 
                    position: new THREE.Vector3(0, 10, 0),
                    direction: new THREE.Vector3(0, -1, 0),
                    color: new THREE.Color(0xffaa00),
                    cutOff: Math.cos(Math.PI / 6),
                    decay: 2.0
                } 
            },
            envMap: { value: null }
        };
        this.currentShaderDef = {vertexShader: phong_vertex, fragmentShader: phong_fragment};
    }

    // ... (Keep update and switchShader as before)

applyCustomMaterial(mesh) {
        const oldMat = mesh.material;
        const geom = mesh.geometry;
        
        // ... (Keep existing Tangent/Geometry safeguards) ...
        const hasUV = geom.attributes.uv !== undefined;
        const hasNormal = geom.attributes.normal !== undefined;
        const hasIndex = geom.index !== null;

        if (hasUV && hasNormal && hasIndex) {
            if (!geom.attributes.tangent) geom.computeTangents();
        } else {
            const count = geom.attributes.position.count;
            const tangents = new Float32Array(count * 4);
            for (let i = 0; i < count * 4; i++) tangents[i] = 1;
            geom.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));
        }

        // ... (Keep Map setup) ...
        let map;
        if (oldMat.map) map = oldMat.map;
        else if (oldMat.color) map = this._createPlaceholderTexture(oldMat.color.getHex());
        else map = this._createPlaceholderTexture(0xffffff);

        // --- [NEW] NORMAL MAP LOGIC ---
        // If the object has its own normal map, use it.
        // If NOT, use our new globalNormalMap instead of the flat blue placeholder.
        const normalMap = oldMat.normalMap || this.globalNormalMap;
        // -----------------------------

        const specularMap = (oldMat.roughnessMap || oldMat.metalnessMap) || this._createPlaceholderTexture(0x000000);
        
        const hasVertexColors = geom.attributes.color !== undefined;
        const isTransparent = oldMat.transparent; 
        const opacity = oldMat.opacity !== undefined ? oldMat.opacity : 1.0;

        const newMaterial = new THREE.ShaderMaterial({
            vertexShader: this.currentShaderDef.vertexShader,
            fragmentShader: this.currentShaderDef.fragmentShader,
            uniforms: {
                ...this.globalUniforms,
                map: { value: map },
                normalMap: { value: this.globalNormalMap },
                specularMap: { value: specularMap },
                displacementMap: { value: this._createPlaceholderTexture(0x000000) },
                
                uShininess: { value: 64.0 },
                uMetallic: { value: 0.5 },
                uOpacity: { value: opacity },
                uAlphaTest: { value: 0.5 }
            },
            vertexColors: hasVertexColors,
            defines: { USE_COLOR: hasVertexColors },
            transparent: isTransparent,
            side: THREE.DoubleSide
        });

        mesh.material = newMaterial;
        mesh.castShadow = !isTransparent;
        mesh.receiveShadow = true;
    }

    update(time) {
        // [NEW] Keep the environment map synced with the scene background
        // This ensures that as soon as the skybox loads, the objects start reflecting it.
        if (this.scene.background && this.scene.background.isTexture) {
            this.globalUniforms.envMap.value = this.scene.background;
        }
    }

    _createPlaceholderTexture(hexColor) {
        if (!this.placeholders) this.placeholders = {};
        if (this.placeholders[hexColor]) return this.placeholders[hexColor];

        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#' + hexColor.toString(16).padStart(6, '0');
        ctx.fillRect(0,0,1,1);
        
        const tex = new THREE.CanvasTexture(canvas);
        this.placeholders[hexColor] = tex;
        return tex;
    }
}