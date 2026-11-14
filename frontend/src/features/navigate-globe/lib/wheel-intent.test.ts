import { describe, expect, it } from "vitest";
import { classifyWheel, GESTURE_GAP_MS, WheelGestureTracker, type WheelSample } from "./wheel-intent";

const s = (deltaX: number, deltaY: number, extra: Partial<WheelSample> = {}): WheelSample => ({ deltaX, deltaY, deltaMode: 0, ctrlKey: false, ...extra });

describe("classifyWheel", () => {
  it("treats ctrl+wheel as a touchpad pinch", () => {
    expect(classifyWheel(s(0, -3.2, { ctrlKey: true }))).toBe("pinch");
  });
  it("treats line/page deltas as a mouse wheel", () => {
    expect(classifyWheel(s(0, 3, { deltaMode: 1 }))).toBe("zoom");
  });
  it("recognises mouse wheel notches (Windows 100/120, macOS 4.000244…)", () => {
    expect(classifyWheel(s(0, 100))).toBe("zoom");
    expect(classifyWheel(s(0, -120))).toBe("zoom");
    expect(classifyWheel(s(0, 4.000244140625 * 3))).toBe("zoom");
  });
  it("treats small or sideways deltas as a two-finger swipe", () => {
    expect(classifyWheel(s(0, 2.5))).toBe("pan");
    expect(classifyWheel(s(-6, 1))).toBe("pan");
    expect(classifyWheel(s(0, 12))).toBe("pan");
  });
});

describe("WheelGestureTracker", () => {
  it("keeps the first decision for the whole gesture", () => {
    const t = new WheelGestureTracker();
    expect(t.next(s(3, 1), 0)).toBe("pan");
    expect(t.next(s(0, 100), 16)).toBe("pan"); // a big momentum event inside the same swipe
    expect(t.next(s(0, 100), 16 + GESTURE_GAP_MS + 1)).toBe("zoom"); // a new gesture
  });
  it("switches to pinch as soon as ctrl is held", () => {
    const t = new WheelGestureTracker();
    t.next(s(2, 2), 0);
    expect(t.next(s(0, -2, { ctrlKey: true }), 10)).toBe("pinch");
    expect(t.next(s(1, 1), 20)).toBe("pan");
  });
});
