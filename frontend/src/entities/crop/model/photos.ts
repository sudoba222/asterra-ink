/**
 * Crop thumbnails — freely licensed photos from Wikimedia Commons, center-cropped
 * to 160×160 WebP and bundled in /public/crops. Attribution is shown in the UI.
 */
export interface CropPhoto {
  src: string;
  author: string;
  license: string;
  /** Commons file page (original image, full licence terms). */
  sourceUrl: string;
}

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const CROP_PHOTOS: Record<string, CropPhoto> = {
  maize: { src: "/crops/maize.webp", author: "High Contrast", license: "CC BY 3.0 DE", sourceUrl: commons("Maize_field_in_Bavaria_in_Summer_2013.JPG") },
  wheat: { src: "/crops/wheat.webp", author: "ㇹヮィㇳ", license: "CC BY 2.0", sourceUrl: commons("Ears_of_Wheat_-_Aylesham,_Dover_district_of_Kent_-_England.jpg") },
  barley: { src: "/crops/barley.webp", author: "Lucash", license: "CC BY-SA 3.0", sourceUrl: commons("Barley_in_Slovenia.jpg") },
  sorghum: { src: "/crops/sorghum.webp", author: "Tomascastelazo", license: "CC BY-SA 3.0", sourceUrl: commons("Sorghum_field_in_Mexico.jpg") },
  soybean: { src: "/crops/soybean.webp", author: "United Soybean Board", license: "CC BY 2.0", sourceUrl: commons("Soybean_Plants_in_the_Field_(9624016022).jpg") },
  chickpea: { src: "/crops/chickpea.webp", author: "BotBln", license: "CC BY-SA 3.0", sourceUrl: commons("Cicer_arietinum_HabitusFruits_BotGardBln0906a.jpg") },
  alfalfa: { src: "/crops/alfalfa.webp", author: "Sten Porse", license: "CC BY-SA 3.0", sourceUrl: commons("Medicago-sativa-flowers.jpg") },
  sunflower: { src: "/crops/sunflower.webp", author: "Dietmar Rabich", license: "CC BY-SA 4.0", sourceUrl: commons("D%C3%BClmen,_Weddern,_Sonnenblumen_--_2026_--_2005.jpg") },
  cotton: { src: "/crops/cotton.webp", author: "Nanditha Gogate, WELL Labs", license: "CC BY-SA 4.0", sourceUrl: commons("Mature_cotton_boll_in_Raichur,_Karnataka.jpg") },
  potato: { src: "/crops/potato.webp", author: "Willem van Aken, CSIRO", license: "CC BY 3.0", sourceUrl: commons("CSIRO_ScienceImage_4062_Potato_plants_on_farm_near_Atherton_QLD.jpg") },
};

export function cropPhoto(id: string): CropPhoto | null {
  return CROP_PHOTOS[id] ?? null;
}
