import type { Cartesian2, Entity, ScreenSpaceEventHandler } from "cesium";
import type { LonLat } from "@/entities/field";
import type { MapHandle } from "@/entities/map";

export type DrawStatus = "drawing" | "editing";

export interface DrawCallbacks {
  onChange: (vertices: LonLat[], status: DrawStatus) => void;
  /** A click was ignored because the camera is too far away to mark a field. */
  onTooFar?: () => void;
}

type Handle = { kind: "vertex" | "mid"; index: number };

const LIME = "#C5E58A";
const MAX_MARK_HEIGHT_M = 40_000;
const CLOSE_PX = 14;

/**
 * Polygon drawing + editing on the Cesium globe, independent of React.
 *  - drawing: click/tap adds a corner; double-click or tapping the first corner finishes
 *  - editing: drag corners, drag the small midpoints to add a corner, double-click a corner to remove it
 * Camera navigation keeps working; it is paused only while a handle is being dragged.
 */
export class FieldDrawController {
  private vertices: LonLat[] = [];
  private status: DrawStatus = "drawing";
  private cursor: LonLat | null = null;
  private handler: ScreenSpaceEventHandler;
  private shape: Entity[] = [];
  private handles: Entity[] = [];
  private handleInfo = new Map<Entity, Handle>();
  private drag: Handle | null = null;

  constructor(
    private readonly map: MapHandle,
    private readonly cb: DrawCallbacks,
    initial?: LonLat[],
  ) {
    const { Cesium, viewer } = map;
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    const lime = Cesium.Color.fromCssColorString(LIME);

    // Live shape: fill + outline follow the vertices (and the cursor while drawing).
    const ring = () => {
      const pts = [...this.vertices];
      if (this.status === "drawing" && this.cursor) pts.push(this.cursor);
      return pts;
    };
    this.shape.push(
      viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            const pts = ring();
            return pts.length >= 3 ? new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(pts.flat())) : undefined;
          }, false),
          material: lime.withAlpha(0.22),
          height: 0,
        },
      }),
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const pts = ring();
            if (pts.length < 2) return [];
            const closed = this.status === "editing" || pts.length >= 3 ? [...pts, pts[0]] : pts;
            return Cesium.Cartesian3.fromDegreesArray(closed.flat());
          }, false),
          width: 3,
          material: lime,
        },
      }),
    );

    if (initial && initial.length >= 3) {
      this.vertices = initial.map((p) => [...p] as LonLat);
      this.status = "editing";
    }
    this.bindInput();
    this.rebuildHandles();
    this.emit();
  }

  /* ---------- public API ---------- */

  getVertices(): LonLat[] {
    return this.vertices.map((p) => [...p] as LonLat);
  }

  undo() {
    if (this.status !== "drawing" || this.vertices.length === 0) return;
    this.vertices.pop();
    this.changed();
  }

  clear() {
    this.vertices = [];
    this.status = "drawing";
    this.cursor = null;
    this.changed();
  }

  finish() {
    if (this.vertices.length < 3) return;
    this.status = "editing";
    this.cursor = null;
    this.changed();
  }

  destroy() {
    const { viewer } = this.map;
    this.handler.destroy();
    if (viewer.isDestroyed()) return;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    viewer.canvas.style.cursor = "";
    for (const e of [...this.shape, ...this.handles]) viewer.entities.remove(e);
    viewer.scene.requestRender();
  }

  /* ---------- internals ---------- */

  private pick(pos: Cartesian2): LonLat | null {
    const { Cesium, viewer } = this.map;
    const cart = viewer.camera.pickEllipsoid(pos, viewer.scene.globe.ellipsoid);
    if (!cart) return null;
    const c = Cesium.Cartographic.fromCartesian(cart);
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
  }

  private screenOf(p: LonLat): Cartesian2 | undefined {
    const { Cesium, viewer } = this.map;
    return viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(p[0], p[1]));
  }

  private handleAt(pos: Cartesian2): Handle | null {
    const picked = this.map.viewer.scene.pick(pos) as { id?: Entity } | undefined;
    return picked?.id ? (this.handleInfo.get(picked.id) ?? null) : null;
  }

  private tooFar(): boolean {
    return this.map.viewer.camera.positionCartographic.height > MAX_MARK_HEIGHT_M;
  }

  private bindInput() {
    const { Cesium, viewer } = this.map;
    const T = Cesium.ScreenSpaceEventType;

    this.handler.setInputAction((e: { position: Cartesian2 }) => {
      if (this.status !== "drawing") return;
      if (this.tooFar()) {
        this.cb.onTooFar?.();
        return;
      }
      // Tapping the first corner closes the shape.
      if (this.vertices.length >= 3) {
        const first = this.screenOf(this.vertices[0]);
        if (first && Cesium.Cartesian2.distance(first, e.position) < CLOSE_PX) return this.finish();
      }
      const p = this.pick(e.position);
      if (!p) return;
      // Ignore the duplicate click produced by a double-click.
      const last = this.vertices.at(-1);
      if (last) {
        const s = this.screenOf(last);
        if (s && Cesium.Cartesian2.distance(s, e.position) < 4) return;
      }
      this.vertices.push(p);
      this.changed();
    }, T.LEFT_CLICK);

    this.handler.setInputAction((e: { position: Cartesian2 }) => {
      if (this.status === "drawing") return this.finish();
      const h = this.handleAt(e.position);
      if (h?.kind === "vertex" && this.vertices.length > 3) {
        this.vertices.splice(h.index, 1);
        this.changed();
      }
    }, T.LEFT_DOUBLE_CLICK);

    this.handler.setInputAction((e: { position: Cartesian2 }) => {
      if (this.status !== "editing") return;
      const h = this.handleAt(e.position);
      if (!h) return;
      if (h.kind === "mid") {
        const a = this.vertices[h.index];
        const b = this.vertices[(h.index + 1) % this.vertices.length];
        this.vertices.splice(h.index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        this.drag = { kind: "vertex", index: h.index + 1 };
        this.rebuildHandles();
      } else this.drag = h;
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      viewer.canvas.style.cursor = "grabbing";
    }, T.LEFT_DOWN);

    this.handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      if (this.drag) {
        const p = this.pick(e.endPosition);
        if (p) {
          this.vertices[this.drag.index] = p;
          this.moveHandles();
          this.emit();
          viewer.scene.requestRender();
        }
        return;
      }
      if (this.status === "drawing") {
        this.cursor = this.vertices.length ? this.pick(e.endPosition) : null;
        if (this.vertices.length) viewer.scene.requestRender();
        viewer.canvas.style.cursor = this.tooFar() ? "" : "crosshair";
      } else {
        viewer.canvas.style.cursor = this.handleAt(e.endPosition) ? "grab" : "";
      }
    }, T.MOUSE_MOVE);

    this.handler.setInputAction(() => {
      if (!this.drag) return;
      this.drag = null;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      viewer.canvas.style.cursor = "grab";
      this.changed();
    }, T.LEFT_UP);
  }

  private changed() {
    this.rebuildHandles();
    this.emit();
    this.map.viewer.scene.requestRender();
  }

  private emit() {
    this.cb.onChange(this.getVertices(), this.status);
  }

  private midpoints(): LonLat[] {
    if (this.status !== "editing") return [];
    return this.vertices.map((a, i) => {
      const b = this.vertices[(i + 1) % this.vertices.length];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as LonLat;
    });
  }

  private rebuildHandles() {
    const { Cesium, viewer } = this.map;
    for (const e of this.handles) viewer.entities.remove(e);
    this.handles = [];
    this.handleInfo.clear();
    const add = (p: LonLat, info: Handle) => {
      const isMid = info.kind === "mid";
      const isFirst = info.kind === "vertex" && info.index === 0 && this.status === "drawing";
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p[0], p[1]),
        point: {
          pixelSize: isMid ? 9 : isFirst ? 15 : 13,
          color: isMid ? Cesium.Color.WHITE.withAlpha(0.75) : Cesium.Color.fromCssColorString(isFirst ? "#FFFFFF" : LIME),
          outlineColor: Cesium.Color.fromCssColorString("#10251E"),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      this.handles.push(e);
      this.handleInfo.set(e, info);
    };
    this.vertices.forEach((p, index) => add(p, { kind: "vertex", index }));
    this.midpoints().forEach((p, index) => add(p, { kind: "mid", index }));
  }

  /** Cheap update during drags (same handle count). */
  private moveHandles() {
    const { Cesium } = this.map;
    const mids = this.midpoints();
    this.handles.forEach((e) => {
      const info = this.handleInfo.get(e)!;
      const p = info.kind === "vertex" ? this.vertices[info.index] : mids[info.index];
      if (p) e.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(p[0], p[1]));
    });
  }
}
