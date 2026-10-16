// Gameplay-calibrated damage model, not a real-world blast simulation.
// 1% already punches several floors; 100% devastates the epicenter while
// damaging buildings through a large part of the 170x170 city.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function meteorPower(raw){return clamp(Number(raw)||.01,.01,1)}
export function meteorScale(raw){
  const p=meteorPower(raw);
  const radius=7+111*Math.pow(p,.83);
  return {
    power:p,
    radius,
    coreRadius:2+33*Math.pow(p,1.5),
    waveSpeed:56+28*p,
    maxWaveAge:radius/(56+28*p)+1.2,
    // Filmic scaling: a 100% hit spans >10 times the area of a 1% hit.
    intensity:12+890*Math.pow(p,1.55),
    kinetic:185+455*Math.pow(p,.85),
    particles:Math.round(22+150*p),
    impulse:13+80*Math.pow(p,.8)
  };
}
export function meteorWaveDamage(raw,distance){
  const s=meteorScale(raw);
  if(distance>=s.radius)return 0;
  const closeness=Math.max(0,1-distance/s.radius);
  // Steep falloff leaves the epicenter devastated but outer blocks damaged.
  return s.intensity*Math.pow(closeness,3.2);
}
export function meteorHitDistribution(raw){
  const energy=meteorScale(raw).kinetic;
  return [energy,energy*.64,energy*.35];
}
