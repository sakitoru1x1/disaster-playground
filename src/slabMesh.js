import {Mesh,VertexData} from '@babylonjs/core';

// Low-cost polygonal floor plate. Havok still uses the existing BOX collision
// shape, while rendering uses an irregular silhouette instead of a perfect tile.
// Surface roles are carried per vertex so every generation keeps the building's
// paint and trim on broad surfaces, with bare concrete only at fracture edges.
export function createBrokenSlab(scene,size,name='broken floor slab'){
  const [width,thickness,depth]=size;
  const hw=width*.5,hd=depth*.5;
  const min=Math.min(width,depth);
  const outline=[
    [-1,-1],[-1,-.34],[-1,.31],[-1,1],
    [-.34,1],[.36,1],[1,1],[1,.36],
    [1,-.32],[1,-1],[.35,-1],[-.36,-1]
  ];
  const points=outline.map(([nx,nz])=>{
    const corner=Math.abs(nx)>.95&&Math.abs(nz)>.95;
    const notch=corner?(.025+Math.random()*.07)*min:
      (.025+Math.random()*.105)*min;
    let x=nx*hw,z=nz*hd;
    if(Math.abs(nx)>.95)x-=Math.sign(nx)*notch;
    if(Math.abs(nz)>.95)z-=Math.sign(nz)*notch;
    return [x,z];
  });
  const positions=[],indices=[],regions=[];
  function triangle(a,b,c,ra,rb=ra,rc=ra){
    const start=positions.length/3;
    for(const [pt,role] of [[a,ra],[b,rb],[c,rc]]){
      positions.push(...pt);regions.push(role);
    }
    indices.push(start,start+1,start+2);
  }
  function quad(a,b,c,d,ra,rb=ra,rc=ra,rd=ra){
    triangle(a,b,c,ra,rb,rc);triangle(a,c,d,ra,rc,rd);
  }
  const n=points.length;
  for(let i=0;i<n;i++){
    const [ax,az]=points[i],[bx,bz]=points[(i+1)%n];
    const topA=thickness*.5*(.83+Math.random()*.17);
    const topB=thickness*.5*(.83+Math.random()*.17);
    const bottomA=-thickness*.5*(.88+Math.random()*.12);
    const bottomB=-thickness*.5*(.88+Math.random()*.12);
    // Wide painted top plus a chipped accent rim: the parent building's
    // palette remains visible from above even after tertiary fragmentation.
    const ringA=[ax*.82,topA*.99,az*.82],ringB=[bx*.82,topB*.99,bz*.82];
    const topColor=i%7===3?2:1;
    triangle([0,thickness*.49,0],ringA,ringB,1);
    const edgeColor=i%5===0?3:2;
    quad(ringA,[ax,topA,az],[bx,topB,bz],ringB,
      topColor,edgeColor,edgeColor,topColor);
    triangle([0,-thickness*.49,0],[bx,bottomB,bz],[ax,bottomA,az],4);
    // Paint on the outer edge blends into exposed grey concrete toward
    // the lower fractured edge. No extra mesh and no extra material.
    const edgePaint=i%4===0?6:7;
    quad([ax,topA,az],[ax,bottomA,az],[bx,bottomB,bz],[bx,topB,bz],
      edgePaint,5,5,edgePaint);
  }
  const normals=[],vd=new VertexData();
  VertexData.ComputeNormals(positions,indices,normals);
  vd.positions=positions;vd.indices=indices;vd.normals=normals;
  const mesh=new Mesh(name,scene);vd.applyToMesh(mesh);
  mesh.metadata={fragmentSize:size.slice(),slabRegions:regions,kind:'slab'};
  mesh.receiveShadows=true;mesh.isPickable=false;
  return mesh;
}