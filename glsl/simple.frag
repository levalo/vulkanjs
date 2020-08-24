#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(set = 1, binding = 1) uniform sampler2D texSampler;

layout(location = 0) in vec2 texel;

layout(location = 0) out vec4 outColor;

void main() {
    outColor = texture(texSampler, texel); //vec4(texel, 0.0, 1.0);
}