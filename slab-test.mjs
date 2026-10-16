import {SLAB_SPLIT_COUNTS,chooseSlabSplitCount,partitionSlab} from './src/slabs.js';
const seen=new Set();
for(let k=0;k<1000;k++){
  const count=chooseSlabSplitCount();seen.add(count);
  const width=6+(k%13),depth=8+(k%9);
  const rects=partitionSlab(width,depth,count);
  if(rects.length!==count)throw new Error('Wrong count '+count+' '+rects.length);
  const area=rects.reduce((a,r)=>a+r.w*r.d,0);
  if(Math.abs(area-width*depth)>1e-7)throw new Error('Area mismatch '+area);
  for(const r of rects){
    if(r.w<=0||r.d<=0)throw new Error('Nonpositive slab');
    if(Math.abs(r.x)+r.w/2>width/2+1e-6||Math.abs(r.z)+r.d/2>depth/2+1e-6)throw new Error('Out of bounds');
  }
}
if(seen.size!==SLAB_SPLIT_COUNTS.length)throw new Error('Missing split type');
console.log('SLAB_GEOMETRY_PASS 1000/1000; distinct counts='+[...seen].sort((a,b)=>a-b).join(','));