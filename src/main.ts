import "./styles.css";
import { PHASES, canMoveUnit, type Card, type CardType, type GameAction, type UnitStack } from "./game";
import {
  AREAS,
  COUNTRIES,
  FACTION_NAMES,
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

interface PrivacyGate {
  target: Faction;
  title: string;
  detail: string;
  allowCancel: boolean;
  confirm: () => void;
}

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("App root not found");
const app: HTMLDivElement = appElement;

const store = new GameStore(window.localStorage);
let currentView: ViewId = "board";
let selectedAreaId = "germany";
let mapWidth = 980;
let mapScrollLeft = 190;
let handCountryId: CountryId = countriesForFaction(store.state.activeFaction)[0]!.id;
let selectedCardId: string | null = null;
let toastMessage = "";
let toastTimer: number | undefined;
let privacyGate: PrivacyGate | null = {
  target: store.state.activeFaction,
  title: "战局已锁定",
  detail: `请把手机交给${FACTION_NAMES[store.state.activeFaction]}玩家。`,
  allowCancel: false,
  confirm: () => undefined,
};

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

function askForFaction(
  target: Faction,
  title: string,
  detail: string,
  confirm: () => void,
  allowCancel = true,
): void {
  privacyGate = { target, title, detail, confirm, allowCancel };
  render();
}

function factionBadge(faction: Faction): string {
  return `<span class="faction-badge faction-badge--${faction}">${faction === "axis" ? "AXIS" : "ALLIES"}</span>`;
}

function renderPrivacyGate(gate: PrivacyGate): string {
  return `
    <main class="privacy-gate privacy-gate--${gate.target}" aria-labelledby="privacy-title">
      <div class="privacy-mark" aria-hidden="true">✦</div>
      ${factionBadge(gate.target)}
      <p class="eyebrow">隐私交接</p>
      <h1 id="privacy-title">${escapeHtml(gate.title)}</h1>
      <p>${escapeHtml(gate.detail)}</p>
      <div class="privacy-warning">确认前不会显示任何手牌内容</div>
      <button class="button button--primary button--wide" data-action="privacy-confirm">
        我是${FACTION_NAMES[gate.target]}玩家
      </button>
      ${
        gate.allowCancel
          ? '<button class="button button--ghost button--wide" data-action="privacy-cancel">取消交接</button>'
          : ""
      }
    </main>
  `;
}

function renderHeader(): string {
  const state = store.state;
  const turnCountry = countryById(state.turnCountry);
  return `
    <header class="app-header">
      <div>
        <p class="eyebrow">QMG · WAR TABLE</p>
        <h1>战场军需官</h1>
      </div>
      <div class="header-actions">
        <button class="icon-button" data-action="undo" ${store.canUndo() ? "" : "disabled"} aria-label="撤销上一步" title="撤销">↶</button>
        <button class="icon-button" data-action="new-game" aria-label="新游戏" title="新游戏">＋</button>
      </div>
    </header>
    <section class="command-deck" aria-label="当前战局">
      <div class="command-deck__status">
        <div>
          <span class="command-deck__round">ROUND ${state.turnNumber}</span>
          <strong><span class="country-dot" style="--country-color:${turnCountry.color}"></span>${turnCountry.name}</strong>
        </div>
        ${factionBadge(state.activeFaction)}
      </div>
      <div class="score-strip" aria-label="胜利点">
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
      <div class="switcher" aria-label="查看阵营">
        <button class="${state.activeFaction === "axis" ? "is-active" : ""}" data-action="switch-faction" data-faction="axis">Axis</button>
        <button class="${state.activeFaction === "allies" ? "is-active" : ""}" data-action="switch-faction" data-faction="allies">Allies</button>
      </div>
      <div class="turn-controls">
        <label>
          <span>回合国家</span>
          <select id="turn-country">
            ${COUNTRIES.map(
              (country) =>
                `<option value="${country.id}" ${country.id === state.turnCountry ? "selected" : ""}>${country.name}</option>`,
            ).join("")}
          </select>
        </label>
        <label>
          <span>当前阶段</span>
          <select id="turn-phase">
            ${PHASES.map((phase) => `<option ${phase === state.phase ? "selected" : ""}>${phase}</option>`).join("")}
          </select>
        </label>
      </div>
      <button class="button button--turn" data-action="end-turn">结束${turnCountry.name}回合 →</button>
    </section>
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
  const connections = connectionsForArea(definition.id);
  const movementConnections = connections.filter(
    (connection) => areaById(otherEnd(connection, definition.id)).kind === definition.kind,
  );
  const coastConnections = connections.filter(
    (connection) => areaById(otherEnd(connection, definition.id)).kind !== definition.kind,
  );
  const stacks = area.units;
  const initialMoveKind = stacks[0]?.kind ?? compatibleKind;
  const moveTargets =
    initialMoveKind === "air-force"
      ? AREAS.filter((candidate) => candidate.id !== definition.id)
      : movementConnections.map((connection) => areaById(otherEnd(connection, definition.id)));
  const stackOptions = stacks
    .map(
      (stack) =>
        `<option value="${stack.countryId}|${stack.kind}">${countryById(stack.countryId).name} · ${unitName(stack.kind)} ×${stack.count}</option>`,
    )
    .join("");

  return `
    <section class="area-detail panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${definition.kind === "land" ? "陆地区域" : "海域"}</p>
          <h2>${definition.name}${definition.supply ? ' <span class="supply-star" title="补给区域">★</span>' : ""}</h2>
        </div>
        <span class="count-pill">${stacks.reduce((sum, stack) => sum + stack.count, 0)} 单位</span>
      </div>
      <div class="connection-summary">
        <div>
          <strong>${definition.kind === "land" ? "同陆地相邻" : "同海域相邻"}</strong>
          <p>${
            movementConnections.length
              ? movementConnections
                  .map((connection) => {
                    const neighbor = areaById(otherEnd(connection, definition.id));
                    if (connection.kind !== "strait") return neighbor.name;
                    const controller = areaById(connection.controller!);
                    const sampleCountry = countriesForFaction(state.activeFaction)[0]!;
                    const open = canMoveUnit(
                      state,
                      definition.id,
                      neighbor.id,
                      sampleCountry.id,
                      compatibleKind,
                    );
                    return `${neighbor.name}（海峡·${controller.name}控制，当前${open ? "开放" : "关闭"}）`;
                  })
                  .join("、")
              : "无"
          }</p>
        </div>
        <div>
          <strong>陆海沿岸相邻</strong>
          <p>${
            coastConnections.length
              ? coastConnections.map((connection) => areaById(otherEnd(connection, definition.id)).name).join("、")
              : "无"
          }</p>
        </div>
      </div>
      <div class="detail-units">
        ${stacks.length ? stacks.map(renderUnitStack).join("") : '<p class="empty-inline">这里还没有单位</p>'}
      </div>

      <form class="action-form" id="place-unit-form">
        <input type="hidden" name="areaId" value="${definition.id}" />
        <label>
          <span>国家</span>
          <select name="countryId">
            ${countriesForFaction(state.activeFaction)
              .map((country) => `<option value="${country.id}">${country.name}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>单位</span>
          <select name="kind">
            <option value="${compatibleKind}">${unitName(compatibleKind)}</option>
            <option value="air-force">空军</option>
          </select>
        </label>
        <button class="button button--primary" type="submit">＋ 放置</button>
      </form>

      <form class="action-form" id="move-unit-form">
        <input type="hidden" name="fromAreaId" value="${definition.id}" />
        <label>
          <span>移动单位</span>
          <select name="stack" ${stacks.length ? "" : "disabled"}>${stackOptions || "<option>无单位</option>"}</select>
        </label>
        <label>
          <span>到相邻区域</span>
          <select name="toAreaId" ${moveTargets.length ? "" : "disabled"}>
            ${
              moveTargets
                .map((neighbor) => `<option value="${neighbor.id}">${neighbor.name}</option>`)
                .join("") || "<option>无可用区域</option>"
            }
          </select>
        </label>
        <button class="button" type="submit" ${stacks.length && moveTargets.length ? "" : "disabled"}>移动 1 支</button>
      </form>

      <form class="action-form action-form--remove" id="remove-unit-form">
        <input type="hidden" name="areaId" value="${definition.id}" />
        <label>
          <span>移除单位</span>
          <select name="stack" ${stacks.length ? "" : "disabled"}>${stackOptions || "<option>无单位</option>"}</select>
        </label>
        <button class="button button--danger" type="submit" ${stacks.length ? "" : "disabled"}>移除 1 支</button>
      </form>
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
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">规则地图 · 原型适配</p>
          <h2>世界地图与区域</h2>
        </div>
        <div class="map-tools" aria-label="地图缩放">
          <button class="icon-button icon-button--small" data-action="map-zoom" data-width="760" aria-label="缩小地图">−</button>
          <button class="icon-button icon-button--small" data-action="map-zoom" data-width="0" aria-label="地图适应宽度">适</button>
          <button class="icon-button icon-button--small" data-action="map-zoom" data-width="1220" aria-label="放大地图">＋</button>
        </div>
      </div>
      <p class="section-intro">横向拖动查看地图，点选圆点查看区域。高亮连线只显示当前区域的连接。</p>
      <div class="map-legend map-legend--routes">
        <span><i class="legend-swatch legend-swatch--land"></i>陆路</span>
        <span><i class="legend-swatch legend-swatch--sea"></i>海路</span>
        <span><i class="legend-swatch legend-swatch--coast"></i>沿岸</span>
        <span><i class="legend-swatch legend-swatch--strait"></i>受控海峡</span>
      </div>
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
      <p class="map-rule-note">规则依据：共享边界才算相邻；只在一点接触不算。中东与巴尔干、黑海与地中海明确不相邻。东西地图边缘首尾相接。</p>
      ${renderAreaDetail()}
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
  const zone = inHand ? "手牌" : zones.discard.includes(card.id) ? "弃牌堆" : zones.deck.includes(card.id) ? "牌堆" : "自定义";
  return `
    <article class="card-inspector panel" style="--country-color:${countryById(card.countryId).color}">
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
        <p class="card-source-note">${card.image ? "文字独立显示；具体符号与排版可同时参照左侧原始牌面。" : "自定义卡牌效果由玩家手动处理。"}</p>
        ${
          inHand
            ? `<button class="button button--danger" data-action="discard-card" data-country-id="${countryId}" data-card-id="${card.id}">弃置这张牌</button>`
            : ""
        }
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

function renderHandDock(): string {
  const state = store.state;
  const visibleCountries = countriesForFaction(state.activeFaction);
  if (!visibleCountries.some((country) => country.id === handCountryId)) handCountryId = visibleCountries[0]!.id;
  const country = countryById(handCountryId);
  const zones = state.cardZones[handCountryId];
  const handCards = zones.hand.map((id) => state.cards[id]).filter((card): card is Card => Boolean(card));
  const allCountryCards = Object.values(state.cards)
    .filter((card) => card.countryId === handCountryId)
    .sort((a, b) => (a.sourceId ?? Number.MAX_SAFE_INTEGER) - (b.sourceId ?? Number.MAX_SAFE_INTEGER));
  const selected =
    (selectedCardId ? state.cards[selectedCardId] : undefined)?.countryId === handCountryId
      ? state.cards[selectedCardId!]
      : handCards[0] ?? allCountryCards[0];
  if (selected) selectedCardId = selected.id;

  return `
    <section class="hand-dock" style="--country-color:${country.color}">
      <div class="hand-dock__top">
        <div>
          <p class="eyebrow">PRIVATE COMMAND HAND</p>
          <h2>${FACTION_NAMES[state.activeFaction]} · 手牌</h2>
        </div>
        <div class="deck-counts">
          <span>手牌 <b>${zones.hand.length}</b></span>
          <span>牌堆 <b>${zones.deck.length}</b></span>
          <span>弃牌 <b>${zones.discard.length}</b></span>
        </div>
      </div>
      <div class="country-tabs" aria-label="选择国家手牌">
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
      <div class="hand-toolbar">
        <strong>${country.name}指挥手牌</strong>
        <button class="button button--draw" data-action="draw-card" data-country-id="${country.id}" ${zones.deck.length ? "" : "disabled"}>
          抽 1 张牌
        </button>
      </div>
      <div class="hand-carousel" aria-label="${country.name}手牌">
        ${handCards.length ? handCards.map((card) => renderHandCard(card, country.id)).join("") : '<div class="empty-state">手牌为空</div>'}
      </div>
      ${selected ? renderCardInspector(selected, country.id) : ""}
      <div class="hand-dock__drawers">
        <details class="deck-browser">
          <summary>浏览${country.name}完整牌库（${allCountryCards.length} 张）</summary>
          <div class="catalog-grid">
            ${allCountryCards.map((card) => renderHandCard(card, country.id)).join("")}
          </div>
        </details>
        <details class="discard-pile">
          <summary>弃牌堆（${zones.discard.length}）</summary>
          ${
            zones.discard.length
              ? `<ol>${zones.discard
                  .slice()
                  .reverse()
                  .map((cardId) => `<li><button data-action="select-card" data-card-id="${cardId}" data-country-id="${country.id}">${escapeHtml(state.cards[cardId]?.name ?? "未知卡牌")}</button></li>`)
                  .join("")}</ol>`
              : '<p class="muted">暂无弃牌</p>'
          }
        </details>
        <details class="custom-card-panel">
          <summary>添加自定义卡牌</summary>
          <form id="add-card-form" class="stack-form">
            <input type="hidden" name="countryId" value="${country.id}" />
            <label>
              <span>卡牌名称</span>
              <input name="name" maxlength="60" required placeholder="例如：临时增援" autocomplete="off" />
            </label>
            <label>
              <span>技能描述</span>
              <textarea name="description" maxlength="300" rows="3" placeholder="写下这张牌由玩家手动执行的效果"></textarea>
            </label>
            <div class="form-row">
              <label>
                <span>类型</span>
                <select name="cardType">
                  ${Object.entries(CARD_TYPE_NAMES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>加入</span>
                <select name="destination">
                  <option value="hand">当前手牌</option>
                  <option value="deck">牌堆顶部</option>
                </select>
              </label>
            </div>
            <button class="button button--primary" type="submit">添加卡牌</button>
          </form>
        </details>
      </div>
    </section>
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
      ${renderHandDock()}
    </div>
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

function render(): void {
  if (privacyGate) {
    app.innerHTML = renderPrivacyGate(privacyGate);
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
  const viewport = app.querySelector<HTMLElement>(".map-viewport");
  if (viewport) viewport.scrollLeft = mapWidth === 0 ? 0 : mapScrollLeft;
}

function parseStack(value: string): { countryId: CountryId; kind: UnitKind } {
  const [countryId, kind] = value.split("|");
  if (!countryId || (kind !== "army" && kind !== "navy" && kind !== "air-force")) throw new Error("请选择有效单位");
  countryById(countryId as CountryId);
  return { countryId: countryId as CountryId, kind };
}

app.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "privacy-confirm" && privacyGate) {
    const callback = privacyGate.confirm;
    privacyGate = null;
    callback();
    render();
    return;
  }
  if (action === "privacy-cancel") {
    privacyGate = null;
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
    render();
    document.querySelector(".area-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "map-zoom") {
    const viewport = button.closest(".view-section")?.querySelector<HTMLElement>(".map-viewport");
    if (viewport) mapScrollLeft = viewport.scrollLeft;
    mapWidth = Number(button.dataset.width);
    if (mapWidth === 0) mapScrollLeft = 0;
    render();
    return;
  }
  if (action === "switch-faction") {
    const target = button.dataset.faction as Faction;
    if (target === store.state.activeFaction) return;
    askForFaction(
      target,
      `交给${FACTION_NAMES[target]}`,
      `请先把手机交给${FACTION_NAMES[target]}玩家，再由对方确认。`,
      () => {
        store.execute({ type: "SWITCH_FACTION", faction: target });
        handCountryId = countriesForFaction(target)[0]!.id;
        selectedCardId = null;
        showToast("阵营已切换");
      },
    );
    return;
  }
  if (action === "end-turn") {
    const currentIndex = TURN_ORDER.indexOf(store.state.turnCountry);
    const nextCountry = TURN_ORDER[(currentIndex + 1) % TURN_ORDER.length]!;
    const target = countryById(nextCountry).faction;
    askForFaction(
      target,
      `${countryById(store.state.turnCountry).name}回合结束`,
      `下一位是${countryById(nextCountry).name}。请交接手机后确认。`,
      () => {
        store.execute({ type: "END_TURN" });
        currentView = "board";
        handCountryId = countriesForFaction(target)[0]!.id;
        selectedCardId = null;
        showToast(`现在是${countryById(nextCountry).name}回合`);
      },
    );
    return;
  }
  if (action === "undo") {
    const previousFaction = store.state.activeFaction;
    if (!store.undo()) {
      showToast("没有可撤销的操作");
      return;
    }
    if (store.state.activeFaction !== previousFaction) {
      askForFaction(
        store.state.activeFaction,
        "撤销后阵营已改变",
        `请把手机交给${FACTION_NAMES[store.state.activeFaction]}玩家。`,
        () => showToast("已撤销"),
        false,
      );
    } else showToast("已撤销");
    return;
  }
  if (action === "new-game") {
    if (!window.confirm("开始新游戏会替换当前浏览器存档。建议先导出 JSON，是否继续？")) return;
    store.newGame();
    currentView = "board";
    selectedAreaId = "germany";
    mapScrollLeft = 190;
    handCountryId = countriesForFaction("axis")[0]!.id;
    selectedCardId = null;
    askForFaction("axis", "新战局已就绪", "由德国开始。请把手机交给 Axis 轴心国玩家。", () => undefined, false);
    return;
  }
  if (action === "select-hand-country") {
    handCountryId = button.dataset.countryId as CountryId;
    selectedCardId = null;
    render();
    return;
  }
  if (action === "select-card") {
    handCountryId = button.dataset.countryId as CountryId;
    selectedCardId = button.dataset.cardId ?? null;
    render();
    document.querySelector(".card-inspector")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  }
});

app.addEventListener(
  "scroll",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("map-viewport")) {
      mapScrollLeft = target.scrollLeft;
    }
  },
  true,
);

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === "turn-phase") {
    execute({ type: "SET_PHASE", phase: target.value as (typeof PHASES)[number] }, "阶段已更新");
    return;
  }
  if (target.id === "turn-country") {
    const countryId = target.value as CountryId;
    const faction = countryById(countryId).faction;
    const commit = () => {
      store.execute({ type: "SET_TURN_COUNTRY", countryId });
      if (faction !== store.state.activeFaction) store.execute({ type: "SWITCH_FACTION", faction });
      handCountryId = countriesForFaction(faction)[0]!.id;
      selectedCardId = null;
      showToast(`现在是${countryById(countryId).name}回合`);
    };
    if (faction !== store.state.activeFaction) {
      askForFaction(
        faction,
        `切换至${countryById(countryId).name}`,
        `请把手机交给${FACTION_NAMES[faction]}玩家。`,
        commit,
      );
    } else commit();
    return;
  }
  if (target.name === "stack" && target.closest<HTMLFormElement>("#move-unit-form")) {
    const form = target.closest<HTMLFormElement>("#move-unit-form");
    const targetSelect = form?.querySelector<HTMLSelectElement>('select[name="toAreaId"]');
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!form || !targetSelect || !submit) return;
    const stack = parseStack(target.value);
    const fromAreaId = String(new FormData(form).get("fromAreaId"));
    const fromArea = areaById(fromAreaId);
    const targets =
      stack.kind === "air-force"
        ? AREAS.filter((candidate) => candidate.id !== fromAreaId)
        : connectionsForArea(fromAreaId)
            .map((connection) => areaById(otherEnd(connection, fromAreaId)))
            .filter((candidate) => candidate.kind === fromArea.kind);
    targetSelect.innerHTML =
      targets.map((candidate) => `<option value="${candidate.id}">${candidate.name}</option>`).join("") ||
      "<option>无可用区域</option>";
    targetSelect.disabled = targets.length === 0;
    submit.disabled = targets.length === 0;
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
        handCountryId = countriesForFaction(store.state.activeFaction)[0]!.id;
        selectedCardId = null;
        askForFaction(
          store.state.activeFaction,
          "存档已导入",
          `请把手机交给${FACTION_NAMES[store.state.activeFaction]}玩家后确认。`,
          () => showToast("存档导入成功"),
          false,
        );
      })
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "导入失败"));
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);

  try {
    if (form.id === "place-unit-form") {
      execute(
        {
          type: "PLACE_UNIT",
          areaId: String(data.get("areaId")),
          countryId: String(data.get("countryId")) as CountryId,
          kind: String(data.get("kind")) as UnitKind,
        },
        "单位已放置",
      );
    } else if (form.id === "move-unit-form") {
      const stack = parseStack(String(data.get("stack")));
      execute(
        {
          type: "MOVE_UNIT",
          fromAreaId: String(data.get("fromAreaId")),
          toAreaId: String(data.get("toAreaId")),
          ...stack,
        },
        "单位已移动",
      );
    } else if (form.id === "remove-unit-form") {
      const stack = parseStack(String(data.get("stack")));
      execute(
        {
          type: "REMOVE_UNIT",
          areaId: String(data.get("areaId")),
          ...stack,
        },
        "单位已移除",
      );
    } else if (form.id === "add-card-form") {
      execute(
        {
          type: "ADD_CUSTOM_CARD",
          countryId: String(data.get("countryId")) as CountryId,
          name: String(data.get("name")),
          description: String(data.get("description")),
          cardType: String(data.get("cardType")) as CardType,
          destination: String(data.get("destination")) as "hand" | "deck",
        },
        "新卡牌已添加",
      );
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
