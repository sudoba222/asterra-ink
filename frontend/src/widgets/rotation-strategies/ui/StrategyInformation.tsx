import { ChevronDown, CircleHelp, ClipboardCheck, Lightbulb, Microscope, ThumbsUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RotationStrategy } from "@/entities/crop";

/**
 * The five information blocks. "Why suggested" starts open (it's the one-glance answer); the
 * rest are one tap away so three cards side by side stay readable.
 */
export function StrategyInformation({ strategy }: { strategy: RotationStrategy }) {
  return (
    <div className="divide-y divide-line">
      <Block icon={Lightbulb} title="Why suggested" count={strategy.why.length} defaultOpen>
        <Bullets items={strategy.why} />
      </Block>
      <Block icon={Microscope} title="Evidence" count={strategy.evidence.length}>
        {strategy.evidence.length ? (
          <ul className="space-y-2">
            {strategy.evidence.map((e) => (
              <li key={e.text}>
                <p className="text-ink">{e.text}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">Source: {e.source}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Block>
      <Block icon={ThumbsUp} title="Benefits" count={strategy.benefits.length}>
        <Bullets items={strategy.benefits} />
      </Block>
      <Block icon={CircleHelp} title="What we don’t know" count={strategy.gaps.length}>
        <Bullets items={strategy.gaps} />
      </Block>
      <Block icon={ClipboardCheck} title="Check locally" count={strategy.checkLocally.length}>
        {strategy.checkLocally.length ? (
          <ul className="space-y-1.5">
            {strategy.checkLocally.map((c) => (
              <li key={c} className="flex gap-2">
                <span className="mt-[3px] size-3 shrink-0 rounded-[3px] border border-ink-faint" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Block>
    </div>
  );
}

function Block({ icon: Icon, title, count, defaultOpen, children }: { icon: LucideIcon; title: string; count: number; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-2.5 text-[13px] font-medium text-ink outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-forest/60 [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 shrink-0 text-forest" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="rounded-full bg-mist px-1.5 text-[11px] leading-[18px] text-ink-muted tabular-nums" aria-label={`${count} item${count === 1 ? "" : "s"}`}>
          {count}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="pb-3 pl-6 text-[12.5px] leading-[1.5] text-ink-muted">{children}</div>
    </details>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <Empty />;
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-ink-faint">Nothing to add here.</p>;
}
