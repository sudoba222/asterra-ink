/** NASA POWER API root. Override with NASA_POWER_API_ROOT (e.g. to simulate an outage in testing). */
export function powerApiRoot(): string {
  return process.env.NASA_POWER_API_ROOT || "https://power.larc.nasa.gov/api/temporal";
}
