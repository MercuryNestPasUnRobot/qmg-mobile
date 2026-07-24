# 战场军需官手机版（Prototype）

一个 mobile-first、无后端、可离线使用的本地单人双阵营桌游辅助原型。玩家在同一台手机上轮流操作 Axis 与 Allies；局面自动保存在浏览器中。

> 本项目当前是 **prototype**，不是完整的规则引擎。卡牌效果、战斗、补给与胜负条件由玩家按实体规则手动判断。

## 已实现

- 新建游戏，Axis / Allies 阵营交接与全屏隐私遮罩
- 六国回合顺序、当前国家、轮数和回合阶段
- 15 个 prototype 区域组成的简化节点地图
- 陆军 / 海军放置、相邻移动和移除
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

`src/prototype-data.ts` 明确标注为前端 prototype 适配数据。它仅提供六国、简化区域邻接关系和占位卡牌，不声称与正式地图、卡牌内容或完整开局配置一致。后续若仓库提供稳定的浏览器数据接口，可以替换这个适配层，而无需改动 UI 和本地存档流程。

## 当前限制

- 没有 AI、联网、账号或跨设备同步。
- 不自动执行卡牌效果，不自动计算战斗、补给或胜负。
- 单位移动只检查陆海类型与简化地图的相邻关系。
- 没有正式美术、动画、完整卡牌库和完整地图。
- service worker 会在首次联网访问并加载资源后提供离线能力。
