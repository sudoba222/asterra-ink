"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Droplet,
  FlaskConical,
  Info,
  Sprout,
  Wheat,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { CATALOG_VERSION, WEIGHTS, cropPhoto, type CandidateResult, type FarmerProfile, type RotationResult } from "@/entities/crop";
import { FarmerQuestionnaire } from "@/features/fill-farmer-questionnaire";
import { cn } from "@/shared/lib";
import { Badge, Card } from "@/shared/ui";

const STATUS = {
  suitable: { label: "Passes filters", icon: CheckCircle2, cls: "bg-[#E6F3EA] text-[#1F6B43] ring-good/15" },
  caution: { label: "Possible, with cautions", icon: AlertTriangle, cls: "bg-[#FBF1E0] text-[#8A5A12] ring-watch/20" },
  excluded: { label: "Filtered out", icon: XCircle, cls: "bg-[#FDECE2] text-[#9A3412] ring-concern/15" },
} as const;

/** Questionnaire + ranked candidates. State lives in the page so the PDF report sees the same answers. */
export function CropRotation({ farmer, onFarmerChange, result }: { farmer: FarmerProfile; onFarmerChange: (next: FarmerProfile) => void; result: RotationResult }) {
  const [showExcluded, setShowExcluded] = useState(false);
  const visible = result.candidates.filter((c) => c.status !== "excluded");
  const excluded = result.candidates.filter((c) => c.status === "excluded");

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <b className="font-semibold">Indicative — not validated agronomic advice.</b> Candidates are filtered with climate data for the analysis point and a
          small crop catalog (v{CATALOG_VERSION}, ranges summarised from FAO ECOCROP, pending agronomy review). Confirm with a local extension service.
        </p>
      </div>

      {/* Side by side only when this panel itself is wide enough for a 280px form + 420px results column. */}
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-4 @min-[45rem]:grid-cols-[minmax(280px,340px)_minmax(420px,1fr)]">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="size-4 text-forest" aria-hidden />
              <h3 className="text-[14px] font-semibold text-ink">About your field</h3>
            </div>
            <FarmerQuestionnaire value={farmer} onChange={onFarmerChange} />
          </Card>

          <div className="space-y-3">
            {(result.notes.length > 0 || result.missingData.length > 0) && (
              <Card tone="mist" className="space-y-3">
                {result.notes.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.notes.map((n) => (
                      <li key={n} className="flex gap-2 text-[12.5px] leading-5 text-ink">
                        <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden /> {n}
                      </li>
                    ))}
                  </ul>
                )}
                {result.missingData.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Needed for a stronger recommendation</p>
                    <ul className="space-y-1">
                      {result.missingData.map((m) => (
                        <li key={m} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden /> {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            <ul className="flex flex-col gap-3" aria-label="Crop candidates">
              <AnimatePresence initial={false}>
                {visible.map((c, i) => (
                  <CandidateRow key={c.crop.id} c={c} rank={i + 1} />
                ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-[13px] text-ink-muted">
                  No catalog crop passes the climate and water filters for these answers. Try marking the field as irrigated, or check the filtered-out list.
                </li>
              )}
            </ul>

            {excluded.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowExcluded((s) => !s)}
                  aria-expanded={showExcluded}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] font-medium text-ink-muted hover:text-ink"
                >
                  <ChevronDown className={cn("size-4 transition-transform", showExcluded && "rotate-180")} aria-hidden />
                  {excluded.length} filtered out
                </button>
                {showExcluded && (
                  <ul className="mt-3 flex flex-col gap-3">
                    {excluded.map((c) => (
                      <CandidateRow key={c.crop.id} c={c} />
                    ))}
                  </ul>
                )}
              </div>
            )}

            <details className="group rounded-2xl border border-line bg-surface px-4 py-3 text-[12.5px]">
              <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                <span className="inline-flex items-center gap-1.5">
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> How the ordering works
                </span>
              </summary>
              <p className="mt-2 text-ink-muted">
                Crops failing a hard limit (temperature or rainfall outside tolerated range) are filtered out. The rest are grouped by warnings and ordered by
                these documented points. There is no hidden model and no profit estimate.
              </p>
              <p className="mt-2 text-ink-muted">
                Rotation points come from three strategies — crop family (pest and disease breaks), nitrogen (legumes before and after nitrogen-hungry crops) and
                water efficiency (rainfed season rainfall vs. evapotranspiration from NASA POWER). Each factor is scored by one strategy only.
              </p>
              <table className="mt-2 w-full">
                <tbody>
                  {WEIGHTS.map((w) => (
                    <tr key={w.rule} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-ink">{w.rule}</td>
                      <td className="py-1.5 text-right font-mono text-ink">{w.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <PhotoCredits crops={result.candidates} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ c, rank }: { c: CandidateResult; rank?: number }) {
  const [open, setOpen] = useState(rank === 1);
  const bodyId = useId();
  const st = STATUS[c.status];
  const StatusIcon = st.icon;
  const muted = c.status === "excluded";
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      {/* @container: the header reflows on the card's own width, not the viewport's. */}
      <div
        className={cn(
          "@container rounded-2xl border border-black/5 bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none",
          muted && "opacity-80",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-start gap-3 rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-forest/60 focus-visible:ring-inset sm:p-5"
        >
          {rank !== undefined && (
            <span className="w-5 shrink-0 font-mono text-[12px] leading-6 text-ink-faint tabular-nums">{String(rank).padStart(2, "0")}</span>
          )}
          <CropThumb id={c.crop.id} name={c.crop.name} muted={muted} />
          {/* Narrow card: title / chips / badge. Wide card (≥28rem): title + badge on one line, then chips;
              the badge still drops under the title if the two don't fit side by side. */}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 basis-full text-[16px] leading-6 font-semibold break-words text-ink sm:text-[17px] @min-[28rem]:grow @min-[28rem]:basis-auto">
              {c.crop.name}
            </span>
            <span
              className={cn(
                "order-last inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset @min-[28rem]:order-none",
                st.cls,
              )}
            >
              <StatusIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{st.label}</span>
            </span>
            <span className="flex basis-full flex-wrap gap-1.5">
              <MetaChip icon={c.crop.family === "Poaceae" ? Wheat : Sprout} srLabel="Family">
                {c.crop.familyLabel}
              </MetaChip>
              <MetaChip icon={CalendarDays} srLabel="Season">
                {c.seasonLabel}
              </MetaChip>
              <MetaChip icon={Droplet} srLabel="Water need">
                {`${capitalize(c.crop.waterNeed)} water`}
              </MetaChip>
            </span>
          </span>
          <ChevronDown
            className={cn("mt-0.5 size-5 shrink-0 text-ink-faint transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {/* grid-rows 0fr → 1fr animates to the content's natural height; inert keeps the collapsed body out of tab order and the a11y tree. */}
        <div
          id={bodyId}
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mx-4 border-t border-black/5 pt-4 pb-4 sm:mx-5 sm:pb-5">
              <ul className="space-y-3">
                {c.checks.map((ch, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-[1.55]">
                    {ch.kind === "pass" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-label="Pass" />}
                    {ch.kind === "warn" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-watch" aria-label="Caution" />}
                    {ch.kind === "fail" && <XCircle className="mt-0.5 size-4 shrink-0 text-concern" aria-label="Fails" />}
                    {ch.kind === "note" && <Info className="mt-0.5 size-4 shrink-0 text-info" aria-label="Note" />}
                    <p className="min-w-0">
                      <span className="font-semibold text-ink">{ch.rule}</span> <span className="text-ink-muted">{ch.text}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone="neutral" className="rounded-lg px-2 py-1">
                  Score {c.score > 0 ? `+${c.score}` : c.score}
                </Badge>
                {c.components
                  ?.filter((p) => p.id !== "base" && p.weighted !== 0)
                  .map((p) => (
                    <Badge key={p.id} tone="derived" className="rounded-lg px-2 py-1">
                      {p.label} {p.weighted > 0 ? `+${p.weighted}` : p.weighted}
                    </Badge>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function MetaChip({ icon: Icon, srLabel, children }: { icon: LucideIcon; srLabel: string; children: string }) {
  // nowrap: a chip never breaks inside itself; on very narrow cards a long label ellipsizes (full text in the tooltip).
  return (
    <span title={children} className="inline-flex max-w-full items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[11.5px] leading-[18px] whitespace-nowrap text-ink/70">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">{srLabel}: </span>
      <span className="truncate">{children}</span>
    </span>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function CropThumb({ id, name, muted }: { id: string; name: string; muted: boolean }) {
  const photo = cropPhoto(id);
  const box = "size-14 shrink-0 rounded-xl border border-black/5 bg-mist";
  if (!photo) {
    return (
      <span className={cn(box, "grid place-items-center text-ink-faint")} aria-hidden>
        <Sprout className="size-5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized 160px WebP thumbnails; next/image adds no value here
    <img
      src={photo.src}
      alt={name}
      title={`Photo: ${photo.author}, ${photo.license}`}
      width={56}
      height={56}
      loading="lazy"
      decoding="async"
      className={cn(box, "object-cover", muted && "grayscale")}
    />
  );
}

function PhotoCredits({ crops }: { crops: CandidateResult[] }) {
  const credited = crops.flatMap((c) => {
    const photo = cropPhoto(c.crop.id);
    return photo ? [{ id: c.crop.id, name: c.crop.name, photo }] : [];
  });
  if (credited.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-line bg-surface px-4 py-3 text-[12.5px]">
      <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Photo credits
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-ink-muted">
        {credited.map(({ id, name, photo }) => (
          <li key={id}>
            <span className="text-ink">{name}</span> —{" "}
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              {photo.author}
            </a>
            , {photo.license}, via Wikimedia Commons
          </li>
        ))}
      </ul>
    </details>
  );
}
