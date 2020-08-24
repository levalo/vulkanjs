import vulkanProvider from './graphic/vulkan-provider';
import { Obj } from './common/obj';

global.debug = true;

const { window, drawFrame, createVertexBuffer, createIndexBuffer, recreateSwapchain, createAsset, createTextureImage, initDescriptors, updateAsset } = vulkanProvider();
const { indices, mergedVertices } = Obj('models/barrel.obj');

let asset = createAsset({
    vertexBuffer: createVertexBuffer(new Float32Array([
        // Front face
        -1.0, -1.0,  1.0, 0.025,  0.01,
        1.0, -1.0,  1.0, 0.175,  0.01,
        1.0,  1.0,  1.0, 0.175,  0.175,
        -1.0,  1.0,  1.0, 0.025,  0.175,
        // Back face
        -1.0, -1.0, -1.0, 0.0,  0.0,
        -1.0,  1.0, -1.0, 1.0,  0.0,
        1.0,  1.0, -1.0, 1.0,  1.0,
        1.0, -1.0, -1.0, 0.0,  1.0,
        // Top face
        -1.0,  1.0, -1.0, 1.0,  0.0,
        -1.0,  1.0,  1.0, 1.0, -1.0,
        1.0,  1.0,  1.0, 0.0, -1.0,
        1.0,  1.0, -1.0, 0.0,  0.0,
        // Bottom face
        -1.0, -1.0, -1.0, 0.0,  0.0,
        1.0, -1.0, -1.0, 1.0,  0.0,
        1.0, -1.0,  1.0, 1.0, -1.0,
        -1.0, -1.0,  1.0, 0.0, -1.0,
        // Right face
        1.0, -1.0, -1.0, 0.0,  0.0,
        1.0,  1.0, -1.0, -1.0,  0.0,
        1.0,  1.0,  1.0, -1.0, -1.0,
        1.0, -1.0,  1.0, 0.0, -1.0,
        // Left face
        -1.0, -1.0, -1.0, 1.0,  0.0,
        -1.0, -1.0,  1.0, 1.0, -1.0,
        -1.0,  1.0,  1.0, 0.0, -1.0,
        -1.0,  1.0, -1.0, 0.0,  0.0
    ])),
    indexBuffer: createIndexBuffer(new Uint16Array([
        0,  1,  2,
        2,  3,  0,
        4,  5,  6,
        6,  7,  4,
        8,  9,  10,
        10, 11, 8,
        12, 13, 14,
        14, 15, 12,
        16, 17, 18,
        18, 19, 16,
        20, 21, 22,
        22, 23, 20
    ])),
    texture: createTextureImage('textures/barrel_tx_base.png'),
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 5 }
});

initDescriptors();

recreateSwapchain();

window.focus();

const loop = setInterval(() => {
    window.pollEvents();

    asset.rotation.y += 0.1;
    updateAsset(asset);

    if (window.shouldClose()) {
        clearInterval(loop);

        return;
    }

    drawFrame();
}, 1e3 / 60);