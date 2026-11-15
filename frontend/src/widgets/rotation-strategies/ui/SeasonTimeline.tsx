import { AlertTriangle, Sprout } from "lucide-react";
import { bareMonthsAfter, cropPhoto, seasonWindow, type PlannedSeason } from "@/entities/crop";
import { cn } from "@/shared/lib";

/**
 * Three seasons as numbered tiles. Stacked in a narrow card (phone, or one of three desktop
 * columns); side by side once the card itself is wide (stacked cards on a tablet).
 */
export function SeasonTimeline({ seasons }: { seasons: PlannedSeason[] }) {
  return (
    <div className="@container">
      <ol className="grid grid-cols-1 gap-2 @min-[30rem]:grid-cols-3" aria-label="Crop sequence">
        {seasons.map((s, i) => {
          const w = seasonWindow(s);
          const bare = bareMonthsAfter(seasons, i);
          return (
            <li key={`${s.cropId}-${s.startOffset}`} className="flex flex-col rounded-xl border border-line bg-canvas px-3 py-2.5">
              <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid size-[18px] place-items-center rounded-full bg-forest text-[10px] font-semibold text-white" aria-hidden>
                    {i + 1}
                  </span>
                  Season {i + 1}
                </span>
                <span className="text-ink-faint">Year {w.year}</span>
              </p>
              <p className="mt-2 flex items-center gap-2">
                <CropThumb id={s.cropId} />
                <span className="min-w-0 text-[14px] leading-5 font-semibold break-words text-ink">{s.cropName}</span>
                {s.status === "caution" && (
                  <span title="Possible, with cautions" className="ml-auto shrink-0 text-watch">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    <span className="sr-only">Possible, with cautions</span>
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
                Plant <b className="font-semibold text-ink">{w.plant}</b> → harvest <b className="font-semibold text-ink">{w.harvest}</b>
              </p>
              {bare > 0 && (
                <p className="mt-auto pt-1 text-[11px] leading-4 text-ink-faint">
                  Then {bare} month{bare === 1 ? "" : "s"} bare
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CropThumb({ id }: { id: string }) {
  const photo = cropPhoto(id);
  const box = "size-8 shrink-0 rounded-lg border border-black/5 bg-mist";
  if (!photo)
    return (
      <span className={cn(box, "grid place-items-center text-ink-faint")} aria-hidden>
        <Sprout className="size-4" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- pre-sized 160px WebP thumbnails, same as the crop list
  return <img src={photo.src} alt="" title={`Photo: ${photo.author}, ${photo.license}`} width={32} height={32} loading="lazy" decoding="async" className={cn(box, "object-cover")} />;
}
