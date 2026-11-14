"use client";

import { Check, Eraser, Hand, MousePointerClick, Undo2, X, ZoomIn } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatHectares, PROBLEM_TEXT } from "@/entities/field";
import { cn } from "@/shared/lib";
import { useFieldDraft } from "../model/field-draft-context";
import { ConfirmFieldDialog } from "./ConfirmFieldDialog";

/** Floating bottom bar while the farmer marks their field. */
export function DrawToolbar() {
  const d = useFieldDraft();
  const [confirming, setConfirming] = useState(false);
  const drawing = d.status === "drawing";
  const editing = d.status === "editing";
  const showProblem = editing && d.problem && d.problem !== "too-few-points";

  return (
    <>
      <AnimatePresence>
        {d.status !== "off" && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[620px] sm:bottom-6"
            role="toolbar"
            aria-label="Mark your field"
          >
            <div className="glass rounded-2xl p-3 text-white shadow-[var(--shadow-float)] max-sm:bg-[rgba(10,24,19,0.92)]">
              <div className="flex items-start gap-3 px-1">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime">
                  {d.tooFar ? <ZoomIn className="size-4" aria-hidden /> : drawing ? <MousePointerClick className="size-4" aria-hidden /> : <Hand className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1" aria-live="polite">
                  <p className="text-[14px] font-semibold">
                    {d.tooFar ? "Zoom in closer first" : drawing ? "Tap each corner of your field" : "Adjust the boundary"}
                  </p>
                  <p className="text-[12.5px] leading-5 text-white/60">
                    {d.tooFar
                      ? "Get close enough to see your field clearly, then tap its corners."
                      : drawing
                        ? d.vertices.length >= 3
                          ? "Tap the first corner (white) or press Finish to close the shape."
                          : `${d.vertices.length} of at least 3 corners marked.`
                        : "Drag a corner to move it. Drag a small white dot to add a corner. Double-click a corner to remove it."}
                  </p>
                </div>
                {d.vertices.length >= 3 && (
                  <span className="shrink-0 rounded-full bg-lime px-2.5 py-1 font-mono text-[13px] font-semibold text-deep tabular-nums">
                    {formatHectares(d.areaHa)}
                  </span>
                )}
              </div>

              {showProblem && <p className="mx-1 mt-2 rounded-lg bg-[#3a1d10]/70 px-3 py-2 text-[12.5px] text-[#ffc9a8]">{PROBLEM_TEXT[d.problem!]}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {drawing && (
                  <ToolButton onClick={d.undo} disabled={d.vertices.length === 0} icon={<Undo2 className="size-4" aria-hidden />}>
                    Undo
                  </ToolButton>
                )}
                <ToolButton onClick={d.clear} disabled={d.vertices.length === 0} icon={<Eraser className="size-4" aria-hidden />}>
                  Clear
                </ToolButton>
                <ToolButton onClick={d.cancel} icon={<X className="size-4" aria-hidden />}>
                  Cancel
                </ToolButton>
                <span className="flex-1" />
                {drawing ? (
                  <PrimaryButton onClick={d.finish} disabled={d.vertices.length < 3}>
                    Finish shape
                  </PrimaryButton>
                ) : (
                  <PrimaryButton onClick={() => setConfirming(true)} disabled={Boolean(d.problem)}>
                    <Check className="size-4" aria-hidden /> Confirm field
                  </PrimaryButton>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {confirming && editing && <ConfirmFieldDialog onClose={() => setConfirming(false)} />}
    </>
  );
}

function ToolButton({ children, icon, onClick, disabled }: { children: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-[13px] font-medium text-white/85 ring-1 ring-white/10 transition hover:bg-white/14 disabled:pointer-events-none disabled:opacity-35"
    >
      {icon}
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2 text-[13.5px] font-semibold text-deep transition hover:bg-lime-strong",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
