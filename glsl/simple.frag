#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(set = 1, binding = 1) uniform sampler2D texSampler;

layout(location = 0) in vec2 texel;
layout(location = 1) in vec3 normal_cameraspace;
layout(location = 2) in vec3 position_worldSpace;
layout(location = 3) in vec3 eyeDirection_cameraspace;
layout(location = 4) in vec3 lightDirection_cameraspace;

layout(location = 0) out vec4 outColor;

void main() {
    vec3 lightColor = vec3(1.0, 1.0, 1.0);
    vec3 specularColor = vec3(1.0, 1.0, 1.0);

    // Normal of the computed fragment, in camera space
    vec3 n = normalize(normal_cameraspace);
    // Direction of the light (from the fragment to the light)
    vec3 l = normalize(lightDirection_cameraspace);
    // Eye vector (towards the camera)
    vec3 E = normalize(eyeDirection_cameraspace);
    // Direction in which the triangle reflects the light
    vec3 R = reflect(-l, n);

    // Cosine of the angle between the Eye vector and the Reflect vector,
    // clamped to 0
    //  - Looking into the reflection -> 1
    //  - Looking elsewhere -> < 1
    float cosAlpha = clamp(dot(E ,R), 0, 1);

    // Cosine of the angle between the normal and the light direction,
    // clamped above 0
    //  - light is at the vertical of the triangle -> 1
    //  - light is perpendicular to the triangle -> 0
    //  - light is behind the triangle -> 0
    float cosTheta = clamp(dot(n, l), 0, 1);

    vec4 tcolor = texture(texSampler, texel); //vec4(texel, 0.0, 1.0);

    vec3 MaterialAmbientColor = vec3(0.1, 0.1, 0.1) * tcolor.rgb;

    vec3 color = MaterialAmbientColor + 
        tcolor.rgb * lightColor * cosTheta;
        //specularColor * lightColor * pow(cosAlpha, 5);

    outColor = vec4(color, tcolor.a);

}