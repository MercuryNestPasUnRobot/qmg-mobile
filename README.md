# 战场军需官手机版（Prototype）

一个 mobile-first、无后端、可离线使用的本地单人双阵营桌游辅助原型。玩家在同一台手机上轮流操作 Axis 与 Allies；局面自动保存在浏览器中。

> 本项目当前是 **prototype**，不是完整的规则引擎。卡牌效果、战斗、补给与胜负条件由玩家按实体规则手动判断。

## 已实现

- 新建游戏，Axis / Allies 阵营交接与全屏隐私遮罩
- 六国回合顺序、当前国家、轮数和回合阶段
- 基于 `sources/map.png` 的可缩放、可横向拖动世界地图与可点选区域
- 33 个陆地区域、17 个海域、陆海沿岸关系、地图东西边缘连接和 5 个受控海峡
- 陆军 / 海军放置、有效同地形相邻移动和移除
- 六国独立牌堆、手牌和弃牌堆；只渲染当前阵营的三国手牌
- 手机端添加自定义卡牌，可直接加入手牌或牌堆顶部
- 双方胜利点手动调整
- 操作日志和最多 50 步撤销
- `localStorage` 自动保存，刷新或关闭页面后可恢复
- JSON 存档导出和导入
- PWA manifest、离线 service worker 和可安装图标
- GitHub Pages 自动部署工作流

## 本地运行

需要 Node.js 22 或更新的 LTS 版本。

```bash
npm install
npm run dev
```

终端会显示本地地址。手机与电脑处于同一网络时，可使用 Vite 的网络参数：

```bash
npm run dev -- --host
```

## 测试与构建

```bash
npm test
npm run build
npm run preview
```

生产文件位于 `dist/`。项目使用相对资源路径，因此也可将该目录部署到任意静态托管服务的子路径。

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy-pages.yml`。首次使用时：

1. 打开 GitHub 仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 中将 Source 设为 **GitHub Actions**。
3. 推送到 `main`，或在 Actions 页面手动运行 **Deploy to GitHub Pages**。

工作流会依次执行 `npm ci`、测试、构建，再发布 `dist/`。

## 存档与隐私

- 自动存档只存在当前浏览器的 `localStorage`，没有服务器同步。
- JSON 导出包含双方全部手牌，请勿向不应查看手牌的人展示文件内容。
- 应用打开、导入存档、切换阵营和结束回合时会显示不含手牌的隐私确认页。
- 清除站点数据会删除浏览器存档；长期战局建议定期导出 JSON。

## Prototype 数据

`src/prototype-data.ts` 明确标注为前端 prototype 适配数据。地图区域、共享边界、受控海峡和回合阶段根据以下项目文件整理：

- `sources/map.png`
- `sources/ARTG006-QuartermasterGeneralWW2-Rulebook-EN-web.pdf`
- `sources/ARTG010-QuartermasterGeneralWW2-TotalWar-Rulebook-EN-web.pdf`

原始 `sources/` 文件保持只读；前端使用未修改的地图副本 `public/qmg-map.png`。适配层不替代现有 Python domain/rules 模型，后续若仓库提供稳定的浏览器数据接口，可替换该层而无需重写 UI 和本地存档流程。

地图框架遵循规则书中的连接原则：共享边界才算相邻，只在一点接触不算相邻；中东与巴尔干、黑海与地中海明确不相邻；地图东西边缘首尾相接。海峡是两片海域间的条件相邻，由标有锚点的陆地区域控制。当前原型会限制手动海军移动能否通过海峡，但建造、战斗和补给仍由玩家判断。

## 当前限制

- 没有 AI、联网、账号或跨设备同步。
- 不自动执行卡牌效果，不自动计算战斗、补给或胜负。
- 地图连接数据由规则地图人工适配，尚未经过出版方的官方数字地图数据校验。
- 单位“移动”是原型提供的局面编辑工具；实体规则主要通过建造、招募、战斗和卡牌效果改变棋子位置。
- 不自动判定建造合法性、每国棋子总量、每国每区域一个棋子的限制、补给、战斗或计分。
- Total War 的空军阶段已可显示，但空军棋子、法国和中国棋子尚未加入局面编辑器。
- 没有动画、完整正式卡牌库或正式应用美术。
- service worker 会在首次联网访问并加载资源后提供离线能力。
