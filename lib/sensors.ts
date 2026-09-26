export type DeviceHeading = { heading: number; altitude: number; beta: number; gamma: number; absolute: boolean };
export type PermissionState = "idle" | "granted" | "denied";

function deg(v: number | null | undefined) { return typeof v === "number" ? v : 0; }

export async function requestSensorPermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return "denied";
  try {
    const deviceOrientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> };
    if (typeof deviceOrientation.requestPermission === "function") {
      const result = await deviceOrientation.requestPermission(true);
      return result === "granted" ? "granted" : "denied";
    }
    return "granted";
  } catch {
    return "denied";
  }
}

export function subscribeDeviceOrientation(onChange: (heading: DeviceHeading) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: DeviceOrientationEvent) => {
    const alpha = deg(event.alpha);
    const beta = deg(event.beta);
    const gamma = deg(event.gamma);
    // For compass-capable browsers, alpha is clockwise from magnetic/north reference.
    // Screen compensation keeps the world upright while rotating between portrait/landscape.
    const screenAngle = typeof screen.orientation?.angle === "number" ? screen.orientation.angle : 0;
    const heading = ((alpha + screenAngle) % 360 + 360) % 360;
    onChange({ heading, altitude: beta, beta, gamma, absolute: event.absolute });
  };
  window.addEventListener("deviceorientation", handler, true);
  window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
  return () => {
    window.removeEventListener("deviceorientation", handler, true);
    window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
  };
}

export function getScreenOrientationAngle() {
  if (typeof window === "undefined") return 0;
  return typeof window.screen.orientation?.angle === "number" ? window.screen.orientation.angle : (window.orientation as number) || 0;
}
