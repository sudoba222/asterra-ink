/**
 * Browsers report every touchpad gesture as a `wheel` event:
 *  - pinch            → wheel with ctrlKey = true (Chrome, Edge, Firefox; Safari uses gesture* events)
 *  - two-finger swipe → wheel with small, often fractional deltas, usually some deltaX
 *  - mouse wheel      → wheel with line/page deltaMode, or big "notches" (±100/120, mac ±4.000244)
 * There is no flag for "touchpad", so we classify the first event of each gesture and keep
 * that decision until the gesture ends (no event for GESTURE_GAP_MS).
 */
export type WheelIntent = "pinch" | "pan" | "zoom";

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

export const GESTURE_GAP_MS = 220;
const MAC_WHEEL_STEP = 4.000244140625;

function isNotch(v: number): boolean {
  const a = Math.abs(v);
  if (a === 0) return false;
  if (a % 120 === 0 || a % 100 === 0) return true;
  const steps = a / MAC_WHEEL_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function classifyWheel(e: WheelSample): WheelIntent {
  if (e.ctrlKey) return "pinch";
  if (e.deltaMode !== 0) return "zoom"; // DOM_DELTA_LINE / PAGE: a real mouse wheel
  if (e.deltaX !== 0) return "pan";
  if (isNotch(e.deltaY)) return "zoom";
  if (Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY)) return "zoom";
  return "pan";
}

/** Remembers the intent of the gesture in progress. */
export class WheelGestureTracker {
  private intent: WheelIntent | null = null;
  private last = -Infinity;

  next(e: WheelSample, now: number): WheelIntent {
    // A pinch can start mid-gesture (ctrl flips on), so ctrlKey always wins.
    if (e.ctrlKey) {
      this.intent = "pinch";
    } else if (this.intent === null || this.intent === "pinch" || now - this.last > GESTURE_GAP_MS) {
      this.intent = classifyWheel(e);
    }
    this.last = now;
    return this.intent;
  }
}

/** px of wheel delta in CSS pixels (line = 16 px, page = 800 px). */
export function deltaInPixels(delta: number, deltaMode: number): number {
  return deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * 800 : delta;
}
