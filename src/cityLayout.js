// One shared source of truth for the expanded 11 x 11 city. All distances
// are world metres; changing this layout must also change roads and coastline.
export const BLOCK_SPACING = 26;
export const BLOCK_COORDS = Object.freeze(Array.from({length: 11}, (_, i) => (i - 5) * BLOCK_SPACING));
export const CITY_HALF_SIZE = 156;
export const ROAD_COORDS = Object.freeze(BLOCK_COORDS.slice(0, -1).map(v => v + BLOCK_SPACING / 2));
export const CITY_DISTRICTS = Object.freeze(['downtown', 'residential', 'industrial', 'harbor', 'uptown']);
const PARK_KEYS = Object.freeze([
  '0,0', '-26,26', '26,-26', '-104,-52', '104,52',
  '-78,104', '78,-104', '-104,104', '104,-104'
]);
export const PARK_PLOTS = new Set(PARK_KEYS);
export const isPark = (x, z) => PARK_PLOTS.has(x + ',' + z);
export function districtAt(x, z) {
  if (Math.abs(x) <= 52 && Math.abs(z) <= 52) return 'downtown';
  if (z >= 78) return 'harbor';
  if (z <= -78) return 'uptown';
  return x < 0 ? 'residential' : 'industrial';
}
export function districtPlots() {
  const plots = [];
  for (let i = 0; i < BLOCK_COORDS.length; i++) {
    for (let j = 0; j < BLOCK_COORDS.length; j++) {
      const x = BLOCK_COORDS[i], z = BLOCK_COORDS[j];
      if (isPark(x, z)) continue;
      const district = districtAt(x, z);
      const anchor = district === 'residential' ? [-104, 0]
        : district === 'industrial' ? [104, 0]
        : district === 'harbor' ? [0, 104]
        : district === 'uptown' ? [0, -104] : [0, 0];
      plots.push({i, j, x, z, district, radius: Math.hypot(x, z),
        priority: Math.hypot(x-anchor[0], z-anchor[1])});
    }
  }
  return plots;
}
// Active, destructible buildings are interleaved between districts, with
// downtown receiving twice as many slots. Prefix-stable order is essential:
// city regeneration uses planCity(existingCount + 1) to occupy the next plot.
const queues = CITY_DISTRICTS.map(name => districtPlots()
  .filter(p => p.district === name)
  .sort((a, b) => a.priority - b.priority || a.radius - b.radius || a.x - b.x || a.z - b.z));
const plotOrder = [];
for (let k = 0; plotOrder.length < 30; k++) {
  const name = ['downtown', 'downtown', 'residential', 'industrial', 'harbor', 'uptown'][k % 6];
  const group = queues[CITY_DISTRICTS.indexOf(name)];
  if (group.length) plotOrder.push(group.shift());
  else break;
}
export function planCity(requested) {
  const count = Math.max(1, Math.min(30, Math.round(Number(requested) || 1)));
  return plotOrder.slice(0, count).map(p => ({...p, slots: 1, count: 1,
    buildings: [{x: p.x, z: p.z, size: 11}]}));
}
