
import * as THREE from './three.module.js';
import {OrbitControls} from './OrbitControls.js';

// The viewer consumes a display export; it never changes the accepted world or evaluator.
export async function materialWorldViewer(host, urls) {
  const [info, zipped, texture] = await Promise.all([
    fetch(urls.json).then(r=>r.json()),
    fetch(urls.bin).then(r=>r.blob()),
    new THREE.TextureLoader().loadAsync(urls.texture)
  ]);
  if(info.schema!=='material-world-display.v1') throw new Error('Unsupported material world');
  const buffer=await new Response(zipped.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(buffer.byteLength!==info.position_bytes+info.index_bytes+info.uv_bytes) throw new Error('World buffer length mismatch');
  const packed=new Uint16Array(buffer,0,info.position_bytes/2);
  const indices=new Uint32Array(buffer,info.position_bytes,info.n_indices);
  const uv=new Float32Array(buffer,info.position_bytes+info.index_bytes,info.n_vertices*2);
  texture.flipY=false;
  host.innerHTML='<div class="mw-canvas" style="height:460px;min-height:300px"></div><div style="display:flex;align-items:center;gap:12px;margin:12px 0"><button class="mw-play" style="width:auto;margin:0;padding:8px 20px">播放</button><input class="mw-time" type="range" min="0" max="299" value="0" style="flex:1"><span class="mw-label">0 / 299</span></div><p class="note">拖动旋转，滚轮缩放；底色和网格只是检查参照。未知背面用固定显示先验。候选：'+info.candidate+'；完整视觉与物理未通过。</p>';
  const area=host.querySelector('.mw-canvas'),slider=host.querySelector('.mw-time'),label=host.querySelector('.mw-label'),button=host.querySelector('.mw-play');
  const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2));area.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f3f5f7');
  const bounds=new THREE.Vector3(...info.extent);const center=new THREE.Vector3(...info.low).addScaledVector(bounds,.5);const radius=Math.max(bounds.length(),1e-3);
  const camera=new THREE.PerspectiveCamera(42,1,radius*.005,radius*20);camera.position.copy(center).addScaledVector(new THREE.Vector3(...(info.source_view_direction||[.6,.4,1.2])).normalize(),radius*1.35);if(info.source_camera_up)camera.up.set(...info.source_camera_up);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enableDamping=true;controls.update();
  const geometry=new THREE.BufferGeometry();const pos=new Float32Array(info.n_vertices*3);geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{surface:{value:texture},gain:{value:new THREE.Vector3(...info.gain)},unknown:{value:new THREE.Vector3(...info.unknown_color)},frontSign:{value:info.frontsign}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D surface;uniform vec3 gain;uniform vec3 unknown;uniform float frontSign;varying vec2 vUv;void main(){bool known=(gl_FrontFacing==(frontSign>0.0));vec3 c=known?texture2D(surface,vUv).rgb:unknown;gl_FragColor=vec4(clamp(c*gain,0.0,1.0),1.0);}'});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  const floor=new THREE.GridHelper(radius*1.7,16,0xd2d7dc,0xe0e4e8);floor.position.copy(center);floor.position.y=info.low[1]-radius*.05;scene.add(floor);
  const low=info.low,scale=info.extent.map(x=>x/65535);
  function update(frame){const offset=frame*pos.length;for(let i=0;i<pos.length;i++)pos[i]=low[i%3]+packed[offset+i]*scale[i%3];geometry.attributes.position.needsUpdate=true;slider.value=frame;label.textContent=frame+' / 299 · '+(frame/30).toFixed(2)+'s';}
  let playing=false,epoch=0,initial=0;
  button.addEventListener('click',()=>{playing=!playing;initial=Number(slider.value);epoch=performance.now();button.textContent=playing?'暂停':'播放';});
  slider.addEventListener('input',()=>{playing=false;button.textContent='播放';update(Number(slider.value));});
  const resize=new ResizeObserver(()=>{const w=area.clientWidth,h=area.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(area);
  update(0);
  let disposed=false;
  function animate(now){if(!host.isConnected){disposed=true;resize.disconnect();controls.dispose();geometry.dispose();material.dispose();texture.dispose();renderer.dispose();return;}if(playing)update((initial+Math.floor((now-epoch)*.03))%info.n_frames);controls.update();renderer.render(scene,camera);requestAnimationFrame(animate);}
  requestAnimationFrame(animate);
  return {metadata:info,dispose:()=>{if(disposed)return;host.remove();}};
}
