export type Region =
  | "Downtown"
  | "West End"
  | "East End"
  | "Midtown"
  | "North York"
  | "Scarborough"
  | "Etobicoke";

export const REGIONS: Region[] = ["Downtown", "West End", "East End", "Midtown", "North York", "Scarborough", "Etobicoke"];

export interface Neighbourhood {
  name: string;
  slug: string;
  region: Region;
  /** Approximate neighbourhood centre (not a cafe location). */
  lat: number;
  lng: number;
  aliases?: string[];
}

export const NEIGHBOURHOODS: Neighbourhood[] = [
  { name: "Financial District", slug: "financial-district", region: "Downtown", lat: 43.6481, lng: -79.381, aliases: ["fidi", "bay street", "path"] },
  { name: "Entertainment District", slug: "entertainment-district", region: "Downtown", lat: 43.6456, lng: -79.39 },
  { name: "St. Lawrence", slug: "st-lawrence", region: "Downtown", lat: 43.6487, lng: -79.3716, aliases: ["old town", "st lawrence market"] },
  { name: "Corktown", slug: "corktown", region: "Downtown", lat: 43.6543, lng: -79.3595, aliases: ["king east"] },
  { name: "Distillery District", slug: "distillery-district", region: "Downtown", lat: 43.6503, lng: -79.3596, aliases: ["distillery"] },
  { name: "Downtown Yonge", slug: "downtown-yonge", region: "Downtown", lat: 43.6561, lng: -79.3802, aliases: ["yonge and dundas", "yonge & dundas"] },
  { name: "Bay & College", slug: "bay-college", region: "Downtown", lat: 43.6604, lng: -79.3857, aliases: ["discovery district"] },
  { name: "Church-Wellesley", slug: "church-wellesley", region: "Downtown", lat: 43.665, lng: -79.381, aliases: ["the village", "church street"] },
  { name: "St. James Town", slug: "st-james-town", region: "Downtown", lat: 43.6697, lng: -79.3738, aliases: ["st jamestown", "bloor east", "bloor and sherbourne", "sherbourne"] },
  { name: "Chinatown", slug: "chinatown", region: "Downtown", lat: 43.6529, lng: -79.398, aliases: ["spadina", "baldwin village"] },
  { name: "Kensington Market", slug: "kensington-market", region: "Downtown", lat: 43.6547, lng: -79.4005, aliases: ["kensington"] },
  { name: "Harbord Village", slug: "harbord-village", region: "Downtown", lat: 43.6615, lng: -79.4045, aliases: ["harbord"] },
  { name: "Queen West", slug: "queen-west", region: "Downtown", lat: 43.6487, lng: -79.3965, aliases: ["queen street west"] },
  { name: "King West", slug: "king-west", region: "Downtown", lat: 43.6443, lng: -79.4007 },
  { name: "Yorkville", slug: "yorkville", region: "Downtown", lat: 43.6709, lng: -79.3933, aliases: ["bloor-yorkville", "bloor yorkville"] },
  { name: "Cabbagetown", slug: "cabbagetown", region: "East End", lat: 43.6672, lng: -79.3652 },
  { name: "Riverside", slug: "riverside", region: "East End", lat: 43.6614, lng: -79.3468, aliases: ["riverdale", "broadview"] },
  { name: "Leslieville", slug: "leslieville", region: "East End", lat: 43.6629, lng: -79.3326, aliases: ["queen east"] },
  { name: "Danforth", slug: "danforth", region: "East End", lat: 43.6781, lng: -79.3489, aliases: ["greektown", "the danforth"] },
  { name: "The Beaches", slug: "the-beaches", region: "East End", lat: 43.6716, lng: -79.2968, aliases: ["beaches", "the beach"] },
  { name: "Trinity Bellwoods", slug: "trinity-bellwoods", region: "West End", lat: 43.6474, lng: -79.4137, aliases: ["west queen west"] },
  { name: "Ossington", slug: "ossington", region: "West End", lat: 43.6481, lng: -79.4205, aliases: ["ossington strip"] },
  { name: "Little Italy", slug: "little-italy", region: "West End", lat: 43.655, lng: -79.4155, aliases: ["college street"] },
  { name: "Little Portugal", slug: "little-portugal", region: "West End", lat: 43.6498, lng: -79.4295, aliases: ["dundas west"] },
  { name: "Liberty Village", slug: "liberty-village", region: "West End", lat: 43.6384, lng: -79.4201 },
  { name: "Roncesvalles", slug: "roncesvalles", region: "West End", lat: 43.6485, lng: -79.4491, aliases: ["roncy"] },
  { name: "The Junction", slug: "the-junction", region: "West End", lat: 43.6655, lng: -79.4683, aliases: ["junction"] },
  { name: "Brockton Village", slug: "brockton-village", region: "West End", lat: 43.6531, lng: -79.4385 },
  { name: "Koreatown", slug: "koreatown", region: "West End", lat: 43.664, lng: -79.4175, aliases: ["christie pits", "bloor west", "seaton village"] },
  { name: "The Annex", slug: "the-annex", region: "Midtown", lat: 43.6703, lng: -79.4048, aliases: ["annex"] },
  { name: "Dupont", slug: "dupont", region: "Midtown", lat: 43.6748, lng: -79.4255, aliases: ["davenport"] },
  { name: "Midtown", slug: "midtown", region: "Midtown", lat: 43.6985, lng: -79.3967, aliases: ["summerhill", "yonge and eglinton", "yonge & st clair", "deer park", "st clair west"] },
  { name: "North York", slug: "north-york", region: "North York", lat: 43.7678, lng: -79.4132, aliases: ["willowdale", "yonge and finch", "koreatown north"] },
  { name: "Scarborough", slug: "scarborough", region: "Scarborough", lat: 43.7764, lng: -79.2318 },
  { name: "Etobicoke", slug: "etobicoke", region: "Etobicoke", lat: 43.6205, lng: -79.5132, aliases: ["mimico", "lake shore", "long branch"] },
];

/** Neighbourhoods that get their own checkbox in the filter panel (spec order). */
export const FILTER_NEIGHBOURHOODS = [
  "Downtown",
  "Queen West",
  "Ossington",
  "Kensington Market",
  "Chinatown",
  "Yorkville",
  "Leslieville",
  "The Annex",
  "Distillery District",
  "Little Italy",
  "Danforth",
  "Other",
] as const;

const byName = new Map(NEIGHBOURHOODS.map((n) => [n.name.toLowerCase(), n]));
const bySlug = new Map(NEIGHBOURHOODS.map((n) => [n.slug, n]));

export function getNeighbourhood(name: string): Neighbourhood | undefined {
  return byName.get(name.toLowerCase());
}

export function getNeighbourhoodBySlug(slug: string): Neighbourhood | undefined {
  return bySlug.get(slug);
}

export function neighbourhoodSlug(name: string): string {
  return getNeighbourhood(name)?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function regionOf(name: string): Region | null {
  return getNeighbourhood(name)?.region ?? null;
}

/** Does a cafe's neighbourhood satisfy a filter value from FILTER_NEIGHBOURHOODS? */
export function matchesNeighbourhoodFilter(cafeNeighbourhood: string, filter: string): boolean {
  const n = cafeNeighbourhood.toLowerCase();
  if (filter === "Downtown") return regionOf(cafeNeighbourhood) === "Downtown";
  if (filter === "Other") {
    return !FILTER_NEIGHBOURHOODS.some((f) => f !== "Downtown" && f !== "Other" && f.toLowerCase() === n);
  }
  return filter.toLowerCase() === n;
}
