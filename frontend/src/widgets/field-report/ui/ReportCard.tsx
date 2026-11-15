"use client";

import { FileDown, Loader2 } from "lucide-react";

/** On-screen entry point at the end of the field page: prints the hidden FieldReport (→ "Save as PDF"). */
export function ReportCard({ fieldName, ready }: { fieldName: string; ready: boolean }) {
  const download = () => {
    const previous = document.title;
    // Browsers use the document title as the suggested PDF file name.
    document.title = `ASTERRA field report – ${fieldName} – ${new Date().toISOString().slice(0, 10)}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <section aria-labelledby="field-report" className="mt-6 flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <h2 id="field-report" className="text-[14px] font-semibold text-ink">
          Field report
        </h2>
        <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">
          Save this field’s conditions, weather and crop plan as a PDF to keep, print or share. Your questionnaire answers are included.
        </p>
      </div>
      <button
        type="button"
        onClick={download}
        disabled={!ready}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-forest px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {ready ? <FileDown className="size-4" aria-hidden /> : <Loader2 className="size-4 animate-spin" aria-hidden />}
        {ready ? "Download PDF report" : "Preparing report…"}
      </button>
    </section>
  );
}
