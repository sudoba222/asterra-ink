"use client";

import type { ReactNode } from "react";
import {
  BUDGET_OPTIONS as BUDGETS,
  GOAL_OPTIONS as GOALS,
  HISTORY_OPTIONS,
  IRRIGATION_OPTIONS as IRRIGATION,
  ISSUE_OPTIONS as ISSUES,
  SOIL_OPTIONS as SOILS,
  type FarmerProfile,
} from "@/entities/crop";
import { cn, monthName } from "@/shared/lib";

interface Props {
  value: FarmerProfile;
  onChange: (next: FarmerProfile) => void;
}

/** The five-question farmer form from the project plan (+2 optional). Every question allows "unknown". */
export function FarmerQuestionnaire({ value, onChange }: Props) {
  const set = <K extends keyof FarmerProfile>(key: K, v: FarmerProfile[K]) => onChange({ ...value, [key]: v });

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()} aria-label="Farmer questionnaire">
      <Question n={1} title="What did you grow in the last two seasons?">
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
          {(["Last season", "Season before"] as const).map((label, i) => (
            <label key={label} className="block">
              <span className="mb-1 block text-[11.5px] text-ink-muted">{label}</span>
              <select
                value={value.previousCrops[i]}
                onChange={(e) => {
                  const next: [string, string] = [...value.previousCrops] as [string, string];
                  next[i] = e.target.value;
                  set("previousCrops", next);
                }}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-forest/40 focus:ring-2 focus:ring-lime/60"
              >
                <option value="">Select…</option>
                <option value="unknown">Don’t know</option>
                {HISTORY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Question>

      <Question n={2} title="How is the field watered?">
        <Chips options={IRRIGATION} value={value.irrigation} onChange={(v) => set("irrigation", v)} />
      </Question>

      <Question n={3} title="When do you plan to plant?">
        <select
          value={value.plantingMonth ?? ""}
          onChange={(e) => set("plantingMonth", e.target.value ? Number(e.target.value) : null)}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-forest/40 focus:ring-2 focus:ring-lime/60 @lg:w-60"
        >
          <option value="">Not decided yet</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {monthName(i)}
            </option>
          ))}
        </select>
      </Question>

      <Question n={4} title="What matters most?">
        <Chips options={GOALS} value={value.goal} onChange={(v) => set("goal", v)} />
      </Question>

      <Question n={5} title="Any pests, diseases, poor yields or soil problems?">
        <div className="flex flex-wrap gap-1.5">
          {ISSUES.map((o) => {
            const on = value.issues.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => set("issues", on ? value.issues.filter((x) => x !== o.value) : [...value.issues, o.value])}
                className={chipClass(on)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {(value.issues.includes("pests") || value.issues.includes("disease")) && (
          <input
            type="text"
            value={value.issueDetail}
            onChange={(e) => set("issueDetail", e.target.value)}
            placeholder="Which pest or disease? (e.g. corn rootworm)"
            className="mt-2 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-forest/40 focus:ring-2 focus:ring-lime/60"
          />
        )}
      </Question>

      <div className="grid gap-5 border-t border-line pt-4 @lg:grid-cols-2">
        <Question title="Soil type" optional>
          <Chips options={SOILS} value={value.soilType} onChange={(v) => set("soilType", v)} />
        </Question>
        <Question title="Budget" optional>
          <Chips options={BUDGETS} value={value.budget} onChange={(v) => set("budget", v)} />
        </Question>
      </div>
    </form>
  );
}

function Question({ n, title, optional, children }: { n?: number; title: string; optional?: boolean; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-[13px] font-medium text-ink">
        {n && <span className="grid size-5 place-items-center rounded-full bg-forest text-[10.5px] font-semibold text-lime">{n}</span>}
        {title}
        {optional && <span className="text-[11px] font-normal text-ink-faint">optional</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function chipClass(on: boolean) {
  return cn(
    "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-lime",
    on ? "border-forest bg-forest text-white" : "border-line bg-surface text-ink-muted hover:border-forest/30 hover:text-ink",
  );
}

function Chips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={chipClass(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
