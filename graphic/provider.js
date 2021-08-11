import { mat4, quat, vec3 } from 'gl-matrix';
import { VulkanWindow } from 'nvk';
import fs from 'fs';
import { Obj } from '../common/obj';
import { DESCRIPTOR_TYPES, SHADER_TYPES, FORMATS, vkContext } from './vulkan/context';

const MAT4_BYTE_LENGTH = mat4.create().byteLength;

export function GraphicProvider() {
    const window = new VulkanWindow({
        width: 480,
        height: 320,
        title: "example"
    });

    const projOffset = 0;
    const viewOffset = MAT4_BYTE_LENGTH;
    const assets = [];

    const vk = vkContext(window);

    const [ models, verticesBuffer, indicesBuffer ] = loadModels(vk);
    const textures = loadTextures(vk);

    const uniformBuffer = vk.createUniformBuffer(new Float32Array(102 * 16).fill(0));

    const [ projLayout, projSet ] = vk.createBufferDescriptorSet(DESCRIPTOR_TYPES.uniform, SHADER_TYPES.vert, uniformBuffer);
    const [ viewLayout, viewSet ] = vk.createBufferDescriptorSet(DESCRIPTOR_TYPES.uniform, SHADER_TYPES.vert, uniformBuffer);
    const [ modelLayout, modelSet ] = vk.createBufferDescriptorSet(DESCRIPTOR_TYPES.uniform, SHADER_TYPES.vert, uniformBuffer);
    const [ textureLayout, textureSet ] = vk.createTexturesDescriptorSet(DESCRIPTOR_TYPES.texture, SHADER_TYPES.frag, Object.values(textures));
    
    const shaderStages = vk.createShaderStages('mesh');
    const shaderAttributes = [
        { format: FORMATS.rgb, offset: 0, size: 3 },
        { format: FORMATS.rgb, offset: 3, size: 3 },
        { format: FORMATS.rg, offset: 6, size: 2 }
    ];
    const pipelineLayout = vk.createPipelineLayout(
        [ projLayout, viewLayout, modelLayout, textureLayout ],
        1, Int32Array.BYTES_PER_ELEMENT
    );

    let graphicsPipeline;

    vk.setOnSwapchainRecreateHandler(() => {
        vk.cleanupSwapchain([ graphicsPipeline ]);

        initSwapchain();
    });

    const initSwapchain = () => {
        vk.createSwapchain();

        graphicsPipeline = vk.createPipeline(pipelineLayout, shaderStages, shaderAttributes, Float32Array.BYTES_PER_ELEMENT);

        vk.writeCommandBuffers((frameBuffer, commandBuffer) => {
            vk.beginRenderPass(frameBuffer, commandBuffer);
            
            vk.beginRenderPass(frameBuffer, commandBuffer);
            
            vk.bindPipeline(commandBuffer, graphicsPipeline);

            Object.values(models).forEach(model => {
                
                model.assets.forEach(asset => {
                    vk.pushConstants(commandBuffer, pipelineLayout, SHADER_TYPES.frag, 0, new Int32Array([ 0 ]));

                    vk.bindDescriptorSet(commandBuffer, pipelineLayout, 0, [projSet, viewSet, modelSet], 
                        3, new Uint32Array([ projOffset, viewOffset, assets[asset].offset ]));
                    
                    vk.bindDescriptorSet(commandBuffer, pipelineLayout, 3, [ textureSet ], 0, null);
                    
                    vk.bindVertexBuffer(commandBuffer, 0, 1, [ verticesBuffer ], new BigUint64Array([ BigInt(model.verticesOffset) ]));
                    vk.bindIndexBuffer(commandBuffer, indicesBuffer, model.indicesOffset);

                    vk.drawIndexed(commandBuffer, model.indicesCount, model.assets.length);
                });
            });

            vk.endRenderPass(commandBuffer);
        });
        
        const projectionMatrix = computeProjectionMatrix(vk.getCurrentSwapchain());

        vk.updateBuffer(uniformBuffer, projectionMatrix, projOffset);
    }

    const createLoop = (cb) => {
        initSwapchain();

        window.onresize = () => {
            vk.frameBufferResized(true);
        }

        window.focus();

        const loop = setInterval(() => {
            window.pollEvents();

            cb();

            if (window.shouldClose()) {
                clearInterval(loop);

                return;
            }
            
            vk.drawFrame();
        }, 1000 / 60);

        return loop;
    }

    const updateCamera = (position, target) => {
        const viewMatrix = computeViewMatrix({ position, target });

        vk.updateBuffer(uniformBuffer, viewMatrix, viewOffset);
    }

    const createAsset = ({ modelName, texture, position, rotation, scale }) => {
        const matrix = computeModelMatrix({ position, rotation, scale });

        const asset = { 
            texture, position, rotation, scale, 
            byteLength: matrix.byteLength, 
            length: matrix.length, 
            offset: assets.reduce((acc, x) => acc + x.byteLength, MAT4_BYTE_LENGTH + matrix.byteLength)
        };

        vk.updateBuffer(uniformBuffer, matrix, asset.offset);

        const assetIndex = assets.push(asset) - 1;

        models[modelName].assets.push(assetIndex);

        return asset;
    }

    const updateAsset = (asset) => {
        const modelMatrix = computeModelMatrix(asset);
        
        vk.updateBuffer(uniformBuffer, modelMatrix, asset.offset);
    }

    if (global.debug) {
        vk.setupDebugMessenger();
    }

    return {
        updateCamera,
        createAsset,
        updateAsset,
        createLoop
    }
}

function computeProjectionMatrix(swapchain) {
    const aspect = swapchain.swapchainExtent.width / swapchain.swapchainExtent.height;
    const zNear = 0.1;
    const zFar = 4096.0;
    const fov = 45 * Math.PI / 180;
    const projectionMatrix = mat4.create();

    mat4.perspective(projectionMatrix, fov, aspect, zNear, zFar);

    return projectionMatrix;
}

function computeViewMatrix({ position = {x: 0, y: 0, z: 0}, target = {x: 0, y: 0, z: 0} }) {
    const viewMatrix = mat4.create();

    mat4.lookAt(viewMatrix, [position.x, position.y, position.z], [target.x, target.y, target.z], [0, 1, 0]);

    return viewMatrix;
}

function computeModelMatrix({ position = {x: 0, y: 0, z: 0}, rotation = {x: 0, y: 0, z: 0}, scale = {x: 1, y: 1, z: 1} }) {
    const modelViewMatrix = mat4.create();
    const translate = vec3.fromValues(position.x, position.y, position.z);
    const rotationQuat = quat.create();
    const rotationMatrix = mat4.create();

    mat4.translate(modelViewMatrix, modelViewMatrix, translate);
    quat.fromEuler(rotationQuat, rotation.x, rotation.y, rotation.z);
    mat4.fromQuat(rotationMatrix, rotationQuat);
    mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
    mat4.scale(modelViewMatrix, modelViewMatrix, [scale.x, scale.y, scale.z]);

    return modelViewMatrix;
}

function loadModels(vk) {
    const modelFiles = fs.readdirSync(`models`);
    const data = [];

    modelFiles.forEach(x => { 
        const { indices, vertices } = Obj(`models/${x}`);

        data.push({ vertices, indices, name: x });
    });

    const verticesData = new Float32Array(data.reduce((acc, x) => acc + x.vertices.length, 0));
    const indicesData = new Uint16Array(data.reduce((acc, x) => acc + x.indices.length, 0));
    const models = {};

    data.forEach(({ indices, vertices, name }, i) => {
        models[name] = {
            index: i,
            name: name,
            verticesOffset: vertices.byteLength * i,
            verticesCount: vertices.length,
            verticesSize: vertices.byteLength,
            indicesOffset: indices.byteLength * i,
            indicesCount: indices.length,
            indicesSize: indices.byteLength,
            assets: []
        };

        verticesData.set(vertices);
        indicesData.set(indices);
    });

    const verticesBuffer = vk.createVertexBuffer(verticesData);
    const indicesBuffer = vk.createIndexBuffer(indicesData);

    return [ models, verticesBuffer, indicesBuffer ];
}

function loadTextures(vk) {
    const textureFiles = fs.readdirSync(`textures`);
    const textures = {};

    textureFiles.forEach((x, i) => {
        textures[x] = vk.createTextureImage(`textures/${x}`);
    })

    return textures;
}