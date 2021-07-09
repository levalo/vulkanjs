import lineByLine  from 'n-readlines';

export function Obj(path) {
    const liner = new lineByLine(path);

    const vertices = [];
    const texels = [];
    const normals = [];
    const indices = [];

    const resultVertices = [];
    const resultTexels = [];
    const resultNormals = [];
    const resultIndeces = [];
    const mergedVertices = [];

    let line;
    while (line = liner.next()) {
        line = line.toString();

        if (line.startsWith('v ')) {
            vertices.push(...line.replace('v ', '').split(' ').map(Number));
        }

        if (line.startsWith('vt ')) {
            texels.push(...line.replace('vt ', '').split(' ').map(Number));
        }

        if (line.startsWith('vn ')) {
            normals.push(...line.replace('vn ', '').split(' ').map(Number));
        }

        if (line.startsWith('f ')) {
            indices.push(...line.replace('f ', '').split(' ').map(chunk => {
                return chunk.split('/').map(Number);
            }));
        }
    }

    indices.forEach(index => {
        const vertexIndex = index[0] - 1;
        const texelIndex = index[1] - 1;
        const normalIndex = index[2] - 1;


        resultVertices[texelIndex * 3] = vertices[vertexIndex * 3];
        resultVertices[texelIndex * 3 + 1] = vertices[vertexIndex * 3 + 1];
        resultVertices[texelIndex * 3 + 2] = vertices[vertexIndex * 3 + 2];

        resultNormals[texelIndex * 3] = normals[normalIndex * 3];
        resultNormals[texelIndex * 3 + 1] = normals[normalIndex * 3 + 1];
        resultNormals[texelIndex * 3 + 2] = normals[normalIndex * 3 + 2];

        resultTexels[texelIndex * 2] = texels[texelIndex * 2];
        resultTexels[texelIndex * 2 + 1] = texels[texelIndex * 2 + 1];

        resultIndeces.push(texelIndex);
    });

    let j = 0;
    for(let i = 0; i < resultVertices.length; i += 3) {
        mergedVertices.push(resultVertices[i]);
        mergedVertices.push(resultVertices[i + 1]);
        mergedVertices.push(resultVertices[i + 2]);

        mergedVertices.push(resultNormals[i]);
        mergedVertices.push(resultNormals[i + 1]);
        mergedVertices.push(resultNormals[i + 2]);

        mergedVertices.push(resultTexels[j]);
        mergedVertices.push(resultTexels[j + 1]);
        
        j += 2;
    }

    return { 
        vertices: new Float32Array(resultVertices), 
        indices: new Uint16Array(resultIndeces),
        texels: new Float32Array(resultTexels),
        normals: new Float32Array(resultNormals),
        mergedVertices: new Float32Array(mergedVertices)
    };
}