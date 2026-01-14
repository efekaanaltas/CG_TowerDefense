export const phong_vertex = `
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vWorldPosition;
    varying vec3 vColor;

    attribute vec4 tangent;

    void main() {
        vUv = uv;
        
        #ifdef USE_COLOR
            vColor = color;
        #else
            vColor = vec3(1.0);
        #endif

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // [CHANGED] Calculate vViewPosition as vector from Surface TO Camera (World Space)
        vViewPosition = cameraPosition - worldPosition.xyz;

        // [CHANGED] Transform Normal to WORLD SPACE instead of View Space
        // This fixes the view-dependency in triplanar mapping
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

        // We don't strictly need tangents for triplanar, but keeping them valid
        vec3 transformedTangent = normalize((modelMatrix * vec4(tangent.xyz, 0.0)).xyz);
        vec3 transformedBitangent = normalize(cross(vNormal, transformedTangent) * tangent.w);

        vTangent = transformedTangent;
        vBitangent = transformedBitangent;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;