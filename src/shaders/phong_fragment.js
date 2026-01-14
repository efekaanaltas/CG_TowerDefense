export const phong_fragment = `
    uniform sampler2D map;
    uniform sampler2D normalMap;
    uniform sampler2D specularMap;
    uniform sampler2D displacementMap;
    uniform sampler2D envMap;
    
    uniform float uShininess;
    uniform float uMetallic;
    uniform float uOpacity;         // [NEW] Global Opacity
    uniform float uAlphaTest;       // [NEW] Cutoff threshold

    // ... Lights Structs (Same as before) ...
    struct DirLight { vec3 direction; vec3 color; };
    struct SpotLight { vec3 position; vec3 direction; vec3 color; float cutOff; float decay; };
    uniform DirLight dirLight;
    uniform SpotLight spotLight;
    uniform vec3 ambientColor;

    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vWorldPosition;
    varying vec3 vColor;

    vec2 equirectangularMapping(vec3 dir) {
        vec2 uv = vec2(atan(dir.z, dir.x), asin(dir.y));
        uv *= vec2(0.1591, 0.3183); // inv(2*PI), inv(PI)
        uv += 0.5;
        return uv;
    }

    void main() {
        // ... (Keep Parallax, Alpha, Normal Map logic exactly as before) ...
        vec2 coords = vUv; 
        vec4 textureColor = texture2D(map, coords);
        vec3 finalBaseColor = textureColor.rgb * vColor;
        float finalAlpha = textureColor.a * uOpacity;
        if (finalAlpha < uAlphaTest) discard;

        // Normal Mapping
        vec3 viewDir = normalize(vViewPosition); // Vector TO camera
        mat3 tbn = mat3(normalize(vTangent), normalize(vBitangent), normalize(vNormal));
        vec3 normalMapVal = texture2D(normalMap, vWorldPosition.xz).rgb * 2.0 - 1.0;
        vec3 normal = normalize(tbn * normalMapVal);

        // Specular Map (controls both shininess and reflection strength)
        float specularStrength = texture2D(specularMap, coords).r;

        // --- [NEW] ENVIRONMENT REFLECTION LOGIC ---
        
        // 1. Calculate Reflection Vector (from camera hitting surface and bouncing off)
        // Note: reflect() expects incident vector (Camera -> Surface), so we use -viewDir
        vec3 reflectDir = reflect(-viewDir, normal);

        // 2. Convert 3D vector to 2D UVs for the skybox texture
        vec2 envUV = equirectangularMapping(normalize(reflectDir));

        // 3. Sample the skybox
        vec3 envColor = texture2D(envMap, envUV).rgb;

        // 4. Mix Reflection
        // We use uMetallic * specularStrength to mask where reflections appear.
        // (e.g. Dirt doesn't reflect, Metal does)
        vec3 reflection = envColor * uMetallic;// * specularStrength;
        
        // ------------------------------------------

        // Lighting (Blinn-Phong)
        vec3 ambient = ambientColor * finalBaseColor;

        vec3 lightDir = normalize(dirLight.direction);
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * dirLight.color;
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
        vec3 specular = dirLight.color * spec * specularStrength;

        // Spot Light (Keep existing logic...)
        vec3 spotDir = normalize(spotLight.position - vWorldPosition);
        float theta = dot(spotDir, normalize(-spotLight.direction));
        float intensity = clamp((theta - spotLight.cutOff) / (1.0 - spotLight.cutOff), 0.0, 1.0);
        float dist = length(spotLight.position - vWorldPosition);
        float att = 1.0 / (1.0 + 0.09 * dist + 0.032 * (dist * dist));
        vec3 diffuseSpot = max(dot(normal, spotDir), 0.0) * spotLight.color * intensity * att;
        vec3 halfwaySpot = normalize(spotDir + viewDir);
        vec3 specularSpot = spotLight.color * pow(max(dot(normal, halfwaySpot), 0.0), uShininess) * specularStrength * intensity * att;

        // COMBINE
        // Add reflection to the final calculation
        vec3 finalColor = ambient + (diffuse + diffuseSpot) * finalBaseColor + (specular + specularSpot) + reflection;

        gl_FragColor = vec4(finalColor, finalAlpha);
    }
    `;