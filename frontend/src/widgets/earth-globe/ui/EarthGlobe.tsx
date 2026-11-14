"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

const GlobeViewer = dynamic(() => import("./GlobeViewer"), { ssr: false });

/**
 * Persistent 3D Earth. Client-only (Cesium touches window/WebGL), mounted once in
 * the explore layout so it survives navigation between routes.
 */
export function EarthGlobe({ spin }: { spin: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const onReady = useCallback(() => setStatus("ready"), []);
  const onError = useCallback((e: Error) => {
    setError(e.message);
    setStatus("error");
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* faint stars while Cesium loads (the 3D sky replaces them once the globe is ready) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-35 [background-image:radial-gradient(1px_1px_at_20%_30%,#fff_50%,transparent_51%),radial-gradient(1px_1px_at_70%_80%,#fff_50%,transparent_51%),radial-gradient(1px_1px_at_85%_20%,#dfe_50%,transparent_51%),radial-gradient(1px_1px_at_35%_75%,#fff_50%,transparent_51%),radial-gradient(1.5px_1.5px_at_55%_12%,#fff_50%,transparent_51%),radial-gradient(1px_1px_at_10%_85%,#fff_50%,transparent_51%)]"
      />
      {status !== "error" && (
        <motion.div
          key={attempt}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
          animate={{ opacity: status === "ready" ? 1 : 0, scale: status === "ready" || reduced ? 1 : 0.96 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlobeViewer spin={spin} reducedMotion={reduced} onReady={onReady} onError={onError} />
        </motion.div>
      )}

      <AnimatePresence>
        {status === "loading" && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
            role="status"
            aria-label="Loading 3D globe"
          >
            <div className="relative grid size-[min(52vmin,420px)] place-items-center">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#2a5a47,#10251e_70%)] opacity-70" />
              <div className="absolute inset-0 rounded-full ring-1 ring-lime/20" />
              <div className="absolute inset-[-6%] animate-[spin_6s_linear_infinite] rounded-full border border-transparent border-t-lime/50" />
              <p className="relative text-[12px] tracking-[0.2em] text-lime/70 uppercase">Loading Earth</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass max-w-sm rounded-2xl p-5 text-center text-white">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-white/10 text-lime">
              <AlertTriangle className="size-5" aria-hidden />
            </div>
            <p className="text-sm font-semibold">The 3D globe couldn’t start</p>
            <p className="mt-1 text-[13px] text-white/65">{error}</p>
            <p className="mt-1 text-[12px] text-white/45">Saved fields and their data are still available.</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStatus("loading");
                setAttempt((a) => a + 1);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-deep transition hover:bg-lime-strong"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
