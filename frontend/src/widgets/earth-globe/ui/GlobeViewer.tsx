"use client";

import type { Viewer } from "cesium";
import { useEffect, useRef } from "react";
import { OVERVIEW_VIEW, useRegisterMap } from "@/entities/map";
import { BASEMAP, HIGH_RES_IMAGERY } from "@/entities/satellite-layer";
import { loadCesium, supportsWebGL, type CesiumModule } from "@/shared/lib/cesium";

export interface GlobeViewerProps {
  spin: boolean;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
}

/**
 * Creates the one Cesium viewer (no Cesium ion), sets up NASA + high-resolution
 * imagery and publishes it through MapProvider. Feature behaviour (fly-to, outlines,
 * drawing, layers) lives in entities/map and features/*.
 */
export default function GlobeViewer({ spin, reducedMotion, onReady, onError }: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const interactedRef = useRef(false);
  const registerMap = useRegisterMap();
  const callbacks = useRef({ onReady, onError });
  useEffect(() => {
    callbacks.current = { onReady, onError };
  });

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;
    if (!supportsWebGL()) {
      callbacks.current.onError(new Error("This browser or device doesn't support WebGL, which the 3D map needs."));
      return;
    }

    loadCesium()
      .then((Cesium) => {
        if (disposed) return;
        cesiumRef.current = Cesium;
        const viewer = new Cesium.Viewer(container, {
          baseLayer: new Cesium.ImageryLayer(
            new Cesium.UrlTemplateImageryProvider({ url: BASEMAP.url, maximumLevel: BASEMAP.maxLevel, credit: new Cesium.Credit(BASEMAP.credit) }),
          ),
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          skyBox: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          contextOptions: { webgl: { alpha: true } },
        });
        viewerRef.current = viewer;
        const { scene } = viewer;
        scene.backgroundColor = Cesium.Color.TRANSPARENT;
        scene.globe.baseColor = Cesium.Color.fromCssColorString("#0d2219");
        scene.globe.showGroundAtmosphere = true;
        scene.globe.maximumScreenSpaceError = 1.5;
        scene.screenSpaceCameraController.minimumZoomDistance = 150;
        scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;
        viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(OVERVIEW_VIEW.lon, OVERVIEW_VIEW.lat, OVERVIEW_VIEW.height) });

        // High-resolution imagery fades in when the camera gets close enough to see fields.
        const hiRes = viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: HIGH_RES_IMAGERY.url,
            maximumLevel: HIGH_RES_IMAGERY.maxLevel,
            credit: new Cesium.Credit(HIGH_RES_IMAGERY.credit),
            tileDiscardPolicy: new Cesium.DiscardMissingTileImagePolicy({
              missingImageUrl: HIGH_RES_IMAGERY.missingTileUrl,
              pixelsToCheck: [
                new Cesium.Cartesian2(0, 0),
                new Cesium.Cartesian2(120, 140),
                new Cesium.Cartesian2(130, 160),
                new Cesium.Cartesian2(200, 200),
                new Cesium.Cartesian2(200, 225),
              ],
              disableCheckIfAllPixelsAreTransparent: true,
            }),
          }),
        );
        const syncHiRes = () => {
          hiRes.show = viewer.camera.positionCartographic.height < HIGH_RES_IMAGERY.showBelowM;
        };
        syncHiRes();
        viewer.camera.percentageChanged = 0.1;
        viewer.camera.changed.addEventListener(syncHiRes);

        const markInteracted = () => {
          interactedRef.current = true;
        };
        viewer.canvas.addEventListener("pointerdown", markInteracted);
        viewer.canvas.addEventListener("wheel", markInteracted, { passive: true });

        scene.requestRender();
        registerMap({ Cesium, viewer });
        callbacks.current.onReady();
      })
      .catch((err: unknown) => {
        if (!disposed) callbacks.current.onError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      disposed = true;
      registerMap(null);
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, [registerMap]);

  // Slow idle rotation on the home screen until the user touches the globe.
  useEffect(() => {
    if (!spin || reducedMotion) return;
    interactedRef.current = false;
    let raf = 0;
    const tick = () => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (viewer && Cesium && !interactedRef.current && !viewer.isDestroyed()) {
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0007);
        viewer.scene.requestRender();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, reducedMotion]);

  return <div ref={containerRef} className="absolute inset-0" aria-label="Satellite map" role="application" />;
}
