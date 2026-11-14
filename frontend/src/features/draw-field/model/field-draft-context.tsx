"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { areaHectares, validateField, type FieldProblem, type LonLat } from "@/entities/field";
import { useMap } from "@/entities/map";
import { FieldDrawController, type DrawStatus } from "../lib/draw-controller";

export interface DraftMeta {
  countryIso: string | null;
  regionName: string | null;
  districtName: string | null;
  cityName: string | null;
  /** Set when editing an existing saved field. */
  fieldId: string | null;
  fieldName: string | null;
}

interface FieldDraftState {
  /** "off" = not marking a field. */
  status: DrawStatus | "off";
  vertices: LonLat[];
  areaHa: number;
  problem: FieldProblem | null;
  meta: DraftMeta;
  tooFar: boolean;
  start: (meta?: Partial<DraftMeta>, initial?: LonLat[]) => void;
  undo: () => void;
  clear: () => void;
  finish: () => void;
  cancel: () => void;
}

const EMPTY_META: DraftMeta = { countryIso: null, regionName: null, districtName: null, cityName: null, fieldId: null, fieldName: null };
const Ctx = createContext<FieldDraftState | null>(null);

/** React state around the imperative FieldDrawController. Mounted once in the explore layout. */
export function FieldDraftProvider({ children }: { children: ReactNode }) {
  const map = useMap();
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<DrawStatus>("drawing");
  const [vertices, setVertices] = useState<LonLat[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(EMPTY_META);
  const [tooFar, setTooFar] = useState(false);
  const ctrl = useRef<FieldDrawController | null>(null);
  const tooFarTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialRef = useRef<LonLat[] | undefined>(undefined);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!active || !map) return;
    const c = new FieldDrawController(
      map,
      {
      onChange: (v, s) => {
        setVertices(v);
        setStatus(s);
      },
      onTooFar: () => {
        setTooFar(true);
        clearTimeout(tooFarTimer.current);
        tooFarTimer.current = setTimeout(() => setTooFar(false), 2500);
      },
      },
      initialRef.current,
    );
    ctrl.current = c;
    return () => {
      c.destroy();
      ctrl.current = null;
    };
  }, [active, map, session]);

  const start = useCallback((m?: Partial<DraftMeta>, initial?: LonLat[]) => {
    initialRef.current = initial;
    setMeta({ ...EMPTY_META, ...m });
    setVertices(initial ?? []);
    setStatus(initial && initial.length >= 3 ? "editing" : "drawing");
    setActive(true);
    setSession((n) => n + 1);
  }, []);
  const cancel = useCallback(() => {
    setActive(false);
    setVertices([]);
  }, []);
  const undo = useCallback(() => ctrl.current?.undo(), []);
  const clear = useCallback(() => ctrl.current?.clear(), []);
  const finish = useCallback(() => ctrl.current?.finish(), []);

  const value = useMemo<FieldDraftState>(() => {
    const areaHa = vertices.length >= 3 ? areaHectares(vertices) : 0;
    return {
      status: active ? status : "off",
      vertices,
      areaHa,
      problem: validateField(vertices),
      meta,
      tooFar,
      start,
      undo,
      clear,
      finish,
      cancel,
    };
  }, [active, status, vertices, meta, tooFar, start, undo, clear, finish, cancel]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFieldDraft(): FieldDraftState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFieldDraft must be used inside <FieldDraftProvider>");
  return v;
}
