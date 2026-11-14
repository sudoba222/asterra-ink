"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Selecting a country = navigating to its dashboard; the globe reacts to the URL. */
export function useSelectCountry() {
  const router = useRouter();
  return useCallback(
    (iso3: string) => {
      router.push(`/country/${iso3.toUpperCase()}`, { scroll: false });
    },
    [router],
  );
}

export function useLeaveCountry() {
  const router = useRouter();
  return useCallback(() => router.push("/", { scroll: false }), [router]);
}
