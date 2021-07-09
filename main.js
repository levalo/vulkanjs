import vulkanProvider from './graphic/vulkan-provider';
import { Obj } from './common/obj';

global.debug = true;

const { window, drawFrame, run, createAsset, createTextureImage, updateAsset, createObjects } = vulkanProvider();
const { indices, mergedVertices } = Obj('models/barrel.obj');

createObjects([
    { name: 'barrel', vertices: mergedVertices, indices: indices}
]);

let barrelTexture = createTextureImage('textures/barrel_tx_base.png');

let asset = createAsset({
    objectName: 'barrel',
    texture: barrelTexture,
    rotation: { x: 30, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 7 }
});

run();

window.focus();

const loop = setInterval(() => {
    window.pollEvents();

    // asset.rotation.y += 0.1;
    // asset.rotation.x += 0.1;
    updateAsset(asset);

    if (window.shouldClose()) {
        clearInterval(loop);

        return;
    }

    drawFrame();
}, 1000 / 60);