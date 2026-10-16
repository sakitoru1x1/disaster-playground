// Pure fountain-outwards city layout. Exactly 1..30 buildings.
// First occupy lots closest to the central fountain. Then infill a second
// compact house on inner plots, preserving roads and keeping footprints separate.
const BLOCK_COORDS=[-52,-26,0,26,52];
export function planCity(requested){
  const count=Math.max(1,Math.min(30,Math.round(Number(requested)||1)));
  const plots=[];
  for(let i=0;i<5;i++)for(let j=0;j<5;j++){
    if((i===2&&j===2)||(i===1&&j===3)||(i===3&&j===1))continue;
    const x=BLOCK_COORDS[i],z=BLOCK_COORDS[j];
    plots.push({i,j,x,z,radius:Math.hypot(x,z),slots:1});
  }
  plots.sort((a,b)=>a.radius-b.radius||a.x-b.x||a.z-b.z);
  const selected=plots.slice(0,Math.min(count,plots.length));
  if(count>plots.length){
    let extra=count-plots.length;
    for(const p of selected){if(!extra)break;p.slots=2;extra--}
  }
  return selected.map(p=>({...p,count:p.slots,
    buildings:p.slots===1
      ?[{x:p.x,z:p.z,size:11}]
      :[{x:p.x-4.65,z:p.z,size:7.2},{x:p.x+4.65,z:p.z,size:7.2}]
  }));
}
