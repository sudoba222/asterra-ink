"use client";

import { useSyncExternalStore } from "react";
import type { Field } from "../model/types";
import { fieldRepository } from "./field-repository";

const NO_FIELDS: Field[] = [];

/** Saved fields; server snapshot is empty (localStorage is browser-only). */
export function useFields(): Field[] {
  return useSyncExternalStore(fieldRepository.subscribe, fieldRepository.list, () => NO_FIELDS);
}

export function useField(id: string): { field: Field | null; ready: boolean } {
  const fields = useFields();
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return { field: fields.find((f) => f.id === id) ?? null, ready };
}
