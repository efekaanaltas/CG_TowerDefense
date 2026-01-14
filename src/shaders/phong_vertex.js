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
        
        vViewPosition = cameraPosition - worldPosition.xyz;

        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

        vec3 transformedTangent = normalize((modelMatrix * vec4(tangent.xyz, 0.0)).xyz);
        vec3 transformedBitangent = normalize(cross(vNormal, transformedTangent) * tangent.w);

        vTangent = transformedTangent;
        vBitangent = transformedBitangent;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;