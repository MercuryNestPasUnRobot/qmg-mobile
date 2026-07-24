/**
 * PROTOTYPE ADAPTER DATA
 *
 * The source repository does not currently expose a browser-consumable domain
 * model. The map adapter below was transcribed from sources/map.png and checked
 * against the Second Edition and Total War rulebooks. It records spaces,
 * shared-border adjacency, map wrapping and controlled straits, but it remains
 * prototype data rather than a replacement for the Python domain/rules model.
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
  points: readonly MapPoint[];
  supply?: boolean;
  homeFor?: CountryId;
}

export interface MapPoint {
  x: number;
  y: number;
}

export type ConnectionKind = "border" | "strait";

export interface MapConnection {
  a: string;
  b: string;
  kind: ConnectionKind;
  controller?: string;
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
  { id: "canada", name: "加拿大", kind: "land", points: [{ x: 10.4, y: 18.4 }, { x: 97.1, y: 18.4 }] },
  { id: "united-states", name: "美国", kind: "land", points: [{ x: 10.7, y: 31.3 }, { x: 97.1, y: 31.3 }], supply: true, homeFor: "united-states" },
  { id: "latin-america", name: "拉丁美洲", kind: "land", points: [{ x: 16.6, y: 67.2 }] },
  { id: "iceland", name: "冰岛", kind: "land", points: [{ x: 26.2, y: 10.8 }] },
  { id: "united-kingdom", name: "不列颠群岛", kind: "land", points: [{ x: 29.4, y: 24.3 }], supply: true, homeFor: "united-kingdom" },
  { id: "western-europe", name: "西欧", kind: "land", points: [{ x: 31.2, y: 35.2 }], supply: true },
  { id: "germany", name: "德国", kind: "land", points: [{ x: 36.2, y: 30.7 }], supply: true, homeFor: "germany" },
  { id: "scandinavia", name: "斯堪的纳维亚", kind: "land", points: [{ x: 36.4, y: 14.7 }] },
  { id: "eastern-europe", name: "东欧", kind: "land", points: [{ x: 40.2, y: 25.5 }] },
  { id: "italy", name: "意大利", kind: "land", points: [{ x: 35.5, y: 39.3 }], supply: true, homeFor: "italy" },
  { id: "balkans", name: "巴尔干", kind: "land", points: [{ x: 40.5, y: 36.3 }] },
  { id: "north-africa", name: "非洲北部", kind: "land", points: [{ x: 38.9, y: 53.2 }] },
  { id: "south-africa", name: "非洲南部", kind: "land", points: [{ x: 34.5, y: 63.2 }] },
  { id: "moscow", name: "莫斯科", kind: "land", points: [{ x: 50.0, y: 23.7 }], supply: true, homeFor: "soviet-union" },
  { id: "ukraine", name: "乌克兰", kind: "land", points: [{ x: 44.6, y: 32.5 }], supply: true },
  { id: "russia", name: "俄罗斯地区", kind: "land", points: [{ x: 45.7, y: 14.9 }] },
  { id: "siberia", name: "西伯利亚", kind: "land", points: [{ x: 61.8, y: 14.7 }] },
  { id: "mongolia", name: "蒙古地区", kind: "land", points: [{ x: 66.0, y: 28.1 }] },
  { id: "kazakhstan", name: "哈萨克斯坦", kind: "land", points: [{ x: 55.2, y: 34.6 }] },
  { id: "middle-east", name: "中东", kind: "land", points: [{ x: 49.2, y: 46.2 }] },
  { id: "western-china", name: "中国西部", kind: "land", points: [{ x: 63.5, y: 41.0 }] },
  { id: "eastern-china", name: "中国东部", kind: "land", points: [{ x: 70.4, y: 42.1 }] },
  { id: "india", name: "印度", kind: "land", points: [{ x: 60.5, y: 52.6 }], supply: true },
  { id: "southeast-asia", name: "东南亚", kind: "land", points: [{ x: 67.4, y: 56.2 }] },
  { id: "japan", name: "日本", kind: "land", points: [{ x: 79.0, y: 38.4 }], supply: true, homeFor: "japan" },
  { id: "philippines", name: "菲律宾", kind: "land", points: [{ x: 75.4, y: 59.3 }] },
  { id: "indonesia", name: "印度尼西亚", kind: "land", points: [{ x: 69.7, y: 68.0 }] },
  { id: "new-guinea", name: "新几内亚", kind: "land", points: [{ x: 80.5, y: 68.0 }] },
  { id: "australia", name: "澳大利亚", kind: "land", points: [{ x: 76.0, y: 81.2 }], supply: true },
  { id: "madagascar", name: "马达加斯加", kind: "land", points: [{ x: 48.2, y: 78.1 }] },
  { id: "new-zealand", name: "新西兰", kind: "land", points: [{ x: 87.2, y: 91.0 }] },
  { id: "hawaii", name: "夏威夷", kind: "land", points: [{ x: 88.6, y: 48.5 }], supply: true },
  { id: "iwo-jima", name: "硫磺岛", kind: "land", points: [{ x: 82.1, y: 47.5 }] },

  { id: "north-atlantic", name: "北大西洋", kind: "sea", points: [{ x: 17.2, y: 41.4 }] },
  { id: "north-sea", name: "北海", kind: "sea", points: [{ x: 25.9, y: 32.8 }] },
  { id: "baltic-sea", name: "波罗的海", kind: "sea", points: [{ x: 36.5, y: 20.8 }] },
  { id: "black-sea", name: "黑海", kind: "sea", points: [{ x: 44.4, y: 37.7 }] },
  { id: "mediterranean", name: "地中海", kind: "sea", points: [{ x: 41.2, y: 45.5 }] },
  { id: "central-atlantic", name: "中大西洋", kind: "sea", points: [{ x: 27.1, y: 73.2 }] },
  { id: "south-atlantic", name: "南大西洋", kind: "sea", points: [{ x: 28.6, y: 90.0 }] },
  { id: "southeast-pacific", name: "东南太平洋", kind: "sea", points: [{ x: 10.9, y: 68.1 }] },
  { id: "north-pacific", name: "北太平洋", kind: "sea", points: [{ x: 87.6, y: 31.2 }] },
  { id: "east-pacific", name: "东太平洋", kind: "sea", points: [{ x: 92.5, y: 59.7 }] },
  { id: "central-pacific", name: "中太平洋", kind: "sea", points: [{ x: 83.4, y: 57.5 }] },
  { id: "south-pacific", name: "南太平洋", kind: "sea", points: [{ x: 83.1, y: 73.4 }] },
  { id: "sea-of-japan", name: "日本海", kind: "sea", points: [{ x: 76.0, y: 47.8 }] },
  { id: "south-china-sea", name: "南海", kind: "sea", points: [{ x: 71.7, y: 59.5 }] },
  { id: "bay-of-bengal", name: "孟加拉湾", kind: "sea", points: [{ x: 64.4, y: 62.3 }] },
  { id: "arabian-sea", name: "阿拉伯海", kind: "sea", points: [{ x: 55.0, y: 64.4 }] },
  { id: "indian-ocean", name: "印度洋", kind: "sea", points: [{ x: 61.8, y: 80.6 }] },
] as const;

function borders(a: string, ...others: string[]): MapConnection[] {
  return others.map((b) => ({ a, b, kind: "border" }));
}

/**
 * Shared borders are unconditional adjacency. Straits are the only conditional
 * sea-to-sea adjacency. The map clarification is deliberately represented:
 * Middle East/Balkans and Black Sea/Mediterranean are not connected.
 */
export const MAP_CONNECTIONS: readonly MapConnection[] = [
  ...borders("canada", "united-states", "north-atlantic", "north-pacific", "east-pacific"),
  ...borders("united-states", "latin-america", "north-atlantic", "east-pacific"),
  ...borders("latin-america", "north-atlantic", "central-atlantic", "south-atlantic", "southeast-pacific", "east-pacific"),
  ...borders("iceland", "north-atlantic", "north-sea"),
  ...borders("united-kingdom", "north-atlantic", "north-sea"),
  ...borders("western-europe", "germany", "italy", "north-atlantic", "north-sea", "mediterranean"),
  ...borders("germany", "eastern-europe", "italy", "balkans", "north-sea", "baltic-sea"),
  ...borders("scandinavia", "russia", "north-sea", "baltic-sea"),
  ...borders("eastern-europe", "balkans", "ukraine", "moscow", "russia", "baltic-sea", "black-sea"),
  ...borders("italy", "balkans", "mediterranean"),
  ...borders("balkans", "ukraine", "mediterranean", "black-sea"),
  ...borders("north-africa", "south-africa", "middle-east", "north-atlantic", "central-atlantic", "mediterranean"),
  ...borders("south-africa", "central-atlantic", "south-atlantic", "indian-ocean"),
  ...borders("moscow", "ukraine", "russia"),
  ...borders("ukraine", "russia", "kazakhstan", "black-sea"),
  ...borders("russia", "siberia", "mongolia", "kazakhstan"),
  ...borders("siberia", "mongolia", "eastern-china", "north-pacific", "sea-of-japan"),
  ...borders("mongolia", "kazakhstan", "western-china", "eastern-china"),
  ...borders("kazakhstan", "middle-east", "western-china", "india"),
  ...borders("middle-east", "india", "mediterranean", "arabian-sea"),
  ...borders("western-china", "eastern-china", "india"),
  ...borders("eastern-china", "india", "southeast-asia", "sea-of-japan", "south-china-sea"),
  ...borders("india", "southeast-asia", "arabian-sea", "bay-of-bengal", "indian-ocean"),
  ...borders("southeast-asia", "bay-of-bengal", "south-china-sea"),
  ...borders("japan", "north-pacific", "sea-of-japan"),
  ...borders("philippines", "sea-of-japan", "south-china-sea", "central-pacific"),
  ...borders("indonesia", "south-china-sea", "bay-of-bengal", "indian-ocean", "south-pacific"),
  ...borders("new-guinea", "central-pacific", "south-pacific"),
  ...borders("australia", "indian-ocean", "south-pacific"),
  ...borders("madagascar", "indian-ocean"),
  ...borders("new-zealand", "south-pacific"),
  ...borders("hawaii", "north-pacific", "east-pacific", "central-pacific"),
  ...borders("iwo-jima", "north-pacific", "sea-of-japan", "central-pacific"),

  ...borders("north-atlantic", "north-sea", "central-atlantic"),
  ...borders("central-atlantic", "south-atlantic"),
  ...borders("south-atlantic", "indian-ocean"),
  ...borders("north-pacific", "east-pacific", "central-pacific", "sea-of-japan"),
  ...borders("east-pacific", "central-pacific", "south-pacific", "southeast-pacific"),
  ...borders("central-pacific", "south-pacific", "sea-of-japan", "south-china-sea"),
  ...borders("south-pacific", "indian-ocean"),
  ...borders("sea-of-japan", "south-china-sea"),
  ...borders("arabian-sea", "indian-ocean"),
  ...borders("bay-of-bengal", "indian-ocean"),

  { a: "north-sea", b: "baltic-sea", kind: "strait", controller: "scandinavia" },
  { a: "north-atlantic", b: "mediterranean", kind: "strait", controller: "north-africa" },
  { a: "mediterranean", b: "arabian-sea", kind: "strait", controller: "middle-east" },
  { a: "bay-of-bengal", b: "south-china-sea", kind: "strait", controller: "southeast-asia" },
  { a: "north-atlantic", b: "southeast-pacific", kind: "strait", controller: "latin-america" },
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

export function connectionsForArea(id: string): MapConnection[] {
  areaById(id);
  return MAP_CONNECTIONS.filter((connection) => connection.a === id || connection.b === id);
}

export function otherEnd(connection: MapConnection, id: string): string {
  if (connection.a === id) return connection.b;
  if (connection.b === id) return connection.a;
  throw new Error(`${id} is not part of this connection`);
}

export function connectionBetween(a: string, b: string): MapConnection | undefined {
  return MAP_CONNECTIONS.find(
    (connection) => (connection.a === a && connection.b === b) || (connection.a === b && connection.b === a),
  );
}

export function connectionDisplayKind(connection: MapConnection): "land" | "sea" | "coast" | "strait" {
  if (connection.kind === "strait") return "strait";
  const a = areaById(connection.a);
  const b = areaById(connection.b);
  if (a.kind !== b.kind) return "coast";
  return a.kind;
}

export function countriesForFaction(faction: Faction): Country[] {
  return COUNTRIES.filter((country) => country.faction === faction);
}
