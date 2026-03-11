// ═══════════════════════════════════════════════════
//  GSAP ↔ THREE.Vector3 BRIDGE
//  Three.js r128 marks Vector3 xyz as non-configurable,
//  so GSAP can't tween them directly. We proxy through
//  a plain object and copy into the Vector3 each frame.
// ═══════════════════════════════════════════════════
function gPos(mesh, to, opts){
  const p={x:mesh.position.x, y:mesh.position.y, z:mesh.position.z};
  const props=Object.assign({}, to, {
    onUpdate(){ mesh.position.set(p.x, p.y, p.z); },
    // preserve any caller-supplied onUpdate
  });
  if(to.onUpdate){ const cu=to.onUpdate; props.onUpdate=()=>{ mesh.position.set(p.x,p.y,p.z); cu(); }; }
  return gsap.to(p, Object.assign({}, opts||{}, props));
}

function gScl(mesh, to, opts){
  const s={x:mesh.scale.x, y:mesh.scale.y, z:mesh.scale.z};
  return gsap.to(s, Object.assign({}, opts||{}, to, {
    onUpdate(){ mesh.scale.set(s.x, s.y, s.z); }
  }));
}

// ═══════════════════════════════════════════════════
//  SCENE SETUP
// ═══════════════════════════════════════════════════
const W=innerWidth, H=innerHeight;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(W,H);
document.body.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x07090f);
scene.fog=new THREE.FogExp2(0x07090f,.015);

scene.add(new THREE.AmbientLight(0x0d1a3a,4));
const kL=new THREE.DirectionalLight(0x6699ff,2.5); kL.position.set(8,12,10); scene.add(kL);
const fL=new THREE.DirectionalLight(0xff4444,.7); fL.position.set(-10,-4,-6); scene.add(fL);
const bL=new THREE.DirectionalLight(0x44ffaa,.5); bL.position.set(0,-8,-12); scene.add(bL);

const camera=new THREE.PerspectiveCamera(42,W/H,.01,200);

// ═══════════════════════════════════════════════════
//  CONSTANTS & LAYOUT
// ═══════════════════════════════════════════════════
const B=3, S=3, D=10, E=3, A=B*S;  // A=9
const CELL=.40, GAP=.60;

const CX_XAD = -6.0;
const CX_RS  =  1.0;
const CX_SKS =  7.0;
const CX_SKI =  8.3;
const OY = -(A-1)*GAP/2;    // for x_aD / SKS / SKI (A rows)
const OY_RS = -(E-1)*GAP/2; // for router_scores / router_indices (E rows)

const ox3=CX_XAD-(D-1)*GAP/2, oy3=-(S-1)*GAP/2, oz3=-(B-1)*GAP/2;

function pOri(b,s,d){ return{x:ox3+d*GAP, y:oy3+s*GAP, z:oz3+b*GAP}; }
function pFlat(b,s,d){ const a=b*S+s; return{x:CX_XAD-(D-1)*GAP/2+d*GAP, y:OY+a*GAP, z:0}; }
// router_scores [E,A]: row=expert e, col=token a
function pRS(e,a){ return{x:CX_RS-(A-1)*GAP/2+a*GAP, y:OY_RS+e*GAP, z:0}; }
function pSKS(a){ return{x:CX_SKS, y:OY+a*GAP, z:0}; }
function pSKI(a){ return{x:CX_SKI, y:OY+a*GAP, z:0}; }

const CX_RI    = 7.7;   // router_indices [3,9] centre — gap from RS matches x_aD→RS gap
const CX_RIEXP = CX_RI;                     // expand in-place: [27,1]→[27,10] fans out from leftmost RI col
const CX_GD    = 14.7;                      // routed_in_EG_D [27,10] centre x
const CX_SRS   = 11.05;                     // router_scores reshaped [27,1] column x
const OY_GD    = -((E*A)-1)*GAP/2;          // 27-row vertical centre (both output matrices)
function pRIExp(i,d){ return{x:CX_RIEXP-(D-1)*GAP/2+d*GAP, y:OY_GD+i*GAP, z:0}; }
function pGD(i,d){ return{x:CX_GD-(D-1)*GAP/2+d*GAP, y:OY_GD+i*GAP, z:0}; }
function pSRS(i){ return{x:CX_SRS, y:OY_GD+i*GAP, z:0}; }
// router_indices [E, A]: row=expert e, col=token a
// pRI(e, a) — e is the row (0..E-1), a is the column (0..A-1)
const OY_RI = -(E-1)*GAP/2;   // vertical centre for E rows
function pRI(e,a){ return{x:CX_RI-(A-1)*GAP/2+a*GAP, y:OY_RI+e*GAP, z:0}; }
// router_indices_EG_D display: [3,9] positioned left of GDVox at x=0 with canonical gap
const CX_RI_EGD = -3.65;  // centred pair: RI_EGD left, GD right, canonical 1.9 gap
const CX_GD_RIEGLD = 3.65;   // GDVox slides here when RI_EGD appears
function pRI_EGD(e,a){ return{x:CX_RI_EGD-(A-1)*GAP/2+a*GAP, y:OY_RS+e*GAP, z:0}; }

// ═══════════════════════════════════════════════════
//  COLOURS & DATA
// ═══════════════════════════════════════════════════
function tokCol(b,s,d){
  return new THREE.Color().setHSL([.60,.02,.33][b], .55+(s/2)*.25, .28+(d/9)*.30);
}
const EC=[new THREE.Color(0xc084fc), new THREE.Color(0x38bdf8), new THREE.Color(0xfb923c)];
const ECSS=['c0','c1','c2'], EN=['E₀','E₁','E₂'];

function fsc(a,e){ return .18 + .65*((a*7+e*13)%17)/17; }

// WINNERS[a] = { e: winning expert (0..E-1), score } for token a
// Derived from topk on router_scores.transpose(0,1) [9,3], dim=1
const WINNERS=Array.from({length:A},(_,a)=>{
  let bE=0, bV=fsc(a,0);
  for(let e=1;e<E;e++){ const v=fsc(a,e); if(v>bV){bV=v;bE=e;} }
  return{e:bE, score:bV};
});

// ═══════════════════════════════════════════════════
//  VOXELS
// ═══════════════════════════════════════════════════
const voxGeo=new THREE.BoxGeometry(CELL,CELL,CELL);

// ── Token voxels (x_bsD / x_aD) ─────────────────
const TVox=[];
for(let b=0;b<B;b++) for(let s=0;s<S;s++) for(let d=0;d<D;d++){
  const c=tokCol(b,s,d);
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:c.clone().multiplyScalar(.14),
    roughness:.32, metalness:.52, transparent:true, opacity:1}));
  const p=pOri(b,s,d); m.position.set(p.x,p.y,p.z);
  m.userData={k:'tok', b,s,d, ai:b*S+s, fi:b*S*D+s*D+d, bc:c.clone()};
  scene.add(m); TVox.push({m,b,s,d});
}

// ── router_scores voxels [E,A] = [3,9] ─────────
// SVox[e*A+a] = cell at expert row e, token col a
const SVox=[];
for(let e=0;e<E;e++) for(let a=0;a<A;a++){
  const sc=fsc(a,e);
  const base=EC[e].clone();
  const c=base.clone().lerp(new THREE.Color(0x07090f),1-sc*.9);
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:base.clone().multiplyScalar(sc*.38),
    roughness:.28, metalness:.62, transparent:true, opacity:0}));
  const p=pRS(e,a); m.position.set(p.x,p.y+1.2,p.z); m.scale.setScalar(.01);
  m.userData={k:'sc', e, a, sc, bc:c.clone(), ecs:ECSS[e]};
  scene.add(m); SVox.push({m,e,a,sc});
}

// ── scores_aK voxels [A,1] = [9,1] ─────────────
// One winning expert score per token — result of topk on transposed [9,3]
const SKSVox=[];
for(let a=0;a<A;a++){
  const{e,score}=WINNERS[a];
  const c=EC[e].clone().lerp(new THREE.Color(0xf472b6),.4).lerp(new THREE.Color(0x07090f),1-score*.9);
  const emv=new THREE.Color(0xf472b6).multiplyScalar(score*.5);
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:emv, roughness:.25, metalness:.65, transparent:true, opacity:0}));
  m.position.set(CX_SKS, OY+a*GAP+2, 0); m.scale.setScalar(.01);
  m.userData={k:'sks', a, e, score, bc:c.clone(), ecs:ECSS[e], b:Math.floor(a/S), s:a%S};
  scene.add(m); SKSVox.push({m,a});
}

// ── indices_aK voxels [A,1] = [9,1] ─────────────
// One winning expert index (0..E-1) per token
const SKIVox=[];
for(let a=0;a<A;a++){
  const{e}=WINNERS[a];
  const c=EC[e].clone().lerp(new THREE.Color(0x07090f),.18);
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:EC[e].clone().multiplyScalar(.52),
    roughness:.22, metalness:.68, transparent:true, opacity:0}));
  m.position.set(CX_SKI, OY+a*GAP+2, 0); m.scale.setScalar(.01);
  m.userData={k:'ski', a, e, b:Math.floor(a/S), s:a%S};
  scene.add(m); SKIVox.push({m,a});
}

// ── router_indices voxels [E, A] = [3, 9] ──────────
// row = expert e (0..E-1), col = token a (0..A-1)
// value at [e,a] is always 'a' (the token index) — arange broadcast
// Colour encodes column value a: amber (0) → yellow (8)
const RIVox=[];
const RI_COLS=Array.from({length:A},(_,a)=>
  new THREE.Color().setHSL(0.07+a*(0.07/A), 0.90, 0.48+a*0.022));
for(let e=0;e<E;e++) for(let a=0;a<A;a++){
  const c=RI_COLS[a].clone();
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:c.clone().multiplyScalar(.28),
    roughness:.28, metalness:.55, transparent:true, opacity:0}));
  const p=pRI(e,a); m.position.set(p.x, p.y+2, p.z); m.scale.setScalar(.01);
  m.userData={k:'ri', e, a, bc:c.clone()};
  scene.add(m); RIVox.push({m,e,a});
}


// ── router_indices expanded voxels [27,10] ──────
// Each row i contains the token index i%A repeated D times
// Colour = RI_COLS[i%A] (amber gradient by token index)
const RIExpVox=[];
for(let i=0;i<E*A;i++){
  for(let d=0;d<D;d++){
    const c=RI_COLS[i%A].clone();
    const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
      color:c, emissive:c.clone().multiplyScalar(.25),
      roughness:.28, metalness:.55, transparent:true, opacity:0}));
    const p=pRIExp(i,d); m.position.set(p.x, p.y+2, p.z); m.scale.setScalar(.01);
    m.userData={k:'riexp', i, d, a:i%A, e:Math.floor(i/A), bc:c.clone()};
    scene.add(m); RIExpVox.push({m,i,d});
  }
}

// ── routed_in_EG_D voxels [E*A, D] = [27, 10] ───
// row i = e*A + a, colour = token a's colour (gather copies that row)
const GDVox=[];
for(let i=0;i<E*A;i++){
  const a=i%A;  // which token this row copies
  // sample colour from the flat token row — average across D for a representative hue
  const baseC=tokCol(Math.floor(a/S), a%S, Math.floor(D/2));
  for(let d=0;d<D;d++){
    const c=tokCol(Math.floor(a/S), a%S, d);
    const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
      color:c, emissive:c.clone().multiplyScalar(.18),
      roughness:.30, metalness:.55, transparent:true, opacity:0}));
    const p=pGD(i,d); m.position.set(p.x, p.y+2, p.z); m.scale.setScalar(.01);
    m.userData={k:'gd', i, d, a, e:Math.floor(i/A), bc:c.clone(),
                b:Math.floor(a/S), s:a%S};
    scene.add(m); GDVox.push({m,i,d,a});
  }
}
// ── router_scores_reshaped voxels [27,1] ────────
// After reshape(-1,1): row i = expert e=i//A, token a=i%A
// Colour: winner rows = green (sigmoid score), zero rows = desaturated expert hue
// userData stores: scale value, isZero flag
const SRSVox=[];
for(let i=0;i<E*A;i++){
  const e=Math.floor(i/A), a=i%A;
  const isWin=(WINNERS[a].e===e);
  const sc=isWin ? (1/(1+Math.exp(-fsc(a,e)))) : 0;
  let c;
  if(isWin){
    c=EC[e].clone().lerp(new THREE.Color(0x34d399),0.45).lerp(new THREE.Color(0x07090f),1-sc*.95);
  } else {
    c=EC[e].clone().lerp(new THREE.Color(0x1a1f2e),.78);
  }
  const m=new THREE.Mesh(voxGeo, new THREE.MeshStandardMaterial({
    color:c, emissive:isWin?c.clone().multiplyScalar(.4):c.clone().multiplyScalar(.12),
    roughness:.28, metalness:.60, transparent:true, opacity:0}));
  const p=pSRS(i); m.position.set(p.x, p.y+1.5, p.z); m.scale.setScalar(.01);
  m.userData={k:'srs', i, e, a, sc, isZero:!isWin, ecs:ECSS[e], bc:c.clone()};
  scene.add(m); SRSVox.push({m,i,e,a,sc,isZero:!isWin});
}

// ── SRSF wireframe [27,1] column ────────────────
// ═══════════════════════════════════════════════════
//  WIREFRAMES
// ═══════════════════════════════════════════════════
const SliceF=[];
for(let b=0;b<B;b++){
  const x0=ox3-CELL/2, x1=ox3+(D-1)*GAP+CELL/2;
  const y0=oy3-CELL/2, y1=oy3+(S-1)*GAP+CELL/2, z=oz3+b*GAP;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(
    [x0,y0,z,x1,y0,z, x1,y0,z,x1,y1,z, x1,y1,z,x0,y1,z, x0,y1,z,x0,y0,z],3));
  const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({
    color:[0x2244aa,0x992222,0x228844][b], transparent:true, opacity:.45}));
  scene.add(l); SliceF.push(l);
}

function box2d(x0,x1,y0,y1,col){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(
    [x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
  const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0}));
  scene.add(l); return l;
}

const FlatF = box2d(CX_XAD-(D-1)*GAP/2-CELL/2, CX_XAD+(D-1)*GAP/2+CELL/2, OY-CELL/2, OY+(A-1)*GAP+CELL/2, 0xffb84a);
const RSF   = box2d(CX_RS-(A-1)*GAP/2-CELL/2, CX_RS+(A-1)*GAP/2+CELL/2, OY_RS-CELL/2, OY_RS+(E-1)*GAP+CELL/2, 0xa78bfa);
const SKSF  = box2d(CX_SKS-CELL/2, CX_SKS+CELL/2, OY-CELL/2, OY+(A-1)*GAP+CELL/2, 0xf472b6);
const SKIF  = box2d(CX_SKI-CELL/2, CX_SKI+CELL/2, OY-CELL/2, OY+(A-1)*GAP+CELL/2, 0xf472b6);
const RIF   = box2d(CX_RI-(A-1)*GAP/2-CELL/2, CX_RI+(A-1)*GAP/2+CELL/2, OY_RI-CELL/2, OY_RI+(E-1)*GAP+CELL/2, 0xffb84a);
const RIEF  = box2d(CX_RIEXP-(D-1)*GAP/2-CELL/2, CX_RIEXP+(D-1)*GAP/2+CELL/2, OY_GD-CELL/2, OY_GD+(E*A-1)*GAP+CELL/2, 0xffb84a);
const SRSF  = box2d(CX_SRS-CELL/2, CX_SRS+CELL/2, OY_GD-CELL/2, OY_GD+(E*A-1)*GAP+CELL/2, 0xa78bfa);
const RIEGDF= box2d(CX_RI_EGD-(D-1)*GAP/2-CELL/2, CX_RI_EGD+(D-1)*GAP/2+CELL/2, OY_GD-CELL/2, OY_GD+(E*A-1)*GAP+CELL/2, 0xffb84a);
const RIEGDF_RI = box2d(CX_RI_EGD-(A-1)*GAP/2-CELL/2, CX_RI_EGD+(A-1)*GAP/2+CELL/2, OY_RS-CELL/2, OY_RS+(E-1)*GAP+CELL/2, 0xffb84a);
const GDF   = box2d(CX_GD-(D-1)*GAP/2-CELL/2, CX_GD+(D-1)*GAP/2+CELL/2, OY_GD-CELL/2, OY_GD+(E*A-1)*GAP+CELL/2, 0x52e882);

const divX=(CX_SKS+CX_SKI)/2;
const divG=new THREE.BufferGeometry();
divG.setAttribute('position',new THREE.Float32BufferAttribute(
  [divX,OY-CELL/2-.1,0, divX,OY+(A-1)*GAP+CELL/2+.1,0],3));
const DivL=new THREE.Line(divG,new THREE.LineBasicMaterial({color:0x1e3a5a,transparent:true,opacity:0}));
scene.add(DivL);

// Column dividers in router_scores: between every 3 tokens (B=3 groups)
for(let i=1;i<A;i++){
  if(i%S!==0) continue; // only at batch boundaries for readability
  const xd=CX_RS-(A-1)*GAP/2+i*GAP-GAP/2;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(
    [xd,OY_RS-CELL/2,0, xd,OY_RS+(E-1)*GAP+CELL/2,0],3));
  scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x141e3a,transparent:true,opacity:.6})));
}

// Horizontal dividers in routed_in_EG_D: between expert blocks
for(let blk=1;blk<E;blk++){
  const yd=OY_GD+blk*A*GAP-GAP/2;
  const g2=new THREE.BufferGeometry();
  g2.setAttribute('position',new THREE.Float32BufferAttribute(
    [CX_GD-(D-1)*GAP/2-CELL/2,yd,0, CX_GD+(D-1)*GAP/2+CELL/2,yd,0],3));
  scene.add(new THREE.Line(g2,new THREE.LineBasicMaterial({color:0x1a3a2a,transparent:true,opacity:.7})));
}

// ═══════════════════════════════════════════════════
//  ORBIT
// ═══════════════════════════════════════════════════
let sph={t:.55,p:.82,r:14}, isDrag=false, pm={x:0,y:0}, autoRot=true, camLX=0;

function upCam(){
  camera.position.set(
    sph.r*Math.sin(sph.p)*Math.sin(sph.t),
    sph.r*Math.cos(sph.p),
    sph.r*Math.sin(sph.p)*Math.cos(sph.t));
  camera.lookAt(camLX,0,0);
}
upCam();

renderer.domElement.addEventListener('mousedown',e=>{isDrag=true;pm={x:e.clientX,y:e.clientY};autoRot=false;});
window.addEventListener('mouseup',()=>{isDrag=false;});
window.addEventListener('mousemove',e=>{
  if(!isDrag){onHov(e);return;}
  sph.t-=(e.clientX-pm.x)*.008;
  sph.p=Math.max(.15,Math.min(Math.PI-.15,sph.p+(e.clientY-pm.y)*.008));
  pm={x:e.clientX,y:e.clientY}; upCam();
});
renderer.domElement.addEventListener('wheel',e=>{
  sph.r=Math.max(4,Math.min(44,sph.r+e.deltaY*.02)); upCam();
},{passive:true});

function moveLX(to,dur=1.5){
  const o={v:camLX};
  gsap.to(o,{v:to,duration:dur,ease:'power2.inOut',onUpdate:()=>{camLX=o.v;upCam();}});
}

// ═══════════════════════════════════════════════════
//  RAYCAST / HOVER
// ═══════════════════════════════════════════════════
const ray=new THREE.Raycaster(), ptr=new THREE.Vector2();
const tt=document.getElementById('tt');
let hovM=null, stage=0;

// ═══════════════════════════════════════════════════
//  SNAPSHOT ENGINE — save/restore settled visual states
// ═══════════════════════════════════════════════════
const SNAPS={};

// All panel/code element IDs that can be shown/hidden
const PANEL_IDS=['pl','pm','pr','prf','pri','pgg','pws',
                 'code','code2','code3','code4','code5','code6'];
// All wireframe objects in scene
const allWires=()=>[FlatF,RSF,SKSF,SKIF,RIF,RIEF,SRSF,GDF,DivL,RIEGDF,RIEGDF_RI];

function saveSnap(s){
  const snap={};
  // meshes: TVox,SVox,SKSVox,SKIVox,RIVox,RIExpVox,SRSVox,GDVox
  const allMeshArrays=[TVox,SVox,SKSVox,SKIVox,RIVox,RIExpVox,SRSVox,GDVox];
  snap.meshes=allMeshArrays.map(arr=>arr.map(({m})=>({
    px:m.position.x, py:m.position.y, pz:m.position.z,
    sx:m.scale.x, sy:m.scale.y, sz:m.scale.z,
    op:m.material.opacity,
    cr:m.material.color.r, cg:m.material.color.g, cb:m.material.color.b,
    er:m.material.emissive.r, eg:m.material.emissive.g, eb:m.material.emissive.b
  })));
  // SliceF
  snap.slices=SliceF.map(f=>({
    pz:f.position.z, op:f.material.opacity
  }));
  // wireframes
  snap.wires=allWires().map(w=>w?({op:w.material.opacity,
    cr:w.material.color.r, cg:w.material.color.g, cb:w.material.color.b}):null);
  // panels & code strips
  snap.panels={};
  PANEL_IDS.forEach(id=>{
    const el=document.getElementById(id);
    snap.panels[id]=el?el.style.opacity:'0';
  });
  // sub-panel text content
  snap.subL=document.getElementById('sub-l').innerHTML;
  snap.vnameL=document.getElementById('vname-l').textContent;
  snap.sfOp=document.getElementById('sf').style.opacity||'1';
  snap.vlOp=document.getElementById('vl').style.opacity||'0';
  snap.stOp=document.getElementById('st').style.opacity||'0';
  snap.prInner=document.getElementById('pr-inner').innerHTML;
  // status bar
  snap.sn=document.getElementById('sn').textContent;
  snap.sd=document.getElementById('sd').textContent;
  // button
  snap.btnText=document.getElementById('btn').textContent;
  snap.btnCls=document.getElementById('btn').className;
  snap.btnDis=document.getElementById('btn').disabled;
  // dot index
  snap.dotStage=s;
  // camera
  snap.cam={t:sph.t,p:sph.p,r:sph.r,lx:camLX};
  SNAPS[s]=snap;
}

function restoreSnap(s){
  if(!SNAPS[s]) return;
  gsap.globalTimeline.clear();
  const snap=SNAPS[s];
  const DUR=0.45, EASE='power2.inOut';

  // Restore meshes
  const allMeshArrays=[TVox,SVox,SKSVox,SKIVox,RIVox,RIExpVox,SRSVox,GDVox];
  allMeshArrays.forEach((arr,ai)=>{
    arr.forEach(({m},mi)=>{
      const ms=snap.meshes[ai][mi];
      gPos(m,{x:ms.px,y:ms.py,z:ms.pz},{duration:DUR,ease:EASE});
      gScl(m,{x:ms.sx,y:ms.sy,z:ms.sz},{duration:DUR,ease:EASE});
      gsap.to(m.material,{opacity:ms.op,duration:DUR});
      gsap.to(m.material.color,{r:ms.cr,g:ms.cg,b:ms.cb,duration:DUR});
      gsap.to(m.material.emissive,{r:ms.er,g:ms.eg,b:ms.eb,duration:DUR});
    });
  });
  // Restore SliceF
  SliceF.forEach((f,i)=>{
    const fs=snap.slices[i];
    gPos(f,{x:f.position.x,y:f.position.y,z:fs.pz},{duration:DUR,ease:EASE});
    gsap.to(f.material,{opacity:fs.op,duration:DUR});
  });
  // Restore wireframes
  allWires().forEach((w,i)=>{
    if(!w||!snap.wires[i]) return;
    gsap.to(w.material,{opacity:snap.wires[i].op,duration:DUR});
    gsap.to(w.material.color,{r:snap.wires[i].cr,g:snap.wires[i].cg,b:snap.wires[i].cb,duration:DUR});
  });
  // Restore panels
  PANEL_IDS.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.opacity=snap.panels[id];
  });
  document.getElementById('sub-l').innerHTML=snap.subL;
  document.getElementById('vname-l').textContent=snap.vnameL;
  document.getElementById('sf').style.opacity=snap.sfOp;
  document.getElementById('vl').style.opacity=snap.vlOp;
  document.getElementById('st').style.opacity=snap.stOp;
  document.getElementById('pr-inner').innerHTML=snap.prInner;
  document.getElementById('sn').textContent=snap.sn;
  document.getElementById('sd').textContent=snap.sd;
  // Restore button
  const btn=document.getElementById('btn');
  btn.textContent=snap.btnText;
  btn.className=snap.btnCls;
  btn.disabled=snap.btnDis;
  // Restore camera
  gsap.to(sph,{t:snap.cam.t,p:snap.cam.p,r:snap.cam.r,duration:DUR*2,ease:EASE,onUpdate:upCam});
  moveLX(snap.cam.lx, DUR*2);
  // Restore dots and stage
  setDot(snap.dotStage);
  stage=s;
  autoRot=(s===0);
  // Update back button visibility
  updateBack();
}

function updateBack(){
  const bb=document.getElementById('bback');
  if(stage<=0){ bb.style.opacity='0'; bb.style.pointerEvents='none'; }
  else { bb.style.opacity='1'; bb.style.pointerEvents='auto'; }
}

// Find the nearest previous snap stage
function goBack(){
  // Settled stages in order
  const settled=[0,2,4,6,8,10,12,13,14,15,16,17,18,19,20,21,22];
  const cur=settled.indexOf(stage);
  if(cur<=0){ doReset(); return; }
  const prev=settled[cur-1];
  if(prev===0){ doReset(); return; }
  restoreSnap(prev);
}

function onHov(e){
  ptr.x=(e.clientX/innerWidth)*2-1;
  ptr.y=-(e.clientY/innerHeight)*2+1;
  tt.style.left=(e.clientX+16)+'px';
  tt.style.top=(e.clientY-10)+'px';
}

function doRay(){
  ray.setFromCamera(ptr,camera);
  const hits=ray.intersectObjects([
    ...TVox.map(v=>v.m), ...SVox.map(v=>v.m),
    ...SKSVox.map(v=>v.m), ...SKIVox.map(v=>v.m),
    ...RIVox.map(v=>v.m),
    ...RIExpVox.map(v=>v.m),
    ...SRSVox.map(v=>v.m),
    ...GDVox.map(v=>v.m)
  ]);
  if(hovM){hovM.material.emissiveIntensity=1; hovM.scale.setScalar(1);}
  if(!hits.length){hovM=null;tt.classList.remove('on');return;}
  const m=hits[0].object; hovM=m;
  m.material.emissiveIntensity=6; m.scale.setScalar(1.22);
  const u=m.userData;
  if(u.k==='tok'){
    tt.innerHTML=`<div class="lbl">${stage>=2?`a=${u.ai}`:`b=${u.b}  s=${u.s}`} &nbsp;d=${u.d}</div>
      <div>flat index : ${u.fi}</div>
      ${stage>=2?`<div style="color:var(--A)">a = ${u.b}·3 + ${u.s}</div>`:''}`;
  } else if(u.k==='sc'){
    const isW=WINNERS[u.a].e===u.e;
    let sigLine='';
    if(u.isSig){
      if(u.isZero){
        sigLine=`<div style='color:var(--lo)'>scatter → 0 &nbsp;<span style='opacity:.55'>(−∞)</span></div><div style='color:var(--G)'>sigmoid(−∞) = 0.0000</div>`;
      } else {
        sigLine=`<div style='color:var(--lo)'>scatter → ${u.rawScore.toFixed(3)} (winner)</div><div style='color:var(--G)'>sigmoid → ${u.sigScore.toFixed(4)}</div>`;
      }
    }
    tt.innerHTML=`<div class="lbl ${u.ecs}">router_scores [ ${u.e} , ${u.a} ]</div>
      <div>expert row : <span class="${u.ecs}">${EN[u.e]}</span></div>
      <div>token col&nbsp; : <span style="color:var(--A)">a=${u.a}</span></div>
      <div>score&nbsp;&nbsp;&nbsp;&nbsp; : <span class="${u.ecs}">${u.sc.toFixed(3)}</span>
      ${isW?' <span class="ck">← topk winner</span>':''}</div>${sigLine}`;
  } else if(u.k==='sks'){
    tt.innerHTML=`<div class="lbl ck">scores_aK [ ${u.a} , 0 ]</div>
      <div>token a=${u.a} &nbsp;(b=${u.b}, s=${u.s})</div>
      <div>winner : <span class="${u.ecs}">${EN[u.e]}</span></div>
      <div>score&nbsp;&nbsp; : <span class="ck">${u.score.toFixed(3)}</span></div>`;
  } else if(u.k==='ski'){
    tt.innerHTML=`<div class="lbl ck">indices_aK [ ${u.a} , 0 ]</div>
      <div>token a=${u.a} &nbsp;(b=${u.b}, s=${u.s})</div>
      <div>winner : <span class="${ECSS[u.e]}">${EN[u.e]}</span></div>
      <div>index&nbsp;&nbsp; : <span class="${ECSS[u.e]}">${u.e}</span></div>`;
  } else if(u.k==='gd'){
    tt.innerHTML=`<div class="lbl" style="color:var(--D)">routed_in_EG_D [ ${u.i} , ${u.d} ]</div>
      <div>expert block : <span class="${ECSS[u.e]}">${EN[u.e]}</span></div>
      <div>token row&nbsp; : <span style="color:var(--A)">a=${u.a} &nbsp;(b=${u.b}, s=${u.s})</span></div>
      <div>feature&nbsp;&nbsp;&nbsp; : <span style="color:var(--D)">d=${u.d}</span></div>
      <div style="color:var(--lo)">= x_aD[ ${u.a} , ${u.d} ]</div>`;
  } else if(u.k==='srs'){
    const valStr=u.isZero?'0  (zero row)':u.sc.toFixed(4)+' (sigmoid)';
    tt.innerHTML=`<div class="lbl ${u.ecs}">router_scores_rs [ ${u.i} , 0 ]</div>
      <div>flat row : <span style="color:var(--A)">i=${u.i}</span></div>
      <div>expert : <span class="${u.ecs}">${EN[u.e]}</span></div>
      <div>token : <span style="color:var(--A)">a=${u.a}</span></div>
      <div style="color:${u.isZero?'var(--lo)':'var(--G)'}">scale = ${valStr}</div>`;
  } else if(u.k==='riexp'){
    tt.innerHTML=`<div class="lbl" style="color:var(--A)">router_indices_exp [ ${u.i} , ${u.d} ]</div>
      <div>flat row : <span style="color:var(--A)">i=${u.i}</span> &nbsp;<span class="${ECSS[u.e]}">(${EN[u.e]})</span></div>
      <div>token index : <span style="color:var(--A)">a=${u.a}</span></div>
      <div>col : <span style="color:var(--D)">d=${u.d}</span></div>
      <div style="color:var(--lo)">value = ${u.a} &nbsp;(broadcast)</div>`;
  } else if(u.k==='ri'){
    tt.innerHTML=`<div class="lbl" style="color:var(--A)">router_indices [ ${u.e} , ${u.a} ]</div>
      <div>expert row : <span class="${ECSS[u.e]}">${EN[u.e]}</span></div>
      <div>token col : <span style="color:var(--A)">a=${u.a}</span></div>
      <div style="color:var(--lo)">value = ${u.a} &nbsp;(arange)</div>`;
  }
  tt.classList.add('on');
}

// ═══════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════
function setDot(i,cls='on'){
  ['d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12','d13','d14','d15','d16','d17','d18','d19','d20','d21','d22'].forEach((id,j)=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.className='dot'+(j<i?' done':j===i?' '+cls:'');
  });
}
function ss(n,d){document.getElementById('sn').textContent=n;document.getElementById('sd').textContent=d;}
function setBtn(t,cls){
  const b=document.getElementById('btn');
  b.textContent=t; b.className='btn'+(cls?' '+cls:''); b.disabled=false;
}
function disBtn(){document.getElementById('btn').disabled=true;}

// ═══════════════════════════════════════════════════
//  DISPATCHER
// ═══════════════════════════════════════════════════
function onAct(){
  if(stage===0) doFlatten();
  else if(stage===2) doScores();
  else if(stage===4) doTopK();
  else if(stage===6) doScatter();
  else if(stage===8) doSigmoid();
  else if(stage===10) doArange();
  else if(stage===12) doReshape();
  else if(stage===13) doExpand();
  else if(stage===14) doGather();
  else if(stage===15) doReshapeScores();
  else if(stage===16) doMultiply();
  else if(stage===17) doShowRI_EGD();
  else if(stage===18) doReshapeRI_EGD();
  else if(stage===19) doExpandRI_EGD();
  else if(stage===20) doScatterAdd();
  else if(stage===21) doView();
}

// ═══════════════════════════════════════════════════
//  STAGE 0→2: FLATTEN
// ═══════════════════════════════════════════════════
function doFlatten(){
  stage=1; disBtn();
  gsap.to(sph,{t:Math.PI*.18,p:1.05,r:17,duration:2.2,ease:'power2.inOut',onUpdate:upCam});
  moveLX(-1.5,2.0);
  setDot(1); ss('SEPARATING','batch slices pull apart along Z');

  const SP=3.2, sd=.6;
  TVox.forEach(({m,b})=>gPos(m,{z:(b-1)*(GAP+SP)},{duration:sd,delay:b*.12,ease:'power2.out'}));
  SliceF.forEach((f,b)=>gPos(f,{z:(b-1)*(GAP+SP)-oz3},{duration:sd,delay:b*.12}));

  const stk=sd+.25, rd=.52;
  ss('STACKING','b·S + s → row a');
  TVox.forEach(({m,b,s,d})=>{
    const p=pFlat(b,s,d), dl=stk+b*(S*.10+.25)+s*.10+d*.008;
    gPos(m,{x:p.x,y:p.y,z:p.z},{duration:rd,delay:dl,ease:'power3.inOut'});
    gsap.to(m.material.color,{
      r:m.userData.bc.r*.85+.08,g:m.userData.bc.g*.85+.05,b:m.userData.bc.b*.85+.05,
      duration:rd,delay:dl});
  });
  SliceF.forEach((f,b)=>gsap.to(f.material,{opacity:0,duration:.4,delay:stk+b*.15}));
  const rv=stk+B*S*.10+rd+.15;
  gsap.to(FlatF.material,{opacity:.5,duration:.6,delay:rv});

  setTimeout(()=>{
    stage=2; setDot(2);
    document.getElementById('vname-l').textContent='x_aD';
    ss('FLAT','x_aD [9,10] · tokens × features');
    gsap.to('#sf',{opacity:.35,duration:.4});
    gsap.to('#vl',{opacity:1,duration:.4,delay:.2});
    gsap.to('#st',{opacity:1,duration:.5,delay:.35});
    document.getElementById('sub-l').innerHTML=
      '<div><span class="a">A=9</span> · B×S flattened</div>'+
      '<div><span class="d">D=10</span> · features</div>';
    setBtn('BUILD ROUTER SCORES  [3, 9]','em');
    saveSnap(2); updateBack();
  },(rv+.8)*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 2→4: ROUTER SCORES
// ═══════════════════════════════════════════════════
function doScores(){
  stage=3; disBtn();
  gsap.to(sph,{t:Math.PI*.14,p:Math.PI*.40,r:20,duration:1.5,ease:'power2.inOut',onUpdate:upCam});
  moveLX(0,1.5);
  setDot(3,'onE'); ss('ROUTING','x_aD @ W_router → .transpose(0,1)  →  router_scores [3,9]');

  // Drop in expert rows one at a time (E₀ first), tokens left→right within each row
  for(let e=0;e<E;e++){
    const cd=.4+e*.70;
    for(let a=0;a<A;a++){
      const v=SVox[e*A+a], p=pRS(e,a), dl=cd+a*.055;
      v.m.position.set(p.x,p.y+1.2,p.z); v.m.scale.setScalar(.01); v.m.material.opacity=0;
      gPos(v.m,{x:p.x,y:p.y,z:p.z},{duration:.42,delay:dl,ease:'back.out(1.5)'});
      gsap.to(v.m.material,{opacity:1,duration:.28,delay:dl});
      gScl(v.m,{x:1,y:1,z:1},{duration:.32,delay:dl,ease:'back.out(1.8)'});
    }
  }
  const done=.4+E*.70+A*.055+.45;
  setTimeout(()=>{
    gsap.to(RSF.material,{opacity:.5,duration:.5});
    document.getElementById('pm').style.opacity='1';
    // x_aD still needed: gather (stage 12) flies tokens from here
    // FlatF still needed: visual anchor for x_aD until gather completes
    // Only dim the pl label — x_aD is now x_aD not x_bsD
    document.getElementById('pl').style.opacity='0';
    stage=4; setDot(4,'onE');
    ss('ROUTER SCORES READY','[3,9] · transposed — each expert row scores all 9 tokens');
    setBtn('RUN  torch.topk( K=1 )','km');
    saveSnap(4); updateBack();
  },done*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 4→6: TOP-K
// ═══════════════════════════════════════════════════
function doTopK(){
  stage=5; disBtn();
  gsap.to(sph,{t:Math.PI*.09,p:Math.PI*.38,r:26,duration:1.6,ease:'power2.inOut',onUpdate:upCam});
  moveLX(1.2,1.6);
  setDot(5,'onK'); ss('TRANSPOSE  [3,9]→[9,3]','each column becomes a row — token rows, expert cols');

  // Conceptual: topk operates on router_scores.T [9,3]
  // Each row=token, cols=experts. Scan each token row E0→E2, winner pops.
  for(let a=0;a<A;a++){
    const rowDelay=0.25+a*0.18;
    const wE=WINNERS[a].e;
    // Scan the 3 expert columns for this token row
    for(let e=0;e<E;e++){
      const v=SVox[e*A+a];  // same data, visualised column-wise
      const scanT=rowDelay+e*0.10;
      gScl(v.m,{x:1.4,y:1.4,z:1.4},{duration:.08,delay:scanT,yoyo:true,repeat:1});
      gsap.to(v.m.material,{emissiveIntensity:4,duration:.08,delay:scanT,yoyo:true,repeat:1});
    }
    const afterScan=rowDelay+E*0.10+0.10;
    for(let e=0;e<E;e++){
      const v=SVox[e*A+a];
      const isW=(e===wE);
      gsap.to(v.m.material,{opacity:isW?.95:.07,duration:.22,delay:afterScan});
      if(isW){
        gScl(v.m,{x:1.6,y:1.6,z:1.6},{duration:.14,delay:afterScan,yoyo:true,repeat:1,ease:'power2.out'});
        gsap.to(v.m.material,{emissiveIntensity:5,duration:.14,delay:afterScan,yoyo:true,repeat:1});
      }
    }
  }

  const scanDone=0.25+A*0.18+E*0.10+0.35;

  // Phase 2: scores_aK [9,1] — winning expert scores fly right (one per token)
  const sksStart=scanDone;
  ss('EXTRACTING  scores_aK','best expert score per token → scores_aK [9,1]');
  SKSVox.forEach(({m,a})=>{
    const wE=WINNERS[a].e;
    const src=pRS(wE,a);   // source cell: expert row wE, token col a
    m.position.set(src.x,src.y,src.z);
    m.scale.setScalar(.9); m.material.opacity=0;
    const tgt=pSKS(a), dl=sksStart+a*0.07;
    gPos(m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.55,delay:dl,ease:'power3.out'});
    gsap.to(m.material,{opacity:1,duration:.30,delay:dl});
    gScl(m,{x:1,y:1,z:1},{duration:.40,delay:dl+.10,ease:'back.out(1.5)'});
  });

  // Phase 3: indices_aK [9,1] — winning expert indices fly right (one per token)
  const skiStart=sksStart+0.15;
  SKIVox.forEach(({m,a})=>{
    const wE=WINNERS[a].e;
    const src=pRS(wE,a);
    m.position.set(src.x,src.y,src.z);
    m.scale.setScalar(.9); m.material.opacity=0;
    const tgt=pSKI(a), dl=skiStart+a*0.07;
    gPos(m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.55,delay:dl,ease:'power3.out'});
    gsap.to(m.material,{opacity:1,duration:.30,delay:dl});
    gScl(m,{x:1,y:1,z:1},{duration:.40,delay:dl+.10,ease:'back.out(1.5)'});
  });

  // Phase 4: settle
  const allDone=skiStart+A*0.07+0.70;
  setTimeout(()=>{
    gsap.to(SKSF.material,{opacity:.55,duration:.4});
    gsap.to(SKIF.material,{opacity:.55,duration:.4});
    gsap.to(DivL.material,{opacity:.5,duration:.4});
    gsap.to(RSF.material,{opacity:.22,duration:.5});
    document.getElementById('pr').style.opacity='1';
    document.getElementById('code').style.opacity='1';
    stage=6; setDot(6,'onK');
    ss('TOP-K COMPLETE','scores_aK [9,1] & indices_aK [9,1] ready');
    setBtn('SCATTER  back → router_scores','km');
    saveSnap(6); updateBack();
  },allDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 6→8: SCATTER  sparse router_scores [3,9]
//  torch.full_like(..., -inf).scatter_(1, indices_aK, scores_aK)
//  Losers wipe to zero/dark; winner score flies back into its slot.
// ═══════════════════════════════════════════════════
function doScatter(){
  stage=7; disBtn();
  // Camera re-centres on the router_scores matrix
  gsap.to(sph,{t:Math.PI*.12,p:Math.PI*.39,r:22,duration:1.4,ease:'power2.inOut',onUpdate:upCam});
  moveLX(0.5,1.4);
  setDot(7,'onK'); ss('FILLING  −∞','torch.full_like → all slots set to −∞ (zero out losers)');

  document.getElementById('code').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code2').style.opacity='1'; },600);

  // Phase 1: wipe — for each token col, non-winner expert rows go dark
  // Winners per token: WINNERS[a].e — the expert row that won for that column
  gsap.to(RSF.material,{opacity:.5,duration:.4});
  for(let a=0;a<A;a++){
    const colDelay=0.3+a*0.09;
    const wE=WINNERS[a].e;
    for(let e=0;e<E;e++){
      const v=SVox[e*A+a];
      if(e!==wE){
        const lc=EC[e].clone().lerp(new THREE.Color(0x1a1f2e),.78);
        gsap.to(v.m.material,{opacity:0.90,duration:.07,delay:colDelay,yoyo:true,repeat:1});
        gsap.to(v.m.material,{opacity:0.82,duration:.25,delay:colDelay+.12});
        gsap.to(v.m.material.color,{r:lc.r,g:lc.g,b:lc.b,duration:.28,delay:colDelay+.12});
        gsap.to(v.m.material.emissive,{r:lc.r*.35,g:lc.g*.35,b:lc.b*.35,duration:.28,delay:colDelay+.12});
        v.m.userData.isZero=true;
      }
    }
  }

  const wipeDone=0.3+A*0.09+0.4;

  // Phase 2: scatter_ — each scores_aK[a] arcs LEFT into its [wE, a] cell
  ss('SCATTER_','best expert score arcs back into router_scores at winner row');
  for(let a=0;a<A;a++){
    const wE=WINNERS[a].e;
    const tgt=pRS(wE,a);    // target: expert row wE, token col a
    const src=pSKS(a);
    const dl=wipeDone+a*0.09;
    const {m}=SKSVox[a];

    const px={x:src.x,y:src.y,z:src.z};
    const midX=(src.x+tgt.x)/2, midY=src.y+0.5;
    gsap.to(px,{x:midX,y:midY,z:0,duration:.22,delay:dl,ease:'power1.out',
      onUpdate(){ m.position.set(px.x,px.y,px.z); }});
    gsap.to(px,{x:tgt.x,y:tgt.y,z:0,duration:.22,delay:dl+.22,ease:'power2.in',
      onUpdate(){ m.position.set(px.x,px.y,px.z); }});
    gsap.to(m.material,{opacity:0,duration:.15,delay:dl+.44});

    const sv=SVox[wE*A+a];
    gsap.to(sv.m.material,{opacity:.95,duration:.2,delay:dl+.38});
    gScl(sv.m,{x:1.3,y:1.3,z:1.3},{duration:.1,delay:dl+.38,yoyo:true,repeat:1});
  }

  const scatterDone=wipeDone+A*0.09+0.55;
  setTimeout(()=>{
    // Both scores_aK and indices_aK fully consumed by scatter — remove both
    SKSVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.35}));
    SKIVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.35,delay:.05}));
    gsap.to(SKSF.material,{opacity:0,duration:.35});
    gsap.to(SKIF.material,{opacity:0,duration:.35});
    gsap.to(DivL.material,{opacity:0,duration:.30});
    document.getElementById('pr').style.opacity='0';

    stage=8; setDot(8,'onK');
    ss('SCATTER COMPLETE','router_scores [3,9] · one winning score per token column');
    setBtn('APPLY  torch.sigmoid( router_scores )','em');
    saveSnap(8); updateBack();
  },scatterDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 8→10: SIGMOID  router_scores = sigmoid(router_scores)
//  Each surviving cell gets squashed: sigmoid(x) = 1/(1+e^-x)
//  Visually: brightness pulses, colour temperature warms, value updates.
// ═══════════════════════════════════════════════════
function sigmoid(x){ return 1/(1+Math.exp(-x)); }

function doSigmoid(){
  stage=9; disBtn();
  document.getElementById('code2').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code3').style.opacity='1'; },400);
  setDot(9,'onG'); ss('SIGMOID','squashing winner scores → (0, 1) range');

  // For each token col: the winning expert row pulses green, losers ripple→zero
  for(let a=0;a<A;a++){
    const wE=WINNERS[a].e;
    const rawScore=WINNERS[a].score;
    const sigScore=sigmoid(rawScore);
    const sv=SVox[wE*A+a];  // winner cell: expert row wE, token col a
    const dl=0.2+a*0.10;

    // Winner: scale pulse then elastic snap
    gScl(sv.m,{x:1.8,y:1.8,z:1.8},{duration:.18,delay:dl,ease:'power2.out',
      onComplete(){ gScl(sv.m,{x:1,y:1,z:1},{duration:.22,ease:'elastic.out(1,0.5)'}); }});
    const sigCol=EC[wE].clone().lerp(new THREE.Color(0x34d399),0.45).lerp(new THREE.Color(0x07090f),1-sigScore*.95);
    gsap.to(sv.m.material.color,{r:sigCol.r,g:sigCol.g,b:sigCol.b,duration:.4,delay:dl+.10});
    gsap.to(sv.m.material.emissive,{
      r:0.05+sigScore*.08, g:0.18+sigScore*.22, b:0.10+sigScore*.06,
      duration:.4,delay:dl+.10});
    sv.m.userData.sigScore=sigScore;
    sv.m.userData.rawScore=rawScore;
    sv.m.userData.isSig=true;

    // Losers: sigmoid(-inf)=0 — ripple + zero colour
    for(let e=0;e<E;e++){
      if(e===wE) continue;
      const lv=SVox[e*A+a];
      const lc=EC[e].clone().lerp(new THREE.Color(0x1a1f2e),.78);
      gScl(lv.m,{x:1.18,y:1.18,z:1.18},{duration:.10,delay:dl+.04,yoyo:true,repeat:1});
      gsap.to(lv.m.material.color,{r:lc.r,g:lc.g,b:lc.b,duration:.30,delay:dl+.04});
      gsap.to(lv.m.material.emissive,{r:lc.r*.35,g:lc.g*.35,b:lc.b*.35,duration:.30,delay:dl+.04});
      gsap.to(lv.m.material,{opacity:0.82,duration:.20,delay:dl+.04});
      lv.m.userData.sigScore=0;
      lv.m.userData.rawScore=-Infinity;
      lv.m.userData.isSig=true;
      lv.m.userData.isZero=true;
    }
  }

  const allDone=0.2+A*0.10+0.55;
  setTimeout(()=>{
    // Update RS frame to green
    gsap.to(RSF.material.color,{r:0.2,g:0.8,b:0.5,duration:.5});
    stage=10; setDot(10,'onG');
    ss('SIGMOID COMPLETE','router_scores [3,9] · sparse sigmoid weights ready');
    setBtn('BUILD  router_indices  [3,9]','');
    saveSnap(10); updateBack();
  },allDone*1000);
}


// ═══════════════════════════════════════════════════
//  STAGE 10→12: ARANGE + EXPAND  router_indices [E,A]=[3,9]
//  torch.arange(A) → [0..8]           shape [A]  = [9]
//  .view(1,-1)     → [[0..8]]         shape [1,A] = [1,9]
//  .expand(E,-1)   → E identical rows shape [E,A] = [3,9]
//
//  Animation plan:
//  Phase 1 – arange: single row [0..8] drops in left→right (9 cells)
//  Phase 2 – view(1,-1): row pulses to signal reshape to [1,9]
//  Phase 3 – expand(E,-1): rows e=1,2 clone from row 0 and
//             stamp DOWN to their expert row slot, staggered.
//             Row colour = expert hue tint so each row has identity.
// ═══════════════════════════════════════════════════
function doArange(){
  stage=11; disBtn();
  // Camera pans right + pulls back to show [3,9] matrix beside router_scores [3,9]
  gsap.to(sph,{t:Math.PI*.07,p:Math.PI*.37,r:28,duration:1.6,ease:'power2.inOut',onUpdate:upCam});
  moveLX(3.2,1.6);
  document.getElementById('code3').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code4').style.opacity='1'; },700);
  setDot(11,'onI'); ss('arange(A)','building token index sequence  [0, 1, 2, … 8]');

  // ── Phase 1: arange — single template row e=0 materialises left→right ──────
  const ROW0_DELAY=0.7;
  for(let a=0;a<A;a++){
    const {m}=RIVox[0*A+a];  // e=0, all a
    const tgt=pRI(0,a);
    m.position.set(tgt.x, tgt.y+2.0, tgt.z);
    m.scale.setScalar(0.01);
    m.material.opacity=0;
    const dl=ROW0_DELAY+a*0.09;
    gPos(m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.36,delay:dl,ease:'back.out(1.5)'});
    gsap.to(m.material,{opacity:1,duration:.22,delay:dl});
    gScl(m,{x:1,y:1,z:1},{duration:.28,delay:dl,ease:'back.out(1.8)'});
  }

  // ── Phase 2: view(1,-1) — row pulses, label updates ──────────────────────
  const viewDone=ROW0_DELAY+A*0.09+0.28;
  setTimeout(()=>{
    ss('view(1, −1)','shape [A] → [1, A]  ·  one row of 9 token indices');
    for(let a=0;a<A;a++){
      const {m}=RIVox[0*A+a];
      gScl(m,{x:1.30,y:1.30,z:1.30},{duration:.09,delay:a*0.035,yoyo:true,repeat:1,ease:'power2.out'});
    }
  }, viewDone*1000);

  // ── Phase 3: expand(E,-1) — rows e=1,2 clone from row 0, stamp downward ──
  const expandStart=viewDone+0.50;
  setTimeout(()=>{ ss('expand(E, −1)','row broadcast × E experts  →  [E, A] = [3, 9]'); }, expandStart*1000);

  for(let e=1;e<E;e++){
    const rowDelay=expandStart+(e-1)*0.32;
    for(let a=0;a<A;a++){
      const {m}=RIVox[e*A+a];
      const src=pRI(0,a);   // clone from the template row
      const tgt=pRI(e,a);
      m.position.set(src.x, src.y, src.z);
      m.scale.setScalar(0.90);
      m.material.opacity=0;
      const dl=rowDelay+a*0.025;
      // Flash in at source position
      gsap.to(m.material,{opacity:0.90,duration:.10,delay:dl});
      // Drop to target expert row
      gPos(m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.30,delay:dl,ease:'power2.out'});
      gScl(m,{x:1,y:1,z:1},{duration:.20,delay:dl+.08,ease:'back.out(1.4)'});
    }
    // Tint each new row with its expert colour so row identity is clear
    // (subtle overlay: lerp base amber toward expert hue)
    setTimeout(()=>{
      for(let a=0;a<A;a++){
        const {m}=RIVox[e*A+a];
        const tinted=RI_COLS[a].clone().lerp(EC[e],.22);
        gsap.to(m.material.color,{r:tinted.r,g:tinted.g,b:tinted.b,duration:.28});
        gsap.to(m.material.emissive,{r:tinted.r*.25,g:tinted.g*.25,b:tinted.b*.25,duration:.28});
      }
    },(rowDelay+A*0.025+0.35)*1000);
  }

  // Also tint row 0 (e=0) with E₀ expert colour
  setTimeout(()=>{
    for(let a=0;a<A;a++){
      const {m}=RIVox[0*A+a];
      const tinted=RI_COLS[a].clone().lerp(EC[0],.22);
      gsap.to(m.material.color,{r:tinted.r,g:tinted.g,b:tinted.b,duration:.28});
      gsap.to(m.material.emissive,{r:tinted.r*.25,g:tinted.g*.25,b:tinted.b*.25,duration:.28});
    }
  },(expandStart)*1000);

  const allDone=expandStart+(E-1)*0.32+A*0.025+0.60;
  setTimeout(()=>{
    gsap.to(RIF.material,{opacity:.55,duration:.5});
    document.getElementById('prf').style.opacity='1';
    // router_scores SVox still needed — doWeightScale physically moves them
    // x_aD TVox still needed — doGather flies rows from here
    // Dim both slightly for visual breathing room, but keep them readable
    SVox.forEach(({m})=>{ if(m.material.opacity>0.05) gsap.to(m.material,{opacity:.45,duration:.7}); });
    gsap.to(RSF.material,{opacity:.28,duration:.7});
    TVox.forEach(({m})=>gsap.to(m.material,{opacity:.18,duration:.7}));
    gsap.to(FlatF.material,{opacity:.20,duration:.7});
    stage=12; setDot(12,'onI');
    ss('ARANGE COMPLETE','router_indices [3,9]  ·  every row = [0,1,2,…,8]');
    setBtn('RESHAPE  −1, 1','');
    saveSnap(12); updateBack();
  }, allDone*1000);
}


// ═══════════════════════════════════════════════════
//  STAGE 12→13: RESHAPE  router_indices [3,9] → [27,1]
//  RIVox rows collapse row-major into single column at CX_RI_COL.
//  Expert block 0 stays in y, blocks 1 and 2 stack below.
// ═══════════════════════════════════════════════════
function doReshape(){
  stage=13; disBtn();
  gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:38,duration:1.6,ease:'power2.inOut',onUpdate:upCam});
  moveLX(6.0,1.6);
  document.getElementById('code4').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code5').style.opacity='1'; },800);
  document.getElementById('prf').style.opacity='0';
  setDot(13,'onR'); ss('reshape(−1, 1)','router_indices [3,9] → flat column [27,1]');

  const CX_RI_COL = CX_RI-(A-1)*GAP/2;  // leftmost col of RI grid = column x for [27,1]
  const RESHAPE_START=0.8;
  for(let e=0;e<E;e++){
    for(let a=0;a<A;a++){
      const {m}=RIVox[e*A+a];
      const i=e*A+a;
      const dl=RESHAPE_START+e*0.22+a*0.04;
      gPos(m,{x:CX_RI_COL, y:OY_GD+i*GAP, z:0},{duration:.38,delay:dl,ease:'power2.inOut'});
    }
  }
  const reshapeDone=RESHAPE_START+E*0.22+A*0.04+0.45;
  setTimeout(()=>{
    gsap.to(RIF.material,{opacity:0,duration:.4});
    stage=13; setDot(13,'onR');
    ss('RESHAPE DONE','[27,1] · row-major column ready');
    setBtn('EXPAND  −1, D','');
    saveSnap(13); updateBack();
  }, reshapeDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 13→14: EXPAND  [27,1] → [27,10]  in-place
//  The stacked [27,1] column fans out rightward.
//  d=0 column stays where it is (CX_RI_COL).
//  d=1..9 columns sweep right, each spawning from the [27,1] column.
//  RIVox (the [27,1] column) fades as RIExpVox takes over.
//  Result: [27,10] matrix centred at CX_RI — same footprint as router_indices [3,9].
// ═══════════════════════════════════════════════════
function doExpand(){
  stage=14; disBtn();
  setDot(14,'onR'); ss('expand(−1, D)','[27,1] broadcasts rightward → [27,10]');

  const CX_RI_COL = CX_RI-(A-1)*GAP/2;

  // Reset all RIExpVox to starting column and hidden
  RIExpVox.forEach(({m,i,d})=>{
    m.position.set(CX_RI_COL, OY_GD+i*GAP, 0);
    m.scale.setScalar(0.01);
    m.material.opacity=0;
    m.material.color.set(m.userData.bc);
    m.material.emissive.set(m.userData.bc.clone().multiplyScalar(.25));
  });

  // Sweep columns left→right: d=0 stays, d=1..9 fan right
  for(let d=0;d<D;d++){
    const colDelay=0.3+d*0.14;
    const tgtX=CX_RI-(D-1)*GAP/2+d*GAP;  // pRIExp(i,d).x
    for(let i=0;i<E*A;i++){
      const rv=RIExpVox[i*D+d];
      const tgtY=OY_GD+i*GAP;
      const dl=colDelay+i*0.007;
      gsap.to(rv.m.material,{opacity:0.88,duration:.14,delay:dl});
      gPos(rv.m,{x:tgtX,y:tgtY,z:0},{duration:.28,delay:dl,ease:'power2.out'});
      gScl(rv.m,{x:1,y:1,z:1},{duration:.18,delay:dl+.06,ease:'back.out(1.3)'});
    }
  }

  // Fade the RIVox [27,1] source column once d=2 is well underway
  const riColFadeTime=0.3+2*0.14+0.25;
  setTimeout(()=>{
    RIVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.4}));
  }, riColFadeTime*1000);

  const expandDone=0.3+D*0.14+E*A*0.007+0.45;
  setTimeout(()=>{
    gsap.to(RIEF.material,{opacity:.52,duration:.5});
    document.getElementById('pri').style.opacity='1';
    ss('EXPAND DONE','router_indices [27,10]  ·  same values broadcast across all D columns');
    setBtn('GATHER  dim=0','');
    saveSnap(14); updateBack();
  }, expandDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 14→15: GATHER  routed_in_EG_D [27,10]
//  GDVox rows fly from x_aD source positions to CX_GD target.
//  Each token a appears in E=3 rows (one per expert block).
// ═══════════════════════════════════════════════════
function doGather(){
  stage=15; disBtn();
  gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:44,duration:1.4,ease:'power2.inOut',onUpdate:upCam});
  moveLX(8.5,1.4);
  setDot(15,'onR'); ss('gather  dim=0','x_aD[ index[i] , : ] → token features dispatched to all E experts');

  for(let a=0;a<A;a++){
    const tokDelay=0.5+a*0.16;
    const b=Math.floor(a/S), s=a%S;
    for(let e=0;e<E;e++){
      const i=e*A+a;
      const rowDelay=tokDelay+e*0.06;
      for(let d=0;d<D;d++){
        const gv=GDVox[i*D+d];
        const src=pFlat(b,s,d);
        const tgt=pGD(i,d);
        const dl=rowDelay+d*0.015;
        gv.m.position.set(src.x, src.y, src.z);
        gv.m.scale.setScalar(0.85);
        gv.m.material.opacity=0;
        const tc=gv.m.userData.bc.clone();
        gv.m.material.color.set(tc);
        gv.m.material.emissive.set(tc.clone().multiplyScalar(.18));
        gsap.to(gv.m.material,{opacity:0.92,duration:.15,delay:dl});
        gPos(gv.m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.42,delay:dl,ease:'power2.out'});
        gScl(gv.m,{x:1,y:1,z:1},{duration:.26,delay:dl+.14,ease:'back.out(1.3)'});
      }
    }
  }

  const tvoxDimTime=0.5+A*0.16+E*0.06+0.5;
  setTimeout(()=>{
    TVox.forEach(({m})=>gsap.to(m.material,{opacity:.30,duration:.7}));
  }, tvoxDimTime*1000);

  const allDone=0.5+A*0.16+E*0.06+D*0.015+0.70;
  setTimeout(()=>{
    gsap.to(GDF.material,{opacity:.55,duration:.5});
    document.getElementById('pgg').style.opacity='1';
    // router_indices_exp consumed — data now in GDVox
    RIExpVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.7}));
    gsap.to(RIEF.material,{opacity:0,duration:.6});
    document.getElementById('pri').style.opacity='0';
    // x_aD fully consumed
    TVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.8}));
    gsap.to(FlatF.material,{opacity:0,duration:.6});
    document.getElementById('pl').style.opacity='0';

    // Slide router_scores [3,9] right to sit adjacent to routed_in_EG_D
    // New centre = 7.7 → same gap from GD left edge as canonical 1.9
    const CX_RS_NEW=7.7;
    SVox.forEach(({m,e,a})=>{
      if(m.material.opacity<0.02) return; // skip fully hidden cells
      const newX=CX_RS_NEW-(A-1)*GAP/2+a*GAP;
      gPos(m,{x:newX, y:m.position.y, z:0},{duration:.55,ease:'power2.inOut'});
    });
    // Update RSF wireframe geometry to new position
    const rsfX0=CX_RS_NEW-(A-1)*GAP/2-CELL/2;
    const rsfX1=CX_RS_NEW+(A-1)*GAP/2+CELL/2;
    const rsfY0=OY_RS-CELL/2, rsfY1=OY_RS+(E-1)*GAP+CELL/2;
    RSF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      rsfX0,rsfY0,0, rsfX1,rsfY0,0,
      rsfX1,rsfY0,0, rsfX1,rsfY1,0,
      rsfX1,rsfY1,0, rsfX0,rsfY1,0,
      rsfX0,rsfY1,0, rsfX0,rsfY0,0],3));
    RSF.geometry.attributes.position.needsUpdate=true;
    // Camera recentres on midpoint between the two matrices
    gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:38,duration:.8,ease:'power2.inOut',onUpdate:upCam});
    moveLX(11.2,.8);

    stage=15; setDot(15,'onR');
    ss('GATHER COMPLETE','routed_in_EG_D [27,10]  ·  ready to weight-scale');
    setBtn('SCALE  ×  router_scores.reshape(−1,1)','em');
    saveSnap(15); updateBack();
  }, allDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 15→16: RESHAPE SCORES
//  router_scores [3,9] collapses row-major → [27,1] column at CX_SRS.
//  SVox cells animate to stack; SRSVox materialises on top showing
//  green winners and dim zeros. Settles waiting for multiply click.
// ═══════════════════════════════════════════════════
function doReshapeScores(){
  stage=16; disBtn();
  document.getElementById('code5').style.opacity='0';
  document.getElementById('pgg').style.opacity='0';
  document.getElementById('pout').style.opacity='0';
  document.getElementById('code7').style.opacity='0';
  document.getElementById('code8').style.opacity='0';
  document.getElementById('code9').style.opacity='0';
  document.getElementById('pout3d').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code6').style.opacity='1'; },600);
  gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:38,duration:1.0,ease:'power2.inOut',onUpdate:upCam});
  moveLX(9.5,1.0);
  setDot(16,'onG'); ss('reshape(−1, 1)','router_scores [3,9] → flat column [27,1]');

  const RESHAPE_START=0.8;
  for(let e=0;e<E;e++){
    for(let a=0;a<A;a++){
      const i=e*A+a;
      const sv=SVox[e*A+a];
      const dl=RESHAPE_START+e*0.18+a*0.04;
      gPos(sv.m,{x:CX_SRS, y:OY_GD+i*GAP, z:0},{duration:.36,delay:dl,ease:'power2.inOut'});
    }
  }

  const srsAppear=RESHAPE_START+E*0.18+A*0.04+0.30;
  for(let i=0;i<E*A;i++){
    const {m}=SRSVox[i];
    const p=pSRS(i);
    m.position.set(p.x, p.y, p.z);
    m.scale.setScalar(0.01);
    m.material.opacity=0;
    const dl=srsAppear+i*0.022;
    gsap.to(m.material,{opacity:0.95,duration:.18,delay:dl});
    gScl(m,{x:1,y:1,z:1},{duration:.20,delay:dl,ease:'back.out(1.5)'});
  }
  setTimeout(()=>{
    SVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.35}));
    gsap.to(SRSF.material,{opacity:.55,duration:.5});
    gsap.to(RSF.material,{opacity:0,duration:.4});
  },(srsAppear+0.4)*1000);

  const reshapeDone=srsAppear+E*A*0.022+0.70;
  setTimeout(()=>{
    // Centre SRSVox [27,1] and GDVox [27,10] with canonical gap between them
    const NEW_CX_SRS=-3.65, NEW_CX_GD=1.15;
    const SLIDE=0.55, EASE='power2.inOut';

    // Slide SRSVox column
    SRSVox.forEach(({m},i)=>{
      gPos(m,{x:NEW_CX_SRS, y:OY_GD+i*GAP, z:0},{duration:SLIDE,ease:EASE});
    });
    // Slide GDVox grid
    GDVox.forEach(({m},idx)=>{
      const i=Math.floor(idx/D), d=idx%D;
      const newX=NEW_CX_GD-(D-1)*GAP/2+d*GAP;
      gPos(m,{x:newX, y:OY_GD+i*GAP, z:0},{duration:SLIDE,ease:EASE});
    });
    // Update SRSF wireframe geometry
    (()=>{
      const x0=NEW_CX_SRS-CELL/2, x1=NEW_CX_SRS+CELL/2;
      const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
      SRSF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
      SRSF.geometry.attributes.position.needsUpdate=true;
    })();
    // Update GDF wireframe geometry
    (()=>{
      const x0=NEW_CX_GD-(D-1)*GAP/2-CELL/2, x1=NEW_CX_GD+(D-1)*GAP/2+CELL/2;
      const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
      GDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
      GDF.geometry.attributes.position.needsUpdate=true;
    })();
    // Camera centres on midpoint of the pair
    gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:32,duration:SLIDE*1.5,ease:EASE,onUpdate:upCam});
    moveLX(-1.25, SLIDE*1.5);

    ss('RESHAPE DONE','[27,1] · green = sigmoid winner · dark = zero · ready to multiply');
    setBtn('MULTIPLY  ×  routed_in_EG_D','em');
    saveSnap(16); updateBack();
  }, reshapeDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 16→17: MULTIPLY
//  SRSVox [27,1] sweeps row-by-row into GDVox [27,10].
//  Zero rows collapse to near-black; winner rows scale-pop
//  and settle at brightness proportional to sigmoid score.
// ═══════════════════════════════════════════════════
function doMultiply(){
  stage=17; disBtn();
  setDot(17,'onG'); ss('multiply  ×  [27,1]','each score sweeps into its GD row · zero rows collapse');

  let activeCount=0, zeroCount=0;
  for(let i=0;i<E*A;i++){
    const {m:srsM, sc, isZero}=SRSVox[i];
    const rowDelay=0.3+i*0.13;

    if(isZero){
      zeroCount++;
      const darkC=new THREE.Color(0x1a0808);
      setTimeout(()=>{
        gsap.to(srsM.material.color,{r:darkC.r,g:darkC.g,b:darkC.b,duration:.20});
        gsap.to(srsM.material,{opacity:0.45,duration:.30});
        gScl(srsM,{x:0.7,y:0.7,z:0.7},{duration:.20,ease:'power2.in'});
      }, rowDelay*1000);
      for(let d=0;d<D;d++){
        const gv=GDVox[i*D+d];
        const dl=rowDelay+d*0.012;
        // Dim but keep token hue so it reads as a real matrix cell (just zeroed)
        const baseC=gv.m.userData.bc.clone();
        const zC=baseC.clone().lerp(new THREE.Color(0x07090f), 0.82);
        const zE=baseC.clone().multiplyScalar(0.06);
        gScl(gv.m,{x:1.25,y:1.25,z:1.25},{duration:.07,delay:dl,
          onComplete(){ gScl(gv.m,{x:0.85,y:0.85,z:0.85},{duration:.22,ease:'power2.out'}); }});
        gsap.to(gv.m.material.color,{r:zC.r,g:zC.g,b:zC.b,duration:.30,delay:dl+.06});
        gsap.to(gv.m.material.emissive,{r:zE.r,g:zE.g,b:zE.b,duration:.25,delay:dl+.06});
        gsap.to(gv.m.material,{opacity:0.45,duration:.28,delay:dl+.06});
        gv.m.userData.weightedZero=true;
      }
    } else {
      activeCount++;
      setTimeout(()=>{
        gScl(srsM,{x:1.35,y:1.35,z:1.35},{duration:.12,
          onComplete(){ gScl(srsM,{x:1,y:1,z:1},{duration:.18,ease:'elastic.out(1,.5)'}); }});
        gsap.to(srsM.material,{opacity:1,duration:.12});
      }, rowDelay*1000);
      for(let d=0;d<D;d++){
        const gv=GDVox[i*D+d];
        const dl=rowDelay+d*0.014;
        const baseC=gv.m.userData.bc.clone();
        const wC=baseC.clone().lerp(new THREE.Color(0x07090f), 1-sc*0.88);
        const wE=baseC.clone().multiplyScalar(sc*0.35);
        gScl(gv.m,{x:1.35,y:1.35,z:1.35},{duration:.10,delay:dl,
          onComplete(){ gScl(gv.m,{x:1,y:1,z:1},{duration:.22,ease:'elastic.out(1,.5)'}); }});
        gsap.to(gv.m.material.color,{r:wC.r,g:wC.g,b:wC.b,duration:.35,delay:dl+.08});
        gsap.to(gv.m.material.emissive,{r:wE.r,g:wE.g,b:wE.b,duration:.35,delay:dl+.08});
        gsap.to(gv.m.material,{opacity:0.95,duration:.20,delay:dl});
        gv.m.userData.scaledScore=sc;
      }
    }
  }

  const allDone=0.3+E*A*0.13+D*0.014+0.65;
  setTimeout(()=>{
    gsap.to(SRSF.material,{opacity:0,duration:.5});
    SRSVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.45}));

    // Centre GDVox at x=0 as score column disappears
    const FINAL_CX_GD=0.0, SLIDE=0.55, EASE='power2.inOut';
    GDVox.forEach(({m},idx)=>{
      const d=idx%D;
      const newX=FINAL_CX_GD-(D-1)*GAP/2+d*GAP;
      gPos(m,{x:newX, y:m.position.y, z:0},{duration:SLIDE,ease:EASE});
    });
    // Update GDF wireframe to centred position
    (()=>{
      const x0=FINAL_CX_GD-(D-1)*GAP/2-CELL/2, x1=FINAL_CX_GD+(D-1)*GAP/2+CELL/2;
      const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
      GDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
      GDF.geometry.attributes.position.needsUpdate=true;
    })();
    gsap.to(GDF.material,{opacity:.65,duration:.5,delay:.1});
    // Camera centres on GDVox
    gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:28,duration:SLIDE*1.4,ease:EASE,onUpdate:upCam});
    moveLX(0, SLIDE*1.4);

    document.getElementById('pm').style.opacity='0';
    document.getElementById('pws').style.opacity='1';
    stage=17; setDot(17,'onG');
    ss('SCALE COMPLETE','routed_in_EG_D [27,10]  ·  9 active rows · 18 zero rows');
    setBtn('BUILD  router_indices_EG_D','');
    saveSnap(17); updateBack();
  }, allDone*1000);
}


// ═══════════════════════════════════════════════════
//  STAGE 17→18: SHOW router_indices [3,9]
//  Bring RIVox back into view at CX_RI_EGD, left of GDVox.
//  Same amber colour, E rows, A cols. Materialises row by row
//  top→bottom to mirror how arange built it originally.
// ═══════════════════════════════════════════════════
function doShowRI_EGD(){
  stage=18; disBtn();
  document.getElementById('code6').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code7').style.opacity='1'; },500);
  // Camera widens to show both RI [3,9] (left) and GDVox (right)
  gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:36,duration:1.2,ease:'power2.inOut',onUpdate:upCam});
  moveLX(-3.65,1.2);
  setDot(18,'onI'); ss('router_indices [3,9]','arange token indices — each expert row = [0,1,2,…,8]');

  // Slide GDVox right to CX_GD_RIEGLD=3.65 to make room for RI_EGD on the left
  GDVox.forEach(({m},idx)=>{
    const d=idx%D;
    const newX=CX_GD_RIEGLD-(D-1)*GAP/2+d*GAP;
    gPos(m,{x:newX, y:m.position.y, z:0},{duration:.6,ease:'power2.inOut'});
  });
  // Update GDF wireframe
  (()=>{
    const x0=CX_GD_RIEGLD-(D-1)*GAP/2-CELL/2, x1=CX_GD_RIEGLD+(D-1)*GAP/2+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    GDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    GDF.geometry.attributes.position.needsUpdate=true;
  })();

  // Reset RIVox to new display position and materialise row by row
  for(let e=0;e<E;e++){
    const rowDelay=0.6+e*0.30;
    for(let a=0;a<A;a++){
      const {m}=RIVox[e*A+a];
      const tgt=pRI_EGD(e,a);
      m.position.set(tgt.x, tgt.y+1.5, tgt.z);
      m.scale.setScalar(0.01);
      // Restore amber colour
      m.material.color.set(m.userData.bc);
      m.material.emissive.set(m.userData.bc.clone().multiplyScalar(.22));
      const dl=rowDelay+a*0.06;
      gsap.to(m.material,{opacity:0.92,duration:.20,delay:dl});
      gPos(m,{x:tgt.x,y:tgt.y,z:tgt.z},{duration:.30,delay:dl,ease:'back.out(1.5)'});
      gScl(m,{x:1,y:1,z:1},{duration:.24,delay:dl,ease:'back.out(1.8)'});
    }
  }

  const showDone=0.6+E*0.30+A*0.06+0.50;
  setTimeout(()=>{
    gsap.to(RIEGDF_RI.material,{opacity:.52,duration:.5});
    ss('router_indices READY','[3, 9]  ·  reshape(−1,1) stacks to [27,1]');
    setBtn('RESHAPE  −1, 1','');
    saveSnap(18); updateBack();
  }, showDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 18→19: RESHAPE  router_indices [3,9] → [27,1]
//  RIVox cells collapse row-major into a single column.
//  E0 block stays in place, E1 and E2 stack below.
//  Column lands at CX_RI_EGD left edge (= leftmost future col of [27,10]).
// ═══════════════════════════════════════════════════
function doReshapeRI_EGD(){
  stage=19; disBtn();
  setDot(19,'onI'); ss('reshape(−1, 1)','[3,9] → [27,1]  ·  expert blocks stack row-major');

  const COL_X = CX_RI_EGD-(D-1)*GAP/2;   // leftmost col x = future d=0 column
  const RESHAPE_START=0.6;
  for(let e=0;e<E;e++){
    for(let a=0;a<A;a++){
      const {m}=RIVox[e*A+a];
      const i=e*A+a;
      const dl=RESHAPE_START+e*0.22+a*0.04;
      gPos(m,{x:COL_X, y:OY_GD+i*GAP, z:0},{duration:.38,delay:dl,ease:'power2.inOut'});
    }
  }

  const reshapeDone=RESHAPE_START+E*0.22+A*0.04+0.45;
  setTimeout(()=>{
    gsap.to(RIEGDF_RI.material,{opacity:0,duration:.3});
    ss('RESHAPE DONE','[27,1] column  ·  ready to broadcast across D');
    setBtn('EXPAND  −1, D','');
    saveSnap(19); updateBack();
  }, reshapeDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 19→20: EXPAND  [27,1] → [27,10]  in-place
//  RIExpVox fans rightward from the [27,1] column.
//  d=0 stays at COL_X; d=1..9 sweep right to CX_RI_EGD ± (D-1)*GAP/2.
//  RIVox [27,1] fades as RIExpVox takes over.
//  Final [27,10] centred at CX_RI_EGD = −7.3.
//  Same canonical gap (1.9) separating it from GDVox at x=0.
// ═══════════════════════════════════════════════════
function doExpandRI_EGD(){
  stage=20; disBtn();
  setDot(20,'onI'); ss('expand(−1, D)','[27,1] broadcasts rightward → router_indices_EG_D [27,10]');

  const COL_X = CX_RI_EGD-(D-1)*GAP/2;

  // Reset RIExpVox to starting column
  RIExpVox.forEach(({m,i,d})=>{
    m.position.set(COL_X, OY_GD+i*GAP, 0);
    m.scale.setScalar(0.01);
    m.material.opacity=0;
    m.material.color.set(m.userData.bc);
    m.material.emissive.set(m.userData.bc.clone().multiplyScalar(.25));
  });

  // Sweep columns left→right
  for(let d=0;d<D;d++){
    const colDelay=0.3+d*0.14;
    const tgtX=CX_RI_EGD-(D-1)*GAP/2+d*GAP;
    for(let i=0;i<E*A;i++){
      const rv=RIExpVox[i*D+d];
      const dl=colDelay+i*0.007;
      gsap.to(rv.m.material,{opacity:0.88,duration:.14,delay:dl});
      gPos(rv.m,{x:tgtX,y:OY_GD+i*GAP,z:0},{duration:.28,delay:dl,ease:'power2.out'});
      gScl(rv.m,{x:1,y:1,z:1},{duration:.18,delay:dl+.06,ease:'back.out(1.3)'});
    }
  }

  // Fade [27,1] RIVox source column once d=2 is underway
  setTimeout(()=>{
    RIVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.4}));
  },(0.3+2*0.14+0.2)*1000);

  const expandDone=0.3+D*0.14+E*A*0.007+0.5;
  setTimeout(()=>{
    gsap.to(RIEGDF.material,{opacity:.52,duration:.5});
    // Panel: show router_indices_EG_D label
    document.getElementById('pri').style.opacity='1';
    ss('router_indices_EG_D  DONE','[27,10]  ·  token index broadcast across all D columns');
    setBtn('SCATTER ADD  →  out_aD','em');
    saveSnap(20); updateBack();
  }, expandDone*1000);
}

// ═══════════════════════════════════════════════════
//  STAGE 20→21: SCATTER ADD
//  out_aD.scatter_add_(dim=0, index=router_indices_EG_D, src=routed_out_eg_D)
//
//  Three actors spread across screen:
//    RIExpVox [27,10] LEFT  (x=−7.3) — the address lookup
//    out_aD   [ 9,10] CENTRE (x= 0 ) — the accumulator (= x_aD re-materialised)
//    GDVox    [27,10] RIGHT (x=+7.3) — the source (routed_out_eg_D)
//
//  For each destination token a (0..8):
//    Active row i = WINNERS[a].e*A+a:
//      RIExpVox row i: flash amber-bright → "look up address a"
//      GDVox row i: cells arc rightward + fade → "add to out_aD[a]"
//      TVox row a: pulse bright → "accumulate"
//    Zero rows for token a: brief dim flash on RIExpVox only
//
//  Phase 3: GDVox + RIExpVox fade, FlatF wireframe pulses, DONE.
// ═══════════════════════════════════════════════════
function doScatterAdd(){
  stage=21; disBtn();
  document.getElementById('code7').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code8').style.opacity='1'; },500);
  setDot(21,'onG'); ss('scatter_add_','routing expert outputs back into out_aD [9,10]');

  // ── Phase 0: reposition all three actors ──────────────────────────────────
  const CX_RI_SA=-7.3, CX_GD_SA=7.3, CX_OUT_SA=0.0;
  const INTRO=0.65, EASE='power2.inOut';

  // RIExpVox slides left to CX_RI_SA
  RIExpVox.forEach(({m,i,d})=>{
    const newX=CX_RI_SA-(D-1)*GAP/2+d*GAP;
    gPos(m,{x:newX, y:m.position.y, z:0},{duration:INTRO,ease:EASE});
  });
  // Update RIEGDF wireframe
  (()=>{
    const x0=CX_RI_SA-(D-1)*GAP/2-CELL/2, x1=CX_RI_SA+(D-1)*GAP/2+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    RIEGDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    RIEGDF.geometry.attributes.position.needsUpdate=true;
  })();

  // GDVox slides right to CX_GD_SA
  GDVox.forEach(({m},idx)=>{
    const d=idx%D;
    const newX=CX_GD_SA-(D-1)*GAP/2+d*GAP;
    gPos(m,{x:newX, y:m.position.y, z:0},{duration:INTRO,ease:EASE});
  });
  // Update GDF wireframe
  (()=>{
    const x0=CX_GD_SA-(D-1)*GAP/2-CELL/2, x1=CX_GD_SA+(D-1)*GAP/2+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    GDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    GDF.geometry.attributes.position.needsUpdate=true;
  })();

  // TVox: slide to CX_OUT_SA, re-materialise as out_aD
  TVox.forEach(({m,b,s,d})=>{
    const a=b*S+s;
    const newX=CX_OUT_SA-(D-1)*GAP/2+d*GAP;
    gPos(m,{x:newX, y:OY+a*GAP, z:0},{duration:INTRO,ease:EASE});
    gsap.to(m.material,{opacity:0.72,duration:INTRO});
    gsap.to(m.material.color,{r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:INTRO*.7});
  });
  // Update FlatF wireframe to CX_OUT_SA=0
  (()=>{
    const x0=CX_OUT_SA-(D-1)*GAP/2-CELL/2, x1=CX_OUT_SA+(D-1)*GAP/2+CELL/2;
    const y0=OY-CELL/2, y1=OY+(A-1)*GAP+CELL/2;
    FlatF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    FlatF.geometry.attributes.position.needsUpdate=true;
  })();
  gsap.to(FlatF.material,{opacity:.45,duration:INTRO});

  // Camera widens to see all three
  gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:50,duration:1.2,ease:EASE,onUpdate:upCam});
  moveLX(0, 1.2);

  // ── Phase 1: scatter per destination token a ──────────────────────────────
  const SCATTER_START = INTRO + 0.55;

  for(let a=0;a<A;a++){
    const dstDelay = SCATTER_START + a*0.18;
    const wE = WINNERS[a].e;  // winning expert index for token a

    // Iterate over all E expert rows for this token column
    for(let e=0;e<E;e++){
      const i = e*A+a;   // row index into the 27-row matrices
      const isActive = (e === wE);
      const cellDelay = dstDelay + (isActive ? 0 : 0.04);

      if(isActive){
        // ── Active row: address flash, src arc, dest brighten ──────────────

        // 1. RIExpVox row i: amber flash
        for(let d=0;d<D;d++){
          const rv=RIExpVox[i*D+d];
          const dl=cellDelay+d*0.008;
          gScl(rv.m,{x:1.4,y:1.4,z:1.4},{duration:.10,delay:dl,
            onComplete(){ gScl(rv.m,{x:1,y:1,z:1},{duration:.16,ease:'elastic.out(1,.6)'}); }});
          gsap.to(rv.m.material,{opacity:1.0,duration:.10,delay:dl});
          // dim back after flash
          setTimeout(()=>{ gsap.to(rv.m.material,{opacity:0.5,duration:.3}); },(dl+0.28)*1000);
        }

        // 2. GDVox row i: scale-pop + arc toward out_aD + fade
        const destX = CX_OUT_SA-(D-1)*GAP/2;
        for(let d=0;d<D;d++){
          const gv=GDVox[i*D+d];
          const dl=cellDelay+0.12+d*0.010;
          const tgtX=CX_OUT_SA-(D-1)*GAP/2+d*GAP;
          const tgtY=OY+a*GAP;
          gScl(gv.m,{x:1.3,y:1.3,z:1.3},{duration:.08,delay:dl,
            onComplete(){
              gPos(gv.m,{x:tgtX,y:tgtY,z:0},{duration:.30,ease:'power2.in'});
              gScl(gv.m,{x:0.4,y:0.4,z:0.4},{duration:.28,ease:'power2.in'});
              gsap.to(gv.m.material,{opacity:0,duration:.25,delay:.05});
            }});
        }

        // 3. TVox row a: pulse bright then settle
        // TVox index: a = b*S+s, so b=floor(a/S), s=a%S, TVox[b*S*D+s*D+d]
        for(let d=0;d<D;d++){
          const b2=Math.floor(a/S), s2=a%S;
          const tv2=TVox[b2*S*D+s2*D+d];
          if(!tv2) continue;
          const dl=cellDelay+0.30+d*0.012;
          const brightC=new THREE.Color(0xffffff);
          const baseC=tv2.m.userData.bc.clone();
          const enhC=baseC.clone().lerp(new THREE.Color(0xffffff),.18);
          const enhE=baseC.clone().multiplyScalar(.55);
          setTimeout(()=>{
            gsap.to(tv2.m.material.color,{r:brightC.r,g:brightC.g,b:brightC.b,duration:.10});
            gsap.to(tv2.m.material,{opacity:1.0,duration:.10});
            gScl(tv2.m,{x:1.3,y:1.3,z:1.3},{duration:.10,
              onComplete(){
                gScl(tv2.m,{x:1,y:1,z:1},{duration:.22,ease:'elastic.out(1,.5)'});
                gsap.to(tv2.m.material.color,{r:enhC.r,g:enhC.g,b:enhC.b,duration:.35});
                gsap.to(tv2.m.material.emissive,{r:enhE.r,g:enhE.g,b:enhE.b,duration:.35});
                gsap.to(tv2.m.material,{opacity:.92,duration:.20});
              }});
          }, dl*1000);
        }

      } else {
        // ── Zero row: faint dim flash on RIExpVox only ─────────────────────
        for(let d=0;d<D;d++){
          const rv=RIExpVox[i*D+d];
          const dl=cellDelay+d*0.005;
          setTimeout(()=>{
            gsap.to(rv.m.material,{opacity:0.65,duration:.08});
            setTimeout(()=>{ gsap.to(rv.m.material,{opacity:0.3,duration:.25}); },120);
          }, dl*1000);
        }
      }
    }
  }

  // ── Phase 2: settle ────────────────────────────────────────────────────────
  const scatterDone = SCATTER_START + A*0.18 + 0.30+D*0.012 + 0.65;
  setTimeout(()=>{
    // Fade index and source matrices
    RIExpVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.5}));
    GDVox.forEach(({m})=>gsap.to(m.material,{opacity:0,duration:.5}));
    gsap.to(RIEGDF.material,{opacity:0,duration:.5});
    gsap.to(GDF.material,{opacity:0,duration:.5});
    // FlatF wireframe pulse
    gsap.to(FlatF.material,{opacity:.8,duration:.3,
      onComplete(){ gsap.to(FlatF.material,{opacity:.55,duration:.4}); }});
    // panels
    document.getElementById('pri').style.opacity='0';
    document.getElementById('pout').style.opacity='1';
    // Camera settles on out_aD
    gsap.to(sph,{t:Math.PI*.06,p:Math.PI*.36,r:32,duration:.8,ease:'power2.inOut',onUpdate:upCam});
    moveLX(0, .8);
    ss('SCATTER ADD COMPLETE','out_aD [9,10]  ·  expert outputs accumulated into token rows');
    setBtn('VIEW  −1, slen, D','');
    saveSnap(21); updateBack();
  }, scatterDone*1000);
}


// ═══════════════════════════════════════════════════
//  STAGE 21→22: VIEW  out_aD [9,10] → out_bsD [3,3,10]
//  Inverse of doFlatten.  The flat [9,10] grid folds back into
//  the compact 3D cube — NO slice gap — identical to the opening frame.
//
//  Phase 0 – batch flash: rows briefly pulse by batch colour so
//             the viewer sees the B×S grouping before it folds.
//  Phase 1 – fold: each cell moves in one tween directly to its
//             final pOri position (centred at x=0, z = oz3+b*GAP).
//             SliceF wires return to object-z=0 (geometry encodes the
//             per-slice z offset; no object displacement needed).
//             Camera swings back to the initial isometric view.
//  Phase 2 – settle: FlatF fades, panel flips to out_bsD. DONE ✓
// ═══════════════════════════════════════════════════
function doView(){
  stage=22; disBtn();
  document.getElementById('code8').style.opacity='0';
  setTimeout(()=>{ document.getElementById('code9').style.opacity='1'; },400);
  setDot(22,'onG'); ss('view(−1, slen, D)','folding out_aD [9,10] → out_bsD [3,3,10]');

  // cube centred at x=0 (TVox already here from doScatterAdd)
  const ox3v = -(D-1)*GAP/2;   // = -2.7

  // ── Phase 0: batch-group colour flash ─────────────────────────────────────
  const BATCH_COLS=[new THREE.Color(0x2244aa),new THREE.Color(0x992222),new THREE.Color(0x228844)];
  TVox.forEach(({m,b})=>{
    const bc=BATCH_COLS[b];
    gsap.to(m.material.color,{r:bc.r,g:bc.g,b:bc.b,duration:.18,delay:b*0.08});
    setTimeout(()=>{
      gsap.to(m.material.color,{r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:.30});
    },(b*0.08+0.24)*1000);
  });

  // Camera swings back to the original isometric view
  gsap.to(sph,{t:.55,p:.82,r:14,duration:1.4,ease:'power2.inOut',onUpdate:upCam});
  moveLX(0,1.4);

  // ── Phase 1: fold straight to final compact positions ──────────────────────
  const FOLD_START=0.40;
  TVox.forEach(({m,b,s,d})=>{
    const dl=FOLD_START + b*(S*0.08+0.18) + s*0.08 + d*0.006;
    gPos(m,{x:ox3v+d*GAP, y:oy3+s*GAP, z:oz3+b*GAP},{duration:.42,delay:dl,ease:'power3.inOut'});
    gsap.to(m.material.color,{
      r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:.35,delay:dl});
    gsap.to(m.material,{opacity:1,duration:.30,delay:dl});
  });

  // FlatF fades as cells leave the flat layout
  gsap.to(FlatF.material,{opacity:0,duration:.35,delay:FOLD_START});

  // SliceF wireframes slide back to object-position z=0 and reappear
  SliceF.forEach((f,b)=>{
    const dl=FOLD_START + b*(S*0.08+0.18) + 0.10;
    gPos(f,{z:0},{duration:.45,delay:dl,ease:'power2.inOut'});
    gsap.to(f.material,{opacity:.45,duration:.35,delay:dl+0.15});
  });

  // ── Phase 2: settle ────────────────────────────────────────────────────────
  const allDone=FOLD_START + B*(S*0.08+0.18) + D*0.006 + 0.55;
  setTimeout(()=>{
    document.getElementById('pout').style.opacity='0';
    document.getElementById('pout3d').style.opacity='1';
    ss('VIEW COMPLETE','out_bsD [3, 3, 10]  ·  MoE forward pass done');
    setBtn('DONE  ✓','');
    document.getElementById('btn').disabled=true;
    saveSnap(22); updateBack();
  }, allDone*1000);
}
// ═══════════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════════
function doReset(){
  gsap.globalTimeline.clear(); stage=0; autoRot=true; camLX=0;

  TVox.forEach(({m,b,s,d})=>{
    const p=pOri(b,s,d);
    gPos(m,{x:p.x,y:p.y,z:p.z},{duration:.6,ease:'power2.out'});
    gsap.to(m.material,{opacity:1,duration:.4});
    gsap.to(m.material.color,{r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:.5});
  });
  SVox.forEach(({m,a,e})=>{
    const p=pRS(e,a);
    gPos(m,{x:p.x,y:p.y+1.2,z:p.z},{duration:.4});
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
    // Reset isSig/isZero flags
    m.userData.isSig=false;
    m.userData.isZero=false;
  });
  SKSVox.forEach(({m})=>{
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
  });
  SKIVox.forEach(({m})=>{
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
  });
  RIVox.forEach(({m})=>{
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
  });
  SRSVox.forEach(({m},i)=>{
    const p=pSRS(i);
    gPos(m,{x:p.x,y:p.y,z:p.z},{duration:.4,ease:'power2.out'});
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
    gsap.to(m.material.color,{r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:.3});
  });
  RIExpVox.forEach(({m})=>{
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
    // reset colour to original amber
    gsap.to(m.material.color,{r:m.userData.bc.r,g:m.userData.bc.g,b:m.userData.bc.b,duration:.3});
    gsap.to(m.material.emissive,{r:m.userData.bc.r*.25,g:m.userData.bc.g*.25,b:m.userData.bc.b*.25,duration:.3});
  });
  GDVox.forEach(({m},idx)=>{
    const i=Math.floor(idx/D), d=idx%D;
    const p=pGD(i,d);
    gPos(m,{x:p.x,y:p.y,z:p.z},{duration:.4,ease:'power2.out'});
    gsap.to(m.material,{opacity:0,duration:.3}); gScl(m,{x:.01,y:.01,z:.01},{duration:.3});
  });
  SliceF.forEach((f,b)=>{
    gPos(f,{x:f.position.x,y:f.position.y,z:0},{duration:.5});
    gsap.to(f.material,{opacity:.45,duration:.4});
  });
  [FlatF,RSF,SKSF,SKIF,RIF,RIEF,SRSF,GDF,RIEGDF,RIEGDF_RI].forEach(f=>gsap.to(f.material,{opacity:0,duration:.3}));
  // Restore FlatF wireframe to CX_XAD=-6.0
  (()=>{
    const x0=CX_XAD-(D-1)*GAP/2-CELL/2, x1=CX_XAD+(D-1)*GAP/2+CELL/2;
    const y0=OY-CELL/2, y1=OY+(A-1)*GAP+CELL/2;
    FlatF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    FlatF.geometry.attributes.position.needsUpdate=true;
  })();
  // Restore RIEGDF wireframe to CX_RI_EGD=-3.65
  (()=>{
    const x0=CX_RI_EGD-(D-1)*GAP/2-CELL/2, x1=CX_RI_EGD+(D-1)*GAP/2+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    RIEGDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    RIEGDF.geometry.attributes.position.needsUpdate=true;
  })();
  gsap.to(RSF.material.color,{r:0.655,g:0.545,b:0.98,duration:.3}); // reset RSF color to purple
  // Restore GDF wireframe geometry to original CX_GD=14.7 position
  (()=>{
    const x0=CX_GD-(D-1)*GAP/2-CELL/2, x1=CX_GD+(D-1)*GAP/2+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    GDF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    GDF.geometry.attributes.position.needsUpdate=true;
  })();
  // Restore SRSF wireframe geometry to original CX_SRS=11.05 position
  (()=>{
    const x0=CX_SRS-CELL/2, x1=CX_SRS+CELL/2;
    const y0=OY_GD-CELL/2, y1=OY_GD+(E*A-1)*GAP+CELL/2;
    SRSF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    SRSF.geometry.attributes.position.needsUpdate=true;
  })();
  // Restore RSF wireframe geometry to original CX_RS=1.0 position
  (()=>{
    const x0=CX_RS-(A-1)*GAP/2-CELL/2, x1=CX_RS+(A-1)*GAP/2+CELL/2;
    const y0=OY_RS-CELL/2, y1=OY_RS+(E-1)*GAP+CELL/2;
    RSF.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x0,y0,0,x1,y0,0, x1,y0,0,x1,y1,0, x1,y1,0,x0,y1,0, x0,y1,0,x0,y0,0],3));
    RSF.geometry.attributes.position.needsUpdate=true;
  })();
  gsap.to(DivL.material,{opacity:0,duration:.3});
  gsap.to(sph,{t:.55,p:.82,r:14,duration:.8,ease:'power2.inOut',onUpdate:upCam});

  document.getElementById('vname-l').textContent='x_bsD';
  document.getElementById('pl').style.opacity='1';
  document.getElementById('pm').style.opacity='0';
  document.getElementById('pr').style.opacity='0';
  document.getElementById('code').style.opacity='0';
  document.getElementById('code2').style.opacity='0';
  document.getElementById('code3').style.opacity='0';
  document.getElementById('code4').style.opacity='0';
  document.getElementById('code5').style.opacity='0';
  document.getElementById('code6').style.opacity='0';
  document.getElementById('prf').style.opacity='0';
  document.getElementById('pri').style.opacity='0';
  document.getElementById('pws').style.opacity='0';
  document.getElementById('pgg').style.opacity='0';
  document.getElementById('pout').style.opacity='0';
  document.getElementById('code7').style.opacity='0';
  document.getElementById('code8').style.opacity='0';
  document.getElementById('code9').style.opacity='0';
  document.getElementById('pout3d').style.opacity='0';
  gsap.to('#sf',{opacity:1,duration:.4});
  gsap.to('#vl',{opacity:0,duration:.3});
  gsap.to('#st',{opacity:0,duration:.3});
  document.getElementById('sub-l').innerHTML=
    '<div><span class="b">B=3</span> · batch</div>'+
    '<div><span class="s">S=3</span> · sequence</div>'+
    '<div><span class="d">D=10</span> · features</div>';
  setDot(0); ss('ORIGIN','x_bsD · 3D tensor — batch × seq × features');
  setBtn('FLATTEN  B×S → A','');
  setTimeout(()=>{ saveSnap(0); updateBack(); }, 900);
}

// ═══════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════
function loop(){
  requestAnimationFrame(loop);
  if(autoRot&&stage===0){sph.t+=.0015;upCam();}
  doRay();
  renderer.render(scene,camera);
}
loop();
setTimeout(()=>{ saveSnap(0); },100);

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
