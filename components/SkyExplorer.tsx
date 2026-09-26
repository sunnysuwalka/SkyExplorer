"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SkyCanvas from "@/components/SkyCanvas";
import SolarSystemCanvas, {
  type SolarScale,
} from "@/components/SolarSystemCanvas";
import { searchStars } from "@/lib/catalog";
import {
  allBodyObjects,
  bodyRiseSet,
  starSkyObject,
  type ObserverLocation,
  type SkyObject,
} from "@/lib/astronomy";
import {
  requestSensorPermission,
  subscribeDeviceOrientation,
  type DeviceHeading,
} from "@/lib/sensors";

function fmtDistance(
  km: number | null,
  au: number | null
) {
  if (au != null) return `${au.toFixed(2)} AU`;
  if (km != null)
    return `${Math.round(km).toLocaleString()} km`;
  return "—";
}

function conditionForSun(
  sunAltitude: number
) {
  if (sunAltitude > 6) return "Daylight";
  if (sunAltitude > -6)
    return "Civil twilight";
  if (sunAltitude > -18) return "Twilight";
  return "Dark sky";
}

function formatDateTime(
  date: Date,
  mounted: boolean
) {
  if (!mounted) return "Loading time…";

  return date.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLiveDateTime(
  date: Date,
  mounted: boolean
) {
  if (!mounted) return "Loading time…";
  return date.toLocaleString();
}

function formatTime(
  date: Date | null,
  mounted: boolean
) {
  if (!date || !mounted) return "—";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SkyExplorer() {
  const [mounted, setMounted] =
    useState(false);

  const [mode, setMode] =
    useState<"sky" | "solar">("sky");

  const [location, setLocation] =
    useState<ObserverLocation | null>(null);

  const [locationStatus, setLocationStatus] =
    useState<
      "idle" | "granted" | "denied"
    >("idle");

  const [sensorStatus, setSensorStatus] =
    useState<
      "idle" | "granted" | "denied"
    >("idle");

  const [cameraStatus, setCameraStatus] =
    useState<
      "idle" | "granted" | "denied"
    >("idle");

  const [cameraActive, setCameraActive] =
    useState(false);

  const [orientation, setOrientation] =
    useState<DeviceHeading | null>(null);

  const [simulationMs, setSimulationMs] =
    useState(0);

  const [nowMs, setNowMs] =
    useState(0);

  const [searchOpen, setSearchOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const [selected, setSelected] =
    useState<SkyObject | null>(null);

  const [trackingId, setTrackingId] =
    useState<string | null>(null);

  const [tracking, setTracking] =
    useState<{
      separation: number;
      x: number;
      y: number;
    } | null>(null);

  const [nearest, setNearest] =
    useState<SkyObject | null>(null);

  const [solarScale, setSolarScale] =
    useState<SolarScale>("explore");

  const [solarSelected, setSolarSelected] =
    useState("earth");

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  useEffect(() => {
    const current = Date.now();

    setNowMs(current);
    setSimulationMs(current);
    setMounted(true);
  }, []);

  /**
   * Keep the sensor subscription alive.
   * This is also useful for other UI that may
   * eventually display heading/calibration state.
   */
  useEffect(() => {
    const cleanup =
      subscribeDeviceOrientation(
        setOrientation
      );

    return cleanup;
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [mounted]);

  const simulationDate = useMemo(
    () => new Date(simulationMs || 0),
    [simulationMs]
  );

  async function requestLocation(): Promise<boolean> {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return false;
    }

    setLocationStatus("idle");

    return await new Promise<boolean>(
      (resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation({
              latitude:
                position.coords.latitude,
              longitude:
                position.coords.longitude,
              height:
                position.coords.altitude ?? 0,
            });

            setLocationStatus("granted");
            resolve(true);
          },
          () => {
            setLocationStatus("denied");
            resolve(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000,
          }
        );
      }
    );
  }

  async function requestCamera() {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          "Camera unavailable"
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach((track) =>
          track.stop()
        );

      streamRef.current =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1920,
              },
              height: {
                ideal: 1080,
              },
            },
            audio: false,
          }
        );

      if (videoRef.current) {
        videoRef.current.srcObject =
          streamRef.current;

        await videoRef.current.play();
      }

      setCameraStatus("granted");
      setCameraActive(true);
    } catch {
      setCameraStatus("denied");
      setCameraActive(false);
    }
  }

  async function enableSensors() {
    const state =
      await requestSensorPermission();

    setSensorStatus(state);
  }

  async function startExperience() {
    const located = location
      ? true
      : await requestLocation();

    if (!located && !location) {
      return;
    }

    const state =
      await requestSensorPermission();

    setSensorStatus(state);

    await requestCamera();
  }

  /**
   * Start the sky-map experience WITHOUT camera.
   *
   * Location tells astronomy-engine where
   * the observer is.
   *
   * Motion/orientation tells SkyCanvas which
   * direction the physical phone is pointing.
   *
   * Camera is intentionally not requested.
   */
  async function startWithoutCamera() {
    const located = location
      ? true
      : await requestLocation();

    if (!located && !location) {
      return;
    }

    const sensorState =
      await requestSensorPermission();

    setSensorStatus(sensorState);

    // Explicitly keep camera disabled.
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      streamRef.current = null;
    }

    setCameraActive(false);
  }

  const calculatedBodies = location
    ? allBodyObjects(
        simulationDate,
        location
      )
    : [];

  const sun = calculatedBodies.find(
    (object) => object.id === "sun"
  );

  const condition = conditionForSun(
    sun?.altitude ?? -90
  );

  const results = useMemo(() => {
    const q =
      query.trim().toLowerCase();

    if (!q || !location) {
      return [] as SkyObject[];
    }

    const stars = searchStars(query).map(
      (star) =>
        starSkyObject(
          star,
          simulationDate,
          location
        )
    );

    const bodies =
      allBodyObjects(
        simulationDate,
        location
      ).filter((body) =>
        body.name
          .toLowerCase()
          .includes(q)
      );

    return [
      ...bodies,
      ...stars,
    ].slice(0, 10);
  }, [
    query,
    location,
    simulationMs,
  ]);

  function selectObject(
    object: SkyObject
  ) {
    setSelected(object);
    setTrackingId(null);
    setTracking(null);
    setSearchOpen(false);
    setQuery("");
  }

  function beginTracking() {
    if (!selected) return;

    setTrackingId(selected.id);
  }

  const selectedLive =
    selected && location
      ? allBodyObjects(
          simulationDate,
          location
        ).find(
          (object) =>
            object.id === selected.id
        ) ?? selected
      : selected;

  const riseSet =
    selectedLive?.kind === "body" &&
    selectedLive.body &&
    location
      ? bodyRiseSet(
          selectedLive.body,
          simulationDate,
          location
        )
      : null;

  const timelineMinutes =
    nowMs > 0
      ? Math.round(
          (simulationMs - nowMs) /
            60000
        )
      : 0;

  function jumpToNow() {
    const current = Date.now();

    setNowMs(current);
    setSimulationMs(current);
  }

  function setTimelineOffset(
    minutes: number
  ) {
    const base =
      nowMs || Date.now();

    setSimulationMs(
      base + minutes * 60000
    );
  }

  return (
    <main className="sky-shell">
      <video
        ref={videoRef}
        className={`camera-feed ${
          cameraActive ? "active" : ""
        }`}
        playsInline
        muted
        aria-hidden="true"
      />

      {mode === "sky" &&
        location && (
          <SkyCanvas
            location={location}
            liveOrientation={
              sensorStatus === "granted"
            }
            simulationDate={
              simulationDate
            }
            showCamera={
              cameraActive
            }
            selectedId={
              selectedLive?.id
            }
            trackingId={
              trackingId
            }
            onSelect={selectObject}
            onTrackingSeparation={(
              degrees,
              x,
              y
            ) =>
              setTracking({
                separation: degrees,
                x,
                y,
              })
            }
            onNearest={setNearest}
          />
        )}

      {mode === "solar" && (
        <SolarSystemCanvas
          date={simulationDate}
          scale={solarScale}
          selectedId={
            solarSelected
          }
          onSelect={
            setSolarSelected
          }
        />
      )}

      <div className="vignette" />

      <div className="hud">
        <div className="topbar">
          <div className="brand">
            Sky Explorer
            <small>
              Point. Discover. Explore.
            </small>
          </div>

          <div className="status-pill">
            <span className="status-dot" />

            {location
              ? `${location.latitude.toFixed(
                  2
                )}°, ${location.longitude.toFixed(
                  2
                )}°`
              : "Location needed"}
          </div>
        </div>

        <div className="mode-switch">
          <button
            className={
              mode === "sky"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode("sky")
            }
          >
            Explore Sky
          </button>

          <button
            className={
              mode === "solar"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode("solar")
            }
          >
            Explore Universe
          </button>
        </div>

        {mode === "sky" && (
          <>
            <div className="search-panel">
              {searchOpen && (
                <div className="search-box">
                  <span>⌕</span>

                  <input
                    autoFocus
                    placeholder="Search planets, Moon, stars..."
                    value={query}
                    onChange={(event) =>
                      setQuery(
                        event.target.value
                      )
                    }
                  />

                  <button
                    onClick={() => {
                      setSearchOpen(
                        false
                      );
                      setQuery("");
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              {searchOpen &&
                results.length > 0 && (
                  <div className="search-results">
                    {results.map(
                      (result) => (
                        <button
                          className="search-result"
                          key={result.id}
                          onClick={() =>
                            selectObject(
                              result
                            )
                          }
                        >
                          <span>
                            <b>
                              {
                                result.name
                              }
                            </b>

                            <br />

                            <small>
                              {
                                result.type
                              }
                            </small>
                          </span>

                          <span>
                            {result.kind ===
                            "body"
                              ? `${result.altitude.toFixed(
                                  0
                                )}° alt`
                              : `mag ${result.magnitude.toFixed(
                                  2
                                )}`}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>

            <div className="night-label">
              {condition.toUpperCase()}
            </div>

            <div className="target-reticle" />

            {trackingId &&
              tracking && (
                <div
                  className="tracking"
                  style={{
                    left: Math.min(
                      Math.max(
                        tracking.x,
                        80
                      ),
                      typeof window !==
                        "undefined"
                        ? window.innerWidth -
                            80
                        : 80
                    ),
                    top: Math.min(
                      Math.max(
                        tracking.y,
                        110
                      ),
                      typeof window !==
                        "undefined"
                        ? window.innerHeight -
                            130
                        : 110
                    ),
                  }}
                >
                  <div className="arrow">
                    {tracking.separation <
                    1
                      ? "✓"
                      : "✦"}
                  </div>

                  <small>
                    {tracking.separation <
                    1
                      ? `${(
                          selectedLive?.name ??
                          ""
                        ).toUpperCase()} IS HERE`
                      : `${Math.round(
                          tracking.separation
                        )}° away`}
                  </small>
                </div>
              )}

            {selectedLive && (
              <section className="object-card">
                <div className="eyebrow">
                  {selectedLive.type}
                </div>

                <h2>
                  {selectedLive.name}
                </h2>

                <div className="sub">
                  Live astronomical
                  solution ·{" "}
                  {formatLiveDateTime(
                    simulationDate,
                    mounted
                  )}
                </div>

                <div className="metrics">
                  <div className="metric">
                    <label>
                      Altitude
                    </label>
                    <b>
                      {selectedLive.altitude.toFixed(
                        1
                      )}
                      °
                    </b>
                  </div>

                  <div className="metric">
                    <label>
                      Azimuth
                    </label>
                    <b>
                      {selectedLive.azimuth.toFixed(
                        1
                      )}
                      °
                    </b>
                  </div>

                  <div className="metric">
                    <label>
                      Magnitude
                    </label>
                    <b>
                      {selectedLive.magnitude.toFixed(
                        2
                      )}
                    </b>
                  </div>

                  <div className="metric">
                    <label>
                      Distance
                    </label>
                    <b>
                      {fmtDistance(
                        selectedLive.distanceKm,
                        selectedLive.distanceAu
                      )}
                    </b>
                  </div>

                  <div className="metric">
                    <label>
                      Illumination
                    </label>
                    <b>
                      {selectedLive.phaseFraction !=
                      null
                        ? `${Math.round(
                            selectedLive.phaseFraction *
                              100
                          )}%`
                        : "—"}
                    </b>
                  </div>

                  <div className="metric">
                    <label>
                      Rise / Set
                    </label>
                    <b>
                      {formatTime(
                        riseSet?.rise ??
                          null,
                        mounted
                      )}
                    </b>
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    onClick={
                      beginTracking
                    }
                  >
                    {trackingId
                      ? "Tracking"
                      : "Track Object"}
                  </button>

                  <button
                    className="primary"
                    onClick={() => {
                      setMode(
                        "solar"
                      );
                      setSolarSelected(
                        selectedLive.id
                      );
                    }}
                  >
                    Explore 3D
                  </button>
                </div>
              </section>
            )}

            <div className="bottom-nav">
              <div className="nav-pill">
                <button
                  className="nav-btn"
                  onClick={() => {
                    setSearchOpen(
                      (value) =>
                        !value
                    );
                    setQuery("");
                  }}
                >
                  <strong>
                    ⌕
                  </strong>
                  Search
                </button>

                <button
                  className="nav-btn"
                  onClick={async () => {
                    if (cameraActive) {
                      streamRef.current
                        ?.getTracks()
                        .forEach(
                          (track) =>
                            track.stop()
                        );

                      streamRef.current =
                        null;

                      setCameraActive(
                        false
                      );
                    } else {
                      await requestCamera();
                    }
                  }}
                >
                  <strong>
                    ◉
                  </strong>

                  {cameraActive
                    ? "Camera"
                    : "Live"}
                </button>

                <button
                  className="nav-btn"
                  onClick={
                    enableSensors
                  }
                >
                  <strong>
                    ⌁
                  </strong>

                  {sensorStatus ===
                  "granted"
                    ? "Sensors"
                    : "Calibrate"}
                </button>

                <button
                  className="nav-btn"
                  onClick={
                    requestLocation
                  }
                >
                  <strong>
                    ⌖
                  </strong>
                  Location
                </button>

                <button
                  className="nav-btn active"
                  onClick={() =>
                    setMode(
                      "solar"
                    )
                  }
                >
                  <strong>
                    ✦
                  </strong>
                  3D Space
                </button>
              </div>
            </div>

            <div className="timeline">
              <div className="timeline-head">
                <span>
                  {formatDateTime(
                    simulationDate,
                    mounted
                  )}
                </span>

                <button
                  style={{
                    background:
                      "none",
                    border: 0,
                    color:
                      "inherit",
                    cursor:
                      "pointer",
                  }}
                  onClick={
                    jumpToNow
                  }
                >
                  NOW
                </button>
              </div>

              <input
                aria-label="Time travel"
                type="range"
                min={-720}
                max={720}
                value={
                  timelineMinutes
                }
                onChange={(event) =>
                  setTimelineOffset(
                    Number(
                      event.target.value
                    )
                  )
                }
              />
            </div>
          </>
        )}

        {mode === "solar" && (
          <div className="solar-ui">
            <div className="solar-toolbar">
              <button
                onClick={() =>
                  setMode("sky")
                }
              >
                ← Sky
              </button>

              <div className="range">
                <input
                  type="range"
                  min={-720}
                  max={720}
                  value={
                    timelineMinutes
                  }
                  onChange={(event) =>
                    setTimelineOffset(
                      Number(
                        event.target.value
                      )
                    )
                  }
                />
              </div>

              <select
                value={solarScale}
                onChange={(event) =>
                  setSolarScale(
                    event.target
                      .value as SolarScale
                  )
                }
                style={{
                  background:
                    "rgba(255,255,255,.05)",
                  color: "white",
                  border:
                    "1px solid rgba(255,255,255,.1)",
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                <option value="real">
                  Real scale
                </option>
                <option value="explore">
                  Exploration scale
                </option>
                <option value="educational">
                  Educational scale
                </option>
              </select>
            </div>

            <div className="solar-info">
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color:
                      "#aeb9cf",
                    letterSpacing:
                      ".1em",
                  }}
                >
                  LIVE SOLAR SYSTEM
                </div>

                <h2>
                  {solarSelected
                    .charAt(0)
                    .toUpperCase() +
                    solarSelected.slice(
                      1
                    )}
                </h2>

                <p>
                  Positions are
                  recalculated from
                  the selected
                  observation time.
                  Orbit controls let
                  you fly around the
                  system.
                </p>
              </div>
            </div>

            <div className="bottom-nav">
              <div className="nav-pill">
                <button
                  className="nav-btn active"
                  onClick={() =>
                    setMode("sky")
                  }
                >
                  <strong>
                    ◉
                  </strong>
                  Live Sky
                </button>

                <button
                  className="nav-btn"
                  onClick={
                    jumpToNow
                  }
                >
                  <strong>
                    ⏱
                  </strong>
                  Now
                </button>

                <button
                  className="nav-btn"
                  onClick={() =>
                    setSolarScale(
                      "real"
                    )
                  }
                >
                  <strong>
                    ◌
                  </strong>
                  Real
                </button>

                <button
                  className="nav-btn"
                  onClick={() =>
                    setSolarScale(
                      "educational"
                    )
                  }
                >
                  <strong>
                    ◉
                  </strong>
                  Learn
                </button>

                <button
                  className="nav-btn"
                  onClick={() =>
                    setSearchOpen(
                      true
                    )
                  }
                >
                  <strong>
                    ⌕
                  </strong>
                  Search
                </button>
              </div>
            </div>
          </div>
        )}

        {!location && (
          <section className="permission-card">
            <h1>
              Welcome to Sky Explorer
            </h1>

            <p>
              Point your phone at the
              real sky. Sky Explorer
              uses your location and
              device orientation to
              calculate where
              celestial objects
              actually are.
            </p>

            <div className="permission-grid">
              <div>
                <b>⌖</b>
                Location
              </div>

              <div>
                <b>⌁</b>
                Motion
              </div>

              <div>
                <b>◉</b>
                Camera
              </div>
            </div>

            <button
              className="primary"
              onClick={
                startExperience
              }
            >
              Start exploring
            </button>

            <button
              style={{ marginTop: 7 }}
              onClick={
                startWithoutCamera
              }
            >
              Continue without camera
            </button>

            <p
              style={{
                fontSize: 10,
                marginBottom: 0,
              }}
            >
              Camera is optional.
              Without it, the sky
              remains interactive
              and follows your
              phone's movement.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}