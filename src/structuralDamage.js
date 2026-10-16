// Gameplay material strengths for modular building sections.
// No finite-element simulation: hit points represent resistance to roof punching,
// frame bending and repeated wind fatigue, while Havok moves freed rigid bodies.
export function clampStrength(raw){return Math.max(.15,Math.min(1,Number(raw)||.15))}
export function sectionResistance(storey,floorCount){
  return storey===floorCount-1?72:storey===0?155:110;
}
export function meteorDirectDamage(power){
  const s=clampStrength(power);
  return 20+212*s*s;
}
export function meteorBlastDamage(power,falloff){
  const s=clampStrength(power);
  return (7+160*s*s)*Math.pow(Math.max(0,Math.min(1,falloff)),1.4);
}
export function tornadoDamagePerSecond(power,falloff){
  const s=clampStrength(power);
  // Category 1–2: loose debris and cars, no structural failure.
  // Category 3: cladding cracks; categories 4–5 can cause collapse over time.
  return 250*Math.pow(Math.max(0,s-.38),2.2)*Math.pow(Math.max(0,Math.min(1,falloff)),1.35);
}
