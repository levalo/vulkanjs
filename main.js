global.debug = true;

import { GraphicProvider } from './graphic/provider';

const { updateCamera, createAsset, updateAsset, createLoop } = GraphicProvider();

updateCamera({ x: 0, y: 0.0, z: -0.1 });

let asset = createAsset({
    modelName: 'barrel.obj',
    texture: 'empty.png',
    rotation: { x: 30, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 7 }
});

let i = 1;

createLoop(() => {
    //updateCamera({ x: 0, y: 0.0, z: ((i++) / 100) * -1 }, asset.position);
});