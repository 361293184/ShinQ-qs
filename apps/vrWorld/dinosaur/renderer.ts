import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeGardenScene } from './scene';
import { gardenResidents,assertGardenPose } from '../../../utils/vrWorld/dinosaurGarden';
import { DINO_GRID } from '../../../utils/vrWorld/dinosaurGrid';
import { defaultDinoPaint } from '../../../utils/vrWorld/dinosaurCatalog';
import { gardenSurfaceHeight } from '../../../utils/vrWorld/dinosaurTerrain';
import type { FishingMarketState } from '../../../utils/vrWorld/fishingMarket';
import type { DinoToy, DinoPaint, DinoPose } from '../../../utils/vrWorld/dinosaurTypes';
import { activeGardenMap } from '../../../utils/vrWorld/dinosaurTypes';
export type GardenView='garden'|'portrait';
type Hooks={select:(id:string)=>void;place:(pose:DinoPose)=>void;ready:()=>void;error:(message:string)=>void};
type Model={root:T.Group;species:string;paintKey:string;meshes:{mesh:T.Mesh;base:Float32Array}[]};
export function createGardenRenderer(host:HTMLElement,hooks:Hooks) {
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));renderer.setClearColor('#f2eee3');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','可以用手指旋转、缩放和摆放的橡皮泥恐龙箱庭');canvas.setAttribute('role','img');host.appendChild(canvas);
  const scene=new T.Scene();scene.background=new T.Color('#f2eee3');scene.add(new T.HemisphereLight('#fff4df','#a0af99',2.6));
  const sun=new T.DirectionalLight('#fff0d6',2.05);sun.position.set(-4,11,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:27});sun.shadow.normalBias=.03;scene.add(sun);
  const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.11,color:'#6d755f'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.57;floor.receiveShadow=true;scene.add(floor);
  const plinth=new T.Mesh(new T.CylinderGeometry(2.15,2.2,.12,48),new T.MeshStandardMaterial({color:'#d8dfc9',roughness:1}));plinth.position.y=-.06;plinth.receiveShadow=true;scene.add(plinth);
  const camera=new T.OrthographicCamera(-6,6,6,-6,.1,80);const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.enablePan=false;orbit.rotateSpeed=.6;orbit.minZoom=.8;orbit.maxZoom=2;orbit.minPolarAngle=.32;orbit.maxPolarAngle=1.3;orbit.touches.ONE=T.TOUCH.ROTATE;orbit.touches.TWO=T.TOUCH.DOLLY_ROTATE;
  const ring=new T.Mesh(new T.RingGeometry(.45,.49,40),new T.MeshBasicMaterial({color:'#51785b',transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  const ghost=new T.Mesh(new T.RingGeometry(.44,.49,32),new T.MeshBasicMaterial({color:'#b18370',transparent:true,opacity:.45,side:T.DoubleSide,depthWrite:false}));ghost.rotation.x=-Math.PI/2;ghost.visible=false;scene.add(ghost);
  const hints=new T.InstancedMesh(new T.CircleGeometry(.095,12),new T.MeshBasicMaterial({color:'#f8f1d4',depthTest:false}),DINO_GRID.length);hints.visible=false;hints.renderOrder=4;scene.add(hints);
  const loader=new GLTFLoader(),templates=new Map<string,Promise<T.Group>>(),models=new Map<string,Model>();let world:T.Group|null=null,worldKey='',data:FishingMarketState|null=null,selected='',view:GardenView='garden',preview:DinoPaint|undefined,placing=false,elapsed=0,greeting=-100,disposed=false,failed=false,visible=true,frame=0,last=0,loadGeneration=0;
  const surfaceHeight=(x:number,z:number)=>gardenSurfaceHeight(x,z,data?.dinosaurGarden?activeGardenMap(data.dinosaurGarden).theme:'grassland');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function release(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});}
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);const aspect=w/h,half=Math.max(view==='garden'?5.4:2.5,(view==='garden'?11.7:4.8)/(2*aspect));camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();};
  const reset=()=>{orbit.enableDamping=false;orbit.target.set(0,view==='garden'?.45:1.2,0);camera.position.copy(orbit.target).add(view==='garden'?new T.Vector3(7,15,19):new T.Vector3(4,3,9.5));camera.zoom=1;orbit.update();orbit.enableDamping=true;resize();};reset();
  const paint=(model:Model,toy:DinoToy,p:DinoPaint)=>{const key=JSON.stringify(p);if(model.paintKey===key)return;model.paintKey=key;const defaults=defaultDinoPaint(toy.speciesId),db=new T.Color(defaults.body),da=new T.Color(defaults.accent),b=new T.Color(p.body),a=new T.Color(p.accent);
    for(const {mesh,base} of model.meshes){const c=mesh.geometry.getAttribute('color'),uv=mesh.geometry.getAttribute('uv');for(let i=0;i<c.count;i++){const u=uv?.getX(i)||0,v=uv?.getY(i)||0;c.setXYZ(i,T.MathUtils.clamp(base[i*3]+(b.r-db.r)*u+(a.r-da.r)*v,0,1),T.MathUtils.clamp(base[i*3+1]+(b.g-db.g)*u+(a.g-da.g)*v,0,1),T.MathUtils.clamp(base[i*3+2]+(b.b-db.b)*u+(a.b-da.b)*v,0,1));}c.needsUpdate=true;}
  };
  const getTemplate=(species:string)=>{if(!templates.has(species))templates.set(species,loader.loadAsync(`/dino-models/${species}.glb`).then(g=>g.scene));return templates.get(species)!;};
  async function sync(next:FishingMarketState,id:string,nextView:GardenView,paintPreview?:DinoPaint){
    if(disposed)return;data=next;selected=id;preview=paintPreview;const changed=view!==nextView;view=nextView;if(changed){reset();ghost.visible=false;}const gen=++loadGeneration,g=next.dinosaurGarden!;
    DINO_GRID.forEach((c,i)=>{let free=true;try{assertGardenPose(next,{...c,slotId:c.id,rotation:0},id);}catch{free=false;}const matrix=new T.Matrix4().compose(new T.Vector3(c.x,surfaceHeight(c.x,c.z)+.06,c.z),new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,0)),new T.Vector3(free?1:0,free?1:0,1));hints.setMatrixAt(i,matrix);});hints.instanceMatrix.needsUpdate=true;
    const map=activeGardenMap(g),key=JSON.stringify(map);if(key!==worldKey){if(world){scene.remove(world);release(world);}world=makeGardenScene(map);scene.add(world);worldKey=key;renderer.shadowMap.needsUpdate=true;}
    const list=view==='garden'?gardenResidents(next):g.toys[id]?[g.toys[id]]:[];const wanted=new Set(list.map(t=>t.catchId));
    for(const [key,m] of models)if(!wanted.has(key)||!list.some(t=>t.catchId===key&&t.speciesId===m.species)){scene.remove(m.root);release(m.root);models.delete(key);}
    try{await Promise.all(list.map(async toy=>{
      if(models.has(toy.catchId))return;const template=await getTemplate(toy.speciesId);if(disposed||gen!==loadGeneration)return;
      const root=template.clone(true),meshes:Model['meshes']=[];root.userData.toyId=toy.catchId;
      root.traverse(o=>{if(o instanceof T.Mesh){o.geometry=o.geometry.clone();o.material=(o.material as T.Material).clone();o.castShadow=true;o.receiveShadow=true;meshes.push({mesh:o,base:new Float32Array(o.geometry.getAttribute('color').array)});}});
      models.set(toy.catchId,{root,meshes,species:toy.speciesId,paintKey:''});scene.add(root);
    }));if(disposed||gen!==loadGeneration)return;renderer.shadowMap.needsUpdate=true;draw(0);hooks.ready();}catch{if(!disposed)hooks.error('有一只模型没能加载，请重新打开箱庭。');}
  }
  function draw(dt:number){elapsed+=dt;if(!data)return;const g=data.dinosaurGarden!;
    hints.visible=placing&&view==='garden';
    for(const [id,m] of models){const toy=g.toys[id];if(!toy)continue;const portrait=view==='portrait',p=portrait?{x:0,z:0,rotation:-.22}:toy.pose;if(!p)continue;const s=portrait?1:.49,action=toy.stage.action;
      const hop=reduced.matches?0:Math.max(0,Math.sin((elapsed-greeting)*Math.PI*2))*Math.max(0,1-(elapsed-greeting)/1.2)*.14;
      const walk=!portrait&&!reduced.matches&&['散步','追逐','探险'].includes(action)?Math.sin(elapsed*1.8)*.075:0;
      m.root.position.set(p.x+Math.cos(p.rotation)*walk,portrait?.025:surfaceHeight(p.x,p.z)+.025,p.z-Math.sin(p.rotation)*walk);if(id===selected)m.root.position.y+=hop;
      const sleeping=action==='睡觉'&&!portrait;m.root.scale.set(s,s*(sleeping?.78:1),s);m.root.rotation.set(0,p.rotation,reduced.matches?0:sleeping?-.07:Math.sin(elapsed*(action==='吃饭'?2.4:1.1))*.013);
      paint(m,toy,id===selected&&preview?preview:toy.paint);
    }
    if(world)world.visible=view==='garden';plinth.visible=view==='portrait';const p=g.toys[selected]?.pose;ring.visible=view==='garden'&&!!p&&g.toys[selected]?.mapId===g.activeMapId;if(p)ring.position.set(p.x,surfaceHeight(p.x,p.z)+.035,p.z);(ring.material as T.MeshBasicMaterial).opacity=placing?.9:.4;orbit.update();renderer.render(scene,camera);
  }
  const loop=(now:number)=>{frame=0;if(disposed||failed||!visible||document.hidden)return;frame=requestAnimationFrame(loop);if(now-last<1000/30)return;const dt=Math.min((now-last)/1000,.06);last=now;draw(dt);};
  const resume=()=>{if(disposed||failed||document.hidden||!visible){cancelAnimationFrame(frame);frame=0;}else if(!frame){last=performance.now();frame=requestAnimationFrame(loop);}};
  const intersection=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true;resume();});intersection.observe(host);const observer=new ResizeObserver(resize);observer.observe(host);document.addEventListener('visibilitychange',resume);
  const raycaster=new T.Raycaster(),point=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),-.13);let press:{id:number;x:number;y:number;moved:boolean}|null=null;const touches=new Set<number>();
  const down=(e:PointerEvent)=>{touches.add(e.pointerId);if(touches.size>1){if(press)press.moved=true;}else press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};};
  const move=(e:PointerEvent)=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>6)press.moved=true;};
  const up=(e:PointerEvent)=>{touches.delete(e.pointerId);if(!press||press.id!==e.pointerId||press.moved){if(!touches.size)press=null;return;}press=null;const r=canvas.getBoundingClientRect();point.set((e.clientX-r.x)/r.width*2-1,-(e.clientY-r.y)/r.height*2+1);raycaster.setFromCamera(point,camera);
    if(placing&&view==='garden'){const p=raycaster.ray.intersectPlane(plane,new T.Vector3());if(p){for(let i=0;i<4;i++){plane.constant=-surfaceHeight(p.x,p.z);raycaster.ray.intersectPlane(plane,p);}plane.constant=-.13;hooks.place({x:p.x,z:p.z,rotation:data?.dinosaurGarden?.toys[selected]?.pose?.rotation||0});}return;}
    const hit=raycaster.intersectObjects([...models.values()].map(m=>m.root),true)[0];for(let o:T.Object3D|null=hit?.object||null;o;o=o.parent)if(o.userData.toyId){hooks.select(o.userData.toyId);break;}
  };
  const cancel=(e:PointerEvent)=>{touches.delete(e.pointerId);press=null;};const lost=(e:Event)=>{e.preventDefault();failed=true;resume();hooks.error('3D 画面已暂停，重新打开后会恢复。你的布置已经保存在本机。');};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('webglcontextlost',lost);resume();
  return {sync,reset,place(value:boolean){placing=value;},greet(){greeting=elapsed;},highlight(id:string,before?:DinoPose|null){selected=id;const p=data?.dinosaurGarden?.toys[id]?.pose;if(p){orbit.target.set(p.x,.55,p.z);camera.position.copy(orbit.target).add(new T.Vector3(7,15,19));camera.zoom=1.2;}ghost.visible=!!before;if(before)ghost.position.set(before.x,surfaceHeight(before.x,before.z)+.035,before.z);},
    metrics(){return {view,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,pixelRatio:renderer.getPixelRatio(),frameCap:30,zoom:camera.zoom,azimuth:orbit.getAzimuthalAngle(),loaded:[...models.keys()]};},
    project(p:{x:number;z:number}){const r=canvas.getBoundingClientRect(),v=new T.Vector3(p.x,surfaceHeight(p.x,p.z),p.z).project(camera);return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},
    advance(ms:number){cancelAnimationFrame(frame);frame=0;for(let i=0;i<Math.ceil(ms/33.333);i++)draw(Math.min(33.333,ms-i*33.333)/1000);last=performance.now();resume();},
    dispose(){disposed=true;++loadGeneration;cancelAnimationFrame(frame);intersection.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',resume);orbit.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('webglcontextlost',lost);release(scene);templates.forEach(p=>void p.then(release).catch(()=>{}));sun.shadow.dispose();renderer.dispose();canvas.remove();},
  };
}
