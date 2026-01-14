export const toon_fragment = `
precision highp float;
precision highp int;

uniform vec3 ambientColor;
uniform vec3 materialColor;
uniform vec3 uEmissive;

struct DirLight { vec3 direction; vec3 color; };
struct SpotLight { vec3 position; vec3 direction; vec3 color; float cutOff; float decay; };

uniform DirLight dirLight;
uniform SpotLight spotLight;

in vec3 vNormal;
in vec3 vWorldPosition;

out vec4 pc_fragColor;

void main() {
    vec3 norm = normalize(vNormal);
    
    vec3 lightDir = normalize(dirLight.direction);
    float diff = max(dot(norm, lightDir), 0.0);
    
    vec3 tone;
    if (diff > 0.9) tone = vec3(1.0);
    else if (diff > 0.5) tone = vec3(0.7);
    else if (diff > 0.25) tone = vec3(0.4);
    else tone = vec3(0.2);
    
    vec3 dirLightEffect = materialColor * dirLight.color * tone;

    vec3 spotDirVector = normalize(spotLight.position - vWorldPosition);
    float theta = dot(spotDirVector, normalize(-spotLight.direction));
    
    vec3 spotEffect = vec3(0.0);
    
    if (theta > spotLight.cutOff) {
        float dist = length(spotLight.position - vWorldPosition);
        float att = 1.0 / (1.0 + 0.05 * dist + 0.01 * (dist * dist));
        
        float spotDiff = max(dot(norm, spotDirVector), 0.0);
        
        float strength = spotDiff * att;
        float spotTone = 0.0;
        
        if (strength > 0.5) spotTone = 1.0;      
        else if (strength > 0.15) spotTone = 0.5; 

        spotEffect = spotLight.color * spotTone * 2.0; 
    }

    vec3 finalColor = (ambientColor * materialColor) + dirLightEffect + spotEffect + uEmissive;
    
    pc_fragColor = vec4(2.0*finalColor, 1.0);
}
`;