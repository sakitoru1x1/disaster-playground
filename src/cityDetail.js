import {Mesh,VertexData,Vector3,Color3,StandardMaterial} from '@babylonjs/core';

// All fine details are baked into vertex-colored meshes: one draw per floor,
// one draw per vehicle, and one draw for the entire street furniture layer.
// Nothing added here requires a Havok body or a new shadow-map draw.
const col=s=>{const c=Color3.FromHexString(s);return [c.r,c.g,c.b,1]};
const palette={
  pale:col('#efe5cc'),stone:col('#b5bbb7'),dark:col('#354751'),
  darkMetal:col('#50636b'),brass:col('#b3a28b'),sill:col('#d2c7b0'),
  wood:col('#956c51'),awning:col('#bf8b6f'),white:col('#f7f1d9'),
  paint:col('#c7c0a9'),drain:col('#313a40'),paving:col('#a9aaa0'),
  canopy:col('#6e8583'),stop:col('#e8ded0'),yellow:col('#d2b882'),
  flowers:col('#c77872'),glass:col('#a7ccd0'),headlamp:col('#ffebbd'),
  taillamp:col('#b84b47'),chrome:col('#899da5'),rubber:col('#2d3740')
};
function coloredBox(out,x,y,z,w,h,d,color){
  out.push([x,y,z,w,h,d,color]);
}
function boxData(pos,idx,colors,cx,cy,cz,sx,sy,sz,c){
  const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
  const faces=[
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]]
  ];
  for(const face of faces){
    const off=pos.length/3;
    for(const p of face){pos.push(...p);colors.push(...c)}
    idx.push(off,off+1,off+2,off,off+2,off+3);
  }
}
export function detailBatch(world,name,parts,parent=null){
  if(!parts.length)return null;
  const positions=[],indices=[],colors=[];
  for(const part of parts)boxData(positions,indices,colors,...part);
  const normals=[],data=new VertexData();
  VertexData.ComputeNormals(positions,indices,normals);
  data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;
  const mesh=new Mesh(name,world.scene);
  data.applyToMesh(mesh);mesh.material=world.materials.cityDetail;
  mesh.useVertexColors=true;mesh.isPickable=false;
  mesh.receiveShadows=false;
  if(parent)mesh.parent=parent;
  else mesh.freezeWorldMatrix();
  return mesh;
}
export function prepareCityDetails(world){
  const material=new StandardMaterial('shared city microdetail tint',world.scene);
  material.diffuseColor=Color3.White();
  material.specularColor=Color3.FromHexString('#27363d');
  material.specularPower=64;
  world.materials.cityDetail=material;
}

// Recessed glazing is already a shared texture; this layer adds physically
// protruding frames, corner pilasters, window dividers, lintels and entrances.
export function detailBuildingFloor(world,entry,options={}){
  const {x:w,y:h,z:d}=entry.size;
  const n=entry.storey,building=entry.building;
  const mobile=world.mobile;
  const modern=!!options.modern,top=!!options.isTop,entrance=n===0;
  const style=building.style||0;
  const frame=modern?palette.darkMetal:(style%2?palette.brass:palette.pale);
  const masonry=style%2?palette.sill:palette.stone;
  const accent=modern?palette.chrome:palette.brass;
  const pieces=[];
  const push=(x,y,z,sx,sy,sz,c)=>coloredBox(pieces,x,y,z,sx,sy,sz,c);
  // Every window facade has five panes. Use long narrow strips as mullions:
  // the visible glass texture and the frame share identical proportions.
  const glazeHeight=h*.52,trimY=glazeHeight*.5;
  for(const side of [-1,1]){
    for(const axis of ['z','x']){
      const len=axis==='z'?w:d;
      const wallExtent=axis==='z'?d:w;
      const depth=wallExtent*.5+.085;
      const placement=(coordinate,y,thickness,height,span,color)=>{
        if(axis==='z')push(coordinate,y,side*depth,thickness,height,span,color);
        else push(side*depth,y,coordinate,span,height,thickness,color);
      };
      // Thin horizontal rails sandwich the glass and subdivide reflections.
      for(const y of [-trimY,trimY])
        placement(0,y,len*.84,.095,.16,frame);
      placement(0,.07,len*.84,.045,.13,accent);
      // Mullions: 4 dividers per face, 5 distinct glazing bays.
      for(let k=1;k<=4;k++){
        const along=(-.5+k/5)*len*.84;
        placement(along,0,.075,glazeHeight+.10,.13,frame);
      }
      // Continuous sill and cornice emphasize layered, non-flat architecture.
      const sill=-h*.31,topBand=h*.5-.22;
      placement(0,sill,len*.89,.12,.27,masonry);
      placement(0,topBand,len*.99,.13,.24,modern?frame:masonry);
      if(!mobile){
        // Balcony and railing on selected floors, kept entirely in the
        // original storey parent so no fragments float after collapse.
        if((building.id*7+n*3+style)%5===0&&n>0){
          if(axis==='z'){
            push(0,-h*.21,side*(d*.5+.42),w*.42,.12,.77,masonry);
            push(0,-h*.03,side*(d*.5+.8),w*.41,.055,.065,frame);
            for(const x of [-w*.18,0,w*.18])
              push(x,-h*.13,side*(d*.5+.8),.045,.41,.055,frame);
          }else{
            push(side*(w*.5+.42),-h*.21,0,.77,.12,d*.40,masonry);
            push(side*(w*.5+.8),-h*.03,0,.065,.055,d*.39,frame);
          }
        }
      }
    }
    for(const x of [-w*.5+.22,w*.5-.22])
      push(x,0,side*(d*.5+.12),.14,h*.91,.16,modern?frame:accent);
  }
  if(entrance){
    // Match the foundation-level glazed lobby; full-width raised awning,
    // double door panels, handle bars and trim, attached to original floor.
    const z=d*.5+.17,doorY=-h*.5+1.43;
    push(0,doorY,z+.035,2.45,2.5,.11,palette.dark);
    push(-.61,doorY,z+.11,1.04,2.25,.065,palette.glass);
    push(.61,doorY,z+.11,1.04,2.25,.065,palette.glass);
    push(0,doorY,z+.16,.12,2.4,.06,palette.chrome);
    push(-.21,doorY-.11,z+.19,.045,.50,.05,palette.brass);
    push(.21,doorY-.11,z+.19,.045,.50,.05,palette.brass);
    push(0,doorY+1.53,z+.44,3.5,.20,.85,
      modern?palette.canopy:palette.awning);
    push(0,doorY+1.37,z+.78,3.3,.055,.12,palette.white);
  }
  if(top){
    // Small parapet caps on every roof make the skyline read from above.
    for(const side of [-1,1]){
      push(0,h*.5+.15,side*(d*.5-.14),w,.27,.22,modern?frame:masonry);
      push(side*(w*.5-.14),h*.5+.15,0,.22,.27,d,modern?frame:masonry);
    }
  }
  return detailBatch(world,'architectural facade detail',pieces,entry.mesh);
}

// Broad-city detail in ONE static mesh: zebra crossings, tactile pavement,
// gutters, sewer covers, bus-stop paving, curb stones and flower planters.
export function detailStreets(world){
  const pieces=[];
  const push=(x,y,z,w,h,d,c)=>coloredBox(pieces,x,y,z,w,h,d,c);
  const roads=[-39,-13,13,39];
  for(const roadX of roads)for(const roadZ of roads){
    for(const shift of [-6.3,6.3]){
      // Crosswalk bars across X-direction lanes.
      for(let k=-2;k<=2;k++)
        push(roadX+k*1.16,.115,roadZ+shift,.76,.018,2.45,palette.white);
      // Crosswalk bars across Z-direction lanes.
      for(let k=-2;k<=2;k++)
        push(roadX+shift,.166,roadZ+k*1.16,2.45,.018,.76,palette.white);
    }
    // Drain covers in road gutters, distinct from the moving traffic lanes.
    for(const dx of [-2.85,2.85])for(const dz of [-3.15,3.15])
      push(roadX+dx,.168,roadZ+dz,.55,.018,.37,palette.drain);
  }
  // Stencilled loading bays and stop lines, away from all moving cars.
  for(const road of roads)for(const a of [-65,-52,-26,0,26,52,65]){
    push(road+3.07,.114,a,.1,.019,3.45,palette.paving);
    push(a,.166,road-3.08,3.45,.019,.10,palette.paving);
  }
  // Planter bases on green parks only, not along active roads.
  for(const [cx,cz] of [[-26,26],[26,-26]]){
    for(const [dx,dz] of [[-5.7,-5.6],[5.7,-5.6],[-5.7,5.6],[5.7,5.6]]){
      push(cx+dx,.47,cz+dz,2.05,.24,1.5,palette.stone);
      push(cx+dx,.65,cz+dz,1.7,.16,1.2,palette.canopy);
      for(let j=-1;j<=1;j++)
        push(cx+dx+j*.42,.81,cz+dz+(j%2)*.28,.34,.25,.3,
          j===0?palette.flowers:palette.yellow);
    }
  }
  return detailBatch(world,'batched road crosswalks drains and planting',pieces);
}

// Fit visual details to the existing +X-nosed Havok vehicle, keeping the
// chassis physical mass, collision dimensions and steering code untouched.
export function detailVehicle(world,car){
  const pieces=[];
  const push=(x,y,z,w,h,d,c)=>coloredBox(pieces,x,y,z,w,h,d,c);
  for(const side of [-1,1]){
    push(1.82,.12,side*.55,.055,.24,.46,palette.headlamp);
    push(-1.82,.15,side*.56,.065,.23,.40,palette.taillamp);
    push(.05,-.06,side*.917,2.4,.04,.035,palette.chrome);
    push(-.14,.48,side*.921,.13,.06,.035,palette.chrome);
    push(.38,-.02,side*.923,.075,.26,.026,palette.rubber);
    push(-1.11,-.02,side*.923,.075,.26,.026,palette.rubber);
  }
  push(1.84,-.30,0,.14,.16,1.78,palette.chrome);
  push(-1.84,-.31,0,.15,.13,1.8,palette.rubber);
  push(1.83,.05,0,.07,.23,.71,palette.darkMetal);
  push(1.90,-.08,0,.025,.07,.32,palette.white);
  // Roof weatherstrip; keeps glass cabin from looking like a plain block.
  for(const side of [-1,1])
    push(-.15,1.15,side*.67,1.77,.075,.05,palette.chrome);
  return detailBatch(world,'vehicle lights trim and handles',pieces,car);
}
