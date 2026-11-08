// Filter Blender-exported roadside vegetation when reusing the southbound
// landscape on the hotel commute. Runs during packing, never on a player's phone.
import fs from 'node:fs';
import { Route } from '../dist/geo.js';
import { bikeBranches } from '../dist/road-geometry.js';
import { DrivingWorld } from '../dist/world.js';

const routeData = JSON.parse(fs.readFileSync(new URL('../dist/data/routes/decathlon-sheraton.json', import.meta.url)));
const world = Object.create(DrivingWorld.prototype);
world.route = new Route(routeData);
world.bikeRoute = new Route({ ...routeData, points: routeData.bikePoints, lengthMeters: routeData.bikeLengthMeters });
world.branches = bikeBranches(world.route, world.bikeRoute);
world.interchange = null;
world.prepareRoadClearance();

// These three meshes in the zhubei-tsmc donor are the trunk and two foliage
// variants from DrivingWorld.makeFurniture(). All parts share one ground point.
const treeMeshes = new Set(['Mesh_479', 'Mesh_523', 'Mesh_524']);
const glb = fs.readFileSync(0);
const jsonEnd = 20 + glb.readUInt32LE(12);
const model = JSON.parse(glb.subarray(20, jsonEnd));
const binary = glb.subarray(jsonEnd + 8);
const widths = { VEC3: 3, VEC4: 4 };

function floatRows(index) {
  const accessor = model.accessors[index];
  const view = model.bufferViews[accessor.bufferView];
  const columns = widths[accessor.type];
  if (!columns || accessor.componentType !== 5126 || accessor.sparse) throw Error('Unexpected tree transform format');
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? columns * 4;
  return { accessor, columns, offset, stride };
}

// Blender can share accessors between separate instance groups. Create dense
// transform arrays for this group without altering any donor data.
const chunks = [binary];
let byteLength = binary.length;
function compact(index, keep) {
  const { accessor, columns, offset, stride } = floatRows(index);
  const min = Array(columns).fill(Infinity);
  const max = Array(columns).fill(-Infinity);
  const packed = Buffer.alloc(columns * 4 * keep.length);
  for (const [dst, src] of keep.entries()) {
    const start = offset + src * stride;
    const dest = dst * columns * 4;
    binary.copy(packed, dest, start, start + columns * 4);
    for (let i = 0; i < columns; i++) {
      const value = packed.readFloatLE(dest + 4 * i);
      min[i] = Math.min(min[i], value);
      max[i] = Math.max(max[i], value);
    }
  }
  const bufferView = model.bufferViews.length;
  model.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: packed.length });
  chunks.push(packed);
  byteLength += packed.length;
  return model.accessors.push({ ...accessor, bufferView, byteOffset: 0, count: keep.length, min, max }) - 1;
}

function clearOfRoad(x, z, y, isTrunk) {
  const ground = y - (isTrunk ? 1.8 : 5.3);
  return world.clearance.free(x, z, 2.7 + 0.35, ground, ground + 8.9);
}

let changed = false;
for (const node of model.nodes) {
  const mesh = model.meshes[node.mesh]?.name;
  if (!treeMeshes.has(mesh)) continue;
  const isTrunk = mesh === 'Mesh_479';
  const transforms = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  if (transforms) {
    const { accessor, offset, stride } = floatRows(transforms.TRANSLATION);
    const keep = [];
    for (let i = 0; i < accessor.count; i++) {
      const at = offset + i * stride;
      if (clearOfRoad(binary.readFloatLE(at), binary.readFloatLE(at + 8), binary.readFloatLE(at + 4), isTrunk)) keep.push(i);
    }
    if (keep.length === accessor.count) continue;
    if (keep.length) {
      for (const [name, index] of Object.entries(transforms)) transforms[name] = compact(index, keep);
    } else {
      delete node.mesh;
      delete node.extensions.EXT_mesh_gpu_instancing;
      if (!Object.keys(node.extensions).length) delete node.extensions;
    }
  } else {
    const [x, y, z] = node.translation;
    if (clearOfRoad(x, z, y, isTrunk)) continue;
    delete node.mesh;
  }
  changed = true;
}

if (!changed) {
  process.stdout.write(glb);
} else {
  model.buffers[0].byteLength = byteLength;
  const json = Buffer.from(JSON.stringify(model));
  const padded = Math.ceil(json.length / 4) * 4;
  const header = Buffer.from(glb.subarray(0, 20));
  header.writeUInt32LE(28 + padded + byteLength, 8);
  header.writeUInt32LE(padded, 12);
  const binaryHeader = Buffer.from(glb.subarray(jsonEnd, jsonEnd + 8));
  binaryHeader.writeUInt32LE(byteLength);
  process.stdout.write(Buffer.concat([header, json, Buffer.alloc(padded - json.length, 32), binaryHeader, ...chunks]));
}
