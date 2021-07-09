#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(binding = 0) uniform UniformBufferObject {
    mat4 proj;
    mat4 view;
} ubo;

layout(set = 2, binding = 2) uniform AssetUniformBufferObject { 
    mat4 model;
} a;

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec2 inTexel;

layout(location = 0) out vec2 texel;
layout(location = 1) out vec3 normal_cameraspace;
layout(location = 2) out vec3 position_worldSpace;
layout(location = 3) out vec3 eyeDirection_cameraspace;
layout(location = 4) out vec3 lightDirection_cameraspace;

void main() {
    vec3 light = vec3(0, -10.0, -10.0);

    gl_Position = ubo.proj * ubo.view * a.model * vec4(inPosition, 1.0);

    // Position of the vertex, in worldspace : M * position
    position_worldSpace = (a.model * vec4(inPosition, 1.0)).xyz;
    
    // Vector that goes from the vertex to the camera, in camera space.
    // In camera space, the camera is at the origin (0,0,0).
    vec3 vertexPosition_cameraspace  = (ubo.view * a.model * vec4(inPosition, 1.0)).xyz;
    eyeDirection_cameraspace = vec3(0,0,0) - vertexPosition_cameraspace ;

    // Vector that goes from the vertex to the light, in camera space. M is ommited because it's identity.
    vec3 lightPosition_cameraspace = (ubo.view * vec4(light, 1.0)).xyz;
    lightDirection_cameraspace = lightPosition_cameraspace + eyeDirection_cameraspace;

    // Normal of the the vertex, in camera space
    normal_cameraspace = (ubo.view * a.model * vec4(inNormal, 0)).xyz; // Only correct if ModelMatrix does not scale the model ! Use its inverse transpose if not.

    texel = inTexel;
}