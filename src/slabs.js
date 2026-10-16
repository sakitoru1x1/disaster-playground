// Area-preserving recursive fracture plan for rectangular concrete slabs.
// Creates irregular guillotine-style fracture patterns rather than uniform tiles.
export const SLAB_SPLIT_COUNTS=Object.freeze([2,3,5,8,10]);
const between=(a,b,rng)=>a+(b-a)*rng();

export function chooseSlabSplitCount(rng=Math.random){
  return SLAB_SPLIT_COUNTS[Math.min(SLAB_SPLIT_COUNTS.length-1,Math.floor(rng()*SLAB_SPLIT_COUNTS.length))];
}

export function partitionSlab(width,depth,count,rng=Math.random){
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)throw new RangeError('Invalid slab dimensions');
  if(!Number.isInteger(count)||count<1||count>64)throw new RangeError('Invalid fracture count');
  const rects=[{x:0,z:0,w:width,d:depth}];
  while(rects.length<count){
    // Split the largest extant region; some randomness prevents regular grids.
    const ranked=rects.map((r,i)=>({r,i,weight:r.w*r.d*between(.84,1.16,rng)}));
    ranked.sort((a,b)=>b.weight-a.weight);
    const {i}=ranked[0];
    const parent=rects.splice(i,1)[0];
    const alongX=parent.w>parent.d*1.24 ? true:
      parent.d>parent.w*1.24 ? false : rng()<.5;
    const ratio=between(.32,.68,rng);
    if(alongX){
      const a=parent.w*ratio,b=parent.w-a;
      rects.push(
        {x:parent.x-b/2,z:parent.z,w:a,d:parent.d},
        {x:parent.x+a/2,z:parent.z,w:b,d:parent.d}
      );
    }else{
      const a=parent.d*ratio,b=parent.d-a;
      rects.push(
        {x:parent.x,z:parent.z-b/2,w:parent.w,d:a},
        {x:parent.x,z:parent.z+a/2,w:parent.w,d:b}
      );
    }
  }
  return rects;
}