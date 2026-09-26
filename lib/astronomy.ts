import * as Astronomy from "astronomy-engine";

import {
  Body,
  Equator,
  GeoVector,
  Horizon,
  Illumination,
  Observer,
  SearchRiseSet,
  SearchAltitude
} from "astronomy-engine";

export type ObserverLocation = { latitude: number; longitude: number; height?: number };
export type SkyObjectKind = "star" | "body";

export type SkyObject = {
  id: string;
  name: string;
  kind: SkyObjectKind;
  type: string;
  magnitude: number;
  altitude: number;
  azimuth: number;
  distanceKm: number | null;
  distanceAu: number | null;
  phaseFraction?: number;
  phaseAngle?: number;
  body?: Body;
  ra?: number;
  dec?: number;
  color?: string;
};

export const PLANETS: Array<{ id: string; name: string; body: Body; type: string; color: string }> = [
  { id: "mercury", name: "Mercury", body: Body.Mercury, type: "Planet · Terrestrial", color: "#c5b7aa" },
  { id: "venus", name: "Venus", body: Body.Venus, type: "Planet · Terrestrial", color: "#efd2a1" },
  { id: "mars", name: "Mars", body: Body.Mars, type: "Planet · Terrestrial", color: "#db7755" },
  { id: "jupiter", name: "Jupiter", body: Body.Jupiter, type: "Planet · Gas Giant", color: "#e1ba8d" },
  { id: "saturn", name: "Saturn", body: Body.Saturn, type: "Planet · Gas Giant", color: "#d8c49d" },
  { id: "uranus", name: "Uranus", body: Body.Uranus, type: "Planet · Ice Giant", color: "#99d8de" },
  { id: "neptune", name: "Neptune", body: Body.Neptune, type: "Planet · Ice Giant", color: "#658de0" }
];

function observerOf(location: ObserverLocation) {
  return new Observer(location.latitude, location.longitude, location.height ?? 0);
}

function kmFromAu(au: number) {
  return au * Astronomy.KM_PER_AU;
}

export function horizontalForBody(body: Body, date: Date, location: ObserverLocation) {
  const observer = observerOf(location);
  const eq = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, "normal");
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

export function bodySkyObject(
  cfg: { id: string; name: string; body: Body; type: string; color: string },
  date: Date,
  location: ObserverLocation
): SkyObject {
  const observer = observerOf(location);
  const eq = Equator(cfg.body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, "normal");
  const geo = GeoVector(cfg.body, date, true);
  const distanceAu = Math.sqrt(geo.x ** 2 + geo.y ** 2 + geo.z ** 2);
  const illum = Illumination(cfg.body, date);
  return {
    id: cfg.id,
    name: cfg.name,
    kind: "body",
    type: cfg.type,
    magnitude: illum.mag,
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    distanceKm: kmFromAu(distanceAu),
    distanceAu,
    phaseFraction: illum.phase_fraction,
    phaseAngle: illum.phase_angle,
    body: cfg.body,
    color: cfg.color,
    ra: eq.ra,
    dec: eq.dec
  };
}

export function sunObject(date: Date, location: ObserverLocation): SkyObject {
  return bodySkyObject({ id: "sun", name: "Sun", body: Body.Sun, type: "Star · G-type main-sequence", color: "#ffd36d" }, date, location);
}

export function moonObject(date: Date, location: ObserverLocation): SkyObject {
  return bodySkyObject({ id: "moon", name: "Moon", body: Body.Moon, type: "Natural satellite", color: "#e7e9ef" }, date, location);
}

export function allBodyObjects(date: Date, location: ObserverLocation) {
  return [sunObject(date, location), moonObject(date, location), ...PLANETS.map(p => bodySkyObject(p, date, location))];
}


export function starSkyObject(star: { id:string; name:string; ra:number; dec:number; magnitude:number; constellation?:string; color?:string }, date: Date, location: ObserverLocation): SkyObject {
  const observer = observerOf(location);
  const hor = Horizon(date, observer, star.ra, star.dec, "normal");
  return {
    id: star.id,
    name: star.name,
    kind: "star",
    type: `Star · ${star.constellation ?? ""}`.trim(),
    magnitude: star.magnitude,
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    distanceKm: null,
    distanceAu: null,
    ra: star.ra,
    dec: star.dec,
    color: star.color
  };
}

export function bodyRiseSet(body: Body, date: Date, location: ObserverLocation) {
  const observer = observerOf(location);
  const rise = SearchRiseSet(body, observer, +1, date, 1);
  const set = SearchRiseSet(body, observer, -1, date, 1);
  return { rise: rise?.date ?? null, set: set?.date ?? null };
}

export function solarEvents(date: Date, location: ObserverLocation) {
  const observer = observerOf(location);
  const next = (direction: 1 | -1, altitude: number) => SearchAltitude(Body.Sun, observer, direction, date, 1, altitude)?.date ?? null;
  return {
    dawn: next(-1, -6),
    dusk: next(1, -6),
    sunrise: SearchRiseSet(Body.Sun, observer, +1, date, 1)?.date ?? null,
    sunset: SearchRiseSet(Body.Sun, observer, -1, date, 1)?.date ?? null
  };
}

export function nearestBodiesToDirection(objects: SkyObject[], azimuth: number, altitude: number, limit = 5) {
  const wrap = (a: number) => Math.abs(((a - azimuth + 540) % 360) - 180);
  return [...objects]
    .map(o => ({ object: o, separation: angularSeparation(o.altitude, o.azimuth, altitude, azimuth) }))
    .sort((a, b) => a.separation - b.separation)
    .slice(0, limit);
}

export function angularSeparation(alt1: number, az1: number, alt2: number, az2: number) {
  const r = Math.PI / 180;
  const a1 = alt1 * r, a2 = alt2 * r;
  const da = (az1 - az2) * r;
  const cos = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(da);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / r;
}

export function constellationFor(ra: number, dec: number) {
  return Astronomy.Constellation(ra, dec).symbol;
}
