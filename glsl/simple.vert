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
layout(location = 1) in vec2 inTexel;

layout(location = 0) out vec2 texel;

void main() {
    gl_Position = ubo.proj * ubo.view * a.model * vec4(inPosition, 1.0);
    texel = inTexel;
}