// Game design scale: intensity 1% maps to level 1, 100% to level 10.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function severity(power){return clamp(Number(power)||.01,.01,1)}
export function level(power){return 1+Math.round(9*(severity(power)-.01)/.99)}
export function quakeDamage(power){
  const x=severity(power);
  if(x<.14)return 0;
  return 440*Math.pow((x-.14)/.86,2);
}
export function quakeShake(power){
  const x=severity(power);
  return .13+2.25*x*x;
}
export function tsunamiDamage(power,height=1){
  const x=severity(power);
  if(x<.18)return 0;
  // Mid-level floods inundate ground floors; upper tiers cause collapse.
  return 430*x*x*x*Math.max(.45,1-.012*Math.max(0,height));
}
export function tsunamiHeight(power){
  const x=severity(power);return 2.3+27*Math.pow(x,1.35);
}