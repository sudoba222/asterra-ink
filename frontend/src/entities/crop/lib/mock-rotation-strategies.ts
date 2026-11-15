import type { RotationStrategy } from "./compare-strategies";

/**
 * ILLUSTRATIVE sample data for the rotation-strategy screen and the PDF report.
 *
 * These three objects are NOT a recommendation and NOT agronomic research. They describe one
 * made-up field (maize last season, wheat before it, rain-fed, soil type not given) so the UI can
 * be built and reviewed before it is wired to the real `compareStrategies()`.
 *
 * Values are kept internally consistent with how `compareStrategies()` fills the contract
 * (season offsets, bare months, water class from the crops' catalog water need, etc.), so the
 * screen looks the same once real data flows in. Evidence sources say "(sample)" on purpose.
 */
export const MOCK_ROTATION_STRATEGIES: RotationStrategy[] = [
  {
    id: "current",
    title: "As now",
    available: true,
    seasons: [
      { cropId: "wheat", cropName: "Wheat", family: "Poaceae", plantMonth: 10, harvestMonth: 2, startOffset: 9, status: "suitable" },
      { cropId: "maize", cropName: "Maize (corn)", family: "Poaceae", plantMonth: 4, harvestMonth: 7, startOffset: 15, status: "caution" },
      { cropId: "wheat", cropName: "Wheat", family: "Poaceae", plantMonth: 10, harvestMonth: 2, startOffset: 21, status: "suitable" },
    ],
    fitsGoal: false,
    confidence: "high",
    confidenceReason: "High: you have grown these crops on this field before.",
    why: ["This is what you grew in the last two seasons, continued. It is the baseline to compare the other two with."],
    evidence: [
      { text: "Wheat: season temperature 16 °C is inside the ideal range (15–23 °C).", source: "NASA POWER (sample)" },
      { text: "Maize (corn) (Apr–Jul): rain covers 38 % of the water plants lose to evaporation (190 of 500 mm).", source: "NASA POWER (sample)" },
      { text: "Annual rainfall about 420 mm.", source: "NASA POWER (sample)" },
    ],
    benefits: [
      "No new seeds, equipment or buyers needed: you already know these crops.",
      "Wheat and maize leave a lot of residue: more organic matter and less erosion.",
    ],
    gaps: [
      "Local prices and buyers: we have no market data, so no strategy is ranked by profit.",
      "Soil test (texture, nutrients, salinity): soil checks were skipped.",
    ],
    checkLocally: [
      "The same crop family follows itself 3 times: watch for build-up of pests and soil diseases.",
      "Maize (corn): rain alone may not be enough in summer. Check that you can irrigate in Jun–Jul.",
      "Crop ranges are indicative (FAO ECOCROP), not checked for your district. Ask a local agronomist.",
    ],
    metrics: {
      water: "high",
      legumeSeasons: 0,
      familyRepeats: 3,
      climateFitSeasons: 2,
      bareMonths: 3,
      riskFlags: ["Maize (corn): water", "Maize (corn): heat"],
    },
  },
  {
    id: "water",
    title: "Water-saving",
    available: true,
    seasons: [
      { cropId: "chickpea", cropName: "Chickpea", family: "Fabaceae", plantMonth: 3, harvestMonth: 6, startOffset: 2, status: "suitable" },
      { cropId: "sorghum", cropName: "Sorghum", family: "Poaceae", plantMonth: 7, harvestMonth: 10, startOffset: 6, status: "suitable" },
      { cropId: "sunflower", cropName: "Sunflower", family: "Asteraceae", plantMonth: 4, harvestMonth: 7, startOffset: 15, status: "caution" },
    ],
    fitsGoal: false,
    confidence: "medium",
    confidenceReason: "Medium: soil type not given, and two of the three crops are new to this field.",
    why: [
      "Chooses crops with low water need that still pass the climate checks for your field.",
      "Changes crop family every season so pests of one crop don't build up.",
    ],
    evidence: [
      { text: "Sorghum (Jul–Oct): rain covers 61 % of the water plants lose to evaporation (230 of 380 mm).", source: "NASA POWER (sample)" },
      { text: "Chickpea: season temperature 18 °C is inside the ideal range (15–29 °C).", source: "NASA POWER (sample)" },
      { text: "Annual rainfall about 420 mm.", source: "NASA POWER (sample)" },
    ],
    benefits: [
      "Uses less water: Chickpea, Sorghum, Sunflower need little water.",
      "Adds nitrogen in 1 season (Chickpea), so the next crop needs less fertiliser.",
      "3 different crop families in 3 seasons break pest and disease cycles.",
      "Deep roots (Sorghum, Sunflower) loosen compacted soil and help water soak in.",
    ],
    gaps: [
      "Local prices and buyers: we have no market data, so no strategy is ranked by profit.",
      "Soil test (texture, nutrients, salinity): soil checks were skipped.",
      "How long the field stays wet after heavy rain: chickpea and sunflower don't like waterlogging.",
    ],
    checkLocally: [
      "Chickpea: sensitive to waterlogging. Avoid low spots where water stands after rain.",
      "Check that seed, equipment and buyers for Chickpea, Sorghum, Sunflower are available near you.",
      "Crop ranges are indicative (FAO ECOCROP), not checked for your district. Ask a local agronomist.",
    ],
    metrics: {
      water: "low",
      legumeSeasons: 1,
      familyRepeats: 0,
      climateFitSeasons: 3,
      bareMonths: 5,
      riskFlags: ["Chickpea: drainage", "Sorghum: dry months"],
    },
  },
  {
    id: "soil",
    title: "Soil-health",
    available: true,
    seasons: [
      { cropId: "soybean", cropName: "Soybean", family: "Fabaceae", plantMonth: 4, harvestMonth: 7, startOffset: 3, status: "suitable" },
      { cropId: "wheat", cropName: "Wheat", family: "Poaceae", plantMonth: 10, harvestMonth: 2, startOffset: 9, status: "suitable" },
      { cropId: "sunflower", cropName: "Sunflower", family: "Asteraceae", plantMonth: 4, harvestMonth: 7, startOffset: 15, status: "suitable" },
    ],
    fitsGoal: true,
    confidence: "medium",
    confidenceReason: "Medium: soil type not given, so soil checks were skipped.",
    why: [
      "Brings in a legume to add nitrogen, and keeps each crop family away until its rest period is over.",
      "Prefers crops with deep roots and a lot of residue, which build soil structure and organic matter.",
    ],
    evidence: [
      { text: "Soybean: season temperature 22 °C is inside the ideal range (20–33 °C).", source: "NASA POWER (sample)" },
      { text: "Field greenest point in the last 12 months: NDVI 0.46.", source: "Copernicus Sentinel-2 (sample)" },
      { text: "Annual rainfall about 420 mm.", source: "NASA POWER (sample)" },
    ],
    benefits: [
      "Adds nitrogen in 1 season (Soybean), so the next crop needs less fertiliser.",
      "3 different crop families in 3 seasons break pest and disease cycles.",
      "Deep roots (Sunflower) loosen compacted soil and help water soak in.",
      "Sow a cover crop in the bare months (Aug–Sep) to keep the soil covered.",
    ],
    gaps: [
      "Local prices and buyers: we have no market data, so no strategy is ranked by profit.",
      "Soil test (texture, nutrients, salinity): soil checks were skipped.",
      "How much nitrogen soybean really adds here: it depends on the soil and on inoculation.",
    ],
    checkLocally: [
      "Soybean: rain alone may be short in Jun–Jul. Check that you can give one or two irrigations.",
      "Check that seed, equipment and buyers for Soybean, Sunflower are available near you.",
      "Crop ranges are indicative (FAO ECOCROP), not checked for your district. Ask a local agronomist.",
    ],
    metrics: {
      water: "medium",
      legumeSeasons: 1,
      familyRepeats: 0,
      climateFitSeasons: 3,
      bareMonths: 3,
      riskFlags: ["Sunflower: drainage"],
    },
  },
];
