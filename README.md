# Sky Explorer

A mobile-first, sensor-driven sky explorer built as a production-oriented Next.js app.

## What is real

- Solar System body positions are calculated at runtime from time + observer location with Astronomy Engine.
- Planet/Moon/Sun apparent altitude, azimuth, distance and visual magnitude are calculated rather than mocked.
- Bright-star positions are converted from J2000 RA/Dec into the observer's local horizon at runtime.
- Device orientation is used when the browser exposes motion/orientation sensors.
- Camera access uses the browser's real `getUserMedia` API and is optional.
- The 3D Solar System is driven by live heliocentric vectors for the selected time.
- Search results are tied to the same live calculation layer.

## Requirements

- Node.js 20+
- HTTPS in production for camera, geolocation and motion/orientation APIs.
- A modern mobile browser for the sensor experience.

## Install

```bash
npm install
npm run dev
```

Open the displayed local URL. For a physical phone, deploy behind HTTPS (for example a real hosting provider or a local HTTPS tunnel) because browser geolocation and sensor/camera permissions are security-sensitive.

## Build

```bash
npm run build
npm start
```

## Architecture

`components/SkyExplorer.tsx` is the product shell. `lib/astronomy.ts` owns astronomical calculations, `lib/sensors.ts` owns device permissions/orientation, `components/SkyCanvas.tsx` renders the live local sky, and `components/SolarSystemCanvas.tsx` renders the navigable Solar System.

The bright-star catalogue is a curated subset of the public-domain Yale Bright Star Catalog data for the first release. The moving Solar System layer is not stored as snapshots; it is recalculated at runtime.

## Production hardening to add before public launch

- Expand the star catalogue from the curated bright subset to the full desired catalogue.
- Add robust sensor calibration/magnetic-declination correction on devices where absolute orientation is unavailable or noisy.
- Add real planetary texture assets and higher-fidelity axial-rotation/lighting shaders.
- Add authentication only if user accounts or cloud sync become necessary; the core sky experience does not require a server database.
- Add automated device/browser compatibility tests for iOS Safari and Android Chrome.
