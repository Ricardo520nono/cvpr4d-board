import * as THREE from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
import {GLTFLoader} from './GLTFLoader.js';

export async function startCamelWorld(root,c,media){const w=c.interactive_world;
const el=id=>root.querySelector('[data-camel="'+id+'"]'), state=window.viewerState={ready:false,qualityAccepted:false,browserVisuallyVerified:false,sourceFrames:90,sourceFps:24,displayTimeOffset:1/24,profile:'sealed textured GLB preview; known one-frame interface defect retained'};
const expected=w.glb_sha256;
const manifest=w.manifest_sha256;
async function hash(buf){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buf))].map(x=>x.toString(16).padStart(2,'0')).join('');}
try{
 async function getBytes(rel,h){const url=await media(rel),response=await fetch(url);if(!response.ok)throw Error('Asset HTTP');const buf=await response.arrayBuffer();if(await hash(buf)!==h)throw Error('Asset SHA mismatch');return buf;}
 const raw=await getBytes(w.glb,w.glb_sha256),cameraBytes=await getBytes(w.camera,w.camera_sha256),cam=JSON.parse(new TextDecoder().decode(cameraBytes));
 if(w.frame_count!==90||w.source_sha256!==c.evidence.source_sha256||w.source_clock.some((x,i)=>Math.abs(x[0]/x[1]-i/24)>1e-12)||w.display_time_offset_seconds!==1/24)throw Error('Source/candidate clock identity mismatch');
 state.glbSHA256=await hash(raw);if(state.glbSHA256!==expected)throw Error('GLB SHA mismatch');
 if(cam.frames.length!==90||cam.frames.some((f,i)=>f.source_frame!==i||Math.abs(f.time_seconds-i/24)>1e-8))throw Error('Camera/source clock mismatch');
 const gltf=await new GLTFLoader().parseAsync(raw,''); if(!root.isConnected)return;const world=gltf.scene;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xd8dce2);scene.add(world);
 const hemi=new THREE.HemisphereLight(0xffffff,0xaaa39b,2.2);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-4,8,6);scene.add(sun);
 const camera=new THREE.PerspectiveCamera(2*Math.atan(480/(2*cam.focal_px))*180/Math.PI,854/480,.01,200);camera.up.set(0,1,0);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;el('view').append(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.05;controls.maxDistance=100;
 const basis=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);
 const mixer=new THREE.AnimationMixer(world);if(gltf.animations.length!==1)throw Error('Unexpected animation count');const clip=gltf.animations[0];const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
 let meshes=0,materialSet=new Set(),textures=new Set(),morphMeshes=0;world.traverse(o=>{if(!o.isMesh)return;meshes++;if(o.morphTargetInfluences)morphMeshes++;for(const m of Array.isArray(o.material)?o.material:[o.material]){materialSet.add(m);for(const x of Object.values(m))if(x?.isTexture)textures.add(x)}});
 if([...textures].some(t=>!t.image||!(t.image.width>0)||!(t.image.height>0)))throw Error('Material texture not decoded');
 state.loaded={meshObjects:meshes,materials:materialSet.size,textures:textures.size,morphMeshes,clipName:clip.name,clipDuration:clip.duration,tracks:clip.tracks.length,extensionsUsed:gltf.parser.json.extensionsUsed};
 let frame=0,playing=false,start=0,startFrame=0,disposed=false,raf=0;
 function text(){el('frame').textContent=`第 ${frame+1}/90 帧 · source ${(frame/24).toFixed(6)}s · GLB ${((frame+1)/24).toFixed(6)}s`;root.dataset.frame=String(frame);state.frame=frame;state.sourceSeconds=frame/24;state.glbSeconds=(frame+1)/24;el('status').textContent=JSON.stringify({manifest,...state},null,2)}
 function setFrame(i){frame=Math.max(0,Math.min(89,i));action.paused=false;action.enabled=true;action.play();mixer.setTime((frame+1)/24);world.updateMatrixWorld(true);el('time').value=frame;text();}
 function reset(){const f=cam.frames[frame];const c=new THREE.Matrix4().set(...f.camera_to_world.flat());c.premultiply(basis);c.decompose(camera.position,camera.quaternion,camera.scale);controls.target.set(...f.target).applyMatrix4(basis);controls.update();camera.updateMatrixWorld(true);state.cameraResetFrame=frame;text()}
 function pause(){playing=false;state.playing=false;el('play').textContent='播放'}
 el('time').oninput=()=>{pause();setFrame(Number(el('time').value))};el('reset').onclick=reset;el('play').onclick=()=>{if(playing)pause();else{if(frame===89)setFrame(0);playing=true;state.playing=true;start=performance.now();startFrame=frame;el('play').textContent='暂停'}text()};
 const resize=()=>{const w=el('view').clientWidth;renderer.setSize(w,w*480/854,false)};const observer=new ResizeObserver(resize);observer.observe(el('view'));resize();setFrame(0);reset();
 state.ready=true;root.dataset.ready='true';['play','reset','time'].forEach(id=>el(id).disabled=false);text();
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();world.traverse(o=>{if(o.isMesh)o.geometry.dispose()});materialSet.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss()}window.__general07WorldDispose=dispose;
 function tick(now){if(disposed)return;if(!root.isConnected){dispose();return;}raf=requestAnimationFrame(tick);if(playing){const i=startFrame+Math.floor((now-start)*24/1000);setFrame(Math.min(89,i));if(i>=89){pause();text()}}renderer.render(scene,camera)}raf=requestAnimationFrame(tick);
}catch(err){state.error=String(err);root.dataset.error=String(err);el('status').textContent=JSON.stringify(state,null,2);el('frame').textContent='加载失败：'+err;console.error(err)}

}
