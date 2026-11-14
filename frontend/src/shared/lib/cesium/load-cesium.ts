import type * as CesiumNS from "cesium";

export type CesiumModule = typeof CesiumNS;

declare global {
  interface Window {
    Cesium?: CesiumModule;
    CESIUM_BASE_URL?: string;
  }
}

let pending: Promise<CesiumModule> | null = null;

/**
 * Loads the prebuilt Cesium bundle from /public/cesium (copied at install by
 * scripts/copy-static-assets.mjs). Loading it as a static script keeps ~2k
 * Cesium ES modules out of the Turbopack graph and guarantees it never runs on
 * the server. Workers/Assets resolve from CESIUM_BASE_URL.
 */
export function loadCesium(): Promise<CesiumModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("Cesium is browser-only"));
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (pending) return pending;

  window.CESIUM_BASE_URL = "/cesium/";
  pending = new Promise<CesiumModule>((resolve, reject) => {
    if (!document.querySelector("link[data-cesium-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/cesium/Widgets/widgets.css";
      link.dataset.cesiumCss = "true";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => {
      if (window.Cesium) resolve(window.Cesium);
      else reject(new Error("Cesium loaded but did not initialise."));
    };
    script.onerror = () => {
      pending = null;
      script.remove();
      reject(new Error("Could not load the 3D globe engine. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return pending;
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
