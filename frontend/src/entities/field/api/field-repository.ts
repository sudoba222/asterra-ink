import type { Field } from "../model/types";

/**
 * Storage boundary for fields. Today: this browser only (localStorage).
 * BACKEND INTEGRATION POINT: implement `FieldRepository` with fetch calls to
 * `GET/POST/DELETE /api/fields` (e.g. Postgres/PostGIS) and export it as `fieldRepository`.
 */
export interface FieldRepository {
  list(): Field[];
  get(id: string): Field | null;
  save(field: Field): void;
  remove(id: string): void;
  subscribe(listener: () => void): () => void;
}

const KEY = "asterra.fields.v1";
const listeners = new Set<() => void>();
let cache: Field[] | null = null;
let cacheRaw: string | null = null;

function read(): Field[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cacheRaw && cache) return cache;
    cacheRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as Field[]) : [];
    return cache;
  } catch {
    return cache ?? EMPTY;
  }
}

function write(fields: Field[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(fields));
  } catch {
    // storage blocked/full: keep in memory for this session
  }
  cache = fields;
  cacheRaw = null;
  listeners.forEach((l) => l());
}

const EMPTY: Field[] = [];

export const localFieldRepository: FieldRepository = {
  list: () => read(),
  get: (id) => read().find((f) => f.id === id) ?? null,
  save: (field) => write([field, ...read().filter((f) => f.id !== field.id)]),
  remove: (id) => write(read().filter((f) => f.id !== id)),
  subscribe(listener) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === KEY && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
};

export const fieldRepository: FieldRepository = localFieldRepository;

export function newFieldId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}
