export const toon_fragment = `
uniform vec3 ambientColor;
uniform vec3 materialColor;

struct DirLight { vec3 direction; vec3 color; };
struct SpotLight { vec3 position; vec3 direction; vec3 color; float cutOff; float decay; };

uniform DirLight dirLight;
uniform SpotLight spotLight;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
    vec3 norm = normalize(vNormal);
    
    // 1. DIRECTIONAL LIGHT (Discrete)
    vec3 lightDir = normalize(dirLight.direction);
    float diff = max(dot(norm, lightDir), 0.0);
    
    vec3 tone;
    if (diff > 0.9) tone = vec3(1.0);
    else if (diff > 0.5) tone = vec3(0.7);
    else if (diff > 0.25) tone = vec3(0.4);
    else tone = vec3(0.2);
    
    vec3 dirLightEffect = materialColor * dirLight.color * tone;

    // 2. SPOTLIGHT (Discrete / Banded)
    vec3 spotDirVector = normalize(spotLight.position - vWorldPosition);
    float theta = dot(spotDirVector, normalize(-spotLight.direction));
    
    vec3 spotEffect = vec3(0.0);
    
    // Hard Cutoff for the cone edge
    if (theta > spotLight.cutOff) {
        float dist = length(spotLight.position - vWorldPosition);
        float att = 1.0 / (1.0 + 0.05 * dist + 0.01 * (dist * dist));
        
        float spotDiff = max(dot(norm, spotDirVector), 0.0);
        
        // Combine intensity and snap to discrete bands
        float strength = spotDiff * att;
        float spotTone = 0.0;
        
        if (strength > 0.5) spotTone = 1.0;      // Bright Center
        else if (strength > 0.15) spotTone = 0.5; // Mid Band
        // else 0.0 (Dark)

        spotEffect = spotLight.color * spotTone * 2.0; // 2.0 boost for visibility
    }

    vec3 finalColor = (ambientColor * materialColor) + dirLightEffect + spotEffect;
    gl_FragColor = vec4(2.0*finalColor, 1.0);
}
`;