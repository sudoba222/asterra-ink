import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCountries, getCountryCodes } from "@/entities/country/server";
import { FieldFinderScreen } from "@/views/field-finder";

export function generateStaticParams() {
  return getCountryCodes().map((iso) => ({ iso }));
}

function findCountry(iso: string) {
  const code = iso.toUpperCase();
  return getCountries().find((c) => c.iso3 === code) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/country/[iso]">): Promise<Metadata> {
  const { iso } = await params;
  const country = findCountry(iso);
  // Unknown codes render the not-found UI inside Suspense (status already streamed as 200 —
  // `dynamicParams` is unavailable with Cache Components), so keep them out of search indexes.
  if (!country) return { title: "Country not found", robots: { index: false } };
  return { title: `Find your field in ${country.name}` };
}

/** Params are resolved inside Suspense so navigation is instant. */
export default function CountryPage({ params }: PageProps<"/country/[iso]">) {
  return (
    <Suspense fallback={null}>
      <CountryFinder params={params} />
    </Suspense>
  );
}

async function CountryFinder({ params }: { params: PageProps<"/country/[iso]">["params"] }) {
  const { iso } = await params;
  const country = findCountry(iso);
  if (!country) notFound();
  return <FieldFinderScreen iso3={country.iso3} />;
}
