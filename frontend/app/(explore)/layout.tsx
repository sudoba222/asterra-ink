import { ExploreShell } from "@/app";
import { getCountries } from "@/entities/country/server";
import { ExplorationProvider } from "@/entities/exploration";
import { MapProvider } from "@/entities/map";
import { FieldDraftProvider } from "@/features/draw-field";

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  const countries = getCountries();
  return (
    <ExplorationProvider countries={countries}>
      <MapProvider>
        <FieldDraftProvider>
          <ExploreShell>{children}</ExploreShell>
        </FieldDraftProvider>
      </MapProvider>
    </ExplorationProvider>
  );
}
