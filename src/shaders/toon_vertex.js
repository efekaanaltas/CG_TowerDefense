export const toon_vertex = `
out vec3 vNormal;
out vec3 vViewPosition;
out vec3 vWorldPosition;

void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vViewPosition = cameraPosition - worldPosition.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;