import "./styles.css";
import { PHASES, type CardType, type GameAction } from "./game";
import {
  AREAS,
  COUNTRIES,
  FACTION_NAMES,
  TURN_ORDER,
  areaById,
  countriesForFaction,
  countryById,
  type CountryId,
  type Faction,
  type UnitKind,
} from "./prototype-data";
import { GameStore } from "./store";

type ViewId = "map" | "cards" | "score" | "log" | "save";

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
let currentView: ViewId = "map";
let selectedAreaId = "western-europe";
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
  event: "事件",
  response: "响应",
  status: "持续",
  other: "其他",
};

const VIEW_ITEMS: ReadonlyArray<{ id: ViewId; icon: string; label: string }> = [
  { id: "map", icon: "⌖", label: "地图" },
  { id: "cards", icon: "▤", label: "手牌" },
  { id: "score", icon: "★", label: "计分" },
  { id: "log", icon: "≡", label: "日志" },
  { id: "save", icon: "↥", label: "存档" },
];

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
        <p class="eyebrow">QMG · 本地战局</p>
        <h1>随身军需官</h1>
      </div>
      <div class="header-actions">
        <button class="icon-button" data-action="undo" ${store.canUndo() ? "" : "disabled"} aria-label="撤销上一步" title="撤销">↶</button>
        <button class="icon-button" data-action="new-game" aria-label="新游戏" title="新游戏">＋</button>
      </div>
    </header>
    <section class="turn-card" aria-label="当前回合">
      <div class="turn-card__top">
        <div>
          <span class="muted">第 ${state.turnNumber} 轮</span>
          <strong><span class="country-dot" style="--country-color:${turnCountry.color}"></span>${turnCountry.name}</strong>
        </div>
        ${factionBadge(state.activeFaction)}
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
      <button class="button button--turn" data-action="end-turn">结束本国回合 →</button>
    </section>
  `;
}

function renderUnitStack(stack: { countryId: CountryId; kind: UnitKind; count: number }): string {
  const country = countryById(stack.countryId);
  return `
    <span class="unit-chip" style="--unit-color:${country.color}">
      <span aria-hidden="true">${stack.kind === "army" ? "▲" : "◆"}</span>
      ${country.shortName} ${stack.kind === "army" ? "陆" : "海"} ×${stack.count}
    </span>
  `;
}

function renderAreaDetail(): string {
  const state = store.state;
  const definition = areaById(selectedAreaId);
  const area = state.areas[selectedAreaId]!;
  const compatibleKind: UnitKind = definition.kind === "land" ? "army" : "navy";
  const neighbors = definition.neighbors
    .map(areaById)
    .filter((neighbor) => neighbor.kind === definition.kind);
  const stacks = area.units;
  const stackOptions = stacks
    .map(
      (stack) =>
        `<option value="${stack.countryId}|${stack.kind}">${countryById(stack.countryId).name} · ${
          stack.kind === "army" ? "陆军" : "海军"
        } ×${stack.count}</option>`,
    )
    .join("");

  return `
    <section class="area-detail panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${definition.kind === "land" ? "陆地区域" : "海域"}</p>
          <h2>${definition.name}</h2>
        </div>
        <span class="count-pill">${stacks.reduce((sum, stack) => sum + stack.count, 0)} 单位</span>
      </div>
      <p class="neighbor-line">相邻：${definition.neighbors.map((id) => areaById(id).name).join("、")}</p>
      <div class="detail-units">
        ${stacks.length ? stacks.map(renderUnitStack).join("") : '<p class="empty-inline">这里还没有单位</p>'}
      </div>

      <form class="action-form" id="place-unit-form">
        <input type="hidden" name="areaId" value="${definition.id}" />
        <input type="hidden" name="kind" value="${compatibleKind}" />
        <label>
          <span>放置${compatibleKind === "army" ? "陆军" : "海军"}</span>
          <select name="countryId">
            ${countriesForFaction(state.activeFaction)
              .map((country) => `<option value="${country.id}">${country.name}</option>`)
              .join("")}
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
          <select name="toAreaId" ${neighbors.length ? "" : "disabled"}>
            ${neighbors.map((neighbor) => `<option value="${neighbor.id}">${neighbor.name}</option>`).join("") || "<option>无可用区域</option>"}
          </select>
        </label>
        <button class="button" type="submit" ${stacks.length && neighbors.length ? "" : "disabled"}>移动 1 支</button>
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

function renderMap(): string {
  const state = store.state;
  return `
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">简化战区</p>
          <h2>区域与单位</h2>
        </div>
        <div class="map-legend"><span>▲ 陆军</span><span>◆ 海军</span></div>
      </div>
      <p class="section-intro">点选区域后，可放置、移动或移除单位。原型只限制地形与相邻移动。</p>
      <div class="area-grid">
        ${AREAS.map((definition) => {
          const area = state.areas[definition.id]!;
          return `
            <button class="area-card ${definition.id === selectedAreaId ? "is-selected" : ""}" data-action="select-area" data-area-id="${definition.id}">
              <span class="area-card__type">${definition.kind === "land" ? "LAND" : "SEA"}</span>
              <strong>${definition.name}</strong>
              <span class="area-card__units">
                ${area.units.length ? area.units.map(renderUnitStack).join("") : '<span class="empty-inline">空</span>'}
              </span>
            </button>
          `;
        }).join("")}
      </div>
      ${renderAreaDetail()}
    </section>
  `;
}

function renderCardCountry(countryId: CountryId): string {
  const state = store.state;
  const country = countryById(countryId);
  const zones = state.cardZones[countryId];
  return `
    <article class="country-hand" style="--country-color:${country.color}">
      <div class="country-hand__header">
        <div>
          <p class="eyebrow">${country.shortName} · ${country.faction.toUpperCase()}</p>
          <h3>${country.name}</h3>
        </div>
        <div class="deck-counts">
          <span>牌堆 ${zones.deck.length}</span>
          <span>弃牌 ${zones.discard.length}</span>
        </div>
      </div>
      <button class="button button--draw" data-action="draw-card" data-country-id="${country.id}" ${
        zones.deck.length ? "" : "disabled"
      }>从牌堆抽 1 张</button>
      <div class="hand-list">
        ${
          zones.hand.length
            ? zones.hand
                .map((cardId) => {
                  const card = state.cards[cardId]!;
                  return `
                    <div class="card-item">
                      <div>
                        <span class="card-type">${CARD_TYPE_NAMES[card.type]}</span>
                        <strong>${escapeHtml(card.name)}</strong>
                        ${card.isCustom ? '<small>自定义</small>' : ""}
                      </div>
                      <button class="text-button text-button--danger" data-action="discard-card" data-country-id="${country.id}" data-card-id="${card.id}">弃牌</button>
                    </div>
                  `;
                })
                .join("")
            : '<div class="empty-state empty-state--small">手牌为空</div>'
        }
      </div>
      <details class="discard-pile">
        <summary>查看弃牌堆（${zones.discard.length}）</summary>
        ${
          zones.discard.length
            ? `<ol>${zones.discard
                .slice()
                .reverse()
                .map((cardId) => `<li>${escapeHtml(state.cards[cardId]?.name ?? "未知卡牌")}</li>`)
                .join("")}</ol>`
            : '<p class="muted">暂无弃牌</p>'
        }
      </details>
    </article>
  `;
}

function renderCards(): string {
  const visibleCountries = countriesForFaction(store.state.activeFaction);
  return `
    <section class="view-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">仅当前阵营可见</p>
          <h2>${FACTION_NAMES[store.state.activeFaction]}手牌</h2>
        </div>
        ${factionBadge(store.state.activeFaction)}
      </div>
      <p class="privacy-note">另一阵营的三国手牌不会出现在当前页面中。</p>
      <div class="hand-columns">
        ${visibleCountries.map((country) => renderCardCountry(country.id)).join("")}
      </div>
      <section class="panel custom-card-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">原型工具</p>
            <h3>添加新卡牌</h3>
          </div>
        </div>
        <form id="add-card-form" class="stack-form">
          <label>
            <span>国家</span>
            <select name="countryId">
              ${visibleCountries.map((country) => `<option value="${country.id}">${country.name}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>卡牌名称</span>
            <input name="name" maxlength="60" required placeholder="例如：临时增援" autocomplete="off" />
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
      </section>
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

function renderCurrentView(): string {
  switch (currentView) {
    case "map":
      return renderMap();
    case "cards":
      return renderCards();
    case "score":
      return renderScore();
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
}

function parseStack(value: string): { countryId: CountryId; kind: UnitKind } {
  const [countryId, kind] = value.split("|");
  if (!countryId || (kind !== "army" && kind !== "navy")) throw new Error("请选择有效单位");
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
    selectedAreaId = button.dataset.areaId ?? selectedAreaId;
    render();
    document.querySelector(".area-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "switch-faction") {
    const target = button.dataset.faction as Faction;
    if (target === store.state.activeFaction) return;
    askForFaction(
      target,
      `交给${FACTION_NAMES[target]}`,
      `请先把手机交给${FACTION_NAMES[target]}玩家，再由对方确认。`,
      () => execute({ type: "SWITCH_FACTION", faction: target }, "阵营已切换"),
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
        currentView = "map";
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
    currentView = "map";
    selectedAreaId = "western-europe";
    askForFaction("axis", "新战局已就绪", "由德国开始。请把手机交给 Axis 轴心国玩家。", () => undefined, false);
    return;
  }
  if (action === "draw-card") {
    execute({ type: "DRAW_CARD", countryId: button.dataset.countryId as CountryId }, "已抽牌");
    return;
  }
  if (action === "discard-card") {
    execute(
      {
        type: "DISCARD_CARD",
        countryId: button.dataset.countryId as CountryId,
        cardId: button.dataset.cardId ?? "",
      },
      "已弃牌",
    );
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
  if (target.id === "import-file" && target instanceof HTMLInputElement && target.files?.[0]) {
    const file = target.files[0];
    file
      .text()
      .then((text) => {
        store.importJson(text);
        currentView = "map";
        selectedAreaId = AREAS.some((area) => area.id === selectedAreaId) ? selectedAreaId : AREAS[0]!.id;
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
