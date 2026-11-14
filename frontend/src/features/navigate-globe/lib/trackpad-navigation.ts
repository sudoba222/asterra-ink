import type { Viewer } from "cesium";
import type { CesiumModule } from "@/shared/lib/cesium";
import { deltaInPixels, WheelGestureTracker } from "./wheel-intent";

const EARTH_RADIUS_M = 6_378_137;
/** Pinch sensitivity: exp(deltaY · k). Touchpads send ±1…10 per event. */
const PINCH_K = 0.012;
/** Mouse wheel sensitivity per CSS pixel of delta (one notch ≈ 100 px ≈ ×1.25). */
const WHEEL_K = 0.0022;

interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/**
 * Laptop-friendly globe navigation on top of Cesium's own mouse/touch controls:
 *  - touchpad pinch (ctrl+wheel, Safari gesture events) → smooth zoom toward the cursor
 *  - touchpad two-finger swipe                         → pan; the ground follows the fingers
 *  - mouse wheel                                        → eased zoom toward the cursor
 * All of these call preventDefault, so the page never scrolls, zooms or swipes back while
 * the pointer is over the globe. Drag, right-drag, middle-drag and touch pinch stay Cesium's.
 * Respects `screenSpaceCameraController.enableInputs` (field drawing turns it off while dragging).
 */
export function attachTrackpadNavigation(Cesium: CesiumModule, viewer: Viewer): () => void {
  const { scene, camera, canvas } = viewer;
  const ssc = scene.screenSpaceCameraController;
  const savedZoomTypes = ssc.zoomEventTypes;
  // Cesium would also zoom on wheel; we own the wheel now (touch pinch + right-drag stay).
  ssc.zoomEventTypes = [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.PINCH];

  const tracker = new WheelGestureTracker();
  const scratchPos = new Cesium.Cartesian2();
  const scratchDir = new Cesium.Cartesian3();

  const toCanvas = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    scratchPos.x = clientX - r.left;
    scratchPos.y = clientY - r.top;
    return scratchPos;
  };

  const zoomBy = (factor: number, clientX: number, clientY: number) => {
    const h = camera.positionCartographic.height;
    const target = Cesium.Math.clamp(h * factor, ssc.minimumZoomDistance, ssc.maximumZoomDistance);
    const f = target / h;
    if (Math.abs(1 - f) < 1e-5) return;
    const ground = camera.pickEllipsoid(toCanvas(clientX, clientY), scene.globe.ellipsoid);
    if (ground) {
      // Move along the ray to the point under the cursor so that point stays put.
      const dist = Cesium.Cartesian3.distance(camera.positionWC, ground);
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(ground, camera.positionWC, scratchDir), scratchDir);
      camera.move(scratchDir, dist * (1 - f));
    } else {
      camera.zoomIn(h * (1 - f));
    }
    scene.requestRender();
  };

  const panBy = (dx: number, dy: number) => {
    const h = camera.positionCartographic.height;
    const frustum = camera.frustum as { fovy?: number };
    const fovy = frustum.fovy ?? Cesium.Math.toRadians(60);
    const metresPerPx = (2 * h * Math.tan(fovy / 2)) / Math.max(1, canvas.clientHeight);
    const radPerPx = Math.min(metresPerPx / EARTH_RADIUS_M, 0.006);
    // Natural scrolling: content moves with the fingers (deltaX > 0 → reveal what is east).
    if (dx) camera.rotateRight(dx * radPerPx);
    if (dy) camera.rotateUp(dy * radPerPx); // positive orbits toward the bottom of the screen (verified in-browser)
    scene.requestRender();
  };

  // Mouse wheel: ease the zoom over a few frames instead of jumping per notch.
  let pending = 0;
  let anchor = { x: 0, y: 0 };
  let raf = 0;
  const step = () => {
    const take = Math.abs(pending) < 0.003 ? pending : pending * 0.28;
    pending -= take;
    zoomBy(Math.exp(take), anchor.x, anchor.y);
    raf = pending !== 0 ? requestAnimationFrame(step) : 0;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!ssc.enableInputs) return;
    const intent = tracker.next(e, e.timeStamp || performance.now());
    if (intent === "pinch") {
      zoomBy(Math.exp(Cesium.Math.clamp(e.deltaY, -50, 50) * PINCH_K), e.clientX, e.clientY);
    } else if (intent === "pan") {
      panBy(deltaInPixels(e.deltaX, e.deltaMode), deltaInPixels(e.deltaY, e.deltaMode));
    } else {
      pending += Cesium.Math.clamp(deltaInPixels(e.deltaY, e.deltaMode) * WHEEL_K, -0.6, 0.6);
      anchor = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(step);
    }
  };

  // Safari reports touchpad pinch as non-standard gesture events (and would zoom the page).
  let lastScale = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    lastScale = (e as SafariGestureEvent).scale || 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as SafariGestureEvent;
    if (!ssc.enableInputs || !g.scale) return;
    zoomBy(lastScale / g.scale, g.clientX, g.clientY);
    lastScale = g.scale;
  };
  const prevent = (e: Event) => e.preventDefault();

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("gesturestart", onGestureStart, { passive: false });
  canvas.addEventListener("gesturechange", onGestureChange, { passive: false });
  canvas.addEventListener("gestureend", prevent, { passive: false });

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("gesturestart", onGestureStart);
    canvas.removeEventListener("gesturechange", onGestureChange);
    canvas.removeEventListener("gestureend", prevent);
    if (!viewer.isDestroyed()) ssc.zoomEventTypes = savedZoomTypes;
  };
}
