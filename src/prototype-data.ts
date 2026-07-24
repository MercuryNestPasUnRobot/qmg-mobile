/**
 * PROTOTYPE ADAPTER DATA
 *
 * The source repository does not currently expose a browser-consumable domain
 * model. This deliberately small dataset supports the pass-and-play prototype;
 * it is not a complete or authoritative implementation of the board game's
 * map, card list, setup, or rules.
 */

export type Faction = "axis" | "allies";
export type CountryId =
  | "germany"
  | "italy"
  | "japan"
  | "united-kingdom"
  | "soviet-union"
  | "united-states";
export type AreaKind = "land" | "sea";
export type UnitKind = "army" | "navy";

export interface Country {
  id: CountryId;
  name: string;
  shortName: string;
  faction: Faction;
  color: string;
}

export interface Area {
  id: string;
  name: string;
  kind: AreaKind;
  neighbors: string[];
}

export interface PrototypeCardDefinition {
  name: string;
  type: "build" | "event" | "response" | "status";
}

export const FACTION_NAMES: Record<Faction, string> = {
  axis: "Axis 轴心国",
  allies: "Allies 同盟国",
};

export const COUNTRIES: readonly Country[] = [
  { id: "germany", name: "德国", shortName: "德", faction: "axis", color: "#a9aca5" },
  { id: "united-kingdom", name: "英国", shortName: "英", faction: "allies", color: "#d7ad58" },
  { id: "japan", name: "日本", shortName: "日", faction: "axis", color: "#d46f5d" },
  { id: "soviet-union", name: "苏联", shortName: "苏", faction: "allies", color: "#b54f4c" },
  { id: "italy", name: "意大利", shortName: "意", faction: "axis", color: "#83a279" },
  { id: "united-states", name: "美国", shortName: "美", faction: "allies", color: "#6f91bd" },
] as const;

export const TURN_ORDER: readonly CountryId[] = COUNTRIES.map((country) => country.id);

export const AREAS: readonly Area[] = [
  { id: "western-europe", name: "西欧", kind: "land", neighbors: ["eastern-europe", "mediterranean", "atlantic"] },
  { id: "eastern-europe", name: "东欧", kind: "land", neighbors: ["western-europe", "russia", "balkans", "mediterranean"] },
  { id: "russia", name: "俄罗斯", kind: "land", neighbors: ["eastern-europe", "central-asia", "arctic"] },
  { id: "balkans", name: "巴尔干", kind: "land", neighbors: ["eastern-europe", "middle-east", "mediterranean"] },
  { id: "middle-east", name: "中东", kind: "land", neighbors: ["balkans", "india", "indian-ocean", "mediterranean"] },
  { id: "india", name: "印度", kind: "land", neighbors: ["middle-east", "china", "southeast-asia", "indian-ocean"] },
  { id: "china", name: "中国", kind: "land", neighbors: ["india", "central-asia", "japan", "southeast-asia"] },
  { id: "central-asia", name: "中亚", kind: "land", neighbors: ["russia", "china"] },
  { id: "japan", name: "日本列岛", kind: "land", neighbors: ["china", "pacific"] },
  { id: "southeast-asia", name: "东南亚", kind: "land", neighbors: ["china", "india", "indian-ocean", "pacific"] },
  { id: "atlantic", name: "大西洋", kind: "sea", neighbors: ["western-europe", "mediterranean", "arctic", "pacific"] },
  { id: "mediterranean", name: "地中海", kind: "sea", neighbors: ["western-europe", "eastern-europe", "balkans", "middle-east", "atlantic", "indian-ocean"] },
  { id: "indian-ocean", name: "印度洋", kind: "sea", neighbors: ["middle-east", "india", "southeast-asia", "mediterranean", "pacific"] },
  { id: "pacific", name: "太平洋", kind: "sea", neighbors: ["japan", "southeast-asia", "indian-ocean", "atlantic", "arctic"] },
  { id: "arctic", name: "北冰洋", kind: "sea", neighbors: ["russia", "atlantic", "pacific"] },
] as const;

const COMMON_CARDS: readonly PrototypeCardDefinition[] = [
  { name: "紧急动员", type: "build" },
  { name: "战略预备队", type: "build" },
  { name: "补给线", type: "status" },
  { name: "先发制人", type: "event" },
  { name: "反击", type: "response" },
  { name: "工业生产", type: "status" },
  { name: "战区调动", type: "event" },
  { name: "坚守阵地", type: "response" },
] as const;

export function prototypeCardsFor(country: Country): PrototypeCardDefinition[] {
  return COMMON_CARDS.map((card, index) => ({
    ...card,
    name: `${country.shortName} · ${card.name}`,
    type: index === 0 ? "build" : card.type,
  }));
}

export function countryById(id: CountryId): Country {
  const country = COUNTRIES.find((candidate) => candidate.id === id);
  if (!country) throw new Error(`Unknown country: ${id}`);
  return country;
}

export function areaById(id: string): Area {
  const area = AREAS.find((candidate) => candidate.id === id);
  if (!area) throw new Error(`Unknown area: ${id}`);
  return area;
}

export function countriesForFaction(faction: Faction): Country[] {
  return COUNTRIES.filter((country) => country.faction === faction);
}
