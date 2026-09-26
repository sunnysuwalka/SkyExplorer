"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Body, GeoVector, HelioVector } from "astronomy-engine";

export type SolarScale = "real" | "explore" | "educational";

const PLANETS = [
  { id:"mercury", name:"Mercury", body:Body.Mercury, au:.387, radius:.383, color:"#a89d90" },
  { id:"venus", name:"Venus", body:Body.Venus, au:.723, radius:.949, color:"#d9b87e" },
  { id:"earth", name:"Earth", body:Body.Earth, au:1, radius:1, color:"#4f8ad1" },
  { id:"mars", name:"Mars", body:Body.Mars, au:1.524, radius:.532, color:"#d1634d" },
  { id:"jupiter", name:"Jupiter", body:Body.Jupiter, au:5.203, radius:11.21, color:"#d2a97f" },
  { id:"saturn", name:"Saturn", body:Body.Saturn, au:9.537, radius:9.45, color:"#d8c397" },
  { id:"uranus", name:"Uranus", body:Body.Uranus, au:19.19, radius:4.01, color:"#8bd1d7" },
  { id:"neptune", name:"Neptune", body:Body.Neptune, au:30.07, radius:3.88, color:"#557bdd" }
] as const;

function visualDistance(au:number, scale:SolarScale) {
  if (scale === "real") return au * 3;
  if (scale === "educational") return Math.sign(au-0.1) * Math.pow(au, .55) * 11;
  return Math.sign(au-0.1) * Math.pow(au, .72) * 8;
}

function visualRadius(r:number, scale:SolarScale) {
  if (scale === "real") return Math.max(.035, r * .018);
  if (scale === "educational") return Math.max(.06, Math.pow(r,.55) * .075);
  return Math.max(.06, Math.pow(r,.7) * .08);
}

export default function SolarSystemCanvas({ date, scale, selectedId, onSelect }:{date:Date;scale:SolarScale;selectedId?:string|null;onSelect:(id:string)=>void}) {
  const mountRef = useRef<HTMLDivElement|null>(null);
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02050c");
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth/mount.clientHeight, .001, 10000);
    camera.position.set(0,7,24);
    const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(mount.clientWidth,mount.clientHeight); renderer.outputColorSpace=THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping=true; controls.minDistance=2; controls.maxDistance=180; controls.target.set(0,0,0);
    scene.add(new THREE.AmbientLight(0xffffff,.24));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(visualRadius(109,scale),48,32),new THREE.MeshBasicMaterial({color:"#ffca64"}));
    scene.add(sun);
    const sunGlow = new THREE.PointLight(0xffd08a, 18, 0, 2); scene.add(sunGlow);
    const stars = new THREE.BufferGeometry();
    const pts:number[]=[];
    for(let i=0;i<1800;i++){
      const seed=(i*9301+49297)%233280; const theta=(seed/233280)*Math.PI*2; const phi=Math.acos(2*((i*0.6180339887)%1)-1); const r=900;
      pts.push(r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
    }
    stars.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
    scene.add(new THREE.Points(stars,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,color:"#cbd8ef",transparent:true,opacity:.6})));

    const meshes = new Map<string,THREE.Mesh>();
    const labels = new Map<string,HTMLDivElement>();
    for(const p of PLANETS){
      const geo = new THREE.SphereGeometry(visualRadius(p.radius,scale),32,20);
      const mat = new THREE.MeshStandardMaterial({color:p.color,roughness:.76});
      const mesh = new THREE.Mesh(geo,mat);
      scene.add(mesh); meshes.set(p.id,mesh);
      const el=document.createElement("div"); el.textContent=p.name.toUpperCase(); el.style.position="absolute"; el.style.pointerEvents="none"; el.style.transform="translate(8px,-50%)"; el.style.padding="3px 6px"; el.style.borderRadius="999px"; el.style.background="rgba(5,8,14,.62)"; el.style.border="1px solid rgba(255,255,255,.13)"; el.style.font="600 9px Inter,system-ui"; el.style.display="none"; mount.appendChild(el); labels.set(p.id,el);
      if(p.id==="saturn"){
        const ring=new THREE.Mesh(new THREE.RingGeometry(visualRadius(12,scale)*1.35,visualRadius(12,scale)*2.0,64),new THREE.MeshBasicMaterial({color:"#c8b58d",transparent:true,opacity:.65,side:THREE.DoubleSide}));
        ring.rotation.x=Math.PI*.38; mesh.add(ring);
      }
    }
    const orbitLines:THREE.LineLoop[]=[];
    for(const p of PLANETS){ if(p.id==="earth") continue; const points:THREE.Vector3[]=[]; const r=visualDistance(p.au,scale); for(let i=0;i<128;i++){const a=i/128*Math.PI*2; points.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));} const geo=new THREE.BufferGeometry().setFromPoints(points); const line=new THREE.LineLoop(geo,new THREE.LineBasicMaterial({color:"#34445d",transparent:true,opacity:.65})); scene.add(line); orbitLines.push(line); }
    const ray=new THREE.Raycaster(), pointer=new THREE.Vector2();
    const click=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects([...meshes.values()],false)[0];if(!hit)return;const found=[...meshes.entries()].find(([,m])=>m===hit.object);if(found)onSelect(found[0]);};
    renderer.domElement.addEventListener("pointerup",click);
    const resize=()=>{camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();renderer.setSize(mount.clientWidth,mount.clientHeight)};
    window.addEventListener("resize",resize);
    let raf=0;
    const animate=()=>{raf=requestAnimationFrame(animate);controls.update();for(const p of PLANETS){const mesh=meshes.get(p.id)!;const vec=p.id==="earth"?HelioVector(Body.Earth,date):HelioVector(p.body,date);const pos=new THREE.Vector3(vec.x,vec.z,vec.y).normalize().multiplyScalar(visualDistance(Math.sqrt(vec.x*vec.x+vec.y*vec.y+vec.z*vec.z),scale));mesh.position.copy(pos);mesh.rotation.y+=.002;const el=labels.get(p.id)!;const proj=mesh.position.clone().project(camera);if(proj.z<-1||proj.z>1){el.style.display="none"}else{el.style.display="block";el.style.left=`${(proj.x*.5+.5)*mount.clientWidth}px`;el.style.top=`${(-proj.y*.5+.5)*mount.clientHeight}px`;el.style.opacity=p.id===selectedId?"1":".62"}};renderer.render(scene,camera)};animate();
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);renderer.domElement.removeEventListener("pointerup",click);controls.dispose();renderer.dispose();for(const el of labels.values())el.remove();mount.innerHTML=""};
  }, [date.getTime(),scale]);
  return <div ref={mountRef} className="sky-canvas" aria-label="Interactive 3D Solar System" />;
}
