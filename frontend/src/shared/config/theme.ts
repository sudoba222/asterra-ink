/**
 * Brand + data-viz tokens. Chart series colors were validated with the dataviz
 * palette validator (light surface): current #2A8460 vs comparison #D08A3C —
 * CVD ΔE 9.9, normal ΔE 22.2. The comparison color is below 3:1 contrast, so
 * every chart pairs it with a legend, direct end labels and tooltips.
 */
export const brand = {
  forest: "#173E32",
  dark: "#10251E",
  lime: "#C5E58A",
  background: "#F7F9F4",
  text: "#202820",
  muted: "#7A857B",
} as const;

export const chart = {
  current: "#2A8460",
  comparison: "#D08A3C",
  grid: "#E6EBE3",
  axis: "#9AA59B",
} as const;

/** Reserved status colors — always shipped with an icon + label. */
export const status = {
  good: "#2F8A4E",
  watch: "#B7791F",
  concern: "#C2410C",
  info: "#3B6E8F",
} as const;
