"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DeviceOrientationControls } from "three/examples/jsm/controls/DeviceOrientationControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BRIGHT_STARS } from "@/lib/catalog";
import { bodySkyObject, moonObject, SkyObject, sunObject, PLANETS } from "@/lib/astronomy";
import type { ObserverLocation } from "@/lib/astronomy";
import { Observer, Horizon } from "astronomy-engine";

export type SkyCanvasProps = {
  location: ObserverLocation;
  liveOrientation: boolean;
  simulationDate: Date;
  showCamera: boolean;
  selectedId?: string | null;
  trackingId?: string | null;
  onSelect: (object: SkyObject) => void;
  onTrackingSeparation: (degrees: number, screenX: number, screenY: number) => void;
  onNearest: (object: SkyObject | null) => void;
};

type BodyNode = {
  object: SkyObject;
  mesh: THREE.Mesh;
};

function starColor(name: string) {
  const star = BRIGHT_STARS.find(s => s.name === name);
  return star?.color ?? "#ffffff";
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(.12, "rgba(220,235,255,.95)");
  g.addColorStop(.35, "rgba(130,180,255,.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(canvas);
}

function altAzToVector(altitude: number, azimuth: number, radius: number) {
  const a = THREE.MathUtils.degToRad(altitude);
  const z = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(
    Math.sin(z) * Math.cos(a) * radius,
    Math.sin(a) * radius,
    -Math.cos(z) * Math.cos(a) * radius
  );
}

function createStarField() {
  const positions: number[] = new Array(BRIGHT_STARS.length * 3).fill(0);
  const colors: number[] = [];
  const sizes: number[] = [];
  const meta: number[] = [];
  const color = new THREE.Color();
  for (const star of BRIGHT_STARS) {
    color.set(star.color ?? "#ffffff");
    colors.push(color.r,color.g,color.b);
    sizes.push(Math.max(2.2, 7.5 - star.magnitude * 2.0));
    meta.push(star.ra, star.dec, star.magnitude);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
  geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes,1));
  geo.setAttribute("meta", new THREE.Float32BufferAttribute(meta,3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `attribute float size; varying vec3 vColor; uniform float uPixelRatio; void main(){vColor=color; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uPixelRatio*(260.0/-mvPosition.z); gl_Position=projectionMatrix*mvPosition;}`,
    fragmentShader: `varying vec3 vColor; void main(){float d=length(gl_PointCoord-vec2(.5)); if(d>.5) discard; float a=smoothstep(.5,.05,d); gl_FragColor=vec4(vColor,a);}`
  });
  return new THREE.Points(geo,mat);
}

export default function SkyCanvas({
  location,
  liveOrientation,
  simulationDate,
  showCamera,
  selectedId,
  trackingId,
  onSelect,
  onTrackingSeparation,
  onNearest
}: SkyCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ date: simulationDate, selectedId, trackingId });
  stateRef.current.date = simulationDate;
  stateRef.current.selectedId = selectedId;
  stateRef.current.trackingId = trackingId;

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / mount.clientHeight, .01, 2000);
    camera.position.set(0,0,0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, .35);
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.7);
    scene.add(sunLight);

    const starField = createStarField();
    scene.add(starField);

    const glowTexture = createGlowTexture();
    const glows = new Map<string, THREE.Sprite>();
    const bodyNodes = new Map<string, BodyNode>();
    const planetConfigs = [
      ...PLANETS.map(p => ({...p})),
      { id:"sun", name:"Sun", body: ("Sun" as const), type:"Star · G-type main-sequence", color:"#ffd36d" },
      { id:"moon", name:"Moon", body: ("Moon" as const), type:"Natural satellite", color:"#e7e9ef" }
    ];

    for (const cfg of planetConfigs) {
      const geometry = new THREE.SphereGeometry(cfg.id === "sun" ? 2.1 : cfg.id === "moon" ? .7 : .58, 32, 20);
      const material = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: cfg.id === "sun" ? .2 : .8,
        metalness: .0,
        emissive: cfg.id === "sun" ? cfg.color : "#000000",
        emissiveIntensity: cfg.id === "sun" ? 1.4 : 0
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      bodyNodes.set(cfg.id, { object: sunObject(new Date(), location), mesh });
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, opacity: cfg.id === "sun" ? .8 : .26, depthWrite: false }));
      sprite.scale.setScalar(cfg.id === "sun" ? 11 : cfg.id === "moon" ? 5 : 3.6);
      sprite.visible = false;
      scene.add(sprite);
      glows.set(cfg.id, sprite);
    }

    const labels = new Map<string, HTMLDivElement>();
    const createLabel = (id: string, text: string) => {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.padding = "4px 7px";
      el.style.borderRadius = "999px";
      el.style.background = "rgba(5,8,14,.58)";
      el.style.border = "1px solid rgba(255,255,255,.14)";
      el.style.color = "#fff";
      el.style.font = "600 10px/1.1 Inter,system-ui,sans-serif";
      el.style.whiteSpace = "nowrap";
      el.style.backdropFilter = "blur(10px)";
      el.style.display = "none";
      mount.appendChild(el);
      labels.set(id, el);
      return el;
    };
    for (const s of BRIGHT_STARS.filter(s => s.magnitude <= 1.8)) createLabel(s.id, s.name.toUpperCase());
    for (const cfg of planetConfigs) createLabel(cfg.id, cfg.name.toUpperCase());

    let orientationControls: DeviceOrientationControls | null = null;
    let orbitControls: OrbitControls | null = null;
    if (liveOrientation) {
      orientationControls = new DeviceOrientationControls(camera);
      orientationControls.connect();
    } else {
      orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.enablePan = false;
      orbitControls.minDistance = .01;
      orbitControls.maxDistance = .01;
      orbitControls.rotateSpeed = -.25;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectBody = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = Array.from(bodyNodes.values()).map(n=>n.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return;
      const node = Array.from(bodyNodes.values()).find(n=>n.mesh === hits[0].object);
      if (node) onSelect(node.object);
    };
    renderer.domElement.addEventListener("pointerup", selectBody);

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    let raf = 0;
    let lastCalc = 0;
    let currentObjects: SkyObject[] = [];
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      if (orientationControls) orientationControls.update();
      if (orbitControls) orbitControls.update();

      if (now - lastCalc > 800) {
        lastCalc = now;
        const date = stateRef.current.date;
        const observer = new Observer(location.latitude, location.longitude, location.height ?? 0);
        const stars: SkyObject[] = BRIGHT_STARS.map((s) => {
          const hor = Horizon(date, observer, s.ra, s.dec, "normal");
          return {
            id: s.id,
            name: s.name,
            kind: "star" as const,
            type: `Star · ${s.constellation ?? ""}`.trim(),
            magnitude: s.magnitude,
            altitude: hor.altitude,
            azimuth: hor.azimuth,
            distanceKm: null,
            distanceAu: null,
            ra: s.ra,
            dec: s.dec,
            color: s.color
          };
        });
        const bodies = [sunObject(date, location), moonObject(date, location), ...PLANETS.map(p => bodySkyObject(p,date,location))];
        currentObjects = [...stars, ...bodies];
        const positionAttribute = starField.geometry.getAttribute("position") as THREE.BufferAttribute;
        BRIGHT_STARS.forEach((star, index) => {
          const object = stars[index];
          const p = altAzToVector(object.altitude, object.azimuth, 500);
          positionAttribute.setXYZ(index, p.x, p.y, p.z);
        });
        positionAttribute.needsUpdate = true;
        for (const object of bodies) {
          const node = bodyNodes.get(object.id)!;
          node.object = object;
          const visible = object.altitude > -2;
          node.mesh.visible = visible;
          const v = altAzToVector(object.altitude, object.azimuth, 110);
          node.mesh.position.copy(v);
          const glow = glows.get(object.id)!;
          glow.visible = visible && object.altitude > -8;
          glow.position.copy(v);
          if (object.id === "sun") {
            sunLight.position.set(v.x, v.y, v.z);
          }
        }

        // Search/identify is based on actual calculated angular distance, not camera pixels.
        const cameraDir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
        let nearest: {object: SkyObject; separation: number; point: THREE.Vector3} | null = null;
        for (const o of currentObjects) {
          if (o.altitude < -10) continue;
          const v = altAzToVector(o.altitude, o.azimuth, 1).normalize();
          const sep = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, v.dot(cameraDir)))));
          if (!nearest || sep < nearest.separation) nearest = { object:o, separation:sep, point:v };
        }
        onNearest(nearest?.object ?? null);

        if (stateRef.current.trackingId) {
          const target = currentObjects.find(o => o.id === stateRef.current.trackingId);
          if (target) {
            const targetWorld = altAzToVector(target.altitude, target.azimuth, 1).normalize();
            const sep = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, targetWorld.dot(cameraDir)))));
            const projected = targetWorld.clone().project(camera);
            onTrackingSeparation(sep, (projected.x*.5+.5)*mount.clientWidth, (-projected.y*.5+.5)*mount.clientHeight);
          }
        }
      }

      // Position labels by projecting object directions into screen space.
      for (const object of currentObjects) {
        const label = labels.get(object.id);
        if (!label) continue;
        if (object.altitude < -1) { label.style.display = "none"; continue; }
        const v = altAzToVector(object.altitude, object.azimuth, 120).project(camera);
        if (v.z > 1) { label.style.display = "none"; continue; }
        label.style.display = "block";
        label.style.left = `${(v.x*.5+.5)*mount.clientWidth}px`;
        label.style.top = `${(-v.y*.5+.5)*mount.clientHeight}px`;
        label.style.transform = "translate(10px,-50%)";
        label.style.opacity = object.id === stateRef.current.selectedId ? "1" : (object.magnitude <= 1.5 ? "0.92" : ".55");
      }

      renderer.render(scene, camera);
    };
    animate(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerup", selectBody);
      orientationControls?.disconnect();
      orbitControls?.dispose();
      for (const el of labels.values()) el.remove();
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [location.latitude, location.longitude, location.height, liveOrientation]);

  return <div ref={mountRef} className="sky-canvas" aria-label={showCamera ? "Live augmented sky" : "Interactive sky map"} />;
}
