export const phong_fragment = `
    precision highp float;
    precision highp int;

    uniform sampler2D map;
    uniform sampler2D normalMap;
    uniform sampler2D specularMap;
    uniform sampler2D envMap;
    
    uniform float uShininess;
    uniform float uMetallic;
    uniform float uOpacity;         
    uniform float uAlphaTest;
    uniform float uNormalScale;
    
    uniform vec3 uEmissive;

    struct DirLight { vec3 direction; vec3 color; };
    struct SpotLight { vec3 position; vec3 direction; vec3 color; float cutOff; float decay; };
    uniform DirLight dirLight;
    uniform SpotLight spotLight;
    uniform vec3 ambientColor;

    in vec2 vUv;
    in vec3 vViewPosition; 
    in vec3 vNormal;       
    in vec3 vWorldPosition;
    in vec3 vColor;

    out vec4 pc_fragColor;

    vec2 equirectangularMapping(vec3 dir) {
        vec2 uv = vec2(atan(dir.z, dir.x), asin(dir.y));
        uv *= vec2(0.1591, 0.3183); 
        uv += 0.5;
        return uv;
    }

    vec3 getTriplanarNormal(vec3 worldPos, vec3 surfNormal, float scale) {
        vec3 blend = abs(surfNormal);
        blend = pow(blend, vec3(4.0)); 
        float b = (blend.x + blend.y + blend.z);
        blend /= b;

        vec3 tx = texture(normalMap, worldPos.zy * scale).rgb * 2.0 - 1.0;
        vec3 ty = texture(normalMap, worldPos.xz * scale).rgb * 2.0 - 1.0;
        vec3 tz = texture(normalMap, worldPos.xy * scale).rgb * 2.0 - 1.0;

        tx.xy *= uNormalScale;
        ty.xy *= uNormalScale;
        tz.xy *= uNormalScale;

        tx = normalize(tx);
        ty = normalize(ty);
        tz = normalize(tz);

        vec3 nx = vec3(tx.z, tx.y, tx.x); 
        vec3 ny = vec3(ty.x, ty.z, ty.y); 
        vec3 nz = vec3(tz.x, tz.y, tz.z);

        return normalize(nx * blend.x + ny * blend.y + nz * blend.z);
    }

    void main() {
        vec2 coords = vUv; 
        
        vec4 textureColor = texture(map, coords);
        vec3 finalBaseColor = textureColor.rgb * vColor;
        float finalAlpha = textureColor.a * uOpacity;
        if (finalAlpha < uAlphaTest) discard;

        // Triplanar Normal
        vec3 normal = getTriplanarNormal(vWorldPosition, normalize(vNormal), 0.5);
        
        vec3 viewDir = normalize(vViewPosition);
        float specularStrength = texture(specularMap, coords).r;

        vec3 reflectDir = reflect(-viewDir, normal);
        vec2 envUV = equirectangularMapping(normalize(reflectDir));
        vec3 envColor = texture(envMap, envUV).rgb;
        vec3 reflection = envColor * uMetallic;

        vec3 ambient = ambientColor * finalBaseColor;

        vec3 lightDir = normalize(dirLight.direction);
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * dirLight.color;
        
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
        vec3 specular = dirLight.color * spec * specularStrength;

        vec3 spotDir = normalize(spotLight.position - vWorldPosition);
        float theta = dot(spotDir, normalize(-spotLight.direction));
        float intensity = clamp((theta - spotLight.cutOff) / (1.0 - spotLight.cutOff), 0.0, 1.0);
        float dist = length(spotLight.position - vWorldPosition);
        float att = 1.0 / (1.0 + 0.09 * dist + 0.032 * (dist * dist));
        
        vec3 diffuseSpot = max(dot(normal, spotDir), 0.0) * 10.0 * spotLight.color * intensity * att;
        vec3 halfwaySpot = normalize(spotDir + viewDir);
        vec3 specularSpot = 10.0 * spotLight.color * pow(max(dot(normal, halfwaySpot), 0.0), uShininess) * specularStrength * intensity * att;

        vec3 finalColor = ambient + (diffuse + diffuseSpot) * finalBaseColor + (specular + specularSpot) + reflection/2.0 + uEmissive;

        pc_fragColor = vec4(finalColor, finalAlpha);
    }
`;