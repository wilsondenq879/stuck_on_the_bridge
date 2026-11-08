import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Route } from '../dist/geo.js';

test('packed hotel commute keeps roadside trunks and crowns together, outside the carriageway', () => {
  const base = new URL('../dist/assets/world/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('decathlon-sheraton.json', base)));
  const archive = fs.readFileSync(new URL('decathlon-sheraton.bin', base));
  const route = new Route(JSON.parse(fs.readFileSync(new URL('../../data/routes/decathlon-sheraton.json', base))));
  const trees = new Map();
  for (const tile of manifest.scenery.tiles) {
    const glb = archive.subarray(tile.offset, tile.offset + tile.length);
    const end = 20 + glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, end));
    for (const node of model.nodes) {
      const shape = model.meshes[node.mesh]?.name;
      if (!['Mesh_479', 'Mesh_523', 'Mesh_524'].includes(shape)) continue;
      const record = (x, z) => {
        const nearest = route.nearest(x, z);
        assert.ok(nearest.d >= route.width(nearest.s) / 2 + 2.7, 'tree canopy intrudes at ' + nearest.s);
        const key = x + ',' + z;
        const parts = trees.get(key) ?? [];
        parts.push(shape === 'Mesh_479' ? 'trunk' : 'crown');
        trees.set(key, parts);
      };
      const attrs = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
      if (!attrs) {
        record(node.translation[0], node.translation[2]);
        continue;
      }
      const pos = model.accessors[attrs.TRANSLATION];
      const view = model.bufferViews[pos.bufferView];
      for (const index of Object.values(attrs)) assert.equal(model.accessors[index].count, pos.count);
      for (let i = 0; i < pos.count; i++) {
        const offset = end + 8 + (view.byteOffset ?? 0) + (pos.byteOffset ?? 0) + i * (view.byteStride ?? 12);
        record(glb.readFloatLE(offset), glb.readFloatLE(offset + 8));
      }
    }
  }
  assert.ok(trees.size > 0, 'the hotel route still has roadside trees');
  for (const parts of trees.values()) assert.deepEqual(parts.sort(), ['crown', 'trunk']);
});
