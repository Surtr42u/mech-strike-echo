# 机甲突袭 · 回响 / MECH STRIKE · ECHO

单人生存类 roguelike 网页游戏。选择驾驶员、主武器与机甲，穿越五个战区，每区十四波敌潮后挑战关底首领；通关后解锁无尽爬塔。

- 在线游玩：https://surtr42u.github.io/mech-strike-echo/
- 技术栈：原生 JavaScript + Canvas 2D + Three.js（场景壳），零构建、零依赖安装
- 存档：浏览器 `localStorage`（键 `mr_prof_v2`），被禁用时回退 cookie

## 本地运行

`dist/` 是完整可运行目录，直接用任意静态服务器打开即可：

```bash
cd dist
python -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/
```

不要用 `file://` 直接打开：贴图与字体按相对路径加载，需要 HTTP 环境。

## 目录

```
dist/
├─ index.html         # 26 个 <script defer>，顺序即依赖声明
├─ game.js            # 主循环、渲染、武器/皮肤/Boss 数据表（约 9.5k 行）
├─ campaign.js        # 战役波次、敌人编成、难度开关与自适应难度
├─ hexes.js           # 海克斯卡池、选牌计划、质变/升彩
├─ talents.js         # 普通强化与海克斯选择界面
├─ growth.js          # 补给站永久模块、技能槽
├─ preparations.js    # 战前准备（含海克斯扩容）
├─ endless.js         # 无尽塔
├─ …                  # 其余为场景、地图、弹道、Boss 等模块
├─ assets/            # 贴图、字体
└─ vendor/            # three.min.js
```

新增模块时，必须同时加入 `index.html` 的脚本列表，并保证被依赖的模块先加载（全部是全局脚本，没有模块打包）。

## 操作

| 操作 | 键位 |
| --- | --- |
| 移动 | WASD / 方向键 / 左侧拖动摇杆 |
| 角色必杀 / 武器技 | E / Q |
| 变身机甲 / 机甲技 | F |
| 战术道具 | 1 / 2 |
| 战区地图 | M |
| 战场机关 | 靠近按 R / 点机关按钮 |
| 暂停 | P / Esc |

触屏：左半屏拖动移动，右下按钮释放技能；海克斯/强化选择可直接点卡牌。

## 数值调整入口

- **全局难度**：`campaign.js` 顶部的 `DIFFICULTY`
  - `enemyCount` 刷怪频率倍率、`enemyHp` / `enemyDamage` 敌人生命与伤害
  - `bossHp` / `bossDamage` 首领生命与伤害
- **动态难度**：`campaign.js` 的 `AdaptiveDirector`
  - 按每波掉血比例与击倒次数累积 `heat ∈ [-1, 1]`
  - 正向加压、负向舒缓；HUD 波次面板显示「威胁 · 状态 ±%」
- **波次基础曲线**：`campaign.js` 的 `CampaignBalance` / `ThreatPacing`
- **特殊波次**：`campaign.js` 的 `WaveTypes`
  - 每个战区随机排出 3–4 波：怪潮（数量压制）、高危（精英集群）、突袭（高速单位）、炮火（远程压制）
  - 每区保底 1 波怪潮 + 1 波高危，种子每局重掷
  - 波次面板显示「侦察 · 怪潮」这类标签，悬停可看完整说明
- **地图随机异常**：`stage-events.js` 的 `anomalies`
  - 每区随机一个整区生效的异常：磁暴、补给信号、地脉震动、沙暴、虚空潮汐、装甲残骸
  - 进入战区时横幅播报，HUD 常驻显示剩余波次；同一局不重复，无尽塔不启用
- **技能等级上限**：`game.js` 的 `SKILL_LEVEL_CAP_BONUS`
  - 常规技能上限统一 +2（例如连射 6→8、多重弹 4→6）；`max:99` 的成长型牌不受影响
- **Boss 渲染**：`boss-models.js` / `boss-effects.js`
  - 每个 Boss 增加背光剪影、装甲渐变、轮缘光、接触阴影与分件视差；阶段切换用核心辉光/裂纹/蒸汽表达
  - 低画质 `QLEVEL=0` 自动退化为平涂与单层剪影；预警线/冲击环整体透明度已下调
- **小怪特效**：`enemy-effects.js` + `game.js` 的 `drawEnemy`
  - 敌弹按场景统一色相、拖尾缩短；死亡溶解碎片量与白色闪光大幅下降；普通怪不再叠加彩色轮廓光

## 地图机制

- **第一区 · 落日废土**
  - 地表持续沙暴：每秒 2 点侵蚀伤害 + 视野压缩，庇护点内免疫，逼玩家下井
  - 地下箱庭：卸料厅（12 只）→ 泵房（14 只）→ 排风配电室（高血量小 Boss）
  - 进入地下后普通波次冻结、升降机锁定；小 Boss 击破并启动排风后才能返回地表，沙暴同时停止
- **第二区 · 霓虹雨夜**：引雷塔未接通前周期性雷击预警；接通后转为三道友方落雷
- **第三区 · 冰封矿场**：断崖阻断矿井层，启动地热架桥阀展开冰桥后才能到对岸
- **第四区 · 熔岩工厂**：熔岩水位 0–3 级持续上涨，开启冷却阀清池并进入冷却
- **第五区 · 虚空核心**：相位锚未校准前周期性虚空塌陷，首次跃迁后停止
- **站点支援**：在支援信标停留 3.5 秒呼叫，18 秒后抵达；类型为临时哨戒炮或三轮定向炮击，之后进入 45–57 秒冷却

相关入口：
- `field-maps.js`：`dungeonActive()/dungeonInfo()/tickDungeon()`、`liftLocked()`、`bridgeOpen()/cliffBlocked()`
- `sector-climate.js`：`surfaceHazard()/stormStatus()`、`facilityStatus()`、`supportStatus()/readySupport()/consumeSupport()`
- `game.js`：`updateFieldHazards()`、`supportStrike()`、`reformWaveEnemies()`（换层清场）

## 选卡交互

- 卡片入场按 1–5 张错峰淡入；点选后 160ms 内锁定输入，选中卡高亮 + 勾选、其余变暗，再结算
- 替换槽位与海克斯已持有状态有独立徽标；`prefers-reduced-motion` 下只保留颜色变化
- 刷新、跳过、取消、升彩在选中动效期间会被安全忽略
- **海克斯选牌次数**：`hexes.js` 的 `baseMilestones` 与 `extraMilestones`
  - 默认每局 4 次；补给站「海克斯扩容」每级 +1 次，最多 6 次
- **海克斯卡牌**：`hexes.js` 的 `cards` 与 `tags`（新卡需要同时补 tag）
- **技能槽上限**：`growth.js` 的 `BASE_SKILL_CAPACITY` 与「技能扩容」模块

## 发布

`main` 分支只保存 `dist/` 源码；GitHub Pages 从 `gh-pages` 分支根目录发布。更新线上版本时把 `dist/` 的内容同步到 `gh-pages`。

## 注意

- `game.js` 体积较大，改动前先确认相关数据表位置（武器 183 行、皮肤 532 行、Boss 5564 行附近）。
- 所有脚本共享全局作用域，新增全局名称前先搜索是否重名。
- 触屏与桌面共用同一套 DOM，HUD 尺寸通过 `terminal.css` 里的 `@media(pointer:coarse)` 调整。
