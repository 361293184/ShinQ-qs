import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GardenMap } from '../../../utils/vrWorld/dinosaurTypes';
import { makeLandscape } from './landscape';
import { gardenSurfaceHeight } from '../../../utils/vrWorld/dinosaurTerrain';

export function makeGardenScene(garden:GardenMap) {
  const root=new T.Group(), pieces:T.BufferGeometry[]=[];const coast=garden.theme==='coast';
  const add=(geo:T.BufferGeometry,color:string,p:number[],rotation=[0,0,0],scale=[1,1,1])=>{
    if(geo.index){const source=geo;geo=geo.toNonIndexed();source.dispose();}geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));
    const c=new T.Color(color),a=new Float32Array(geo.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}geo.setAttribute('color',new T.BufferAttribute(a,3));pieces.push(geo);
  };
  const box=(p:number[],s:number[],c:string,r=.04,ry=0)=>add(new RoundedBoxGeometry(s[0],s[1],s[2],1,Math.min(r,...s.map(v=>v/2))),c,p,[0,ry,0]);
  const ball=(p:number[],s:number[],c:string)=>add(new T.SphereGeometry(1,10,7),c,p,[0,0,0],s);
  const cylinder=(p:number[],r:number,h:number,c:string,rt=r)=>add(new T.CylinderGeometry(rt,r,h,12),c,p);
  box([0,-.29,0],[8.6,.58,9.65],'#b39977',.19);box([0,.015,0],[8.45,.12,9.5],coast?'#d6c097':garden.theme==='volcano'?'#a5a196':'#91a673',.18);
  box([0,-.50,0],[8.1,.10,9.2],'#826d55',.08);
  root.add(makeLandscape(garden.theme));
  for(const p of garden.props){const x=p.x,z=p.z;const before=pieces.length;
    if(p.kind==='tree'&&!coast){cylinder([x,.57,z],.13,1.0,'#9f805e',.105);ball([x,1.25,z],[.61,.49,.5],'#81a077');ball([x-.32,1.19,z+.03],[.35,.32,.31],'#a1b67c');ball([x+.24,1.52,z],[.40,.34,.32],'#93ad7b');}
    if(p.kind==='tree'&&coast){
      const curve=new T.CatmullRomCurve3([new T.Vector3(x,.1,z),new T.Vector3(x+.06,.8,z),new T.Vector3(x+.22,1.52,z)]);add(new T.TubeGeometry(curve,10,.085,7,false),'#b39870',[0,0,0]);
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7;add(new T.SphereGeometry(1,10,6),i%2?'#97b597':'#7da68d',[x+.22+Math.cos(a)*.38,1.52,z+Math.sin(a)*.38],[0,-a,.10],[.62,.09,.18]);}
      for(const dx of [-.08,.08])ball([x+.22+dx,1.4,z+.03],[.10,.12,.095],'#c5aa7c');
    }
    if(p.kind==='rock'){ball([x,.3,z],[.54,.27,.42],'#aeb5a2');ball([x+.24,.18,z+.27],[.23,.13,.20],'#c3c3ac');}
    if(p.kind==='stump'){cylinder([x,.32,z],.36,.44,'#a48663',.31);cylinder([x,.546,z],.28,.016,'#ddc49a');add(new T.TorusGeometry(.17,.012,4,16),'#b89870',[x,.56,z],[-Math.PI/2,0,0]);}
    if(p.kind==='tent'){add(new T.ConeGeometry(.93,1.03,4),'#d6b285',[x,.61,z],[0,Math.PI/4,0],[1,.95,.80]);add(new T.ConeGeometry(.33,.67,3),'#7d8879',[x,.43,z+.48],[0,Math.PI,0],[1,1,.05]);ball([x+.59,.12,z+.45],[.08,.05,.09],'#a6ad98');}
    if(p.kind==='volcano'){cylinder([x,.63,z],.72,1.06,'#a58c83',.27);cylinder([x,1.17,z],.24,.025,'#795f59');cylinder([x,1.18,z],.17,.018,'#dd9b78');ball([x+.02,1.26,z],[.11,.12,.1],'#dfb395');}
    if(p.kind==='volcano')add(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(x+.1,1.18,z+.17),new T.Vector3(x+.25,.66,z+.45),new T.Vector3(x+.45,.13,z+.70)]),12,.055,6,false),'#d49b76',[0,0,0]);
    if(p.kind==='sign'){box([x,.45,z],[.08,.73,.08],'#b29167');box([x,.80,z],[.70,.25,.09],'#e5d1a4',.045);box([x+.1,.80,z+.05],[.27,.026,.009],'#849a79',.006);}
    if(p.kind==='fence'){for(const a of [-.46,.46])box([x+a,.35,z],[.09,.56,.09],'#ddc6a0');for(const h of [.27,.49])box([x,h,z],[1,.075,.075],'#d6b78f');}
    if(p.kind==='house'){box([x,.41,z],[.83,.65,.74],coast?'#e7dfc5':'#e8d1aa',.04);add(new T.ConeGeometry(.77,.46,4),coast?'#9cbfb7':'#b48784',[x,.95,z],[0,Math.PI/4,0],[1,1,.9]);box([x,.28,z+.377],[.20,.37,.018],'#899e8b',.018);box([x-.24,.52,z+.379],[.12,.15,.018],'#b5cace',.01);}
    const matrix=new T.Matrix4().makeTranslation(x,gardenSurfaceHeight(x,z,garden.theme)-.1,z).multiply(new T.Matrix4().makeRotationY(p.rotation)).multiply(new T.Matrix4().makeTranslation(-x,0,-z));
    if(p.kind==='volcano')matrix.multiply(new T.Matrix4().makeTranslation(x,0,z)).multiply(new T.Matrix4().makeScale(1.25,1.45,1.25)).multiply(new T.Matrix4().makeTranslation(-x,0,-z));
    for(let i=before;i<pieces.length;i++)pieces[i].applyMatrix4(matrix);
  }
  const mesh=new T.Mesh(mergeGeometries(pieces),new T.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);pieces.forEach(g=>g.dispose());return root;
}
