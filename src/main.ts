import "./styles.css";
import { type Card, type CardType, type GameAction, type UnitStack } from "./game";
import {
  AREAS,
  COUNTRIES,
  TURN_ORDER,
  areaById,
  connectionDisplayKind,
  connectionsForArea,
  countriesForFaction,
  countryById,
  otherEnd,
  type CountryId,
  type Faction,
  type MapConnection,
  type MapPoint,
  type UnitKind,
} from "./prototype-data";
import { GameStore } from "./store";

type ViewId = "board" | "log" | "save";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("App root not found");
const app: HTMLDivElement = appElement;

const store = new GameStore(window.localStorage);
const MAP_ZOOM_LEVELS = [600, 740, 880, 1020, 1160, 1300, 1440] as const;
let currentView: ViewId = "board";
let showStartScreen = true;
let selectedAreaId = "germany";
let mapZoomIndex = 3;
let mapWidth: number = MAP_ZOOM_LEVELS[mapZoomIndex]!;
let mapScrollLeft = 190;
let handCountryId: CountryId = countriesForFaction(store.state.activeFaction)[0]!.id;
let selectedCardId: string | null = null;
let unitCountryId: CountryId = handCountryId;
let selectedUnitKind: UnitKind = "army";
let cardPanelMode: "deck" | "discard" | "custom" | null = null;
let cardSearch = "";
let toastMessage = "";
let toastTimer: number | undefined;
const scrollMemory = new Map<string, { left: number; top: number }>();

const CARD_TYPE_NAMES: Record<CardType, string> = {
  build: "建军",
  "build-army": "建设陆军",
  "build-navy": "建设海军",
  "land-battle": "陆战",
  "sea-battle": "海战",
  economic: "经济战",
  event: "事件",
  response: "响应",
  status: "持续",
  "air-power": "空中力量",
  bolster: "增强",
  other: "其他",
};

const VIEW_ITEMS: ReadonlyArray<{ id: ViewId; icon: string; label: string }> = [
  { id: "board", icon: "⌖", label: "战局" },
  { id: "log", icon: "≡", label: "日志" },
  { id: "save", icon: "↥", label: "存档" },
];

const MAP_IMAGE_URL = `${import.meta.env.BASE_URL}qmg-map.png`;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function showToast(message: string): void {
  toastMessage = message;
  window.clearTimeout(toastTimer);
  render();
  toastTimer = window.setTimeout(() => {
    toastMessage = "";
    render();
  }, 2400);
}

function execute(action: GameAction, success?: string): void {
  try {
    store.execute(action);
    showToast(success ?? "已记录");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "操作失败");
  }
}

function factionBadge(faction: Faction): string {
  return `<span class="faction-badge faction-badge--${faction}">${faction === "axis" ? "AXIS" : "ALLIES"}</span>`;
}

function renderHeader(): string {
  const state = store.state;
  const turnCountry = countryById(state.turnCountry);
  return `
    <header class="tactical-header">
      <div class="tactical-brand">
        <span>QMG</span>
        <strong>战场军需官</strong>
      </div>
      <div class="turn-identity">
        <span>R${state.turnNumber}</span>
        <strong><i style="--country-color:${turnCountry.color}"></i>${turnCountry.shortName}</strong>
        ${factionBadge(state.activeFaction)}
      </div>
      <div class="compact-turn-controls">
        <select id="turn-country" aria-label="回合国家">
          ${COUNTRIES.map(
            (country) =>
              `<option value="${country.id}" ${country.id === state.turnCountry ? "selected" : ""}>${country.name}</option>`,
          ).join("")}
        </select>
      </div>
      <div class="score-strip score-strip--compact" aria-label="胜利点">
        ${(["axis", "allies"] as const)
          .map(
            (faction) => `
              <article class="score-chip score-chip--${faction}">
                <span>${faction === "axis" ? "AXIS" : "ALLIES"}</span>
                <strong>${state.victoryPoints[faction]}</strong>
                <div>
                  <button data-action="adjust-vp" data-faction="${faction}" data-amount="-1" aria-label="${faction}减一分">−</button>
                  <button data-action="adjust-vp" data-faction="${faction}" data-amount="1" aria-label="${faction}加一分">＋</button>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="switcher switcher--compact" aria-label="查看阵营">
        <button class="${state.activeFaction === "axis" ? "is-active" : ""}" data-action="switch-faction" data-faction="axis">Axis</button>
        <button class="${state.activeFaction === "allies" ? "is-active" : ""}" data-action="switch-faction" data-faction="allies">Allies</button>
      </div>
      <div class="header-actions">
        <button class="icon-button" data-action="change-view" data-view="board" aria-label="返回战局" title="战局">⌖</button>
        <button class="icon-button" data-action="change-view" data-view="log" aria-label="日志" title="日志">≡</button>
        <button class="icon-button" data-action="change-view" data-view="save" aria-label="存档" title="存档">↥</button>
        <button class="icon-button" data-action="undo" ${store.canUndo() ? "" : "disabled"} aria-label="撤销上一步" title="撤销">↶</button>
        <button class="icon-button" data-action="new-game" aria-label="新游戏" title="新游戏">＋</button>
        <button class="button button--turn" data-action="end-turn">结束回合 →</button>
      </div>
    </header>
  `;
}

function unitName(kind: UnitKind): string {
  if (kind === "army") return "陆军";
  if (kind === "navy") return "海军";
  return "空军";
}

function unitIcon(kind: UnitKind): string {
  if (kind === "army") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14l-1.6-6.4A5.6 5.6 0 0 0 12 8a5.6 5.6 0 0 0-5.4 4.6L5 19Zm7-12V4m-3 2h6"/></svg>';
  }
  if (kind === "navy") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15h18l-3 5H7l-4-5Zm5-1V8h8v6m-5-6V4h3v4"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 13 7-2 2-8 2 8 7 2-7 2-2 6-2-6-7-2Z"/></svg>';
}

function renderUnitStack(stack: UnitStack): string {
  const country = countryById(stack.countryId);
  return `
    <span class="unit-chip" style="--unit-color:${country.color}">
      <span class="unit-chip__icon">${unitIcon(stack.kind)}</span>
      ${country.shortName} ${unitName(stack.kind)} ×${stack.count}
    </span>
  `;
}

function renderMapToken(stack: UnitStack): string {
  const country = countryById(stack.countryId);
  return `
    <span class="map-token map-token--${stack.kind}" style="--token-color:${country.color}" title="${country.name}${unitName(stack.kind)} ×${stack.count}">
      ${unitIcon(stack.kind)}
      ${stack.count > 1 ? `<b>${stack.count}</b>` : ""}
    </span>
  `;
}

function renderAreaDetail(): string {
  const state = store.state;
  const definition = areaById(selectedAreaId);
  const area = state.areas[selectedAreaId]!;
  const compatibleKind: UnitKind = definition.kind === "land" ? "army" : "navy";
  const visibleCountries = countriesForFaction(state.activeFaction);
  if (!visibleCountries.some((country) => country.id === unitCountryId)) unitCountryId = visibleCountries[0]!.id;
  if (selectedUnitKind !== "air-force" && selectedUnitKind !== compatibleKind) selectedUnitKind = compatibleKind;
  const stacks = area.units;

  return `
    <section class="area-command" aria-label="${definition.name}单位操作">
      <div class="area-command__title">
        <span>${definition.kind === "land" ? "陆地" : "海域"}</span>
        <strong>${definition.name}${definition.supply ? " ★" : ""}</strong>
        <b>${stacks.reduce((sum, stack) => sum + stack.count, 0)}</b>
      </div>
      <div class="inline-picker inline-picker--countries" aria-label="放置单位国家">
        ${visibleCountries
          .map(
            (country) => `
              <button class="${unitCountryId === country.id ? "is-active" : ""}" data-action="select-unit-country" data-country-id="${country.id}" style="--country-color:${country.color}">
                ${country.shortName}
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="inline-picker inline-picker--units" aria-label="选择兵种">
        ${([compatibleKind, "air-force"] as UnitKind[])
          .map(
            (kind) => `
              <button class="${selectedUnitKind === kind ? "is-active" : ""}" data-action="select-unit-kind" data-unit-kind="${kind}">
                ${unitIcon(kind)}<span>${unitName(kind)}</span>
              </button>
            `,
          )
          .join("")}
        <button class="quick-place" data-action="quick-place-unit" aria-label="在${definition.name}放置${unitName(selectedUnitKind)}">＋ 放置</button>
      </div>
      <div class="unit-strip" data-scroll-key="unit-strip">
        ${
          stacks.length
            ? stacks
                .map(
                  (stack) => `
                    <button class="unit-remove-chip" data-action="quick-remove-unit" data-country-id="${stack.countryId}" data-unit-kind="${stack.kind}" title="移除1支${countryById(stack.countryId).name}${unitName(stack.kind)}">
                      ${renderUnitStack(stack)}<b>−</b>
                    </button>
                  `,
                )
                .join("")
            : '<span class="empty-inline">点“放置”加入棋子</span>'
        }
      </div>
    </section>
  `;
}

function closestPoints(a: readonly MapPoint[], b: readonly MapPoint[]): [MapPoint, MapPoint] {
  let best: [MapPoint, MapPoint] = [a[0]!, b[0]!];
  let distance = Number.POSITIVE_INFINITY;
  for (const first of a) {
    for (const second of b) {
      const candidate = (first.x - second.x) ** 2 + (first.y - second.y) ** 2;
      if (candidate < distance) {
        best = [first, second];
        distance = candidate;
      }
    }
  }
  return best;
}

function renderConnectionLine(connection: MapConnection): string {
  const a = areaById(connection.a);
  const b = areaById(connection.b);
  const [from, to] = closestPoints(a.points, b.points);
  const displayKind = connectionDisplayKind(connection);
  return `<line class="map-link map-link--${displayKind}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
}

function renderMapNode(areaId: string, point: MapPoint, duplicateIndex: number): string {
  const definition = areaById(areaId);
  const area = store.state.areas[areaId]!;
  const units = area.units.reduce((sum, stack) => sum + stack.count, 0);
  const selected = areaId === selectedAreaId;
  const neighboring = connectionsForArea(selectedAreaId).some(
    (connection) => otherEnd(connection, selectedAreaId) === areaId,
  );
  return `
    <button
      class="map-node map-node--${definition.kind} ${selected ? "is-selected" : ""} ${neighboring ? "is-neighbor" : ""}"
      style="--map-x:${point.x}%;--map-y:${point.y}%"
      data-action="select-area"
      data-area-id="${definition.id}"
      data-map-node="${definition.id}-${duplicateIndex}"
      aria-label="${definition.name}${units ? `，${units}个单位` : ""}"
      title="${definition.name}"
    >
      <span class="map-node__symbol" aria-hidden="true">${definition.kind === "land" ? "▲" : "◆"}</span>
      <span class="map-node__name">${definition.name}</span>
      ${definition.supply ? '<span class="map-node__supply" aria-label="补给区域">★</span>' : ""}
      ${area.units.length ? `<span class="map-node__tokens">${area.units.map(renderMapToken).join("")}</span>` : ""}
    </button>
  `;
}

function renderMap(): string {
  const selectedConnections = connectionsForArea(selectedAreaId);
  return `
    <section class="battle-map-pane">
      <div class="map-commandbar">
        <div>
          <strong>世界战区</strong>
          <span>点选区域放置或移除单位</span>
        </div>
        <div class="map-legend map-legend--routes">
          <span><i class="legend-swatch legend-swatch--land"></i>陆</span>
          <span><i class="legend-swatch legend-swatch--sea"></i>海</span>
          <span><i class="legend-swatch legend-swatch--strait"></i>海峡</span>
        </div>
        <div class="map-tools" aria-label="地图大小">
          <div class="map-width-control" aria-label="地图内容缩放">
            <span>缩放</span>
            <button class="icon-button icon-button--small" data-action="map-zoom-step" data-delta="-1" aria-label="缩小地图">−</button>
            <button class="icon-button icon-button--small" data-action="map-zoom-fit" aria-label="地图适应宽度">适</button>
            <button class="icon-button icon-button--small" data-action="map-zoom-step" data-delta="1" aria-label="放大地图">＋</button>
          </div>
        </div>
      </div>
      <div class="map-stage">
        <div class="map-viewport" tabindex="0" aria-label="可横向拖动的世界地图">
          <div class="map-canvas ${mapWidth === 0 ? "map-canvas--fit" : ""}" style="width:${mapWidth === 0 ? "100%" : `${mapWidth}px`}">
            <img class="map-image" src="${MAP_IMAGE_URL}" width="3366" height="1803" alt="Quartermaster General 世界地图" draggable="false" />
            <svg class="map-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              ${selectedConnections.map(renderConnectionLine).join("")}
            </svg>
            ${AREAS.flatMap((definition) =>
              definition.points.map((point, index) => renderMapNode(definition.id, point, index)),
            ).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function cardImageUrl(card: Card): string {
  return card.image ? `${import.meta.env.BASE_URL}${card.image}` : "";
}

function renderCardFace(card: Card, className: string): string {
  const image = cardImageUrl(card);
  if (image) {
    return `<img class="${className}" src="${image}" width="384" height="512" loading="lazy" alt="${escapeHtml(card.name)}牌面" />`;
  }
  return `
    <div class="${className} card-face-placeholder" style="--card-country:${countryById(card.countryId).color}">
      <span>${CARD_TYPE_NAMES[card.type]}</span>
      <strong>${escapeHtml(card.name)}</strong>
    </div>
  `;
}

function renderCardInspector(card: Card, countryId: CountryId): string {
  const zones = store.state.cardZones[countryId];
  const inHand = zones.hand.includes(card.id);
  const inStatus = zones.status.includes(card.id);
  const inResponse = zones.response.includes(card.id);
  const zone = inHand
    ? "手牌"
    : inStatus
      ? "状态栏"
      : inResponse
        ? "响应栏"
        : zones.discard.includes(card.id)
          ? "弃牌堆"
          : zones.deck.includes(card.id)
            ? "牌堆"
            : "自定义";
  return `
    <article class="card-inspector card-inspector--rail panel" style="--country-color:${countryById(card.countryId).color}">
      <div class="card-inspector__image">${renderCardFace(card, "card-face-large")}</div>
      <div class="card-inspector__copy">
        <div class="card-meta">
          <span>${CARD_TYPE_NAMES[card.type]}</span>
          <span>${card.edition === "total-war" ? "TOTAL WAR" : card.edition === "base" ? "基础版" : "自定义"}</span>
          <span>${zone}</span>
        </div>
        <h3>${escapeHtml(card.name)}</h3>
        <div class="card-effect">
          <span>技能描述</span>
          <p>${escapeHtml(card.description)}</p>
        </div>
        <div class="card-action-row">
          ${
            inHand && (card.type === "status" || card.type === "bolster")
              ? `<button class="button button--slot" data-action="play-card-slot" data-slot="status" data-country-id="${countryId}" data-card-id="${card.id}">放入状态栏</button>`
              : ""
          }
          ${
            inHand && card.type === "response"
              ? `<button class="button button--slot" data-action="play-card-slot" data-slot="response" data-country-id="${countryId}" data-card-id="${card.id}">放入响应栏</button>`
              : ""
          }
          ${
            inHand
              ? `<button class="button button--danger" data-action="discard-card" data-country-id="${countryId}" data-card-id="${card.id}">弃置</button>`
              : ""
          }
          ${
            inStatus || inResponse
              ? `
                <button class="button" data-action="return-slot-card" data-slot="${inStatus ? "status" : "response"}" data-country-id="${countryId}" data-card-id="${card.id}">收回</button>
                <button class="button button--danger" data-action="resolve-slot-card" data-slot="${inStatus ? "status" : "response"}" data-country-id="${countryId}" data-card-id="${card.id}">结算弃置</button>
              `
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderHandCard(card: Card, countryId: CountryId): string {
  return `
    <button class="hand-card ${selectedCardId === card.id ? "is-selected" : ""}" data-action="select-card" data-card-id="${card.id}" data-country-id="${countryId}">
      ${renderCardFace(card, "hand-card__image")}
      <span class="hand-card__caption">
        <small>${CARD_TYPE_NAMES[card.type]}</small>
        <strong>${escapeHtml(card.name)}</strong>
      </span>
    </button>
  `;
}

function ensureHandCountry(): void {
  const state = store.state;
  const visibleCountries = countriesForFaction(state.activeFaction);
  if (!visibleCountries.some((country) => country.id === handCountryId)) handCountryId = visibleCountries[0]!.id;
}

function renderCountryTabs(): string {
  const visibleCountries = countriesForFaction(store.state.activeFaction);
  return `
    <div class="country-tabs country-tabs--compact" aria-label="选择国家手牌">
      ${visibleCountries
        .map(
          (candidate) => `
            <button class="${candidate.id === handCountryId ? "is-active" : ""}" data-action="select-hand-country" data-country-id="${candidate.id}">
              <span style="--country-color:${candidate.color}">${candidate.shortName}</span>${candidate.name}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderActiveSlot(slot: "status" | "response", label: string): string {
  const zones = store.state.cardZones[handCountryId];
  const cards = zones[slot].map((id) => store.state.cards[id]).filter((card): card is Card => Boolean(card));
  return `
    <section class="active-slot active-slot--${slot}">
      <header><strong>${label}</strong><span>${cards.length}</span></header>
      <div data-scroll-key="${slot}-slot">
        ${
          cards.length
            ? cards
                .map(
                  (card) => `
                    <button class="${selectedCardId === card.id ? "is-selected" : ""}" data-action="select-card" data-card-id="${card.id}" data-country-id="${handCountryId}">
                      <span>${CARD_TYPE_NAMES[card.type]}</span>
                      <strong>${escapeHtml(card.name)}</strong>
                    </button>
                  `,
                )
                .join("")
            : `<p>暂无${label}</p>`
        }
      </div>
    </section>
  `;
}

function renderCommandRail(): string {
  ensureHandCountry();
  const state = store.state;
  const zones = state.cardZones[handCountryId];
  const selected =
    (selectedCardId ? state.cards[selectedCardId] : undefined)?.countryId === handCountryId
      ? state.cards[selectedCardId!]
      : zones.hand.map((id) => state.cards[id]).find((card): card is Card => Boolean(card)) ??
        [...zones.status, ...zones.response].map((id) => state.cards[id]).find((card): card is Card => Boolean(card));
  if (selected) selectedCardId = selected.id;

  return `
    <aside class="command-rail" style="--country-color:${countryById(handCountryId).color}">
      ${selected ? renderCardInspector(selected, handCountryId) : '<div class="rail-empty">选择一张手牌查看技能</div>'}
    </aside>
  `;
}

function renderCardZoneBar(): string {
  ensureHandCountry();
  return `
    <section class="card-zone-bar" style="--country-color:${countryById(handCountryId).color}" aria-label="国家、状态牌与响应牌">
      ${renderCountryTabs()}
      <div class="active-slots">
        ${renderActiveSlot("status", "状态栏")}
        ${renderActiveSlot("response", "响应栏")}
      </div>
    </section>
  `;
}

function renderHandDock(): string {
  ensureHandCountry();
  const state = store.state;
  const country = countryById(handCountryId);
  const zones = state.cardZones[handCountryId];
  const handCards = zones.hand.map((id) => state.cards[id]).filter((card): card is Card => Boolean(card));

  return `
    <section class="hand-dock hand-dock--landscape" style="--country-color:${country.color}">
      <div class="hand-rack-toolbar">
        <strong>${country.name} · 手牌</strong>
        <div class="deck-counts">
          <span>手牌 <b>${zones.hand.length}</b></span>
          <span>牌堆 <b>${zones.deck.length}</b></span>
          <span>弃牌 <b>${zones.discard.length}</b></span>
        </div>
        <div class="hand-rack-actions">
          <button data-action="draw-card" data-country-id="${country.id}" ${zones.deck.length ? "" : "disabled"}>抽牌</button>
          <button data-action="open-card-panel" data-panel="deck">牌堆</button>
          <button data-action="open-card-panel" data-panel="discard">弃牌</button>
          <button data-action="open-card-panel" data-panel="custom">＋卡牌</button>
        </div>
      </div>
      <div class="hand-carousel" data-scroll-key="hand-carousel" aria-label="${country.name}手牌">
        ${handCards.length ? handCards.map((card) => renderHandCard(card, country.id)).join("") : '<div class="empty-state">手牌为空</div>'}
      </div>
    </section>
  `;
}

function renderManagerCardRow(card: Card, position: number, mode: "deck" | "discard"): string {
  return `
    <article class="manager-card-row">
      ${renderCardFace(card, "manager-card-row__image")}
      <div>
        <span>${mode === "deck" ? `#${position} · ${position === 1 ? "牌顶" : "顺序"}` : `#${position} · 新→旧`}</span>
        <strong>${escapeHtml(card.name)}</strong>
        <small>${CARD_TYPE_NAMES[card.type]} · ${escapeHtml(card.description)}</small>
      </div>
      <div class="manager-card-row__actions">
        ${
          mode === "deck"
            ? `
              <button data-action="search-deck-card" data-card-id="${card.id}">找入手牌</button>
              <button data-action="discard-deck-card" data-card-id="${card.id}">弃置</button>
              <button data-action="move-deck-card" data-placement="top" data-card-id="${card.id}">置顶</button>
              <button data-action="move-deck-card" data-placement="bottom" data-card-id="${card.id}">置底</button>
            `
            : `
              <button data-action="recover-discard-card" data-destination="hand" data-card-id="${card.id}">回到手牌</button>
              <button data-action="recover-discard-card" data-destination="deck-top" data-card-id="${card.id}">放回牌顶</button>
            `
        }
      </div>
    </article>
  `;
}

function renderCardManager(): string {
  if (!cardPanelMode) return "";
  const country = countryById(handCountryId);
  const zones = store.state.cardZones[handCountryId];
  if (cardPanelMode === "custom") {
    const packs = Object.values(store.state.expansionPacks);
    const createNewPack = packs.length === 0;
    return `
      <div class="card-manager-overlay" role="dialog" aria-modal="true" aria-label="添加自定义卡牌">
        <section class="card-manager card-manager--custom">
          <header><div><span>${country.name}</span><h2>添加自定义卡牌</h2></div><button data-action="close-card-panel" aria-label="关闭">×</button></header>
          <form id="add-card-form" class="custom-card-form">
            <input type="hidden" name="countryId" value="${country.id}" />
            <label><span>名称</span><input name="name" maxlength="60" required placeholder="例如：临时增援" autocomplete="off" /></label>
            <label class="custom-card-form__description"><span>技能描述</span><textarea name="description" maxlength="300" rows="3" placeholder="写下由玩家手动执行的效果"></textarea></label>
            <label><span>类型</span><select name="cardType">${Object.entries(CARD_TYPE_NAMES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
            <label><span>加入</span><select name="destination"><option value="hand">当前手牌</option><option value="deck">牌堆顶部</option></select></label>
            <label class="custom-card-form__pack">
              <span>所属拓展包</span>
              <select id="custom-card-pack" name="packChoice">
                ${packs.map((pack) => `<option value="${escapeHtml(pack.id)}">${escapeHtml(pack.name)} · ${pack.cardIds.length} 张</option>`).join("")}
                <option value="__new__" ${createNewPack ? "selected" : ""}>＋ 创建新拓展包</option>
              </select>
            </label>
            <label id="new-pack-name-field" class="custom-card-form__new-pack" ${createNewPack ? "" : "hidden"}>
              <span>新拓展包名称</span>
              <input name="newPackName" maxlength="60" placeholder="例如：地中海战场" autocomplete="off" ${createNewPack ? "required" : ""} />
            </label>
            <p class="custom-card-form__pack-note">同一拓展包可以同时收录轴心国与同盟国的卡牌。</p>
            <button class="button button--primary" type="submit">添加卡牌</button>
          </form>
        </section>
      </div>
    `;
  }

  const ids = (cardPanelMode === "deck" ? zones.deck : zones.discard).slice().reverse();
  const query = cardSearch.trim().toLocaleLowerCase();
  const cards = ids
    .map((id) => store.state.cards[id])
    .filter((card): card is Card => Boolean(card))
    .filter((card) => !query || `${card.name} ${card.description} ${CARD_TYPE_NAMES[card.type]}`.toLocaleLowerCase().includes(query));
  return `
    <div class="card-manager-overlay" role="dialog" aria-modal="true" aria-label="${cardPanelMode === "deck" ? "牌堆管理" : "弃牌堆管理"}">
      <section class="card-manager">
        <header>
          <div><span>${country.name}</span><h2>${cardPanelMode === "deck" ? `牌堆顺序 · ${zones.deck.length}` : `弃牌堆 · ${zones.discard.length}`}</h2></div>
          <button data-action="close-card-panel" aria-label="关闭">×</button>
        </header>
        <div class="card-manager__tools">
          <input id="card-search" value="${escapeHtml(cardSearch)}" placeholder="按名称、类型或技能找牌" autocomplete="off" />
          ${
            cardPanelMode === "deck"
              ? `
                <button data-action="draw-card" data-country-id="${country.id}" ${zones.deck.length ? "" : "disabled"}>抽牌</button>
                <button data-action="shuffle-deck" ${zones.deck.length > 1 ? "" : "disabled"}>洗牌</button>
              `
              : `<button data-action="reshuffle-discard" ${zones.discard.length ? "" : "disabled"}>全部洗回牌堆</button>`
          }
        </div>
        <p class="order-note">${cardPanelMode === "deck" ? "列表从牌顶到牌底；抽牌始终取 #1。" : "列表按最新弃置到最早弃置排列。"}</p>
        <div class="manager-card-list" data-scroll-key="manager-card-list">
          ${cards.length ? cards.map((card, index) => renderManagerCardRow(card, index + 1, cardPanelMode as "deck" | "discard")).join("") : '<div class="empty-state">没有匹配卡牌</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderScore(): string {
  const state = store.state;
  return `
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">手动计分</p>
          <h2>胜利点</h2>
        </div>
      </div>
      <p class="section-intro">原型不会自动判断得分条件，请按实体规则结算后调整。</p>
      <div class="scoreboard">
        ${(["axis", "allies"] as const)
          .map(
            (faction) => `
              <article class="score-card score-card--${faction}">
                ${factionBadge(faction)}
                <strong>${state.victoryPoints[faction]}</strong>
                <span>胜利点</span>
                <div class="score-buttons">
                  <button data-action="adjust-vp" data-faction="${faction}" data-amount="-1" aria-label="减一分">−</button>
                  <button data-action="adjust-vp" data-faction="${faction}" data-amount="1" aria-label="加一分">＋</button>
                </div>
                <form class="score-form" data-faction="${faction}">
                  <label>
                    <span>直接设置</span>
                    <input name="score" type="number" inputmode="numeric" value="${state.victoryPoints[faction]}" />
                  </label>
                  <button class="button" type="submit">保存</button>
                </form>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLog(): string {
  const log = store.state.log.slice().reverse();
  return `
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">最近 ${log.length} 条</p>
          <h2>操作日志</h2>
        </div>
      </div>
      <ol class="timeline">
        ${log
          .map(
            (entry) => `
              <li>
                <span class="timeline__dot"></span>
                <div>
                  <strong>${escapeHtml(entry.message)}</strong>
                  <time datetime="${entry.at}">${new Intl.DateTimeFormat("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(entry.at))}</time>
                </div>
              </li>
            `,
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderSave(): string {
  const state = store.state;
  const packs = Object.values(state.expansionPacks);
  return `
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">仅保存在本设备</p>
          <h2>存档与恢复</h2>
        </div>
      </div>
      <div class="save-status panel">
        <span class="save-status__icon">✓</span>
        <div>
          <strong>浏览器自动保存已开启</strong>
          <p>最近保存：${new Intl.DateTimeFormat("zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(state.updatedAt))}</p>
        </div>
      </div>
      <div class="save-actions">
        <button class="button button--primary button--wide" data-action="export-save">导出 JSON 存档</button>
        <button class="button button--wide" data-action="choose-import">导入 JSON 存档</button>
        <input id="import-file" class="visually-hidden" type="file" accept=".json,application/json" />
      </div>
      <section class="expansion-manager panel">
        <header>
          <div><span>自定义内容</span><h3>拓展包管理</h3></div>
          <button class="button" data-action="choose-pack-import">导入拓展包</button>
          <input id="pack-import-file" class="visually-hidden" type="file" accept=".json,application/json" />
        </header>
        <div class="expansion-pack-list">
          ${
            packs.length
              ? packs
                  .map(
                    (pack) => `
                      <article class="expansion-pack-row">
                        <div><strong>${escapeHtml(pack.name)}</strong><span>${pack.cardIds.length} 张牌</span></div>
                        <button data-action="export-pack" data-pack-id="${pack.id}">导出</button>
                        <button class="danger-link" data-action="remove-pack" data-pack-id="${pack.id}">整包移除</button>
                      </article>
                    `,
                  )
                  .join("")
              : '<p class="empty-state">还没有拓展包。手动添加的卡牌会自动归入“本机自定义牌”。</p>'
          }
        </div>
      </section>
      <aside class="info-box">
        <strong>隐私提示</strong>
        <p>JSON 存档包含双方全部手牌。请只在可信设备间传递。</p>
      </aside>
      <aside class="info-box">
        <strong>本轮自动化边界</strong>
        <p>卡牌效果、战斗、补给与胜负条件由玩家自行判断；应用负责保存局面和操作记录。</p>
      </aside>
    </section>
  `;
}

function renderBoard(): string {
  return `
    <div class="war-table">
      ${renderMap()}
      ${renderAreaDetail()}
      ${renderCardZoneBar()}
      ${renderCommandRail()}
      ${renderHandDock()}
    </div>
    ${renderCardManager()}
  `;
}

function renderCurrentView(): string {
  switch (currentView) {
    case "board":
      return renderBoard();
    case "log":
      return renderLog();
    case "save":
      return renderSave();
  }
}

function renderNavigation(): string {
  return `
    <nav class="bottom-nav" aria-label="主要功能">
      ${VIEW_ITEMS.map(
        (item) => `
          <button class="${currentView === item.id ? "is-active" : ""}" data-action="change-view" data-view="${item.id}">
            <span aria-hidden="true">${item.icon}</span>
            ${item.label}
          </button>
        `,
      ).join("")}
    </nav>
  `;
}

function renderStartScreen(): string {
  return `
    <main class="game-start-screen">
      <section class="game-start-card">
        <span class="game-start-mark" aria-hidden="true">QMG</span>
        <p class="eyebrow">战场军需官 · 手机版</p>
        <h1>准备开始</h1>
        <div class="start-settings-placeholder">
          <strong>基础设置</strong>
          <p>设置项目将在后续版本加入。</p>
        </div>
        <button class="button button--primary button--wide" data-action="enter-game">进入战局</button>
      </section>
    </main>
  `;
}

function render(): void {
  if (showStartScreen) {
    app.innerHTML = renderStartScreen();
    return;
  }
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main class="content">${renderCurrentView()}</main>
      ${renderNavigation()}
      ${toastMessage ? `<div class="toast" role="status">${escapeHtml(toastMessage)}</div>` : ""}
    </div>
  `;
  restoreScrollPositions();
  const viewport = app.querySelector<HTMLElement>(".map-viewport");
  if (viewport) viewport.scrollLeft = mapWidth === 0 ? 0 : mapScrollLeft;
}

function captureScrollPositions(): void {
  app.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((element) => {
    const key = element.dataset.scrollKey;
    if (key) scrollMemory.set(key, { left: element.scrollLeft, top: element.scrollTop });
  });
}

function restoreScrollPositions(): void {
  app.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((element) => {
    const position = scrollMemory.get(element.dataset.scrollKey ?? "");
    if (!position) return;
    element.scrollLeft = position.left;
    element.scrollTop = position.top;
  });
}

function shuffled(ids: readonly string[]): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

app.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  captureScrollPositions();

  if (action === "enter-game") {
    showStartScreen = false;
    currentView = "board";
    render();
    return;
  }
  if (action === "change-view") {
    currentView = button.dataset.view as ViewId;
    render();
    return;
  }
  if (action === "select-area") {
    mapScrollLeft = button.closest<HTMLElement>(".map-viewport")?.scrollLeft ?? mapScrollLeft;
    selectedAreaId = button.dataset.areaId ?? selectedAreaId;
    selectedUnitKind = areaById(selectedAreaId).kind === "land" ? "army" : "navy";
    render();
    return;
  }
  if (action === "map-zoom-step") {
    const viewport = button.closest(".view-section")?.querySelector<HTMLElement>(".map-viewport");
    if (viewport) mapScrollLeft = viewport.scrollLeft;
    mapZoomIndex = Math.min(
      MAP_ZOOM_LEVELS.length - 1,
      Math.max(0, mapZoomIndex + Number(button.dataset.delta)),
    );
    mapWidth = MAP_ZOOM_LEVELS[mapZoomIndex]!;
    render();
    return;
  }
  if (action === "map-zoom-fit") {
    mapWidth = 0;
    mapScrollLeft = 0;
    render();
    return;
  }
  if (action === "switch-faction") {
    const target = button.dataset.faction as Faction;
    if (target === store.state.activeFaction) return;
    store.execute({ type: "SWITCH_FACTION", faction: target });
    handCountryId = countriesForFaction(target)[0]!.id;
    unitCountryId = handCountryId;
    selectedCardId = null;
    cardPanelMode = null;
    showToast("阵营已切换");
    return;
  }
  if (action === "end-turn") {
    const currentIndex = TURN_ORDER.indexOf(store.state.turnCountry);
    const nextCountry = TURN_ORDER[(currentIndex + 1) % TURN_ORDER.length]!;
    store.execute({ type: "END_TURN" });
    currentView = "board";
    handCountryId = nextCountry;
    unitCountryId = nextCountry;
    selectedCardId = null;
    cardPanelMode = null;
    showToast(`现在是${countryById(nextCountry).name}回合`);
    return;
  }
  if (action === "undo") {
    if (!store.undo()) {
      showToast("没有可撤销的操作");
      return;
    }
    const turnCountry = countryById(store.state.turnCountry);
    handCountryId =
      turnCountry.faction === store.state.activeFaction
        ? turnCountry.id
        : countriesForFaction(store.state.activeFaction)[0]!.id;
    unitCountryId = handCountryId;
    selectedCardId = null;
    cardPanelMode = null;
    showToast("已撤销");
    return;
  }
  if (action === "new-game") {
    if (!window.confirm("开始新游戏会替换当前浏览器存档。建议先导出 JSON，是否继续？")) return;
    store.newGame();
    currentView = "board";
    selectedAreaId = "germany";
    mapScrollLeft = 190;
    handCountryId = countriesForFaction("axis")[0]!.id;
    unitCountryId = handCountryId;
    selectedCardId = null;
    cardPanelMode = null;
    showStartScreen = true;
    render();
    return;
  }
  if (action === "select-hand-country") {
    handCountryId = button.dataset.countryId as CountryId;
    unitCountryId = handCountryId;
    selectedCardId = null;
    cardPanelMode = null;
    render();
    return;
  }
  if (action === "select-card") {
    handCountryId = button.dataset.countryId as CountryId;
    selectedCardId = button.dataset.cardId ?? null;
    render();
    return;
  }
  if (action === "select-unit-country") {
    handCountryId = button.dataset.countryId as CountryId;
    unitCountryId = handCountryId;
    selectedCardId = null;
    cardPanelMode = null;
    render();
    return;
  }
  if (action === "select-unit-kind") {
    selectedUnitKind = button.dataset.unitKind as UnitKind;
    render();
    return;
  }
  if (action === "quick-place-unit") {
    execute(
      { type: "PLACE_UNIT", areaId: selectedAreaId, countryId: unitCountryId, kind: selectedUnitKind },
      "单位已放置",
    );
    return;
  }
  if (action === "quick-remove-unit") {
    execute(
      {
        type: "REMOVE_UNIT",
        areaId: selectedAreaId,
        countryId: button.dataset.countryId as CountryId,
        kind: button.dataset.unitKind as UnitKind,
      },
      "单位已移除",
    );
    return;
  }
  if (action === "open-card-panel") {
    cardPanelMode = button.dataset.panel as "deck" | "discard" | "custom";
    cardSearch = "";
    render();
    return;
  }
  if (action === "close-card-panel") {
    cardPanelMode = null;
    cardSearch = "";
    render();
    return;
  }
  if (action === "draw-card") {
    const countryId = button.dataset.countryId as CountryId;
    store.execute({ type: "DRAW_CARD", countryId });
    selectedCardId = store.state.cardZones[countryId].hand.at(-1) ?? null;
    showToast("已抽牌");
    return;
  }
  if (action === "discard-card") {
    const countryId = button.dataset.countryId as CountryId;
    store.execute({
      type: "DISCARD_CARD",
      countryId,
      cardId: button.dataset.cardId ?? "",
    });
    selectedCardId = store.state.cardZones[countryId].hand[0] ?? null;
    showToast("已弃牌");
    return;
  }
  if (action === "shuffle-deck") {
    execute(
      { type: "SHUFFLE_DECK", countryId: handCountryId, order: shuffled(store.state.cardZones[handCountryId].deck) },
      "牌堆已洗牌",
    );
    return;
  }
  if (action === "search-deck-card") {
    const cardId = button.dataset.cardId ?? "";
    store.execute({ type: "SEARCH_DECK_CARD", countryId: handCountryId, cardId });
    selectedCardId = cardId;
    showToast("已找到并加入手牌");
    return;
  }
  if (action === "discard-deck-card") {
    execute(
      { type: "DISCARD_DECK_CARD", countryId: handCountryId, cardId: button.dataset.cardId ?? "" },
      "已从牌堆弃置",
    );
    return;
  }
  if (action === "move-deck-card") {
    execute(
      {
        type: "MOVE_DECK_CARD",
        countryId: handCountryId,
        cardId: button.dataset.cardId ?? "",
        placement: button.dataset.placement as "top" | "bottom",
      },
      button.dataset.placement === "top" ? "已置于牌顶" : "已置于牌底",
    );
    return;
  }
  if (action === "recover-discard-card") {
    const cardId = button.dataset.cardId ?? "";
    const destination = button.dataset.destination as "hand" | "deck-top";
    store.execute({ type: "RECOVER_DISCARD_CARD", countryId: handCountryId, cardId, destination });
    if (destination === "hand") selectedCardId = cardId;
    showToast(destination === "hand" ? "已回收到手牌" : "已放回牌顶");
    return;
  }
  if (action === "reshuffle-discard") {
    const zones = store.state.cardZones[handCountryId];
    execute(
      { type: "RESHUFFLE_DISCARD", countryId: handCountryId, order: shuffled([...zones.deck, ...zones.discard]) },
      "弃牌堆已洗回牌堆",
    );
    return;
  }
  if (action === "play-card-slot") {
    execute(
      {
        type: "PLAY_CARD_TO_SLOT",
        countryId: button.dataset.countryId as CountryId,
        cardId: button.dataset.cardId ?? "",
        slot: button.dataset.slot as "status" | "response",
      },
      "卡牌已放入栏位",
    );
    return;
  }
  if (action === "resolve-slot-card" || action === "return-slot-card") {
    const countryId = button.dataset.countryId as CountryId;
    const cardId = button.dataset.cardId ?? "";
    const slot = button.dataset.slot as "status" | "response";
    store.execute({
      type: action === "resolve-slot-card" ? "RESOLVE_SLOT_CARD" : "RETURN_SLOT_CARD",
      countryId,
      cardId,
      slot,
    });
    selectedCardId =
      action === "return-slot-card" ? cardId : store.state.cardZones[countryId].hand[0] ?? null;
    showToast(action === "resolve-slot-card" ? "已结算并弃置" : "已收回手牌");
    return;
  }
  if (action === "adjust-vp") {
    execute(
      {
        type: "ADJUST_VP",
        faction: button.dataset.faction as Faction,
        amount: Number(button.dataset.amount),
      },
      "胜利点已更新",
    );
    return;
  }
  if (action === "export-save") {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qmg-mobile-round-${store.state.turnNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("JSON 存档已导出");
    return;
  }
  if (action === "choose-import") {
    document.querySelector<HTMLInputElement>("#import-file")?.click();
    return;
  }
  if (action === "choose-pack-import") {
    document.querySelector<HTMLInputElement>("#pack-import-file")?.click();
    return;
  }
  if (action === "export-pack") {
    const packId = button.dataset.packId ?? "";
    try {
      const pack = store.state.expansionPacks[packId];
      const blob = new Blob([store.exportExpansionPack(packId)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qmg-expansion-${(pack?.name ?? "pack").replace(/[^\p{L}\p{N}-]+/gu, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("拓展包已导出");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "导出失败");
    }
    return;
  }
  if (action === "remove-pack") {
    const packId = button.dataset.packId ?? "";
    const pack = store.state.expansionPacks[packId];
    if (!pack || !window.confirm(`整包移除「${pack.name}」及其中 ${pack.cardIds.length} 张牌？`)) return;
    execute({ type: "REMOVE_EXPANSION_PACK", packId }, "拓展包已移除");
    selectedCardId = null;
    return;
  }
});

app.addEventListener(
  "scroll",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.classList.contains("map-viewport")) mapScrollLeft = target.scrollLeft;
      const key = target.dataset.scrollKey;
      if (key) scrollMemory.set(key, { left: target.scrollLeft, top: target.scrollTop });
    }
  },
  true,
);

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  captureScrollPositions();
  if (target.id === "custom-card-pack" && target instanceof HTMLSelectElement) {
    const field = document.querySelector<HTMLElement>("#new-pack-name-field");
    const input = field?.querySelector<HTMLInputElement>('input[name="newPackName"]');
    const creating = target.value === "__new__";
    if (field) field.hidden = !creating;
    if (input) {
      input.required = creating;
      if (creating) input.focus();
    }
    return;
  }
  if (target.id === "turn-country") {
    const countryId = target.value as CountryId;
    const faction = countryById(countryId).faction;
    store.execute({ type: "SET_TURN_COUNTRY", countryId });
    if (faction !== store.state.activeFaction) store.execute({ type: "SWITCH_FACTION", faction });
    handCountryId = countryId;
    unitCountryId = countryId;
    selectedCardId = null;
    cardPanelMode = null;
    showToast(`现在是${countryById(countryId).name}回合`);
    return;
  }
  if (target.id === "import-file" && target instanceof HTMLInputElement && target.files?.[0]) {
    const file = target.files[0];
    file
      .text()
      .then((text) => {
        store.importJson(text);
        currentView = "board";
        selectedAreaId = AREAS.some((area) => area.id === selectedAreaId) ? selectedAreaId : AREAS[0]!.id;
        const turnCountry = countryById(store.state.turnCountry);
        handCountryId =
          turnCountry.faction === store.state.activeFaction
            ? turnCountry.id
            : countriesForFaction(store.state.activeFaction)[0]!.id;
        unitCountryId = handCountryId;
        selectedCardId = null;
        cardPanelMode = null;
        showToast("存档导入成功");
      })
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "导入失败"));
    return;
  }
  if (target.id === "pack-import-file" && target instanceof HTMLInputElement && target.files?.[0]) {
    target.files[0]
      .text()
      .then((text) => {
        store.importExpansionPack(text);
        showToast("拓展包已整体加入");
      })
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "拓展包导入失败"));
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id !== "card-search") return;
  captureScrollPositions();
  cardSearch = target.value;
  const cursor = target.selectionStart ?? cardSearch.length;
  render();
  const search = app.querySelector<HTMLInputElement>("#card-search");
  search?.focus();
  search?.setSelectionRange(cursor, cursor);
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);

  try {
    if (form.id === "add-card-form") {
      const packChoice = String(data.get("packChoice"));
      const creatingPack = packChoice === "__new__";
      store.execute({
        type: "ADD_CUSTOM_CARD",
        countryId: String(data.get("countryId")) as CountryId,
        name: String(data.get("name")),
        description: String(data.get("description")),
        cardType: String(data.get("cardType")) as CardType,
        destination: String(data.get("destination")) as "hand" | "deck",
        packId: creatingPack ? `pack-${Date.now()}-${store.state.nextCustomCardId}` : packChoice,
        packName: creatingPack ? String(data.get("newPackName")) : undefined,
      });
      cardPanelMode = null;
      showToast("新卡牌已添加");
    } else if (form.classList.contains("score-form")) {
      execute(
        {
          type: "SET_VP",
          faction: form.dataset.faction as Faction,
          value: Number(data.get("score")),
        },
        "胜利点已设置",
      );
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "操作失败");
  }
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is progressive; local development may intentionally omit it.
    });
  });
}
