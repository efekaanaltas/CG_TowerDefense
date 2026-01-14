import * as THREE from 'three';
import { phong_vertex } from '../shaders/phong_vertex.js';
import { phong_fragment } from '../shaders/phong_fragment.js';
import { toon_vertex } from '../shaders/toon_vertex.js';
import { toon_fragment } from '../shaders/toon_fragment.js';

export class ShaderManager {
    constructor(scene) {
        this.scene = scene;
        this.materials = []; 
        this.isAlternateShader = false;

        const texLoader = new THREE.TextureLoader();
        this.globalNormalMap = texLoader.load('/assets/normal.jpg');
        this.globalNormalMap.wrapS = THREE.RepeatWrapping;
        this.globalNormalMap.wrapT = THREE.RepeatWrapping;
        
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
                    position: new THREE.Vector3(0, 5, 0),
                    direction: new THREE.Vector3(0, -1, 0),
                    color: new THREE.Color(0xffaa00),
                    cutOff: Math.cos(Math.PI / 6), // 30 degrees
                    decay: 0.5
                } 
            },
            envMap: { value: null }
        };
        
        this.shaderDefs = {
            phong: { vertexShader: phong_vertex, fragmentShader: phong_fragment },
            toon: { vertexShader: toon_vertex, fragmentShader: toon_fragment }
        };
        
        this.currentShaderDef = this.shaderDefs.phong;
    }

    toggleShaders() {
        this.isAlternateShader = !this.isAlternateShader;
        const newDef = this.isAlternateShader ? this.shaderDefs.toon : this.shaderDefs.phong;

        console.log("Switching Shader to:", this.isAlternateShader ? "Toon" : "Phong");

        this.materials.forEach(mat => {
            mat.vertexShader = newDef.vertexShader;
            mat.fragmentShader = newDef.fragmentShader;
            
            if (this.isAlternateShader) {
                mat.uniforms.materialColor = { value: mat.userData.originalColor || new THREE.Color(0xffffff) };
            }

            mat.needsUpdate = true;
        });
    }

    // [NEW] Helper to update spotlight uniforms
    updateSpotLight(position, direction) {
        this.globalUniforms.spotLight.value.position.copy(position);
        this.globalUniforms.spotLight.value.direction.copy(direction);
        // No need to set needsUpdate for value changes on uniforms, strictly speaking, 
        // but often good practice if using non-shared structs. 
        // Since we share the object ref in globalUniforms, all materials update automatically.
    }

    applyCustomMaterial(mesh) {
        const oldMat = mesh.material;
        const geom = mesh.geometry;
        
        // ... (Tangents/Geometry Checks same as before) ...
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

        const originalColor = oldMat.color ? oldMat.color : new THREE.Color(0xffffff);

        let map;
        if (oldMat.map) map = oldMat.map;
        else if (oldMat.color) map = this._createPlaceholderTexture(oldMat.color.getHex());
        else map = this._createPlaceholderTexture(0xffffff);

        const normalMap = oldMat.normalMap || this.globalNormalMap;
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
                normalMap: { value: normalMap },
                specularMap: { value: specularMap },
                displacementMap: { value: this._createPlaceholderTexture(0x000000) },
                
                uShininess: { value: 64.0 },
                uMetallic: { value: 0.5 },
                uOpacity: { value: opacity },
                uAlphaTest: { value: 0.5 },

                uNormalScale: { value: 0.3 },
                
                materialColor: { value: originalColor }
            },
            vertexColors: hasVertexColors,
            defines: { USE_COLOR: hasVertexColors },
            transparent: isTransparent,
            side: THREE.DoubleSide
        });
        
        newMaterial.userData.originalColor = originalColor;
        this.materials.push(newMaterial);

        mesh.material = newMaterial;
        mesh.castShadow = !isTransparent;
        mesh.receiveShadow = true;
    }

    update(time) {
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