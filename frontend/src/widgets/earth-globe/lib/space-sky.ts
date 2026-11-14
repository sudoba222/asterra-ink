import type { SkyBox } from "cesium";
import type { CesiumModule } from "@/shared/lib/cesium";
import { seededRandom } from "@/shared/lib";

/** 1536 px per face keeps stars crisp on large screens (≈56 MB of GPU memory for the cube). */
const FACE = 1536;
const FACES = ["positiveX", "negativeX", "positiveY", "negativeY", "positiveZ", "negativeZ"] as const;
type Face = (typeof FACES)[number];

/** Star colours by spectral class, weighted toward white/blue-white like the real night sky. */
const STAR_TINTS = ["255,255,255", "235,242,255", "222,234,255", "255,246,232", "255,236,214"];

function drawStars(ctx: CanvasRenderingContext2D, rand: () => number) {
  // Many faint stars, a few brighter ones: brightness falls off steeply (magnitude-like).
  for (let i = 0; i < 1500; i++) {
    const x = rand() * FACE;
    const y = rand() * FACE;
    const m = rand() ** 3.6; // 0 = faint … 1 = bright
    const r = 0.3 + m * 0.75;
    const a = 0.16 + m * 0.74;
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)];
    if (m > 0.8) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
      glow.addColorStop(0, `rgba(${tint},${a * 0.35})`);
      glow.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 3.5, y - r * 3.5, r * 7, r * 7);
    }
    ctx.fillStyle = `rgba(${tint},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A faint, far-away planet: lit from one side, barely brighter than the stars around it. */
function drawPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, shade: string, ring: boolean) {
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.strokeStyle = "rgba(226,214,186,0.22)";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 2.1, r * 0.55, 0, Math.PI * 1.02, Math.PI * 1.98, true); // back half
    ctx.stroke();
    ctx.restore();
  }
  const body = ctx.createRadialGradient(x - r * 0.45, y - r * 0.45, r * 0.1, x, y, r);
  body.addColorStop(0, base);
  body.addColorStop(0.75, shade);
  body.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.strokeStyle = "rgba(226,214,186,0.3)";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 2.1, r * 0.55, 0, Math.PI * 0.02, Math.PI * 0.98); // front half
    ctx.stroke();
    ctx.restore();
  }
}

function drawFace(face: Face, index: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, FACE, FACE);
  const rand = seededRandom(0x5eed + index * 7919);

  // A very soft band of distant galaxy light on two faces, so the sky isn't flat black.
  if (face === "positiveY" || face === "negativeX") {
    const haze = ctx.createRadialGradient(FACE * 0.55, FACE * 0.5, 0, FACE * 0.55, FACE * 0.5, FACE * 0.7);
    haze.addColorStop(0, "rgba(120,140,190,0.06)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, FACE, FACE);
  }
  drawStars(ctx, rand);
  if (face === "positiveY") drawPlanet(ctx, FACE * 0.68, FACE * 0.34, 10, "rgba(214,140,104,0.95)", "rgba(120,58,38,0.9)", false);
  if (face === "negativeX") drawPlanet(ctx, FACE * 0.3, FACE * 0.62, 14, "rgba(232,214,176,0.95)", "rgba(150,120,82,0.9)", true);
  if (face === "negativeZ") drawPlanet(ctx, FACE * 0.52, FACE * 0.48, 7, "rgba(170,205,235,0.9)", "rgba(60,96,140,0.9)", false);
  return canvas;
}

/**
 * Deep-black sky with subtle stars and a few distant planets, generated once in the browser
 * (no extra assets, deterministic). As a Cesium SkyBox it moves correctly with the camera.
 */
export function createSpaceSkyBox(Cesium: CesiumModule): SkyBox {
  const sources = Object.fromEntries(FACES.map((f, i) => [f, drawFace(f, i)])) as Record<Face, HTMLCanvasElement>;
  // Cesium accepts canvases as cube map faces (typed as string | image in the d.ts).
  return new Cesium.SkyBox({ sources: sources as unknown as ConstructorParameters<typeof Cesium.SkyBox>[0]["sources"] });
}
