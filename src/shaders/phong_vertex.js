export const phong_vertex = `
    out vec2 vUv;
    out vec3 vViewPosition;
    out vec3 vNormal;
    out vec3 vWorldPosition;
    out vec3 vColor;

    in vec4 tangent;

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

        vNormal = normalize(mat3(modelMatrix) * normal);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;