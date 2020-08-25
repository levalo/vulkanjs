import vulkanProvider from './graphic/vulkan-provider';
import { Obj } from './common/obj';

global.debug = true;

const { window, drawFrame, createVertexBuffer, createIndexBuffer, recreateSwapchain, createAsset, createTextureImage, initDescriptors, updateAsset } = vulkanProvider();
const { indices, mergedVertices } = Obj('models/barrel.obj');

let asset = createAsset({
    vertexBuffer: createVertexBuffer(mergedVertices),
    indexBuffer: createIndexBuffer(indices),
    texture: createTextureImage('textures/barrel_tx_base.png'),
    rotation: { x: 0, y: 45, z: 0 },
    position: { x: 0, y: 0, z: 5 }
});

initDescriptors();

recreateSwapchain();

window.focus();

const loop = setInterval(() => {
    window.pollEvents();

    asset.rotation.y += 0.1;
    asset.rotation.x += 0.1;
    updateAsset(asset);

    if (window.shouldClose()) {
        clearInterval(loop);

        return;
    }

    drawFrame();
}, 1e3 / 60);