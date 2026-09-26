"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BRIGHT_STARS } from "@/lib/catalog";
import {
  bodySkyObject,
  moonObject,
  SkyObject,
  sunObject,
  PLANETS,
} from "@/lib/astronomy";
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
  onTrackingSeparation: (
    degrees: number,
    screenX: number,
    screenY: number
  ) => void;
  onNearest: (object: SkyObject | null) => void;
};

type BodyNode = {
  object: SkyObject;
  mesh: THREE.Mesh;
};

type DeviceOrientationWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type DeviceOrientationEventConstructorWithPermission =
  typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<
      "granted" | "denied" | "default"
    >;
  };

/**
 * Converts altitude/azimuth coordinates into a Three.js world-space vector.
 *
 * Coordinate system:
 * +Y = up
 * +X = east
 * -Z = north
 *
 * This matches the camera looking down -Z when the device is aligned.
 */
function altAzToVector(
  altitude: number,
  azimuth: number,
  radius: number
) {
  const a = THREE.MathUtils.degToRad(altitude);
  const z = THREE.MathUtils.degToRad(azimuth);

  return new THREE.Vector3(
    Math.sin(z) * Math.cos(a) * radius,
    Math.sin(a) * radius,
    -Math.cos(z) * Math.cos(a) * radius
  );
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");

  canvas.width = canvas.height = 128;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create 2D canvas context");
  }

  const g = ctx.createRadialGradient(
    64,
    64,
    0,
    64,
    64,
    64
  );

  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(220,235,255,.95)");
  g.addColorStop(0.35, "rgba(130,180,255,.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function createStarField() {
  const positions: number[] = new Array(
    BRIGHT_STARS.length * 3
  ).fill(0);

  const colors: number[] = [];
  const sizes: number[] = [];
  const meta: number[] = [];

  const color = new THREE.Color();

  for (const star of BRIGHT_STARS) {
    color.set(star.color ?? "#ffffff");

    colors.push(color.r, color.g, color.b);

    sizes.push(
      Math.max(2.2, 7.5 - star.magnitude * 2.0)
    );

    meta.push(star.ra, star.dec, star.magnitude);
  }

  const geo = new THREE.BufferGeometry();

  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  geo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );

  geo.setAttribute(
    "size",
    new THREE.Float32BufferAttribute(sizes, 1)
  );

  geo.setAttribute(
    "meta",
    new THREE.Float32BufferAttribute(meta, 3)
  );

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: {
      uPixelRatio: {
        value: Math.min(window.devicePixelRatio, 2),
      },
    },

    vertexShader: `
      attribute float size;

      varying vec3 vColor;

      uniform float uPixelRatio;

      void main() {
        vColor = color;

        vec4 mvPosition =
          modelViewMatrix * vec4(position, 1.0);

        gl_PointSize =
          size *
          uPixelRatio *
          (260.0 / -mvPosition.z);

        gl_Position =
          projectionMatrix *
          mvPosition;
      }
    `,

    fragmentShader: `
      varying vec3 vColor;

      void main() {
        float d =
          length(gl_PointCoord - vec2(0.5));

        if (d > 0.5) discard;

        float a =
          smoothstep(0.5, 0.05, d);

        gl_FragColor =
          vec4(vColor, a);
      }
    `,
  });

  return new THREE.Points(geo, mat);
}

/**
 * Converts phone orientation readings into a camera quaternion.
 *
 * This is based on the same coordinate conversion historically used
 * by Three.js's DeviceOrientationControls, which was removed from
 * Three.js in r134.
 *
 * Z-X'-Y'' device Euler angles
 * -> Three.js camera quaternion
 */
function applyDeviceOrientation(
  camera: THREE.Camera,
  event: DeviceOrientationWithCompass,
  screenAngle: number
) {
  const alphaDegrees =
    typeof event.webkitCompassHeading === "number"
      ? event.webkitCompassHeading
      : event.alpha ?? 0;

  const betaDegrees = event.beta ?? 0;
  const gammaDegrees = event.gamma ?? 0;

  const alpha = THREE.MathUtils.degToRad(alphaDegrees);
  const beta = THREE.MathUtils.degToRad(betaDegrees);
  const gamma = THREE.MathUtils.degToRad(gammaDegrees);
  const orient = THREE.MathUtils.degToRad(screenAngle);

  const euler = new THREE.Euler(
    beta,
    alpha,
    -gamma,
    "YXZ"
  );

  const quaternion = new THREE.Quaternion()
    .setFromEuler(euler);

  // Rotate from the device's coordinate frame to the
  // Three.js camera coordinate frame.
  const deviceToCamera = new THREE.Quaternion(
    -Math.sqrt(0.5),
    0,
    0,
    Math.sqrt(0.5)
  );

  const screenRotation = new THREE.Quaternion()
    .setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      -orient
    );

  quaternion
    .multiply(deviceToCamera)
    .multiply(screenRotation);

  camera.quaternion.copy(quaternion);
}

/**
 * Requests sensor permission where browsers require it.
 *
 * iOS Safari requires requestPermission() to happen from
 * a user interaction such as a tap.
 */
async function requestDeviceOrientationPermission() {
  if (typeof window === "undefined") {
    return;
  }

  const DeviceOrientation =
    window.DeviceOrientationEvent as
      | DeviceOrientationEventConstructorWithPermission
      | undefined;

  if (
    DeviceOrientation &&
    typeof DeviceOrientation.requestPermission === "function"
  ) {
    try {
      await DeviceOrientation.requestPermission();
    } catch {
      // Permission may have been denied.
      // The app continues operating in normal sky-map mode.
    }
  }
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
  onNearest,
}: SkyCanvasProps) {
  const mountRef =
    useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    date: simulationDate,
    selectedId,
    trackingId,
  });

  stateRef.current.date = simulationDate;
  stateRef.current.selectedId = selectedId;
  stateRef.current.trackingId = trackingId;

  /**
   * Keep callbacks current without forcing the whole
   * Three.js scene to be recreated whenever React creates
   * a new callback function.
   */
  const callbacksRef = useRef({
    onSelect,
    onTrackingSeparation,
    onNearest,
  });

  callbacksRef.current = {
    onSelect,
    onTrackingSeparation,
    onNearest,
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    const scene = new THREE.Scene();

    const camera =
      new THREE.PerspectiveCamera(
        68,
        mount.clientWidth / mount.clientHeight,
        0.01,
        2000
      );

    camera.position.set(0, 0, 0);

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
      mount.clientWidth,
      mount.clientHeight
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    mount.appendChild(renderer.domElement);

    const ambient =
      new THREE.AmbientLight(
        0xffffff,
        0.35
      );

    scene.add(ambient);

    const sunLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.7
      );

    scene.add(sunLight);

    const starField = createStarField();

    scene.add(starField);

    const glowTexture =
      createGlowTexture();

    const glows =
      new Map<string, THREE.Sprite>();

    const bodyNodes =
      new Map<string, BodyNode>();

    const planetConfigs = [
      ...PLANETS.map((p) => ({ ...p })),

      {
        id: "sun",
        name: "Sun",
        body: "Sun" as const,
        type: "Star · G-type main-sequence",
        color: "#ffd36d",
      },

      {
        id: "moon",
        name: "Moon",
        body: "Moon" as const,
        type: "Natural satellite",
        color: "#e7e9ef",
      },
    ];

    /**
     * Create planet/sun/moon meshes.
     */
    for (const cfg of planetConfigs) {
      const geometry =
        new THREE.SphereGeometry(
          cfg.id === "sun"
            ? 2.1
            : cfg.id === "moon"
              ? 0.7
              : 0.58,
          32,
          20
        );

      const material =
        new THREE.MeshStandardMaterial({
          color: cfg.color,
          roughness:
            cfg.id === "sun"
              ? 0.2
              : 0.8,
          metalness: 0,

          emissive:
            cfg.id === "sun"
              ? cfg.color
              : "#000000",

          emissiveIntensity:
            cfg.id === "sun"
              ? 1.4
              : 0,
        });

      const mesh =
        new THREE.Mesh(
          geometry,
          material
        );

      mesh.visible = false;

      scene.add(mesh);

      /**
       * These values are replaced immediately during
       * the astronomy calculation pass.
       */
      const initialObject =
        cfg.id === "sun"
          ? sunObject(new Date(), location)
          : cfg.id === "moon"
            ? moonObject(new Date(), location)
            : bodySkyObject(
                cfg as any,
                new Date(),
                location
              );

      bodyNodes.set(
        cfg.id,
        {
          object: initialObject,
          mesh,
        }
      );

      const sprite =
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,

            opacity:
              cfg.id === "sun"
                ? 0.8
                : 0.26,

            depthWrite: false,
          })
        );

      sprite.scale.setScalar(
        cfg.id === "sun"
          ? 11
          : cfg.id === "moon"
            ? 5
            : 3.6
      );

      sprite.visible = false;

      scene.add(sprite);

      glows.set(
        cfg.id,
        sprite
      );
    }

    /**
     * HTML labels live on top of the canvas.
     */
    const labels =
      new Map<string, HTMLDivElement>();

    const createLabel = (
      id: string,
      text: string
    ) => {
      const el =
        document.createElement("div");

      el.textContent = text;

      el.style.position =
        "absolute";

      el.style.pointerEvents =
        "none";

      el.style.padding =
        "4px 7px";

      el.style.borderRadius =
        "999px";

      el.style.background =
        "rgba(5,8,14,.58)";

      el.style.border =
        "1px solid rgba(255,255,255,.14)";

      el.style.color =
        "#fff";

      el.style.font =
        "600 10px/1.1 Inter,system-ui,sans-serif";

      el.style.whiteSpace =
        "nowrap";

      el.style.backdropFilter =
        "blur(10px)";

      el.style.display =
        "none";

      mount.appendChild(el);

      labels.set(id, el);

      return el;
    };

    for (
      const s of BRIGHT_STARS.filter(
        (s) => s.magnitude <= 1.8
      )
    ) {
      createLabel(
        s.id,
        s.name.toUpperCase()
      );
    }

    for (const cfg of planetConfigs) {
      createLabel(
        cfg.id,
        cfg.name.toUpperCase()
      );
    }

    /**
     * ---------------------------------------------------------
     * DEVICE ORIENTATION
     * ---------------------------------------------------------
     */

    let orientationEnabled =
      false;

    let screenAngle =
      0;

    const getScreenAngle = () => {
      if (
        typeof screen !== "undefined" &&
        screen.orientation &&
        typeof screen.orientation.angle ===
          "number"
      ) {
        return screen.orientation.angle;
      }

      const legacyOrientation =
        (
          window as Window & {
            orientation?: number;
          }
        ).orientation;

      return typeof legacyOrientation ===
        "number"
        ? legacyOrientation
        : 0;
    };

    screenAngle =
      getScreenAngle();

    const handleScreenOrientation = () => {
      screenAngle =
        getScreenAngle();
    };

    const handleDeviceOrientation = (
      event: DeviceOrientationEvent
    ) => {
      if (!orientationEnabled) {
        return;
      }

      const orientationEvent =
        event as DeviceOrientationWithCompass;

      /**
       * Do not accept completely empty sensor events.
       */
      if (
        orientationEvent.alpha == null &&
        orientationEvent.beta == null &&
        orientationEvent.gamma == null
      ) {
        return;
      }

      applyDeviceOrientation(
        camera,
        orientationEvent,
        screenAngle
      );
    };

    const enableDeviceOrientation = () => {
      if (!liveOrientation) {
        return;
      }

      orientationEnabled = true;

      window.addEventListener(
        "deviceorientation",
        handleDeviceOrientation,
        true
      );

      window.addEventListener(
        "orientationchange",
        handleScreenOrientation
      );

      if (
        screen.orientation
      ) {
        screen.orientation.addEventListener(
          "change",
          handleScreenOrientation
        );
      }
    };

    /**
     * iOS requires permission from an actual user gesture.
     *
     * We request it on the first pointer interaction with
     * the canvas, then activate the sensor listener.
     */
    let orientationPermissionStarted =
      false;

    const prepareOrientation = () => {
      if (
        !liveOrientation ||
        orientationPermissionStarted
      ) {
        return;
      }

      orientationPermissionStarted = true;

      requestDeviceOrientationPermission()
        .finally(() => {
          enableDeviceOrientation();
        });
    };

    /**
     * Start immediately on browsers that don't require
     * explicit permission.
     */
    const DeviceOrientation =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as
            | DeviceOrientationEventConstructorWithPermission
            | undefined)
        : undefined;

    const requiresPermission =
      !!DeviceOrientation &&
      typeof DeviceOrientation.requestPermission ===
        "function";

    if (!requiresPermission && liveOrientation) {
      orientationPermissionStarted = true;
      enableDeviceOrientation();
    }

    /**
     * ---------------------------------------------------------
     * FALLBACK ORBIT CONTROLS
     * ---------------------------------------------------------
     */

    let orbitControls:
      | OrbitControls
      | null = null;

    if (!liveOrientation) {
      orbitControls =
        new OrbitControls(
          camera,
          renderer.domElement
        );

      orbitControls.enableDamping =
        true;

      orbitControls.enablePan =
        false;

      orbitControls.minDistance =
        0.01;

      orbitControls.maxDistance =
        0.01;

      orbitControls.rotateSpeed =
        -0.25;
    }

    /**
     * ---------------------------------------------------------
     * OBJECT SELECTION
     * ---------------------------------------------------------
     */

    const raycaster =
      new THREE.Raycaster();

    const pointer =
      new THREE.Vector2();

    const selectBody = (
      event: PointerEvent
    ) => {
      /**
       * Important:
       * request sensor permission only from the user gesture.
       */
      prepareOrientation();

      const rect =
        renderer.domElement.getBoundingClientRect();

      pointer.x =
        ((event.clientX - rect.left) /
          rect.width) *
          2 -
        1;

      pointer.y =
        -(
          ((event.clientY - rect.top) /
            rect.height) *
            2 -
          1
        );

      raycaster.setFromCamera(
        pointer,
        camera
      );

      const meshes =
        Array.from(
          bodyNodes.values()
        ).map(
          (n) => n.mesh
        );

      const hits =
        raycaster.intersectObjects(
          meshes,
          false
        );

      if (!hits.length) {
        return;
      }

      const node =
        Array.from(
          bodyNodes.values()
        ).find(
          (n) =>
            n.mesh === hits[0].object
        );

      if (node) {
        callbacksRef.current.onSelect(
          node.object
        );
      }
    };

    renderer.domElement.addEventListener(
      "pointerup",
      selectBody
    );

    /**
     * ---------------------------------------------------------
     * RESIZE
     * ---------------------------------------------------------
     */

    const resize = () => {
      if (
        !mount.clientWidth ||
        !mount.clientHeight
      ) {
        return;
      }

      camera.aspect =
        mount.clientWidth /
        mount.clientHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        mount.clientWidth,
        mount.clientHeight
      );
    };

    window.addEventListener(
      "resize",
      resize
    );

    /**
     * ---------------------------------------------------------
     * ANIMATION / ASTRONOMY CALCULATIONS
     * ---------------------------------------------------------
     */

    let raf = 0;
    let lastCalc = 0;

    let currentObjects:
      SkyObject[] = [];

    const animate = (
      now: number
    ) => {
      raf =
        requestAnimationFrame(
          animate
        );

      if (orbitControls) {
        orbitControls.update();
      }

      if (
        now - lastCalc >
        800
      ) {
        lastCalc = now;

        const date =
          stateRef.current.date;

        const observer =
          new Observer(
            location.latitude,
            location.longitude,
            location.height ?? 0
          );

        /**
         * Calculate stars.
         */
        const stars: SkyObject[] =
          BRIGHT_STARS.map(
            (s) => {
              const hor =
                Horizon(
                  date,
                  observer,
                  s.ra,
                  s.dec,
                  "normal"
                );

              return {
                id: s.id,
                name: s.name,
                kind: "star" as const,
                type:
                  `Star · ${
                    s.constellation ?? ""
                  }`.trim(),
                magnitude:
                  s.magnitude,
                altitude:
                  hor.altitude,
                azimuth:
                  hor.azimuth,
                distanceKm: null,
                distanceAu: null,
                ra: s.ra,
                dec: s.dec,
                color: s.color,
              };
            }
          );

        /**
         * Calculate Sun, Moon and planets.
         */
        const bodies = [
          sunObject(
            date,
            location
          ),

          moonObject(
            date,
            location
          ),

          ...PLANETS.map(
            (p) =>
              bodySkyObject(
                p,
                date,
                location
              )
          ),
        ];

        currentObjects =
          [
            ...stars,
            ...bodies,
          ];

        /**
         * Update star positions.
         */
        const positionAttribute =
          starField.geometry.getAttribute(
            "position"
          ) as THREE.BufferAttribute;

        BRIGHT_STARS.forEach(
          (star, index) => {
            const object =
              stars[index];

            const p =
              altAzToVector(
                object.altitude,
                object.azimuth,
                500
              );

            positionAttribute.setXYZ(
              index,
              p.x,
              p.y,
              p.z
            );
          }
        );

        positionAttribute.needsUpdate =
          true;

        /**
         * Update planets / Sun / Moon.
         */
        for (const object of bodies) {
          const node =
            bodyNodes.get(
              object.id
            );

          const glow =
            glows.get(
              object.id
            );

          if (!node || !glow) {
            continue;
          }

          node.object = object;

          const visible =
            object.altitude > -2;

          node.mesh.visible =
            visible;

          const v =
            altAzToVector(
              object.altitude,
              object.azimuth,
              110
            );

          node.mesh.position.copy(
            v
          );

          glow.visible =
            visible &&
            object.altitude > -8;

          glow.position.copy(
            v
          );

          if (
            object.id === "sun"
          ) {
            sunLight.position.set(
              v.x,
              v.y,
              v.z
            );
          }
        }

        /**
         * Determine what object the phone is pointing at.
         *
         * Camera looks down -Z.
         */
        const cameraDir =
          new THREE.Vector3(
            0,
            0,
            -1
          )
            .applyQuaternion(
              camera.quaternion
            )
            .normalize();

        let nearest:
          | {
              object: SkyObject;
              separation: number;
              point: THREE.Vector3;
            }
          | null = null;

        for (
          const object of currentObjects
        ) {
          if (
            object.altitude <
            -10
          ) {
            continue;
          }

          const v =
            altAzToVector(
              object.altitude,
              object.azimuth,
              1
            ).normalize();

          const dot =
            THREE.MathUtils.clamp(
              v.dot(cameraDir),
              -1,
              1
            );

          const separation =
            THREE.MathUtils.radToDeg(
              Math.acos(dot)
            );

          if (
            !nearest ||
            separation <
              nearest.separation
          ) {
            nearest = {
              object,
              separation,
              point: v,
            };
          }
        }

        callbacksRef.current.onNearest(
          nearest?.object ?? null
        );

        /**
         * Tracking.
         */
        if (
          stateRef.current
            .trackingId
        ) {
          const target =
            currentObjects.find(
              (o) =>
                o.id ===
                stateRef.current
                  .trackingId
            );

          if (target) {
            const targetWorld =
              altAzToVector(
                target.altitude,
                target.azimuth,
                1
              ).normalize();

            const separation =
              THREE.MathUtils.radToDeg(
                Math.acos(
                  THREE.MathUtils.clamp(
                    targetWorld.dot(
                      cameraDir
                    ),
                    -1,
                    1
                  )
                )
              );

            const projected =
              targetWorld
                .clone()
                .project(
                  camera
                );

            callbacksRef.current.onTrackingSeparation(
              separation,
              (projected.x * 0.5 +
                0.5) *
                mount.clientWidth,
              (-projected.y *
                0.5 +
                0.5) *
                mount.clientHeight
            );
          }
        }
      }

      /**
       * Position labels.
       */
      for (
        const object of currentObjects
      ) {
        const label =
          labels.get(
            object.id
          );

        if (!label) {
          continue;
        }

        if (
          object.altitude <
          -1
        ) {
          label.style.display =
            "none";

          continue;
        }

        const v =
          altAzToVector(
            object.altitude,
            object.azimuth,
            120
          ).project(camera);

        if (
          v.z > 1
        ) {
          label.style.display =
            "none";

          continue;
        }

        label.style.display =
          "block";

        label.style.left =
          `${
            (v.x * 0.5 +
              0.5) *
            mount.clientWidth
          }px`;

        label.style.top =
          `${
            (-v.y * 0.5 +
              0.5) *
            mount.clientHeight
          }px`;

        label.style.transform =
          "translate(10px,-50%)";

        label.style.opacity =
          object.id ===
          stateRef.current
            .selectedId
            ? "1"
            : object.magnitude <=
                1.5
              ? "0.92"
              : "0.55";
      }

      renderer.render(
        scene,
        camera
      );
    };

    animate(
      performance.now()
    );

    /**
     * ---------------------------------------------------------
     * CLEANUP
     * ---------------------------------------------------------
     */

    return () => {
      cancelAnimationFrame(
        raf
      );

      window.removeEventListener(
        "resize",
        resize
      );

      window.removeEventListener(
        "deviceorientation",
        handleDeviceOrientation,
        true
      );

      window.removeEventListener(
        "orientationchange",
        handleScreenOrientation
      );

      if (
        screen.orientation
      ) {
        screen.orientation.removeEventListener(
          "change",
          handleScreenOrientation
        );
      }

      renderer.domElement.removeEventListener(
        "pointerup",
        selectBody
      );

      orbitControls?.dispose();

      for (
        const el of labels.values()
      ) {
        el.remove();
      }

      /**
       * Dispose Three.js resources.
       */
      starField.geometry.dispose();
      (
        starField.material as THREE.Material
      ).dispose();

      glowTexture.dispose();

      for (
        const node of bodyNodes.values()
      ) {
        node.mesh.geometry.dispose();

        const material =
          node.mesh.material;

        if (
          Array.isArray(material)
        ) {
          material.forEach(
            (m) => m.dispose()
          );
        } else {
          material.dispose();
        }
      }

      for (
        const sprite of glows.values()
      ) {
        sprite.material.dispose();
      }

      renderer.dispose();

      mount.innerHTML = "";
    };
  }, [
    location.latitude,
    location.longitude,
    location.height,
    liveOrientation,
  ]);

  return (
    <div
      ref={mountRef}
      className="sky-canvas"
      aria-label={
        showCamera
          ? "Live augmented sky"
          : "Interactive sky map"
      }
    />
  );
}