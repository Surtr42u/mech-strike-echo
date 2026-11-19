/* ══════════════════════════════════════════════════════════
   机甲突袭 · 回响 — 2.5D 俯视肉鸽
   ══════════════════════════════════════════════════════════ */

/* ── 工具 ── */
const TAU = Math.PI * 2;
function clamp(v,a,b){ return v < a ? a : v > b ? b : v; }
function lerp(a,b,t){ return a + (b - a) * t; }
function rnd(a,b){ return a + Math.random() * (b - a); }
function ri(a,b){ return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(a){ return a[(Math.random() * a.length) | 0]; }
function d2(ax,ay,bx,by){ const dx = ax-bx, dy = ay-by; return dx*dx + dy*dy; }
function dst(ax,ay,bx,by){ return Math.sqrt(d2(ax,ay,bx,by)); }
function mulberry(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function angLerp(a,b,t){
  let d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
  return a + d * t;
}

/* ── 世界常量 ── */
const KZ = 0.62;                    // 深度压缩：斜俯视的关键
const ARENA = { w: 1440, h: 960 };
const VIEW_W = 480, VIEW_H = 280;   // 逻辑视口（缩放基准）
const BULLET_H = 15;                // 子弹离地高度（视觉）
const WAVES_PER_STAGE = 14;

/* ── 五个场景 ── */
const SCENES = [
  { name:'落日废土', code:'S01 · WASTELAND',
    g:['#4a3427','#3a281e','#57402f','#2d1f18'], line:'rgba(255,170,110,.09)',
    accent:'#ff9a5c', prop:['rock','crate'], deco:'dust',
    boss:'crusher' },
  { name:'霓虹雨夜', code:'S02 · NEON RAIN',
    g:['#1c2542','#151c33','#26325a','#101627'], line:'rgba(90,220,255,.13)',
    accent:'#57e0ff', prop:['crate','pillar'], deco:'neon',
    boss:'hive' },
  { name:'冰封矿场', code:'S03 · FROZEN MINE',
    g:['#2b3d4c','#1f2d39','#3a5264','#17232c'], line:'rgba(180,240,255,.12)',
    accent:'#9fe8ff', prop:['crystal','rock'], deco:'ice',
    boss:'frost' },
  { name:'熔岩工厂', code:'S04 · MELTDOWN',
    g:['#3b2620','#2a1a15','#4d3125','#1e120e'], line:'rgba(255,120,60,.12)',
    accent:'#ff7a3c', prop:['pipe','crate'], deco:'lava',
    boss:'molten' },
  { name:'虚空核心', code:'S05 · VOID CORE',
    g:['#241838','#180f28','#33214d','#100a1c'], line:'rgba(200,130,255,.14)',
    accent:'#c77dff', prop:['crystal','pillar'], deco:'void',
    boss:'void' }
];

/* 关卡环境色：overlay/soft-light 统一色调 */
const ENV_TINT = ['#ff8a3c', '#2a6ae0', '#7fd8ff', '#ff5a1e', '#a050ff'];

/* 主角辨识度：每关给主角配一圈"不会被背景吃掉"的对比色描边。
   rim  = 左上受光的轮廓色（要跟关卡主色调反着走）
   dark = 深色分离轮廓强度（背景越亮越大，让白甲不从浅底上"化开"） */
const HERO_SEP = [
  { rim:'#fff4d8', a:.24, dark:.14 },  // 落日废土：暖褐底，中性月白边
  { rim:'#ffc2ee', a:.30, dark:.16 },  // 霓虹雨夜：暗蓝紫底，补粉边提亮
  { rim:'#ff9a3c', a:.34, dark:.46 },  // 冰封矿场：惨白底，暖橙边 + 重暗轮廓
  { rim:'#8fe6ff', a:.32, dark:.34 },  // 熔岩工厂：橙红底，冷青边 + 暗轮廓
  { rim:'#9dffcf', a:.30, dark:.26 }   // 虚空核心：紫黑底，薄荷边
];

/* ── 主地标：每关一个固定位置的大型视觉锚点（无碰撞体） ──
   kind 与道具共用同一套系统，只是多一个 lm:true 标记；
   h/r 是屏幕像素尺度的身高与占地，位置避开中央开阔区。 */
const LANDMARKS = [
  { kind:'wreck',     name:'坠毁机甲',   x:327, y:755, r:74, h:104 },
  { kind:'billboard', name:'霓虹广告牌', x:1171, y:285, r:46, h:124 },
  { kind:'drill',     name:'废弃钻塔',   x:335, y:288, r:42, h:138 },
  { kind:'furnace',   name:'熔炉残骸',   x:1138, y:731, r:64, h:112 },
  { kind:'obelisk',   name:'虚空核心碑', x:989, y:253, r:36, h:138 }
];

/* 道具成组样式：箱=堆叠、石=围圈、晶=同基点丛生、柱/管=并排 */
const GROUP_STYLE = {
  crate:'stack', rock:'ring', crystal:'cluster', pillar:'pair', pipe:'pair'
};

/* ── 技能定义（保留旧天赋 ID，常规牌池见 talents.js） ── */
const SKILL_DEFS = [
  { id:'rapid', n:'连射', ic:'»', c:'#8fe3ff', max:6,
    d:l=>'射速 +' + (16*l) + '%', ap:(s,l)=>{ s.rateMul += .16*l; } },
  { id:'power', n:'重弹', ic:'◆', c:'#ffb45c', max:6,
    d:l=>'子弹伤害 +' + (4*l), ap:(s,l)=>{ s.dmg += 4*l; } },
  { id:'multi', n:'多重弹', ic:'⋔', c:'#ff9ad5', max:4,
    d:l=>'每次额外射出 ' + l + ' 发', ap:(s,l)=>{ s.extra += l; } },
  { id:'pierce', n:'穿透弹', ic:'➤', c:'#9dffc8', max:4,
    d:l=>'可穿透 ' + l + ' 个敌人' + WeaponLinks.talentHint('pierce'), ap:(s,l)=>{ s.pierce += l; } },
  { id:'crit', n:'致命', ic:'✧', c:'#ffe58a', max:5,
    d:l=>'暴击率 +' + (9*l) + ' 个百分点，上限 95%', ap:(s,l)=>{ s.crit += .09*l; } },
  { id:'speed', n:'疾行', ic:'≡', c:'#a8e6ff', max:4,
    d:l=>'移动速度 +' + (10*l) + '%', ap:(s,l)=>{ s.spdMul += .10*l; } },
  { id:'hp', n:'装甲板', ic:'▣', c:'#9fb8d8', max:5,
    d:l=>'生命上限 +' + (16*l), ap:(s,l)=>{ s.maxHp += 16*l; } },
  { id:'regen', n:'再生', ic:'✚', c:'#7dffb0', max:4,
    d:l=>'每秒回复 ' + (0.8*l).toFixed(1) + ' 生命', ap:(s,l)=>{ s.regen += .8*l; } },
  { id:'armor', n:'力场', ic:'⛨', c:'#b9c7ff', max:4,
    d:l=>'受到伤害 -' + (10*l) + '%', ap:(s,l)=>{ s.armor += .10*l; } },
  { id:'magnet', n:'磁力', ic:'⊹', c:'#ffd08a', max:3,
    d:l=>'拾取范围 +' + (50*l) + '%', ap:(s,l)=>{ s.magnet += .5*l; } },
  { id:'leech', n:'嗜血', ic:'♥', c:'#ff7c9c', max:4,
    d:l=>'击杀回复 ' + (1.3*l).toFixed(1) + ' 生命', ap:(s,l)=>{ s.leech += 1.3*l; } },
  { id:'thorns', n:'尖刺', ic:'✹', c:'#ffa08a', max:3,
    d:l=>'接触反伤 ' + (10*l) + ' 点', ap:(s,l)=>{ s.thorns += 10*l; } },
  { id:'burn', n:'燃烧弹', ic:'☄', c:'#ff8f5c', max:4,
    d:l=>'命中附加灼烧 ' + (3.2*l).toFixed(1) + '/秒' + WeaponLinks.talentHint('burn'), ap:(s,l)=>{ s.burn += l; } },
  { id:'freeze', n:'冻结弹', ic:'❄', c:'#9fe8ff', max:4,
    d:l=>'命中基础减速 ' + Math.round(100 * Math.min(PROJECTILE_EFFECTS.slowLimit,PROJECTILE_EFFECTS.slowPerLevel*l)) + '%', ap:(s,l)=>{ s.freeze += l; } },
  { id:'blast', n:'爆裂弹', ic:'✱', c:'#ffc46a', max:4,
    d:l=>'命中产生半径 ' + (22+6*l) + ' 的小爆炸', ap:(s,l)=>{ s.blast += l; } },
  { id:'chain', n:'链电', ic:'⌁', c:'#b9f2ff', max:3,
    d:l=>'命中后弹跳 ' + l + ' 个目标', ap:(s,l)=>{ s.chain += l; } },
  { id:'drone', n:'轨道机炮', ic:'◉', c:'#a9b8ff', max:4,
    d:l=>'环绕机炮 ×' + l + '，自动开火', ap:(s,l)=>{ s.drone += l; } },
  { id:'turret', n:'哨戒炮', ic:'▲', c:'#ffe0a0', max:3,
    d:l=>'每 7 秒部署炮台 ×' + l, ap:(s,l)=>{ s.turret += l; } },
  { id:'mine', n:'地雷', ic:'◇', c:'#ff9d7a', max:3,
    d:l=>'每 2.4 秒自动布雷 ×' + l, ap:(s,l)=>{ s.mine += l; } },
  { id:'boom', n:'回旋刃', ic:'✦', c:'#9dffd8', max:3,
    d:l=>'投出回旋刃 ×' + l, ap:(s,l)=>{ s.boom += l; } },
  { id:'barrage', n:'弹幕风暴', ic:'≋', c:'#ff9d5c', max:3,
    d:l=>'每次射击额外 +' + (l*2) + ' 发散射弹' + (G.weapon==='micromissile'?'；导弹直击后分导追敌':''), ap:(s,l)=>{ s.barrage += l; } },
  { id:'gigantism', n:'巨力', ic:'▦', c:'#ff6a8a', max:99,
    d:l=>'子弹体积 +' + (12*l) + '%（易命中）', ap:(s,l)=>{ s.bigMul += .12*l; } },
  { id:'fleet', n:'疾风', ic:'»', c:'#8effc0', max:99,
    d:l=>'击杀 ' + (4*l) + ' 敌人后 3 秒移速 +35%', ap:(s,l)=>{ s.fleet += l; } },
  { id:'glass', n:'玻璃大炮', ic:'◇', c:'#ff5c7a', max:99,
    d:l=>'伤害 +' + (8*l), risk:l=>'生命上限 -' + (12*l), ap:(s,l)=>{ s.dmg += 8*l; s.maxHp -= 12*l; } },
  { id:'cursed', n:'诅咒之刃', ic:'♆', c:'#c77dff', max:99,
    d:l=>'伤害 +' + (12*l), risk:l=>'移速 -' + (8*l) + '%', ap:(s,l)=>{ s.dmg += 12*l; s.spdMul -= .08*l; } },
  { id:'berserk', n:'狂战士', ic:'⚔', c:'#ff6a5c', max:99,
    d:l=>'伤害 +' + (15*l) + '%', risk:l=>'受到伤害 +' + (10*l) + '%',
    ap:(s,l)=>{ s.dmgPct += .15*l; s.dmgTaken += .10*l; } },
  { id:'greed', n:'贪婪', ic:'⊛', c:'#ffd08a', max:3,
    d:l=>'拾取范围 +' + (80*l) + '%', risk:l=>'击杀不再掉落维修包',
    ap:(s,l)=>{ s.magnet += .8*l; s.noMedkit = true; } },
  { id:'fragile', n:'易碎', ic:'◈', c:'#ff5c7a', max:99,
    d:l=>'暴击率 +' + (15*l) + '%', risk:l=>'最大生命 -' + (25*l),
    ap:(s,l)=>{ s.crit += .15*l; s.maxHp -= 25*l; } }
];
const SK = Object.fromEntries(SKILL_DEFS.map(skill => [skill.id, skill]));
const SKILLS = TALENTS.pool.map(({ id, tag, tags }) => ({ ...SK[id], tag, tags }));

/* ── 战场道具 ──
   mode:'auto' 走过去自动生效 / mode:'bag' 进战术背包（1·2 键或点格释放） */
const ITEMS = [
  { id:'medkit', n:'维修包', ic:'✚', c:'#7dffb0', mode:'auto', w:22, t:'回复 30% 生命' },
  { id:'battery', n:'能量电池', ic:'⚡', c:'#ffb45c', mode:'auto', w:16, t:'机甲能量 +40' },
  { id:'over', n:'超载芯片', ic:'✷', c:'#8fe3ff', mode:'auto', w:16, t:'12 秒 射速 +55% / 伤害 +25%' },
  { id:'magnet', n:'引力核', ic:'⊹', c:'#ffd08a', mode:'auto', w:12, t:'吸走全场经验，磁力 ×2.5' },
  { id:'shield', n:'力场发生器', ic:'⛨', c:'#b9c7ff', mode:'auto', w:14, t:'获得 2 层护盾（各挡一次伤害）' },
  { id:'airstrike', n:'空袭信标', ic:'✈', c:'#ff8a6a', mode:'bag', w:13, t:'标记后连环轰炸 7 轮' },
  { id:'stasis', n:'时滞器', ic:'◷', c:'#c8a0ff', mode:'bag', w:11, t:'全场敌人减速 75%，4.5 秒' },
  { id:'venom', n:'毒雾弹', ic:'☣', c:'#a8e05a', mode:'bag', w:10, t:'全场敌人中毒 8 秒' },
  { id:'emp', n:'电磁脉冲', ic:'⌁', c:'#b9f2ff', mode:'bag', w:9, t:'清空敌弹，敌人麻痹 2.5 秒' },
  { id:'nuke', n:'灭绝令', ic:'☢', c:'#ffe58a', mode:'bag', w:4, t:'全屏 130 伤害，稀有' }
];
const IT = {}; ITEMS.forEach(function(o){ IT[o.id] = o; });
const IT_W = ITEMS.reduce(function(a, o){ return a + o.w; }, 0);
function rollItem(){
  /* 银面 / 贪婪：击杀不再掉落维修包 */
  const noMed = !!(G.st && G.st.noMedkit);
  let r = Math.random() * (noMed ? IT_W - 22 : IT_W);
  for(let i=0;i<ITEMS.length;i++){
    if(noMed && ITEMS[i].id === 'medkit') continue;
    r -= ITEMS[i].w; if(r <= 0) return ITEMS[i].id;
  }
  return noMed ? 'battery' : 'medkit';
}
const MAX_BAG = 2;

/* ══════════ 武器 ══════════
   每把武器 = 弹道参数 + 一个主动技（Q / 右下按钮） */
const WEAPONS = [
  { id:'rifle', class:'rifle', n:'突击步枪', ic:'⟶', c:'#9fd8ff', price:0, tag:'均衡',
    desc:'中速连射，稳定的通用武器',
    dmg:9, rate:.46, spd:430, count:1, spread:.045, pierce:0, crit:.05, br:2.8, life:1.15,
    sk:{ n:'火力压制', ic:'⁂', cd:14, t:'4 秒射速 ×2.4、穿透 +2' } },

  { id:'shotgun', class:'shotgun', n:'霰弹枪', ic:'⋔', c:'#ffb45c', price:800, tag:'近战',
    desc:'5 发扇形弹丸。距离越近，同时命中的弹丸越多',
    dmg:5.4, rate:.74, spd:350, count:5, spread:.40, pierce:0, crit:.04, br:3.2, life:.42,
    sk:{ n:'推进冲击', ic:'»', cd:11, t:'向前突进，在落点释放近身冲击波' } },

  { id:'sniper', class:'precise', n:'磁轨炮', ic:'⊹', c:'#c8a0ff', price:1000, tag:'远程',
    desc:'直线高速重弹，可贯穿 3 次。每次贯穿后伤害递减。' + WeaponLinks.weaponHint('sniper'),
    dmg:33, rate:1.0, spd:920, count:1, spread:.008, pierce:3, crit:.16, br:2.4, life:1.6,
    sk:{ n:'贯穿射线', ic:'✦', cd:16, t:'朝瞄准方向射出必定暴击的贯穿光束' } },

  { id:'smg', class:'rifle', n:'双持冲锋', ic:'⇉', c:'#8fe3ff', price:1200, tag:'高频',
    desc:'极快射速，单发伤害低',
    dmg:4.2, rate:.125, spd:480, count:1, spread:.13, pierce:0, crit:.03, br:2.1, life:.8,
    sk:{ n:'环射弹幕', ic:'◎', cd:12, t:'向四周倾泻 24 发子弹' } },

  { id:'launcher', class:'heavy', n:'榴弹炮', ic:'◉', c:'#ff8a5c', price:1500, tag:'爆裂',
    desc:'弹道落点爆炸，清群优秀',
    dmg:15, rate:.95, spd:300, count:1, spread:.03, pierce:0, crit:.04, br:5, life:1.25, boom:true,
    sk:{ n:'饱和轰炸', ic:'✹', cd:15, t:'齐射 6 发榴弹覆盖前方' } },

  { id:'arc', class:'tech', n:'电弧枪', ic:'⌁', c:'#b9f2ff', price:2000, tag:'连锁',
    desc:'每次命中最多连锁电击附近 2 个目标',
    dmg:7, rate:.30, spd:540, count:1, spread:.05, pierce:1, crit:.07, br:3, life:.9,
    sk:{ n:'电磁风暴', ic:'⌇', cd:18, t:'清除敌弹，电击并麻痹场上敌人' } },

  /* ── 第二世代：对照军械图集新增 ── */
  { id:'pistol', class:'precise', n:'制式手枪', ic:'⌐', c:'#ffe07a', price:300, tag:'精准',
    desc:'单发精准，射速轻快，续航稳',
    dmg:8, rate:.30, spd:600, count:1, spread:.028, pierce:0, crit:.12, br:2.2, life:1.0,
    sk:{ n:'五连速射', ic:'⁙', cd:10, t:'六发精准点射，射速短暂 ×1.8' } },

  { id:'revolver', class:'precise', n:'转轮手枪', ic:'✹', c:'#ffb84d', price:900, tag:'重击',
    desc:'单发高伤，暴击率极高',
    dmg:18, rate:.60, spd:560, count:1, spread:.02, pierce:1, crit:.28, br:2.6, life:1.1,
    sk:{ n:'六芒轮射', ic:'✳', cd:13, t:'六个方向各射一发重弹' } },

  { id:'minigun', class:'rifle', n:'加特林', ic:'≋', c:'#ff9d5c', price:1600, tag:'高频',
    desc:'七管旋转，泼洒弹雨',
    dmg:3.6, rate:.075, spd:520, count:1, spread:.17, pierce:0, crit:.04, br:1.9, life:.85,
    sk:{ n:'枪管过热', ic:'✺', cd:14, t:'5 秒射速 ×2.8、穿透 +2' } },

  { id:'flamer', class:'elemental', n:'火焰喷射', ic:'≈', c:'#ff7a3c', price:1400, tag:'近战', reach:250,
    desc:'短程持续喷火，贯穿并点燃命中的敌人。' + WeaponLinks.weaponHint('flamer'),
    dmg:3.2, rate:.05, spd:330, count:1, spread:.30, pierce:4, crit:.03, br:5.5, life:.36,
    sk:{ n:'烈焰吐息', ic:'✷', cd:12, t:'前方火墙，命中点燃 3 秒' } },

  { id:'laser', class:'tech', n:'激光步枪', ic:'⌁', c:'#7ef0ff', price:1300, tag:'穿透',
    desc:'高速光束，一穿到底',
    dmg:12, rate:.32, spd:1080, count:1, spread:.012, pierce:2, crit:.10, br:2.0, life:.9,
    sk:{ n:'棱镜折射', ic:'◈', cd:15, t:'三道折射光束贯穿战场' } },

  { id:'plasma', class:'heavy', n:'等离子炮', ic:'◉', c:'#c08cff', price:2200, tag:'爆裂',
    desc:'缓慢重弹，落点核爆',
    dmg:32, rate:.95, spd:330, count:1, spread:.02, pierce:0, crit:.06, br:7, life:1.3, boom:true,
    sk:{ n:'奇点坍缩', ic:'❂', cd:17, t:'牵引前方敌人后引爆' } },

  { id:'frost', class:'elemental', n:'霜冻枪', ic:'❄', c:'#9fe8ff', price:1100, tag:'控制',
    desc:'命中减速，越冷越脆',
    dmg:6.5, rate:.26, spd:480, count:1, spread:.06, pierce:1, crit:.06, br:4, life:.9,
    sk:{ n:'绝对零度', ic:'❅', cd:16, t:'冰封全场 3.2 秒并碎冰' } },

  { id:'rail', class:'precise', n:'轨道炮', ic:'⊹', c:'#bfe6ff', price:2600, tag:'贯穿',
    desc:'超长蓄力弹，穿透整队',
    dmg:58, rate:1.7, spd:1500, count:1, spread:.006, pierce:6, crit:.18, br:3, life:1.2,
    sk:{ n:'轨道炮击', ic:'✧', cd:18, t:'全屏贯穿轰击并击退' } },

  { id:'bow', class:'precise', n:'磁力弓', ic:'⤢', c:'#8ef0c0', price:1100, tag:'远程',
    desc:'双箭齐发，路径笔直',
    dmg:21, rate:.55, spd:820, count:2, spread:.10, pierce:1, crit:.14, br:2.2, life:1.2,
    sk:{ n:'箭雨', ic:'⇣', cd:14, t:'14 支磁箭从空中落下' } },

  { id:'nailgun', class:'shotgun', n:'钉枪', ic:'⁙', c:'#ffd0a0', price:1000, tag:'高频',
    desc:'短程钢钉，穿透力强',
    dmg:4.4, rate:.09, spd:680, count:1, spread:.09, pierce:2, crit:.05, br:1.8, life:.5,
    sk:{ n:'钉墙', ic:'⫴', cd:12, t:'五排钢钉覆盖前方' } },

  { id:'acid', class:'elemental', n:'酸液枪', ic:'☣', c:'#a8e05a', price:1200, tag:'持续',
    desc:'腐蚀弹丸，命中留酸',
    dmg:5.5, rate:.22, spd:420, count:1, spread:.10, pierce:1, crit:.05, br:4.5, life:.9,
    sk:{ n:'酸池', ic:'≈', cd:13, t:'前方生成三处腐蚀池' } },

  { id:'orbgun', class:'tech', n:'相位球枪', ic:'◍', c:'#a0a8ff', price:1800, tag:'穿透',
    desc:'慢速相位球，穿透整场',
    dmg:15, rate:.70, spd:230, count:1, spread:.04, pierce:99, crit:.08, br:8, life:1.8,
    sk:{ n:'相位奇点', ic:'◍', cd:15, t:'放出四颗追踪相位球' } },

  /* ── 第三世代军械（图集新增 10 把，技能走通用派发）── */
  { id:'carbine', class:'rifle', n:'卡宾枪', ic:'⟶', c:'#a8d8ff', price:1900, tag:'均衡',
    desc:'轻量枪身，穿透一发',
    dmg:8.4, rate:.38, spd:460, count:1, spread:.035, pierce:1, crit:.07, br:2.6, life:1.0,
    sk:{ n:'战术速射', ic:'⁂', cd:13, t:'4 秒射速 ×2.4', g:'focus' } },

  { id:'pdw', class:'rifle', n:'紧凑冲锋', ic:'⇉', c:'#9fe0ff', price:2100, tag:'高频',
    desc:'袖珍机身，泼水式射速',
    dmg:3.4, rate:.09, spd:520, count:1, spread:.15, pierce:0, crit:.04, br:1.8, life:.8,
    sk:{ n:'弹匣倾泻', ic:'≋', cd:14, t:'5 秒射速 ×2.8、穿透 +2', g:'focus' } },

  { id:'marksman', class:'precise', n:'精确射手', ic:'⊹', c:'#d0b0ff', price:2400, tag:'精准',
    desc:'高暴击长枪，点谁谁倒',
    dmg:26, rate:.80, spd:880, count:1, spread:.01, pierce:2, crit:.24, br:2.2, life:1.3,
    sk:{ n:'穿甲射击', ic:'✦', cd:14, t:'一道贯穿光束，暴击必中', g:'beam' } },

  { id:'coilgun', class:'tech', n:'线圈炮', ic:'⌁', c:'#9ff0ff', price:2500, tag:'贯穿',
    desc:'电磁加速，穿透整排',
    dmg:20, rate:.70, spd:700, count:1, spread:.02, pierce:4, crit:.12, br:3.4, life:1.2,
    sk:{ n:'超导放电', ic:'⌇', cd:15, t:'超长贯穿光束 + 击退', g:'beam' } },

  { id:'cryocannon', class:'elemental', n:'冷冻炮', ic:'❄', c:'#c8f4ff', price:2600, tag:'控制',
    desc:'三连冰弹，成片冻结',
    dmg:12, rate:.55, spd:420, count:3, spread:.16, pierce:1, crit:.05, br:4.2, life:.8,
    sk:{ n:'极寒喷发', ic:'❅', cd:16, t:'半径 190 冻结并碎冰', g:'nova' } },

  { id:'micromissile', class:'heavy', n:'微型导弹', ic:'◉', c:'#ffa070', price:2700, tag:'爆裂',
    desc:'追踪弹头命中或落地爆炸。持有「弹幕风暴」后，主弹直击可分出两枚小导弹，各追一个附近目标。',
    dmg:10, rate:.55, spd:380, count:1, spread:.05, pierce:0, crit:.04, br:4.4, life:1.4, boom:true,
    sk:{ n:'齐射饱和', ic:'✹', cd:13, t:'齐射 8 枚追踪导弹，爆炸波及附近敌人', g:'salvo', count:8 } },

  { id:'tesla', class:'tech', n:'特斯拉枪', ic:'⌇', c:'#b0f8ff', price:2800, tag:'连锁',
    desc:'持续放电，连锁跳弹',
    dmg:6, rate:.22, spd:620, count:1, spread:.04, pierce:2, crit:.06, br:2.6, life:.9,
    sk:{ n:'雷暴', ic:'⌁', cd:14, t:'十道连锁雷击', g:'storm' } },

  { id:'shardgun', class:'shotgun', n:'碎片霰弹', ic:'⋔', c:'#ffd08a', price:2900, tag:'近战',
    desc:'六枚金属碎片，贴脸撕开',
    dmg:4.2, rate:.80, spd:380, count:6, spread:.46, pierce:0, crit:.04, br:3, life:.40,
    sk:{ n:'破片风暴', ic:'✺', cd:12, t:'周身 150 破片爆散', g:'blast' } },

  { id:'hunter', class:'precise', n:'猎手弓', ic:'⤢', c:'#9ff0c0', price:3000, tag:'远程',
    desc:'双箭齐发，弹道极直',
    dmg:24, rate:.62, spd:900, count:2, spread:.07, pierce:2, crit:.16, br:2.2, life:1.2,
    sk:{ n:'猎杀标记', ic:'⇣', cd:13, t:'六支追踪箭', g:'salvo' } },

  { id:'toxin', class:'elemental', n:'毒素喷射', ic:'☣', c:'#b0e860', price:3100, tag:'持续',
    desc:'腐蚀雾团，越打越毒',
    dmg:3.0, rate:.07, spd:300, count:1, spread:.34, pierce:3, crit:.03, br:4.8, life:.40,
    sk:{ n:'毒云扩散', ic:'≈', cd:15, t:'半径 190 腐蚀并点燃', g:'nova' } }
];
const WP = {}; WEAPONS.forEach(function(w){ WP[w.id] = w; });
function WEP(){ return WP[G.weapon] || WEAPONS[0]; }

/* ══════════ 存档：积分 / 已购 ══════════ */
const PKEY = 'mr_prof_v2';

/* 存档读写：优先 localStorage，被浏览器/沙盒禁用时退回 cookie。
   预览面板里的 iframe 常常禁掉 localStorage，这会让积分每局归零。 */
function storeSet(k, v){
  try{ localStorage.setItem(k, v); return 'ls'; }catch(e){}
  try{ document.cookie = k + '=' + encodeURIComponent(v) + ';path=/;max-age=31536000;SameSite=Lax'; if(storeGet(k) === v) return 'cookie'; }catch(e){}
  return '';
}
function storeGet(k){
  try{ const v = localStorage.getItem(k); if(v) return v; }catch(e){}
  try{
    const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
    if(m) return decodeURIComponent(m[1]);
  }catch(e){}
  return null;
}
/* 开局赠礼：新档直接 5000，老档第一次读到时补发一次 */
const GIFT_PTS = 5000;
const PROF = {
  ver:4,
  pts:GIFT_PTS, total:0, best:0, runs:0, gift:1, giftFx:1,
  skin:0, weapon:'rifle', mech:DEFAULT_MECH,
  ownSkins:[0], ownWeapons:['rifle'],
  growth:{ levels:{}, weaponLevels:{} },
  preparations:{}
};
let loadedProf = null;
function loadProf(){
  try{
    const raw = storeGet(PKEY);
    if(!raw){ PROF.gift = 1; return; }   /* 全新存档：默认值已是 5000 */
    const o = JSON.parse(raw);
    if(!o || typeof o !== 'object' || Array.isArray(o)) return;
    loadedProf = o;
    if(typeof o.pts === 'number') PROF.pts = Math.max(0, o.pts | 0);
    PROF.gift = o.gift ? 1 : 0;
    if(!PROF.gift){
      PROF.pts += GIFT_PTS;
      PROF.gift = 1;
      PROF.giftFx = 1;
    }
    if(typeof o.total === 'number') PROF.total = Math.max(0, o.total | 0);
    if(typeof o.best === 'number') PROF.best = Math.max(0, o.best | 0);
    if(typeof o.runs === 'number') PROF.runs = Math.max(0, o.runs | 0);
    /* 角色表换过一代：旧存档的角色解锁不再对应，积分保留 */
    const fresh = o.ver !== 4;
    if(!fresh && Array.isArray(o.ownSkins)){
      PROF.ownSkins = o.ownSkins.filter(function(i){ return i >= 0 && i < SKINS.length; });
      if(PROF.ownSkins.indexOf(0) < 0) PROF.ownSkins.push(0);
    }
    if(Array.isArray(o.ownWeapons)){
      PROF.ownWeapons = o.ownWeapons.filter(function(id){ return typeof id === 'string' && Object.hasOwn(WP,id); });
      if(PROF.ownWeapons.indexOf('rifle') < 0) PROF.ownWeapons.push('rifle');
    }
    if(!fresh && typeof o.skin === 'number' && PROF.ownSkins.indexOf(o.skin) >= 0) PROF.skin = o.skin;
    if(typeof o.weapon === 'string' && PROF.ownWeapons.indexOf(o.weapon) >= 0) PROF.weapon = o.weapon;
    PROF.growth = readGrowth(o.growth);
    PROF.preparations = PREPARATIONS.read(o.preparations);
    PROF.mech = equippedMech(o.mech);
  }catch(e){}
}
function saveProf(){
  const data = JSON.stringify({...loadedProf,...PROF});
  const saved = storeGet(PKEY) === data || storeSet(PKEY,data);
  byId('saveStatus').textContent = saved ? '本机存档' : '仅本次会话';
}
function ownSkin(i){ return PROF.ownSkins.indexOf(i) >= 0; }
function ownWep(id){ return PROF.ownWeapons.indexOf(id) >= 0; }

/* 随机事件奖励的「真积分」：直接进补给站余额并立即落盘。
   局内分数 G.score 只参与本局结算，事件里写「积分」就必须走这里。 */
function grantPoints(n, label){
  n = Math.max(0, Math.round(n));
  if(!n) return 0;
  PROF.pts += n;
  PROF.total += n;
  saveProf();
  if(typeof updateLoadout === 'function') updateLoadout();
  if(G.p) floatText(G.p.x, G.p.y, (label || '积分') + ' +' + n, '#ffd08a', true);
  return n;
}


/* ── 敌人档案 ── */
const EK = {
  runner: { n:'冲锋兵', hp:17, hpw:2,  spd:76, r:9,  dmg:7,  xp:2, h:26, c:'#c8463c' },
  gunner: { n:'枪兵',   hp:24, hpw:3,  spd:48, r:9,  dmg:6,  xp:3, h:26, c:'#c9723c', shoot:1.9 },
  tank:   { n:'重甲兵', hp:78, hpw:3.35, spd:33, r:14, dmg:15, xp:6, h:30, c:'#8d7a52' },
  drone:  { n:'无人机', hp:18, hpw:2,  spd:66, r:8,  dmg:5,  xp:3, h:20, c:'#5e8fb8', fly:true, shoot:2.1 },
  bomber: { n:'自爆虫', hp:22, hpw:3,  spd:92, r:10, dmg:26, xp:4, h:20, c:'#b8402f', boom:true },
  caster: { n:'术士',   hp:34, hpw:4,  spd:40, r:10, dmg:9,  xp:5, h:28, c:'#7a5cc4', shoot:2.4 },
  sniper: { n:'狙击手', hp:30, hpw:3,  spd:36, r:9,  dmg:13, xp:4, h:26, c:'#4f7a6a', shoot:2.9, beam:true },
  brute:  { n:'蛮兵',   hp:150, hpw:12, spd:42, r:17, dmg:19, xp:9, h:38, c:'#7a4a3a' },
  burrower:{ n:'裂泥虫', hp:19, hpw:2, spd:87, r:9, dmg:6, xp:2, h:23, c:'#d8a485' },
  shellback:{ n:'壳卫', hp:87, hpw:3.5, spd:39, r:13, dmg:13, xp:6, h:27, c:'#85a28f' },
  lancer:{ n:'锁线枪手', hp:47, hpw:2.2, spd:50, r:14, dmg:13, xp:5, h:34, c:'#ffab85' },
  lobber:{ n:'震雷投手', hp:49, hpw:2.15, spd:49, r:14, dmg:12, xp:5, h:35, c:'#ffd28d' },
  shieldguard:{ n:'护盾支援兵', hp:48, hpw:2.1, spd:54, r:13, dmg:7, xp:5, h:32, c:'#85edd7' },
  bastion:{ n:'锚甲重装', hp:106, hpw:3.5, spd:37, r:20, dmg:19, xp:8, h:45, c:'#ffc887' },
  anchor:{ n:'压场锚兽', hp:81, hpw:2.9, spd:39, r:19, dmg:14, xp:7, h:46, c:'#9be8ff' },
  conjurer:{ n:'裂隙召唤师', hp:74, hpw:2.7, spd:42, r:17, dmg:8, xp:7, h:43, c:'#edb0ff' }
};
/* 同屏敌人上限：超出时移除最早生成的非 Boss 敌人（不掉经验/道具） */
const ENEMY_CAP = 45;

/* ── 角色精灵（Q 版大头 · 时装换色 + 流光） ──
   画布 26 × 25（身体）+ 26 × 7（腿）；锚点在脚底中心。 */
const PAL = {
  H:'#7fd8e0', h:'#3f93b8',            // 头发 主色 / 暗部
  S:'#ffe8d6', s:'#e8bfa2',            // 皮肤 / 腮红
  K:'#28304a', E:'#4f6ce0', B:'#ffffff', // 眼线 / 虹膜 / 高光
  W:'#f4f8fb', w:'#c2d2de',            // 上衣
  R:'#e8484a',                          // 领结 / 描边点缀
  P:'#3b4a6b', p:'#2b3750',             // 裤子（p 为随机磨旧点）
  X:'#232b3a',                          // 鞋
  F:'#ffcf5a',                          // 配饰：花 / 发夹 / 金饰
  Z:'#f2f6fb',                          // 配饰：白领 / 头巾 / 毛领
  C:'#2a3448', c:'#1a2130'              // 外套主色 / 缝线暗部
};
const SPECKLE = { P:'p' };

const BODY = [
  '.........HHHHHHHH.........',
  '.......HHHHHHHHHHHH.......',
  '......HHHHHHHHHHHHHH......',
  '.....HHHHHHHHHHHHHHHH.....',
  '....HHHHHHHHHHHHHHHHHH....',
  '...HHHHHHHHHHHHHHHHHHHH...',
  '...HHHHHHHhhhhhhHHHHHHH...',
  '..HHHHhhSSSSSSSSSShhHHHH..',
  '..HHHhhSSSSSSSSSSSShhHHH..',
  '..HHHhhSKKKSSSSKKKShhHHH..',
  '..HHHhhSBEESSSSEEBShhHHH..',
  '..HHHhhSEEESSSSEEEShhHHH..',
  '..HHHhhSKKKSSSSKKKShhHHH..',
  '..HHHhhSsSSSKKSSSsShhHHH..',
  '...HHHhhSSSSSSSSSShhHHH...',
  '....HHHhhSSSSSSSShhHHH....',
  '.....HHHhhhSSSShhhHHH.....',
  '......WWWWWWWWWWWWWW......',
  '.....WWWWWRRRRRRWWWWW.....',
  '..hHSWWWWWWWWWWWWWWWWSHh..',
  '..hHSWWWWWWWWWWWWWWWWSHh..',
  '..hHSWWWWWWWWWWWWWWWWSHh..',
  '..hHswwwwwwwwwwwwwwwwsHh..',
  '.....PPPPPPPPPPPPPPPP.....',
  '.....PPPPPPPPPPPPPPPP.....',
];
const LEGS = {
  stand:[
    '........PPPP..PPPP........',
    '........PPPP..PPPP........',
    '........PPPP..PPPP........',
    '........PPPP..PPPP........',
    '........PPPP..PPPP........',
    '.......XBBBB..BBBBX.......',
    '.......BBBBB..BBBBB.......',
  ],
  run1:[
    '........PPPP..PPPP........',
    '.......PPPP....PPPP.......',
    '.......PPP......PPP.......',
    '......PPP........PPP......',
    '......PPP........PPP......',
    '.....BBBB........BBBB.....',
    '..........................',
  ],
  run2:[
    '........PPPP..PPPP........',
    '........PPPP..PPPP........',
    '.......PPPP....PPPP.......',
    '.......PPP......PPP.......',
    '.......PPP......PPP.......',
    '......BBBB......BBBB......',
    '..........................',
  ],
  run3:[
    '........PPPP..PPPP........',
    '........PPP....PPP........',
    '.......PPP......PPP.......',
    '......PPP........PPP......',
    '......PPP........PPP......',
    '.....BBBB........BBBB.....',
    '..........................',
  ],
  jump:[
    '........PPPP..PPPP........',
    '.......PPPP....PPPP.......',
    '.......PPP......PPP.......',
    '.......PPP......PPP.......',
    '......BBB........BBB......',
    '..........................',
    '..........................',
  ]
};

/* ── 可操作角色（13 位）──
   pal 覆盖 PAL；hair 发型 / acc 配饰 / cloth 衣饰 = 覆盖层；flow 流光色；
   up = 头顶额外留白（兔耳、兜帽、呆毛用）；act = 专属主动技（E）；pas = 专属被动 */
const SKINS = [
  { id:'lime', name:'青柠雪', price:0, flow:'#8ff0ff', desc:'初始涂装 · 青发白衫',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'雪融', ic:'❄', cd:22, t:'治疗 30% · 清空敌弹 · 2.4s 无敌' },
    pas:{ t:'回春 · 每秒回血+2.0，生命上限 -25%', fn:function(s){ s.regen += 2.0; s.maxHp *= .75; } } },

  { id:'ink', name:'墨鸢', price:600, flow:'#6fe8d8', desc:'墨蓝短发 · 赤瞳风衣',
    hair:'long', acc:'none', cloth:'coat',
    pal:{ H:'#3d4666', h:'#232a44', S:'#ffe4cf', s:'#e5b79b', K:'#141a2c', E:'#e8484a',
      B:'#ffd8d0', W:'#2f5c55', w:'#1e3f3a', R:'#d8b45a', P:'#1b2233', p:'#141a26',
      X:'#0e1218', F:'#e8c878', Z:'#eef6f2', C:'#1d3a36', c:'#142a27' },
    act:{ n:'影袭', ic:'⟫', cd:9, t:'突进 96px · 落点爆震 · 短暂无敌' },
    pas:{ t:'夜幕 · 移速+22% 暴击+8%，生命上限 -30%', fn:function(s){ s.spdMul *= 1.22; s.crit += .08; s.maxHp *= .70; } } },

  { id:'blade', name:'澜刃', price:750, flow:'#7dffe0', desc:'深蓝短发 · 碧玉刀光',
    hair:'bob', acc:'pin', cloth:'sailor',
    pal:{ H:'#2f4b7a', h:'#1d3050', S:'#ffe6d2', s:'#e0b294', K:'#111a2a', E:'#5fe8d0',
      B:'#eafffb', W:'#2f6a63', w:'#1f4a46', R:'#7dffe0', P:'#1a2434', p:'#121a26',
      X:'#0c121c', F:'#7dffe0', Z:'#e6fff8', C:'#1d3f3c', c:'#132b29' },
    act:{ n:'青刃斩', ic:'⌁', cd:10, t:'三段扇形斩击 · 高穿透' },
    pas:{ t:'锋锐 · 伤害+25% 穿透+1，生命上限 -20%', fn:function(s){ s.dmgPct += .25; s.pierce += 1; s.maxHp *= .80; } } },

  { id:'frost', name:'霜见', price:900, flow:'#b8a8ff', desc:'银紫短发 · 白领礼装',
    hair:'bob', acc:'none', cloth:'collar',
    pal:{ H:'#d8d4ea', h:'#a9a3c4', S:'#ffeade', s:'#e6c8b4', K:'#241e34', E:'#5fd8a8',
      B:'#ffffff', W:'#2c2438', w:'#1c1726', R:'#e8e0f6', P:'#241c30', p:'#191223',
      X:'#100d18', F:'#cfc8e8', Z:'#f6f2ff', C:'#231b30', c:'#171022' },
    act:{ n:'霜华领域', ic:'❅', cd:15, t:'冰域减速 70% · 持续冻伤' },
    pas:{ t:'寒霜 · 命中必定强减速，射速 -18%', fn:function(s){ s.freeze += 3; s.rateMul *= .82; } } },

  { id:'bloom', name:'花铃', price:1100, flow:'#ffd08a', desc:'藕紫短发 · 橙花发饰',
    hair:'bob', acc:'flower', cloth:'belt',
    pal:{ H:'#c9c2ee', h:'#9c94c8', S:'#ffe8d8', s:'#e8bfa6', K:'#2a2238', E:'#5a4a72',
      B:'#ffffff', W:'#f6efdd', w:'#d8cbb2', R:'#e0a83c', P:'#3a3350', p:'#2a2440',
      X:'#1a1626', F:'#ff9a3c', Z:'#fff6e2', C:'#4a4266', c:'#332c4a' },
    act:{ n:'花开', ic:'✿', cd:18, t:'治疗 25% · 攻速+80% 持续 6s' },
    pas:{ t:'繁花 · 击杀回复+3.5，伤害 -12%', fn:function(s){ s.leech += 3.5; s.dmgPct -= .12; } } },

  { id:'bunny', name:'兔桃', price:1300, flow:'#ffb8d8', desc:'粉发兔耳罩 · 和服',
    hair:'none', acc:'bunny', cloth:'robe', up:5,
    pal:{ H:'#f2a8c0', h:'#cf7d99', S:'#ffe8dd', s:'#f0c2b0', K:'#3a2430', E:'#57c8a8',
      B:'#ffffff', W:'#f4b8cc', w:'#d98fa8', R:'#ffffff', P:'#e096ac', p:'#c47a92',
      X:'#a86078', F:'#ffd0e0', Z:'#fbdcea', C:'#e0a0b8', c:'#c4809c' },
    act:{ n:'兔跳', ic:'⇈', cd:12, t:'三连跳 · 落地爆震 · 跳跃无敌' },
    pas:{ t:'软弹 · 护甲+15%，移速 -15%', fn:function(s){ s.armor += .15; s.spdMul *= .85; } } },

  { id:'scarlet', name:'茜羽', price:1500, flow:'#ff8a5c', desc:'绯红双马尾 · 海军装',
    hair:'twin', acc:'none', cloth:'sailor',
    pal:{ H:'#d83a52', h:'#9c2438', S:'#ffe6d6', s:'#e8b89c', K:'#2a1420', E:'#ffd25a',
      B:'#fff6d8', W:'#1e2438', w:'#141a2a', R:'#e8485a', P:'#1a2030', p:'#121724',
      X:'#0c1018', F:'#ffcf5a', Z:'#e8eef8', C:'#161b2a', c:'#0f131e' },
    act:{ n:'绯焰环', ic:'✷', cd:13, t:'18 发环形火弹 · 命中点燃' },
    pas:{ t:'炽热 · 灼烧伤害+50%，自身每秒受 1 点灼烧', fn:function(s){ s.burn += 1; s.burnMul += .5; s.selfBurn += 1; } } },

  { id:'rose', name:'玫红', price:1700, flow:'#ff6a6a', desc:'赤红兜帽 · 金扣斗篷',
    hair:'bob', acc:'hood', cloth:'coat', up:3,
    pal:{ H:'#c03040', h:'#8a1e2c', S:'#ffe4d2', s:'#e6b49a', K:'#2a1218', E:'#4fd8b0',
      B:'#ffffff', W:'#b83040', w:'#8a2030', R:'#ffcf5a', P:'#3a2028', p:'#2a1620',
      X:'#1a0e14', F:'#ffd75e', Z:'#e8ecf2', C:'#8e2030', c:'#6a1624' },
    act:{ n:'血盾', ic:'◈', cd:20, t:'护盾+2 · 6s 内护甲+25%' },
    pas:{ t:'守誓 · 护甲+18% 护盾+1，移速 -12%', fn:function(s){ s.armor += .18; s.shield += 1; s.spdMul *= .88; } } },

  { id:'sable', name:'砂岚', price:1900, flow:'#ffc861', desc:'银发蜜肤 · 皮革毛领',
    hair:'messy', acc:'pin', cloth:'fur', up:2,
    pal:{ H:'#e8e4ec', h:'#b6b0c0', S:'#e0b48c', s:'#c08c62', K:'#2a1e16', E:'#ffbe3c',
      B:'#fff6e0', W:'#8a5a3a', w:'#643f28', R:'#d8a860', P:'#3a2a20', p:'#2a1e16',
      X:'#1c1410', F:'#ffcf5a', Z:'#f6ecd8', C:'#5a3a24', c:'#3f2818' },
    act:{ n:'弹幕压制', ic:'≡', cd:20, t:'8s 射速+80% · 弹数+2' },
    pas:{ t:'猎手 · 射速+25%，单发伤害 -20%', fn:function(s){ s.rateMul *= 1.25; s.dmgPct -= .20; } } },

  { id:'dewdrop', name:'白露', price:2100, flow:'#a8e8ff', desc:'雪白长发 · 粉瞳水手',
    hair:'long', acc:'none', cloth:'sailor',
    pal:{ H:'#f2f4fb', h:'#c2c8d8', S:'#ffe9e2', s:'#e8c0b8', K:'#22283a', E:'#ff7ab0',
      B:'#ffffff', W:'#26345a', w:'#18213a', R:'#ffffff', P:'#1c2438', p:'#141a2a',
      X:'#0c1018', F:'#cfe4ff', Z:'#eef4ff', C:'#1d2740', c:'#131b2e' },
    act:{ n:'冰棱突刺', ic:'❉', cd:11, t:'5 道穿透冰锥 · 强力减速' },
    pas:{ t:'冷冽 · 暴击+15% 暴击伤害 2.4×，生命上限 -25%', fn:function(s){ s.crit += .15; s.critMul = 2.4; s.maxHp *= .75; } } },

  { id:'night', name:'栗夜', price:2300, flow:'#b388ff', desc:'深褐短发 · 紫瞳夹克',
    hair:'messy', acc:'none', cloth:'padded', up:2,
    pal:{ H:'#4a3628', h:'#2e2018', S:'#ffe4d0', s:'#e4b89c', K:'#1e1620', E:'#a87ae8',
      B:'#f0e0ff', W:'#3a4260', w:'#272d45', R:'#6a7290', P:'#232a3c', p:'#181e2c',
      X:'#10141e', F:'#b9a0ff', Z:'#c8cfe0', C:'#2c3348', c:'#1e2434' },
    act:{ n:'时滞', ic:'◷', cd:18, t:'全场减速 75% · 自身加速' },
    pas:{ t:'夜行 · 移速+25% 磁吸+50%，生命上限 -20%', fn:function(s){ s.spdMul *= 1.25; s.magnet *= 1.5; s.maxHp *= .80; } } },

  { id:'visor', name:'银面', price:2600, flow:'#9fd0ff', desc:'褐发白巾 · 灰蓝外套',
    hair:'messy', acc:'band', cloth:'coat', up:2,
    pal:{ H:'#4a3426', h:'#2c1e14', S:'#ffe0c8', s:'#e0b090', K:'#201810', E:'#c8a05a',
      B:'#f6ead0', W:'#5a6274', w:'#3c4352', R:'#a82e34', P:'#2a2f3a', p:'#1e222c',
      X:'#12151c', F:'#d8dde8', Z:'#eef2f8', C:'#444c5c', c:'#2e3542' },
    act:{ n:'磁暴', ic:'◉', cd:16, t:'牵引 + 眩晕 + 范围伤害' },
    pas:{ t:'磁场 · 护盾上限+2，击杀不再掉落维修包', fn:function(s){ s.shield += 2; s.noMedkit = true; } } },

  { id:'ember', name:'橙火', price:2900, flow:'#ff9a4c', desc:'橙发碧瞳 · 赤橙外套',
    hair:'long', acc:'none', cloth:'coat',
    pal:{ H:'#f08a30', h:'#c05a18', S:'#ffe6d4', s:'#e8b494', K:'#2a1810', E:'#3fc8a0',
      B:'#eafff8', W:'#d8402e', w:'#a02a20', R:'#ffb03c', P:'#26303c', p:'#1a222c',
      X:'#131820', F:'#ffb03c', Z:'#f2f6fb', C:'#9c2a1e', c:'#701c14' },
    act:{ n:'焚场', ic:'☄', cd:19, t:'全场点燃 8s · 持续灼烧' },
    pas:{ t:'余烬 · 灼烧伤害+80% 命中必点燃，生命上限 -15%', fn:function(s){ s.burn += 2; s.burnMul += .8; s.maxHp *= .85; } } },

  /* ══ 第三世代：战场涂装（图集 sprite 索引 13–22）══ */
  { id:'rust', name:'锈狼', price:3200, flow:'#ffb066', desc:'锈红重甲 · 拾荒者改造',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'铁壁冲撞', ic:'⛨', cd:12, t:'向前突进 84px · 击退并追加一层护盾' },
    pas:{ t:'锈甲 · 减伤+12% 护盾上限+1，移速 -8%', fn:function(s){ s.armor += .12; s.shield += 1; s.spdMul *= .92; } } },

  { id:'neon', name:'霓虹', price:3600, flow:'#ff3ea0', desc:'品红霓虹 · 赛博刺客装',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'霓虹残像', ic:'⟫', cd:10, t:'2.2s 无敌 · 攻速 ×2 持续 3s' },
    pas:{ t:'超频 · 暴击+10%，生命上限 -20%', fn:function(s){ s.crit += .10; s.maxHp *= .80; } } },

  { id:'rimesuit', name:'霜甲', price:4000, flow:'#d8f8ff', desc:'冰蓝重甲 · 矿场作业服',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'冰甲展开', ic:'❅', cd:14, t:'护盾 +2 · 冻结周围 3s' },
    pas:{ t:'寒甲 · 命中必定减速，射速 -10%', fn:function(s){ s.freeze += 2; s.rateMul *= .90; } } },

  { id:'magma', name:'熔心', price:4400, flow:'#ff7a3c', desc:'熔岩铸甲 · 炉心直连',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'熔核过载', ic:'☄', cd:15, t:'自身半径 130 爆炸 · 全场点燃' },
    pas:{ t:'炉心 · 灼烧+120%，移速 -10%', fn:function(s){ s.burn += 2; s.burnMul += 1.2; s.spdMul *= .90; } } },

  { id:'voidsuit', name:'虚空', price:4800, flow:'#c77dff', desc:'虚空镀层 · 相位穿透',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'虚空牵引', ic:'❂', cd:16, t:'把 220 内敌人拉到身前并引爆' },
    pas:{ t:'相位 · 穿透+2，生命上限 -25%', fn:function(s){ s.pierce += 2; s.maxHp *= .75; } } },

  { id:'cipher', name:'静默', price:5200, flow:'#8fe3ff', desc:'白灰渗透 · 数据战衣',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'数据静默', ic:'⌫', cd:13, t:'清空全部敌弹 · 1.6s 无敌并减速全场' },
    pas:{ t:'静默协议 · 伤害+15%，生命上限 -10%', fn:function(s){ s.dmgPct += .15; s.maxHp *= .90; } } },

  { id:'bolt', name:'赤雷', price:5600, flow:'#ffe14a', desc:'红黄高压 · 雷击涂装',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'连锁雷击', ic:'⌇', cd:12, t:'八道落雷依次跳向敌人' },
    pas:{ t:'过载 · 射速+18%，单发伤害 -10%', fn:function(s){ s.rateMul *= 1.18; s.dmgPct -= .10; } } },

  { id:'moss', name:'苔影', price:6000, flow:'#a8e05a', desc:'苔绿迷彩 · 孢子生态',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'孢子云', ic:'☣', cd:15, t:'毒雾半径 150 · 持续 5s 腐蚀' },
    pas:{ t:'共生 · 每秒回血+3，伤害 -12%', fn:function(s){ s.regen += 3; s.dmgPct -= .12; } } },

  { id:'gold', name:'金乌', price:6400, flow:'#ffe9a0', desc:'金黑礼装 · 太阳纹章',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'金乌坠', ic:'☀', cd:18, t:'高空坠击 180 范围高伤' },
    pas:{ t:'烈阳 · 暴击伤害 2.6×，生命上限 -20%', fn:function(s){ s.critMul = Math.max(s.critMul, 2.6); s.maxHp *= .80; } } },

  { id:'quanta', name:'量子', price:6800, flow:'#7ef0ff', desc:'青紫渐变 · 相位跃迁',
    hair:'none', acc:'none', cloth:'none', pal:{},
    act:{ n:'量子跃迁', ic:'⤢', cd:9, t:'瞬移 150px · 落点环形冲击' },
    pas:{ t:'不确定 · 移速+15%，受击伤害 +8%', fn:function(s){ s.spdMul *= 1.15; s.dmgTaken += .08; } } }
];
function SKIN(){ return SKINS[G.skin] || SKINS[0]; }

/* ── 覆盖层：发型 / 配饰 / 衣饰（画在身体位图之上） ──
   坐标沿用 BODY 的 26 × 25 网格，up 为头顶留白行数 */
function drawOverlay(g, sk, P, up){
  const R = function(x, y, w, h, col){ g.fillStyle = col; g.fillRect(x, up + y, w, h); };
  const H = P.H, hh = P.h;
  const F = P.F || '#ffcf5a', Z = P.Z || '#f2f6fb';
  const C = P.C || '#2a3448', c = P.c || '#1a2130';
  const hair = sk.hair || 'none', acc = sk.acc || 'none', cloth = sk.cloth || 'none';

  /* 发型：只碰头发区域，绝不压脸（脸窗 x7..18, y7..16） */
  if(hair === 'long'){
    R(2,12,3,6,H);   R(21,12,3,6,H);
    R(2,17,3,3,H);   R(21,17,3,3,H);
    R(3,20,2,2,H);   R(21,20,2,2,H);
    R(4,12,1,7,hh);  R(21,12,1,7,hh);
    R(4,19,1,2,hh);  R(21,19,1,2,hh);
    R(3,22,2,1,hh);  R(21,22,2,1,hh);
  } else if(hair === 'twin'){
    R(1,10,3,3,H);   R(22,10,3,3,H);
    R(0,13,3,3,H);   R(23,13,3,3,H);
    R(1,16,2,2,H);   R(23,16,2,2,H);
    R(2,13,1,3,hh);  R(23,13,1,3,hh);
    R(3,9,2,1,F);    R(21,9,2,1,F);      // 发带
  } else if(hair === 'bob'){
    R(2,13,3,3,H);   R(21,13,3,3,H);
    R(4,13,1,3,hh);  R(21,13,1,3,hh);
    R(3,16,2,2,H);   R(21,16,2,2,H);
  } else if(hair === 'messy'){
    R(5,-2,2,1,H);   R(10,-2,3,1,H);   R(15,-1,2,1,H);  R(19,-2,2,1,H);
    R(7,-1,2,1,hh);  R(12,-1,1,1,hh);  R(17,-2,1,1,hh);
    R(3,3,2,1,H);    R(21,4,2,1,H);    R(2,6,2,1,H);    R(22,7,2,1,H);
  }

  /* 配饰 */
  if(acc === 'flower'){
    R(16,1,3,1,F);  R(15,2,5,2,F);  R(17,3,2,1,F);
    R(17,2,1,1,'#fff2c0');
  } else if(acc === 'pin'){
    R(7,4,1,2,F);   R(8,3,2,1,F);  R(9,4,1,1,'#fff2c0');
  } else if(acc === 'bunny'){
    R(6,-5,3,1,Z);  R(5,-4,4,3,Z);  R(6,-1,3,1,Z);
    R(17,-5,3,1,Z); R(17,-4,4,3,Z); R(16,-1,3,1,Z);
    R(6,-4,1,3,F);  R(19,-4,1,3,F);
    R(7,0,12,1,Z);  R(5,1,16,1,Z);  R(4,2,18,2,Z);
    R(4,4,2,1,Z);   R(20,4,2,1,Z);  R(5,2,3,1,hh);  R(18,2,3,1,hh);
  } else if(acc === 'hood'){
    R(8,-3,10,1,P.W); R(6,-2,14,1,P.W); R(4,-1,18,2,P.W); R(3,1,20,1,P.W);
    R(2,2,2,9,P.W);   R(22,2,2,9,P.W);
    R(4,1,16,1,P.w);  R(5,-2,3,1,'#e0606e');
  } else if(acc === 'band'){
    R(5,3,16,1,Z);  R(5,4,16,1,Z);  R(6,3,14,1,'#ffffff');
    R(18,4,2,1,Z);  R(19,5,1,2,Z);  R(18,4,2,1,'#ffffff');
  }

  /* 衣饰 */
  if(cloth === 'collar'){
    R(8,17,4,1,Z);  R(14,17,4,1,Z);
    R(9,18,3,1,Z);  R(14,18,3,1,Z);
    R(10,19,2,1,Z); R(14,19,2,1,Z);
  } else if(cloth === 'sailor'){
    R(5,17,6,1,Z);  R(15,17,6,1,Z);
    R(6,18,5,1,Z);  R(16,18,5,1,Z);
    R(7,20,3,1,Z);  R(17,20,3,1,Z);
  } else if(cloth === 'coat'){
    R(8,17,1,6,c);  R(17,17,1,6,c);
    R(5,17,4,1,c);  R(17,17,4,1,c);
    R(7,20,2,1,C);  R(17,20,2,1,C);
    R(11,22,4,1,C);
  } else if(cloth === 'fur'){
    R(5,17,4,1,Z);  R(17,17,4,1,Z);  R(6,17,2,1,'#ffffff');
    R(5,18,1,1,P.w); R(20,18,1,1,P.w);
  } else if(cloth === 'belt'){
    R(6,22,14,1,F); R(11,22,4,1,Z);  R(12,21,2,1,F);
  } else if(cloth === 'robe'){
    R(5,17,16,2,Z); R(6,21,14,1,F);  R(7,17,3,1,F);  R(16,17,3,1,F);
  } else if(cloth === 'padded'){
    R(6,19,14,1,c); R(6,21,14,1,c);
    R(6,20,2,1,Z);  R(18,20,2,1,Z);
  }
}
const SKIN_W = 26, SKIN_BODY_H = 25, SKIN_LEG_H = 7;

function makeSprite(rows, seed, pal){
  let P = PAL;
  if(pal){
    P = {};
    for(const k in PAL) P[k] = PAL[k];
    for(const k in pal) P[k] = pal[k];
  }
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for(let y=0;y<h;y++){
    const row = rows[y];
    for(let x=0;x<w;x++){
      let ch = row[x];
      if(!ch || ch === '.') continue;
      const sp = SPECKLE[ch];
      if(sp && P[sp] && hash01(x*13.7 + y*7.3 + (seed||0)*31.1) > .74) ch = sp;
      g.fillStyle = P[ch] || '#f0f';
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function hash01(n){
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
function flipCanvas(src){
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.translate(src.width, 0); g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}
function spr(rows, seed, pal){
  const a = makeSprite(rows, seed, pal);
  return { w:a.width, h:a.height, r:a, l:flipCanvas(a) };
}
const LEG_KEYS = ['stand','run1','run2','run3','jump'];

/* 把精灵压成纯色剪影（用于流光遮罩 / 外发光） */
function silhouette(src, col){
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* 斜向流光带：比身体宽 26px，靠偏移扫过 */
function makeStripe(col, h){
  const w = SKIN_W;
  const c = document.createElement('canvas');
  c.width = w + 26; c.height = h;
  const g = c.getContext('2d');
  const gd = g.createLinearGradient(0, 0, 26, 0);
  gd.addColorStop(0, 'rgba(255,255,255,0)');
  gd.addColorStop(.36, hexA(col, .55));
  gd.addColorStop(.5, 'rgba(255,255,255,.72)');
  gd.addColorStop(.64, hexA(col, .55));
  gd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gd;
  g.beginPath();
  g.moveTo(0, h); g.lineTo(13, 0); g.lineTo(26, 0); g.lineTo(13, h);
  g.closePath(); g.fill();
  return c;
}

const SPR = { skins: [] };
let SPR_MAXH = SKIN_BODY_H;
SKINS.forEach(function(sk){
  const up = sk.up || 0;
  const H = SKIN_BODY_H + up;
  if(H > SPR_MAXH) SPR_MAXH = H;

  const legs = {};
  LEG_KEYS.forEach(function(k){ legs[k] = spr(LEGS[k], 2, sk.pal); });

  /* 身体：底图 + 覆盖层合成到同一张位图，保证剪影/流光完整 */
  const pal = {};
  for(const k in PAL) pal[k] = PAL[k];
  for(const k in sk.pal) pal[k] = sk.pal[k];

  const body = document.createElement('canvas');
  body.width = SKIN_W; body.height = H;
  const bg = body.getContext('2d');
  bg.imageSmoothingEnabled = false;
  bg.drawImage(makeSprite(BODY, 1, sk.pal), 0, up);
  drawOverlay(bg, sk, pal, up);

  const sil = silhouette(body, '#ffffff');
  let glow = null, stripe = null;
  if(sk.flow){
    glow = document.createElement('canvas');
    glow.width = SKIN_W + 22; glow.height = H + 18;
    const gg = glow.getContext('2d');
    const silC = silhouette(body, sk.flow);
    try { gg.filter = 'blur(3px)'; } catch(e){}
    gg.globalAlpha = .42;
    gg.drawImage(silC, 10, 8);
    gg.globalAlpha = .20;
    gg.drawImage(silC, 13, 11);
    gg.filter = 'none';
    stripe = makeStripe(sk.flow, H);
  }
  SPR.skins.push({ w: SKIN_W, h: H, up: up, body: { r: body, l: flipCanvas(body) },
                   legs: legs, sil: sil, silL: flipCanvas(sil),
                   glow: glow, stripe: stripe });
});

/* ══════════════════════════════════════════════════════════════════════════
   ██  像素图集管线（SpriteManager）
   ──────────────────────────────────────────────────────────────────────────
   ① loadImage(src)      统一的图片加载入口，返回 Promise；支持 URL / data URI
   ② SPRM.addGrid()      把等宽网格图集登记成命名帧，内部换算 x/y/w/h
   ③ SPRM.addAtlas()     读 TexturePacker 风格 JSON（外部素材包走同一入口）
   ④ drawFrame(name, x, y, sc, flipY)  唯一绘制出口，1:1 像素对齐、不插值
   ⑤ whiteOf(name)       懒生成纯白剪影：受击闪白 / 流光遮罩 / 残影都用它
   ⑥ paletteOf(name)     采样帧内颜色：死亡像素解体按真实配色剥落
   图集缺失时 ready=false，所有绘制函数自动退回旧的程序化画法（不会白屏）。
   ══════════════════════════════════════════════════════════════════════════ */
function loadImage(src){
  return new Promise(function(res, rej){
    const im = new Image();
    im.onload = function(){ res(im); };
    im.onerror = function(){ rej(new Error('sprite load failed')); };
    im.decoding = 'async';
    im.src = src;
  });
}
function pad2(n){ return (n < 10 ? '0' : '') + n; }

/* 网格图集布局（与 tools/gen_atlas.py 一一对应） */
const ATLAS_GRID = {
  hero: { cw:32, ch:32, cols:16, prefix:'h', count:736 },   // suit*32 + dir*4 + frame
  mon:  { cw:40, ch:40, cols:12, prefix:'m', count:44 },    // kind*4 + frame
  gun:  { cw:44, ch:22, cols:7,  prefix:'g', count:28 },
  giant:{ cw:96, ch:96, cols:2,  prefix:'giant', count:4 }
};
const MON_ORDER = ['hound','scav','scrappod','hackdrone','assassin','golem',
                   'snowbeast','slime','fireelem','voidshard','eyedemon'];
const GUN_ORDER = ['rifle','shotgun','sniper','smg','launcher','arc','pistol','revolver',
                   'minigun','flamer','laser','plasma','frost','rail','bow','nailgun',
                   'acid','orbgun','carbine','pdw','marksman','coilgun','cryocannon',
                   'micromissile','tesla','shardgun','hunter','toxin'];
/* 枪口到握把的距离（图集内实测，单位 px） */
const MUZ = { rifle:26, shotgun:26, sniper:30, smg:22, launcher:24, arc:24, pistol:20,
  revolver:22, minigun:24, flamer:24, laser:26, plasma:23, frost:24, rail:30, bow:24,
  nailgun:22, acid:23, orbgun:23, carbine:25, pdw:24, marksman:28, coilgun:27,
  cryocannon:26, micromissile:25, tesla:24, shardgun:25, hunter:27, toxin:24 };

const SPRM = {
  img:{}, frames:{}, white:{}, pal:{}, ready:false, mode:'',
  addGrid(key, im, g){
    this.img[key] = im;
    for(let i=0;i<g.count;i++){
      const cx = (i % g.cols) * g.cw, cy = ((i / g.cols) | 0) * g.ch;
      this.frames[g.prefix + i] = { img:im, x:cx, y:cy, w:g.cw, h:g.ch };
    }
  },
  /* TexturePacker 风格：{"frames":{name:{frame:{x,y,w,h}}}} */
  addAtlas(key, im, json){
    this.img[key] = im;
    const fr = json && (json.frames || json);
    if(!fr) return 0;
    let n = 0;
    for(const k in fr){
      const f = fr[k].frame || fr[k];
      if(typeof f.x !== 'number') continue;
      this.frames[k] = { img:im, x:f.x, y:f.y, w:f.w, h:f.h };
      n++;
    }
    return n;
  },
  whiteOf(name){
    if(this.white[name]) return this.white[name];
    const f = this.frames[name];
    if(!f) return null;
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, f.w, f.h);
    this.white[name] = c;
    return c;
  },
  /* 采样帧内实际用色，用于死亡时的像素剥落 */
  paletteOf(name){
    if(this.pal[name]) return this.pal[name];
    const f = this.frames[name];
    if(!f) return ['#ffffff'];
    const out = [];
    try{
      const c = document.createElement('canvas');
      c.width = f.w; c.height = f.h;
      const g = c.getContext('2d');
      g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const d = g.getImageData(0, 0, f.w, f.h).data;
      const seen = {};
      for(let i=0;i<d.length;i+=4){
        if(d[i+3] < 180) continue;
        const key = (d[i] >> 4) + ',' + (d[i+1] >> 4) + ',' + (d[i+2] >> 4);
        if(seen[key]) continue;
        seen[key] = 1;
        out.push('rgb(' + d[i] + ',' + d[i+1] + ',' + d[i+2] + ')');
        if(out.length >= 10) break;
      }
    }catch(e){}
    if(!out.length) out.push('#d8d0e0');
    this.pal[name] = out;
    return out;
  }
};

/* 纯色剪影（任意颜色）：受击闪白/闪红、精英描边都用它 */
SPRM.tint = {};
SPRM.tintOf = function(name, col){
  const key = name + '|' + col;
  if(this.tint[key]) return this.tint[key];
  const f = this.frames[name];
  if(!f) return null;
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col;
  g.fillRect(0, 0, f.w, f.h);
  this.tint[key] = c;
  return c;
};

/* ── 每关怪物主题（kind → 图集精灵），"生态"决定模型 ── */
const MON_THEME = [
  { runner:'hound', gunner:'scav', tank:'scav', drone:'scrappod', bomber:'hound',
    caster:'scav', sniper:'scav', brute:'scav' },
  { runner:'assassin', gunner:'hackdrone', tank:'hackdrone', drone:'hackdrone', bomber:'assassin',
    caster:'assassin', sniper:'assassin', brute:'hackdrone' },
  { runner:'snowbeast', gunner:'golem', tank:'golem', drone:'golem', bomber:'snowbeast',
    caster:'golem', sniper:'snowbeast', brute:'golem' },
  { runner:'slime', gunner:'slime', tank:'fireelem', drone:'fireelem', bomber:'slime',
    caster:'fireelem', sniper:'slime', brute:'fireelem' },
  { runner:'voidshard', gunner:'eyedemon', tank:'eyedemon', drone:'voidshard', bomber:'voidshard',
    caster:'eyedemon', sniper:'voidshard', brute:'eyedemon' }
];
/* 精灵内容高度（决定缩放，让每个模型都"高 e.h 像素"） */
const MON_H = { hound:22, scav:30, scrappod:24, hackdrone:26, assassin:32,
                golem:32, snowbeast:26, slime:16, fireelem:32, voidshard:34, eyedemon:30 };
/* 内容宽 / 内容顶（用于按体积缩放、算血条高度） */
const MON_W = { hound:33, scav:28, scrappod:30, hackdrone:33, assassin:26,
                golem:32, snowbeast:33, slime:28, fireelem:24, voidshard:32, eyedemon:28 };
const MON_TOP = { hound:15, scav:7, scrappod:11, hackdrone:8, assassin:5,
                  golem:5, snowbeast:11, slime:21, fireelem:5, voidshard:3, eyedemon:7 };
const MON_GY = 38;   // 精灵脚底线（40×40 格内）

/* ── 受击反馈：朝受击方向的冲击弧 + 碎屑 ── */
function hitFX(x, y, ang, col, big, height){
  const low = QLEVEL === 0;
  const n = big ? 3 : low ? 1 : 2;
  for(let i = 0; i < n; i++){
    G.rings.push({
      x: x - Math.cos(ang) * (4 + i * 7), y: y - Math.sin(ang) * (4 + i * 7) * .7,
      r: 2, max: (big ? 20 : 13) + i * 5, life: .20 + i * .04, maxLife: .20 + i * .04,
      col: col || '#ffe6c0', w: 1.6, arc: ang, height:height
    });
  }
  for(let i = 0; i < (big ? 9 : low ? 2 : 5); i++){
    const a = ang + Math.PI + rnd(-.9, .9);
    const v = rnd(40, big ? 190 : 120);
    G.parts.push({
      x: x, y: height === undefined ? y - rnd(2, 12) : y, height:height,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6 - rnd(10, 40),
      life: .22 + Math.random() * .18, max: .4, col: pick([col || '#ffd8a0', '#ffffff', '#ffb066']),
      r: rnd(1, 2.2), grav: 220
    });
  }
}

/* ── 死亡溶解：按精灵真实配色把像素"剥"下来 ── */
function addDissolve(e, name){
  const pal = SPRM.ready ? SPRM.paletteOf(name) : ['#c8b8a8'];
  const big = !!e.elite;
  /* ① 细碎像素屑：按本体真实配色剥落，边散边向下沉 */
  const n = big ? 52 : 38;
  for(let i = 0; i < n; i++){
    G.parts.push({
      x: e.x + rnd(-e.r * .95, e.r * .95),
      y: e.y - rnd(2, e.h * .98),
      vx: rnd(-34, 34), vy: rnd(-64, 4),
      life: .60 + Math.random() * .60, max: 1.20,
      col: pick(pal), r: rnd(1.4, 3.2), grav: 210
    });
  }
  /* ② 几块大外壳碎片：抛得更开、落得更快，先"碎"再"散" */
  const nc = big ? 7 : 5;
  for(let i = 0; i < nc; i++){
    G.parts.push({
      x: e.x + rnd(-e.r * .7, e.r * .7),
      y: e.y - rnd(e.h * .25, e.h * .9),
      vx: rnd(-54, 54), vy: rnd(-96, -16),
      life: .42 + Math.random() * .30, max: .72,
      col: pick(pal), r: rnd(3.2, 4.8), grav: 300
    });
  }
  /* ③ 解体瞬间的一圈"像素剥离"亮边 */
  G.rings.push({ x:e.x, y:e.y - e.h * .4, r:2, max:e.r * 1.7, life:.26, maxLife:.26,
                 col: pick(pal), w:1.6 });
}

/* ── 焦痕：榴弹/等离子落点（强制留下，不受装饰限制）── */
function addBurn(x, y, r){
  if(G.scars.length > 56) G.scars.shift();
  G.scars.push({ x:x, y:y, life:2.8, max:2.8, r:r, seed:Math.random() * 100, st:-1 });
}

/* 图集来源：优先内嵌 data URI（script#atlasData），其次同目录 assets/ */
function atlasSourceMap(){
  let meta = null;
  const el = document.getElementById('atlasData');
  if(el){
    try{ meta = JSON.parse(el.textContent); }catch(e){ meta = null; }
  }
  const out = {};
  Object.keys(ATLAS_GRID).forEach(function(k){
    out[k] = (meta && meta[k]) ? meta[k] : ('assets/' + k + '.png');
  });
  return out;
}
SPRM.load = function(){
  const src = atlasSourceMap();
  const keys = Object.keys(ATLAS_GRID);
  return Promise.all(keys.map(function(k){
    return loadImage(src[k]).then(function(im){ return im; }, function(){ return null; });
  })).then(function(list){
    if(!list[0] || !list[1]) return false;         /* 主角/怪物缺失 → 退回程序化 */
    keys.forEach(function(key,i){
      if(list[i]) SPRM.addGrid(key,list[i],ATLAS_GRID[key]);
    });
    /* 命名：与生成器完全一致的索引顺序 */
    const named = {};
    for(let s = 0; s < 23; s++){
      for(let d = 0; d < 8; d++){
        for(let f = 0; f < 4; f++){
          named['h' + pad2(s) + '_' + d + '_' + f] = SPRM.frames['h' + (s * 32 + d * 4 + f)];
        }
      }
    }
    for(let k = 0; k < MON_ORDER.length; k++){
      for(let f = 0; f < 4; f++){
        named['m_' + MON_ORDER[k] + '_' + f] = SPRM.frames['m' + (k * 4 + f)];
      }
    }
    for(let k = 0; k < GUN_ORDER.length; k++){
      named['g_' + GUN_ORDER[k]] = SPRM.frames['g' + k];
    }
    for(const k in named){ if(named[k]) SPRM.frames[k] = named[k]; }
    SPRM.ready = true;
    return true;
  });
};

function drawFrame(name, dx, dy, sc, flipY){
  const f = SPRM.frames[name];
  if(!f) return false;
  const s = sc || 1;
  if(s === 1 && !flipY){
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, Math.round(dx), Math.round(dy), f.w, f.h);
  } else if(flipY){
    ctx.save();
    ctx.translate(dx, dy + f.h * s);
    ctx.scale(s, -s);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    ctx.restore();
  } else {
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, dx, dy, f.w * s, f.h * s);
  }
  return true;
}

/* ── 边缘光：把剪影往左上偏 1px 叠亮，产生"受光轮廓" ── */
function rimLight(name, dx, dy, dw, dh, col, a){
  const m = SPRM.tintOf(name, col || '#ffffff');
  if(!m) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  ctx.drawImage(m, dx - 1.5, dy - 1.5, dw, dh);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 接触阴影：multiply 压暗地面（比叠黑色更"贴"） ── */
function drawAO(x, y, w, a, squash){
  if(QLEVEL < 1){ drawShadow(x, y, w * .42, a * .8); return; }
  const rx = Math.max(6, w), ry = Math.max(3, w * (squash || .40));
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(0,0,0,' + Math.min(.85, a).toFixed(3) + ')');
  g.addColorStop(.52, 'rgba(0,0,0,' + Math.min(.5, a * .5).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ── 方向索引：0=右 1=右下 2=下 3=左下 4=左 5=左上 6=上 7=右上 ── */
function heroDir(fa){
  const i = Math.round((fa || 0) / (Math.PI / 4));
  return ((i % 8) + 8) % 8;
}

/* ── 残影：移动时在身后留一串递减透明度的本体帧 ── */
const HTRAIL = [];
function trailPush(name, sx, sy, col){
  const last = HTRAIL.length ? HTRAIL[HTRAIL.length - 1] : null;
  if(last && (G.t - last.t0) < .045) return;
  HTRAIL.push({ name:name, sx:sx, sy:sy, t0:G.t, col:col });
  if(HTRAIL.length > 12) HTRAIL.shift();
}
function trailDraw(){
  if(!HTRAIL.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(let i = HTRAIL.length - 1; i >= 0; i--){
    const h = HTRAIL[i];
    const k = 1 - (G.t - h.t0) / .30;
    if(k <= 0){ HTRAIL.splice(i, 1); continue; }
    ctx.globalAlpha = k * k * .22;
    const m = SPRM.tintOf(h.name, h.col || '#8ff0ff');
    if(m) ctx.drawImage(m, h.sx - 16, h.sy - 30 - (1 - k) * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 流光扫过（对当前图集帧做遮罩，而不是旧的身体位图） ── */
const flowC2 = document.createElement('canvas');
flowC2.width = 64; flowC2.height = 64;
const flowX2 = flowC2.getContext('2d');
function flowSweep(name, bx, by, col, w, h, di){
  if(!SPRM.ready) return;
  const mask = SPRM.whiteOf(name);
  if(!mask) return;
  const ph = (G.t % 1.8) / 1.8;
  const off = -34 + ph * (w + 68);
  flowX2.setTransform(1, 0, 0, 1, 0, 0);
  flowX2.globalCompositeOperation = 'source-over';
  flowX2.clearRect(0, 0, 64, 64);
  const gd = flowX2.createLinearGradient(off, 0, off + 30, 0);
  gd.addColorStop(0, 'rgba(255,255,255,0)');
  gd.addColorStop(.34, hexA(col, .55));
  gd.addColorStop(.5, 'rgba(255,255,255,.85)');
  gd.addColorStop(.66, hexA(col, .55));
  gd.addColorStop(1, 'rgba(255,255,255,0)');
  flowX2.fillStyle = gd;
  flowX2.beginPath();
  flowX2.moveTo(off - 14, h); flowX2.lineTo(off, 0);
  flowX2.lineTo(off + 16, 0); flowX2.lineTo(off + 2, h);
  flowX2.closePath(); flowX2.fill();
  flowX2.globalCompositeOperation = 'destination-in';
  flowX2.drawImage(mask, 0, 0);
  flowX2.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .26;
  ctx.drawImage(flowC2, 0, 0, w, h, bx, by, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* 流光合成用的临时画布 */
const flowC = document.createElement('canvas');
flowC.width = SKIN_W; flowC.height = SPR_MAXH + 2;
const flowX = flowC.getContext('2d');

/* ── 画布 / 缩放 ── */
const cv = document.getElementById('cv');
let ctx = cv.getContext('2d', { alpha:false });
const mctx = ctx;               // 主画布上下文（HUD 与最终输出）
let DPR = 1, VP = 1, VW = VIEW_W, VH = VIEW_H, SW = 800, SH = 600;

function resize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  SW = w; SH = h;
  DPR = Math.min(window.devicePixelRatio || 1, QLEVEL === 0 ? 1 : QLEVEL === 1 ? 1.5 : 2);
  cv.width = Math.max(1, Math.round(w * DPR));
  cv.height = Math.max(1, Math.round(h * DPR));
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const preferredScale = Math.min(w / VIEW_W, h / VIEW_H);
  const arenaScale = Math.max(w / ARENA.w, h / (ARENA.h * KZ));
  const p = Math.max(1, Math.floor(preferredScale * 2) / 2, Math.ceil(arenaScale * 2) / 2);
  VP = p;
  VW = w / p;
  VH = h / p;
  ctx.imageSmoothingEnabled = false;
  buildTargets();
  if(STAGE3D && STAGE3D.isReady()){
    STAGE3D.setStageSize(Math.max(1, Math.round(VW / 2)), Math.max(1, Math.round(VH / 2)));
  }
}

/* 玩家在屏幕上的位置（CSS px）：暗角/空气透视都以它为中心 */
function playerScreenCSS(){
  if(!G.p || G.mode === 'title' || G.mode === 'over') return { x: SW / 2, y: SH / 2 };
  const cx = SX(G.p.x) * VP, cy = SY(G.p.y) * VP;
  /* 与画面中心 6:4 混合：镜头被地图边界夹住时，暗角也不会偏得太离谱 */
  return {
    x: clamp(cx * .62 + (SW / 2) * .38, SW * .10, SW * .90),
    y: clamp(cy * .62 + (SH / 2) * .38, SH * .12, SH * .88)
  };
}

let vgGrad = null, vgKey = '';
function vignette(){
  const ps = playerScreenCSS();
  const key = (ps.x | 0) + ':' + (ps.y | 0) + ':' + SW + 'x' + SH;
  if(!vgGrad || key !== vgKey){
    vgKey = key;
    const far = Math.max(ps.x, SW - ps.x, ps.y, SH - ps.y) * 1.04;
    vgGrad = ctx.createRadialGradient(ps.x, ps.y, Math.min(SW, SH) * .30,
                                      ps.x, ps.y, Math.max(far, Math.min(SW, SH) * .5));
    vgGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vgGrad.addColorStop(.52, 'rgba(0,0,0,.10)');
    vgGrad.addColorStop(1, 'rgba(0,0,0,.50)');
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = vgGrad;
  ctx.fillRect(0, 0, SW, SH);
  // 机甲模式：更强的聚焦暗角（土豆兄弟式注意力收缩）
  if(G.mechT > 0){
    const p = Math.min(1, G.mechT / 1.2);
    const far2 = Math.max(ps.x, SW - ps.x, ps.y, SH - ps.y) * 1.04;
    const vg2 = ctx.createRadialGradient(ps.x, ps.y, Math.min(SW,SH) * .26, ps.x, ps.y, far2);
    vg2.addColorStop(0, 'rgba(0,0,0,0)');
    vg2.addColorStop(.58, 'rgba(0,0,0,0)');
    vg2.addColorStop(1, 'rgba(0,0,0,' + (.40 * p).toFixed(3) + ')');
    ctx.fillStyle = vg2;
    ctx.fillRect(0, 0, SW, SH);
  }
}

/* ══════════════════════════════════════════════════════════
   RE-2 渲染引擎
   · 离屏渲染目标 + 分层降采样泛光（bloom）
   · 动态光照：地面光斑 / 火花光，lighter 叠加
   · 深度雾 + 场景调色 + 胶片颗粒 + 软阴影纹理
   · 三档画质（低 / 中 / 高），掉帧自动降档
   ══════════════════════════════════════════════════════════ */
const QKEY = 'mechRogueQ';
const QN = ['低', '中', '高'];
const Q_DESC = ['关闭泛光与光照，最省电', '动态光照 + 深度雾', '泛光 + 光照 + 颗粒，全开'];
let QLEVEL = 2;

const RT = document.createElement('canvas');
const rtx = RT.getContext('2d', { alpha:false });
const BL1 = document.createElement('canvas'), b1x = BL1.getContext('2d');
const BL2 = document.createElement('canvas'), b2x = BL2.getContext('2d');

/* canvas filter 支持探测（Safari 老版本没有） */
const CAN_FILTER = (function(){
  try{
    const g = document.createElement('canvas').getContext('2d');
    g.filter = 'blur(2px)';
    return g.filter === 'blur(2px)';
  }catch(e){ return false; }
})();

function hexA(c, a){
  if(typeof c === 'string' && c.charAt(0) === '#'){
    let r, g, b;
    if(c.length === 4){
      r = parseInt(c[1] + c[1], 16); g = parseInt(c[2] + c[2], 16); b = parseInt(c[3] + c[3], 16);
    } else {
      r = parseInt(c.substr(1, 2), 16); g = parseInt(c.substr(3, 2), 16); b = parseInt(c.substr(5, 2), 16);
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  return c;
}

/* ── 光斑纹理（按颜色缓存，96px 足够） ── */
const LTEX = {};
function lightTex(c){
  if(LTEX[c]) return LTEX[c];
  const n = 96, h = n / 2;
  const cc = document.createElement('canvas');
  cc.width = n; cc.height = n;
  const g = cc.getContext('2d');
  const rg = g.createRadialGradient(h, h, 0, h, h, h);
  rg.addColorStop(0,   hexA(c, 1));
  rg.addColorStop(.26, hexA(c, .55));
  rg.addColorStop(.58, hexA(c, .19));
  rg.addColorStop(.82, hexA(c, .05));
  rg.addColorStop(1,   hexA(c, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, n, n);
  LTEX[c] = cc;
  return cc;
}

/* ── 软阴影纹理 ── */
let SHADOW_TEX = null;
function shadowTex(){
  if(SHADOW_TEX) return SHADOW_TEX;
  const n = 128;
  const cc = document.createElement('canvas');
  cc.width = n; cc.height = n;
  const g = cc.getContext('2d');
  const rg = g.createRadialGradient(n/2, n/2, 0, n/2, n/2, n/2);
  rg.addColorStop(0,   'rgba(0,0,0,.95)');
  rg.addColorStop(.38, 'rgba(0,0,0,.62)');
  rg.addColorStop(.70, 'rgba(0,0,0,.20)');
  rg.addColorStop(.88, 'rgba(0,0,0,.05)');
  rg.addColorStop(1,   'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, n, n);
  SHADOW_TEX = cc;
  return cc;
}

/* ── 胶片颗粒图案 ── */
let grainPat = null;
function buildGrain(){
  const n = 128;
  const cc = document.createElement('canvas');
  cc.width = n; cc.height = n;
  const g = cc.getContext('2d');
  const img = g.createImageData(n, n);
  const d = img.data;
  for(let i = 0; i < d.length; i += 4){
    const v = 128 + (Math.random() - .5) * 210;
    d[i] = d[i+1] = d[i+2] = v;
    d[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainPat = mctx.createPattern(cc, 'repeat');
}

/* ── 渲染目标尺寸 ── */
function buildTargets(){
  const w = Math.max(1, cv.width), h = Math.max(1, cv.height);
  RT.width = w; RT.height = h;
  const q = QLEVEL >= 2 ? 4 : 6;
  const w1 = Math.max(1, Math.round(w / q)), h1 = Math.max(1, Math.round(h / q));
  BL1.width = w1; BL1.height = h1;
  BL2.width = Math.max(1, Math.round(w1 / 3));
  BL2.height = Math.max(1, Math.round(h1 / 3));
  vgGrad = null;
  grainPat = null;
  if(QLEVEL >= 2) buildGrain();
}

/* ── 画质档位 ── */
function setQuality(q, quiet){
  QLEVEL = q < 0 ? 0 : q > 2 ? 2 : q;
  try{ localStorage.setItem(QKEY, String(QLEVEL)); }catch(e){}
  if(G.p) resize();
  updateQLabel();
  if(!quiet) banner('引擎 · 画质', QN[QLEVEL] + '档 — ' + Q_DESC[QLEVEL], 1.1);
}

/* 音效开关 */
const SKEY = 'mechRogueSfx';
function addFlash(x, y, r, c, a){
  if(G.lightsFx.length > 34) G.lightsFx.shift();
  G.lightsFx.push({ x:x, y:y, r:r, c:c, a:a, life:.44, max:.44 });
}

/* ── 动态光照采集 ── */
const LIGHTS = [];

/* 场景装饰热点：同一套坐标同时驱动地面辉光与呼吸光源，
   保证"光"一定落在"本来就亮的地方"，不会凭空多出一团浮光 */
function ambSpot(i, ax, ay){
  const AW = ARENA.w, AH = ARENA.h;
  return {
    x: 100 + ((i * ax + 160) % (AW - 200)),
    y: 110 + ((i * ay + 180) % (AH - 220))
  };
}

/* 固定场景光源：位置与地面装饰一一对应（熔岩裂缝 / 霓虹灯管 / 冰面反光 / 角落符文），
   ω 取值 1.26–2.09 对应周期 3–5 秒，幅度 ±10%。
   玩家不会明确察觉，但余光里这些"灯"是活的，场景不再是静态贴图。 */
const BREATH_LIGHTS = (function(){
  const out = [];
  const mk = function(i, ax, ay, r, c, a, w, ph){
    const p = ambSpot(i, ax, ay);
    return { x:p.x, y:p.y, r:r, c:c, a:a, w:w, ph:ph || 0 };
  };
  // 0 落日废土：热浪微光的两个焦点（暖）
  out.push([
    mk(0, 449, 337, 118, '#ffb066', .15, 1.42, .0),
    mk(1, 449, 337, 96,  '#ffcf9a', .12, 1.96, 1.7)
  ]);
  // 1 霓虹雨夜：招牌灯管的青 / 品红（交叉呼吸）
  out.push([
    mk(0, 421, 349, 104, '#57e0ff', .17, 1.30, .0),
    mk(1, 421, 349, 92,  '#ff5ab4', .15, 1.72, 2.1),
    mk(2, 421, 349, 86,  '#57e0ff', .12, 2.05, 1.1)
  ]);
  // 2 冰封矿场：冰面呼吸反光
  out.push([
    mk(0, 367, 293, 96, '#9fe8ff', .14, 1.36, .4),
    mk(2, 367, 293, 84, '#cdf4ff', .11, 1.84, 2.4)
  ]);
  // 3 熔岩工厂：地面裂缝的熔光
  out.push([
    mk(0, 373, 517, 110, '#ff7a3c', .19, 1.28, .0),
    mk(1, 373, 517, 92,  '#ffb066', .15, 1.66, 1.9),
    mk(2, 373, 517, 86,  '#ff7a3c', .13, 2.02, 3.4)
  ]);
  // 4 虚空核心：角落符文的紫光
  out.push([
    mk(0, 503, 431, 100, '#c77dff', .16, 1.34, .9),
    mk(1, 503, 431, 88,  '#d6a6ff', .12, 1.88, 2.6)
  ]);
  return out;
})();

function addLight(x, y, r, c, a, ground){
  LIGHTS.push({ x:x, y:y, r:r, c:c, a:a, g:!!ground });
}
function collectLights(){
  LIGHTS.length = 0;
  const p = G.p;
  if(p){
    if(G.mechT > 0) addLight(p.x, p.y, 190, currentMech().color, .62, 1);
    else addLight(p.x, p.y, 116, '#a9ccff', .38, 1);
    if(p.flashT > 0){
      /* 枪口光挪到枪口位置、压小压淡：原本叠在脚下又 .85 强度，
         开火时会把主角整个下半身烧成白团 */
      const fa2 = p.faceAngle || 0;
      addLight(p.x + Math.cos(fa2) * 22, p.y - 7 + Math.sin(fa2) * 13,
               36, '#ffd9a6', .48, 0);
    }
  }
  // 玩家子弹（多时抽样，控制开销）
  const st = Math.max(1, Math.ceil(G.bullets.length / 30));
  for(let i = 0; i < G.bullets.length; i += st){
    const b = G.bullets[i];
    const bw = WP[b.w];
    const bcol = b.mech ? MECHS[b.mechId].color : (bw ? bw.c : '#ffd88a');
    addLight(b.x, b.y, b.mech ? 34 : (b.boom ? 30 : (b.w === 'flamer' || b.w === 'toxin' ? 24 : 18)),
             bcol, b.mech ? .40 : .28, 1);
  }
  // 敌弹
  const enemyLightStride = Math.max(2,Math.ceil(G.eb.length/(QLEVEL === 0 ? 6 : 14)));
  for(let i = 0; i < G.eb.length; i += enemyLightStride){
    const b = G.eb[i];
    addLight(b.x, b.y, 15, b.col, .32, 0);
  }
  // 地上的道具 / 补给箱
  for(let i = 0; i < G.picks.length; i++){
    const o = G.picks[i], d = IT[o.id];
    if(!d) continue;
    addLight(o.x, o.y, 38, d.c, .34 + Math.sin(G.t * 4.2 + o.x * .05) * .10, 1);
  }
  for(let i = 0; i < G.crates.length; i++){
    const c = G.crates[i];
    addLight(c.x, c.y, 54, '#ffb060', .30, 1);
  }
  // 主地标的环境光（呼吸式明暗，让地标"活着"）
  for(let i = 0; i < G.props.length; i++){
    const pr = G.props[i];
    if(!pr.lm) continue;
    const L = LM_LIGHT[G.stage] || LM_LIGHT[0];
    addLight(pr.x, pr.y - pr.h * .45, L[1], L[0], L[2] * (.82 + .18 * Math.sin(G.t * 1.5)), 1);
  }
  // 固定场景光源：3–5 秒周期、±10% 的极缓慢呼吸（中景的"生命感"）
  const bl = BREATH_LIGHTS[G.stage];
  if(bl){
    for(let i = 0; i < bl.length; i++){
      const L = bl[i];
      addLight(L.x, L.y, L.r, L.c, L.a * (1 + .10 * Math.sin(G.t * L.w + L.ph)), 1);
    }
  }
  // 传送门 / 首领
  if(G.portal) addLight(G.portal.x, G.portal.y, 120, '#7dffd0', .46, 1);
  if(G.boss && !G.boss.dead) addLight(G.boss.x, G.boss.y, 130, SCENES[G.stage].accent, .38, 1);
  // 回旋刃的微弱尾光
  for(let i = 0; i < G.booms.length; i++){
    const o = G.booms[i];
    if(o.out > 0) addLight(o.x, o.y, 24, '#ffd88a', .22, 0);
  }
  // 爆炸闪光（短促）
  for(let i = 0; i < G.lightsFx.length; i++){
    const o = G.lightsFx[i];
    const k = clamp(o.life / o.max, 0, 1);
    addLight(o.x, o.y, o.r * (1.55 - k * .55), o.c, o.a * k, 0);
  }
}

/* pass 0 = 地面光（实体之前），pass 1 = 火花光（实体之后） */
function drawLights(pass){
  if(QLEVEL < 1) return;
  if(pass === 0) collectLights();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(let i = 0; i < LIGHTS.length; i++){
    const L = LIGHTS[i];
    if((pass === 0) !== L.g) continue;
    const sx = SX(L.x), sy = SY(L.y);
    const r = L.r, ry = r * KZ;
    if(sx + r < -70 || sx - r > VW + 70 || sy + ry < -70 || sy - ry > VH + 70) continue;
    ctx.globalAlpha = L.a < 0 ? 0 : L.a > 1 ? 1 : L.a;
    ctx.drawImage(lightTex(L.c), sx - r, sy - ry, r * 2, ry * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 后处理：泛光合成 ── */
function composite(){
  ctx = mctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;

  /* 震屏 + 过扫描：位移越大越轻微推近，保证画面始终盖满画布。
     过扫描量按逻辑视口宽算（2×位移 / VW），与 DPR 无关。 */
  const shk = G.shake || 0, sx0 = G._shx || 0, sy0 = G._shy || 0;
  if(shk > .05 && RT.width > 2){
    const z = 1 + Math.min(.075, shk * 2 / VW);
    const mw = (z - 1) / 2;                      // 单边余量（比例）
    const px = clamp(sx0, -mw * VW, mw * VW);    // 位移不允许超出余量
    const py = clamp(sy0, -mw * VW, mw * VW);
    const dw = cv.width * z, dh = cv.height * z;
    ctx.drawImage(RT, 0, 0, RT.width, RT.height,
                  (cv.width - dw) / 2 + px * VP * DPR,
                  (cv.height - dh) / 2 + py * VP * DPR,
                  dw, dh);
  } else {
    ctx.drawImage(RT, 0, 0);
  }

  if(QLEVEL < 2 || RT.width < 2) return;

  const W1 = BL1.width, H1 = BL1.height;
  // ① 降采样
  b1x.setTransform(1, 0, 0, 1, 0, 0);
  b1x.globalCompositeOperation = 'source-over';
  b1x.globalAlpha = 1;
  b1x.clearRect(0, 0, W1, H1);
  b1x.imageSmoothingEnabled = true;
  b1x.drawImage(RT, 0, 0, W1, H1);

  // ② 与自身相乘两次 = 亮部阈值（暗部迅速衰减，只留真正的高光，
  //    避免浅色角色被泛光冲成白块）
  b1x.globalCompositeOperation = 'multiply';
  b1x.drawImage(BL1, 0, 0);
  b1x.drawImage(BL1, 0, 0);
  b1x.globalCompositeOperation = 'source-over';

  // ③ 再缩小一次，得到柔和的扩散核
  b2x.setTransform(1, 0, 0, 1, 0, 0);
  b2x.globalCompositeOperation = 'source-over';
  b2x.globalAlpha = 1;
  b2x.clearRect(0, 0, BL2.width, BL2.height);
  b2x.imageSmoothingEnabled = true;
  b2x.drawImage(BL1, 0, 0, BL2.width, BL2.height);

  // ④ 放大叠回 → 宽光晕
  b1x.globalAlpha = .85;
  b1x.imageSmoothingEnabled = true;
  b1x.drawImage(BL2, 0, 0, W1, H1);
  b1x.globalAlpha = 1;

  // ⑤ 加性合成
  // screen 而非 lighter：加性合成会把浅色角色直接烧成白块，
  // screen 的高光收敛在 1.0 以内，亮部只提亮不糊死
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = .72;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(BL1, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
}

/* ── 后处理：深度雾 / 调色 / 颗粒 / 白闪 ── */
function gradeFrame(){
  const sc = SCENES[G.stage];
  ctx = mctx;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  if(QLEVEL >= 1){
    // 远处空气层
    const fh = Math.max(80, SH * .34);
    const fg = ctx.createLinearGradient(0, 0, 0, fh);
    fg.addColorStop(0, hexA(sc.g[3], .62));
    fg.addColorStop(.5, hexA(sc.g[3], .20));
    fg.addColorStop(1, hexA(sc.g[3], 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, SW, fh);

    /* 远景大气粒子：只在屏幕上半部分缓慢飘动，压在远端雾之上，
       透明度 .04–.15，让"最远的那一层"不是死板的色块 */
    if(!FieldMaps.underground()) FARFX.draw(SW, SH);

    // 近景压暗
    const bh = Math.max(50, SH * .2);
    const bg = ctx.createLinearGradient(0, SH - bh, 0, SH);
    bg.addColorStop(0, hexA(sc.g[3], 0));
    bg.addColorStop(1, hexA(sc.g[3], .40));
    ctx.fillStyle = bg;
    ctx.fillRect(0, SH - bh, SW, bh);
    // 场景色调
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = .075;
    ctx.fillStyle = sc.g[2];
    ctx.fillRect(0, 0, SW, SH);

    /* ① 方向光：左上受光、右下背光 —— 让所有物件的"光向"统一 */
    const dg = ctx.createLinearGradient(0, 0, SW * .9, SH);
    dg.addColorStop(0, 'rgba(255,238,205,.14)');
    dg.addColorStop(.46, 'rgba(255,255,255,0)');
    dg.addColorStop(1, 'rgba(0,0,0,.20)');
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = .85;
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, SW, SH);

    /* ② 全局环境色：整场压一层关卡色调（overlay） */
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = .10;
    ctx.fillStyle = ENV_TINT[G.stage] || '#ffffff';
    ctx.fillRect(0, 0, SW, SH);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 胶片颗粒
  if(QLEVEL >= 2 && grainPat){
    const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = .045;
    ctx.fillStyle = grainPat;
    ctx.fillRect(-ox, -oy, SW + 128, SH + 128);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // 暗角 + 空气透视：以玩家为中心（土豆兄弟式聚光），
  // 越靠画面边缘越蒙上一层场景环境色，模拟"远处的空气"把颜色推淡
  if(QLEVEL >= 1){
    const ps = playerScreenCSS();
    const far = Math.max(ps.x, SW - ps.x, ps.y, SH - ps.y) * 1.05;

    /* ① 环境色：边缘叠一层薄薄的场景底色（不是纯黑，而是有色的雾） */
    const ag = ctx.createRadialGradient(ps.x, ps.y, Math.min(SW, SH) * .32,
                                        ps.x, ps.y, far);
    ag.addColorStop(0, hexA(sc.g[3], 0));
    ag.addColorStop(.62, hexA(sc.g[3], .07));
    ag.addColorStop(1, hexA(sc.g[2], .20));
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, SW, SH);

    /* ② 压暗：同一个圆心，确保"屏幕四角最暗"而不是"画面正中最暗" */
    const vg = ctx.createRadialGradient(ps.x, ps.y, Math.min(SW, SH) * .30,
                                        ps.x, ps.y, far);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(.58, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, SW, SH);
  }

  /* 近景遮挡层：画在暗角之后（不被压暗），像贴在镜头前的灰尘与角落剪影，
     制造「镜头在场景内部」的纵深；密度极低，不影响任何操作判定 */
  if(!FieldMaps.underground()) FOREFX.draw(SW, SH);
  SectorClimate.drawWastelandWeather(ctx);

  // 全屏白闪（爆炸 / 受击 / 召唤）
  if(G.flash > 0 && !reducedEffects){
    ctx.fillStyle = 'rgba(255,252,240,' + Math.min(1, G.flash) * .34 + ')';
    ctx.fillRect(0, 0, SW, SH);
  }
}

/* ── 帧率监测：连续掉帧自动降一档 ── */
let perfAcc = 0, perfN = 0, perfClock = 0, perfDrops = 0, perfDone = false;
function watchPerf(dt){
  if(QLEVEL === 0 || perfDone) return;
  perfAcc += dt; perfN++; perfClock += dt;
  if(perfClock < 2.4) return;
  const avg = perfAcc / Math.max(1, perfN);
  perfAcc = 0; perfN = 0; perfClock = 0;
  if(avg > .025){
    perfDrops++;
    setQuality(QLEVEL - 1, true);
    banner('自动降档', '检测到掉帧 · 画质切到「' + QN[QLEVEL] + '」', 1.1);
    if(perfDrops >= 2) perfDone = true;
  }
}

/* ── 全局状态 ── */
const G = {
  mode:'title',          // title | play | map | level | pause | over | win
  phase:'wave',          // wave | boss | clear
  stage:0, wave:1, waveT:0, waveDur:0, spawnT:0,
  t:0, cam:{x:ARENA.w/2, y:ARENA.h/2},
  score:0, kills:0, xp:0, lv:1, need:10, pending:0,
  skills:{}, slots:[], skillLimit:BASE_SKILL_CAPACITY, growth:growthSnapshot(),
  energy:0, mechT:0, mechId:DEFAULT_MECH, mechCd:0, mechSide:0, mechEchoT:0, mechArcs:[],
  p:null, st:null,
  bullets:[], eb:[], enemies:[], orbs:[], parts:[], texts:[], rings:[],
  haz:[], drones:[], turrets:[], mines:[], booms:[],
  picks:[], crates:[], jobs:[], bag:[null, null], buff:{ over:0, magnet:0, stasis:0, fleet:0, rad:0, luck:0, weak:0 },
  weapon:'rifle', wcd:0, wcdMax:1, wbuff:{ focus:0, heat:0 },
  ccd:0, ccdMax:1, cbuff:{ rate:0, spd:0, dmg:0, armor:0, extra:0 },
  lightsFx:[],
  shield:0, shieldFx:0,
  boss:null, portal:null, bossEncounter:null, clearedGuards:new Set(), encounterPlayerFrom:null,
  shake:0, flash:0, hurt:0, hitStop:0,
  skin:0, ground:null, groundMarks:null, props:[], scene:0,
  supplyPads:null, supplyIdx:0,
  env:null, ambT:0, sceneFx:0,
  scars:[], spawnAnchors:null,
  time:0, revives:1, combo:0, comboT:0, picksGot:0, settled:false, shopFrom:'title'
};

/* ══════════════════════════════════════════════════════════
   地面视觉叙事 GROUND（纯视觉，无碰撞）
   · 区域密度差：中央开阔区干净 / 边缘角落堆叠，2 层噪声过渡，无同心圆硬边
   · 动线：断续磨损带把中央开阔区连到地图边缘与角落
   · 补给投放点：轮胎印 / 脚印，与 spawnCrate() 共用同一批坐标
   · 逐场景叙事：风蚀干草 / 湿地反射 / 霜裂碎冰 / 焦痕余烬 / 角落符文
   所有标记 alpha 限制在 .05–.18，不用纯白高亮，保证角色/子弹可读
   ══════════════════════════════════════════════════════════ */
const GROUND = (function(){
  const AW = ARENA.w, AH = ARENA.h;
  const CX = AW / 2, CY = AH / 2;
  const WALL = 22;
  const CORE_RX = 232, CORE_RY = 204;   // 中央开阔区椭圆半径
  const PAD_COUNT = 5;                  // 补给投放候选点数量
  const PAD_SAFE = 175;                 // 投放点距中心的最小半径

  /* 确定性平滑噪声（3 层正弦叠加，值域约 -1..1，无随机不可复现） */
  function noise2(x, y){
    return Math.sin(x * .0121 + y * .0073) * .52 +
           Math.sin(x * .0313 - y * .0191 + 1.73) * .31 +
           Math.sin((x + y) * .0047 - .91) * .17;
  }

  /* 归一化半径：1.0 = 中央开阔区椭圆边界 */
  function coreR(x, y){
    const dx = (x - CX) / CORE_RX, dy = (y - CY) / CORE_RY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* 靠近边界的程度：贴墙 1，向内 150px 平滑衰减到 0 */
  function cornerness(x, y){
    const edge = Math.min(x - WALL, AW - WALL - x, y - WALL, AH - WALL - y);
    const c = clamp(1 - (edge - 12) / 138, 0, 1);
    return c * c;
  }

  /* 装饰密度系数：中央 ≈.36（干净）· 中环 1.0（基准）· 边缘角落 ≈1.7–2.1（堆叠）
     · 第 1 层：噪声扰动椭圆半径，避免圆形硬边
     · 第 2 层：细粒抖动，让过渡自然破碎 */
  function density(x, y){
    const r = coreR(x, y) + noise2(x, y) * .20;
    let t = clamp((r - .92) / 1.5, 0, 1);
    t = t * t * (3 - 2 * t);
    const d = lerp(.36, 1, t) * (1 + cornerness(x, y) * .95);
    const j = 1 + noise2(x * 2.6 + 41, y * 2.6 - 17) * .14;
    return clamp(d * j, .2, 2.25);
  }

  /* 透明度夹紧：所有地面标记统一在 .05–.18，绝不盖过角色/子弹 */
  function al(v){ return clamp(v, .09, .24); }

  /* 十六进制混色（用于把 accent 揉进地面色，提升可读性又不跳色） */
  function mixHex(a, b, t){
    const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    const ar = (na >> 16) & 255, ag = (na >> 8) & 255, ab = na & 255;
    const br = (nb >> 16) & 255, bg = (nb >> 8) & 255, bb = nb & 255;
    return 'rgb(' + Math.round(lerp(ar, br, t)) + ',' +
                    Math.round(lerp(ag, bg, t)) + ',' +
                    Math.round(lerp(ab, bb, t)) + ')';
  }

  /* 场景取色：从 g[] 调出「踩亮」与「踩暗」两档，并把 accent 少量揉入亮档 */
  function pal(sc){
    return {
      light: mixHex(mixHex(sc.g[2], '#ffffff', .20), sc.accent, .28),
      lite2: mixHex(mixHex(sc.g[2], '#ffffff', .34), sc.accent, .22),
      dark:  shade(sc.g[3], -.30),
      accent: sc.accent
    };
  }

  /* ══════════════════════════════════════════════════════
     地形分区（大色域 + 锯齿交界 + 土坡阶梯阴影）
     · 外圈浅色高地 → 两块不对称中色土斑 → 中央深色低洼核心
     · 边界用「逐点取整」的锯齿路径，天然是 2–4px 的像素台阶
     · 交界再叠 3 条向下偏移的暗描边 + 1 条向上偏移的亮描边，
       上缘受光、下缘投影 → 读起来是土坡/断崖而不是色块拼接
     ══════════════════════════════════════════════════════ */
  function zoneCols(sc){
    /* 取色工具：同时接受 #rrggbb 与 rgb()，避免嵌套混色时解析失败 */
    const rgbOf = function(c){
      if(c.charAt(0) === '#'){ const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      const m = (c.match(/\d+/g) || [0, 0, 0]);
      return [+m[0], +m[1], +m[2]];
    };
    const pack = function(a){ return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; };
    const blend = function(a, b, t){
      const A = rgbOf(a), B = rgbOf(b);
      return pack([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    };
    /* 外圈浅色地 · 两块中色土斑 · 中央深色低洼：亮度阶梯约 1.75 : 1.35 : 1
       （3D 舞台的平行光会把地面整体提亮 ~1.9×，所以底色不能再加白） */
    const light = blend(sc.g[2], sc.accent, .045);
    const mid   = blend(sc.g[1], sc.g[2], .40);
    const dark  = blend(sc.g[3], sc.g[2], .42);
    const deep  = blend(sc.g[3], sc.g[2], .14);
    return { light:light, mid:mid, dark:dark, deep:deep };
  }

  /* 锯齿椭圆：返回 { p:Path2D, pts:[{x,y}] } */
  function jagPath(cx, cy, rx, ry, sd, amp, step){
    const per = Math.PI * (rx + ry) * 1.06;
    const N = clamp(Math.round(per / (step || 3)), 48, 900);
    const p = new Path2D();
    const pts = [];
    for(let i=0;i<=N;i++){
      const a = i / N * TAU;
      const n = Math.sin(a * 3 + sd) * .55 +
                Math.sin(a * 5 - sd * 1.7) * .28 +
                Math.sin(a * 9 + sd * .6) * .17 +
                Math.sin(a * 23 + sd * 2.3) * .07;
      const k = 1 + n * amp;
      /* 逐点 ±1.5px 抖动 = 高频像素毛边；取整再压一道台阶 */
      const jh = function(s){ return ((Math.sin(s) * 43758.5453) % 1 + 1) % 1; };
      const jx = jh(i * 12.9898 + sd) * 3 - 1.5;
      const jy = jh(i * 78.233 + sd * 3.7) * 3 - 1.5;
      const x = Math.round(cx + Math.cos(a) * rx * k + jx);
      const y = Math.round((cy + Math.sin(a) * ry * k + jy) * 2) / 2;
      if(i === 0) p.moveTo(x, y); else p.lineTo(x, y);
      if(i < N) pts.push({ x:x, y:y });
    }
    p.closePath();
    return { p:p, pts:pts };
  }

  /* 土坡：下缘三层投影（越往下越淡越宽）+ 上缘一条受光亮边 */
  function cliff(g, p, dark, lite, strong){
    const k = strong ? 1 : .55;
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = dark;
    for(let i=0;i<3;i++){
      g.globalAlpha = (.16 - i * .048) * k;
      g.lineWidth = 3.2 - i * .7;
      g.stroke(p);
      g.translate(0, 1.7);
    }
    g.restore();
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = lite;
    g.globalAlpha = .14 * k;
    g.lineWidth = 1.8;
    g.translate(0, -1.8);
    g.stroke(p);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawZones(g, sc, R, m){
    const C = zoneCols(sc);
    const W = AW, H = AH;
    const zones = [];

    /* ① 外圈浅色高地：整块铺底，代表"被日晒/风吹的高处沙地" */
    g.fillStyle = C.light;
    g.fillRect(0, 0, W, H);

    /* ② 两块不对称的中色土斑：湿沙 / 踩实的旧营地 */
    const mids = [
      { cx:W * .19, cy:H * .72, rx:W * .255, ry:H * .215, amp:.17 },
      { cx:W * .81, cy:H * .26, rx:W * .235, ry:H * .200, amp:.15 }
    ];
    for(let i=0;i<mids.length;i++){
      const md = mids[i];
      const z = jagPath(md.cx + (R() - .5) * 46, md.cy + (R() - .5) * 34,
                        md.rx, md.ry, R() * 9, md.amp, 4.5);
      g.globalAlpha = .82;
      g.fillStyle = C.mid;
      g.fill(z.p);
      g.globalAlpha = 1;
      zones.push({ p:z.p, pts:z.pts, strong:false, col:C });
      /* 交界处的碎石带：侵蚀下来的颗粒堆在坡脚 */
      for(let k=0;k<z.pts.length;k+=5){
        if(R() < .62) continue;
        const q = z.pts[k];
        g.globalAlpha = al(.07 + R() * .08);
        g.fillStyle = R() < .5 ? C.deep : C.light;
        g.fillRect(q.x + (R() - .5) * 6, q.y + 1 + R() * 5, 1 + R() * 3, 1 + R() * 2);
      }
    }

    /* ③ 中央深色低洼核心：被烧过/被压实的焦土盆地 */
    g.globalAlpha = 1;
    const core = jagPath(CX + (R() - .5) * 30, CY + (R() - .5) * 22,
                         W * .295, H * .305, 3.1 + R() * 1.4, .13, 2.6);
    const grad = g.createRadialGradient(CX, CY - H * .02, 40, CX, CY, W * .33);
    grad.addColorStop(0, C.deep);
    grad.addColorStop(.58, C.dark);
    grad.addColorStop(1, C.dark);
    g.fillStyle = grad;
    g.fill(core.p);
    zones.push({ p:core.p, pts:core.pts, strong:true, col:C });

    /* ④ 核心内壁：贴着崖边再压一圈更深的带，强化"往下沉"的体积 */
    g.save();
    g.globalAlpha = .10;
    g.strokeStyle = C.deep;
    g.lineWidth = 10;
    g.stroke(core.p);
    g.restore();

    /* ⑤ 坡脚碎石带：只在崖线下缘，密度是地面的 3–4 倍 */
    for(let k=0;k<core.pts.length;k+=3){
      if(R() < .30) continue;
      const q = core.pts[k];
      const n = 1 + (R() * 2 | 0);
      for(let j=0;j<n;j++){
        const w = 2 + R() * 6, h = 1.5 + R() * 3;
        g.globalAlpha = al(.09 + R() * .10);
        g.fillStyle = C.deep;
        g.fillRect(q.x + (R() - .5) * 9, q.y + 2 + R() * 7, w, h);
        g.globalAlpha = al(.06 + R() * .07);
        g.fillStyle = C.light;
        g.fillRect(q.x + (R() - .5) * 9, q.y + 2 + R() * 6, w * .8, 1);
      }
    }
    g.globalAlpha = 1;

    /* ⑥ 土坡阶梯阴影：优先画到 1:1 的 marks 层，否则会被 3D 低分辨率吃掉 */
    const t = m || g;
    for(let i=0;i<zones.length;i++){
      const z = zones[i];
      cliff(t, z.p, z.col.deep, z.col.light, z.strong);
      /* 崖壁上的层理：沿着边界补 1–2px 的短横条，读起来是"受光的岩层" */
      if(!z.strong) continue;
      for(let k=0;k<z.pts.length;k+=2){
        if(R() < .55) continue;
        const q = z.pts[k];
        const len = 2 + R() * 5;
        t.globalAlpha = al(.08 + R() * .08);
        t.fillStyle = R() < .5 ? z.col.light : z.col.deep;
        t.fillRect(q.x - len * .5, q.y + 1 + R() * 3, len, 1);
      }
      t.globalAlpha = 1;
    }
  }

  /* ══════════════════════════════════════════════════════
     干涸沟壑：顶替原来的 64px 砖缝网格
     · 从动线附近起头，朝地图中心蜿蜒，深沟 + 一侧受光亮唇
     · 2–4px 宽，随机分叉，远看是水冲刷出来的地裂，不是人造网格
     ══════════════════════════════════════════════════════ */
  function gullies(g, R, P, ps){
    const N = 9;
    for(let i=0;i<N;i++){
      const pp = ps[i % ps.length];
      const q = qbez(pp, .12 + R() * .68);
      let x = q.x + (R() - .5) * 66, y = q.y + (R() - .5) * 50;
      let a = Math.atan2(CY + (R() - .5) * 240 - y, CX + (R() - .5) * 240 - x);
      const pts = [{ x:x, y:y }];
      const segs = 7 + (R() * 7 | 0);
      for(let k=0;k<segs;k++){
        a += (R() - .5) * .62;
        const l = 11 + R() * 24;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l * KZ;
        pts.push({ x:x, y:y });
      }
      /* 沟壁投影（暗）+ 沟唇受光（亮，整体上移 2px） */
      for(let pass=0;pass<2;pass++){
        g.save();
        if(pass === 0) g.translate(0, -2.2);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for(let k=1;k<pts.length;k++) g.lineTo(pts[k].x, pts[k].y);
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.strokeStyle = pass === 0 ? P.light : P.dark;
        g.globalAlpha = al(pass === 0 ? .09 : .17);
        g.lineWidth = pass === 0 ? 1.3 : 3.1;
        g.stroke();
        g.restore();
      }
      /* 沟边塌落的碎块 */
      for(let k=1;k<pts.length;k++){
        if(R() < .45) continue;
        g.globalAlpha = al(.06 + R() * .07);
        g.fillStyle = R() < .55 ? P.dark : P.light;
        g.fillRect(pts[k].x + (R() - .5) * 8, pts[k].y + 1 + R() * 4, 1 + R() * 3, 1 + R() * 2);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── 动线：中央开阔区 → 地图边缘/角落，轻微弯曲 ── */
  function paths(sc){
    const R = mulberry(sc.name.length * 613 + sc.deco.length * 977 + 29);
    const out = [];
    const N = 4;
    const a0 = R() * TAU;
    for(let i=0;i<N;i++){
      const a = a0 + i * (TAU / N) + (R() - .5) * .42;
      const ca = Math.cos(a), sa = Math.sin(a);
      const sx = CX + ca * 104, sy = CY + sa * 88;
      const ex = clamp(CX + ca * (AW * .5 - 30), WALL + 34, AW - WALL - 34);
      const ey = clamp(CY + sa * (AH * .5 - 30), WALL + 38, AH - WALL - 38);
      const mx = (sx + ex) * .5 + (R() - .5) * 180;
      const my = (sy + ey) * .5 + (R() - .5) * 120;
      out.push({ sx:sx, sy:sy, mx:mx, my:my, ex:ex, ey:ey, w:18 + R() * 6, seed:R() * 100 });
    }
    return out;
  }

  /* 二次贝塞尔求值 */
  function qbez(p, t){
    const u = 1 - t;
    return { x:u*u*p.sx + 2*u*t*p.mx + t*t*p.ex,
             y:u*u*p.sy + 2*u*t*p.my + t*t*p.ey };
  }

  /* 软痕：用 3–4 个抖动的小椭圆堆出「边缘破碎的浅色斑」，避免硬边椭圆像贴纸
     · 单个椭圆透明度很低，叠加后累计约 a，不会变成突兀的亮斑 */
  function softPatch(g, x, y, rx, ry, col, a, R){
    const n = 3 + (R() * 2 | 0);
    for(let i=0;i<n;i++){
      const ox = (R() - .5) * rx * .95, oy = (R() - .5) * ry * .95;
      const k = .50 + R() * .50;
      g.globalAlpha = al(a / n * (.7 + R() * .6));
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rx * k * 1.15, ry * k, 0, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ── 磨损动线：窄幅「踩踏小道」
     一条被踩亮的细带 + 两道深色车辙/脚痕 + 零星碎石，
     宽度 14–20px，长段连续、短段断开，读起来是通道而不是水洼。 ── */
  function drawWear(g, p, R, P){
    const N = 170;
    const pts = [];
    for(let i=0;i<=N;i++){
      const t = i / N;
      const pt = qbez(p, t);
      const near = .55 + .45 * Math.sin(Math.PI * t);
      const hw = p.w * .5 * (.70 + .30 * Math.sin(Math.PI * t));
      const wob = (Math.sin(t * 8.7 + p.seed) * .38 + Math.sin(t * 21.3 - p.seed) * .18) * hw;
      const gate = Math.sin(t * 5.1 + p.seed) * .68 + Math.sin(t * 2.3 - p.seed * .7) * .32;
      const t2 = Math.min(1, t + .004);
      const pt2 = qbez(p, t2);
      const tx = pt2.x - pt.x, ty = pt2.y - pt.y;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const ux = -ty / tl, uy = tx / tl;
      pts.push({ x:pt.x + ux * wob, y:pt.y + uy * wob,
                 ux:ux, uy:uy, hw:hw, near:near,
                 on:(gate > -.28) });
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';
    let i = 0;
    while(i < pts.length){
      if(!pts[i].on){ i++; continue; }
      const run = [];
      while(i < pts.length && pts[i].on){ run.push(pts[i]); i++; }
      if(run.length < 7) continue;

      // 被踩亮的细带（主体）
      g.globalAlpha = al(.19);
      g.strokeStyle = P.light;
      g.lineWidth = Math.max(3, p.w * .62);
      g.beginPath();
      g.moveTo(run[0].x, run[0].y);
      for(let k=1;k<run.length;k++) g.lineTo(run[k].x, run[k].y);
      g.stroke();

      // 两道深色辙痕：偏 ±p.w*.34，断续更明显
      for(let s=-1;s<=1;s+=2){
        g.globalAlpha = al(.16);
        g.strokeStyle = P.dark;
        g.lineWidth = Math.max(1.5, p.w * .17);
        g.beginPath();
        for(let k=0;k<run.length;k++){
          const q = run[k];
          const x = q.x + q.ux * s * p.w * .34;
          const y = q.y + q.uy * s * p.w * .34;
          if(k === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }

      // 中心高光短划：强调「被踩得发亮」的局部
      for(let k=2;k<run.length;k+=3){
        const a = run[k - 1], b = run[k];
        if(R() < .45) continue;
        g.globalAlpha = al((.17 + R() * .05) * b.near);
        g.strokeStyle = P.lite2;
        g.lineWidth = Math.max(1, p.w * .22);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }

      // 路径两侧的碎石与踩碎痕迹
      for(let k=2;k<run.length;k+=3){
        if(R() < .5) continue;
        const q = run[k];
        const side = R() < .5 ? 1 : -1;
        g.globalAlpha = al(.09 + R() * .06);
        g.fillStyle = R() < .55 ? P.dark : P.light;
        g.fillRect(q.x + q.ux * side * (p.w * .5 + R() * 9),
                   q.y + q.uy * side * (p.w * .5 + R() * 6),
                   2 + R() * 3, 1 + R() * 2);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── 补给投放候选点：确定性生成，避开中央与 solid 道具 ── */
  function pads(sc, props){
    props = props || [];
    const R = mulberry(sc.name.charCodeAt(1) * 613 + sc.deco.length * 97 + 11);
    const out = [];
    let guard = 400;
    while(out.length < PAD_COUNT && guard-- > 0){
      const x = 152 + R() * (AW - 304);
      const y = 156 + R() * (AH - 312);
      if(d2(x, y, CX, CY) < PAD_SAFE * PAD_SAFE) continue;
      let ok = true;
      for(let i=0;i<props.length;i++){
        const pr = props[i];
        const rr = pr.r + (pr.lm ? 62 : 34);
        if((pr.solid || pr.lm) && d2(x, y, pr.x, pr.y) < rr * rr){ ok = false; break; }
      }
      if(!ok) continue;
      for(let i=0;i<out.length;i++){
        if(d2(x, y, out[i].x, out[i].y) < 165 * 165){ ok = false; break; }
      }
      if(!ok) continue;
      out.push({ x:x, y:y, kind:(out.length % 2) ? 'foot' : 'tire', ang:R() * TAU, seed:R() * 100 });
    }
    return out;
  }

  /* 轮胎印：两条平行虚带 + 横向胎纹，清晰但不抢角色 */
  function drawTire(g, x, y, ang, R, P){
    const track = 20, len = 140;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    for(let s=-1;s<=1;s+=2){
      const yy = s * track * .5;
      // 两条平行胎带（断续）
      for(let i=0;i<9;i++){
        if(Math.sin(i * 2.3 + s * 1.7) < -.55) continue;
        const u = i / 9;
        const fade = .55 + .45 * Math.sin(Math.PI * (u + .05));
        g.globalAlpha = al((.15 + R() * .04) * fade);
        g.fillStyle = P.dark;
        g.fillRect(-len / 2 + i * len / 9, yy - 1.6, len / 9 - 3, 3.2);
      }
      // 横向胎纹缺口
      for(let i=0;i<15;i++){
        const fx = -len / 2 + 5 + i * (len - 10) / 14;
        g.globalAlpha = al(.12 + R() * .04);
        g.fillStyle = (i % 2) ? P.light : P.dark;
        g.fillRect(fx, yy - 4, 1.6, 8);
      }
      // 边缘磨损碎屑
      for(let i=0;i<16;i++){
        if(R() < .5) continue;
        g.globalAlpha = al(.08 + R() * .05);
        g.fillStyle = R() < .5 ? P.light : P.dark;
        g.fillRect(-len / 2 + R() * len, yy + s * (2 + R() * 5), 2, 1.5);
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  /* 脚印：成对像素簇，交替左右、逐渐变淡 */
  function drawFoot(g, x, y, ang, R, P){
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa, py = ca;
    for(let i=0;i<12;i++){
      const side = (i % 2) ? 1 : -1;
      const d = i * 16;
      const fx = x + ca * d + px * side * 7;
      const fy = y + sa * d + py * side * 7;
      const fade = 1 - i * .055;
      g.globalAlpha = al((.17 + R() * .04) * fade);
      g.fillStyle = P.dark;
      g.fillRect(fx, fy, 4, 5);
      g.fillRect(fx + ca * 4, fy + sa * 4, 3, 3);
      if(R() < .45){
        g.globalAlpha = al(.10 + R() * .04);
        g.fillStyle = P.light;
        g.fillRect(fx + (R() - .5) * 4, fy + (R() - .5) * 4, 2, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── 投放点痕迹：踩实浅痕 + 轮胎印/脚印 + 破碎碎屑 ── */
  function drawPads(g, list, R, P){
    for(let i=0;i<list.length;i++){
      const pd = list[i];
      // 地面被踩实的一片浅痕（簇状软痕，暗示这里常有东西落地）
      softPatch(g, pd.x, pd.y, 24 + R() * 8, (24 + R() * 8) * KZ, P.light, .11, R);
      if(pd.kind === 'tire') drawTire(g, pd.x, pd.y, pd.ang, R, P);
      else drawFoot(g, pd.x, pd.y - 24, pd.ang, R, P);
      for(let k=0;k<7;k++){
        g.globalAlpha = al(.05 + R() * .05);
        g.fillStyle = R() < .5 ? P.dark : P.light;
        g.fillRect(pd.x + (R() - .5) * 56, pd.y + (R() - .5) * 36, 1 + R() * 2, 1 + R() * 2);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── 边缘角落堆叠：碎石 + 干草碎渣（中央几乎为 0） ── */
  function cornerRubble(g, R, P){
    for(let i=0;i<900;i++){
      const x = R() * AW, y = R() * AH;
      const cn = cornerness(x, y);
      if(cn < .30 || R() > .55 * cn) continue;
      const w = 5 + R() * 9, h = (3 + R() * 5) * KZ + 1.5;
      // 石块本体（暗）+ 顶部受光边（亮）：比纯色块更像碎石
      g.globalAlpha = al(.10 + R() * .10);
      g.fillStyle = P.dark;
      g.fillRect(x, y, w, h);
      g.globalAlpha = al(.09 + R() * .08);
      g.fillStyle = P.light;
      g.fillRect(x, y, w, 1);
      if(R() < .35){
        g.globalAlpha = al(.07 + R() * .07);
        g.fillStyle = P.lite2;
        g.fillRect(x + w * .55, y + h * .5, 1 + R() * 2, 1);
      }
      // 角落裂纹：比碎点更长，远看能读出「边缘更破败」
      if(R() < .06){
        crack(g, x, y, R, P.dark, 2);
      }
      // 干草 / 碎渣
      if(R() < .28){
        g.globalAlpha = al(.08 + R() * .07);
        g.strokeStyle = P.light;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + (R() - .5) * 14, y - 3 - R() * 8);
        g.stroke();
      }
    }
    /* 角落成组碎石：4–6 块石头挤在一起，远看能读出「这里是边缘废墟」 */
    for(let i=0;i<54;i++){
      const x = R() * AW, y = R() * AH;
      const cn = cornerness(x, y);
      if(cn < .52 || R() > .75 * cn) continue;
      const n = 4 + (R() * 3 | 0);
      for(let k=0;k<n;k++){
        const ox = (R() - .5) * 26, oy = (R() - .5) * 16;
        const w = 7 + R() * 9, h = (4 + R() * 5) * KZ + 1.5;
        g.globalAlpha = al(.13 + R() * .08);
        g.fillStyle = P.dark;
        g.fillRect(x + ox, y + oy, w, h);
        g.globalAlpha = al(.10 + R() * .06);
        g.fillStyle = P.light;
        g.fillRect(x + ox, y + oy, w, 1.2);
      }
    }
    /* 角落大裂纹：30–60px，明确区分中央开阔区 */
    for(let i=0;i<16;i++){
      const x = R() * AW, y = R() * AH;
      const cn = cornerness(x, y);
      if(cn < .55 || R() > .8 * cn) continue;
      crack(g, x, y, R, P.dark, 2);
    }
    g.globalAlpha = 1;
  }
  function grassTuft(g, x, y, R, col){
    const n = 3 + (R() * 3 | 0);
    g.lineWidth = 1.6;
    g.strokeStyle = col + '1)';
    g.globalAlpha = al(.07 + R() * .05);
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(x - 2, y - 1, 5, 2);
    for(let i=0;i<n;i++){
      const bx = x + (R() - .5) * 8, by = y + (R() - .5) * 4;
      const hh = 6 + R() * 9;
      g.globalAlpha = al(.08 + R() * .07);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + (R() - .5) * 5, by - hh);
      g.stroke();
    }
  }

  /* 分叉裂纹（霜裂/地裂通用） */
  function crack(g, x, y, R, col, depth){
    let px = x, py = y, a = R() * TAU;
    const segs = 3 + (R() * 4 | 0);
    g.strokeStyle = col;
    g.lineWidth = 1;
    g.globalAlpha = al(.05 + R() * .07);
    g.beginPath();
    g.moveTo(px, py);
    for(let i=0;i<segs;i++){
      a += (R() - .5) * 1.2;
      const l = 6 + R() * 15;
      px += Math.cos(a) * l;
      py += Math.sin(a) * l * KZ;
      g.lineTo(px, py);
    }
    g.stroke();
    if(depth > 0){
      crack(g, px, py, R, col, depth - 1);
      if(R() < .55) crack(g, (x + px) * .5, (y + py) * .5, R, col, depth - 1);
    }
  }

  /* ── 落日废土：浮尘斑 / 风蚀纹 / 踩踏土痕 / 干草簇 ── */
  function decoDust(g, sc, R, P, ps){
    for(let i=0;i<150;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .26 * density(x, y)) continue;
      g.globalAlpha = al(.025 + R() * .028);
      g.fillStyle = 'rgba(255,180,120,1)';
      /* 一团由 2–3 个小椭圆拼成，边缘不圆，不会读成"水渍" */
      const r = 3 + R() * 5;
      g.beginPath(); g.ellipse(x, y, r, r * KZ, 0, 0, TAU); g.fill();
      if(R() < .7) g.beginPath(), g.ellipse(x + (R() - .5) * r * 2.2, y + (R() - .5) * r * 1.4, r * .72, r * .5 * KZ, 0, 0, TAU), g.fill();
    }
    // 风蚀纹：动线附近顺风的细长浅痕
    for(let i=0;i<34;i++){
      const pp = ps[(R() * ps.length) | 0];
      const q = qbez(pp, .08 + R() * .84);
      const ox = q.x + (R() - .5) * 54, oy = q.y + (R() - .5) * 36;
      const len = 12 + R() * 36;
      g.globalAlpha = al(.05 + R() * .045);
      g.strokeStyle = P.light;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + len, oy + len * -.20 + (R() - .5) * 4);
      g.stroke();
    }
    // 被踩踏的浅色土痕（簇状，沿动线）
    for(let i=0;i<26;i++){
      const pp = ps[(R() * ps.length) | 0];
      const pt = qbez(pp, .12 + R() * .76);
      const rr = 7 + R() * 10;
      softPatch(g, pt.x + (R() - .5) * 22, pt.y + (R() - .5) * 16, rr, rr * KZ, 'rgb(214,178,142)', .055, R);
    }
    // 干草簇：只长在中央开阔区之外
    for(let i=0;i<240;i++){
      const x = R() * AW, y = R() * AH;
      const dn = density(x, y);
      if(dn < .62 || R() > .30 * dn) continue;
      grassTuft(g, x, y, R, 'rgba(206,160,88,');
    }
  }

  /* ── 冰封矿场：霜线 / 霜裂 / 碎冰晶 / 踩出的深色冰痕 ── */
  function decoIce(g, sc, R, P, ps){
    for(let i=0;i<300;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .28 * density(x, y)) continue;
      const a2 = R() * TAU, l = 20 + R() * 80;
      g.globalAlpha = al(.05 + R() * .10);
      g.strokeStyle = 'rgba(200,245,255,1)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l * KZ);
      g.stroke();
    }
    // 霜裂：沿动线分叉（用塞子固定分叉形态）
    for(let i=0;i<20;i++){
      const pp = ps[(R() * ps.length) | 0];
      const pt = qbez(pp, .08 + R() * .84);
      crack(g, pt.x + (R() - .5) * 52, pt.y + (R() - .5) * 34, R, 'rgba(206,244,255,1)', 2);
    }
    // 嵌入地面的碎冰晶
    for(let i=0;i<130;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .30 * density(x, y)) continue;
      const s = 1 + R() * 2;
      g.globalAlpha = al(.06 + R() * .08);
      g.fillStyle = 'rgba(190,240,255,1)';
      g.beginPath();
      g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s * KZ); g.lineTo(x - s, y);
      g.closePath(); g.fill();
    }
    // 踩出来的深色冰痕
    for(let i=0;i<30;i++){
      const pp = ps[(R() * ps.length) | 0];
      const pt = qbez(pp, R());
      g.globalAlpha = al(.06 + R() * .05);
      g.fillStyle = 'rgba(12,26,36,1)';
      g.fillRect(pt.x + (R() - .5) * 30, pt.y + (R() - .5) * 18, 3 + R() * 9, 2 + R() * 3);
    }
  }

  /* ── 熔岩工厂：熔缝 / 焦痕 / 零星余烬（静态贴图，不做动态粒子） ── */
  function decoLava(g, sc, R, P, ps){
    for(let i=0;i<70;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .30 * density(x, y)) continue;
      g.strokeStyle = 'rgba(255,' + (90 + (R() * 80 | 0)) + ',40,1)';
      g.globalAlpha = .13 + R() * .20;
      g.lineWidth = 1.4 + R() * 1.8;
      g.lineJoin = 'round';
      g.beginPath();
      /* 细步进 + 小角度扰动：读起来是"熔岩裂缝"，不是折线箭头 */
      let px2 = x, py2 = y, aa2 = R() * TAU;
      const legs = 14 + (R() * 10 | 0);
      g.moveTo(px2, py2);
      for(let k=0;k<legs;k++){
        aa2 += (R() - .5) * .38;
        px2 += Math.cos(aa2) * (5 + R() * 7);
        py2 += Math.sin(aa2) * (5 + R() * 7);
        g.lineTo(px2, py2);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    // 焦痕：深色灼烧晕 + 橙色残炭，暗示这里曾经烧过
    for(let i=0;i<26;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .30 * density(x, y)) continue;
      const r = 9 + R() * 20;
      g.globalAlpha = al(.06 + R() * .05);
      g.fillStyle = 'rgba(24,12,8,1)';
      g.beginPath(); g.ellipse(x, y, r, r * KZ, 0, 0, TAU); g.fill();
      for(let k=0;k<5;k++){
        const aa = R() * TAU, rr = r * (.5 + R() * .5);
        g.globalAlpha = al(.08 + R() * .08);
        g.fillStyle = R() < .5 ? 'rgba(255,150,60,1)' : 'rgba(255,206,110,1)';
        g.fillRect(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr * KZ, 1 + R() * 1.5, 1 + R());
      }
    }
  }

  /* ── 霓虹雨夜：炫光条 / 湿地反射（模糊色块 + 垂直拉丝） ── */
  function decoNeon(g, sc, R, P, ps){
    for(let i=0;i<90;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .30 * density(x, y)) continue;
      g.strokeStyle = R() < .5 ? 'rgba(90,220,255,1)' : 'rgba(255,90,180,1)';
      g.globalAlpha = .16 + R() * .14;
      g.lineWidth = 2 + R() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + R() * 90, y); g.stroke();
    }
    g.globalAlpha = 1;
    // 湿地反射：招牌/灯箱在地面的倒影，垂直方向拉丝
    for(let i=0;i<22;i++){
      const x = 60 + R() * (AW - 120), y = 60 + R() * (AH - 120);
      const col = R() < .5 ? 'rgba(87,224,255,' : 'rgba(255,110,190,';
      const w = 22 + R() * 46, h = 9 + R() * 14;
      g.globalAlpha = clamp(.030 + R() * .035, .025, .075);
      g.fillStyle = col + '1)';
      g.beginPath(); g.ellipse(x, y, w * .5, h * .5 * KZ + 3, 0, 0, TAU); g.fill();
      for(let k=0;k<4;k++){
        g.globalAlpha = clamp(.026 + R() * .03, .02, .06);
        g.fillRect(x + (R() - .5) * w * .8, y, 1 + R(), h * (.6 + R() * .9));
      }
      if(R() < .5){
        g.globalAlpha = clamp(.05 + R() * .04, .04, .09);
        g.fillRect(x - w * .3, y - h * .1, w * .6, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── 虚空核心：紫色微粒 / 角落符文圆环（中央保持干净） ── */
  function decoVoid(g, sc, R, P, ps){
    for(let i=0;i<300;i++){
      const x = R() * AW, y = R() * AH;
      if(R() > .22 * density(x, y)) continue;
      g.globalAlpha = al(.05 + R() * .12);
      g.fillStyle = 'rgba(210,150,255,1)';
      g.fillRect(x, y, 2, 2);
    }
    const cs = [[86, 96], [AW - 86, 96], [86, AH - 96], [AW - 86, AH - 96]];
    for(let i=0;i<cs.length;i++){
      const cx2 = cs[i][0] + (R() - .5) * 20;
      const cy2 = cs[i][1] + (R() - .5) * 20;
      for(let k=0;k<2;k++){
        const rr = 22 + k * 13 + R() * 6;
        const a0 = .3 + R() * .8;
        g.globalAlpha = al(.05 + R() * .03);
        g.strokeStyle = 'rgba(199,125,255,1)';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(cx2, cy2, rr, rr * KZ, 0, a0, a0 + 3.4);
        g.stroke();
      }
      for(let k=0;k<9;k++){
        const aa = R() * TAU, rr = 20 + R() * 26;
        g.globalAlpha = al(.05 + R() * .07);
        g.fillStyle = 'rgba(214,166,255,1)';
        g.fillRect(cx2 + Math.cos(aa) * rr, cy2 + Math.sin(aa) * rr * KZ, 1 + R() * 1.5, 1 + R());
      }
    }
    // 边缘的虚空侵蚀
    for(let i=0;i<170;i++){
      const x = R() * AW, y = R() * AH;
      const cn = cornerness(x, y);
      if(cn < .3 || R() > .6 * cn) continue;
      g.globalAlpha = al(.05 + R() * .06);
      g.fillStyle = 'rgba(12,6,24,1)';
      g.fillRect(x, y, 3 + R() * 10, 2 + R() * 5);
    }
    g.globalAlpha = 1;
  }

  function deco(g, sc, R, P, ps){
    if(sc.deco === 'dust') decoDust(g, sc, R, P, ps);
    else if(sc.deco === 'neon') decoNeon(g, sc, R, P, ps);
    else if(sc.deco === 'ice') decoIce(g, sc, R, P, ps);
    else if(sc.deco === 'lava') decoLava(g, sc, R, P, ps);
    else decoVoid(g, sc, R, P, ps);
    g.globalAlpha = 1;
  }

  return {
    density:density, cornerness:cornerness, noise2:noise2,
    paths:paths, pads:pads, pal:pal, zoneCols:zoneCols,
    drawZones:drawZones, gullies:gullies,
    drawWear:drawWear, drawPads:drawPads, cornerRubble:cornerRubble,
    deco:deco
  };
})();

/* ── 地面烘焙 ──
   base: 底色 / 斑驳 / 砖缝 / 边界墙（也作为 3D 地面贴图）
   marks: 路径 / 补给痕迹 / 角落堆叠 / 场景叙事（透明层，1:1 叠加，
          避免被 3D 低分辨率渲染目标降采样吃掉细节） */
function buildGround(sc, padsIn){
  const c = document.createElement('canvas');
  c.width = ARENA.w; c.height = ARENA.h;
  const g = c.getContext('2d');
  const mc = document.createElement('canvas');
  mc.width = ARENA.w; mc.height = ARENA.h;
  const m = mc.getContext('2d');
  const R = mulberry(sc.name.length * 977 + sc.g[0].length * 31 + 5);
  const P = GROUND.pal(sc);
  const ps = GROUND.paths(sc);
  const pads = padsIn || GROUND.pads(sc, G.props || []);

  g.fillStyle = sc.g[0];
  g.fillRect(0, 0, c.width, c.height);

  /* 1 · 地形分区：大色域 + 锯齿交界 + 土坡阶梯阴影（替代原先的纯色平铺）
         边界描边直接进 marks 层，1:1 绘制才不会被 3D 低分辨率糊掉 */
  GROUND.drawZones(g, sc, R, m);

  /* 2 · 大块斑驳：按区域密度加权（中央稀疏 / 角落堆叠），同时把分区边界揉碎 */
  for(let i=0;i<1800;i++){
    const x = R() * c.width, y = R() * c.height;
    const w = 10 + R() * 46, h = 7 + R() * 26;
    if(R() > .30 * GROUND.density(x + w * .5, y + h * .5)) continue;
    g.globalAlpha = .05 + R() * .13;
    g.fillStyle = R() < .5 ? sc.g[1] : sc.g[2];
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  /* 2.5 · 细颗粒：把大色块之间填上肉眼可见的"沙砾"，避免整片读成模糊色块 */
  for(let i=0;i<2600;i++){
    const x = R() * c.width, y = R() * c.height;
    if(R() > .55 * GROUND.density(x, y)) continue;
    g.globalAlpha = .04 + R() * .08;
    g.fillStyle = R() < .5 ? sc.g[2] : sc.g[3];
    const s = 1 + R() * 3;
    g.fillRect(Math.round(x), Math.round(y), s, s);
  }
  g.globalAlpha = 1;

  /* 3 · 干涸沟壑：用不规则地裂顶替掉原来的 64px 砖缝网格
         （真实场景里不会有那么规整的十字线） */
  GROUND.gullies(m, R, P, ps);

  /* 4 · 边缘角落堆叠：碎石 / 杂物碎屑 */
  GROUND.cornerRubble(m, R, P);

  /* 5 · 动线：中央开阔区 → 边缘，断续磨损带 */
  for(let i=0;i<ps.length;i++) GROUND.drawWear(m, ps[i], R, P);

  /* 6 · 场景特征 + 叙事细节（每个场景都不一样） */
  GROUND.deco(m, sc, R, P, ps);

  /* 7 · 补给投放点痕迹（与 spawnCrate 共用同一批坐标） */
  GROUND.drawPads(m, pads, R, P);

  // 边界墙
  const wall = 22;
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.fillRect(0, 0, c.width, wall);
  g.fillRect(0, c.height - wall, c.width, wall);
  g.fillRect(0, 0, wall, c.height);
  g.fillRect(c.width - wall, 0, wall, c.height);
  g.strokeStyle = sc.accent;
  g.globalAlpha = .18;
  g.lineWidth = 2;
  g.strokeRect(wall, wall, c.width - wall*2, c.height - wall*2);
  g.globalAlpha = 1;
  G.groundMarks = mc;
  return c;
}

/* 道具布置：1 个固定主地标 + 7 组小道具（每组 2~3 件，同一基点）
   成组比散落更有场景感，渲染开销几乎不变（总件数与原 16 件相当）。 */
function buildProps(sc){
  const R = mulberry(sc.name.charCodeAt(0) * 311 + 7);
  const out = [];
  const si = Math.max(0, SCENES.indexOf(sc));
  const lm = LANDMARKS[si] || LANDMARKS[0];

  /* ① 主地标：固定坐标、纯视觉，solid:false 不参与碰撞 */
  out.push({
    x:lm.x, y:lm.y, r:lm.r, h:lm.h,
    kind:lm.kind, seed:si * 13 + 5,
    solid:false, lm:true, grp:-1, lift:0
  });

  /* ② 小道具成组生成 */
  const GROUPS = 7;
  let placed = 0, guard = 260;
  while(placed < GROUPS && guard-- > 0){
    const gx = 128 + R() * (ARENA.w - 256);
    const gy = 136 + R() * (ARENA.h - 272);
    if(d2(gx, gy, ARENA.w/2, ARENA.h/2) < 152*152) continue;   // 中央留白
    if(dst(gx, gy, lm.x, lm.y) < lm.r + 96) continue;          // 不压地标
    let ok = true;
    for(let i=0;i<out.length;i++){
      const pr = out[i];
      const gap = pr.lm ? pr.r + 92 : pr.r + 46;
      if(dst(gx, gy, pr.x, pr.y) < gap){ ok = false; break; }
    }
    if(!ok) continue;

    const kind = sc.prop[(R() * sc.prop.length) | 0];
    const style = GROUP_STYLE[kind] || 'pair';
    // 组内件数按样式定：石圈一定 4 块、晶丛 3 根、箱堆 2~3 件
    const n = style === 'ring' ? 4 : style === 'pair' ? 2 : 3;
    const a0 = R() * TAU;
    let baseH = 0;
    for(let k=0;k<n;k++){
      let dx = 0, dy = 0, rs = 1, hs = 1;
      if(style === 'stack'){
        // 堆叠：主箱 + 侧后一件 + 顶上再摞一件
        if(k === 1){ dx = 15 + R() * 4; dy = -6 - R() * 3; rs = .82; hs = .74; }
        else if(k === 2){ dx = 3; dy = -4; rs = .6; hs = .6; }
      } else if(style === 'ring'){
        // 石圈：3~4 块围成一小圈（y 乘 KZ 才是透视里的正圆）
        const a = a0 + k * TAU / n + (R() - .5) * .45;
        const rr = 14 + R() * 6;
        dx = Math.cos(a) * rr; dy = Math.sin(a) * rr * KZ;
        rs = .82 + R() * .34; hs = .78 + R() * .5;
      } else if(style === 'cluster'){
        // 晶丛：同一基点长出来，高度依次递减
        const a = a0 + k * .95 + (R() - .5) * .5;
        const rr = 15 + R() * 10;
        dx = Math.cos(a) * rr; dy = Math.sin(a) * rr * KZ;
        rs = [1, .72, .54][k] * (.9 + R() * .2);
        hs = [1, .8, .62][k] * (.9 + R() * .24);
      } else {
        // 并排：两件错开站
        const s = k ? 1 : -1;
        dx = Math.cos(a0 + 1.57) * s * 19;
        dy = Math.sin(a0 + 1.57) * s * 19 * KZ;
        rs = .88 + R() * .24; hs = .6 + R() * .55;
      }
      const hh = (15 + R() * 22) * hs;
      if(k === 0) baseH = hh;
      out.push({
        x: clamp(gx + dx, 44, ARENA.w - 44),
        y: clamp(gy + dy, 52, ARENA.h - 30),
        r: (9 + R() * 8) * rs,
        h: hh,
        kind: kind,
        seed: R() * 100,
        solid: R() < .68,
        grp: placed,
        /* 顶上那件：抬到主箱顶面（3D 里才有意义，2D 忽略） */
        lift: (style === 'stack' && k === 2) ? baseH * 1.5 + hh * .7 : 0
      });
    }
    placed++;
  }
  return out;
}

/* ── 音效（极简合成器） ── */
const SFX = (function(){
  let ac = null, on = true, master = null;
  let comboPitch = 0, comboTimer = null;
  let ambNodes = null;
  let enemyHitAt = -Infinity;

  function C(){
    if(!ac){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = .9;
      master.connect(ac.destination);
    }
    if(ac.state === 'suspended') ac.resume();
    return ac;
  }
  function out(){ return master || (C(), master); }

  function tone(f1, f2, dur, type, vol, detune){
    if(!on) return;
    const a = C(); if(!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f1, t);
    if(detune) o.detune.setValueAtTime(detune, t);
    if(f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || .05, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out());
    o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, vol, lp, type){
    if(!on) return;
    const a = C(); if(!a) return;
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/n, 2);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain(); g.gain.value = vol;
    const f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = lp || 900;
    src.connect(f); f.connect(g); g.connect(out());
    src.start();
  }

  /* 分武器射击音色（土豆兄弟：不同枪械有辨识度） */
  function shootFor(wid){
    if(!on) return;
    switch(wid){
      case 'shotgun': tone(180, 90, .12, 'sawtooth', .055); noise(.09, .05, 500); break;
      case 'sniper':  tone(520, 160, .11, 'square', .04); tone(180, 60, .16, 'sawtooth', .03); break;
      case 'minigun': tone(820, 560, .03, 'square', .018); break;
      case 'laser':   tone(1100, 1500, .05, 'sawtooth', .02); break;
      case 'plasma':  tone(700, 320, .07, 'triangle', .03); break;
      case 'bow':     tone(560, 320, .06, 'triangle', .022); break;
      case 'rocket':  tone(240, 80, .14, 'sawtooth', .05); break;
      default:        tone(760, 460, .05, 'square', .022); break;
    }
  }

  /* 连击音高递增：连续击杀音调逐级上扬，营造爽快节奏 */
  function killPitched(){
    if(!on) return;
    comboPitch = Math.min(12, comboPitch + 1);
    const base = 380 * Math.pow(1.06, comboPitch);
    noise(.12, .045, 1400);
    tone(base, base * 1.5, .06, 'triangle', .035);
    if(comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(function(){ comboPitch = 0; }, 1200);
  }

  /* 环境氛围底噪：低音量持续循环，营造空间感（Brotato 式氛围垫） */
  function startAmbience(stage){
    stopAmbience();
    if(!on) return;
    const a = C(); if(!a) return;
    const t = a.currentTime;
    const g = a.createGain(); g.gain.value = 0;
    const f = a.createBiquadFilter(); f.type = 'lowpass';
    // 各关不同的底噪频率特征
    const base = [70, 58, 84, 48, 96][stage] || 70;
    f.frequency.value = base * 3;
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = base;
    const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.value = base * 1.5;
    const o2g = a.createGain(); o2g.gain.value = .3;
    const lfo = a.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .12;
    const lfoG = a.createGain(); lfoG.gain.value = .016;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o.connect(f); o2.connect(o2g); o2g.connect(f); f.connect(g); g.connect(out());
    o.start(t); o2.start(t); lfo.start(t);
    g.gain.linearRampToValueAtTime(.016, t + 2.5);
    ambNodes = { g:g, o:o, o2:o2, lfo:lfo };
  }
  function stopAmbience(){
    if(!ambNodes) return;
    const a = C(); if(!a) return;
    try{
      const t = a.currentTime;
      ambNodes.g.gain.linearRampToValueAtTime(0, t + .4);
      ambNodes.o.stop(t + .5); ambNodes.o2.stop(t + .5); ambNodes.lfo.stop(t + .5);
    }catch(e){}
    ambNodes = null;
  }

  return {
    shoot(){ shootFor(G.weapon); },
    shootFor:shootFor,
    heavy(){ tone(320, 150, .1, 'sawtooth', .035); },
    hit(enemy = false){
      if(!on) return;
      if(enemy && QLEVEL === 0){
        // 散弹或溅射同一帧击中多个目标时，合用一个命中声。
        if(G.t >= enemyHitAt && G.t - enemyHitAt < .04) return;
        enemyHitAt = G.t;
      }
      tone(1200, 900, .03, 'square', .012);
    },
    kill(){ killPitched(); },
    hurt(){ tone(220, 90, .22, 'sawtooth', .07); noise(.1, .04, 600); },
    boom(){ noise(.3, .09, 700); tone(120, 50, .25, 'sawtooth', .05); },
    pick(){ tone(880, 1320, .07, 'triangle', .03); },
    lvl(){ tone(660, 990, .1, 'triangle', .05); setTimeout(function(){ tone(990, 1480, .12, 'triangle', .045); }, 90); },
    mech(){ tone(160, 420, .35, 'sawtooth', .07); noise(.4, .06, 500); },
    boss(){ tone(90, 60, .8, 'sawtooth', .08); },
    portal(){ tone(420, 900, .5, 'triangle', .05); },
    ambience(stage){ startAmbience(stage); },
    stopAmbience:stopAmbience,
    setOn(v){ on = v; if(v){ C(); } else { stopAmbience(); } },
    isOn(){ return on; },
    unlock(){ C(); }
  };
})();

/* ── 输入 ── */
const keys = { up:false, down:false, left:false, right:false };
const joy = { active:false, id:-1, bx:0, by:0, nx:0, ny:0, mag:0 };

/* ── 数值 ──
   dmg    : 固定伤害（武器基础 + 技能的加法伤害）
   dmgPct : 所有百分比伤害加成（角色被动 / 武器共鸣 / 临时 buff），最后一次性乘算
   其余 Mul/Add 字段供武器类别共鸣使用 */
const ARMOR_LIMIT = .62;
const ELEMENTAL_HIT_BOOST = 1.25;
function baseStats(){
  const w = WEP();
  return {
    dmg:weaponBaseDamage(w), dmgPct:0, rateMul:1, baseRate:w.rate, extra:0, pierce:0, crit:w.crit, critMul:2,
    spdMul:1, maxHp:100, regen:0, armor:0, magnet:1, leech:0, thorns:0,
    burn:0, freeze:0, blast:0, chain:0, shield:0,
    drone:0, turret:0, mine:0, boom:0,
    barrage:0, bigMul:1, fleet:0,
    skillPower:1, skillCooldown:1, barragePower:1, barrageExtra:0,
    bodyScale:1, gunRangeMul:1, mechLocked:false,
    pierceRetention:.7, mechPower:1, mechDuration:0, deployCooldown:1, deployPower:1, deployPierce:0,
    /* 共鸣与被动扩展位 */
    lifeAdd:0, spreadMul:1, bspdMul:1, boomMul:1, elemMul:1,
    burnMul:1, selfBurn:0, dmgTaken:0, noMedkit:false
  };
}

/* ── 武器类别共鸣 ──
   单武器玩法：按当前武器的 cls 给一套全局被动（利 + 弊），与技能/角色被动叠加 */
const RESONANCE = {
  rifle:     { n:'步枪共鸣', c:'#9fd8ff', t:'射速 +8%，子弹存活 +0.15 秒',
               fn:function(s){ s.rateMul *= 1.08; s.lifeAdd += .15; } },
  shotgun:   { n:'霰弹共鸣', c:'#ffb45c', t:'弹丸 +1，散布 +15%',
               fn:function(s){ s.extra += 1; s.spreadMul *= 1.15; } },
  heavy:     { n:'重型共鸣', c:'#ff8a5c', t:'爆炸半径 +20%，射速 -10%',
               fn:function(s){ s.boomMul *= 1.2; s.rateMul *= .90; } },
  precise:   { n:'精准共鸣', c:'#c8a0ff', t:'暴击伤害 2.5×，暴击率 -5%',
               fn:function(s){ s.critMul = Math.max(s.critMul, 2.5); s.crit -= .05; } },
  elemental: { n:'元素共鸣', c:'#ff9a4c', t:'元素触发率 +25%，直接伤害 -8%',
               fn:function(s){ s.elemMul *= ELEMENTAL_HIT_BOOST; s.dmgPct -= .08; } },
  tech:      { n:'科技共鸣', c:'#b9f2ff', t:'穿透 +1，弹速 -10%',
               fn:function(s){ s.pierce += 1; s.bspdMul *= .90; } }
};

function recalc({ fillNewCapacity = true } = {}){
  const s = baseStats();
  applyGrowth(s);
  const temporary=StageEvents.skill();
  for(const id in G.skills){
    const sk = SK[id];
    if(sk) sk.ap(s, G.skills[id] + (id===temporary ? 1 : 0));
  }
  if(temporary && !G.skills[temporary]) SK[temporary].ap(s,1);
  /* 角色专属被动 */
  const chr = SKINS[G.skin] || SKINS[0];
  if(chr && chr.pas && chr.pas.fn) chr.pas.fn(s);
  /* 武器类别共鸣（与上面叠加） */
  const rs = RESONANCE[WEP().class];
  if(rs) rs.fn(s);
  /* 角色必杀的临时增益 */
  const b = G.cbuff;
  if(b.rate > 0) s.rateMul *= 1.8;
  if(b.dmg > 0) s.dmgPct += .30;
  if(b.spd > 0) s.spdMul *= 1.3;
  if(b.armor > 0) s.armor += .25;
  if(b.extra > 0) s.extra += 2;
  TALENTS.applyStats(s);
  StageEvents.applyStats(s);
  s.armor += CampaignStory.linerBonus();
  /* 生命上限兜底：易碎/玻璃大炮叠满也不至于变成 0 血 */
  s.maxHp = Math.max(20, Math.round(s.maxHp)) + CampaignStory.coreBonus();
  s.crit = clamp(s.crit, 0, .95);

  const oldMax = G.st ? G.st.maxHp : s.maxHp;
  G.st = s;
  if(G.p){
    G.p.maxHp = s.maxHp;
    if(fillNewCapacity && s.maxHp > oldMax) G.p.hp += s.maxHp - oldMax;
    G.p.hp = Math.min(G.p.hp, s.maxHp);
  }
}

/* 技能源只增幅一次，弹体溅射复用已增幅的伤害。 */
function scaleSkill(value){ return value * (G.st?.skillPower ?? 1); }
function abilityCooldown(seconds){ return seconds * (G.st?.skillCooldown ?? 1); }

/* ── 开局 / 场景 ── */
function newRun(){
  EnemyEffects.clear();
  G.mode = 'play'; G.phase = 'wave';
  G.stage = 0; G.wave = 1;
  G.t = 0; G.time = 0;
  G.score = 0; G.kills = 0; G.combo = 0; G.comboT = 0;
  G.xp = 0; G.lv = 1; G.need = 10; G.pending = 0;
  G.skills = {}; G.slots = []; G.growth = growthSnapshot();
  G.skillLimit = skillCapacity(G.growth);
  TALENTS.reset();
  CampaignStory.reset();
  StageEvents.reset();
  G.energy = 0; G.revives = 1;
  G.mechId = PROF.mech;
  resetMech();
  G.bullets.length = 0; G.eb.length = 0; G.enemies.length = 0;
  G.orbs.length = 0; G.parts.length = 0; G.texts.length = 0; G.rings.length = 0;
  G.haz.length = 0; G.drones.length = 0; G.turrets.length = 0;
  G.mines.length = 0; G.booms.length = 0;
  G.mineT = 0;
  G.picks.length = 0; G.crates.length = 0; G.jobs.length = 0;
  G.lightsFx.length = 0;
  G.bag[0] = G.bag[1] = null;
  G.buff.over = G.buff.magnet = G.buff.stasis = 0;
  G.buff.fleet = 0; G.fleetKill = 0;
  G.buff.rad = G.buff.luck = G.buff.weak = 0;
  G.waveEliteBoost = 0; G._event = null;
  G.selfBurnT = 0;
  G.emberSpreadAt = -Infinity;
  G.wbuff.focus = 0; G.wbuff.heat = 0;
  G.cbuff.rate = G.cbuff.spd = G.cbuff.dmg = G.cbuff.armor = G.cbuff.extra = 0;
  G.weapon = ownWep(PROF.weapon) ? PROF.weapon : 'rifle';
  G.skin = ownSkin(PROF.skin) ? PROF.skin : 0;
  G.wcd = 0; G.ccd = 0;
  G.shield = 0; G.shieldFx = 0;
  G.picksGot = 0; G.settled = false;
  G.boss = null; G.portal = null;
  G.bossEncounter = null;
  G.clearedGuards.clear();
  G.encounterPlayerFrom = null;
  G.shake = 0; G.flash = 0; G.hurt = 0; G.hitStop = 0;
  G.p = {
    x: ARENA.w/2, y: ARENA.h/2, vx:0, vy:0,
    hp:100, maxHp:100, face:1, anim:0,
    faceAngle:0, aimAngle:0, shotAngle:0, atkT:0,
    fireT:.3, inv:1.2, hurtT:0, moving:false, flashT:0
  };
  G.st = null;
  recalc();
  PREPARATIONS.startRun();
  G.wcdMax = abilityCooldown(WEP().sk.cd);
  G.ccdMax = abilityCooldown(SKIN().act?.cd ?? 1);
  G.p.hp = G.p.maxHp;
  G.shield = G.st.shield || 0;
  G.cam.x = G.p.x; G.cam.y = G.p.y;
  setScene(0);
  startWave();
}

function setScene(i){
  StageEvents.clear('离开战区，效果解除');
  G.stage = i;
  G.floorSpawnSerial = 0;
  ThreatPacing.reset();
  FieldMaps.begin(i);
  SectorClimate.begin(i);
  const sc = SCENES[i];
  /* 先说清道具，再算补给投放候选点，最后烘焙地面：
     三者共用同一组坐标，视觉暗示与实际投放严格一致 */
  G.props = buildProps(sc);
  SectorClimate.prepareProps();
  G.supplyPads = GROUND.pads(sc, G.props);
  G.spawnAnchors = buildSpawnAnchors(sc);   // 刷怪点跟着场景装饰走
  G.scars.length = 0;
  G.ground = buildGround(sc, G.supplyPads);
  FieldMaps.prepareSurface();
  if(STAGE3D) STAGE3D.invalidateGround();   // 地面重烘焙 → 3D 舞台必须重建贴图
  G.env = buildEnv(i);
  FARFX.build(i);       // 远景大气层（每关换外观，不重建几何）
  BACKDROP.build(i);    // 远景视差层（远山剪影 + 云影）
  FOREFX.build(i);      // 近景遮挡层（角落剪影每关重新生成一次）
  SFX.ambience(i);
  G.sceneFx = .8;   // 场景切换淡入
  G._evtRolled = false;
  G.enemies.length = 0; G.eb.length = 0; G.haz.length = 0;
  G.picks.length = 0; G.crates.length = 0; G.jobs.length = 0;
  G.lightsFx.length = 0;
  if(G.p){ G.p.x = ARENA.w/2; G.p.y = ARENA.h/2 + 40; G.cam.x = G.p.x; G.cam.y = G.p.y; }
  CampaignStory.begin(i);
  StageEvents.begin(i);
}

function waveDuration(w){ return CampaignBalance.at(G.stage,w).duration; }

function playerRadius(base = 8){ return base * (G.st?.bodyScale ?? 1); }

function startWave(spawnDelay = .5, announce = true){
  G.phase = 'wave';
  G.waveT = waveDuration(G.wave);
  G.waveDur = G.waveT;
  ThreatPacing.beginWave();
  const pacing=ThreatPacing.at();
  G.spawnT = Math.max(spawnDelay,pacing.delay || 0);
  TALENTS.queueMilestone();
  if(announce){
    const command=ThreatPacing.commander()?.spec;
    banner('WAVE ' + G.wave + ' / ' + WAVES_PER_STAGE + ' · ' + pacing.label,
      command ? command.name+'接近 · '+command.hint : SCENES[G.stage].name, .95);
  }
  if(G.wave % 3 === 0 && G.crates.length === 0){
    G.jobs.push({ t:.9, fn:function(){
      if(G.phase === 'wave' && G.crates.length === 0) spawnCrate();
    }});
  }
}

function endWave(){
  if(G.phase !== 'wave' || !ThreatPacing.canFinish()) return;
  /* 波次结束不再清场：剩余敌人保留，与下一波叠加（解除「时间到就消灭怪物」机制） */
  if(G.wave >= WAVES_PER_STAGE){
    /* 进入 Boss 战前才清一次场，保证首领战干净利落 */
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(!e.dead) boom(e.x, e.y, false);
    }
    G.enemies.length = 0;
    startBoss();
  } else {
    if(queueMidBoss()) return;
    G.wave++;
    startWave();
  }
}

function startBoss(kind = SCENES[G.stage].boss, resumeWave = null){
  FieldMaps.returnForEncounter();
  const encounter = { kind:kind, resumeWave:resumeWave };
  G.bossEncounter = encounter;
  G.phase = 'boss';
  G.waveT = 0;
  G.enemies.length = 0;
  G.eb.length = 0;
  G.haz.length = 0;
  const def = BOSSES[kind];
  banner(def.n, def.t, 1.6);
  SFX.boss();
  G.jobs.push({ t:.7, fn:function(){
    if(G.phase === 'boss' && G.bossEncounter === encounter) spawnBoss(kind);
  }});
}

function spawnBoss(kind){
  const def = BOSSES[kind];
  const point = bossSpawnPoint();
  const origin = FieldMaps.safePoint(point.x,point.y,def.r);
  const b = {
    kind: kind, name: def.n, r: def.r, h: def.h,
    maxHp: def.hp, hp: def.hp,
    x:origin.x, y:origin.y,
    vx:0, vy:0, spd: def.spd,
    t:0, atkCd: 1.0, act:null, face:1,
    flash:0, rot:0, phase:1, ph:0, phT:0, fightT:0, phFlash:0, idx:0, dead:false, deadT:0,
    orbit: rnd(0, TAU),
    dmg: def.dmg || 16
  };
  G.boss = b;
  ThreatPacing.addBossEscort(b);
  G.rings.push({ x:b.x, y:b.y, r:6, max:150, life:.7, maxLife:.7, col:def.col, w:3 });
  G.shake = 10;
}

/* ── 玩家 ── */
function currentMoveSpeed(p, s){
  return 106 * s.spdMul * (G.buff.fleet > 0 ? 1.35 : 1) *
    (G.mechT > 0 ? currentMech().speed : 1) * SectorClimate.frostFactor(p) * HEXES.moveMultiplier(p);
}

function updatePlayer(dt){
  const p = G.p, s = G.st;
  updateMech(dt);

  let ix = 0, iy = 0;
  if(keys.left) ix -= 1;
  if(keys.right) ix += 1;
  if(keys.up) iy -= 1;
  if(keys.down) iy += 1;
  if(joy.active){ ix += joy.nx; iy += joy.ny; }
  const m = Math.hypot(ix, iy);
  if(m > 1){ ix /= m; iy /= m; }
  const mag = Math.min(1, Math.hypot(ix, iy));

  const spd = currentMoveSpeed(p,s);
  const k = 1 - Math.pow(.0009, dt);
  p.vx = lerp(p.vx, ix * spd, k);
  p.vy = lerp(p.vy, iy * spd, k);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.moving = mag > .12;
  if(p.moving) p.anim += dt * 11;
  else p.anim += dt * 2;

  // 边界
  const feetRadius = playerRadius(9), extraRadius = feetRadius - 9;
  p.x = clamp(p.x, 30 + extraRadius, ARENA.w - 30 - extraRadius);
  p.y = clamp(p.y, 34 + extraRadius, ARENA.h - 26 - extraRadius);

  // 障碍推开
  for(let i=0;i<G.props.length;i++){
    const pr = G.props[i];
    if(!pr.solid) continue;
    const dd = dst(p.x, p.y, pr.x, pr.y);
    const rr = pr.r + feetRadius;
    if(dd < rr && dd > .01){
      p.x += (p.x - pr.x) / dd * (rr - dd);
      p.y += (p.y - pr.y) / dd * (rr - dd);
    }
  }

  FieldMaps.clearRails(p,feetRadius);
  // 朝向：优先看目标，否则看移动（8 方向）
  const tgt = G.mechT > 0 ? mechTarget(currentMech().reach) : nearestEnemy(p.x,p.y,weaponReach(WEP(),s));
  let fa = p.faceAngle;
  if(tgt){
    fa = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    p.face = Math.cos(fa) >= 0 ? 1 : -1;
  } else if(Math.abs(p.vx) > 14 || Math.abs(p.vy) > 14){
    fa = Math.atan2(p.vy, p.vx);
    p.face = Math.cos(fa) >= 0 ? 1 : -1;
  }
  // 平滑过渡到 8 方向（取最近的 45° 方位，避免抖动）
  p.aimAngle = fa;
  const snap = Math.round(fa / (Math.PI / 4)) * (Math.PI / 4);
  let d = snap - p.faceAngle;
  while(d > Math.PI) d -= Math.PI * 2;
  while(d < -Math.PI) d += Math.PI * 2;
  p.faceAngle += d * Math.min(1, dt * 18);

  if(p.inv > 0) p.inv -= dt;
  if(p.hurtT > 0) p.hurtT -= dt;
  if(p.flashT > 0) p.flashT -= dt;
  if(p.atkT > 0) p.atkT -= dt;

  if(s.regen > 0 && p.hp < p.maxHp){
    p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);
  }
  /* 茜羽：自身每秒承受灼烧（真实伤害，不吃护甲/无敌） */
  if(s.selfBurn > 0 && G.mode === 'play' && p.hp > 0 && !PREPARATIONS.protectedFromSelfBurn()){
    G.selfBurnT = (G.selfBurnT || 0) + dt * s.selfBurn;
    while(G.selfBurnT >= 1){
      G.selfBurnT -= 1;
      p.hp -= 1;
      G.hurt = Math.max(G.hurt, .18);
      G.parts.push({ x:p.x + rnd(-7,7), y:p.y - rnd(0,18), vx:rnd(-12,12), vy:-rnd(18,42),
        life:.4, max:.4, col:'#ff8f5c', r:rnd(1.2,2.2) });
      if(p.hp <= 0){ p.hp = 0; playerDown(); break; }
    }
  }

  p.fireT -= dt;
  if(p.fireT <= 0 && tgt) fire(tgt);

  // 相机
  const cw = VW, chh = VH / KZ;
  let tx, ty;
  if(ARENA.w > cw) tx = clamp(p.x, cw/2, ARENA.w - cw/2); else tx = ARENA.w/2;
  if(ARENA.h > chh) ty = clamp(p.y, chh/2, ARENA.h - chh/2); else ty = ARENA.h/2;
  // 朝首领留出视野，同时把玩家保留在窄屏的可见范围。
  if(G.boss && !G.boss.dead){
    const bx = p.x + clamp((G.boss.x-p.x)*.52, -cw*.32, cw*.32);
    const by = p.y + clamp((G.boss.y-p.y)*.52, -chh*.32, chh*.32);
    if(ARENA.w > cw) tx = clamp(bx, cw/2, ARENA.w - cw/2);
    if(ARENA.h > chh) ty = clamp(by, chh/2, ARENA.h - chh/2);
  }
  const ck = 1 - Math.pow(.0016, dt);
  G.cam.x = lerp(G.cam.x, tx, ck);
  G.cam.y = lerp(G.cam.y, ty, ck);
}

function nearestEnemy(x, y, range){
  let best = null, bd = range * range;
  for(let i=0;i<G.enemies.length;i++){
    const e = G.enemies[i];
    if(e.dead || e.spawnT > 0) continue;
    const dd = d2(x, y, e.x, e.y);
    if(dd < bd && FieldMaps.shotContact(x,y,e.x,e.y)===null){ bd = dd; best = e; }
  }
  if(G.boss && !G.boss.dead){
    const dd = d2(x, y, G.boss.x, G.boss.y);
    if(dd < bd) best = G.boss;
  }
  // 场上没敌人时，把枪口转去敲补给箱
  if(!best && G.crates.length){
    for(let i=0;i<G.crates.length;i++){
      const c = G.crates[i];
      if(c.dead || c.fall > 0) continue;
      const dd = d2(x, y, c.x, c.y);
      if(dd < bd && FieldMaps.shotContact(x,y,c.x,c.y)===null){ bd = dd; best = c; }
    }
  }
  return best;
}

function nearestEnemyExcept(x, y, range, excl){
  let best = null, bd = range * range;
  for(let i=0;i<G.enemies.length;i++){
    const e = G.enemies[i];
    if(e.dead || e.spawnT > 0 || excl.indexOf(e) >= 0) continue;
    const dd = d2(x, y, e.x, e.y);
    if(dd < bd && FieldMaps.shotContact(x,y,e.x,e.y)===null){ bd = dd; best = e; }
  }
  return best;
}

function weaponReach(w, s){
  const nominal = w.reach || (w.id === 'sniper' ? 620 : 400);
  const travel = w.spd * s.bspdMul * (G.buff.over > 0 ? 1.1 : 1) * (w.life + s.lifeAdd);
  return Math.min(nominal, travel + gunMuzzleLength(w)) * s.gunRangeMul;
}

function gunMuzzleLength(w){
  return (MUZ[w.id] || 24) * .80 + 2;
}

function gunMuzzle(p, w, angle){
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const reach = gunMuzzleLength(w) * G.st.bodyScale / Math.hypot(dx, dy * KZ);
  return { x:p.x + dx * reach, y:p.y + dy * reach };
}

function weaponVolley(w, s){
  const over = G.buff.over > 0, focus = G.wbuff.focus > 0, heat = G.wbuff.heat > 0;
  const damage = s.dmg * (G.buff.weak > 0 ? .65 : 1);
  return {
    interval:s.baseRate / s.rateMul / (over ? 1.55 : 1) / (focus ? 2.4 : 1) / (heat ? 2.8 : 1),
    count:w.count + s.extra, damage, pct:over ? .25 : 0,
    pierce:w.pierce + s.pierce + (focus ? 2 : 0) + (heat ? 2 : 0),
    barrageCount:s.barrage * 2 + s.barrageExtra, barrageDamage:damage * .8 * s.barragePower
  };
}

function fire(target){
  if(G.mechT > 0){ mechFire(target); return; }
  if(TALENTS.tryBayonet()) return;
  const p = G.p, s = G.st, w = WEP();
  const t = target || nearestEnemy(p.x, p.y, weaponReach(w, s));
  if(!t) return;
  const ang = Math.atan2(t.y - p.y, t.x - p.x);
  const muzzle = gunMuzzle(p, w, ang);
  const oved = G.buff.over > 0;
  const volley = weaponVolley(w,s);
  p.fireT = volley.interval;
  p.flashT = .07;
  p.atkT = .16;
  p.shotAngle = ang;

  const n = volley.count;
  const railFork=w.id==='sniper' && WeaponLinks.railEnabled();
  const emberSeed=w.id==='flamer' && WeaponLinks.emberEnabled();
  const step = (w.count > 1 ? w.spread : .075) * s.spreadMul;
  const sp = w.spd * (oved ? 1.1 : 1) * s.bspdMul;
  for(let i=0;i<n;i++){
    // Keep the center of the shotgun volley when resonance or talents add pellets.
    const off = w.id === 'shotgun'
      ? (i < w.count ? (i - (w.count - 1) / 2) * step : rnd(-2, 2) * step)
      : (i - (n - 1) / 2) * step;
    const spread = w.count > 1 || n > 1 ? .014 : w.spread * s.spreadMul * .24;
    const a = ang + off + rnd(-spread, spread);
    const bullet = {
      x:muzzle.x, y:muzzle.y, fromX:p.x, fromY:p.y,
      vx:Math.cos(a) * sp, vy:Math.sin(a) * sp,
      dmg:volley.damage, pct:volley.pct,
      pierce:volley.pierce,
      hits:[], life:(w.life + s.lifeAdd) * s.gunRangeMul, crit:Math.random() < s.crit,
      r:w.br * s.bigMul, over:oved, w:w.id, boom:!!w.boom, fuse:!!w.boom,
      homing:w.id === 'micromissile', turn:w.id === 'micromissile' ? 5 : 0,
      railFork:railFork && i===Math.floor(n/2), emberSeed,
      splitDamage:w.id==='micromissile' && i===0 && s.barrage>0 ? volley.damage * .45 * s.barragePower : 0
    };
    if(w.boom) lobProjectile(bullet, t);
    G.bullets.push(bullet);
  }
  /* 弹幕风暴：额外散射子弹 */
  const bn = volley.barrageCount;
  for(let i=0;i<bn;i++){
    const a = ang + rnd(-.5, .5);
    const sp = w.spd * rnd(.72, .95);
    G.bullets.push({
      x:muzzle.x, y:muzzle.y, fromX:p.x, fromY:p.y,
      vx:Math.cos(a) * sp, vy:Math.sin(a) * sp,
      dmg:volley.barrageDamage, pierce:w.pierce + s.pierce, hits:[], life:w.life * .9 * s.gunRangeMul,
      crit:Math.random() < s.crit * .7, r:w.br * s.bigMul * .8,
      over:oved, w:w.id, boom:false, barrage:true, emberSeed
    });
  }
  for(let i=0;i<(w.id === 'shotgun' ? 6 : 3);i++){
    G.parts.push({
      x:muzzle.x, y:muzzle.y, vx:Math.cos(ang)*rnd(30,110), vy:Math.sin(ang)*rnd(30,110),
      life:.09, max:.09, col:w.c, r:1.6, height:BULLET_H
    });
  }
  if(w.id === 'shotgun'){ G.shake = Math.max(G.shake, 2.6); SFX.heavy(); }
  else if(w.id === 'sniper'){ G.shake = Math.max(G.shake, 3.2); SFX.heavy(); }
  else SFX.shoot();
}

/* 沿射线判定（贯穿类技能共用）：返回命中数 */
function rayHit(ox, oy, ang, len, wide, dmg, crit, bossDmg = dmg){
  const tx = ox + Math.cos(ang) * len, ty = oy + Math.sin(ang) * len;
  const wall = FieldMaps.shotContact(ox,oy,tx,ty) ?? 1;
  const x = lerp(ox,tx,wall), y = lerp(oy,ty,wall);
  let n = 0;
  for(const e of projectileTargets()){
    if(!projectileTargetActive(e)) continue;
    if(projectileContact(ox - e.x, oy - e.y, x - e.x, y - e.y, e.r + wide) === null) continue;
    if(FieldMaps.shotContact(ox,oy,e.x,e.y)!==null) continue;
    if(e === G.boss) damageBoss(e, bossDmg, crit, e.x, e.y);
    else applyDamage(e, dmg, crit, e.x, e.y - 6);
    n++;
  }
  return n;
}

function beamFX(x, y, ang, len, col, wide, life, radius){
  const L = life || .22;
  const tx=x+Math.cos(ang)*len, ty=y+Math.sin(ang)*len;
  const wall=FieldMaps.shotContact(x,y,tx,ty) ?? 1;
  G.parts.push({ x:x, y:y, vx:0, vy:0, life:L, max:L, col:col, r:wide || 1,
    line:{ x2:lerp(x,tx,wall), y2:lerp(y,ty,wall), width:wide, radius:radius } });
}

/* ── 主动技：以最近敌人为基准方向 ── */
function aimAngle(p, range){
  const t = nearestEnemy(p.x, p.y, range || 900);
  return t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.face > 0 ? 0 : Math.PI);
}

/* ── 武器技能的通用派发（第三世代军械共用，字段 sk.g） ── */
const WSK_G = {
  focus: function(w, p){
    G.wbuff.focus = scaleSkill(4);
    spark(p.x, p.y, 10, w.c, 120);
  },
  beam: function(w, p){
    const a = aimAngle(p, 1100);
    const n = rayHit(p.x, p.y, a, 980, 16, scaleSkill(weaponBaseDamage(w) * 3.4), true, scaleSkill(weaponBaseDamage(w) * 3));
    beamFX(p.x, p.y, a, 980, w.c, 5, .26, 16);
    beamFX(p.x, p.y, a, 980, '#ffffff', 1.6, .18);
    for(let i = 0; i < 10; i++){
      G.parts.push({ x:p.x + Math.cos(a) * (30 + i * 40), y:p.y + Math.sin(a) * (30 + i * 40),
        vx:rnd(-40, 40), vy:rnd(-40, 40), life:.3, max:.3, col:w.c, r:1.8 });
    }
    G.shake = 8;
    return n;
  },
  nova: function(w, p){
    const R = 190;
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      if(dst(p.x, p.y, e.x, e.y) < R + e.r){
        e.slowT = 3.2; e.slowAmt = Math.max(e.slowAmt || 0, .7);
        applyDamage(e, scaleSkill(weaponBaseDamage(w) * 3.2), false, e.x, e.y - 6);
        setBurn(e, 3, scaleSkill(6));
      }
    }
    if(G.boss && !G.boss.dead && dst(p.x, p.y, G.boss.x, G.boss.y) < R + 40){
      G.boss.slowT = 3; G.boss.slowAmt = .55;
      damageBoss(G.boss, scaleSkill(weaponBaseDamage(w) * 4), false, G.boss.x, G.boss.y);
    }
    G.haz.push({ kind:'frost', x:p.x, y:p.y, r:R, dmg:0, life:3.6, max:3.6, col:w.c, t:0 });
    G.rings.push({ x:p.x, y:p.y, r:14, max:R, life:.6, maxLife:.6, col:w.c, w:4 });
  },
  salvo: function(w, p){
    const count = w.sk.count || 6;
    const aim = aimAngle(p, 700);
    const muzzle = w.boom ? gunMuzzle(p, w, aim) : null;
    if(muzzle){
      p.shotAngle = aim;
      p.flashT = .07;
    }
    for(let i = 0; i < count; i++){
      const a = aim + (i - (count - 1) / 2) * (muzzle ? .18 : .22);
      const dx = Math.cos(a), dy = Math.sin(a);
      G.bullets.push({
        x:muzzle ? muzzle.x : p.x + dx * 12, y:muzzle ? muzzle.y : p.y + dy * 12,
        fromX:muzzle ? p.x : undefined, fromY:muzzle ? p.y : undefined,
        vx:dx * w.spd * 1.1, vy:dy * w.spd * 1.1,
        dmg:scaleSkill(G.st.dmg * 2.4), pierce:w.boom ? 0 : 1, hits:[], life:1.6,
        crit:Math.random() < G.st.crit + .1, r:w.br * 1.2, w:w.id,
        boom:!!w.boom, fuse:!!w.boom, homing:true, turn:w.boom ? 5 : 3.4
      });
    }
    G.shake = 5;
  },
  storm: function(w, p){
    let from = { x:p.x, y:p.y };
    const used = [];
    for(let k = 0; k < 10; k++){
      const nx = nearestEnemyExcept(from.x, from.y, 360, used);
      if(!nx) break;
      used.push(nx);
      G.parts.push({ x:from.x, y:from.y, vx:0, vy:0, life:.13, max:.13, col:w.c, r:1.2,
        line:{ x2:nx.x, y2:nx.y } });
      applyDamage(nx, scaleSkill(G.st.dmg * 2.2), false, nx.x, nx.y - 6);
      from = nx;
    }
    if(G.boss && !G.boss.dead) damageBoss(G.boss, scaleSkill(G.st.dmg * 4), false, G.boss.x, G.boss.y);
    G.shake = 5;
  },
  blast: function(w, p){
    const n = 16;
    for(let i = 0; i < n; i++){
      const a = i / n * TAU + .1;
      G.bullets.push({
        x:p.x + Math.cos(a) * 10, y:p.y + Math.sin(a) * 10,
        vx:Math.cos(a) * 460, vy:Math.sin(a) * 460,
        dmg:scaleSkill(G.st.dmg * 1.4), pierce:1, hits:[], life:.55,
        crit:Math.random() < G.st.crit, r:w.br, w:w.id, boom:false
      });
    }
    G.rings.push({ x:p.x, y:p.y, r:10, max:150, life:.35, maxLife:.35, col:w.c, w:3 });
    G.shake = 7;
  }
};

/* ── 武器主动技 ── */
function weaponSkill(){
  if(G.mode !== 'play' || G.mechT > 0 || !G.p || G.p.hp <= 0) return false;
  if(G.wcd > 0) return false;
  const w = WEP(), p = G.p;
  G.wcd = G.wcdMax = abilityCooldown(w.sk.cd);
  HEXES.onSkillCast('ccd');
  G.shake = Math.max(G.shake, 6);
  addFlash(p.x, p.y, 130, w.c, .7);
  G.rings.push({ x:p.x, y:p.y, r:6, max:70, life:.34, maxLife:.34, col:w.c, w:3 });
  SFX.lvl();

  /* 第三世代军械：统一派发，避免为每把枪再写一条 if 分支 */
  if(w.sk && w.sk.g && WSK_G[w.sk.g]){
    WSK_G[w.sk.g](w, p);
    banner(w.sk.n, w.sk.t, 1.0);
    return true;
  }

  if(w.id === 'rifle'){
    G.wbuff.focus = scaleSkill(4);
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'shotgun'){
    const t = nearestEnemy(p.x, p.y, 420);
    let ax = p.face, ay = 0;
    if(t){ const d = Math.max(1, dst(p.x, p.y, t.x, t.y)); ax = (t.x - p.x) / d; ay = (t.y - p.y) / d; }
    const distance = FieldMaps.dashDistance(p,ax,ay,90);
    p.x = clamp(p.x + ax * distance, 28, ARENA.w - 28);
    p.y = clamp(p.y + ay * distance, 28, ARENA.h - 28);
    p.face = ax >= 0 ? 1 : -1;
    aoe(p.x, p.y, 82, scaleSkill(48), null);
    for(let i=0;i<16;i++){
      const a2 = rnd(0, TAU), v = rnd(90, 240);
      G.parts.push({ x:p.x, y:p.y, vx:Math.cos(a2)*v, vy:Math.sin(a2)*v*.6,
        life:.34, max:.34, col:pick(['#ffb060','#ffd88a','#fff2cf']), r:2 });
    }
    G.rings.push({ x:p.x, y:p.y, r:10, max:82, life:.38, maxLife:.38, col:'#ffb060', w:4 });
    G.shake = 11;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'sniper'){
    const a = aimAngle(p, 1200);
    const muzzle = gunMuzzle(p, w, a);
    p.shotAngle = a;
    p.flashT = .07;
    const len = 1200;
    const width = 13;
    rayHit(p.x, p.y, a, len, width, scaleSkill(130), true, scaleSkill(100));
    beamFX(p.x, p.y, a, len, w.c, 6, .28, width);
    beamFX(muzzle.x, muzzle.y, a, len - dst(p.x, p.y, muzzle.x, muzzle.y), '#ffffff', 2, .20);
    addFlash(muzzle.x, muzzle.y, 150, w.c, .5);
    G.shake = 10;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'smg'){
    const tt = nearestEnemy(p.x, p.y, 600);
    const base = tt ? Math.atan2(tt.y - p.y, tt.x - p.x) : (p.face > 0 ? 0 : Math.PI);
    const N = 24;
    for(let i=0;i<N;i++){
      const a = base + i / N * TAU;
      G.bullets.push({
        x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10,
        vx: Math.cos(a) * 470, vy: Math.sin(a) * 470,
        dmg: scaleSkill(G.st.dmg * (.85 + .15 * Math.random())), pierce: 1 + G.st.pierce,
        hits: [], life: .95, crit: Math.random() < G.st.crit, r: 2.4,
        over: G.buff.over > 0, w: 'smg', boom: false
      });
    }
    G.rings.push({ x:p.x, y:p.y, r:12, max:60, life:.3, maxLife:.3, col:w.c, w:3 });
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'launcher'){
    const t = nearestEnemy(p.x, p.y, 520);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.face > 0 ? 0 : Math.PI);
    for(let i=0;i<6;i++){
      const a = base + (i - 2.5) * .13;
      G.bullets.push({
        x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
        vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        dmg: scaleSkill(G.st.dmg * 1.1), pierce: 0, hits: [], life: 1.3,
        crit: false, r: 5, over: false, w: 'launcher', boom: true
      });
    }
    G.shake = 9;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'arc'){
    G.eb.length = 0;
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      e.stun = 2.6;
      applyDamage(e, scaleSkill(28), false, e.x, e.y - 6);
      G.parts.push({ x:p.x, y:p.y, vx:0, vy:0, life:.18, max:.18,
        col:'#b9f2ff', r:1, line:{ x2:e.x, y2:e.y } });
    }
    if(G.boss && !G.boss.dead){
      G.boss.stun = Math.max(G.boss.stun || 0, 1.5);
      damageBoss(G.boss, scaleSkill(45), false, G.boss.x, G.boss.y);
      G.parts.push({ x:p.x, y:p.y, vx:0, vy:0, life:.2, max:.2,
        col:'#b9f2ff', r:1, line:{ x2:G.boss.x, y2:G.boss.y } });
    }
    banner(w.sk.n, w.sk.t, 1.0);

  /* ══ 第二世代武器技 ══ */
  } else if(w.id === 'pistol'){
    /* 五连速射：六发精准点射 + 短时提速 */
    const a0 = aimAngle(p);
    for(let i=0;i<6;i++){
      const a = a0 + (i - 2.5) * .055;
      G.bullets.push({
        x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
        vx: Math.cos(a) * 680, vy: Math.sin(a) * 680,
        dmg: scaleSkill(G.st.dmg * 1.55), pierce: 1, hits: [], life: 1.1,
        crit: Math.random() < G.st.crit + .25, r: 2.2,
        over: G.buff.over > 0, w: 'pistol', boom: false
      });
    }
    G.wbuff.focus = Math.max(G.wbuff.focus, scaleSkill(3.2));
    G.shake = 4;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'revolver'){
    /* 六芒轮射 */
    for(let i=0;i<6;i++){
      const a = i * TAU / 6 + rnd(-.05, .05);
      G.bullets.push({
        x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
        vx: Math.cos(a) * 600, vy: Math.sin(a) * 600,
        dmg: scaleSkill(G.st.dmg * 2.1), pierce: 2, hits: [], life: 1.3,
        crit: Math.random() < G.st.crit, r: 3.4,
        over: false, w: 'revolver', boom: false
      });
    }
    G.shake = 8;
    G.rings.push({ x:p.x, y:p.y, r:12, max:74, life:.3, maxLife:.3, col:'#ffb84d', w:3 });
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'minigun'){
    /* 枪管过热 */
    G.wbuff.heat = scaleSkill(5);
    for(let i=0;i<18;i++){
      const a = rnd(0, TAU), v = rnd(120, 320);
      G.parts.push({ x:p.x, y:p.y, vx:Math.cos(a)*v, vy:Math.sin(a)*v*.6,
        life:.3, max:.3, col:pick(['#ff9d5c', '#ffd08a', '#fff2cf']), r:2 });
    }
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'flamer'){
    /* 烈焰吐息：扇形火墙 + 点燃 */
    const a0 = aimAngle(p, 420);
    const emberSeed=WeaponLinks.emberEnabled();
    const source=emberSeed ? WeaponLinks.flameSource : null;
    for(let i=0;i<38;i++){
      const a = a0 + rnd(-.55, .55);
      const sp = rnd(230, 400);
      G.bullets.push({
        x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: scaleSkill(G.st.dmg * 1.15), pierce: 3, hits: [], life: 200 / sp,
        crit: false, r: 5.5 + rnd(0, 2),
        over: false, w: 'flamer', boom: false, emberSeed
      });
    }
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      let d = Math.atan2(e.y - p.y, e.x - p.x) - a0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if(Math.abs(d) < .8 && dst(p.x, p.y, e.x, e.y) < 250) setBurn(e,3.2,scaleSkill(9),source);
    }
    if(G.boss && !G.boss.dead && dst(p.x, p.y, G.boss.x, G.boss.y) < 270) setBurn(G.boss,3.2,scaleSkill(26),source);
    addFlash(p.x + Math.cos(a0) * 60, p.y + Math.sin(a0) * 60, 170, '#ff7a3c', .6);
    G.shake = 7;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'laser'){
    /* 棱镜折射：三道贯穿光束 */
    const a0 = aimAngle(p, 1000);
    for(let k=-1;k<=1;k++){
      const a = a0 + k * .26;
      rayHit(p.x, p.y, a, 1300, 7, scaleSkill(G.st.dmg * 3.0), k === 0);
      beamFX(p.x, p.y, a, 1300, '#7ef0ff', 1.7, .26);
      beamFX(p.x, p.y, a, 1300, '#eaffff', .8, .18);
    }
    addFlash(p.x, p.y, 150, '#7ef0ff', .55);
    G.shake = 8;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'plasma'){
    /* 奇点坍缩：牵引 → 引爆 */
    const a0 = aimAngle(p, 620);
    const cx = clamp(p.x + Math.cos(a0) * 110, 40, ARENA.w - 40);
    const cy = clamp(p.y + Math.sin(a0) * 110, 40, ARENA.h - 40);
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      if(dst(e.x, e.y, cx, cy) > 460) continue;
      e.x += (cx - e.x) * .55;
      e.y += (cy - e.y) * .55;
      e.flash = .12;
    }
    G.rings.push({ x:cx, y:cy, r:200, max:26, life:.32, maxLife:.32, col:'#c08cff', w:3 });
    G.rings.push({ x:cx, y:cy, r:150, max:40, life:.28, maxLife:.28, col:'#e0c8ff', w:2 });
    G.jobs.push({ t:.26, fn:function(){
      aoe(cx, cy, 160, scaleSkill(G.st ? G.st.dmg * 3.6 : 90), null);
      explodeFX(cx, cy, 150);
      addFlash(cx, cy, 240, '#c08cff', .75);
      G.rings.push({ x:cx, y:cy, r:14, max:170, life:.44, maxLife:.44, col:'#e0c8ff', w:5 });
      G.shake = Math.max(G.shake, 13);
    }});
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'frost'){
    /* 绝对零度：全场冰封 + 碎冰 */
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      e.stun = Math.max(e.stun || 0, 3.2);
      e.slowT = 3.2; e.slowAmt = .6;
      applyDamage(e, scaleSkill(G.st.dmg * 2.4), false, e.x, e.y - 6);
      G.parts.push({ x:e.x, y:e.y - 8, vx:0, vy:0, life:.2, max:.2, col:'#9fe8ff', r:1 });
    }
    if(G.boss && !G.boss.dead){
      G.boss.stun = Math.max(G.boss.stun || 0, 1.6);
      G.boss.slowT = 3.2; G.boss.slowAmt = .45;
      damageBoss(G.boss, scaleSkill(G.st.dmg * 8), false, G.boss.x, G.boss.y);
    }
    G.rings.push({ x:p.x, y:p.y, r:20, max:VW * .95, life:.55, maxLife:.55, col:'#9fe8ff', w:5 });
    G.rings.push({ x:p.x, y:p.y, r:10, max:VW * .8, life:.42, maxLife:.42, col:'#eaffff', w:2 });
    addFlash(p.x, p.y, 260, '#9fe8ff', .7);
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'rail'){
    /* 轨道炮击：全屏贯穿 */
    const a0 = aimAngle(p, 1400);
    const hits = rayHit(p.x, p.y, a0, 1600, 9, scaleSkill(G.st.dmg * 4.4), true);
    beamFX(p.x, p.y, a0, 1600, '#bfe6ff', 2.4, .3);
    beamFX(p.x, p.y, a0, 1600, '#ffffff', 1.0, .2);
    addFlash(p.x + Math.cos(a0) * 40, p.y + Math.sin(a0) * 40, 200, '#bfe6ff', .7);
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      let d = Math.atan2(e.y - p.y, e.x - p.x) - a0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if(Math.abs(d) < .12){
        e.x = clamp(e.x + Math.cos(a0) * 26, 20, ARENA.w - 20);
        e.y = clamp(e.y + Math.sin(a0) * 26, 20, ARENA.h - 20);
      }
    }
    G.hitStop = Math.max(G.hitStop, .06);
    G.shake = 14;
    banner(w.sk.n, w.sk.t + (hits ? '　命中 ' + hits : ''), 1.0);

  } else if(w.id === 'bow'){
    /* 箭雨 */
    const cx = p.x, cy = p.y;
    for(let i=0;i<14;i++){
      const aa = rnd(0, TAU), rr = rnd(30, 320);
      const tx = clamp(cx + Math.cos(aa) * rr, 44, ARENA.w - 44);
      const ty = clamp(cy + Math.sin(aa) * rr, 44, ARENA.h - 44);
      G.jobs.push({ t: .05 + i * .055, fn: function(){
        aoe(tx, ty, 48, scaleSkill(G.st ? G.st.dmg * 2.0 : 40), null);
        G.rings.push({ x:tx, y:ty, r:6, max:48, life:.3, maxLife:.3, col:'#8ef0c0', w:2 });
        G.parts.push({ x:tx, y:ty - 90, vx:0, vy:520, life:.16, max:.16, col:'#c8ffe4', r:1,
          line:{ x2:tx, y2:ty } });
        explodeFX(tx, ty, 26);
      }});
    }
    G.rings.push({ x:p.x, y:p.y, r:14, max:330, life:.4, maxLife:.4, col:'#8ef0c0', w:2 });
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'nailgun'){
    /* 钉墙：五排横向钢钉 */
    const a0 = aimAngle(p, 500);
    const nx = Math.cos(a0 + Math.PI / 2), ny = Math.sin(a0 + Math.PI / 2);
    for(let row=0;row<5;row++){
      const depth = 34 + row * 36;
      const ox = p.x + Math.cos(a0) * depth;
      const oy = p.y + Math.sin(a0) * depth;
      for(let i=-7;i<=7;i++){
        G.bullets.push({
          x: ox + nx * i * 13, y: oy + ny * i * 13,
          vx: Math.cos(a0) * 700, vy: Math.sin(a0) * 700,
          dmg: scaleSkill(G.st.dmg * .95), pierce: 3, hits: [], life: .8,
          crit: false, r: 1.7, over: false, w: 'nailgun', boom: false
        });
      }
    }
    G.rings.push({ x:p.x + Math.cos(a0) * 90, y:p.y + Math.sin(a0) * 90, r:10, max:120,
      life:.3, maxLife:.3, col:'#ffd0a0', w:2 });
    G.shake = 6;
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'acid'){
    /* 酸池：三处腐蚀云持续灼烧 */
    const a0 = aimAngle(p, 520);
    for(let k=0;k<3;k++){
      const a = a0 + (k - 1) * .44;
      const rr = rnd(110, 210);
      const tx = clamp(p.x + Math.cos(a) * rr, 46, ARENA.w - 46);
      const ty = clamp(p.y + Math.sin(a) * rr, 46, ARENA.h - 46);
      for(let j=0;j<5;j++){
        G.jobs.push({ t: .05 + j * .42, fn: function(){
          aoe(tx, ty, 58, scaleSkill(G.st ? G.st.dmg * 1.6 : 30), null);
          G.rings.push({ x:tx, y:ty, r:8, max:58, life:.34, maxLife:.34, col:'#a8e05a', w:2 });
          for(let q=0;q<5;q++){
            const aa2 = rnd(0, TAU), v2 = rnd(20, 70);
            G.parts.push({ x:tx + rnd(-20,20), y:ty + rnd(-20,20),
              vx:Math.cos(aa2)*v2, vy:Math.sin(aa2)*v2*.6 - 20,
              life:.5, max:.5, col:'#8fd04a', r:2 });
          }
          addFlash(tx, ty, 90, '#a8e05a', .38);
        }});
      }
    }
    banner(w.sk.n, w.sk.t, 1.0);

  } else if(w.id === 'orbgun'){
    /* 相位奇点：四颗追踪球 */
    const a0 = aimAngle(p, 700);
    for(let i=0;i<4;i++){
      const a = a0 + (i - 1.5) * .24;
      G.bullets.push({
        x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
        vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
        dmg: scaleSkill(G.st.dmg * 1.7), pierce: 99, hits: [], life: 2.2,
        crit: Math.random() < G.st.crit, r: 8, homing: true,
        over: false, w: 'orbgun', boom: false
      });
    }
    addFlash(p.x, p.y, 140, '#a0a8ff', .5);
    banner(w.sk.n, w.sk.t, 1.0);
  }
  return true;
}

function updateWeapon(dt){
  if(G.wcd > 0) G.wcd = Math.max(0, G.wcd - dt);
  if(G.wbuff.focus > 0){
    G.wbuff.focus -= dt;
    if(G.wbuff.focus <= 0){ G.wbuff.focus = 0; }
  }
  if(G.wbuff.heat > 0){
    G.wbuff.heat -= dt;
    if(G.wbuff.heat <= 0){ G.wbuff.heat = 0; }
  }
}

/* ══════════ 角色必杀（E）══════════ */
function setBurn(unit,dur,dps,source=null){
  if(!unit || unit.dead) return;
  WeaponLinks.applyBurn(unit,dur,dps*G.st.burnMul,source);
}

const CSK = {
  /* 青柠雪 · 雪融：治疗 + 净化弹幕 + 无敌 */
  lime: function(p){
    heal(scaleSkill(p.maxHp * .3));
    G.eb.length = 0;
    p.inv = Math.max(p.inv, 2.4);
    G.shield = Math.min(4, G.shield + 1);
    G.shieldFx = .6;
    spark(p.x, p.y, 20, '#9ff0ff', 170);
    G.rings.push({ x:p.x, y:p.y, r:10, max:128, life:.55, maxLife:.55, col:'#9ff0ff', w:4 });
    floatText(p.x, p.y - 26, '雪融 · 净化', '#9ff0ff', true);
  },

  /* 墨鸢 · 影袭：突进 + 落点爆震 */
  ink: function(p){
    const t = nearestEnemy(p.x, p.y, 420);
    const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.face > 0 ? 0 : Math.PI);
    for(let i = 0; i < 9; i++){
      G.parts.push({ x:p.x - Math.cos(a) * i * 8, y:p.y - Math.sin(a) * i * 8,
        vx:0, vy:0, life:.24, max:.24, col:'#5a6a90', r:2 });
    }
    p.x = clamp(p.x + Math.cos(a) * 96, 30, ARENA.w - 30);
    p.y = clamp(p.y + Math.sin(a) * 96, 34, ARENA.h - 26);
    p.face = Math.cos(a) >= 0 ? 1 : -1;
    p.inv = Math.max(p.inv, 1.1);
    aoe(p.x, p.y, 72, scaleSkill(62), null);
    explodeFX(p.x, p.y, 56);
    G.shake = 7;
  },

  /* 澜刃 · 青刃斩：三段扇形斩击 */
  blade: function(){
    for(let k = 0; k < 3; k++){
      G.jobs.push({ t: .02 + k * .12, fn: function(){
        if(G.mode !== 'play' || !G.p) return;
        const q = G.p;
        const t = nearestEnemy(q.x, q.y, 320);
        const a = t ? Math.atan2(t.y - q.y, t.x - q.x) : (q.face > 0 ? 0 : Math.PI);
        if(t) q.face = t.x >= q.x ? 1 : -1;
        const ca = Math.cos(a), sa = Math.sin(a);
        for(let i = 0; i < G.enemies.length; i++){
          const e = G.enemies[i];
          if(e.dead) continue;
          const ex = e.x - q.x, ey = e.y - q.y;
          const proj = ex * ca + ey * sa;
          if(proj < -8 || proj > 98) continue;
          if(Math.abs(-ex * sa + ey * ca) < e.r + 26) applyDamage(e, scaleSkill(52), true, e.x, e.y - 6);
        }
        if(G.boss && !G.boss.dead){
          const ex = G.boss.x - q.x, ey = G.boss.y - q.y;
          if(ex * ca + ey * sa > -8 && Math.abs(-ex * sa + ey * ca) < 62){
            damageBoss(G.boss, scaleSkill(48), true, G.boss.x, G.boss.y);
          }
        }
        for(let j = 0; j < 3; j++){
          const aa = a + (j - 1) * .34;
          G.parts.push({ x:q.x, y:q.y, vx:0, vy:0, life:.17, max:.17,
            col:j === 1 ? '#eafffb' : '#7dffe0', r:1,
            line:{ x2:q.x + Math.cos(aa) * 96, y2:q.y + Math.sin(aa) * 96 } });
        }
        G.shake = Math.max(G.shake, 3.5);
        SFX.heavy();
      }});
    }
  },

  /* 霜见 · 霜华领域：冰域减速 + 冻伤 */
  frost: function(p){
    const R = 172;
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      if(dst(p.x, p.y, e.x, e.y) < R + e.r){
        e.slowT = 4.2; e.slowAmt = Math.max(e.slowAmt || 0, .68);
        applyDamage(e, scaleSkill(34), false, e.x, e.y - 6);
      }
    }
    if(G.boss && !G.boss.dead && dst(p.x, p.y, G.boss.x, G.boss.y) < R + 44){
      G.boss.slowT = 3.6; G.boss.slowAmt = .55;
      damageBoss(G.boss, scaleSkill(70), false, G.boss.x, G.boss.y);
    }
    G.haz.push({ kind:'frost', x:p.x, y:p.y, r:R, dmg:0, life:4.6, max:4.6, col:'#9fe8ff', t:0 });
    G.rings.push({ x:p.x, y:p.y, r:16, max:R, life:.65, maxLife:.65, col:'#9fe8ff', w:5 });
  },

  /* 花铃 · 花开：治疗 + 攻速爆发 */
  bloom: function(p){
    heal(scaleSkill(p.maxHp * .25));
    G.cbuff.rate = scaleSkill(6);
    recalc();
    for(let i = 0; i < 18; i++){
      const a = rnd(0, TAU), v = rnd(40, 130);
      G.parts.push({ x:p.x, y:p.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v * .6,
        life:.6, max:.6, col:pick(['#ffd08a','#ff9a3c','#fff2c0']), r:1.8 });
    }
    floatText(p.x, p.y - 26, '花开 · 攻速+80%', '#ffd08a', true);
  },

  /* 兔桃 · 兔跳：三连跳，落地爆震 */
  bunny: function(){
    for(let k = 0; k < 3; k++){
      G.jobs.push({ t: .02 + k * .17, fn: function(){
        if(G.mode !== 'play' || !G.p) return;
        const q = G.p;
        const t = nearestEnemy(q.x, q.y, 320);
        let a;
        if(t){
          a = Math.atan2(t.y - q.y, t.x - q.x);
          q.face = t.x >= q.x ? 1 : -1;
        } else {
          let ix = 0, iy = 0;
          if(keys.left) ix -= 1;
          if(keys.right) ix += 1;
          if(keys.up) iy -= 1;
          if(keys.down) iy += 1;
          if(joy.active){ ix += joy.nx; iy += joy.ny; }
          a = (ix || iy) ? Math.atan2(iy, ix) : (q.face > 0 ? 0 : Math.PI);
        }
        q.x = clamp(q.x + Math.cos(a) * 62, 30, ARENA.w - 30);
        q.y = clamp(q.y + Math.sin(a) * 62, 34, ARENA.h - 26);
        q.inv = Math.max(q.inv, .3);
        aoe(q.x, q.y, 46, scaleSkill(38), null);
        G.rings.push({ x:q.x, y:q.y, r:6, max:46, life:.28, maxLife:.28, col:'#ffb8d8', w:2.5 });
        spark(q.x, q.y, 8, '#ffb8d8', 100);
        G.shake = Math.max(G.shake, 3);
      }});
    }
  },

  /* 茜羽 · 绯焰环：环形火弹 */
  scarlet: function(p){
    const N = 18;
    for(let i = 0; i < N; i++){
      const a = i / N * TAU;
      G.bullets.push({
        x:p.x + Math.cos(a) * 10, y:p.y + Math.sin(a) * 10,
        vx:Math.cos(a) * 430, vy:Math.sin(a) * 430,
        dmg:scaleSkill(G.st.dmg * (.9 + .2 * Math.random())), pierce:1, hits:[], life:.9,
        crit:Math.random() < G.st.crit, r:2.6, over:false, w:'smg', boom:false
      });
    }
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(!e.dead && dst(p.x, p.y, e.x, e.y) < 120) setBurn(e, 3, scaleSkill(9));
    }
    G.rings.push({ x:p.x, y:p.y, r:12, max:66, life:.3, maxLife:.3, col:'#ff8a5c', w:3 });
  },

  /* 玫红 · 血盾：护盾 + 护甲 */
  rose: function(p){
    G.shield = Math.min(4, G.shield + 2);
    G.shieldFx = .8;
    G.cbuff.armor = scaleSkill(6);
    recalc();
    G.rings.push({ x:p.x, y:p.y, r:10, max:68, life:.5, maxLife:.5, col:'#ffcf5a', w:4 });
    floatText(p.x, p.y - 26, '血盾 +2 · 护甲↑', '#ffcf5a', true);
  },

  /* 砂岚 · 弹幕压制：射速 + 弹数 */
  sable: function(p){
    G.cbuff.rate = scaleSkill(8);
    G.cbuff.extra = scaleSkill(8);
    recalc();
    floatText(p.x, p.y - 26, '弹幕压制', '#ffc861', true);
    G.rings.push({ x:p.x, y:p.y, r:8, max:56, life:.35, maxLife:.35, col:'#ffc861', w:3 });
  },

  /* 白露 · 冰棱突刺：穿透冰锥 */
  dewdrop: function(p){
    const t = nearestEnemy(p.x, p.y, 520);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.face > 0 ? 0 : Math.PI);
    for(let i = 0; i < 5; i++){
      const a = base + (i - 2) * .12;
      G.bullets.push({
        x:p.x + Math.cos(a) * 12, y:p.y + Math.sin(a) * 12,
        vx:Math.cos(a) * 600, vy:Math.sin(a) * 600,
        dmg:scaleSkill(G.st.dmg * 1.6), pierce:3, hits:[], life:1.0,
        crit:Math.random() < G.st.crit, r:3.4, over:false, w:'sniper', boom:false
      });
    }
    G.shake = 6;
  },

  /* 栗夜 · 时滞：全场减速 + 自身加速 */
  night: function(p){
    G.buff.stasis = scaleSkill(4);
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(!e.dead){ e.slowT = G.buff.stasis; e.slowAmt = Math.max(e.slowAmt || 0, .75); }
    }
    if(G.boss && !G.boss.dead){ G.boss.slowT = G.buff.stasis; G.boss.slowAmt = .6; }
    G.cbuff.spd = scaleSkill(4);
    recalc();
    G.rings.push({ x:p.x, y:p.y, r:20, max:Math.max(VW, VH) * 1.2, life:.7, maxLife:.7, col:'#b388ff', w:3 });
  },

  /* 银面 · 磁暴：牵引 + 眩晕 + 范围伤害 */
  visor: function(p){
    const R = 210;
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      const d = dst(p.x, p.y, e.x, e.y);
      if(d > R || d < 1) continue;
      const k = 1 - Math.min(.7, d / R);
      e.x += (p.x - e.x) * (.42 + k * .3);
      e.y += (p.y - e.y) * (.42 + k * .3);
      e.stun = 1.2;
      G.parts.push({ x:e.x, y:e.y, vx:0, vy:0, life:.16, max:.16, col:'#9fd0ff', r:1,
        line:{ x2:p.x, y2:p.y } });
    }
    aoe(p.x, p.y, 92, scaleSkill(50), null);
    G.rings.push({ x:p.x, y:p.y, r:14, max:R, life:.55, maxLife:.55, col:'#9fd0ff', w:4 });
  },

  /* 橙火 · 焚场：全场点燃 */
  ember: function(p){
    for(let i = 0; i < G.enemies.length; i++) setBurn(G.enemies[i], 8, scaleSkill(16));
    if(G.boss && !G.boss.dead) setBurn(G.boss, 8, scaleSkill(22));
    G.flash = Math.max(G.flash, .26);
    G.rings.push({ x:p.x, y:p.y, r:16, max:Math.max(VW, VH) * 1.3, life:.7, maxLife:.7, col:'#ff9a4c', w:4 });
  },

  /* ══ 第三世代涂装（图集 sprite 索引 13–22）══ */
  rust: function(p){
    const a = aimAngle(p, 420);
    p.x = clamp(p.x + Math.cos(a) * 84, 30, ARENA.w - 30);
    p.y = clamp(p.y + Math.sin(a) * 84, 34, ARENA.h - 26);
    p.inv = Math.max(p.inv, .6);
    aoe(p.x, p.y, 76, scaleSkill(46), null);
    G.shield = Math.min(5, G.shield + 1);
    G.shieldFx = .8;
    G.rings.push({ x:p.x, y:p.y, r:8, max:78, life:.34, maxLife:.34, col:'#ffb066', w:4 });
    spark(p.x, p.y, 12, '#ffb066', 140);
    G.shake = 8;
  },

  neon: function(p){
    p.inv = Math.max(p.inv, 2.2);
    G.wbuff.focus = scaleSkill(3);
    for(let i = 0; i < 5; i++){
      G.jobs.push({ t: i * .08, fn: function(){
        if(!G.p) return;
        spark(G.p.x, G.p.y, 4, '#ff3ea0', 90);
      }});
    }
    G.rings.push({ x:p.x, y:p.y, r:10, max:96, life:.4, maxLife:.4, col:'#ff3ea0', w:3 });
  },

  rimesuit: function(p){
    G.shield = Math.min(6, G.shield + 2);
    G.shieldFx = 1;
    G.haz.push({ kind:'frost', x:p.x, y:p.y, r:150, dmg:0, life:scaleSkill(4.2), max:scaleSkill(4.2), col:'#d8f8ff', t:0 });
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(!e.dead && dst(p.x, p.y, e.x, e.y) < 150){
        e.slowT = scaleSkill(3); e.slowAmt = Math.max(e.slowAmt || 0, .7);
      }
    }
    G.rings.push({ x:p.x, y:p.y, r:12, max:150, life:.55, maxLife:.55, col:'#d8f8ff', w:4 });
  },

  magma: function(p){
    aoe(p.x, p.y, 130, scaleSkill(90), null);
    explodeFX(p.x, p.y, 130);
    for(let i = 0; i < G.enemies.length; i++) setBurn(G.enemies[i], 5, scaleSkill(14));
    if(G.boss && !G.boss.dead) setBurn(G.boss, 5, scaleSkill(18));
    addBurn(p.x, p.y, 60);
    G.shake = 10;
  },

  voidsuit: function(p){
    const R = 220;
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(e.dead) continue;
      const d = dst(p.x, p.y, e.x, e.y);
      if(d > R || d < 1) continue;
      const k = .55 + (1 - d / R) * .3;
      G.parts.push({ x:e.x, y:e.y, vx:0, vy:0, life:.18, max:.18, col:'#c77dff', r:1,
        line:{ x2:p.x, y2:p.y } });
      e.x += (p.x - e.x) * k;
      e.y += (p.y - e.y) * k;
      applyDamage(e, scaleSkill(26), false, e.x, e.y - 6);
    }
    G.rings.push({ x:p.x, y:p.y, r:14, max:R, life:.5, maxLife:.5, col:'#c77dff', w:4 });
  },

  cipher: function(p){
    G.eb.length = 0;
    p.inv = Math.max(p.inv, scaleSkill(1.6));
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(!e.dead){ e.slowT = scaleSkill(3); e.slowAmt = Math.max(e.slowAmt || 0, .6); }
    }
    G.rings.push({ x:p.x, y:p.y, r:10, max:Math.max(VW, VH) * .9, life:.45, maxLife:.45, col:'#8fe3ff', w:3 });
    G.flash = Math.max(G.flash, .18);
  },

  bolt: function(p){
    let from = { x:p.x, y:p.y }, cur = null;
    const used = [];
    for(let k = 0; k < 8; k++){
      const nx = nearestEnemyExcept(from.x, from.y, 320, used);
      if(!nx) break;
      used.push(nx);
      G.parts.push({ x:from.x, y:from.y, vx:0, vy:0, life:.14, max:.14, col:'#ffe14a', r:1.4,
        line:{ x2:nx.x, y2:nx.y } });
      applyDamage(nx, scaleSkill(46), true, nx.x, nx.y - 6);
      from = nx; cur = nx;
    }
    if(cur) G.shake = 5;
    G.rings.push({ x:p.x, y:p.y, r:8, max:320, life:.3, maxLife:.3, col:'#ffe14a', w:2 });
  },

  moss: function(p){
    for(let i = 0; i < G.enemies.length; i++){
      const e = G.enemies[i];
      if(!e.dead && dst(p.x, p.y, e.x, e.y) < 150){
        applyDamage(e, scaleSkill(18), false, e.x, e.y - 6);
        setBurn(e, 5, scaleSkill(10));
      }
    }
    if(G.boss && !G.boss.dead && dst(p.x, p.y, G.boss.x, G.boss.y) < 190) setBurn(G.boss, 5, scaleSkill(12));
    for(let i = 0; i < 26; i++){
      const a = rnd(0, TAU), v = rnd(20, 90);
      G.parts.push({ x:p.x + Math.cos(a) * rnd(0, 100), y:p.y + Math.sin(a) * rnd(0, 60),
        vx:Math.cos(a) * v, vy:-rnd(6, 26), life:.9, max:.9, col:pick(['#a8e05a','#6a9a3a','#d8ffb0']), r:2 });
    }
    G.rings.push({ x:p.x, y:p.y, r:12, max:150, life:.5, maxLife:.5, col:'#a8e05a', w:3 });
  },

  gold: function(p){
    const t = nearestEnemy(p.x, p.y, 600);
    const tx = t ? t.x : p.x, ty = t ? t.y : p.y - 40;
    G.jobs.push({ t: .12, fn: function(){
      if(G.mode !== 'play') return;
      aoe(tx, ty, 180, scaleSkill(160), null);
      explodeFX(tx, ty, 180);
      addFlash(tx, ty, 320, '#ffe9a0', .9);
      G.shake = Math.max(G.shake, 12);
      for(let i = 0; i < 22; i++){
        const a = rnd(0, TAU), v = rnd(80, 240);
        G.parts.push({ x:tx, y:ty, vx:Math.cos(a) * v, vy:Math.sin(a) * v * .6,
          life:.55, max:.55, col:pick(['#ffe9a0','#ffb03c','#fff6d0']), r:2.2 });
      }
    }});
  },

  quanta: function(p){
    const a = aimAngle(p, 700);
    for(let i = 0; i < 8; i++){
      G.parts.push({ x:p.x - Math.cos(a) * i * 9, y:p.y - Math.sin(a) * i * 9,
        vx:0, vy:0, life:.22, max:.22, col:'#7ef0ff', r:2 });
    }
    p.x = clamp(p.x + Math.cos(a) * 150, 30, ARENA.w - 30);
    p.y = clamp(p.y + Math.sin(a) * 150, 34, ARENA.h - 26);
    p.inv = Math.max(p.inv, .8);
    aoe(p.x, p.y, 60, scaleSkill(40), null);
    G.rings.push({ x:p.x, y:p.y, r:6, max:64, life:.3, maxLife:.3, col:'#7ef0ff', w:3 });
  }

};

function charSkill(){
  if(G.mode !== 'play' || G.mechT > 0 || !G.p || G.p.hp <= 0) return false;
  const sk = SKIN();
  if(!sk.act) return false;
  if(G.ccd > 0) return false;
  const p = G.p, fn = CSK[sk.id];
  if(!fn) return false;
  G.ccd = G.ccdMax = abilityCooldown(sk.act.cd);
  HEXES.onSkillCast('wcd');
  G.shake = Math.max(G.shake, 5);
  addFlash(p.x, p.y, 108, sk.flow, .55);
  G.rings.push({ x:p.x, y:p.y, r:6, max:64, life:.32, maxLife:.32, col:sk.flow, w:3 });
  SFX.lvl();
  fn(p, sk);
  banner('必杀 · ' + sk.act.n, sk.act.t, 1.0);
  return true;
}

function updateChar(dt){
  if(G.ccd > 0) G.ccd = Math.max(0, G.ccd - dt);
  const b = G.cbuff;
  let dirty = false;
  const ks = ['rate','spd','dmg','armor','extra'];
  for(let i = 0; i < ks.length; i++){
    const k = ks[i];
    if(b[k] > 0){
      b[k] -= dt;
      if(b[k] <= 0){ b[k] = 0; dirty = true; }
    }
  }
  if(dirty) recalc();
}

function addEnergy(v){
  if(G.mechT > 0 || G.mode !== 'play' || G.st.mechLocked) return;
  G.energy = Math.min(100, G.energy + v);
}

/* ── 子弹 ── */
function updateBullets(dt, previous){
  updatePlayerProjectiles(dt, previous);

  // 敌方子弹
  for(let i=G.eb.length-1;i>=0;i--){
    const b = G.eb[i];
    if(!b) continue;          // 复活/EMP 可能在本帧清空数组
    if(b.homing){
      const a = Math.atan2(G.p.y - b.y, G.p.x - b.x);
      const ca = Math.atan2(b.vy, b.vx);
      const na = angLerp(ca, a, clamp(dt * 2.4, 0, 1));
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
    }
    const x=b.x+b.vx*dt,y=b.y+b.vy*dt;
    if(FieldMaps.shotContact(b.x,b.y,x,y,b.r)!==null){ G.eb.splice(i,1); continue; }
    b.x=x;b.y=y;
    b.life -= dt;
    if(b.life <= 0 || b.x < -30 || b.x > ARENA.w + 30 || b.y < -30 || b.y > ARENA.h + 30){
      G.eb.splice(i, 1); continue;
    }
    if(G.p.inv <= 0 && d2(b.x, b.y, G.p.x, G.p.y) < (b.r + playerRadius()) ** 2){
      EnemyEffects.impact(b);
      hurtPlayer(b.dmg);
      G.eb.splice(i, 1);
    }
  }
}

function aoe(x, y, r, dmg, skip){
  for(let i=0;i<G.enemies.length;i++){
    const e = G.enemies[i];
    if(e.dead || e === skip) continue;
    if(d2(x, y, e.x, e.y) < (r + e.r) * (r + e.r)){
      applyDamage(e, dmg, false, e.x, e.y - 6);
    }
  }
  if(G.boss && !G.boss.dead && d2(x, y, G.boss.x, G.boss.y) < (r + G.boss.r) * (r + G.boss.r)){
    damageBoss(G.boss, dmg, false, x, y);
  }
}

/* ══════════ 伤害计算 ══════════
   所有「对敌伤害」都从这里出：
   ① 基础 = 固定伤害（武器基础 + 技能加法）
   ② 百分比 = 1 + (角色 + 武器共鸣 + 临时 buff + 技能)，加法叠加后只乘一次
   ③ 暴击判定（默认 2 倍，precise 共鸣/白露为 2.4–2.5 倍）
   ④ 穿透递减：每次穿透后 ×0.7
   ⑤ 取整输出 */
function calcDamage(base, attacker, target, opt){
  if(attacker === 'weather') return {dmg:Math.max(1,Math.round(base)),crit:false};
  opt = opt || {};
  const s = G.st || baseStats();
  let dmg = base + (opt.flat || 0);
  dmg *= Math.max(.05, 1 + (s.dmgPct || 0) + (opt.pct || 0));
  const crit = (typeof opt.crit === 'boolean') ? opt.crit : (Math.random() < (s.crit || 0));
  if(crit) dmg *= (opt.critMul || s.critMul || 2);
  const pi = opt.pierceIndex || 0;
  if(pi > 0) dmg *= Math.pow(s.pierceRetention, pi);
  return { dmg: Math.max(1, Math.round(dmg)), crit: crit };
}

function applyDamage(e, dmg, crit, hx, hy, opt){
  if(!e || e.dead) return;
  const source = opt?.source ?? 'player';
  const r = calcDamage(dmg, source, e, Object.assign({ crit: crit }, opt || {}));
  if(EnemyTactics.supported(e)) r.dmg = Math.max(1, Math.round(r.dmg * .52));
  r.dmg=EnemyTactics.absorb(e,r.dmg);
  if(r.dmg<=0){ e.flash=.07; SFX.hit(true); return; }
  EnemyTactics.interrupt(e,r.dmg);
  if(source === 'player') HEXES.onAttackDamage(Math.min(e.hp,r.dmg),e,r.crit);
  e.hp -= r.dmg;
  e.flash = .11;
  if(r.crit) G.hitStop = Math.max(G.hitStop, .028);
  if(QLEVEL > 0 || r.crit || G.texts.length < 32){
    G.texts.push({
      x: hx + rnd(-4,4), y: hy - 14, v: r.dmg,
      life: .55, max: .55, col: r.crit ? '#ffe58a' : '#ffffff', vy: -40, big: r.crit
    });
  }
  if(e.hp <= 0) killEnemy(e,source === 'player',opt?.emberSeed);
  else SFX.hit(true);
}

function killEnemy(e, playerKill = true, emberSeed = false){
  if(e.dead) return;
  e.dead = true;
  e.deadT = 0;
  EnemyTactics.detach(e);
  ThreatPacing.onEnemyDown(e);
  if(e.noReward || !playerKill){
    boom(e.x, e.y, false);
    return;
  }
  if(emberSeed) WeaponLinks.spreadEmbers(e);
  G.kills++;
  G.score += Math.round(e.xp * 14);
  G.combo++; G.comboT = 2.2;
  addEnergy(e.elite ? 8 : 5);
  if(G.st.leech > 0) heal(G.st.leech);
  TALENTS.onKill();
  /* 疾风：连杀攒移速爆发 */
  if(G.st.fleet > 0){
    G.fleetKill = (G.fleetKill || 0) + 1;
    if(G.fleetKill >= G.st.fleet * 4){
      G.fleetKill = 0;
      G.buff.fleet = 3;
    }
  }
  boom(e.x, e.y, e.elite);
  addDissolve(e, 'm_' + CampaignEnemies.sprite(e) + '_0');
  addScar(e.x, e.y);        // 装饰附近死亡 → 留下短暂地面痕迹
  SFX.kill();
  if(e.elite) G.hitStop = Math.max(G.hitStop, .04);

  const n = e.elite ? 4 : 2;
  for(let i=0;i<n;i++){
    G.orbs.push({
      x: e.x, y: e.y, vx: rnd(-50,50), vy: rnd(-40,40),
      val: (e.rewardXP ?? (e.elite ? 12 : 2)) / n, t: 0
    });
  }
  if(EK[e.kind].boom){
    const d = dst(e.x, e.y, G.p.x, G.p.y);
    if(d < 26 + playerRadius()) hurtPlayer(EK[e.kind].dmg);
    EnemyEffects.burst('fuse',e.x,e.y,0,26);
    G.shake = Math.max(G.shake,2.8);
    aoe(e.x, e.y, 30, 12, e);
  }
  // 道具掉落：精英更容易爆货
  if(Math.random() < StageEvents.dropChance(e.elite)) dropItem(e.x, e.y);
}

function damageBoss(b, dmg, crit, hx, hy, opt){
  if(!b || b.dead) return;
  const source = opt?.source ?? 'player';
  const r = calcDamage(dmg, source, b, Object.assign({ crit: crit }, opt || {}));
  if(source === 'player') HEXES.onAttackDamage(Math.min(b.hp,r.dmg),b,r.crit);
  b.hp -= r.dmg;
  b.flash = .09;
  if(Math.random() < .6 || r.crit){
    G.texts.push({
      x: hx + rnd(-5,5), y: hy - 10, v: r.dmg,
      life: .5, max: .5, col: r.crit ? '#ffe58a' : '#ffffff', vy: -34, big: r.crit
    });
  }
  if(b.hp <= 0 && !b.dead) bossDown(b);
}

function heal(v){
  if(!G.p) return;
  G.p.hp = Math.min(G.p.maxHp, G.p.hp + v);
}

function incomingDamageFactor(s){
  return (1 - clamp(s.armor,0,ARMOR_LIMIT)) * (1 + s.dmgTaken);
}

function hurtPlayer(dmg){
  const p = G.p;
  if(G.mode !== 'play' || G.mechT > 0 || p.hp <= 0) return;
  if(p.inv > 0) return;
  // 力场护盾：先消耗一层，不掉血
  if(G.shield > 0){
    G.shield--;
    HEXES.onShieldBlock();
    G.shieldFx = .85;
    p.inv = .5;
    G.rings.push({ x:p.x, y:p.y, r:8, max:44, life:.35, maxLife:.35, col:'#b9c7ff', w:3 });
    spark(p.x, p.y, 10, '#b9c7ff', 120);
    floatText(p.x, p.y, '护盾格挡', '#b9c7ff', true);
    G.shake = Math.max(G.shake, 3);
    SFX.hit();
    return;
  }
  p.hp -= dmg * incomingDamageFactor(G.st);
  p.inv = .75;
  p.hurtT = .3;
  G.hurt = .55;
  G.shake = Math.max(G.shake, 4);
  addFlash(p.x, p.y, 66, '#ff5a4a', .55);
  G.combo = 0;
  SFX.hurt();
  spark(p.x, p.y, 10, '#ff7a6a', 130);
  if(p.hp <= 0){
    p.hp = 0;
    playerDown();
  }
}

function playerDown(){
  if(PREPARATIONS.tryLock()) return;
  endMech();
  if(G.revives > 0){
    G.revives--;
    G.p.hp = G.p.maxHp * .55;
    G.p.inv = 3;
    G.eb.length = 0;
    // 清掉身边敌人
    for(let i=G.enemies.length-1;i>=0;i--){
      const e = G.enemies[i];
      if(!e.commander && dst(e.x,e.y,G.p.x,G.p.y)<130){
        EnemyTactics.detach(e);
        boom(e.x,e.y,true);
        G.enemies.splice(i,1);
      }
    }
    explodeFX(G.p.x, G.p.y, 120);
    G.shake = 14; G.flash = .6;
    banner('被击倒 · 紧急重启', '本局剩余复活次数 0', 1.4);
    SFX.lvl();
    return;
  }
  G.mode = 'over';
  G.p.hp = 0;
  showOver(false);
}

/* ── 拾取物 ── */
function updateOrbs(dt){
  const p = G.p;
  const R = 72 * G.st.magnet * (G.buff.magnet > 0 ? 1.7 : 1);
  for(let i=G.orbs.length-1;i>=0;i--){
    const o = G.orbs[i];
    o.t += dt;
    const d = dst(o.x, o.y, p.x, p.y);
    // 掉远了会自己慢慢飘回来，避免远程击杀的经验白丢
    if(d < R || o.pull || o.t > 2.2){
      o.pull = true;
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      const sp = 95 + (R - Math.min(d, R)) * 3.6;
      o.vx = lerp(o.vx, Math.cos(a) * sp, 1 - Math.pow(.001, dt));
      o.vy = lerp(o.vy, Math.sin(a) * sp, 1 - Math.pow(.001, dt));
    } else {
      o.vx *= Math.pow(.06, dt);
      o.vy *= Math.pow(.06, dt);
    }
    o.x += o.vx * dt; o.y += o.vy * dt;
    if(d < 14){
      gainXp(o.val, false);
      G.orbs.splice(i, 1);
      SFX.pick();
      continue;
    }
    if(o.t > 22) G.orbs.splice(i, 1);
  }
}

/* ══════════════════════════════════════════
   战场道具：掉落 → 拾取 / 装进背包 → 释放
   ══════════════════════════════════════════ */
function floatText(x, y, s, col, big){
  G.texts.push({ x:x, y:y - 16, v:s, life:1.05, max:1.05, col:col, vy:-26, big:!!big });
}

function dropItem(x, y, id){
  const a = rnd(0, TAU), v = rnd(40, 96);
  G.picks.push({
    id: id || rollItem(),
    x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .7,
    t: 0, life: 24, pull: false, born: .3
  });
}

function dropLoot(x, y, n, tactic){
  for(let i=0;i<n;i++){
    let id = rollItem();
    if(tactic && IT[id].mode !== 'bag') id = pick(['airstrike', 'stasis', 'venom', 'emp']);
    dropItem(x + rnd(-16, 16), y + rnd(-12, 12), id);
  }
}

function updatePicks(dt){
  if(!G.p) return;
  const p = G.p;
  const R = 82 * (G.st ? G.st.magnet : 1) * (G.buff.magnet > 0 ? 1.7 : 1);
  for(let i=G.picks.length-1;i>=0;i--){
    const o = G.picks[i];
    o.t += dt;
    if(o.born > 0) o.born -= dt;
    const d = dst(o.x, o.y, p.x, p.y);
    if(d < R || o.pull){
      o.pull = true;
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      const sp = 150 + (R - Math.min(d, R)) * 4.5;
      o.vx = lerp(o.vx, Math.cos(a) * sp, 1 - Math.pow(.0002, dt));
      o.vy = lerp(o.vy, Math.sin(a) * sp, 1 - Math.pow(.0002, dt));
    } else {
      o.vx *= Math.pow(.06, dt);
      o.vy *= Math.pow(.06, dt);
    }
    o.x += o.vx * dt; o.y += o.vy * dt;
    o.x = clamp(o.x, 24, ARENA.w - 24);
    o.y = clamp(o.y, 32, ARENA.h - 24);
    if(d < 16){ takeItem(o.id, o.x, o.y); G.picks.splice(i, 1); continue; }
    if(o.t > o.life) G.picks.splice(i, 1);
  }
}

function takeItem(id, x, y){
  const def = IT[id];
  if(!def) return;
  G.picksGot++;
  G.rings.push({ x:x, y:y, r:4, max:30, life:.34, maxLife:.34, col:def.c, w:2.5 });
  spark(x, y, 8, def.c, 90);
  if(def.mode === 'auto'){
    applyItem(id);
    floatText(x, y, def.n, def.c, true);
    SFX.pick();
    return;
  }
  const slot = G.bag[0] === null ? 0 : (G.bag[1] === null ? 1 : -1);
  if(slot >= 0){
    G.bag[slot] = id;
    syncBag();
    floatText(x, y, def.n + ' → 道具 ' + (slot + 1), def.c, true);
    SFX.lvl();
  } else {
    applyItem(id);
    floatText(x, y, def.n + '（背包满 · 即时释放）', def.c, true);
    SFX.lvl();
  }
}

function useItem(slot){
  if(G.mode !== 'play') return false;
  const id = G.bag[slot];
  if(!id) return false;
  G.bag[slot] = null;
  syncBag();
  applyItem(id);
  SFX.mech();
  return true;
}

/* 道具效果本体 */
function applyItem(id){
  const p = G.p;
  if(!p) return;
  const cx = p.x, cy = p.y;

  if(id === 'medkit'){
    const need = p.maxHp - p.hp;
    if(need < 1){
      G.shield = Math.min(4, G.shield + 1);
      G.shieldFx = .6;
      floatText(cx, cy, '满血 → 护盾 +1', '#7dffb0', true);
    } else {
      const v = Math.min(need, p.maxHp * .3);
      heal(v);
      floatText(cx, cy, '+' + Math.round(v), '#7dffb0', true);
      spark(cx, cy, 14, '#7dffb0', 140);
    }
    G.rings.push({ x:cx, y:cy, r:6, max:56, life:.45, maxLife:.45, col:'#7dffb0', w:2.5 });
  }
  else if(id === 'battery'){
    const b = G.energy;
    /* 机甲期间不积攒能量：走受保护的 addEnergy，机甲存在时直接忽略 */
    addEnergy(40);
    const label = G.st.mechLocked ? '本局机甲禁用' :
      G.mechT > 0 ? '机甲已启动 · 能量不累积' : '能量 +' + Math.round(G.energy - b);
    floatText(cx, cy, label, '#ffb45c', true);
    G.rings.push({ x:cx, y:cy, r:6, max:66, life:.45, maxLife:.45, col:'#ffb45c', w:2.5 });
  }
  else if(id === 'over'){
    G.buff.over = 12;
    floatText(cx, cy, '超载 12s', '#8fe3ff', true);
    G.rings.push({ x:cx, y:cy, r:6, max:76, life:.5, maxLife:.5, col:'#8fe3ff', w:3 });
  }
  else if(id === 'magnet'){
    G.buff.magnet = 8;
    for(let i=0;i<G.orbs.length;i++){ G.orbs[i].pull = true; G.orbs[i].t = Math.max(G.orbs[i].t, 2.3); }
    floatText(cx, cy, '引力核 · 全场经验回收', '#ffd08a', true);
    G.rings.push({ x:cx, y:cy, r:10, max:Math.max(VW, VH) * 1.2, life:.6, maxLife:.6, col:'#ffd08a', w:2 });
  }
  else if(id === 'shield'){
    G.shield = Math.min(4, G.shield + 2);
    G.shieldFx = .7;
    floatText(cx, cy, '护盾 +2', '#b9c7ff', true);
    G.rings.push({ x:cx, y:cy, r:10, max:64, life:.5, maxLife:.5, col:'#b9c7ff', w:3 });
  }
  else if(id === 'airstrike'){
    for(let k=0;k<7;k++) G.jobs.push({ t: .1 + k * .17, fn: airstrikeHit });
    floatText(cx, cy, '空袭 · 已标记', '#ff8a6a', true);
    SFX.boss();
  }
  else if(id === 'stasis'){
    G.buff.stasis = 4.5;
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(!e.dead){ e.slowT = 4.5; e.slowAmt = Math.max(e.slowAmt || 0, .75); }
    }
    if(G.boss && !G.boss.dead){ G.boss.slowT = 4.5; G.boss.slowAmt = .6; }
    floatText(cx, cy, '时滞 4.5s', '#c8a0ff', true);
    G.rings.push({ x:cx, y:cy, r:20, max:Math.max(VW, VH) * 1.2, life:.7, maxLife:.7, col:'#c8a0ff', w:3 });
  }
  else if(id === 'venom'){
    for(let i=0;i<G.enemies.length;i++) poison(G.enemies[i], 8, 7);
    if(G.boss && !G.boss.dead) poison(G.boss, 8, 7);
    floatText(cx, cy, '毒雾扩散', '#a8e05a', true);
    G.rings.push({ x:cx, y:cy, r:20, max:Math.max(VW, VH) * 1.2, life:.7, maxLife:.7, col:'#a8e05a', w:3 });
  }
  else if(id === 'emp'){
    G.eb.length = 0;
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(!e.dead) e.stun = 2.5;
    }
    if(G.boss && !G.boss.dead) G.boss.stun = 1.6;
    floatText(cx, cy, 'EMP · 敌弹清空', '#b9f2ff', true);
    G.rings.push({ x:cx, y:cy, r:24, max:Math.max(VW, VH) * 1.6, life:.6, maxLife:.6, col:'#b9f2ff', w:4 });
    G.flash = Math.max(G.flash, .32);
    SFX.boom();
  }
  else if(id === 'nuke'){
    const dmg = 130;
    for(let i=G.enemies.length-1;i>=0;i--){
      const e = G.enemies[i];
      if(!e.dead) applyDamage(e, dmg, true, e.x, e.y);
    }
    if(G.boss && !G.boss.dead) damageBoss(G.boss, dmg * .7, true, G.boss.x, G.boss.y);
    G.haz.length = 0;
    G.eb.length = 0;
    G.flash = .85; G.shake = 16;
    explodeFX(cx, cy, 300);
    floatText(cx, cy, '灭绝令', '#ffe58a', true);
    SFX.boom();
  }
}

function poison(unit, dur, dps){
  if(!unit || unit.dead) return;
  WeaponLinks.applyBurn(unit,dur,dps,'venom');
  unit.venom = true;
}

function airstrikeHit(){
  if(G.mode !== 'play' || !G.p) return;
  const a = rnd(0, TAU), d = rnd(16, 168);
  const x = clamp(G.p.x + Math.cos(a) * d, 30, ARENA.w - 30);
  const y = clamp(G.p.y + Math.sin(a) * d, 40, ARENA.h - 30);
  explodeFX(x, y, 62);
  aoe(x, y, 58, 46, null);
  G.shake = Math.max(G.shake, 7);
  SFX.boom();
}

function updateJobs(dt){
  for(let i=G.jobs.length-1;i>=0;i--){
    const j = G.jobs[i];
    j.t -= dt;
    if(j.t <= 0){ G.jobs.splice(i, 1); j.fn(); }
  }
}

function tickBuff(dt){
  const b = G.buff;
  if(b.over > 0) b.over -= dt;
  if(b.magnet > 0) b.magnet -= dt;
  if(b.stasis > 0) b.stasis -= dt;
  if(b.fleet > 0) b.fleet -= dt;
  if(b.rad > 0){ b.rad -= dt; if(G.p && G.p.hp > 0) G.p.hp = Math.max(1, G.p.hp - 2.2 * dt); }
  if(b.luck > 0) b.luck -= dt;
  if(b.weak > 0) b.weak -= dt;
  if(G.shieldFx > 0) G.shieldFx -= dt;
  // 时滞：新刷出来的敌人也一起慢下来
  if(b.stasis > 0){
    for(let i=0;i<G.enemies.length;i++){
      const e = G.enemies[i];
      if(!e.dead) e.slowT = Math.max(e.slowT || 0, .16);
    }
  }
}

/* ── 空投补给箱 ── */
/* 投放位置优先取自地面痕迹暗示的候选点（G.supplyPads），
   保持原有约束：离玩家 ≥150px、避开 solid 道具；全都不合适时回退随机。 */
function spawnCrate(){
  let x = 0, y = 0, placed = false;
  const pads = G.supplyPads || [];
  if(pads.length){
    for(let k=0;k<pads.length;k++){
      const pd = pads[((G.supplyIdx || 0) + k) % pads.length];
      if(dst(pd.x, pd.y, G.p.x, G.p.y) < 150) continue;
      let clear = true;
      for(let i=0;i<G.props.length;i++){
        const pr = G.props[i];
        const rr = pr.r + (pr.lm ? 62 : 26);
        if((pr.solid || pr.lm) && d2(pd.x, pd.y, pr.x, pr.y) < rr * rr){ clear = false; break; }
      }
      if(!clear) continue;
      x = pd.x; y = pd.y; placed = true;
      G.supplyIdx = ((G.supplyIdx || 0) + k + 1) % pads.length;
      break;
    }
  }
  if(!placed){
    for(let k=0;k<26;k++){
      x = rnd(140, ARENA.w - 140);
      y = rnd(150, ARENA.h - 150);
      if(dst(x, y, G.p.x, G.p.y) < 150) continue;
      let clear = true;
      for(let i=0;i<G.props.length;i++){
        const pr = G.props[i];
        const rr = pr.r + (pr.lm ? 62 : 26);
        if((pr.solid || pr.lm) && d2(x, y, pr.x, pr.y) < rr * rr){ clear = false; break; }
      }
      if(clear) break;
    }
  }
  G.crates.push({ x:x, y:y, unlockT:0, t:0, fall:.85, flash:0, dead:false });
  G.rings.push({ x:x, y:y, r:8, max:70, life:.8, maxLife:.8, col:'#ffbe86', w:2 });
  banner('补给空投', '靠近补给箱 1 秒即可解锁', .9);
  SFX.portal();
}

function hitCrate(c, dmg, x, y){
  /* 保留接口：外部（如测试）仍可调用，但实际解锁改为靠近触发 */
  if(c.dead) return;
  unlockCrate(c);
}

/* 靠近 1 秒解锁补给箱 */
function unlockCrate(c){
  if(c.dead) return;
  c.dead = true;
  c.deadT = 0;
  explodeFX(c.x, c.y, 46);
  G.shake = Math.max(G.shake, 6);
  dropLoot(c.x, c.y, 3, true);
  floatText(c.x, c.y, '补给到手', '#ffbe86', true);
  SFX.boom();
}

function updateCrates(dt){
  for(let i=G.crates.length-1;i>=0;i--){
    const c = G.crates[i];
    c.t += dt;
    if(c.flash > 0) c.flash -= dt;
    if(c.fall > 0){ c.fall -= dt; continue; }
    if(c.dead){
      c.deadT += dt;
      if(c.deadT > .4) G.crates.splice(i, 1);
      continue;
    }
    /* 靠近 1 秒解锁：站在箱子旁持续充能 */
    if(G.p && dst(G.p.x, G.p.y, c.x, c.y) < 60){
      c.unlockT += dt;
      if(c.unlockT >= 1) unlockCrate(c);
    } else {
      c.unlockT = Math.max(0, c.unlockT - dt * 2);
    }
  }
}

/* ── 绘制 ── */
function drawPick(o){
  const def = IT[o.id];
  if(!def) return;
  const bob = Math.sin(G.t * 4 + o.x * .1) * 2.2;
  const sx = SX(o.x), sy = SY(o.y) - 11 + bob;
  const k = .45 + .55 * (1 - clamp(o.born / .3, 0, 1));
  const blink = o.t > o.life - 3 ? (Math.floor(G.t * 7) % 2 ? .35 : 1) : 1;

  ctx.globalAlpha = blink;
  // 地面光斑
  ctx.fillStyle = def.c;
  ctx.globalAlpha = .18 * blink;
  ctx.beginPath(); ctx.ellipse(SX(o.x), SY(o.y), 15, 15 * KZ, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = blink;
  // 光柱
  const gd = ctx.createLinearGradient(sx, sy - 18, sx, SY(o.y) + 2);
  gd.addColorStop(0, 'rgba(255,255,255,0)');
  gd.addColorStop(1, def.c);
  ctx.globalAlpha = .26 * blink;
  ctx.fillStyle = gd;
  ctx.fillRect(sx - 4, sy - 20, 8, 22);
  ctx.globalAlpha = blink;
  // 胶囊
  const w = 10.5 * k, h = 12.5 * k;
  ctx.fillStyle = 'rgba(8,14,24,.94)';
  rr(sx - w/2, sy - h/2, w, h, 3.5); ctx.fill();
  ctx.strokeStyle = def.c;
  ctx.lineWidth = 1.4;
  rr(sx - w/2, sy - h/2, w, h, 3.5); ctx.stroke();
  ctx.fillStyle = def.c;
  ctx.globalAlpha = .26 * blink;
  rr(sx - w/2 + 1.2, sy - h/2 + 1.2, w - 2.4, h - 2.4, 3); ctx.fill();
  ctx.globalAlpha = blink;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(sx - w/2 + 1.5, sy - h/2 + 1.5, w - 3, 1);
  ctx.textAlign = 'center';
  ctx.font = '700 ' + Math.round(9.2 * k) + 'px ui-monospace, monospace';
  ctx.fillStyle = def.c;
  ctx.fillText(def.ic, sx, sy + 3.4 * k);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function drawCrate(c){
  const sx = SX(c.x);
  const drop = c.fall > 0 ? -(c.fall * c.fall) * 120 : 0;
  const sy = SY(c.y) + drop;
  ctx.globalAlpha = 1;
  // 落点警示
  if(c.fall > 0){
    const k = 1 - clamp(c.fall / .85, 0, 1);
    ctx.strokeStyle = 'rgba(255,140,90,' + (.5 + Math.sin(G.t * 14) * .3).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, SY(c.y), 20 + k * 8, (20 + k * 8) * KZ, 0, 0, TAU); ctx.stroke();
  }
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath(); ctx.ellipse(sx, SY(c.y), 15, 6, 0, 0, TAU); ctx.fill();

  const body = c.flash > 0 ? '#fff6e0' : '#48586c';
  const edge = c.flash > 0 ? '#fff' : '#8aa2bd';
  const hw = 15, hh = 26;
  ctx.fillStyle = body;
  ctx.fillRect(sx - hw, sy - hh, hw * 2, hh);
  ctx.fillStyle = edge;
  ctx.fillRect(sx - hw, sy - hh, hw * 2, 3);
  ctx.fillRect(sx - hw, sy - hh, 3, hh);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(sx + hw - 3, sy - hh + 3, 3, hh - 3);
  // 警示斜纹
  ctx.save();
  ctx.beginPath(); ctx.rect(sx - hw + 3, sy - hh + 3, hw * 2 - 6, hh - 3); ctx.clip();
  ctx.fillStyle = 'rgba(255,170,80,.85)';
  for(let i=-3;i<6;i++) ctx.fillRect(sx - hw + i * 9, sy - hh + 3, 3.5, hh - 3);
  ctx.fillStyle = 'rgba(10,16,26,.62)';
  ctx.fillRect(sx - hw + 3, sy - hh * .62, hw * 2 - 6, 6);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,210,150,.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - hw + .5, sy - hh + .5, hw * 2 - 1, hh - 1);
  // 解锁进度圈（靠近充能）
  if(c.unlockT > 0){
    const f = clamp(c.unlockT / 1, 0, 1);
    const r = 22;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx, sy - hh * .5, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffbe86';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy - hh * .5, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
  }
}

function gainXp(v, showReward = true){
  if(G.buff.luck > 0) v *= 2;   /* 幸运星：经验翻倍 */
  G.xp += v;
  while(G.xp >= G.need){
    G.xp -= G.need;
    G.lv++;
    G.need = Math.round(8 + G.lv * 6);
    G.pending++;
  }
  if(showReward) openLevel();
}

/* ── 敌人 ── */
/* 移除最早生成的非 Boss 敌人（同屏上限用）：不掉经验、不掉道具、不计击杀 */
function cullOldestEnemy(){
  const dead=G.enemies.findIndex(e=>e.dead);
  if(dead>=0){ G.enemies.splice(dead,1); return true; }
  for(let i=0;i<G.enemies.length;i++){
    const e = G.enemies[i];
    if(e.commander) continue;
    EnemyTactics.detach(e);
    G.enemies.splice(i, 1);
    for(let k=0;k<4;k++){
      G.parts.push({ x:e.x + rnd(-6,6), y:e.y - rnd(0,10), vx:rnd(-20,20), vy:-rnd(10,34),
        life:.35, max:.35, col:'rgba(150,170,200,.5)', r:rnd(1,2) });
    }
    return true;
  }
  return false;
}

function enemyTypeStats(kind, profile, elite, hpMul){
  const k = EK[kind];
  return {
    hp:(k.hp + k.hpw * CampaignEnemies.healthGrowth(kind,profile)) * hpMul * (elite ? 2.35 : 1),
    r:k.r * (elite ? 1.24 : 1), h:k.h * (elite ? 1.18 : 1),
    dmg:k.dmg * profile.damageMul * (elite ? 1.3 : 1),
    spd:k.spd * (1 + .045 * G.stage) * (elite ? .92 : 1),
    fly:!!k.fly, boom:!!k.boom, beam:!!k.beam,
    shoot:k.shoot ? k.shoot * (1 - .06 * G.stage) : 0,
    col:k.c
  };
}

function spawnEnemy(kind, x, y, opt = {}){
  if(G.enemies.length >= ENEMY_CAP && !cullOldestEnemy()) return null;
  const k = EK[kind], waveOrigin = opt.waveOrigin ?? G.wave;
  const profile = CampaignBalance.at(G.stage,waveOrigin);
  const elite = !!opt.elite || (!opt.noElite && G.wave >= 3 && CampaignEnemies.rank(kind)<3 &&
    Math.random() < profile.eliteChance + (G.waveEliteBoost || 0) * .06);
  const hpMul = opt.hpMul || 1;
  const stats = enemyTypeStats(kind,profile,elite,hpMul);
  const plate=kind==='bastion' ? Math.round(stats.hp*(opt.commander?.name ? .26 : .22)) : 0;
  const e = {
    ...stats, kind:kind, x:x, y:y, vx:0, vy:0, maxHp:stats.hp, elite:elite,
    commander:opt.commander || null, plate:plate, maxPlate:plate,
    waveOrigin:waveOrigin, variantRoll:opt.variantRoll, hpMul:hpMul,
    xp:k.xp * (1 + .10 * G.stage) * (elite ? 3 : 1),
    rewardXP:Math.round((profile.xpValue + (k.xp-2) * .28) * (elite ? 2.8 : 1)),
    noReward:!!opt.noReward, shootT:rnd(.6,2), tacticsCd:rnd(1.1,2.3),
    face:1, anim:rnd(0,10), spawnT:.45, flash:0,
    slowT:0, slowAmt:0, burnT:0, burnDps:0, stun:0,
    dead:false, deadT:0, wob:rnd(0,TAU)
  };
  if(!e.fly) FieldMaps.clearRails(e,e.r);
  if(G.stage>0 && CampaignEnemies.rank(kind)===1 && !e.commander) markEliteVariant(e);
  G.enemies.push(e);
  G.rings.push({ x:e.x, y:e.y, r:2, max:16, life:.3, maxLife:.3, col:SCENES[G.stage].accent, w:1.5 });
  return e;
}

function reformWaveEnemies(floor){
  for(let i=G.enemies.length-1;i>=0;i--){
    const e=G.enemies[i];
    EnemyTactics.detach(e);
    if(e.dead) G.enemies.splice(i,1);
  }
  for(const e of G.enemies){
    e.variantRoll ??= (++G.floorSpawnSerial * .61803398875) % 1;
    const wave = e.waveOrigin ?? G.wave;
    if(G.stage===2){
      e.mineKinds ??= {};
      e.mineKinds[floor==='surface'?'ice-mine':'surface'] = e.kind;
    }
    const kind = e.mineKinds?.[floor] ?? CampaignEnemies.kind(G.stage,wave,floor,e.variantRoll);
    if(kind !== e.kind){
      const health = e.hp / e.maxHp;
      const stats = enemyTypeStats(kind,CampaignBalance.at(G.stage,wave),e.elite,e.hpMul ?? 1);
      Object.assign(e,stats,{kind:kind,maxHp:stats.hp,hp:stats.hp * health});
      const cooldown = e.eliteCooldown;
      e.eliteAct = e.eliteVariant = null;
      if(G.stage>0 && CampaignEnemies.rank(kind)===1){
        markEliteVariant(e);
        if(cooldown !== undefined) e.eliteCooldown = cooldown;
      }
    }
    if(!e.fly) FieldMaps.clearRails(e,e.r);
  }
}

/* ── 刷怪锚点：让敌人从「场景里」钻出来 ──
   权重来自两类天然藏身处：
   ① 固体道具旁（箱子/石圈/晶丛/柱子——杂物后面最容易冒人）
   ② 地面装饰最密的四角（与 GROUND.cornerness 的堆叠区域一致）
   生成点优先从这里取，取不到才退回原来的环形随机。 */
function buildSpawnAnchors(sc){
  const out = [];
  for(let i=0;i<G.props.length;i++){
    const pr = G.props[i];
    if(pr.lm || !pr.solid) continue;
    out.push({ x:pr.x, y:pr.y, r:pr.r + 24, w: pr.h > 24 ? 1.25 : 1 });
  }
  const cx = [ARENA.w * .17, ARENA.w * .83];
  const cy = [ARENA.h * .19, ARENA.h * .81];
  for(let i=0;i<2;i++){
    for(let j=0;j<2;j++){
      out.push({ x:cx[i], y:cy[j], r:58, w:1.5 });
    }
  }
  /* 地标附近也是"有东西"的地方：权重略低，避免总在同一处刷 */
  for(let i=0;i<G.props.length;i++){
    const pr = G.props[i];
    if(!pr.lm) continue;
    out.push({ x:pr.x, y:pr.y - pr.h * .2, r:pr.r + 40, w:.9 });
  }
  let tot = 0;
  for(let i=0;i<out.length;i++) tot += out[i].w;
  out.total = tot;
  return out;
}

/* 刷怪点的"钻出"烟尘：颜色取场景 accent，极短寿命，开销可忽略 */
function spawnPuff(x, y){
  const c = SCENES[G.stage].accent;
  for(let i=0;i<5;i++){
    G.parts.push({
      x:x + rnd(-7,7), y:y - rnd(0,4),
      vx:rnd(-26,26), vy:-rnd(18,44),
      life:.42, max:.42, col:c, r:rnd(1.2,2.2)
    });
  }
  G.rings.push({ x:x, y:y, r:3, max:20, life:.30, maxLife:.30, col:c, w:1 });
}

function spawnPointNear(){
  const open = (x,y) => FieldMaps.openPoint(x,y,22);
  /* ① 优先：场景装饰旁钻出（68%），落点仍需离玩家足够远 */
  const an = G.spawnAnchors;
  if(an && an.length > 2 && Math.random() < .68){
    for(let tries=0; tries<9; tries++){
      let v = Math.random() * an.total, idx = 0;
      while(idx < an.length - 1 && v > an[idx].w){ v -= an[idx].w; idx++; }
      const a = an[idx];
      const ang = Math.random() * TAU;
      const rr = a.r * (.45 + Math.random() * 1.0);
      const x = a.x + Math.cos(ang) * rr;
      const y = a.y + Math.sin(ang) * rr * KZ;
      if(x < 48 || x > ARENA.w - 48 || y < 52 || y > ARENA.h - 48) continue;
      if(dst(x, y, G.p.x, G.p.y) < 205 || !open(x,y)) continue;      // 不贴脸生成
      return { x:x, y:y, deco:true };
    }
  }
  /* ② 回退：原来的环形随机（保证任何情况下都有合法点） */
  for(let i=0;i<24;i++){
    const a = Math.random() * TAU;
    const r = rnd(290, 400);
    const x = G.p.x + Math.cos(a) * r;
    const y = G.p.y + Math.sin(a) * r * .9;
    if(x > 46 && x < ARENA.w - 46 && y > 50 && y < ARENA.h - 46 && open(x,y)) return { x:x, y:y };
  }
  let fallback, far = -1;
  for(let y=48;y<ARENA.h-46;y+=64){
    for(let x=48;x<ARENA.w-46;x+=64){
      const dd=d2(x,y,G.p.x,G.p.y);
      if(dd>far && open(x,y)){ fallback={x,y}; far=dd; }
    }
  }
  return fallback || FieldMaps.safePoint(ARENA.w/2,ARENA.h/2,22);
}

/* ── 死亡痕迹：在装饰附近留下的短暂地面记忆 ──
   冰面碎冰 / 熔岩焦痕 / 霓虹湿地溅射 / 废土浮土 / 虚空蚀痕。
   上限 40 条，1.4–2.6 秒自然消退，随实体一起被 Y 轴排序压在脚下。 */
function addScar(x, y){
  const st = G.stage;
  /* 只在"有装饰的地方"留痕：靠近固体道具 / 角落区域 / 地标 */
  let near = false;
  for(let i=0;i<G.props.length;i++){
    const pr = G.props[i];
    const rr = pr.r + (pr.lm ? 120 : 62);
    if(d2(x, y, pr.x, pr.y) < rr * rr){ near = true; break; }
  }
  if(!near && GROUND.cornerness(x, y) > .30) near = true;
  if(!near) return;
  if(Math.random() > .82) return;      // 不是每次死亡都留痕，避免地面糊成一片
  if(G.scars.length > 40) G.scars.shift();
  G.scars.push({
    x:x, y:y,
    life: 1.4 + Math.random() * 1.2,
    max: 2.6,
    r: 8 + Math.random() * 9,
    seed: Math.random() * 100,
    st: st
  });
}

function updateScars(dt){
  for(let i=G.scars.length-1;i>=0;i--){
    const s = G.scars[i];
    s.life -= dt;
    if(s.life <= 0) G.scars.splice(i, 1);
  }
}

function drawScars(){
  if(!G.scars.length) return;
  for(let i=0;i<G.scars.length;i++){
    const s = G.scars[i];
    const k = clamp(s.life / s.max, 0, 1);
    const a = k * k;                      // 后段快速消散
    const sx = SX(s.x), sy = SY(s.y);
    if(sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const R = s.seed;
    if(s.st === 2){
      /* 冰封矿场：碎冰飞散 + 深色冰痕 */
      ctx.globalAlpha = a * .42;
      ctx.fillStyle = '#0b1f2a';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * KZ, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .78;
      ctx.fillStyle = '#e2f9ff';
      for(let n=0;n<5;n++){
        const ang = R + n * 1.7;
        const d = s.r * (.5 + (n % 3) * .32);
        ctx.fillRect(sx + Math.cos(ang) * d, sy + Math.sin(ang) * d * KZ, 2, 2);
      }
    } else if(s.st === 3){
      /* 熔岩工厂：焦痕 + 残余火星 */
      ctx.globalAlpha = a * .56;
      ctx.fillStyle = '#140804';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r * 1.2, s.r * .72, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .80;
      ctx.fillStyle = '#ff9a4a';
      for(let n=0;n<4;n++){
        const ang = R + n * 2.1;
        ctx.fillRect(sx + Math.cos(ang) * s.r * .6, sy + Math.sin(ang) * s.r * .4, 3, 2);
      }
      /* 冷却中的暖边：一圈极淡的橙，和纯阴影区分开 */
      ctx.globalAlpha = a * .16;
      ctx.strokeStyle = '#ff7a3c';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r * 1.2, s.r * .72, 0, 0, TAU); ctx.stroke();
    } else if(s.st === 1){
      /* 霓虹雨夜：湿地溅射 + 极淡反光 */
      ctx.globalAlpha = a * .34;
      ctx.fillStyle = '#050a14';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r * 1.1, s.r * .6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .22;
      ctx.fillStyle = '#57e0ff';
      ctx.fillRect(sx - s.r * .3, sy - 1, 2, 2);
      ctx.fillStyle = '#ff5ab4';
      ctx.fillRect(sx + s.r * .25, sy + 1, 2, 1);
    } else if(s.st === 4){
      /* 虚空核心：蚀痕 + 紫色残点 */
      ctx.globalAlpha = a * .44;
      ctx.fillStyle = '#150a24';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * .64, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .40;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r * .8, s.r * .8 * KZ, 0, 0, TAU); ctx.stroke();
    } else {
      /* 落日废土：浮土坑 + 碎屑 */
      ctx.globalAlpha = a * .36;
      ctx.fillStyle = '#2a1d13';
      ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * KZ, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .30;
      ctx.fillStyle = '#c8a97c';
      for(let n=0;n<4;n++){
        const ang = R + n * 1.5;
        ctx.fillRect(sx + Math.cos(ang) * s.r * .7, sy + Math.sin(ang) * s.r * .45, 2, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function updateEnemies(dt){
  const p = G.p;
  for(let i=G.enemies.length-1;i>=0;i--){
    const e = G.enemies[i];
    if(e.dead){
      EnemyEffects.observe(e);
      e.deadT += dt;
      if(e.deadT > .58) G.enemies.splice(i, 1);
      continue;
    }
    if(e.spawnT > 0){ e.spawnT -= dt; continue; }

    if(e.flash > 0) e.flash -= dt;
    if(e.slowT > 0) e.slowT -= dt;
    if(e.stun > 0) e.stun -= dt;
    if(e.burnT > 0){
      const emberSeed=WeaponLinks.tickBurn(e,dt);
      if(Math.random() < dt * 8){
        G.parts.push({ x:e.x + rnd(-5,5), y:e.y - rnd(2,14), vx:rnd(-10,10), vy:-rnd(20,50),
          life:.4, max:.4, col: e.venom ? '#a8e05a' : '#ff8f5c', r:1.5 });
      }
      if(e.hp <= 0){ killEnemy(e,true,emberSeed); continue; }
    }

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.max(.001, Math.hypot(dx, dy));
    const ux = dx / d, uy = dy / d;
    e.face = ux >= 0 ? 1 : -1;
    if(updateEliteVariant(e, dt, d)){
      EnemyEffects.observe(e);
      continue;
    }
    const tactic = EnemyTactics.motion(e,dt,d);
    EnemyEffects.observe(e);

    let sp = e.spd * SectorClimate.frostFactor(e);
    if(e.slowT > 0) sp *= (1 - e.slowAmt);
    if(e.stun > 0) sp = 0;

    let mx = 0, my = 0;
    if(tactic?.stop){
      sp = 0;
      e.vx = e.vy = 0;
    } else if(tactic){
      const dx = tactic.x - e.x, dy = tactic.y - e.y;
      const distance = Math.max(.01,Math.hypot(dx,dy));
      if(distance > tactic.keep){
        mx = dx / distance;
        my = dy / distance;
      }
    } else if(e.shoot > 0){
      const want = e.beam ? 250 : 175;
      if(d > want + 30){ mx = ux; my = uy; }
      else if(d < want - 30){ mx = -ux; my = -uy; }
      else {
        // 侧向绕行
        mx = -uy * .8; my = ux * .8;
      }
      e.shootT -= dt;
      if(e.shootT <= 0 && d < 340 && !(e.stun > 0) && FieldMaps.lineOpen(e.x,e.y,p.x,p.y)){
        e.shootT = e.shoot * rnd(.85, 1.2);
        enemyShoot(e, ux, uy);
      }
    } else {
      mx = ux; my = uy;
      if(e.fly){
        e.wob += dt * 2.6;
        mx += Math.cos(e.wob) * .35;
        my += Math.sin(e.wob) * .35;
      }
    }

    if(e.kind === 'bomber' && d < 52){
      // 自爆虫加速冲刺
      sp *= 1.55;
    }
    const heading = tactic?.stop ? null : FieldMaps.chase(e);
    if(heading){ mx = heading.x; my = heading.y; }

    e.vx = lerp(e.vx, mx * sp, 1 - Math.pow(.0015, dt));
    e.vy = lerp(e.vy, my * sp, 1 - Math.pow(.0015, dt));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = clamp(e.x, 22, ARENA.w - 22);
    e.y = clamp(e.y, 30, ARENA.h - 24);
    e.anim += dt * (2 + sp * .06);

    // 与其他敌人分离
    for(let j=i-1;j>=0;j--){
      const o = G.enemies[j];
      if(o.dead || o.spawnT > 0) continue;
      const rr = e.r + o.r;
      const dd = d2(e.x, e.y, o.x, o.y);
      if(dd < rr * rr && dd > .01){
        const dl = Math.sqrt(dd);
        const push = (rr - dl) * .5;
        const nx = (e.x - o.x) / dl, ny = (e.y - o.y) / dl;
        e.x += nx * push; e.y += ny * push;
        o.x -= nx * push; o.y -= ny * push;
      }
    }

    if(!e.fly) FieldMaps.clearRails(e,e.r);
    // 接触伤害
    if(d < e.r + playerRadius(9)){
      if(G.st.thorns > 0){
        applyDamage(e, G.st.thorns, false, e.x, e.y - 8);
      }
      hurtPlayer(e.dmg);
    }
  }
}

function enemyShoot(e, ux, uy){
  const spd = e.beam ? 400 : 175;
  const base = Math.atan2(uy, ux);
  const n = e.beam ? 1 : (e.kind === 'caster' ? 3 : 1);
  const fxKind = EnemyEffects.shotKind(e);
  for(let i=0;i<n;i++){
    const a = base + (n > 1 ? (i - 1) * .16 : rnd(-.06, .06));
    const x = e.x + Math.cos(a)*8, y = e.y + Math.sin(a)*8;
    if(i === (n>>1)) EnemyEffects.burst(fxKind,x,y,a);
    G.eb.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg: e.dmg, r: e.beam ? 2.2 : 3.4, life: 3.2,
      col:EnemyEffects.color(fxKind), fxKind, owner:'enemy'
    });
  }
  SFX.shoot();
}

/* ── 技能：伴随单位 ── */
function syncCompanions(dt){
  const p = G.p, s = G.st;

  // 环绕机炮
  while(G.drones.length < s.drone){
    G.drones.push({ cd: rnd(0, .5), flash:0 });
  }
  while(G.drones.length > s.drone) G.drones.pop();
  const dn = G.drones.length;
  for(let i=0;i<dn;i++){
    const d = G.drones[i];
    const a = G.t * 1.25 + i * TAU / Math.max(1, dn);
    d.x = p.x + Math.cos(a) * 33;
    d.y = p.y + Math.sin(a) * 30;
    if(d.flash > 0) d.flash -= dt;
    d.cd -= dt;
    if(d.cd <= 0){
      const t = nearestEnemy(d.x, d.y, 250);
      if(t){
        const ang = Math.atan2(t.y - d.y, t.x - d.x);
        G.bullets.push({
          x:d.x, y:d.y, vx:Math.cos(ang) * 460, vy:Math.sin(ang) * 460,
          dmg: s.dmg * .55 * s.deployPower, pierce:s.deployPierce, hits: [], life: .9,
          crit: Math.random() < s.crit, r: 2.2
        });
        d.cd = .66 * s.deployCooldown; d.flash = .08;
      } else d.cd = .2;
    }
  }

  // 哨戒炮
  if(s.turret > 0){
    G.turretT = (G.turretT || 0) - dt;
    if(G.turretT <= 0){
      G.turretT = 7;
      for(let i=0;i<s.turret;i++){
        G.turrets.push({ x:p.x + rnd(-24,24), y:p.y + rnd(-18,18), life: 11, cd:.3, flash:0, ang:-Math.PI/2 });
      }
      G.rings.push({ x:p.x, y:p.y, r:4, max:30, life:.3, maxLife:.3, col:'#ffe0a0', w:2 });
    }
  }
  for(let i=G.turrets.length-1;i>=0;i--){
    const tu = G.turrets[i];
    tu.life -= dt; tu.cd -= dt;
    if(tu.flash > 0) tu.flash -= dt;
    if(tu.life <= 0){ G.turrets.splice(i,1); continue; }
    if(tu.cd <= 0){
      const t = nearestEnemy(tu.x, tu.y, 290);
      if(t){
        const ang = Math.atan2(t.y - tu.y, t.x - tu.x);
        tu.ang = ang;
        G.bullets.push({
          x:tu.x, y:tu.y, vx:Math.cos(ang) * 440, vy:Math.sin(ang) * 440,
          dmg: s.dmg * .75 * s.deployPower, pierce:s.deployPierce, hits: [], life: 1,
          crit: Math.random() < s.crit, r: 2.4
        });
        tu.cd = .5 * s.deployCooldown; tu.flash = .08;
      } else tu.cd = .15;
    }
  }

  // 地雷
  if(s.mine > 0){
    G.mineT = (G.mineT || 0) - dt;
    if(G.mineT <= 0){
      G.mineT = 2.4;
      for(let i=0;i<s.mine;i++){
        if(G.mines.length > 12) break;
        G.mines.push({ x:p.x + rnd(-26,26), y:p.y + rnd(-20,20), t:0, arm:.5, dmg: s.dmg * 2.6 + 8 * s.mine });
      }
    }
  }
  for(let i=G.mines.length-1;i>=0;i--){
    const m = G.mines[i];
    m.t += dt; m.arm -= dt;
    if(m.arm <= 0){
      let hit = false;
      for(let j=0;j<G.enemies.length;j++){
        const e = G.enemies[j];
        if(!e.dead && d2(m.x, m.y, e.x, e.y) < (e.r + 14) * (e.r + 14)){ hit = true; break; }
      }
      if(G.boss && !G.boss.dead && d2(m.x, m.y, G.boss.x, G.boss.y) < (G.boss.r + 14) * (G.boss.r + 14)) hit = true;
      if(hit){
        aoe(m.x, m.y, 52, m.dmg);
        explodeFX(m.x, m.y, 52);
        G.mines.splice(i, 1);
        continue;
      }
    }
    if(m.t > 22) G.mines.splice(i, 1);
  }

  // 回旋刃
  if(s.boom > 0){
    G.bladeT = (G.bladeT || 0) - dt;
    if(G.bladeT <= 0){
      G.bladeT = 1.9;
      const t = nearestEnemy(p.x, p.y, 300);
      const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.face > 0 ? 0 : Math.PI);
      for(let i=0;i<s.boom;i++){
        const a = base + (i - (s.boom - 1) / 2) * .5;
        G.booms.push({
          x:p.x, y:p.y, a:a, dist:0, out:1, spin:0,
          dmg: s.dmg * 1.1, hits:[], life: 2.4
        });
      }
    }
  }
  for(let i=G.booms.length-1;i>=0;i--){
    const b = G.booms[i];
    b.life -= dt; b.spin += dt * 16;
    if(b.out > 0){
      b.dist += 380 * dt;
      if(b.dist > 190) b.out = -1;
    } else {
      b.dist -= 330 * dt;
    }
    b.x = p.x + Math.cos(b.a) * b.dist;
    b.y = p.y + Math.sin(b.a) * b.dist;
    for(let j=0;j<G.enemies.length;j++){
      const e = G.enemies[j];
      if(e.dead || b.hits.indexOf(e) >= 0) continue;
      if(d2(b.x, b.y, e.x, e.y) < (e.r + 10) * (e.r + 10)){
        b.hits.push(e);
        applyDamage(e, b.dmg, false, e.x, e.y);
      }
    }
    if(G.boss && !G.boss.dead && b.hits.indexOf(G.boss) < 0 &&
       d2(b.x, b.y, G.boss.x, G.boss.y) < (G.boss.r + 10) * (G.boss.r + 10)){
      b.hits.push(G.boss);
      damageBoss(G.boss, b.dmg, false, b.x, b.y);
    }
    if(b.life <= 0) G.booms.splice(i, 1);
  }
}

/* ── 危险区域 ── */
function updateHazards(dt){
  const p = G.p;
  for(let i=G.haz.length-1;i>=0;i--){
    const h = G.haz[i];
    const elapsed = h.born === G.t ? 0 : dt;
    h.t = (h.t || 0) + elapsed;
    h.life -= elapsed;
    if(h.kind === 'pool'){
      if(h.t >= h.arm && d2(p.x, p.y, h.x, h.y) <= (h.r + playerRadius()) ** 2) hurtPlayer(h.dmg);
    } else if(h.kind === 'frost'){
      for(let j = 0; j < G.enemies.length; j++){
        const e = G.enemies[j];
        if(e.dead) continue;
        if(d2(e.x, e.y, h.x, h.y) < (h.r + e.r) * (h.r + e.r)){
          e.slowT = Math.max(e.slowT || 0, .3);
          e.slowAmt = Math.max(e.slowAmt || 0, .55);
        }
      }
      if(G.boss && !G.boss.dead && d2(G.boss.x, G.boss.y, h.x, h.y) < (h.r + 40) * (h.r + 40)){
        G.boss.slowT = Math.max(G.boss.slowT || 0, .3);
        G.boss.slowAmt = Math.max(G.boss.slowAmt || 0, .45);
      }
    } else if(h.kind === 'beam'){
      advanceEncounterBeam(h, elapsed);
    } else if(h.kind === 'wave'){
      advanceEncounterWave(h, elapsed);
    } else if(h.kind === 'zone'){
      /* 预警区：计时到点才炸，预警本身不造成伤害 */
      if(h.life <= 0 && !h.boom){
        h.boom = true;
        resolveGroundBlast(h.x, h.y, h.r, h.dmg, h.bossFx);
      }
    }
    if(h.life <= 0) G.haz.splice(i, 1);
  }
}

/* ── Boss ── */
const BOSSES = {
  crusher: { n:'碾压者', t:'重型攻城坦克', hp:2600, r:34, h:56, spd:78, dmg:30, col:'#8b97ab' },
  hive:    { n:'蜂后', t:'无人机母舰', hp:4000, r:36, h:48, spd:96, dmg:24, col:'#4f8ba8' },
  frost:   { n:'霜牙', t:'冰原掠夺兽', hp:5800, r:32, h:50, spd:110, dmg:27, col:'#86b6c8' },
  molten:  { n:'熔心', t:'熔炉机兵', hp:8200, r:36, h:58, spd:86, dmg:33, col:'#7a4038' },
  void:    { n:'虚空之眼', t:'终焉观察者', hp:11500, r:34, h:54, spd:100, dmg:30, col:'#6d4a94' },
  ...GUARD_BOSSES
};

function updateBoss(dt){
  const b = G.boss;
  if(!b) return;
  if(b.dead){
    b.deadT += dt;
    return;
  }
  b.t += dt;
  if(b.flash > 0) b.flash -= dt;
  if(b.slowT > 0) b.slowT -= dt;
  if(b.stun > 0){ b.stun -= dt; return; }
  if(b.burnT > 0){
    WeaponLinks.tickBurn(b,dt);
    if(Math.random() < dt * 10){
      G.parts.push({ x:b.x + rnd(-18,18), y:b.y - rnd(0,22), vx:rnd(-8,8), vy:-rnd(15,40),
        life:.45, max:.45, col: b.venom ? '#a8e05a' : '#ff8f5c', r:2 });
    }
    if(b.hp <= 0 && !b.dead){ bossDown(b); return; }
  }

  const p = G.p;
  const toP = Math.atan2(p.y - b.y, p.x - b.x);
  b.face = p.x >= b.x ? 1 : -1;

  /* 阶段检测（血量阈值 / 时间阈值） */
  const ph = updateBossPhases(b, dt) || {};

  if(!b.act){
    b.atkCd -= dt;
    const d = dst(b.x, b.y, p.x, p.y);
    let mx = 0, my = 0;
    /* 机动模式由当前阶段决定 */
    const mode = ph.move || ((b.kind === 'hive' || b.kind === 'void') ? 'orbit' : 'normal');
    b.orbit += dt * 1.6;
    if(mode === 'orbit'){
      const want = ph.keep || 200;
      const dir = d > want ? 1 : -1;
      mx = Math.cos(toP) * dir * .9 + Math.cos(toP + Math.PI/2) * .7 * Math.sin(b.orbit);
      my = Math.sin(toP) * dir * .9 + Math.sin(toP + Math.PI/2) * .7 * Math.sin(b.orbit);
    } else if(mode === 'chase' || mode === 'press'){
      if(mode === 'chase' || d > 68){ mx = Math.cos(toP); my = Math.sin(toP); }
    } else {
      if(d > 110){ mx = Math.cos(toP); my = Math.sin(toP); }
      else if(d < 70){ mx = -Math.cos(toP) * .6; my = -Math.sin(toP) * .6; }
      else { mx = Math.cos(toP + Math.PI/2) * Math.sin(b.orbit); my = Math.sin(toP + Math.PI/2) * Math.sin(b.orbit); }
    }
    const bsp = b.spd * (mode === 'chase' ? .55 : 1) * ((b.slowT || 0) > 0 ? (1 - (b.slowAmt || 0)) : 1);
    b.x += mx * bsp * dt;
    b.y += my * bsp * dt;
    b.x = clamp(b.x, 70, ARENA.w - 70);
    b.y = clamp(b.y, 80, ARENA.h - 70);
    b.rot += dt * .8;

    if(b.atkCd <= 0) startBossAttack(b, ph);
  } else {
    runBossAct(b, dt);
  }

  // 接触伤害
  if(b.act?.kind !== 'charge' && dst(b.x, b.y, p.x, p.y) <= b.r + playerRadius()) hurtPlayer(b.dmg * .8);
}

/* ══════════ Boss 三阶段 ══════════
   hp = 血量比例阈值（降到该值以下进入本阶段）
   t  = 时间阈值（开打后多少秒强制进入本阶段，保底不卡阶段）
   其余字段：
     acts  该阶段可用的攻击组（轮转抽取）
     cdMul 攻击间隔倍率
     move  机动模式 orbit / chase / normal
     ai:'crusher' 走碾压者专属脚本（冲锋 / 追击 + 延迟爆炸） */
const BOSS_PHASES = {
  crusher: { ai:'crusher', phases:[
    { hpThreshold:1.00, timeThreshold:0,  nm:'碾压冲锋', msg:'每 3 秒一次定向冲撞', every:3.0, dist:1.0, side:3 },
    { hpThreshold:0.60, timeThreshold:25, nm:'狂暴突进', msg:'冲撞更频繁，撞后原地旋转弹幕', every:2.0, dist:.7, side:3, afterRing:8 },
    { hpThreshold:0.30, timeThreshold:40, nm:'绝境碾压', msg:'不再冲撞 · 延迟爆炸圈', ai2:'chase', move:'chase', every:1.5, zone:46 }
  ]},

  hive: { phases:[
    { hpThreshold:1.00, timeThreshold:0,  nm:'蜂群压制', msg:'无人机与追踪弹', acts:['spawnDrones','orbs','sweep'], cdMul:1, move:'orbit', keep:200 },
    { hpThreshold:0.60, timeThreshold:22, nm:'空袭矩阵', msg:'加入全向弹幕', acts:['spawnDrones','orbs','sweep','radialBurst'], cdMul:.85, move:'orbit', keep:230 },
    { hpThreshold:0.30, timeThreshold:38, nm:'母巢暴走', msg:'弹幕覆盖全场', acts:['radialBurst','sweepSpin','orbs','spawnDrones'], cdMul:.68, move:'orbit', keep:250,
      onEnter:function(b){ bossSummon(['drone'], 6); },
      update:function(b, dt){ if(Math.floor(b.phT / 6) !== Math.floor((b.phT - dt) / 6)) bossSummon(['drone'], 2); } }
  ]},

  frost: { phases:[
    { hpThreshold:1.00, timeThreshold:0,  nm:'霜牙突袭', msg:'冰棱环射 + 冲撞', acts:['shards','charge','summonCaster'], cdMul:1 },
    { hpThreshold:0.60, timeThreshold:22, nm:'冰环爆发', msg:'寒霜池蔓延', acts:['shards','nova','charge','radialBurst'], cdMul:.85,
      onEnter:function(b){ frostField(b, 3); } },
    { hpThreshold:0.30, timeThreshold:40, nm:'永冻猎场', msg:'整片战场结霜', acts:['nova','shards','charge','sweepSpin'], cdMul:.70,
      onEnter:function(b){ frostField(b, 6); } }
  ]},

  molten: { phases:[
    { hpThreshold:1.00, timeThreshold:0,  nm:'熔渣喷吐', msg:'火池与火舌', acts:['flame','pools','summonBomber'], cdMul:1 },
    { hpThreshold:0.60, timeThreshold:24, nm:'火池蔓延', msg:'环形火焰 + 火池', acts:['pools','fireRing','flame','radialBurst'], cdMul:.85,
      onEnter:function(b){ lavaField(b, 3); } },
    { hpThreshold:0.30, timeThreshold:42, nm:'熔炉过载', msg:'地面全面燃烧', acts:['fireRing','pools','sweepSpin','radialBurst'], cdMul:.70,
      onEnter:function(b){ lavaField(b, 6); },
      update:function(b, dt){
        /* 每 3.5 秒在玩家脚下留一块火池 */
        if(Math.floor(b.phT / 3.5) !== Math.floor((b.phT - dt) / 3.5)){
          addPool(G.p.x, G.p.y, 42, 12, 4.5, 'rgba(255,120,50,.55)', b.kind);
        }
      } }
  ]},

  void: { phases:[
    { hpThreshold:1.00, timeThreshold:0,  nm:'螺旋凝视', msg:'螺旋弹幕 + 追踪球', acts:['spiral','voidOrbs','teleBeam'], cdMul:1, move:'orbit', keep:210 },
    { hpThreshold:0.60, timeThreshold:24, nm:'虚空裂隙', msg:'瞬移射线', acts:['teleBeam','voidOrbs','spiral','radialBurst'], cdMul:.85, move:'orbit', keep:240 },
    { hpThreshold:0.30, timeThreshold:42, nm:'终焉降临', msg:'全屏弹幕', acts:['sweepSpin','voidOrbs','teleBeam','radialBurst'], cdMul:.66, move:'orbit', keep:260,
      onEnter:function(b){ voidField(b, 5); } }
  ]},
  ...GUARD_PHASES
};

/* 阶段进入的场地效果 */
function frostField(b, n){
  for(let i=0;i<n;i++){
    const a = rnd(0, TAU), r = rnd(60, 170);
    addPool(clamp(G.p.x + Math.cos(a) * r, 50, ARENA.w - 50),
            clamp(G.p.y + Math.sin(a) * r, 50, ARENA.h - 50),
            44, 11, 5.5, 'rgba(150,230,255,.55)', b.kind);
  }
  G.rings.push({ x:b.x, y:b.y, r:10, max:220, life:.6, maxLife:.6, col:'#9fe8ff', w:3 });
}
function lavaField(b, n){
  for(let i=0;i<n;i++){
    const a = rnd(0, TAU), r = rnd(60, 180);
    addPool(clamp(G.p.x + Math.cos(a) * r, 50, ARENA.w - 50),
            clamp(G.p.y + Math.sin(a) * r, 50, ARENA.h - 50),
            46, 13, 6, 'rgba(255,120,50,.55)', b.kind);
  }
  G.rings.push({ x:b.x, y:b.y, r:10, max:220, life:.6, maxLife:.6, col:'#ff8a3c', w:3 });
}
function voidField(b, n){
  for(let i=0;i<n;i++){
    const a = rnd(0, TAU), r = rnd(70, 190);
    addZone(clamp(G.p.x + Math.cos(a) * r, 50, ARENA.w - 50),
            clamp(G.p.y + Math.sin(a) * r, 50, ARENA.h - 50), 50, b.dmg * .9, rnd(.9, 1.4), b.kind);
  }
}

/* 阶段检测与切换 */
function updateBossPhases(b, dt){
  const def = BOSS_PHASES[b.kind];
  if(!def) return null;
  b.fightT = (b.fightT || 0) + dt;
  if(b.phFlash > 0) b.phFlash -= dt;
  const frac = b.hp / b.maxHp;
  const next = def.phases[b.ph + 1];
  if(b.phT >= 3 && next && (frac <= next.hpThreshold || b.fightT >= next.timeThreshold)){
    const ni = ++b.ph;
    b.phase = ni + 1;
    b.phT = 0;
    b.phFlash = 1.2;
    b.idx = 0;
    if(b.act && !b.act.fired) b.act = null;
    b.atkCd = 1.05;
    const ph = def.phases[ni];
    banner(b.name + ' · ' + ph.nm, ph.msg || '', 1.15);
    G.shake = Math.max(G.shake, 9);
    G.rings.push({ x:b.x, y:b.y, r:8, max:190, life:.6, maxLife:.6, col:'#ff5c5c', w:4 });
    addFlash(b.x, b.y, 190, '#ff8a6a', .55);
    if(ph.onEnter) ph.onEnter(b);
    SFX.boss();
  }
  /* 阶段内的持续行为（可选） */
  b.phT = (b.phT || 0) + dt;
  const cur = def.phases[b.ph || 0];
  if(cur && cur.update) cur.update(b, dt, cur);
  return cur;
}

/* 阶段化出手：碾压者走专属脚本，其余按阶段攻击组轮转 */
function startBossAttack(b, ph){
  const def = BOSS_PHASES[b.kind];
  if(def && def.ai === 'crusher'){ crusherAttack(b, ph || def.phases[0]); return; }
  const pool = (ph && ph.acts) || BOSS_ACT[b.kind];
  const action = pool[b.idx % pool.length];
  const fn = ACT_FN[action];
  b.idx++;
  b.act = fn ? fn(b) : null;
  if(!b.act){ b.atkCd = 1; return; }
  b.act.visual = action;
  if(ph && ph.cdMul) b.act.cd = (b.act.cd || 1.3) * ph.cdMul;
}

/* ── 碾压者专属阶段脚本 ── */
function crusherAttack(b, ph){
  if(ph.ai2 === 'chase'){
    /* 阶段三：不再冲撞，改为在玩家当前位置生成延迟爆炸圈 */
    addZone(G.p.x, G.p.y, ph.zone || 46, b.dmg * .85, 1.0, b.kind);
    b.muzzleAt = G.t;
    b.muzzleAng = Math.atan2(G.p.y - b.y, G.p.x - b.x);
    b.muzzleStyle = 'vent';
    SFX.heavy();
    b.ventAt = b.t;
    b.atkCd = ph.every || 1.5;
    return;
  }
  b.act = phaseCharge(b, ph);
  b.act.visual = 'charge';
}

function phaseCharge(b, ph){
  return makeBossCharge(b, {
    wind:ph.afterRing ? .82 : .92, dur:.56, cd:ph.every || 1.5,
    len:252 * (ph.dist || 1), col:'#ff816d', side:ph.side, afterRing:ph.afterRing
  });
}

function runBossAct(b, dt){
  const a = b.act;
  a.t = (a.t || 0) + dt;   // 攻击对象不保证带 t 字段，这里兜底初始化
  if(!a.fired && a.t >= a.wind){
    a.fired = true;
    if(a.fire) a.fire(b);
  }
  if(a.tick) a.tick(b, a, dt);
  if(a.t >= a.wind + a.dur){
    b.act = null;
    if(a.end) a.end(b);
    b.atkCd = Math.max(b.atkCd, a.cd || 1.3);
  }
}

/* 攻击原语 */
function ebShoot(x, y, ang, spd, dmg, col, r, opt){
  opt = opt || {};
  const boss = G.boss;
  if(boss && boss.muzzleAt !== G.t){
    boss.muzzleAt = G.t;
    boss.muzzleAng = ang;
    boss.muzzleStyle = null;
  }
  G.eb.push({
    owner:'boss', kind:boss?.kind,
    x:x, y:y, vx:Math.cos(ang) * spd, vy:Math.sin(ang) * spd,
    dmg:dmg, r: r || 3.4, col: col || '#ff8a6a',
    life: opt.life || 3.6, homing: !!opt.homing,
    spin:0
  });
}
function ebRing(x, y, n, spd, dmg, col, r, off){
  for(let i=0;i<n;i++){
    const a = (off || 0) + i / n * TAU;
    ebShoot(x, y, a, spd, dmg, col, r);
  }
}
function ebAim(x, y, ang, count, spread, spd, dmg, col, r){
  for(let i=0;i<count;i++){
    const a = ang + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
    ebShoot(x, y, a, spd, dmg, col, r);
  }
}
function bossSummon(kinds, n){
  const b = G.boss;
  const count = Math.min(n, partnerSlots(b, b.kind === 'hive' ? 6 : 4));
  for(let i=0;i<count;i++){
    const a = rnd(0, TAU), r = rnd(70, 130);
    const x = clamp(b.x + Math.cos(a) * r, 50, ARENA.w - 50);
    const y = clamp(b.y + Math.sin(a) * r, 60, ARENA.h - 50);
    spawnEnemy(pick(kinds), x, y, { noElite:true }).summoner = b;
    BossEffects.emit(b.kind, 'launch', x, y, 17);
  }
}
function addPool(x, y, r, dmg, life, col, bossFx){
  const arm = .86;
  G.haz.push({ kind:'pool', x:x, y:y, r:r, dmg:dmg, life:life + arm, max:life + arm, col:col, arm:arm, t:0, bossFx });
}
function addBeam(x, y, ang, len, wide, dmg, life, rot, col, bossFx){
  G.haz.push({ kind:'beam', x:x, y:y, ang:ang, len:len, wide:wide, dmg:dmg,
    life:life, max:life, rot:rot || 0, col:col, t:0, born:G.t, bossFx });
}
function addWave(x, y, maxR, dmg, col, bossFx){
  G.haz.push({ kind:'wave', x:x, y:y, r:4, maxR:maxR, dmg:dmg, life:.75, max:.75, col:col, hit:false, t:0, born:G.t, bossFx });
}
/* 延迟爆炸的圆形预警区：delay 秒后炸开（先给玩家 1 秒反应） */
function addZone(x, y, r, dmg, delay, bossFx){
  const d = delay || 1.0;
  G.haz.push({ kind:'zone', x:x, y:y, r:r, dmg:dmg, life:d, max:d, col:'#ff3c3c', t:0, boom:false, bossFx });
}

/* 每个 Boss 的攻击组 */
const BOSS_ACT = {
  crusher: ['charge', 'shells', 'slam', 'radialBurst', 'sweepSpin'],
  hive:    ['spawnDrones', 'sweep', 'orbs', 'radialBurst', 'sweepSpin'],
  frost:   ['shards', 'charge', 'summonCaster', 'nova', 'radialBurst', 'sweepSpin'],
  molten:  ['pools', 'fireRing', 'summonBomber', 'flame', 'radialBurst', 'sweepSpin'],
  void:    ['spiral', 'teleBeam', 'voidOrbs', 'summonMix', 'radialBurst', 'sweepSpin'],
  ...GUARD_ACTIONS
};

const ACT_FN = {
  /* 冲锋（所有地面 Boss 共用） */
  charge: function(b){
    return makeBossCharge(b, { wind:.92, dur:.60, cd:1.5, len:235, col:'#a6eaff' });
  },

  shell: function(b){
    return {
      wind:.55, dur:.42, cd:1.2, fired:false,
      fire: function(){
        const ang = Math.atan2(G.p.y - b.y, G.p.x - b.x);
        ebAim(b.x, b.y, ang, 3, .16, 250, 12, '#ffb060', 5);
        G.shake = 4;
        SFX.heavy();
      }
    };
  },

  shells: function(b){
    let n = 0;
    return {
      wind:.5, dur:1.1, cd:1.5, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .18 && n < 5){
          a._acc = 0; n++;
          const ang = Math.atan2(G.p.y - b2.y, G.p.x - b2.x) + rnd(-.12, .12);
          ebAim(b2.x, b2.y + 4, ang, 3, .13, 260, 11, '#ffb060', 5);
          SFX.shoot();
        }
      }
    };
  },

  slam: function(b){
    return {
      wind:.75, dur:.6, cd:1.6, fired:false,
      fire: function(){
        addWave(b.x, b.y, 240, 18, 'rgba(255,150,90,.9)', b.kind);
        addWave(b.x, b.y, 150, 14, 'rgba(255,200,140,.9)', b.kind);
        G.shake = 13;
        SFX.boom();
      }
    };
  },

  spawnDrones: function(b){
    return {
      wind:.7, dur:.35, cd:2.1, fired:false,
      fire: function(){
        bossSummon(['drone'], 4);
      }
    };
  },

  sweep: function(b){
    const a0 = Math.atan2(G.p.y - b.y, G.p.x - b.x);
    return makeBossLaser(b, .96, 1.7, [
      { x:b.x, y:b.y, ang:a0 - .85, len:900, wide:13, dmg:16, life:1.7, rot:1.02, col:'#69e8ff' }
    ]);
  },

  orbs: function(b){
    return {
      wind:.6, dur:.5, cd:1.6, fired:false,
      fire: function(){
        for(let i=0;i<5;i++){
          const a = Math.atan2(G.p.y - b.y, G.p.x - b.x) + (i - 2) * .3;
          ebShoot(b.x, b.y, a, 140, 14, '#9fd8ff', 5, { homing:true, life:5 });
        }
        SFX.shoot();
      }
    };
  },

  shards: function(b){
    let n = 0;
    return {
      wind:.7, dur:1.3, cd:1.5, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .28 && n < 3){
          a._acc = 0; n++;
          ebRing(b2.x, b2.y, 12, 175, 12, '#9fe8ff', 4, n * .26);
          SFX.shoot();
        }
      }
    };
  },

  nova: function(b){
    return {
      wind:.6, dur:.4, cd:1.5, fired:false,
      fire: function(){
        addPool(G.p.x, G.p.y, 52, 12, 4, 'rgba(150,230,255,.5)', b.kind);
        addPool(b.x, b.y, 46, 12, 3.2, 'rgba(150,230,255,.5)', b.kind);
        G.shake = 6;
        SFX.boom();
      }
    };
  },

  summonCaster: function(b){
    return {
      wind:.8, dur:.3, cd:2.2, fired:false,
      fire: function(){ bossSummon(['caster'], 3); }
    };
  },

  pools: function(b){
    return {
      wind:.55, dur:.6, cd:1.6, fired:false,
      fire: function(){
        for(let i=0;i<4;i++){
          const x = clamp(G.p.x + rnd(-90, 90), 50, ARENA.w - 50);
          const y = clamp(G.p.y + rnd(-70, 70), 50, ARENA.h - 50);
          addPool(x, y, 40, 11, 4.5, 'rgba(255,120,50,.55)', b.kind);
        }
        SFX.boom();
      }
    };
  },

  fireRing: function(b){
    let n = 0;
    return {
      wind:.6, dur:.9, cd:1.5, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .3 && n < 3){
          a._acc = 0; n++;
          ebRing(b2.x, b2.y, 16, 190, 13, '#ff8a3c', 4, n * .2);
          SFX.shoot();
        }
      }
    };
  },

  summonBomber: function(b){
    return {
      wind:.7, dur:.3, cd:2.0, fired:false,
      fire: function(){ bossSummon(['bomber'], 4); }
    };
  },

  flame: function(b){
    return {
      wind:.65, dur:.8, cd:1.4, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .1){
          a._acc = 0;
          const ang = Math.atan2(G.p.y - b2.y, G.p.x - b2.x) + rnd(-.34, .34);
          ebShoot(b2.x, b2.y, ang, rnd(190, 260), 10, '#ff9a3c', 4.5);
        }
      }
    };
  },

  spiral: function(b){
    let acc = 0, arm = 0;
    return {
      wind:.6, dur:2.0, cd:1.5, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .09){
          a._acc = 0;
          arm += .5;
          for(let k=0;k<3;k++){
            ebShoot(b2.x, b2.y, arm + k * TAU / 3, 190, 12, '#c77dff', 4);
          }
        }
      }
    };
  },

  teleBeam: function(b){
    const angle = rnd(0, TAU);
    const oldX = b.x, oldY = b.y;
    b.x = clamp(G.p.x + Math.cos(angle) * 170, 80, ARENA.w - 80);
    b.y = clamp(G.p.y + Math.sin(angle) * 170, 90, ARENA.h - 80);
    b.teleportedAt = G.t;
    BossEffects.emit(b.kind, 'rift', oldX, oldY, 26);
    BossEffects.emit(b.kind, 'rift', b.x, b.y, 26);
    const aim = Math.atan2(G.p.y - b.y, G.p.x - b.x);
    return makeBossLaser(b, 1.05, 1.6, [
      { x:b.x, y:b.y, ang:aim, len:900, wide:15, dmg:19, life:.84, rot:0, col:'#d895ff' }
    ]);
  },

  voidOrbs: function(b){
    return {
      wind:.55, dur:.5, cd:1.5, fired:false,
      fire: function(){
        for(let i=0;i<6;i++){
          const a = i / 6 * TAU;
          ebShoot(b.x, b.y, a, 110, 15, '#e0b0ff', 5.5, { homing:true, life:6 });
        }
        SFX.shoot();
      }
    };
  },

  summonMix: function(b){
    return {
      wind:.75, dur:.3, cd:2.2, fired:false,
      fire: function(){ bossSummon(['runner','drone','brute'], 4); }
    };
  },

  /* 全向范围弹幕（范围攻击） */
  radialBurst: function(b){
    let n = 0;
    return {
      wind:.65, dur:1.4, cd:1.5, fired:false,
      tick: function(b2, a, dt){
        if(!a.fired) return;
        a._acc = (a._acc || 0) + dt;
        if(a._acc > .22 && n < 3){
          a._acc = 0; n++;
          ebRing(b2.x, b2.y, 18 + n * 4, 165 + n * 12, 11 + n * 2, '#ff8a6a', 4, n * .3);
          SFX.shoot();
        }
      }
    };
  },

  /* 旋转扫射光束（扫射） */
  sweepSpin: function(b){
    const a0 = rnd(0, TAU);
    return makeBossLaser(b, 1.06, 1.6, [
      { x:b.x, y:b.y, ang:a0, len:920, wide:14, dmg:18, life:2.1, rot:1.14, col:'#ff9972' },
      { x:b.x, y:b.y, ang:a0 + Math.PI, len:920, wide:12, dmg:15, life:1.6, rot:-.94, col:'#ffce94' }
    ]);
  },
  ...GUARD_ATTACKS
};

function bossDown(b){
  if(b.dead || G.boss !== b) return;
  const encounter = G.bossEncounter;
  const guard = encounter?.resumeWave ? MID_BOSSES[G.stage] : null;
  b.dead = true;
  b.deadT = 0;
  G.score += guard ? guard.score : 400 + G.stage * 220;
  if(guard) G.clearedGuards.add(b.kind);
  G.shake = 18;
  G.flash = .7;
  SFX.boom();
  for(let i=0;i<5;i++){
    const x = b.x + rnd(-40, 40), y = b.y + rnd(-30, 30);
    G.jobs.push({ t: .13 + i * .13, fn: function(){ if(G.boss === b) explodeFX(x, y, 70); } });
  }
  G.eb.length = 0;
  G.haz.length = 0;
  G.enemies.length = 0;
  // 首领的集装箱：一批补给
  dropLoot(b.x, b.y, guard ? 2 : 4, true);
  G.jobs.push({ t: .9, fn: function(){
    if(G.phase !== 'boss' || G.bossEncounter !== encounter) return;
    if(guard){
      G.boss = null;
      G.bossEncounter = null;
      G.wave = encounter.resumeWave;
      startWave();
      banner(b.name + ' 已击败', '继续第 ' + G.wave + ' 波', 1.45);
      return;
    }
    G.phase = 'clear';
    CampaignStory.clear(b);
    banner('区域肃清', CampaignStory.approachRoute(), 1.6);
    SFX.portal();
  }});
}

function updatePortal(dt){
  const portal = CampaignStory.visiblePortal();
  if(!portal) return;
  portal.t += dt;
  const inside = d2(G.p.x,G.p.y,portal.x,portal.y) < 34**2;
  if(!inside) portal.mustExit = false;
  else if(!portal.mustExit) nextStage();
}

/* ── 随机事件（每关 10% 概率触发，一关最多一次） ── */
const EVENTS = [
  { n:'军需补给', ic:'▤', c:'#ffd08a', good:true,
    desc:'一支回收队路过：积分 +250，分数 +600，生命 +25。',
    apply:function(){
      grantPoints(250, '积分');
      G.score += 600; heal(25);
    } },
  { n:'军火库突变', ic:'⇄', c:'#8fe3ff', good:false,
    desc:'一股能量乱流扫过，你的武器被随机替换。',
    apply:function(){
      const ids = WEAPONS.map(function(w){ return w.id; });
      const cur = G.weapon;
      let nid = cur;
      for(let k=0;k<20 && nid === cur;k++) nid = pick(ids);
      G.weapon = nid; recalcGun();
      floatText(G.p.x, G.p.y, '武器更换为 ' + WEP().n, '#8fe3ff', true);
    } },
  { n:'辐射风暴', ic:'☢', c:'#a8e05a', good:false,
    desc:'辐射尘袭来，你持续受到轻微灼伤。',
    apply:function(){ G.buff.rad = 8; floatText(G.p.x, G.p.y, '辐射灼伤 8 秒', '#a8e05a', true); } },
  { n:'幸运星', ic:'✧', c:'#ffe58a', good:true,
    desc:'一颗幸运星落在你身边，本局经验获取翻倍。',
    apply:function(){ G.buff.luck = 999; floatText(G.p.x, G.p.y, '经验 +100%', '#ffe58a', true); } },
  { n:'精英狩猎', ic:'☠', c:'#ff7c9c', good:false,
    desc:'精英猎手盯上了你——下一波敌人更强。',
    apply:function(){ G.waveEliteBoost = (G.waveEliteBoost || 0) + 3; floatText(G.p.x, G.p.y, '精英几率上升', '#ff7c9c', true); } },
  { n:'医疗无人机', ic:'✚', c:'#7dffb0', good:true,
    desc:'一架医疗无人机送来急救，回复大量生命。',
    apply:function(){ heal(G.p.maxHp * .5); floatText(G.p.x, G.p.y, '生命 +50%', '#7dffb0', true); } },
  { n:'能量过载', ic:'⚡', c:'#ffb45c', good:true, needsMech:true,
    desc:'能量场异常活跃，机甲能量瞬间充满。',
    apply:function(){
      addEnergy(100);
      floatText(G.p.x,G.p.y,G.mechT > 0 ? '机甲已启动 · 能量不累积' : '能量充满','#ffb45c',true);
    } },
  { n:'弹药克扣', ic:'▼', c:'#ff8a6a', good:false,
    desc:'补给线被切断，你的伤害短暂下降。',
    apply:function(){ G.buff.weak = 8; floatText(G.p.x, G.p.y, '伤害 -35%（8 秒）', '#ff8a6a', true); } },
  { n:'黑市交易', ic:'⌘', c:'#ffe0a0', good:false,
    desc:'神秘商人开价：立刻拿到 500 积分，代价是 20% 生命。',
    apply:function(){
      grantPoints(500, '积分');
      G.p.hp = Math.max(1, G.p.hp - G.p.maxHp * .2);
      G.flash = Math.max(G.flash, .3);
    } },
  { n:'虫群包围', ic:'✺', c:'#ff8a6a', good:false,
    desc:'虫群从四周涌来，但悬赏金高达 400 积分。',
    apply:function(){
      grantPoints(400, '积分');
      for(let i=0;i<12;i++){
        const a = i / 12 * TAU + rnd(-.12, .12), r = rnd(130, 190);
        spawnEnemy(i % 3 === 0 ? 'runner' : 'bomber',
          clamp(G.p.x + Math.cos(a) * r, 40, ARENA.w - 40),
          clamp(G.p.y + Math.sin(a) * r, 50, ARENA.h - 50), { noElite:true });
      }
    } },
  { n:'战术护盾', ic:'⛨', c:'#b9c7ff', good:true,
    desc:'遗弃的力场发生器还能用：获得 3 层护盾。',
    apply:function(){ G.shield += 3; G.shieldFx = .5; floatText(G.p.x, G.p.y, '护盾 +3', '#b9c7ff', true); } },
  { n:'补给空投', ic:'✦', c:'#ffd08a', good:true,
    desc:'物资从天而降，五件战场道具直接落地。',
    apply:function(){
      dropLoot(G.p.x, G.p.y, 5, true);
      floatText(G.p.x, G.p.y, '道具 ×5', '#ffd08a', true);
    } },
  { n:'超载协议', ic:'✷', c:'#8fe3ff', good:true,
    desc:'12 秒射速 +55%，同时磁力大幅增强。',
    apply:function(){ G.buff.over = 12; G.buff.magnet = 12; floatText(G.p.x, G.p.y, '超载 + 磁力 12 秒', '#8fe3ff', true); } },
  { n:'时空气旋', ic:'◷', c:'#c8a0ff', good:false,
    desc:'敌人减速 8 秒，但乱流也会灼伤你 5 秒。',
    apply:function(){ G.buff.stasis = 8; G.buff.rad = 5; floatText(G.p.x, G.p.y, '时滞 8 秒 · 灼伤 5 秒', '#c8a0ff', true); } },
  { n:'诅咒契约', ic:'♆', c:'#c77dff', good:false,
    desc:'签下契约：积分 +800，代价是 12 秒虚弱与更多精英。',
    apply:function(){
      grantPoints(800, '积分');
      G.buff.weak = 12;
      G.waveEliteBoost = (G.waveEliteBoost || 0) + 2;
    } }
];

const elEvent = document.getElementById('ovEvent');
const elEvtBox = document.getElementById('evtBox');

function triggerEvent(force){
  if(G.mode !== 'play' || G.phase !== 'wave') return false;
  const pool = G.st.mechLocked ? EVENTS.filter(ev => !ev.needsMech) : EVENTS;
  const ev = force || pick(pool);
  if(G.st.mechLocked && ev.needsMech) return false;
  G._event = ev;
  elEvtBox.innerHTML =
    '<div class="evtIco" style="color:' + ev.c + '">' + ev.ic + '</div>' +
    '<div class="evtName" style="color:' + ev.c + '">' + ev.n + '</div>' +
    '<div class="evtDesc">' + ev.desc + '</div>';
  clearBanner();
  byId('btnEvtSkip').hidden = !ev.optional;
  putText(byId('btnEvt'),ev.optional?'接受风险':'确认事件');
  elEvent.classList.remove('hide');
  G.mode = 'event';
  byId('btnEvt').focus({preventScroll:true});
  SFX.boss();
  return true;
}

function closeEvent(accept=true){
  if(G.mode !== 'event') return;
  elEvent.classList.add('hide');
  const ev = G._event;
  G._event = null;
  G.mode = 'play';
  if(accept || !ev?.optional) ev?.apply();
  else ev.decline();
  SFX.pick();
  if(!openReward()) wakeGame();
}

function maybeEvent(){
  return StageEvents.check();
}

function nextStage(){
  if(G.mode !== 'play') return;
  endMech();
  const s = G.stage;
  if(s >= SCENES.length - 1){
    G.mode = 'win';
    showOver(true);
    return;
  }
  G.portal = null;
  G.boss = null;
  G.bossEncounter = null;
  G.p.hp = Math.min(G.p.maxHp, G.p.hp + G.p.maxHp * .3);
  G.energy = 0;
  G.revives = Math.max(G.revives, 0);
  setScene(s + 1);
  G.wave = 1;
  startWave(1.4,false);
  G.eb.length = 0;
  const sc = SCENES[s + 1];
  banner(sc.name, sc.code, 2.2);
  SFX.portal();
}

/* ── 波次 ── */
function updateWaves(dt){
  if(G.phase !== 'wave') return;
  G.waveT = Math.max(0,G.waveT-dt);
  ThreatPacing.update();

  const curve = CampaignBalance.at(), pacing = ThreatPacing.at();
  const cap = ThreatPacing.enemyCap();
  const chance=pacing.delay ? 0 : curve.extraChance;
  if(G.waveT > 0 && !ThreatPacing.commander()?.down && G.enemies.length < cap){
    G.spawnT -= dt;
    if(G.spawnT <= 0){
      G.spawnT = curve.interval*pacing.interval*rnd(.84,1.12);
      const count = Math.min(cap-G.enemies.length,1+(Math.random()<chance ? 1 : 0));
      for(let i=0;i<count;i++){
        const pt = spawnPointNear();
        const variantRoll = Math.random();
        const kind = ThreatPacing.nextKind(variantRoll);
        spawnEnemy(kind, pt.x, pt.y,{variantRoll:variantRoll});
        if(pt.deco) spawnPuff(pt.x, pt.y);   // 从道具/角落钻出时扬一层粉尘
      }
    }
  }
  if(G.waveT <= 0) endWave();
}

/* ── 特效 ── */
function spark(x, y, n, col, spd){
  for(let i=0;i<n;i++){
    const a = rnd(0, TAU), v = rnd(spd * .3, spd);
    G.parts.push({ x:x, y:y, vx:Math.cos(a) * v, vy:Math.sin(a) * v * .7,
      life:rnd(.2,.45), max:.45, col:col, r:rnd(1,2.4) });
  }
}
function boom(x, y, big){
  const n = big ? 22 : 12;
  for(let i=0;i<n;i++){
    const a = rnd(0, TAU), v = rnd(20, big ? 190 : 115);
    G.parts.push({
      x:x, y:y, vx:Math.cos(a) * v, vy:Math.sin(a) * v * .72,
      life:rnd(.28, .65), max:.65,
      col: pick(['#fff3c4', '#ffb74d', '#ff6b4a', '#ff3d5a']),
      r: big ? rnd(2,4) : rnd(1,2.6)
    });
  }
  G.rings.push({ x:x, y:y, r:3, max: big ? 52 : 26, life:.32, maxLife:.32,
    col: big ? '#ffb74d' : '#ffe9a8', w: big ? 3 : 2 });
  G.shake = Math.max(G.shake, big ? 7 : 2.5);
}
function explodeFX(x, y, r, height){
  G.rings.push({ x:x, y:y, r:6, max:r, life:.4, maxLife:.4, col:'#ffb060', w:4 });
  G.rings.push({ x:x, y:y, r:r * .25, max:r * 1.85, life:.55, maxLife:.55, col:'rgba(255,228,186,.42)', w:2 });
  addFlash(x, y, r * 1.1, '#ffa040', .60);
  for(let i=0;i<18;i++){
    const a = rnd(0, TAU), v = rnd(60, r * 3.4);
    G.parts.push({ x:x, y:y, height:height, vx:Math.cos(a) * v, vy:Math.sin(a) * v * .7,
      life:rnd(.3,.6), max:.6, col: pick(['#fff3c4','#ffb74d','#ff6b4a']), r:rnd(2,4) });
  }
  G.shake = Math.max(G.shake, 6);
}
function updateParts(dt){
  for(let i=G.lightsFx.length-1;i>=0;i--){
    const o = G.lightsFx[i];
    o.life -= dt;
    if(o.life <= 0) G.lightsFx.splice(i, 1);
  }
  const partDrag = Math.pow(.12, dt);
  let activeParts = 0;
  for(const p of G.parts){
    p.life -= dt;
    if(p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= partDrag; p.vy *= partDrag;
    G.parts[activeParts++] = p;
  }
  G.parts.length = activeParts;
  let activeRings = 0;
  for(const r of G.rings){
    r.life -= dt;
    if(r.life > 0) G.rings[activeRings++] = r;
  }
  G.rings.length = activeRings;
  const textDrag = Math.pow(.3, dt);
  let activeTexts = 0;
  for(const t of G.texts){
    t.life -= dt;
    if(t.life <= 0) continue;
    t.y += t.vy * dt;
    t.vy *= textDrag;
    G.texts[activeTexts++] = t;
  }
  G.texts.length = activeTexts;
}

/* ── 环境天气粒子（土豆兄弟式关卡氛围） ── */
/* 每关一套动态环境粒子：废土尘埃 / 霓虹雨 / 冰晶雪 / 熔岩灰烬 / 虚空能量。
   粒子随相机平移、循环回收，只渲染在视野内，控制开销。 */
const ENV_DEFS = [
  { type:'dust',  n:60, col:'rgba(255,190,130,', rMin:1.0, rMax:3.0, spd:18,  sway:26,  rise:-6,  life:6 },
  { type:'rain',  n:90, col:'rgba(120,228,255,', rMin:.8, rMax:2.0, spd:300, sway:0,   rise:0,   life:1.3 },
  { type:'snow',  n:70, col:'rgba(225,250,255,', rMin:1.0, rMax:3.0, spd:52,  sway:44,  rise:0,   life:9 },
  { type:'ember', n:55, col:'rgba(255,150,60,',  rMin:1.0, rMax:3.0, spd:-70, sway:20,  rise:-38, life:7 },
  { type:'void',  n:64, col:'rgba(210,150,255,', rMin:1.0, rMax:2.8, spd:22,  sway:36,  rise:-14, life:8 }
];
function buildEnv(stage){
  const kind = SectorClimate.particles(stage);
  if(kind === null) return null;
  const d = ENV_DEFS[kind] || ENV_DEFS[0];
  const arr = [];
  for(let i=0;i<d.n;i++){
    arr.push({
      x: Math.random() * ARENA.w,
      y: Math.random() * ARENA.h,
      vx: d.spd * rnd(.55, 1.3),
      vy: d.rise * rnd(.6, 1.3),
      ph: Math.random() * TAU,
      sw: d.sway * rnd(.5, 1.2),
      r: d.rMin + Math.random() * (d.rMax - d.rMin),
      a: .30 + Math.random() * .45,
      l: d.life * rnd(.5, 1.3)
    });
  }
  return { type:d.type, col:d.col, spd:d.spd, def:d, arr:arr };
}
function updateEnv(dt){
  if(!G.env) return;
  const e = G.env;
  const halfW = VW / 2 + 60, halfH = VH / (2 * KZ) + 60;
  const cx = G.cam.x, cy = G.cam.y;
  const arr = e.arr;
  for(let i=0;i<arr.length;i++){
    const p = arr[i];
    // 摆动（sin 漂移）叠加在主运动上
    p.x += (p.vx + Math.sin(G.t * 1.6 + p.ph) * p.sw) * dt;
    p.y += (p.vy + Math.cos(G.t * 1.3 + p.ph) * p.sw * .5) * dt;
    p.l -= dt;
    // 循环回收：越界或寿命耗尽 → 从视野边缘重新进入
    if(p.l <= 0 || p.x < cx - halfW || p.x > cx + halfW || p.y < cy - halfH || p.y > cy + halfH){
      p.x = cx + rnd(-halfW, halfW);
      p.y = p.l <= 0 ? cy - halfH + rnd(0, 40) : (p.y < cy - halfH ? cy + halfH : cy - halfH);
      p.l = e.def.life * rnd(.6, 1.3);
    }
  }
}
function drawEnv(){
  if(!G.env) return;
  const e = G.env;
  ctx.save();
  for(let i=0;i<e.arr.length;i++){
    const p = e.arr[i];
    const sx = SX(p.x), sy = SY(p.y);
    if(sx < -20 || sx > VW + 20 || sy < -20 || sy > VH + 20) continue;
    ctx.globalAlpha = p.a;
    ctx.fillStyle = e.col + p.a.toFixed(3) + ')';
    if(e.type === 'rain'){
      // 雨丝：细长斜线，带拖尾
      ctx.fillRect(sx, sy, 1.6, 9 + p.r * 4);
      ctx.globalAlpha = p.a * .5;
      ctx.fillRect(sx, sy - 3, 1.2, 4 + p.r * 2);
      ctx.globalAlpha = p.a;
    } else {
      ctx.beginPath();
      ctx.ellipse(sx, sy, p.r, p.r * KZ, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════
   远景大气层 FARFX（屏幕空间，只在上半屏）
   · 比 3D 舞台更「远」一层：尘埃 / 细雪 / 灰烬 / 远景雨丝 / 虚空微光
   · 极低透明度（.04–.15）、极慢漂移，只为了让画面透气，不参与玩法
   · 位置用归一化屏幕坐标（0–1），与相机解耦，切场景只换外观
   ══════════════════════════════════════════════════════════ */
const FARFX = (function(){
  const N = 36;
  /* 每关一套：方向/速度/尺寸/颜色/形态（drift=横向漂移，fall=下落，rise=上浮） */
  const DEFS = [
    { form:'dot',   col:'#ffcf9a', a:.10, dx: 5.5, dy:-1.8, rMin:.6, rMax:2.0, n:30 }, // 落日废土：稀疏尘埃
    { form:'streak',col:'#9fd8ff', a:.09, dx: 9.0, dy: 26 , rMin:.8, rMax:1.6, n:26 }, // 霓虹雨夜：远景雨丝
    { form:'dot',   col:'#e8fbff', a:.13, dx: 1.6, dy: 7.5, rMin:.7, rMax:2.0, n:34 }, // 冰封矿场：细小雪粒
    { form:'dot',   col:'#ffa763', a:.09, dx: 3.0, dy:-6.0, rMin:.6, rMax:1.8, n:28 }, // 熔岩工厂：上浮灰烬
    { form:'dot',   col:'#d6a6ff', a:.10, dx: 2.2, dy:-3.0, rMin:.6, rMax:1.9, n:30 }  // 虚空核心：漂浮微光
  ];
  let arr = [], def = DEFS[0], stage = -1;

  function spawn(p, init){
    p.x = Math.random();
    /* 只在上半屏：0 → 0.50（留一点点越过中线的余量，避免上半屏下沿出现硬边） */
    p.y = init ? Math.random() * .5 : -0.04 + Math.random() * .04;
    p.r = def.rMin + Math.random() * (def.rMax - def.rMin);
    p.a = def.a * (.55 + Math.random() * .75);
    p.ph = Math.random() * TAU;
    p.k = 1;
    return p;
  }

  function build(i){
    stage = i;
    def = DEFS[i] || DEFS[0];
    arr = [];
    for(let k=0;k<N;k++){
      const p = spawn({}, true);
      p.y = Math.random() * .5;
      p.k = .5 + Math.random() * .9;      // 速度系数（远近不一）
      arr.push(p);
    }
  }

  /* dt 秒；速度以「屏幕高度的比例 / 秒」计，与分辨率无关 */
  function update(dt){
    if(!arr.length) return;
    for(let i=0;i<arr.length;i++){
      const p = arr[i];
      p.x += (def.dx / 1000) * p.k * dt + Math.sin(G.t * .35 + p.ph) * .0009 * dt * 60;
      p.y += (def.dy / 1000) * p.k * dt;
      if(p.x > 1.04) p.x -= 1.08;
      else if(p.x < -.04) p.x += 1.08;
      /* 只在上半屏循环：越出 0.52 就从上方重新飘入 */
      if(p.y > .52) p.y = -.03;
      else if(p.y < -.05) p.y = .50;
    }
  }

  /* 由 gradeFrame 在「远端雾」之后调用：此时 ctx 已是 mctx(CSS px) */
  function draw(sw, sh){
    if(!arr.length || QLEVEL < 1) return;
    const lim = sh * .52;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = def.col;
    for(let i=0;i<arr.length;i++){
      const p = arr[i];
      const x = p.x * sw, y = p.y * sh;
      if(y > lim) continue;
      /* 靠近上沿淡入、靠近中线淡出，避免出现一条会被看见的边界 */
      const edge = Math.min(1, y / (sh * .06)) * Math.min(1, Math.max(0, (lim - y) / (sh * .10)));
      const a = p.a * edge;
      if(a <= .002) continue;
      ctx.globalAlpha = a;
      if(def.form === 'streak'){
        ctx.fillRect(x, y, 1, 6 + p.r * 5);
      } else {
        const s = p.r * 1.6;
        ctx.fillRect(x, y, s, s);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return { build:build, update:update, draw:draw, get arr(){ return arr; }, get stage(){ return stage; } };
})();

/* ══════════════════════════════════════════════════════════
   近景遮挡层 FOREFX（屏幕空间，实体之后）
   · 极低密度：偶尔一片模糊暗色像素簇从画面边缘飘过（镜头前的灰尘/雨滴）
   · 底部两角各一组静止剪影（草叶 / 碎石 / 管道 / 晶屑），带极轻微摇摆
   · 目的：制造「镜头在场景内部」的纵深，而不是俯视一张图
   ══════════════════════════════════════════════════════════ */
const FOREFX = (function(){
  let blobs = [], nextT = 3, corners = null, stage = -1;

  /* 每角的近景剪影：草簇 / 石堆 / 断墙，尺寸大到能读出形状，
     否则 2px 的黑线在暗地面上等于不存在 */
  function build(i){
    stage = i;
    blobs = [];
    nextT = 4 + Math.random() * 3;
    const R = mulberry(2200 + i * 61);
    const defs = [
      { ax:0, ay:1, n:4, spread:190, hMin:.55, hMax:1.0 },
      { ax:1, ay:1, n:3, spread:150, hMin:.45, hMax:.85 },
      { ax:0, ay:0, n:2, spread:70,  hMin:.35, hMax:.7 },
      { ax:1, ay:0, n:2, spread:70,  hMin:.35, hMax:.7 }
    ];
    corners = [];
    for(let c=0;c<defs.length;c++){
      const d = defs[c];
      const items = [];
      for(let k=0;k<d.n;k++){
        const kind = R();
        const base = 12 + (k / d.n) * d.spread + R() * (d.spread / d.n) * .7;
        const sc = d.hMin + R() * (d.hMax - d.hMin);
        const it = { x:base, kind:kind, sc:sc, ph:R() * TAU, lean:(R() - .5) * .5, bs:[] };
        if(kind < .58){
          const n = 5 + (R() * 3 | 0);
          for(let j=0;j<n;j++){
            it.bs.push({
              dx: (j - n / 2) * (4 + R() * 5) * sc,
              h: (38 + R() * 46) * sc,
              w: 3.2 + R() * 3.2,
              lean: (R() - .5) * .38,
              ph: R() * TAU
            });
          }
        } else if(kind < .82){
          it.w = (30 + R() * 34) * sc;
          it.h = (26 + R() * 30) * sc;
          it.jag = R() * 10;
        } else {
          it.w = (26 + R() * 26) * sc;
          it.h = (34 + R() * 40) * sc;
        }
        items.push(it);
      }
      corners.push({ ax:d.ax, ay:d.ay, items:items });
    }
  }

  function spawnBlob(sw, sh){
    const side = (Math.random() * 4) | 0;
    const s = .55 + Math.random() * .45;
    const b = { s:s, life:0, max:3.6 + Math.random() * 3.2, ph:Math.random() * TAU };
    if(side === 0){ b.x = -.08; b.y = Math.random() * .95; b.vx = .10 + Math.random() * .06; b.vy = (Math.random() - .5) * .02; }
    else if(side === 1){ b.x = 1.08; b.y = Math.random() * .95; b.vx = -(.10 + Math.random() * .06); b.vy = (Math.random() - .5) * .02; }
    else if(side === 2){ b.x = Math.random(); b.y = -.06; b.vx = (Math.random() - .5) * .03; b.vy = .085 + Math.random() * .05; }
    else { b.x = Math.random(); b.y = 1.06; b.vx = (Math.random() - .5) * .03; b.vy = -(.07 + Math.random() * .04); }
    blobs.push(b);
    if(blobs.length > 3) blobs.shift();
  }

  function update(dt, sw, sh){
    if(!corners) build(stage < 0 ? 0 : stage);
    if(G.mode !== 'play') return;
    nextT -= dt;
    if(nextT <= 0 && blobs.length < 2){
      spawnBlob(sw, sh);
      nextT = 6.5 + Math.random() * 7;
    }
    for(let i=blobs.length-1;i>=0;i--){
      const b = blobs[i];
      b.life += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if(b.life > b.max) blobs.splice(i, 1);
    }
  }

  function draw(sw, sh){
    if(QLEVEL < 1 || !corners) return;
    const sc = SCENES[G.stage] || SCENES[0];
    const ink = 'rgba(3,3,6,';
    const rim = hexA(sc.accent, .16);

    /* ① 偶尔掠过镜头的模糊暗簇 */
    for(let i=0;i<blobs.length;i++){
      const b = blobs[i];
      const k = Math.min(1, b.life / .8) * Math.min(1, (b.max - b.life) / 1.1);
      if(k <= 0) continue;
      const rr = (26 + b.s * 44) * (1 + Math.sin(G.t * .6 + b.ph) * .06);
      const cx = b.x * sw, cy = b.y * sh;
      const g = ctx.createRadialGradient(cx, cy, rr * .2, cx, cy, rr);
      g.addColorStop(0, 'rgba(8,6,12,' + (.19 * k).toFixed(3) + ')');
      g.addColorStop(.55, 'rgba(8,6,12,' + (.10 * k).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(8,6,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * .86, 0, 0, TAU); ctx.fill();
    }

    /* ② 四角剪影：静止，只做极轻的呼吸摇摆 */
    for(let c=0;c<corners.length;c++){
      const cl = corners[c];
      const dir = cl.ax ? -1 : 1;
      const bx = cl.ax ? sw - 6 : 6;
      const by = cl.ay ? sh * .972 : 4;
      for(let k=0;k<cl.items.length;k++){
        const it = cl.items[k];
        const x = bx + dir * it.x;
        const sway = Math.sin(G.t * .55 + it.ph) * 1.2;

        if(it.kind < .58){
          /* 草簇：土堆 + 扇形叶片 */
          ctx.fillStyle = ink + '.96)';
          ctx.beginPath(); ctx.ellipse(x, by + 1, it.bs.length * 2.6 * it.sc, 4 * it.sc + 1, 0, 0, TAU); ctx.fill();
          for(let j=0;j<it.bs.length;j++){
            const b = it.bs[j];
            ctx.save();
            ctx.translate(x + b.dx, by);
            ctx.rotate(b.lean + sway * .012);
            ctx.fillStyle = ink + '.95)';
            ctx.beginPath();
            ctx.moveTo(-b.w * .5, 0);
            ctx.lineTo(-b.w * .12, -b.h);
            ctx.lineTo(b.w * .12, -b.h);
            ctx.lineTo(b.w * .5, 0);
            ctx.closePath(); ctx.fill();
            /* 受光棱：只有 1px，暗地面上才看得见轮廓 */
            ctx.fillStyle = rim;
            ctx.fillRect(-b.w * .12, -b.h, b.w * .24, 2);
            ctx.restore();
          }
        } else if(it.kind < .82){
          /* 石堆：一块带缺口的碎岩 */
          const w = it.w, h = it.h;
          ctx.fillStyle = ink + '.95)';
          ctx.beginPath();
          ctx.moveTo(x - w * .5, by);
          ctx.lineTo(x - w * .42, by - h * .62);
          ctx.lineTo(x - w * .12, by - h);
          ctx.lineTo(x + w * .22, by - h * .78 + it.jag * .3);
          ctx.lineTo(x + w * .46, by - h * .30);
          ctx.lineTo(x + w * .5, by);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = rim;
          ctx.fillRect(x - w * .42, by - h * .62, w * .34, 1.6);
        } else {
          /* 断墙 / 箱角：整块方剪影，顶上开缺口 */
          const w = it.w, h = it.h;
          ctx.fillStyle = ink + '.96)';
          ctx.fillRect(x - w * .5, by - h, w, h + 2);
          ctx.fillStyle = ink + '.96)';
          ctx.beginPath();
          ctx.moveTo(x - w * .5, by - h + h * .18);
          ctx.lineTo(x - w * .1, by - h);
          ctx.lineTo(x + w * .5, by - h + h * .12);
          ctx.lineTo(x + w * .5, by - h + h * .3);
          ctx.lineTo(x - w * .5, by - h + h * .36);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = rim;
          ctx.fillRect(x - w * .5, by - h + h * .18, w * .6, 1.6);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  return { build:build, update:update, draw:draw, get blobs(){ return blobs; } };
})();

/* ══════════════════════════════════════════════════════════
   远景层 BACKDROP（地面之后、实体之前）
   · 顶部一条被雾气吃掉的远山/城市/冰峰剪影：只占画面上沿 16%，
     透明度 .08–.16，像隔着空气看到的"更远那一层"
   · 全屏缓慢移动的云影：比相机慢 6 倍 → 玩家移动时产生视差
   · 两者都不参与玩法，也不遮挡实体
   ══════════════════════════════════════════════════════════ */
const BACKDROP = (function(){
  let stage = -1, ridges = [], clouds = [], sky = '';

  function build(i){
    stage = i;
    const R = mulberry(7700 + i * 137);
    /* 三层山脊：越远（层号小）越矮越淡，视差系数越小 */
    ridges = [];
    for(let L=0;L<3;L++){
      const n = 30 + L * 10;
      const pts = [];
      for(let k=0;k<=n;k++){
        const t = k / n;
        let h = (Math.sin(t * 6.1 + L * 2.3) * .5 + .5) * .58 +
                (Math.sin(t * 15.3 - L * 1.7) * .5 + .5) * .28 +
                (Math.sin(t * 29.7 + L * 4.1) * .5 + .5) * .14;
        /* 霓虹关换成方正的楼群轮廓 */
        if(i === 1) h = Math.max(h, (Math.sin(t * 21 + L) > .1 ? .62 : .18));
        pts.push(h);
      }
      ridges.push({ pts:pts, par:.028 + L * .022, hgt:.05 + L * .035, a:.20 + L * .09 });
    }
    /* 云影：几团巨大的柔边暗斑，横穿战场 */
    clouds = [];
    for(let k=0;k<5;k++){
      clouds.push({
        x: R(), y: .08 + R() * .84,
        rx: .16 + R() * .14, ry: .05 + R() * .045,
        sp: .004 + R() * .006, a: .045 + R() * .035,
        ph: R() * TAU
      });
    }
  }

  function update(dt){
    for(let i=0;i<clouds.length;i++){
      const c = clouds[i];
      c.x += c.sp * dt;
      if(c.x > 1.25) c.x -= 1.5;
    }
  }

  function draw(sw, sh){
    if(QLEVEL < 1 || !ridges.length) return;
    const sc = SCENES[G.stage] || SCENES[0];
    const base = '#100a07';   /* 比雾更暗的剪影：远山是逆光的 */
    /* ① 云影：先画，压在地面上但不压实体 */
    ctx.save();
    for(let i=0;i<clouds.length;i++){
      const c = clouds[i];
      const cx = (c.x * 1.5 - .25 + G.cam.x * .00012) * sw;
      const cy = c.y * sh;
      const rx = c.rx * sw, ry = c.ry * sh;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      g.addColorStop(0, 'rgba(0,0,0,' + (c.a * (.75 + Math.sin(G.t * .3 + c.ph) * .25)).toFixed(3) + ')');
      g.addColorStop(.55, 'rgba(0,0,0,' + (c.a * .45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    /* ② 上沿雾：先铺一层，远山再压在上面，剪影才不会被雾吃掉 */
    const bandH = sh * .14;
    const fg = ctx.createLinearGradient(0, 0, 0, bandH * 1.25);
    fg.addColorStop(0, hexA(sc.g[3], .30));
    fg.addColorStop(.62, hexA(sc.g[3], .12));
    fg.addColorStop(1, hexA(sc.g[3], 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, sw, bandH * 1.25);

    /* ③ 远山剪影：贴在上沿，峰顶被雾吃掉一半 */
    for(let L=0;L<ridges.length;L++){
      const r = ridges[L];
      const off = (-G.cam.x * r.par) % 1;
      const y0 = bandH * (0.62 - L * .08) + bandH * .55;
      ctx.beginPath();
      ctx.moveTo(-2, y0 + 2);
      const N = r.pts.length - 1;
      for(let k=0;k<=N;k++){
        const x = (k / N + off) * (sw + 40) - 20;
        ctx.lineTo(x, y0 - r.pts[k] * bandH * r.hgt * 5.4);
      }
      ctx.lineTo(sw + 2, y0 + 2);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.globalAlpha = r.a;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    /* ④ 峰顶再蒙一层薄雾，制造空气透视 */
    const fg2 = ctx.createLinearGradient(0, bandH * .18, 0, bandH * 1.05);
    fg2.addColorStop(0, hexA(sc.g[2], .18));
    fg2.addColorStop(1, hexA(sc.g[2], 0));
    ctx.fillStyle = fg2;
    ctx.fillRect(0, bandH * .18, sw, bandH * .88);
  }

  return { build:build, update:update, draw:draw, get stage(){ return stage; } };
})();

/* 场景动态氛围层（土豆兄弟式：每关地面有呼吸感的环境特效） */
function drawSceneAmbience(){
  const st = G.stage;
  const left = G.cam.x - VW / 2, top = G.cam.y - VH / (2 * KZ);
  const w = VW, h = VH / KZ;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if(st === 3){
    // 熔岩工厂：地面流动的熔岩辉光脉动
    for(let i=0;i<5;i++){
      const sp = ambSpot(i, 373, 517);
      const sx = SX(sp.x), sy = SY(sp.y);
      const pulse = .5 + Math.sin(G.t * 1.4 + i * 1.7) * .5;
      const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 50 + pulse * 24);
      rg.addColorStop(0, 'rgba(255,120,50,' + (.07 + pulse * .08).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(sx, sy, 56 + pulse * 24, (56 + pulse * 24) * KZ, 0, 0, TAU); ctx.fill();
    }
  } else if(st === 1){
    // 霓虹雨夜：地面霓虹反光扫动
    for(let i=0;i<4;i++){
      const sp = ambSpot(i, 421, 349);
      const sx = SX(sp.x), sy = SY(sp.y);
      const sw = Math.sin(G.t * .8 + i * 2.1);
      ctx.globalAlpha = .04 + Math.abs(sw) * .06;
      ctx.fillStyle = i % 2 ? '#57e0ff' : '#ff5ab4';
      ctx.beginPath(); ctx.ellipse(sx + sw * 30, sy, 62, 62 * KZ, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if(st === 4){
    // 虚空核心：紫色脉冲波纹
    for(let i=0;i<5;i++){
      const sp = ambSpot(i, 503, 431);
      const cx = SX(sp.x), cy = SY(sp.y);
      const ph = (G.t * .6 + i * 1.3) % 1;
      const r = ph * 90;
      ctx.globalAlpha = (1 - ph) * .16;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * KZ, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if(st === 2){
    // 冰封矿场：冰面呼吸反光
    for(let i=0;i<6;i++){
      const sp = ambSpot(i, 367, 293);
      const sx = SX(sp.x), sy = SY(sp.y);
      const b = .5 + Math.sin(G.t * .7 + i * 2.3) * .5;
      ctx.globalAlpha = .035 + b * .065;
      ctx.fillStyle = '#bff2ff';
      ctx.beginPath(); ctx.ellipse(sx, sy, 40 + b * 12, (40 + b * 12) * KZ, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // 落日废土：热浪微光
    for(let i=0;i<5;i++){
      const sp = ambSpot(i, 449, 337);
      const sx = SX(sp.x), sy = SY(sp.y);
      const b = .5 + Math.sin(G.t * 1.1 + i * 1.9) * .5;
      ctx.globalAlpha = .02 + b * .035;
      ctx.fillStyle = '#ffb066';
      ctx.beginPath(); ctx.ellipse(sx, sy, 48, 48 * KZ, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ══════════════════════════════════════════
   渲染
   ══════════════════════════════════════════ */
const DL = [];

function SX(wx){ return wx - G.cam.x + VW / 2; }
function SY(wy){ return (wy - G.cam.y) * KZ + VH / 2; }

function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if(amt > 0){ r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return 'rgb(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ')';
}

/* ══════════════════════════════════════════════════════════
   HD-2D 3D 舞台渲染层（Three.js）
   · 地面/建筑/树木/地形用简单几何体（立方体/平面）搭建厚板
   · 定向光 + 实时阴影，让像素块面有明暗变化
   · 正交斜俯视相机，投影与 2D 逻辑坐标 SX/SY 对齐
   · 渲染到低分辨率目标，Bayer 抖动 + 限色统一像素颗粒
   ══════════════════════════════════════════════════════════ */
const STAGE3D = (function(){
  let ready = false;
  let renderer = null, scene = null, camera = null, sun = null;
  let stageCanvas = null;
  let lastCameraX = NaN, lastCameraY = NaN;
  let stageW = 0, stageH = 0;
  let meshes = [];               // 建筑/树木/岩石等几何体
  let groundMesh = null;
  let groundTex = null;
  let currentStage = -1;
  let groundDirty = false;       // G.ground 重烘焙后置位，下一帧强制重建舞台

  function hexToColor(hex){
    const n = parseInt(hex.slice(1), 16);
    return new THREE.Color(((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255);
  }

  // 生成像素风纹理（小 canvas 放大，保持像素颗粒）
  function pixelTex(colors, w, h){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        g.fillStyle = colors[(x*7 + y*13) % colors.length];
        g.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  function init(){
    if(!window.THREE){ return false; }
    try{
      renderer = new THREE.WebGLRenderer({ antialias:false, alpha:false, preserveDrawingBuffer:true });
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene();

      // 正交斜俯视相机：视线从斜上方看向地面中心
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
      camera.position.set(0, 0, 600);
      camera.lookAt(0, 0, 0);

      // 定向光（模拟太阳，产生明暗与阴影）
      sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(220, 420, 160);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -750;
      sun.shadow.camera.right = 750;
      sun.shadow.camera.top = 550;
      sun.shadow.camera.bottom = -550;
      sun.shadow.camera.near = 50;
      sun.shadow.camera.far = 1300;
      sun.shadow.bias = -0.0004;
      scene.add(sun);

      // 环境光 + 补光（避免阴影面过暗）
      const amb = new THREE.AmbientLight(0x99a8c0, 0.55);
      scene.add(amb);
      const hemi = new THREE.HemisphereLight(0xb0c0d8, 0x2a3444, 0.35);
      scene.add(hemi);

      ready = true;
      return true;
    }catch(e){
      return false;
    }
  }

  function setStageSize(w, h){
    if(stageW === w && stageH === h && stageCanvas) return;
    stageW = w;
    stageH = h;
    renderer.setSize(w, h, false);
    stageCanvas = renderer.domElement;
    lastCameraX = NaN;
  }

  function clearStage(){
    for(let i=0;i<meshes.length;i++){
      if(meshes[i].geometry) meshes[i].geometry.dispose();
      if(meshes[i].material) meshes[i].material.dispose();
      scene.remove(meshes[i]);
    }
    meshes.length = 0;
    if(groundMesh){
      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
      groundMesh = null;
    }
    // 地面细节纹理：只释放 GPU 纹理，绝不 dispose 共享的 G.ground 画布
    if(groundTex){
      groundTex.dispose();
      groundTex = null;
    }
  }

  function buildStage(stage){
    if(!ready) return;
    clearStage();
    const sc = SCENES[stage];
    const R = mulberry(stage * 977 + 13);
    const gCol = hexToColor(sc.g[0]);
    const gCol2 = hexToColor(sc.g[1]);

    // 地面厚板（做大超出 ARENA，保证相机视野内铺满）
    const groundExt = 600;   // 四周扩展
    const groundGeo = new THREE.BoxGeometry(ARENA.w + groundExt*2, 24, ARENA.h + groundExt*2);
    const groundMat = new THREE.MeshLambertMaterial({ color:gCol });
    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(ARENA.w/2, -12, ARENA.h/2);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 地面贴片：直接使用 buildGround() 烘焙的细节画布（1 逻辑像素 = 1 纹素）
    // PlaneGeometry 的 UV 在 rotateX(-90°) 后：u→世界 +X，v=1→世界 -Z，
    // 而 CanvasTexture 默认 flipY=true，于是 canvas 的 y 轴与逻辑 y 轴同向，无需翻转。
    const patchGeo = new THREE.PlaneGeometry(ARENA.w, ARENA.h);
    patchGeo.rotateX(-Math.PI/2);
    let patchMat;
    if(G.ground){
      groundTex = new THREE.CanvasTexture(G.ground);
      groundTex.magFilter = THREE.NearestFilter;     // 放大保持像素颗粒
      groundTex.minFilter = THREE.LinearFilter;      // 缩小用线性，避免细节丢失/闪烁
      groundTex.generateMipmaps = false;
      groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
      // 烘焙图集按原始色值输出，保留与二维精灵一致的色调。
      patchMat = new THREE.MeshLambertMaterial({
        map:groundTex,
        emissive:0xffffff,
        emissiveMap:groundTex,
        emissiveIntensity:.95
      });
    } else {
      // 回退：G.ground 尚未烘焙（极端时序），用原来的像素噪点贴片
      const patchCols = [sc.g[0], sc.g[1], sc.g[2], sc.g[3]];
      groundTex = pixelTex(patchCols, 64, 64);
      patchMat = new THREE.MeshBasicMaterial({ map:groundTex, transparent:true, opacity:.5 });
    }
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.position.set(ARENA.w/2, 0.5, ARENA.h/2);
    patch.receiveShadow = true;
    scene.add(patch);
    meshes.push(patch);

    // 边界墙
    const wallH = 20;
    const wallMat = new THREE.MeshLambertMaterial({ color:hexToColor(sc.g[3]) });
    function addWall(w, d, px, pz){
      const g = new THREE.BoxGeometry(w, wallH, d);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(px, wallH/2 - 12, pz);
      m.receiveShadow = true; m.castShadow = true;
      scene.add(m); meshes.push(m);
    }
    addWall(ARENA.w + groundExt*2, 6, ARENA.w/2, -groundExt/2);
    addWall(ARENA.w + groundExt*2, 6, ARENA.w/2, ARENA.h + groundExt/2);
    addWall(6, ARENA.h + groundExt*2, -groundExt/2, ARENA.h/2);
    addWall(6, ARENA.h + groundExt*2, ARENA.w + groundExt/2, ARENA.h/2);

    // 建筑/树木/岩石：改由 2D 全分辨率绘制（drawProp），
    // 3D 低分辨率舞台（约 1/2 视口）会把小方块糊成黑块，反而更像"纸片"。
    // 这里只保留地标之外的体积光照锚点：不建几何，避免与 2D 精灵重影。

    currentStage = stage;
    groundDirty = false;
    lastCameraX = NaN;
    renderer.shadowMap.needsUpdate = true;
  }

  function updateCamera(){
    if(!ready) return;
    // 正交相机覆盖逻辑视口，与 SX/SY 投影对齐
    const halfW = VW / 2;
    const halfH = VH / 2;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    // 相机位于玩家上方，斜向下俯视地面（产生 2.5D 纵深）
    // 世界坐标 (wx, wy) → 3D (x, z)，y 轴向上
    const camX = G.cam.x;
    const camZ = G.cam.y;
    const height = 620;
    // 相机朝向：从玩家位置斜后方一点向下看，视线约与地面成 38°
    const pitch = Math.asin(KZ);   // KZ=0.62 → 俯角约 38°，使 y 方向投影压缩
    const cx = camX;
    const cy = height;
    const cz = camZ + height / Math.tan(pitch);
    camera.position.set(cx, cy, cz);
    camera.up.set(0, 1, 0);
    camera.lookAt(camX, 0, camZ);
    camera.updateProjectionMatrix();
  }

  function render3D(){
    if(!ready || !stageCanvas) return null;
    if(currentStage !== G.stage || groundDirty) buildStage(G.stage);
    if(lastCameraX !== G.cam.x || lastCameraY !== G.cam.y){
      updateCamera();
      renderer.render(scene, camera);
      lastCameraX = G.cam.x;
      lastCameraY = G.cam.y;
    }
    return stageCanvas;
  }

  /* 采样世界坐标 (wx, wy) 处的光照：返回 { lum:0-1, warm:0-1 }
     · lum：受定向光方向与障碍物遮挡影响（角色站在障碍物"背光"侧会变暗）
     · warm：色温（暖色=火光/暖色调场景，冷色=暗处）
     用于让角色精灵融入 HD-2D 场景光照，而非贴纸般浮在上面 */
  function lightAt(wx, wy){
    if(!ready || !sun) return { lum:1, warm:0 };
    // 定向光方向（平行光）：从太阳位置指向原点，地面 XY 投影
    // 光线从太阳射向地面，方向向量 ≈ (-sun.x, -sun.z)
    const ldx = -sun.position.x, ldy = -sun.position.z;
    const llen = Math.sqrt(ldx*ldx + ldy*ldy) || 1;
    const ux = ldx / llen, uy = ldy / llen;   // 光线方向（地面投影，归一化）

    let lum = 1;
    // 检测：角色是否在某个障碍物的"背光侧"（沿光线方向，障碍物挡住光线）
    for(let i=0;i<G.props.length;i++){
      const pr = G.props[i];
      if(!pr.solid) continue;
      // 障碍物到角色的向量
      const ex = wx - pr.x, ey = wy - pr.y;
      // 角色在障碍物的光线"下游"（沿光线方向的前方）
      const proj = ex * ux + ey * uy;           // 角色相对障碍物沿光线方向的投影
      if(proj < 0 || proj > 240) continue;      // 只在光线下游 240 距离内检测
      const perp = Math.abs(ex * -uy + ey * ux); // 垂直距离（横向偏移）
      const rr = pr.r + 14;
      if(perp < rr){
        // 被遮挡：越靠近障碍物投影中心越暗
        const shadeAmt = 1 - proj / 240;
        lum = Math.min(lum, 1 - shadeAmt * .6);
      }
    }
    lum = Math.max(.34, lum);

    // 色温：根据场景色调微调（暖色关卡角色偏暖）
    const warmBase = (G.stage === 0 ? .12 : G.stage === 3 ? .22 : G.stage === 4 ? .06 : .04);
    // 阴影里偏冷（暖度降低），受光处偏暖
    const warm = warmBase + (1 - lum) * -.22;
    return { lum: Math.max(0, Math.min(1, lum)), warm: Math.max(-.4, Math.min(.6, warm)) };
  }

  return {
    init:init,
    buildStage:buildStage,
    render3D:render3D,
    setStageSize:setStageSize,
    invalidateGround:function(){ groundDirty = true; },
    _dbgScene:function(){ return { scene:scene, meshes:meshes, groundTex:groundTex, sun:sun }; },
    isReady:function(){ return ready; },
    getCanvas:function(){ return stageCanvas; },
    lightAt:lightAt
  };
})();

function drawGround(){
  const sc = SCENES[G.stage];
  const left = G.cam.x - VW / 2;
  const top = G.cam.y - VH / (2 * KZ);
  const w = VW, h = VH / KZ;
  ctx.fillStyle = sc.g[1];
  ctx.fillRect(-70, -70, VW + 140, VH + 140);
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(ARENA.w, left + w), y1 = Math.min(ARENA.h, top + h);
  if(x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(
    G.ground, x0, y0, x1 - x0, y1 - y0,
    x0 - left, (y0 - top) * KZ, x1 - x0, (y1 - y0) * KZ
  );
}

function drawGroundMarks(){
  if(!G.groundMarks) return;
  const left = G.cam.x - VW / 2;
  const top = G.cam.y - VH / (2 * KZ);
  const w = VW, h = VH / KZ;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(ARENA.w, left + w), y1 = Math.min(ARENA.h, top + h);
  if(x1 <= x0 || y1 <= y0) return;
  /* 1:1 原始分辨率叠加：路径/轮胎印/碎石不被 3D 低分辨率舞台吃掉 */
  ctx.drawImage(
    G.groundMarks, x0, y0, x1 - x0, y1 - y0,
    x0 - left, (y0 - top) * KZ, x1 - x0, (y1 - y0) * KZ
  );
}

/* ══════════════════════════════════════════════════════
   小道具：全分辨率 2D 伪 3D
   · 每个物件 = 顶面（最亮）/ 正面（中间调）/ 右侧面（最暗）三块纯色矩形
   · 光源固定左上，所以亮边永远在左上、暗面永远在右下
   · 底部两层椭圆投影（外圈软、内圈实），让它"贴"在地面上而不是浮着
   ══════════════════════════════════════════════════════ */
function propPal(){
  const st = G.stage;
  if(st === 2) return { base:'#4c6070', lite:'#7b98a8', dark:'#23313a', deep:'#161f26', acc:'#9fe8ff' };
  if(st === 1) return { base:'#28324c', lite:'#415375', dark:'#121927', deep:'#0a0f18', acc:'#57e0ff' };
  if(st === 3) return { base:'#4e3526', lite:'#785034', dark:'#221510', deep:'#140c08', acc:'#ff7a3c' };
  if(st === 4) return { base:'#35264c', lite:'#553c7c', dark:'#170f2a', deep:'#0e0819', acc:'#c77dff' };
  return { base:'#4f4134', lite:'#77654f', dark:'#241c15', deep:'#160f0b', acc:'#ff9a5c' };
}

/* ══════════════════════════════════════════════════════
   地面反光：发光物在地面拉出的长椭圆光斑
   · 加性混合、压在实体之下，所以角色会"踩"在光里而不是被盖住
   · 中心亮、外圈散，纵向压扁成 KZ 比例 → 像贴在斜面上的反射
   ══════════════════════════════════════════════════════ */
function groundPool(wx, wy, rx, col, a, flat){
  const x = SX(wx), y = SY(wy);
  if(x < -rx * 2 || x > VW + rx * 2 || y < -rx || y > VH + rx) return;
  const ry = Math.max(3, rx * (flat || KZ) * .62);
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, hexA(col, a));
  g.addColorStop(.40, hexA(col, a * .42));
  g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  /* 中心再压一条更窄更亮的芯，让反光有"镜面"的锐度 */
  ctx.globalAlpha = Math.min(1, a * 1.5);
  ctx.fillStyle = hexA(col, a * .9);
  ctx.beginPath(); ctx.ellipse(x, y, rx * .30, ry * .40, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawGroundGlow(){
  const t = G.t;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  /* ① 传送门：地面上最大的一片冷光 */
  if(G.portal){
    const p = G.portal;
    const pulse = .82 + .18 * Math.sin(t * 2.4);
    groundPool(p.x, p.y + 2, 86 * pulse, '#8fe8ff', .17);
    groundPool(p.x, p.y + 2, 40 * pulse, '#d8fbff', .10);
  }

  /* ② 主地标：残骸/广告牌/熔炉自己在发光 */
  const LP = LM_PAL[G.stage] || LM_PAL[0];
  for(let i=0;i<G.props.length;i++){
    const pr = G.props[i];
    if(!pr.lm) continue;
    let a = .10, rx = pr.r * 1.55, col = LP.glow;
    if(pr.kind === 'billboard'){ a = .13 + .05 * Math.sin(t * 3.1); rx = pr.r * 1.9; }
    else if(pr.kind === 'obelisk'){ a = .12 + .05 * Math.sin(t * 1.7); rx = pr.r * 2.4; }
    else if(pr.kind === 'furnace'){ a = .12 + .04 * Math.sin(t * 2.2); rx = pr.r * 1.7; }
    else { a = .09; }
    if(a > .01) groundPool(pr.x, pr.y + pr.r * .10, rx, col, a);
  }

  /* ③ 熔岩关：裂缝的辉光拉长成条带（而不是一团圆光） */
  if(G.stage === 3){
    for(let i=0;i<5;i++){
      const sp = ambSpot(i, 373, 517);
      const k = .5 + .5 * Math.sin(t * 1.4 + i * 1.7);
      groundPool(sp.x, sp.y, 54 + k * 16, '#ff7a3c', .09 + k * .05, .30);
    }
  }

  /* ④ 机甲模式：脚下灼热的橘光 */
  if(G.mechT > 0 && G.p){
    const k = .6 + .4 * Math.sin(t * 6);
    groundPool(G.p.x, G.p.y + 4, 34 + k * 6, '#ffb066', .14);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawProp(pr){
  const x = Math.round(SX(pr.x));
  const y = Math.round(SY(pr.y) - (pr.lift || 0) * .55);
  const r = pr.r, h = pr.h;
  const P = propPal();
  if(x + r * 3 < -40 || x - r * 3 > VW + 40 || y - h * 1.4 > VH + 40 || y < -h * 1.6) return;

  /* ① 接地阴影：外圈散开、内圈压实，光从左上打来 → 影子偏右下 */
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.beginPath(); ctx.ellipse(x + r * .16, y + 1, r * 1.24, r * .46, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.30)';
  ctx.beginPath(); ctx.ellipse(x + r * .04, y, r * .92, r * .32, 0, 0, TAU); ctx.fill();

  /* 受光面（上/左）亮线 + 背光面（右/下）暗线：HD-2D 场景立体的基础 */
  ctx.fillStyle = hexA(P.lite, .20);
  ctx.fillRect(x - r * .82, y - h - 1, r * 1.64, 1);
  ctx.fillRect(x - r * .86, y - h, 1, h * .72);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(x + r * .76, y - h * .80, 1, h * .80);

  if(pr.kind === 'crystal'){
    const c1 = G.stage === 2 ? '#9fe8ff' : G.stage === 4 ? '#c77dff' : G.stage === 1 ? '#7de8ff' : '#8fd0e8';
    const c2 = shade(c1, -.30), c3 = shade(c1, .34);
    /* 地面光斑：晶体自己会发光 */
    ctx.globalAlpha = .16;
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * .8, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    /* 三棱晶体：左面亮、正面中、右面暗 */
    const top = y - h - 5, wid = r * .72;
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + wid, y - h * .30); ctx.lineTo(x + wid * .5, y - 1); ctx.lineTo(x - wid * .1, y - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(x - wid * .2, top + 3); ctx.lineTo(x + wid * .62, y - h * .34); ctx.lineTo(x + wid * .1, y - 1); ctx.lineTo(x - wid * .72, y - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c3;
    ctx.beginPath(); ctx.moveTo(x - wid * .2, top + 3); ctx.lineTo(x - wid * .1, y - h * .34); ctx.lineTo(x - wid * .72, y - 1); ctx.closePath(); ctx.fill();
    /* 顶部高光 */
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillRect(x - 1, top + 2, 1.6, Math.max(3, h * .34));
    return;
  }

  if(pr.kind === 'pillar' || pr.kind === 'pipe'){
    const w = r * 1.5, hh = h + 8;
    ctx.fillStyle = P.dark;   ctx.fillRect(x - w * .5, y - hh, w, hh);
    ctx.fillStyle = P.base;   ctx.fillRect(x - w * .5, y - hh, w - Math.max(3, w * .26), hh - 1);
    ctx.fillStyle = P.lite;   ctx.fillRect(x - w * .5, y - hh, w - Math.max(3, w * .26), 3);
    ctx.fillStyle = shade(P.lite, .18);
    ctx.fillRect(x - w * .5, y - hh, 1.6, hh - 2);
    /* 分节箍环 */
    ctx.fillStyle = P.deep;
    for(let k=1;k<3;k++) ctx.fillRect(x - w * .5, y - hh + hh * k / 3, w, 1.4);
    if(pr.kind === 'pipe'){
      ctx.fillStyle = 'rgba(255,120,50,.5)';
      ctx.fillRect(x - 1, y - hh + 2, 2, hh - 4);
    }
    return;
  }

  if(pr.kind === 'crate'){
    const w = r * 1.72, hh = h;
    /* 右侧暗面（厚度） */
    ctx.fillStyle = P.dark;  ctx.fillRect(x - w * .5, y - hh, w, hh);
    /* 正面（中间调） */
    ctx.fillStyle = P.base;  ctx.fillRect(x - w * .5, y - hh, w - 3, hh - 2);
    /* 顶面（亮）：把箱子"压扁"一点，顶面就有进深 */
    ctx.fillStyle = P.lite;  ctx.fillRect(x - w * .5, y - hh - 4, w - 3, 5);
    /* 左上受光棱 */
    ctx.fillStyle = shade(P.lite, .22);
    ctx.fillRect(x - w * .5, y - hh - 4, 1.8, hh + 3);
    /* 木板缝 + 角铁 */
    ctx.fillStyle = P.deep;
    ctx.fillRect(x - w * .5 + 1, y - hh * .58, w - 5, 1.2);
    ctx.fillRect(x - 1, y - hh - 3, 1.4, hh + 1);
    ctx.fillStyle = shade(P.lite, .12);
    ctx.fillRect(x - w * .5, y - hh + 1, w - 3, 1);
    /* 底部沉影 */
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x - w * .5, y - 2, w - 2, 2);
    return;
  }

  /* 岩石：三块切面（顶亮 / 正 / 右下暗） */
  const w = r * 1.6, hh = h;
  ctx.fillStyle = P.dark;
  ctx.beginPath();
  ctx.moveTo(x - w * .5, y);
  ctx.lineTo(x - w * .42, y - hh * .62);
  ctx.lineTo(x + w * .10, y - hh * .42);
  ctx.lineTo(x + w * .52, y - hh * .66);
  ctx.lineTo(x + w * .48, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.base;
  ctx.beginPath();
  ctx.moveTo(x - w * .44, y);
  ctx.lineTo(x - w * .38, y - hh * .58);
  ctx.lineTo(x + w * .12, y - hh * .40);
  ctx.lineTo(x + w * .30, y - hh * .50);
  ctx.lineTo(x + w * .22, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.lite;
  ctx.beginPath();
  ctx.moveTo(x - w * .40, y - hh * .56);
  ctx.lineTo(x - w * .10, y - hh * .86);
  ctx.lineTo(x + w * .26, y - hh * .58);
  ctx.lineTo(x + w * .10, y - hh * .40);
  ctx.closePath(); ctx.fill();
  /* 顶棱高光 */
  ctx.fillStyle = shade(P.lite, .24);
  ctx.fillRect(x - w * .10, y - hh * .86, 3, 1.4);
  /* 底部沉影 */
  ctx.fillStyle = 'rgba(0,0,0,.20)';
  ctx.fillRect(x - w * .44, y - 2, w * .86, 2);
}

/* ── 主地标配色（与各关底色同一色系，只比地面亮一档） ── */
const LM_PAL = [
  { base:'#584839', dark:'#2a2018', lite:'#7d6a52', glow:'#ffb066' },  // 落日废土
  { base:'#232c44', dark:'#10141f', lite:'#3f4f76', glow:'#57e0ff' },  // 霓虹雨夜
  { base:'#4e6474', dark:'#243440', lite:'#7f9dae', glow:'#9fe8ff' },  // 冰封矿场
  { base:'#5b3c2e', dark:'#2c1b14', lite:'#855038', glow:'#ff7a3c' },  // 熔岩工厂
  { base:'#33254c', dark:'#191128', lite:'#5b3f85', glow:'#c77dff' }   // 虚空核心
];

/* ── 主地标绘制：全分辨率 2D，带极低成本微动态（不新增每帧分配） ──
   尖顶/躯干用矩形堆叠，动态只用 sin(G.t) 驱动，单帧几十次绘制调用。 */
function drawLandmark(pr){
  const x = Math.round(SX(pr.x)), y = Math.round(SY(pr.y));
  const P = LM_PAL[G.stage] || LM_PAL[0];
  const t = G.t, r = pr.r, h = pr.h;
  if(x + r * 2.6 < 0 || x - r * 2.6 > VW || y - h * 2.2 > VH || y < -h * 1.4) return;

  /* 落地阴影：软贴图阴影，让地标压在场景里而不是浮着 */
  if(pr.kind !== 'obelisk') drawShadow(x, y + 2, r * .85, (pr.kind === 'billboard' ? .30 : .46));

  /* ① 落日废土：坠毁机甲残骸 —— 矩形堆叠 + 冒烟 */
  if(pr.kind === 'wreck'){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-.07);
    // 胯部底盘：压在地面上，把整个机体"钉"住
    ctx.fillStyle = P.dark; ctx.fillRect(-r * .52, -h * .44, r * .78, h * .44);
    ctx.fillStyle = P.base; ctx.fillRect(-r * .46, -h * .40, r * .62, h * .22);
    // 主躯干（大块，略向右倒）
    ctx.fillStyle = P.base; ctx.fillRect(-r * 1.02, -h * .86, r * 1.48, h * .46);
    ctx.fillStyle = P.dark; ctx.fillRect(-r * 1.02, -h * .52, r * 1.48, h * .12);
    ctx.fillStyle = P.lite; ctx.fillRect(-r * 1.02, -h * .86, r * 1.48, 3);
    // 肩部残端：接在躯干右缘
    ctx.fillStyle = P.dark; ctx.fillRect(r * .36, -h * .78, r * .46, h * .26);
    ctx.fillStyle = P.base; ctx.fillRect(r * .36, -h * .76, r * .42, h * .18);
    // 驾驶舱：坐在躯干左上方，与躯干有明确接缝
    ctx.fillStyle = P.dark; ctx.fillRect(-r * .72, -h * 1.02, r * .7, h * .22);
    ctx.fillStyle = P.base; ctx.fillRect(-r * .66, -h * .99, r * .58, h * .16);
    ctx.fillStyle = P.lite; ctx.fillRect(-r * .66, -h * .99, r * .58, 2);
    // 装甲分块缝
    ctx.fillStyle = P.dark;
    ctx.fillRect(-r * .3, -h * .84, 3, h * .3);
    ctx.fillRect(r * .12, -h * .84, 3, h * .3);
    // 顶部破口（缺口落在轮廓内部，不是浮在旁边）
    ctx.beginPath();
    ctx.moveTo(-r * .05, -h * .86);
    ctx.lineTo(r * .26, -h * .86);
    ctx.lineTo(r * .16, -h * .75);
    ctx.lineTo(-r * .02, -h * .72);
    ctx.closePath(); ctx.fill();
    // 掉在旁边的断臂
    ctx.fillStyle = P.dark; ctx.fillRect(r * .82, -h * .2, r * .56, r * .24);
    ctx.fillStyle = P.base; ctx.fillRect(r * .84, -h * .19, r * .5, r * .16);
    // 脱落的头盔
    ctx.fillStyle = P.dark; ctx.fillRect(-r * 1.42, -h * .17, r * .34, h * .13);
    ctx.fillStyle = P.base; ctx.fillRect(-r * 1.4, -h * .16, r * .3, h * .1);
    ctx.restore();

    // 传感器残光：慢脉冲，余光里"还活着"
    const pulse = .3 + .5 * (0.5 + 0.5 * Math.sin(t * 2.1)) + .2 * Math.abs(Math.sin(t * 9.3));
    ctx.globalAlpha = clamp(pulse, 0, 1);
    ctx.fillStyle = P.glow;
    ctx.fillRect(x - r * .58, y - h * .97, 7, 4);
    ctx.globalAlpha = 1;

    // 冒烟：3 个缓慢上下浮动的半透明圆
    for(let i=0;i<3;i++){
      const ph = (t * .22 + i * .34) % 1;
      const bob = Math.sin(t * .75 + i * 2.1) * 7;
      const px = x - r * .15 + Math.sin(t * .5 + i * 1.7) * 9;
      const py = y - h * .95 - ph * h * .72 + bob;
      const rr = 10 + ph * 18, a = (1 - ph) * .42;
      // 暗边 + 亮心的双色烟团：亮地面上读得出，暗机身上也不糊成一团
      ctx.globalAlpha = a;
      ctx.fillStyle = '#4a4038';
      ctx.beginPath(); ctx.ellipse(px, py, rr, rr * .82, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * .55;
      ctx.fillStyle = '#bcae99';
      ctx.beginPath(); ctx.ellipse(px - rr * .18, py - rr * .22, rr * .6, rr * .46, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  /* ② 霓虹雨夜：歪斜的发光广告牌 —— 每隔几秒闪一下 */
  if(pr.kind === 'billboard'){
    const blinkPh = t % 5.2;
    let lit = 1;
    if(blinkPh > 4.6){                       // 每 5.2 秒抽一下（sin 造抖动，不用随机数）
      const k = (blinkPh - 4.6) / .6;
      lit = (Math.sin(k * 38) > -.15) ? 1 : .22;
    }
    const sway = Math.sin(t * .55) * .008;
    const ang = -.22 + sway;
    const w = r * 2.1, ph = h * .44;
    const pcx = x + r * .06, pcy = y - h * .74;
    // 面板下沿两点的世界坐标：支架必须精确接到这里，否则会看起来断掉
    const ca = Math.cos(ang), sn = Math.sin(ang);
    const lxL = -w * .34, lxR = w * .34, lyb = ph * .5;
    const ax = pcx + lxL * ca - lyb * sn, ay = pcy + lxL * sn + lyb * ca;
    const bx = pcx + lxR * ca - lyb * sn, by = pcy + lxR * sn + lyb * ca;

    // 支架：地面 → 面板下沿
    ctx.lineCap = 'butt';
    ctx.strokeStyle = P.dark; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - r * .52, y); ctx.lineTo(ax, ay - 1);
    ctx.moveTo(x + r * .46, y); ctx.lineTo(bx, by - 1);
    ctx.stroke();
    ctx.strokeStyle = P.lite; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r * .52, y); ctx.lineTo(ax, ay - 1); ctx.stroke();
    // 斜撑
    ctx.strokeStyle = P.dark; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * .5, y - h * .12); ctx.lineTo(x + r * .3, y - h * .36);
    ctx.stroke();

    // 面板（歪斜一点，像被撞过）
    ctx.save();
    ctx.translate(pcx, pcy);
    ctx.rotate(ang);
    ctx.fillStyle = '#10141f';
    ctx.fillRect(-w / 2 - 3, -ph / 2 - 3, w + 6, ph + 6);
    ctx.globalAlpha = .16 * lit; ctx.fillStyle = P.glow;
    ctx.fillRect(-w / 2 - 9, -ph / 2 - 9, w + 18, ph + 18);
    ctx.globalAlpha = lit; ctx.fillStyle = '#0b1220';
    ctx.fillRect(-w / 2, -ph / 2, w, ph);
    // 画面：色带 + 文字条 + 符号
    ctx.globalAlpha = .8 * lit; ctx.fillStyle = P.glow;
    ctx.fillRect(-w / 2 + 5, -ph / 2 + 5, w * .32, ph - 10);
    ctx.globalAlpha = .55 * lit; ctx.fillStyle = '#ff5ab4';
    ctx.fillRect(-w / 2 + 5 + w * .34 + 4, -ph / 2 + 5, w * .12, ph * .42);
    ctx.globalAlpha = .75 * lit; ctx.fillStyle = '#ffffff';
    for(let i=0;i<3;i++){
      ctx.fillRect(w * .12, -ph / 2 + 8 + i * 8, w * .3 * (i === 1 ? .7 : 1), 3);
    }
    ctx.globalAlpha = .5 * lit; ctx.strokeStyle = P.glow; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -ph / 2, w, ph);
    ctx.restore();

    // 地面光斑：湿地面上的霓虹落光
    ctx.globalAlpha = .07 * lit; ctx.fillStyle = P.glow;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * .4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  /* ③ 冰封矿场：废弃钻塔 —— 冷雾 + 顶部警示灯 */
  if(pr.kind === 'drill'){
    ctx.fillStyle = P.dark; ctx.fillRect(x - r * 1.1, y - 14, r * 2.2, 14);
    ctx.fillStyle = P.base; ctx.fillRect(x - r * 1.05, y - 14, r * 2.1, 6);
    // 三层交叉桁架
    ctx.strokeStyle = P.base; ctx.lineWidth = 4;
    const tiers = 3, tw0 = r * .82, tw1 = r * .32, body = h - 30;
    for(let i=0;i<tiers;i++){
      const y0 = y - 14 - body * i / tiers, y1 = y - 14 - body * (i + 1) / tiers;
      const w0 = tw0 + (tw1 - tw0) * i / tiers, w1 = tw0 + (tw1 - tw0) * (i + 1) / tiers;
      ctx.beginPath();
      ctx.moveTo(x - w0, y0); ctx.lineTo(x - w1, y1);
      ctx.moveTo(x + w0, y0); ctx.lineTo(x + w1, y1);
      ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1);
      ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1);
      ctx.stroke();
      ctx.fillStyle = P.base; ctx.fillRect(x - w1, y1 - 2, w1 * 2, 4);
    }
    // 顶端钻头
    const topY = y - 14 - body;
    ctx.fillStyle = P.lite;
    ctx.beginPath();
    ctx.moveTo(x, topY - 22);
    ctx.lineTo(x + r * .3, topY + 4);
    ctx.lineTo(x - r * .3, topY + 4);
    ctx.closePath(); ctx.fill();
    // 冰壳 / 冰柱
    ctx.globalAlpha = .5; ctx.fillStyle = '#d8f4ff';
    ctx.fillRect(x - r * .9, y - 16, r * 1.8, 3);
    for(let i=0;i<4;i++) ctx.fillRect(x - r * .8 + i * (r * .5), y - 15, 2, 5 + (i % 2) * 4);
    ctx.globalAlpha = 1;
    // 警示灯：每 2.6 秒闪一次
    const bp = (t % 2.6) / 2.6;
    if(bp < .22){
      ctx.globalAlpha = .9 * (1 - bp / .22); ctx.fillStyle = '#ff6a7a';
      ctx.fillRect(x - 2, topY - 27, 4, 4);
      ctx.globalAlpha = 1;
    }
    // 冷雾：2 个缓慢上下浮动的圆
    for(let i=0;i<2;i++){
      const ph = (t * .16 + i * .5) % 1;
      const rr = 12 + ph * 20;
      ctx.globalAlpha = (1 - ph) * .10; ctx.fillStyle = '#cfeaff';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(t * .6 + i) * 14, y - 20 - ph * h * .7, rr, rr * .7, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  /* ④ 熔岩工厂：熔炉残骸 —— 熔口脉冲 + 余烬上飘 */
  if(pr.kind === 'furnace'){
    // 基座（压在地面上）
    ctx.fillStyle = P.dark; ctx.fillRect(x - r * 1.02, y - h * .18, r * 2.04, h * .18);
    // 炉体
    ctx.fillStyle = P.base; ctx.fillRect(x - r, y - h * .78, r * 2, h * .62);
    // 顶部平台
    ctx.fillStyle = P.lite; ctx.fillRect(x - r * 1.06, y - h * .84, r * 2.12, h * .07);
    ctx.fillStyle = P.dark; ctx.fillRect(x - r * 1.06, y - h * .77, r * 2.12, 2);
    // 砖缝
    ctx.globalAlpha = .40; ctx.fillStyle = P.dark;
    for(let i=1;i<5;i++) ctx.fillRect(x - r, y - h * .78 + i * h * .13, r * 2, 2);
    for(let i=0;i<4;i++) ctx.fillRect(x - r * .55 + i * r * .5, y - h * .76, 2, h * .55);
    ctx.globalAlpha = 1;
    // 烟囱：从炉顶直接长出去（断口在顶部）
    ctx.fillStyle = P.dark; ctx.fillRect(x + r * .14, y - h * 1.1, r * .52, h * .28);
    ctx.fillStyle = P.base; ctx.fillRect(x + r * .18, y - h * 1.08, r * .22, h * .24);
    ctx.fillStyle = '#120a07'; ctx.fillRect(x + r * .14, y - h * 1.1, r * .52, 5);
    // 破损缺口（落在炉体内部）
    ctx.fillStyle = '#150c08';
    ctx.beginPath();
    ctx.moveTo(x - r * .96, y - h * .74);
    ctx.lineTo(x - r * .5, y - h * .72);
    ctx.lineTo(x - r * .62, y - h * .5);
    ctx.lineTo(x - r * .96, y - h * .54);
    ctx.closePath(); ctx.fill();
    // 熔口：慢脉冲
    const pl = .55 + .45 * Math.sin(t * 1.6);
    ctx.globalAlpha = .55 + pl * .45; ctx.fillStyle = P.glow;
    ctx.fillRect(x - r * .42, y - h * .44, r * .76, h * .2);
    ctx.globalAlpha = .25 + pl * .3; ctx.fillStyle = '#ffd08a';
    ctx.fillRect(x - r * .3, y - h * .40, r * .5, h * .1);
    ctx.globalAlpha = .08 + pl * .07; ctx.fillStyle = P.glow;
    ctx.beginPath(); ctx.ellipse(x, y - 2, r * 1.35, r * .45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // 余烬
    for(let i=0;i<3;i++){
      const ph = (t * .34 + i * .33) % 1;
      ctx.globalAlpha = (1 - ph) * .7;
      ctx.fillStyle = i % 2 ? '#ffb066' : '#ff7a3c';
      ctx.fillRect(x - r * .5 + Math.sin(t * 1.3 + i * 2) * 10, y - h * .62 - ph * h * .55, 2, 2);
    }
    ctx.globalAlpha = 1;
    return;
  }

  /* ⑤ 虚空核心：悬浮核心碑 —— 上下浮动 + 符文环旋转 */
  if(pr.kind === 'obelisk'){
    const bob = Math.sin(t * .8) * 5;
    ctx.globalAlpha = .26; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y, r * .9, r * .3, 0, 0, TAU); ctx.fill();
    const pl = .5 + .5 * Math.sin(t * 1.1);
    ctx.globalAlpha = .10 + pl * .08; ctx.fillStyle = P.glow;
    ctx.beginPath(); ctx.ellipse(x, y - h * .5 + bob, r * 1.7, h * .36, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // 碑体：一枚竖直的尖锐碎片（左暗面 + 右受光面 + 中缝发光）
    const top = y - h - bob, bot = y - h * .16 - bob;
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ctx.moveTo(x, top);                        // 尖端
    ctx.lineTo(x + r * .62, top + h * .55);    // 右肩（最宽处）
    ctx.lineTo(x + r * .50, bot);              // 底边略收
    ctx.lineTo(x - r * .50, bot);
    ctx.lineTo(x - r * .62, top + h * .55);    // 左肩
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.base;
    ctx.beginPath();
    ctx.moveTo(x + r * .04, top + 4);
    ctx.lineTo(x + r * .56, top + h * .56);
    ctx.lineTo(x + r * .44, bot - 2);
    ctx.lineTo(x + r * .04, bot - 2);
    ctx.closePath(); ctx.fill();
    // 裂面
    ctx.strokeStyle = P.dark; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - r * .1, top + h * .2); ctx.lineTo(x - r * .28, top + h * .58);
    ctx.moveTo(x + r * .12, top + h * .3); ctx.lineTo(x + r * .2, top + h * .72);
    ctx.stroke();
    // 内芯
    ctx.globalAlpha = .45 + pl * .4; ctx.fillStyle = P.glow;
    ctx.beginPath();
    ctx.moveTo(x, top + h * .12);
    ctx.lineTo(x + r * .13, top + h * .46);
    ctx.lineTo(x + r * .07, bot - 4);
    ctx.lineTo(x - r * .05, bot - 4);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // 符文环：一圈虚线椭圆 + 缓慢旋转的刻度
    const rot = t * .5, ringY = y - h * .42 + bob;
    ctx.globalAlpha = .22 + pl * .14;
    ctx.strokeStyle = P.glow; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, ringY, r * 1.5, r * .38, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = P.glow;
    for(let i=0;i<10;i++){
      const a = rot + i * TAU / 10;
      ctx.globalAlpha = .30 + .26 * Math.sin(t * 2 + i);
      ctx.fillRect(x + Math.cos(a) * r * 1.5 - 2, ringY + Math.sin(a) * r * .38 - 2, 4, 4);
    }
    // 漂浮碎片
    ctx.globalAlpha = .55; ctx.fillStyle = P.lite;
    for(let i=0;i<3;i++){
      ctx.fillRect(x + (i - 1) * r * 1.25, y - h * .3 + Math.sin(t * .7 + i * 1.9) * 9, 5, 5);
    }
    ctx.globalAlpha = 1;
    return;
  }
}

/* 主地标的地面光：[颜色, 半径, 亮度]（按关卡索引） */
const LM_LIGHT = [
  ['#ff9a4a', 96, .26],    // 废土：残骸余温
  ['#57e0ff', 132, .30],   // 霓虹：广告牌落光
  ['#9fe8ff', 104, .22],   // 冰原：钻塔冷光
  ['#ff7a3c', 120, .32],   // 熔岩：熔口火光
  ['#c77dff', 112, .30]    // 虚空：核心辉光
];

function drawShadow(x, y, w, a){
  const t = shadowTex();
  const ww = w * 2.6, hh = ww * .40;
  ctx.globalAlpha = clamp((a || .36) * 1.05, 0, 1);
  ctx.drawImage(t, x - ww / 2, y - hh / 2, ww, hh);
  ctx.globalAlpha = 1;
}

/* 流光扫过：把斜带按剪影遮罩裁出来，再叠加 */
function drawFlowSweep(sk, f, bx, by){
  const W = SKIN_W, H = sk.h || SKIN_BODY_H;
  const period = 2.0;
  const ph = (G.t % period) / period;
  const off = -30 + ph * (W + 60);
  flowX.setTransform(1, 0, 0, 1, 0, 0);
  flowX.globalCompositeOperation = 'source-over';
  flowX.clearRect(0, 0, W, flowC.height);
  flowX.drawImage(sk.stripe, off, 0);
  flowX.globalCompositeOperation = 'destination-in';
  flowX.drawImage(f ? sk.silL : sk.sil, 0, 0);
  flowX.globalCompositeOperation = 'source-over';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .38;
  ctx.drawImage(flowC, 0, 0, W, H, bx, by, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ── 像素枪械造型：对照军械图集的造型语言 ──
   L 枪管长 / H 机匣高 / mz 枪口位置 / c 主色 / a 高光 / d 暗部 */
const GUNART = {
  rifle:   { s:'rifle',   L:20, H:6, mz:22, c:'#4c5a6e', a:'#9fd8ff', d:'#1d232c' },
  shotgun: { s:'shotgun', L:20, H:6, mz:21, c:'#6a4a2a', a:'#ffb45c', d:'#2a2018' },
  sniper:  { s:'sniper',  L:26, H:6, mz:28, c:'#3a3350', a:'#c8a0ff', d:'#171f2c' },
  smg:     { s:'smg',     L:17, H:6, mz:19, c:'#2c4457', a:'#8fe3ff', d:'#1d232c' },
  launcher:{ s:'launcher',L:18, H:9, mz:21, c:'#4a3a2a', a:'#ff8a5c', d:'#2c2118' },
  arc:     { s:'arc',     L:14, H:8, mz:20, c:'#22424f', a:'#b9f2ff', d:'#1b2a33' },
  pistol:  { s:'pistol',  L:10, H:4, mz:14, c:'#46536b', a:'#ffe07a', d:'#232c3c' },
  revolver:{ s:'revolver',L:12, H:5, mz:20, c:'#5a4326', a:'#ffb84d', d:'#241a10' },
  minigun: { s:'minigun', L:15, H:6, mz:20, c:'#5e6676', a:'#ff9d5c', d:'#252b36' },
  flamer:  { s:'flamer',  L:14, H:6, mz:21, c:'#4b3a30', a:'#ff7a3c', d:'#241a14' },
  laser:   { s:'laser',   L:18, H:4, mz:23, c:'#2f4a5e', a:'#7ef0ff', d:'#16232e' },
  plasma:  { s:'plasma',  L:13, H:7, mz:22, c:'#3c2e5e', a:'#c08cff', d:'#1b1428' },
  frost:   { s:'frost',   L:14, H:5, mz:19, c:'#2e4a58', a:'#9fe8ff', d:'#152229' },
  rail:    { s:'rail',    L:22, H:4, mz:26, c:'#39465e', a:'#bfe6ff', d:'#1a2130' },
  bow:     { s:'bow',     L:14, H:7, mz:14, c:'#2e5a48', a:'#8ef0c0', d:'#16261f' },
  nailgun: { s:'nail',    L:12, H:5, mz:22, c:'#4e4638', a:'#ffd0a0', d:'#221d16' },
  acid:    { s:'acid',    L:12, H:6, mz:18, c:'#3a4a2a', a:'#a8e05a', d:'#1a2112' },
  orbgun:  { s:'orb',     L:12, H:7, mz:21, c:'#343a5e', a:'#a0a8ff', d:'#171a2a' }
};

function drawGunArt(A){
  const c = A.c, a = A.a, d = A.d, L = A.L;
  const P = function(x, y, w, h, col){ ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

  if(A.s === 'rifle'){
    P(0,-2,4,5,d);                                   /* 枪托 */
    P(2,-3,10,6,d); P(3,-3,9,5,c); P(3,-3,9,1,a);    /* 机匣 */
    P(3,-4,9,1,'#33404f');                           /* 顶部导轨 */
    P(6,-6,5,2,d); P(7,-6,3,1,a);                    /* 小瞄具 */
    P(12,-2,8,3,d); P(13,-1,7,1,a);                  /* 枪管 */
    P(20,-2,2,3,a);                                  /* 消焰器 */
    P(5,3,4,6,d); P(6,4,3,4,'#2a3442');              /* 弹匣 */
    P(3,3,2,3,d);

  } else if(A.s === 'shotgun'){
    P(0,-1,4,6,'#3a2a1c');                           /* 木托 */
    P(3,-2,9,5,'#5a3f24'); P(4,-2,7,4,c);
    P(11,-3,9,2,d); P(11,0,9,2,d);                   /* 双管 */
    P(12,-3,7,1,a); P(12,0,7,1,a);
    P(13,2,5,3,'#3a2a1c');                           /* 泵柄 */
    P(19,-3,2,5,a);                                  /* 枪口 */
    P(4,-3,3,1,'#ffd0a0');

  } else if(A.s === 'sniper'){
    P(0,-2,4,6,d);
    P(1,-3,9,6,d); P(2,-3,8,5,c); P(2,-3,8,1,a);
    P(6,-1,20,2,d); P(7,0,18,1,a);                   /* 长枪管 */
    P(25,-1,2,2,a);
    P(4,-7,9,3,d); P(5,-6,7,1,a);                    /* 大瞄具 */
    P(12,-6,2,2,'#e0c8ff');
    P(4,3,4,5,d); P(5,4,3,3,'#2a2440');              /* 弹匣 */
    P(14,2,1,4,d); P(18,2,1,4,d);                    /* 两脚架 */

  } else if(A.s === 'smg'){
    P(1,-3,9,6,d); P(2,-3,8,5,c); P(2,-3,8,1,a);
    P(10,-1,7,2,d); P(11,0,6,1,a);
    P(5,3,3,6,d); P(6,4,2,4,'#22323f');              /* 弯弹匣 */
    P(13,1,2,4,d);                                   /* 前握把 */
    P(8,-4,3,1,a);                                   /* 拉机柄 */
    P(3,-1,2,2,'#1a2836');

  } else if(A.s === 'launcher'){
    P(1,-5,16,10,d); P(2,-4,14,8,c); P(2,-4,14,1,a);
    P(17,-5,3,10,d); P(18,-4,2,8,a);                 /* 枪口环 */
    ctx.fillStyle = '#3a2c1e';
    ctx.beginPath(); ctx.arc(8, 0, 4.2, 0, TAU); ctx.fill();   /* 弹鼓 */
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.arc(8, 0, 2.2, 0, TAU); ctx.fill();
    P(4,5,4,5,d);                                    /* 握把 */
    P(2,-5,3,1,'#ffd08a');

  } else if(A.s === 'arc'){
    P(1,-4,7,8,d); P(2,-4,6,6,c); P(2,-4,6,1,'#4a7a8a');
    P(8,-3,9,6,d); P(8,-2,9,4,c);                    /* 粗枪管 */
    P(9,-5,1,2,a); P(12,-5,1,2,a); P(15,-5,1,2,a);   /* 上排线圈齿 */
    P(9,3,1,2,a); P(12,3,1,2,a); P(15,3,1,2,a);      /* 下排线圈齿 */
    P(17,-2,2,4,a); P(19,-1,2,2,'#eaffff');          /* 发射口 */
    P(3,3,4,5,d);

  } else if(A.s === 'pistol'){
    P(2,-4,L,4,d); P(3,-4,L-1,3,c); P(2,-4,L,1,a);
    P(2+L,-3,3,2,d);
    P(3,0,4,5,d); P(4,0,3,4,'#2a3346'); P(7,0,4,1,d);
    P(2,-3,2,2,a);

  } else if(A.s === 'revolver'){
    P(2,-3,10,6,d); P(3,-3,9,5,c);
    P(4,-6,5,7,a); P(5,-5,3,5,'#3a2a16');
    P(12,-2,8,3,d); P(13,-2,7,2,a);
    P(3,2,4,6,'#4a3420'); P(4,2,2,5,'#5f4529');
    P(2,-3,2,2,a);

  } else if(A.s === 'minigun'){
    P(1,-6,8,12,d); P(2,-5,6,10,c);
    P(5,-5,L,3,d); P(5,-1,L,3,d); P(5,3,L,3,d);      /* 三根粗枪管 */
    P(5,-5,L,1,a); P(5,1,L,1,a); P(5,5,L,1,a);
    P(8,-6,2,13,'#3c4553'); P(15,-6,2,13,'#3c4553'); /* 两组束环 */
    P(8,-6,2,1,a); P(15,-6,2,1,a);
    P(1,4,4,6,d);

  } else if(A.s === 'flamer'){
    P(0,-6,7,12,d); P(1,-5,5,10,c); P(1,-5,5,2,a);
    P(7,-2,7,4,d); P(8,-1,6,2,c);
    P(14,-4,4,8,d); P(15,-3,3,6,'#3a2a20');
    P(18,-4,2,2,a); P(18,2,2,2,a);
    P(3,5,4,5,d);
    P(19,-1,2,2,'#ffe0a0');

  } else if(A.s === 'laser'){
    P(1,-4,8,8,d); P(2,-4,7,6,c); P(2,-4,7,1,a);
    P(8,-2,L+4,3,d); P(9,-1,L+2,1,a);
    P(8+L+2,-3,3,6,d); P(9+L+2,-2,2,4,a);
    P(4,-6,5,2,a);
    P(2,1,4,6,d);

  } else if(A.s === 'plasma'){
    P(1,-5,9,10,d); P(2,-5,8,8,c);
    P(10,-6,8,12,d); P(11,-5,6,10,'#2a2044');
    P(12,-4,4,8,a); P(13,-3,2,6,'#f0e6ff');
    P(1,-5,8,1,a);
    P(3,4,4,6,d);
    P(18,-2,3,4,a);

  } else if(A.s === 'frost'){
    P(1,-5,6,11,d); P(2,-5,4,9,c);
    P(4,-5,2,9,a);
    P(7,-2,8,4,d); P(8,-1,7,2,c);
    P(14,-2,3,3,a); P(17,-1,2,2,'#eaffff');
    P(3,5,4,5,d);

  } else if(A.s === 'rail'){
    P(1,-4,7,9,d); P(2,-4,6,7,c);
    P(8,-3,L+2,2,d); P(9,-3,L,1,'#55697f');
    P(8,2,L+2,2,d); P(9,2,L,1,'#55697f');
    P(11,-1,L-4,3,'#1a2434'); P(12,0,L-6,1,a);
    P(8+L,-4,3,9,d); P(9+L,-3,2,7,a);
    P(2,3,4,6,d);

  } else if(A.s === 'bow'){
    P(4,-9,3,6,c); P(6,-11,2,3,c);
    P(4,4,3,6,c); P(6,9,2,3,c);
    P(8,-10,1,3,a); P(8,8,1,3,a);
    P(9,-7,2,14,a);
    P(-2,-1,13,2,d); P(0,0,10,1,a);
    P(4,-2,3,5,d);
    P(11,-2,3,5,c);

  } else if(A.s === 'nail'){
    P(1,-4,8,7,d); P(2,-4,7,5,c);
    P(9,-2,L,3,d); P(10,-1,L-2,1,a);
    P(2,2,5,5,d); P(3,3,3,4,'#3a3324');
    P(2,4,3,1,a);

  } else if(A.s === 'acid'){
    P(1,-6,7,12,d); P(2,-5,5,10,c);
    P(3,-4,2,2,a); P(4,1,2,2,a);
    P(8,-2,6,4,d); P(9,-1,5,2,c);
    P(14,-3,3,5,d); P(15,-2,2,3,a);
    P(3,5,4,5,d);

  } else if(A.s === 'orb'){
    P(1,-5,9,10,d); P(2,-5,8,8,c);
    P(10,-4,5,8,d); P(11,-3,3,6,'#252a44');
    P(13,-5,4,2,a); P(13,4,4,2,a);
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.arc(17, 0, 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef0ff';
    ctx.beginPath(); ctx.arc(17.6, -.8, 1.6, 0, TAU); ctx.fill();
    P(2,3,4,6,d);
  }
}

/* 枪械本体：以 (0,0) 为握把、枪口朝 +x 绘制 */
function drawGunShape(w){
  const c = w.c;
  const A = GUNART[w.id];
  if(A){ drawGunArt(A); return; }

  if(w.id === 'sniper'){
    ctx.fillStyle = '#171f2c'; ctx.fillRect(3, -2, 24, 4);
    ctx.fillStyle = '#5c6a80'; ctx.fillRect(8, -5, 6, 3);
    ctx.fillStyle = c;         ctx.fillRect(4, -1.5, 7, 3);
    ctx.fillStyle = c;         ctx.fillRect(23, -1, 5, 2);
  } else if(w.id === 'shotgun'){
    ctx.fillStyle = '#2a2018'; ctx.fillRect(3, -2.5, 17, 5);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(5, 2, 7, 3);
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(5, 2, 7, 1);
    ctx.fillStyle = c;         ctx.fillRect(15, -2, 7, 4);
    ctx.fillStyle = '#ffe0b0'; ctx.fillRect(20, -1, 3, 2);
  } else if(w.id === 'smg'){
    ctx.fillStyle = '#1d232c'; ctx.fillRect(3, -2, 12, 4);
    ctx.fillStyle = '#151a22'; ctx.fillRect(4, 2, 3, 5);
    ctx.fillStyle = c;         ctx.fillRect(13, -1.5, 4, 3);
    ctx.fillStyle = '#2a3442'; ctx.fillRect(3, -2, 12, 1);
  } else if(w.id === 'launcher'){
    ctx.fillStyle = '#2c2118'; ctx.fillRect(2, -3.5, 16, 7);
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(4, 3, 5, 4);
    ctx.fillStyle = '#3a2c1e'; ctx.fillRect(4, 3, 5, 1);
    ctx.fillStyle = c;         ctx.fillRect(16, -2.5, 6, 5);
    ctx.fillStyle = '#ffd08a'; ctx.fillRect(19, -1.5, 3, 3);
  } else if(w.id === 'arc'){
    ctx.fillStyle = '#1b2a33'; ctx.fillRect(2, -2, 14, 4);
    ctx.fillStyle = '#283f4a'; ctx.fillRect(2, -2, 14, 1);
    ctx.fillStyle = c;         ctx.fillRect(13, -3.5, 5, 7);
    ctx.fillStyle = '#eaffff'; ctx.fillRect(15, -1.5, 3, 3);
  } else {
    ctx.fillStyle = '#1d232c'; ctx.fillRect(2, -2, 13, 3);
    ctx.fillStyle = '#4c5a6e'; ctx.fillRect(2, -2, 13, 1);
    ctx.fillStyle = '#12171e'; ctx.fillRect(4, 1, 3, 3);
    ctx.fillStyle = c;         ctx.fillRect(14, -1.5, 4, 3);
  }

}

/* 手持武器：独立图层 —— 按瞄准方向旋转 + 左向垂直翻转 + 枪口火光 */
function drawGun(sx, sy, angle){
  const w = WEP();
  const left = Math.cos(angle) < 0;
  ctx.save();
  ctx.translate(sx, sy - BULLET_H);
  ctx.rotate(Math.atan2(Math.sin(angle) * KZ, Math.cos(angle)));
  if(left) ctx.scale(1, -1);          /* 左向时上下翻转，枪身不会倒过来 */

  const f = SPRM.frames['g_' + w.id];
  const gsc = .80;                       /* 与 32px 主角的比例：枪身略收一点 */
  if(f){
    ctx.save();
    ctx.scale(gsc, gsc);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, -10, -11, f.w, f.h);
    ctx.restore();
  } else {
    drawGunShape(w);
  }

  const mz = gunMuzzleLength(w) - 2;
  if(G.p.flashT > 0){
    const k = clamp(G.p.flashT / .07, .35, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const R2 = 15 * k;
    const g2 = ctx.createRadialGradient(mz + 2, 0, 0, mz + 2, 0, R2);
    g2.addColorStop(0, 'rgba(255,255,245,.95)');
    g2.addColorStop(.30, hexA(w.c, .80));
    g2.addColorStop(1, hexA(w.c, 0));
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(mz + 2, 0, R2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,220,.95)';
    const sp = 8 * k;
    ctx.beginPath();
    ctx.moveTo(mz + 2 + sp, 0);
    ctx.lineTo(mz + 3, -2.6 * k);
    ctx.lineTo(mz - 3 * k, 0);
    ctx.lineTo(mz + 3, 2.6 * k);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* 商城缩略图：把枪械画进小画布 */
function weaponIconURL(w){
  const c = document.createElement('canvas');
  c.width = 100; c.height = 46;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const f = SPRM.frames['g_' + w.id];
  if(f){
    const k = 1.95;
    g.drawImage(f.img, f.x, f.y, f.w, f.h, 6, (46 - f.h * k) / 2, f.w * k, f.h * k);
    return c.toDataURL();
  }
  const old = ctx;
  ctx = g;
  g.save();
  g.translate(4, 23);
  g.scale(1.8, 1.8);
  drawGunShape(w);
  g.restore();
  ctx = old;
  return c.toDataURL();
}

function drawHero(x, y, faceAngle, moving, anim){
  const sk = SKIN();
  const si = Math.min(22, G.skin | 0);
  const fa = faceAngle || 0;
  const di = heroDir(fa);
  const sx = Math.round(x), sy = Math.round(y);
  const aim = G.p.flashT > 0 ? G.p.shotAngle : G.p.aimAngle;

  /* 场景光照采样：站在阴影里整体压暗，靠近火光偏暖 */
  let lum = 1, warm = 0;
  if(STAGE3D && STAGE3D.isReady()){
    const L = STAGE3D.lightAt(G.p.x, G.p.y);
    lum = L.lum; warm = L.warm;
  }
  lum = clamp(lum, .58, 1.15);
  const accent = sk.flow || '#8ff0ff';

  /* ① 脚下光圈：径向渐变 + 呼吸，像踩在一块发光地砖上。
     高亮地面（冰面 / 熔岩）上叠加同色光会"消失"，改用关卡对比色 */
  const pulse = .78 + .22 * Math.sin(G.t * 2.6 + si);
  const ringCol = (G.stage === 2 || G.stage === 3) ? (HERO_SEP[G.stage] || HERO_SEP[0]).rim : accent;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createRadialGradient(sx, sy - 2, 0, sx, sy - 2, 34);
  hg.addColorStop(0, hexA(ringCol, .22 * pulse * lum));
  hg.addColorStop(.45, hexA(ringCol, .09 * pulse * lum));
  hg.addColorStop(1, hexA(ringCol, 0));
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(sx, sy - 1, 34, 14, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = hexA(ringCol, .26 * pulse);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy - 1, 13 + pulse * 2, 6 + pulse, 0, 0, TAU); ctx.stroke();
  ctx.restore();

  /* ② 接触阴影：multiply 压暗地面 */
  drawAO(sx, sy + 1, 14, .46 * lum, .40);

  const frameIdx = moving ? [1, 2, 3, 2][Math.floor(anim) % 4] : 0;
  const name = 'h' + pad2(si) + '_' + di + '_' + frameIdx;

  /* 图集缺失时的兜底：旧的身体 / 腿部位图 */
  if(!SPRM.ready){
    const leg = sk.legs[moving ? 'run2' : 'stand'] || sk.legs.stand;
    const f = Math.cos(fa) < 0;
    ctx.drawImage(f ? leg.l : leg.r, sx - 13, sy - leg.h);
    ctx.drawImage(f ? sk.body.l : sk.body.r, sx - 13, sy - 7 - (sk.h || SKIN_BODY_H));
    drawGun(x, y, aim);
    return;
  }

  /* ③ 残影 */
  if(moving) trailPush(name, sx, sy, accent);
  trailDraw();

  const bx = sx - 16, by = sy - 30;
  const aimingUp = Math.sin(aim) < -.20;
  const sep = HERO_SEP[G.stage] || HERO_SEP[0];

  ctx.globalAlpha = lum;
  if(aimingUp) drawGun(x, y, aim);

  /* 深色分离轮廓：往 4 个方向各偏 1px 铺一层暗剪影，
     让浅色主角在冰面 / 熔岩这种高亮地面上仍然"贴得住" */
  if(sep.dark > 0){
    const dm = SPRM.tintOf(name, '#0a1020');
    if(dm){
      ctx.globalAlpha = sep.dark * lum;
      ctx.drawImage(dm, bx - 1, by);
      ctx.drawImage(dm, bx + 1, by);
      ctx.drawImage(dm, bx, by - 1);
      ctx.drawImage(dm, bx, by + 1);
      ctx.globalAlpha = lum;
    }
  }

  drawFrame(name, bx, by);
  rimLight(name, bx, by, 32, 32, sep.rim, sep.a);

  /* 受击：红色剪影叠加 */
  if(G.p.hurtT > 0){
    const m = SPRM.tintOf(name, '#ff3a2a');
    if(m){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .40 * clamp(G.p.hurtT / .3, 0, 1);
      ctx.drawImage(m, bx, by);
      ctx.restore();
    }
  }
  /* 无敌闪烁 */
  if(G.p.inv > 0 && Math.floor(G.t * 20) % 2 === 0){
    const m = SPRM.whiteOf(name);
    if(m){ ctx.globalAlpha = .22; ctx.drawImage(m, bx, by); ctx.globalAlpha = lum; }
  }
  /* 流光扫过 */
  if(accent) flowSweep(name, bx, by, accent, 32, 32, di);

  /* 环境色温（火光 / 霓虹）压在角色上 —— 用剪影遮罩，不糊到空气里 */
  if(warm > .05 || warm < -.05){
    const m = SPRM.tintOf(name, warm > 0 ? '#ffb060' : '#5a8ac0');
    if(m){
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(.40, Math.abs(warm));
      ctx.drawImage(m, bx, by);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  if(!aimingUp) drawGun(x, y, aim);
}

/* ══════════ 机甲形态：光之巨人 ══════════ */
const MEC = {
  edge:'#20293a', dark:'#8c9bb0', body:'#cfd9e6', lite:'#eef5fc',
  purple:'#6a4a9e', purple2:'#452f70', red:'#c8384a', red2:'#8e2434',
  eye:'#ffe14a', core:'#7fe3ff', coreHot:'#ff5a4a', gold:'#ffd75e'
};

function drawMechSprite(x, y, faceAngle, moving, anim, atkT){
  const sx = Math.round(x), sy = Math.round(y);
  const fa = faceAngle || 0;
  const f = Math.cos(fa) < 0;
  const vy = Math.sin(fa);
  const attacking = atkT > 0, mech = currentMech();

  // 场景光照采样
  let lum = 1;
  if(STAGE3D && STAGE3D.isReady()){
    lum = STAGE3D.lightAt(G.p.x, G.p.y).lum;
  }

  drawAO(sx, sy + 1, 20, .50 * lum, .42);
  // A ground ring keeps the player visible in crowds and warms as the form expires.
  const ringColor = G.mechT < 6 ? '#ffa253' : mech.color;
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = hexA(ringColor,.42);
  ctx.beginPath(); ctx.ellipse(sx, sy, 23, 8, 0, 0, TAU); ctx.stroke();
  const rot = G.t * 1.5;
  ctx.strokeStyle = hexA(ringColor,.8);
  for(let i = 0; i < 2; i++){
    ctx.beginPath();
    ctx.ellipse(sx, sy, 26, 9, 0, rot + i*Math.PI, rot + i*Math.PI + .78);
    ctx.stroke();
  }
  ctx.restore();

  const stride = moving && Math.floor(anim*.65)%2 ? 1 : 0;
  const name = 'giant' + ((vy < -.3 ? 2 : 0) + stride);
  const frame = SPRM.frames[name];
  if(!frame){
    drawMechFallback(sx,sy,f,vy,moving,anim,attacking,lum);
    drawMechGear(sx,sy,fa,mech,attacking);
    return;
  }
  const scale = mech.size, size = 96 * scale;
  const recoil = attacking && !reducedEffects ? 1 : 0;
  ctx.save();
  ctx.translate(sx,sy - stride);
  ctx.scale(f ? -1 : 1,1);
  const left = -48 * scale - recoil, top = -92 * scale;
  if(QLEVEL > 0) rimLight(name,left,top,size,size,HERO_SEP[G.stage].rim,.25);
  ctx.globalAlpha = .88 + .12 * lum;
  ctx.drawImage(frame.img,frame.x,frame.y,frame.w,frame.h,left,top,size,size);
  ctx.restore();
  drawMechGear(sx,sy,fa,mech,attacking);
}

function drawMechFallback(sx,sy,f,vy,moving,anim,attacking,lum){
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(f ? -1 : 1, 1);

  const st = moving ? (Math.floor(anim) % 4) : 0;
  const bobY = moving ? [0, -1, 0, -1][st] : 0;
  const fLift = moving ? [0, -2, 0, 0][st] : 0;
  const bLift = moving ? [0, 0, 0, -2][st] : 0;
  // 攻击时上身微后座，上下朝向影响整体高度（8 方向姿态）
  const y0 = bobY + (attacking ? -1 : 0) - vy * 1.5;

  ctx.globalAlpha = Math.max(.5, lum);
  function R(a, b, w, h, c){ ctx.fillStyle = c; ctx.fillRect(a, b + y0, w, h); }

  // ── 腿 ──
  R(-10, -20 + bLift, 8, 15, MEC.body);
  R(-10, -20 + bLift, 2, 15, MEC.lite);
  R(-10, -9 + bLift, 8, 6, MEC.dark);
  R(-11, -3 + bLift, 10, 4, MEC.body);
  R(-11, -1 + bLift, 10, 1, MEC.edge);
  R(2, -20 + fLift, 8, 15, MEC.body);
  R(8, -20 + fLift, 2, 15, MEC.dark);
  R(2, -9 + fLift, 8, 6, MEC.dark);
  R(2, -3 + fLift, 10, 4, MEC.body);
  R(2, -1 + fLift, 10, 1, MEC.edge);
  // 大腿红纹
  R(-9, -19 + bLift, 2, 7, MEC.red2);
  R(7, -19 + fLift, 2, 7, MEC.red2);

  // ── 髋 ──
  R(-10, -23, 20, 4, MEC.dark);
  R(-10, -23, 20, 1, MEC.body);
  R(-3, -24, 6, 2, MEC.edge);

  // ── 躯干 ──
  R(-10, -37, 20, 15, MEC.body);
  R(-10, -37, 3, 15, MEC.lite);
  R(7, -37, 3, 15, MEC.dark);
  R(-10, -24, 20, 2, MEC.edge);

  // 胸口紫纹（V 形护甲）
  R(-8, -35, 6, 3, MEC.purple);
  R(2, -35, 6, 3, MEC.purple);
  R(-6, -32, 4, 3, MEC.purple2);
  R(2, -32, 4, 3, MEC.purple2);
  R(-8, -35, 2, 1, '#9d7fce');
  R(6, -35, 2, 1, '#9d7fce');

  // 腰带红纹
  R(-10, -27, 20, 3, MEC.red);
  R(-10, -27, 20, 1, '#e0606e');
  R(-3, -27, 6, 3, MEC.gold);

  // 彩色计时器
  const low = G.mechT > 0 && G.mechT < 10;
  const blink = low ? (.5 + .5 * Math.sin(G.t * 16)) : 1;
  const pulse = .8 + Math.sin(G.t * 6) * .2;
  const cc = low ? MEC.coreHot : MEC.core;
  ctx.globalAlpha = .22 * blink * pulse;
  ctx.fillStyle = cc;
  ctx.beginPath(); ctx.arc(0, -32, 9, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = MEC.edge;
  ctx.beginPath(); ctx.arc(0, -32, 4.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = blink;
  ctx.fillStyle = cc;
  ctx.beginPath(); ctx.arc(0, -32, 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-1, -33, 1.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // ── 肩甲 ──
  R(-16, -38, 7, 9, MEC.body);
  R(-16, -38, 7, 1, MEC.lite);
  R(-16, -38, 2, 9, MEC.dark);
  R(-16, -33, 7, 4, MEC.purple);
  R(9, -38, 7, 9, MEC.body);
  R(9, -38, 7, 1, MEC.lite);
  R(14, -38, 2, 9, MEC.dark);
  R(9, -33, 7, 4, MEC.red);

  // ── 手臂 ──
  R(-16, -30, 6, 11, MEC.body);
  R(-16, -30, 2, 11, MEC.lite);
  R(-16, -20, 6, 6, MEC.dark);
  R(-16, -15, 6, 2, MEC.edge);
  R(10, -30, 6, 11, MEC.body);
  R(14, -30, 2, 11, MEC.dark);
  R(10, -20, 6, 6, MEC.dark);
  R(10, -15, 6, 2, MEC.edge);

  // ── 颈 ──
  R(-3, -42, 6, 5, MEC.dark);
  R(-3, -42, 6, 1, MEC.edge);

  // ── 头 ──
  R(-7, -53, 14, 12, MEC.body);
  R(-7, -53, 14, 2, MEC.lite);
  R(-7, -53, 2, 12, MEC.dark);
  R(5, -53, 2, 12, MEC.dark);
  R(-7, -42, 14, 1, MEC.edge);
  // 头冠鳍（两侧向外斜扬 + 中央短鳍）
  R(-8, -56, 2, 4, MEC.body);
  R(-9, -59, 2, 4, MEC.body);
  R(-10, -62, 2, 4, MEC.lite);
  R(6, -56, 2, 4, MEC.body);
  R(7, -59, 2, 4, MEC.body);
  R(8, -62, 2, 4, MEC.lite);
  R(-2, -58, 4, 6, MEC.body);
  R(-1, -59, 2, 2, MEC.lite);
  // 面部凹槽
  R(-5, -51, 10, 8, '#9fabbd');
  // 眼睛（黄白发光 + 眼下阴影）
  R(-5, -50, 4, 3, MEC.eye);
  R(1, -50, 4, 3, MEC.eye);
  R(-5, -50, 4, 1, '#fff8d0');
  R(1, -50, 4, 1, '#fff8d0');
  R(-5, -47, 4, 1, '#8a6a24');
  R(1, -47, 4, 1, '#8a6a24');
  // 嘴
  R(-2, -45, 4, 1, MEC.edge);

  ctx.restore();

}

function drawEnemy(e){
  const sx = Math.round(SX(e.x));
  const sy = Math.round(SY(e.y));
  const bob = e.fly ? Math.sin(G.t * 3 + e.wob) * 2.5 : 0;
  const h = e.h;
  const c = e.col;
  const kind = CampaignEnemies.sprite(e);
  const mw = MON_W[kind] || 30;
  const distinct = CampaignEnemies.rank(e.kind)>1;
  const top = MON_GY-(MON_TOP[kind] || 12);
  const sc = clamp(e.r*(distinct ? 2 : 2.62)/mw,.45,2.4);
  const heightScale=distinct ? e.h/top : sc;
  const fi = Math.floor(e.anim * 1.7) % 4;
  const name = 'm_' + kind + '_' + fi;
  const deadK = e.dead ? clamp(e.deadT / .5, 0, 1) : 0;
  const dw = 40 * sc * (1 - deadK * .12), dh = 40 * heightScale * (1 - deadK * .28);
  const dx = sx - dw / 2;
  const dy = sy - MON_GY * heightScale * (1 - deadK * .28) + bob;
  const topY = sy - top*heightScale;
  const fade = e.dead ? Math.max(0, 1 - e.deadT / .5) : (e.spawnT > 0 ? .55 : 1);

  /* 接触阴影 */
  drawAO(sx, sy + 1, e.r * 1.6, (e.dead ? .16 : .40) * (e.fly ? .55 : 1), .38);

  ctx.save();
  ctx.globalAlpha = fade;
  if(e.face < 0){
    ctx.translate(sx * 2, 0);
    ctx.scale(-1, 1);
  }

  if(!SPRM.ready){
    ctx.fillStyle = c;
    ctx.fillRect(sx - e.r, sy - h, e.r * 2, h);
    ctx.fillStyle = shade(c, .3);
    ctx.fillRect(sx - e.r * .7, sy - h - e.r * .5, e.r * 1.4, e.r * .8);
    ctx.restore();
    EnemyEffects.drawUnit(ctx,e);
    return;
  }

  const frame=SPRM.frames[name];
  if(frame) ctx.drawImage(frame.img,frame.x,frame.y,frame.w,frame.h,dx,dy,dw,dh);
  if(QLEVEL > 0 || e.elite) rimLight(name, dx, dy, dw, dh, SCENES[G.stage].accent, e.dead ? .05 : .13);

  /* 受击：整体瞬间闪白（死亡后不再闪，避免尸体变成白影） */
  if(e.flash > 0 && !e.dead){
    const m = SPRM.whiteOf(name);
    if(m){
      ctx.globalAlpha = fade * Math.min(.92, e.flash * 9);
      ctx.drawImage(m, dx, dy, dw, dh);
      ctx.globalAlpha = fade;
    }
  }
  /* 精英：金色描边光 */
  if(e.elite){
    const m = SPRM.tintOf(name, '#ffe14a');
    if(m){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * .15;
      ctx.drawImage(m, dx, dy, dw, dh);
      ctx.restore();
    }
  }
  /* 冰冻：冷色覆盖 */
  if(e.slowT > 0 && (e.slowAmt || 0) > .3){
    const m = SPRM.tintOf(name, '#9fe8ff');
    if(m){
      ctx.globalAlpha = fade * .20;
      ctx.drawImage(m, dx, dy, dw, dh);
      ctx.globalAlpha = fade;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  /* 精英标记 */
  if(e.elite && !e.dead){
    ctx.fillStyle = 'rgba(255,225,74,.85)';
    ctx.fillRect(sx - 2, topY - 12, 4, 3);
  }

  /* 血条 */
  if(!e.dead && e.hp < e.maxHp){
    const w = Math.max(16, e.r * 2);
    const bx = sx - w / 2, by = topY - (e.elite ? 9 : 5);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(bx, by, w, 2.5);
    ctx.fillStyle = e.elite ? '#ffe14a' : '#ff6a5a';
    ctx.fillRect(bx, by, w * clamp(e.hp / e.maxHp, 0, 1), 2.5);
  }

  /* 灼烧：贴身的橙色辉光 */
  if(e.burnT > 0 && !e.dead){
    const pl = .6 + .4 * Math.sin(G.t * 12 + e.wob);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .22 * pl;
    ctx.fillStyle = e.venom ? '#a8e05a' : '#ff8f5c';
    ctx.beginPath();
    ctx.ellipse(sx, sy - h * .40, e.r * 1.15, h * .52, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  EnemyEffects.drawUnit(ctx,e);
}

function drawBoss(b){
  BossModels.draw(ctx, b, Math.round(SX(b.x)), Math.round(SY(b.y)), QLEVEL, G.t, drawAO);
}

function drawOrb(o){
  const sx = SX(o.x), sy = SY(o.y) - 8 - Math.sin(G.t * 6 + o.x) * 2;
  ctx.fillStyle = 'rgba(120,255,200,.22)';
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7dffc4';
  ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#eafff5';
  ctx.fillRect(sx - 1, sy - 1, 2, 2);
}

function drawMine(m){
  const sx = SX(m.x), sy = SY(m.y);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a3038';
  ctx.beginPath(); ctx.arc(sx, sy - 3, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a7060';
  ctx.beginPath(); ctx.arc(sx, sy - 3, 3, 0, TAU); ctx.fill();
  const ready = m.arm <= 0;
  ctx.fillStyle = ready ? (Math.floor(G.t * 8) % 2 ? '#ff5a4a' : '#ffb060') : '#6a5a50';
  ctx.fillRect(sx - 1, sy - 7, 2, 2);
}

function drawTurret(t2){
  const sx = SX(t2.x), sy = SY(t2.y);
  ctx.fillStyle = 'rgba(0,0,0,.36)';
  ctx.beginPath(); ctx.ellipse(sx, sy, 9, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(sx - 7, sy - 10, 14, 10);
  ctx.fillStyle = '#5a5a68';
  ctx.fillRect(sx - 7, sy - 10, 14, 2);
  ctx.fillStyle = '#8a8a9a';
  ctx.fillRect(sx - 2, sy - 16, 4, 7);
  ctx.save();
  ctx.translate(sx, sy - 14);
  ctx.rotate(t2.ang);
  ctx.fillStyle = '#2a2a34';
  ctx.fillRect(0, -1.5, 11, 3);
  if(t2.flash > 0){ ctx.fillStyle = '#ffe9b0'; ctx.fillRect(10, -2, 5, 4); }
  ctx.restore();
  if(t2.life < 2){
    ctx.fillStyle = 'rgba(255,120,80,.8)';
    ctx.fillRect(sx - 7, sy - 13, 14 * (t2.life / 2), 1.5);
  }
}

function drawDrone(d){
  const sx = SX(d.x), sy = SY(d.y);
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.beginPath(); ctx.ellipse(sx, SY(d.y) + 14, 6, 2.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a9ac8';
  ctx.fillRect(sx - 5, sy - 12, 10, 7);
  ctx.fillStyle = '#c8d4ff';
  ctx.fillRect(sx - 5, sy - 12, 10, 2);
  ctx.fillStyle = Math.floor(G.t * 6) % 2 ? '#9dffd8' : '#eafff5';
  ctx.fillRect(sx - 1, sy - 10, 3, 3);
  ctx.fillStyle = 'rgba(180,220,255,.28)';
  ctx.fillRect(sx - 8, sy - 15, 16, 1.5);
  if(d.flash > 0){
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 3, sy - 9, 5, 3);
  }
}

function drawPortal(pt){
  const sx = SX(pt.x), sy = SY(pt.y);
  const t = pt.t;
  const color = pt.color;
  const pulse = .6 + Math.sin(t * 3) * .4;
  ctx.save();
  ctx.globalAlpha = .45 + pulse * .3;
  const grd = ctx.createRadialGradient(sx, sy - 20, 4, sx, sy - 20, 44);
  grd.addColorStop(0, hexA(color,.95));
  grd.addColorStop(.45, hexA(color,.53));
  grd.addColorStop(1, hexA(color,0));
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(sx, sy - 18, 40, 26, 0, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = hexA(color,.55 + pulse * .4);
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(sx, sy - 18, 22, 15, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = hexA(color,.7);
  ctx.lineWidth = 1.5;
  for(let i=0;i<3;i++){
    const a = t * 2.2 + i * TAU / 3;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 18, 15 + i * 4, 10 + i * 3, a, 0, Math.PI * 1.1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,250,230,.95)';
  ctx.beginPath(); ctx.ellipse(sx, sy - 18, 5, 4, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.fillStyle = color;ctx.strokeStyle='#10191b';ctx.lineWidth=3;
  ctx.font = '700 9px sans-serif';ctx.textAlign = 'center';
  ctx.strokeText(pt.name,sx,sy-44);ctx.fillText(pt.name,sx,sy-44);
  ctx.restore();
}

function drawPlayer(){
  if(!G.p) return;
  const p = G.p;
  const sx = SX(p.x), sy = SY(p.y);
  const scale = G.st.bodyScale, scaled = scale !== 1;
  if(scaled){
    ctx.save();
    ctx.translate(sx*(1-scale),sy*(1-scale));
    ctx.scale(scale,scale);
  }
  if(G.mechT > 0){
    drawMechSprite(sx, sy, p.faceAngle, p.moving, p.anim, p.atkT);
  } else {
    drawHero(sx, sy, p.faceAngle, p.moving, p.anim);
  }
  if(scaled) ctx.restore();
}

function bTrail(len, wid, col, a){
  const g = ctx.createLinearGradient(-len, 0, 0, 0);
  g.addColorStop(0, hexA(col, 0));
  g.addColorStop(.45, hexA(col, a * .38));
  g.addColorStop(1, hexA(col, a));
  ctx.fillStyle = g;
  ctx.fillRect(-len, -wid / 2, len, wid);
}

/* 每把武器自己的弹道语言 */
function drawBulletBody(b, col){
  const id = b.w;
  const br = b.r;

  if(b.mech){
    const accent = MECHS[b.mechId].color;
    ctx.globalCompositeOperation = 'lighter';
    if(b.mechId === 'barrage'){
      bTrail(13,7,accent,.7);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(0,-4); ctx.lineTo(7,0); ctx.lineTo(0,4); ctx.fill();
    } else {
      bTrail(26,12,accent,.55);
      ctx.fillStyle = accent; ctx.fillRect(-12,-2.6,18,5.2);
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(0,-1.8,9,3.6);
    }
    ctx.globalCompositeOperation = 'source-over';

  } else if(id === 'sniper' || id === 'rail' || id === 'marksman' || id === 'coilgun' || id === 'laser'){
    const L = (id === 'rail' || id === 'marksman') ? 30 : (id === 'laser' ? 24 : 26);
    ctx.globalCompositeOperation = 'lighter';
    bTrail(L, 7, col, .50);
    ctx.fillStyle = hexA(col, .9);
    ctx.fillRect(-L * .8, -br * .55, L * .80, br * 1.1);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

  } else if(id === 'micromissile' && b.homing){
    bTrail(br * 6, br * 2.6, b.seekTarget?'#5ddbb5':'#ff6e38', .72);
    ctx.fillStyle = b.seekTarget?'#95f3d4':'#ff864d';
    ctx.beginPath();
    ctx.moveTo(-br * 3, -br * 1.35);
    ctx.lineTo(0, -br * .50);
    ctx.lineTo(0, br * .50);
    ctx.lineTo(-br * 3, br * 1.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff0ca';
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.fillStyle = '#71363b';
    ctx.fillRect(-br * .6, -br * .35, br * .8, br * .7);

  } else if(id === 'launcher' || id === 'plasma' || id === 'orbgun' || id === 'micromissile'){
    const pc = id === 'launcher' || id === 'micromissile' ? '#ff7a3c' : col;
    const pl = .72 + .28 * Math.sin(G.t * 16 + b.x * .05);
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, br * 3.4 * pl);
    g2.addColorStop(0, hexA(pc, .95));
    g2.addColorStop(.35, hexA(pc, .45));
    g2.addColorStop(1, hexA(pc, 0));
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, 0, br * 3.4 * pl, 0, TAU); ctx.fill();
    bTrail(br * 4, br * 2.2, pc, .40);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff2d8';
    ctx.beginPath(); ctx.arc(-br * .3, -br * .35, br * .45, 0, TAU); ctx.fill();

  } else if(id === 'shotgun' || id === 'shardgun'){
    ctx.globalCompositeOperation = 'lighter';
    bTrail(10, 5, col, .40);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffe9c0';
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-.5, -1, 3, 2);
    /* 飞行中的放射状微粒 */
    const ph = (G.t * 9 + b.x * .07) % 1;
    ctx.globalAlpha = (1 - ph) * .55;
    ctx.fillStyle = '#ffffff';
    for(let k = 0; k < 3; k++){
      const a = k * 2.1 + b.y * .1;
      const d = br * (1.2 + ph * 3.2);
      ctx.fillRect(Math.cos(a) * d - 1, Math.sin(a) * d - .5, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

  } else if(id === 'flamer' || id === 'toxin'){
    const k = clamp(b.life / .3, 0, 1);
    const pc = id === 'toxin' ? '#a8e05a' : '#ff7a3c';
    ctx.globalCompositeOperation = 'lighter';
    bTrail(14 * k + 6, 8, pc, .40);
    ctx.fillStyle = pc;
    ctx.globalAlpha = .68 * Math.max(k, .4);
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    for(let j = 0; j < 3; j++){
      const rr = br * (1.5 - j * .35) * (.8 + .3 * Math.sin(G.t * 20 + j + b.x * .1));
      ctx.globalAlpha = (.30 + j * .16) * k;
      ctx.fillStyle = j === 0 ? pc : (j === 1 ? '#ffc861' : '#fff4c0');
      ctx.beginPath();
      ctx.ellipse(-j * 2.2, Math.sin(G.t * 14 + j) * 1.4, rr, rr * .85, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

  } else if(id === 'arc' || id === 'tesla'){
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(col, .9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(-6, -2.8);
    ctx.lineTo(-1, 2.4);
    ctx.lineTo(4, -1.8);
    ctx.stroke();
    ctx.fillStyle = '#eaffff';
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

  } else if(id === 'bow' || id === 'hunter'){
    ctx.globalCompositeOperation = 'lighter';
    bTrail(16, 3, col, .45);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#d8ffe8';
    ctx.fillRect(-7, -.5, 14, 1);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();

  } else {
    /* 通用自动武器：短拖尾 + 亮芯 */
    const wc = col;
    ctx.globalCompositeOperation = 'lighter';
    bTrail(13, 4.6, wc, .42);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = b.crit ? '#fff3b0' : wc;
    ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffdf0';
    ctx.beginPath(); ctx.arc(0, 0, br * .42, 0, TAU); ctx.fill();
  }
}

function drawBullets(){
  /* ── 玩家子弹 ── */
  for(let i = 0; i < G.bullets.length; i++){
    const b = G.bullets[i];
    const height = projectileAltitude(b);
    const sx = SX(b.x), groundY = SY(b.y), sy = groundY - height;
    const margin = 36 + b.r * 6;
    if(sx < -margin || sx > VW + margin || groundY < -margin || sy > VH + margin) continue;
    const w = WP[b.w];
    const col = w ? w.c : '#ffd88a';
    ctx.save();
    let vy = b.vy;
    if(b.arc){
      const scale = 1 - .32 * clamp(height / (BULLET_H + b.arcH), 0, 1);
      ctx.fillStyle = 'rgba(18,15,24,' + (.35 * scale).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(sx, groundY, b.r * scale, b.r * scale * KZ, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,228,193,.24)';
      ctx.lineWidth = .75;
      ctx.stroke();
      const sample = Math.min(.016, b.life - b.landAt);
      if(sample > 0) vy -= (projectileAltitude(b, b.life - sample) - height) / (sample * KZ);
    }
    const ang = Math.atan2(vy, b.vx);
    ctx.translate(sx, sy);
    ctx.scale(1, KZ);
    ctx.rotate(ang);
    drawBulletBody(b, col);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /* ── 敌方子弹 ── */
  const detail = QLEVEL > 0 && !reducedEffects && G.eb.length < 32;
  for(const b of G.eb) EnemyEffects.drawBullet(ctx,b,detail);
  ctx.globalAlpha = 1;
}

function drawRings(){
  for(let i=0;i<G.rings.length;i++){
    const r = G.rings[i];
    if(r.bossFx){ BossEffects.echo(ctx, r); continue; }
    const k = 1 - r.life / r.maxLife;
    const rad = lerp(r.r, r.max, k);
    ctx.globalAlpha = (1 - k) * .85;
    ctx.strokeStyle = r.col;
    ctx.lineWidth = r.w || 2;
    ctx.beginPath();
    ctx.ellipse(SX(r.x), SY(r.y) - (r.height ?? 0), rad, rad * KZ, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHazards(){
  for(let i=0;i<G.haz.length;i++){
    const h = G.haz[i];
    if(h.kind === 'pool'){
      if(h.t < h.arm) continue;
      if(h.bossFx){ BossEffects.pool(ctx, h); continue; }
      const k = clamp(h.life / (h.max - h.arm), 0, 1);
      ctx.globalAlpha = .55 * k + .15;
      const g2 = ctx.createRadialGradient(SX(h.x), SY(h.y), 2, SX(h.x), SY(h.y), h.r);
      g2.addColorStop(0, h.col);
      g2.addColorStop(.7, h.col);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(SX(h.x), SY(h.y), h.r, h.r * KZ, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = h.col;
      ctx.lineWidth = 2;
      ctx.globalAlpha = .95;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if(h.kind === 'frost'){
      const k = clamp(h.life / h.max, 0, 1);
      const cx = SX(h.x), cy = SY(h.y);
      const g2 = ctx.createRadialGradient(cx, cy, 4, cx, cy, h.r);
      g2.addColorStop(0, 'rgba(180,240,255,' + (.30 * k).toFixed(3) + ')');
      g2.addColorStop(.66, 'rgba(120,200,240,' + (.20 * k).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(90,160,220,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, h.r, h.r * KZ, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = .55 * k;
      ctx.strokeStyle = '#d8f4ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, h.r * .96, h.r * .96 * KZ, 0, 0, TAU);
      ctx.stroke();
      // 冰晶碎片
      ctx.globalAlpha = .7 * k;
      ctx.fillStyle = '#eaffff';
      for(let j = 0; j < 7; j++){
        const a = h.t * .4 + j / 7 * TAU;
        ctx.fillRect(cx + Math.cos(a) * h.r * .7, cy + Math.sin(a) * h.r * .7 * KZ, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawBeams(){
  for(const h of G.haz){
    if(h.kind === 'wave'){
      if(h.bossFx) BossEffects.wave(ctx, h);
      else drawEncounterWave(ctx, h);
    } else if(h.kind === 'beam'){
      if(h.bossFx) BossEffects.beam(ctx, h, h.bossFx, false);
      else drawEncounterBeam(ctx, h, false);
    }
  }
}

function drawParts(){
  for(let i=0;i<G.parts.length;i++){
    const p = G.parts[i];
    const k = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = k;
    if(p.line){
      const line = p.line;
      const x0 = SX(p.x), y0 = SY(p.y) - BULLET_H;
      const x1 = SX(line.x2), y1 = SY(line.y2) - BULLET_H;
      if(line.radius){
        ctx.save();
        ctx.translate(x0, y0);
        ctx.scale(1, KZ);
        ctx.globalAlpha = k * .30;
        ctx.strokeStyle = p.col;
        ctx.lineWidth = line.radius * 2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x1 - x0, (y1 - y0) / KZ); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = p.col;
      ctx.lineWidth = line.width || 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      if(line.electric){
        const phase = Math.sin(G.t * 80 + p.x);
        const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
        for(let j = 1; j <= 4; j++){
          const f = j / 5, off = (j % 2 ? 1 : -1) * (3.5 + phase * 1.5);
          ctx.lineTo(lerp(x0, x1, f) - (y1 - y0) * off / len, lerp(y0, y1, f) + (x1 - x0) * off / len);
        }
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = p.col;
    const sx = SX(p.x), sy = SY(p.y) - (p.height ?? 10);
    const s = p.r * (0.5 + k * .9);
    ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawTexts(){
  ctx.textAlign = 'center';
  for(let i=0;i<G.texts.length;i++){
    const t = G.texts[i];
    const k = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = k;
    ctx.font = (t.big ? '800 9.5px ' : '600 7.5px ') + 'ui-monospace, monospace';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillText(t.v, SX(t.x) + 1, SY(t.y) + 1);
    ctx.fillStyle = t.col;
    ctx.fillText(t.v, SX(t.x), SY(t.y));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function render(){
  const sh = reducedEffects ? 0 : G.shake;
  const ox = sh ? rnd(-sh, sh) : 0;
  const oy = sh ? rnd(-sh, sh) * .55 : 0;
  const sc = DPR * VP;

  /* ── 场景绘制到离屏目标 ── */
  ctx = rtx;
  /* 震屏位移不在这里施加：整张场景一平移，画布四边就会露出黑边
     （底部尤其明显，像多了一条黑 UI 带）。改成在 composite 里做，
     同时按位移量轻微过扫描，永远不留缝。 */
  G._shx = ox; G._shy = oy;
  rtx.setTransform(sc, 0, 0, sc, 0, 0);
  rtx.imageSmoothingEnabled = false;

  // 3D 舞台（HD-2D）：Three.js 渲染地面/建筑/光影，输出低分辨率 canvas 作为背景
  if(STAGE3D.isReady()){
    const stageCanvas = STAGE3D.render3D();
    if(stageCanvas){
      // 将低分辨率 3D 舞台放大铺满视口（像素化效果）
      rtx.imageSmoothingEnabled = false;
      rtx.drawImage(stageCanvas, 0, 0, stageCanvas.width, stageCanvas.height, 0, 0, VW, VH);
      rtx.imageSmoothingEnabled = false;
    } else {
      drawGround();
    }
  } else {
    drawGround();
  }
  /* 远景视差层：远山剪影 + 云影（比地面移动得慢，制造纵深） */
  if(!FieldMaps.underground()) BACKDROP.draw(VW, VH);
  SectorClimate.tintFloor(ctx);
  /* 功能性地表标记：独立透明层，1:1 叠加（3D 低分辨率舞台不会吃掉细节） */
  if(!FieldMaps.underground()){ drawEnv(); drawSceneAmbience(); }
  drawHazards();
  drawLights(0);
  /* 标记在光照/暗角之后叠加：阴影里的通道痕迹仍然可读，但不参与实体遮挡 */
  drawGroundMarks();
  FieldMaps.draw();
  /* 地面反光：发光物在地面拉出的长椭圆光斑（加性，压在实体之下） */
  drawGroundGlow();
  drawScars();

  DL.length = 0;
  for(let i=0;i<G.props.length;i++) DL.push({ y:G.props[i].y, k:G.props[i].lm ? 11 : 0, o:G.props[i] });
  for(let i=0;i<G.mines.length;i++) DL.push({ y:G.mines[i].y, k:3, o:G.mines[i] });
  for(let i=0;i<G.turrets.length;i++) DL.push({ y:G.turrets[i].y, k:4, o:G.turrets[i] });
  for(let i=0;i<G.orbs.length;i++) DL.push({ y:G.orbs[i].y, k:2, o:G.orbs[i] });
  for(let i=0;i<G.picks.length;i++) DL.push({ y:G.picks[i].y, k:10, o:G.picks[i] });
  for(let i=0;i<G.crates.length;i++) DL.push({ y:G.crates[i].y, k:9, o:G.crates[i] });
  for(let i=0;i<G.enemies.length;i++) DL.push({ y:G.enemies[i].y, k:1, o:G.enemies[i] });
  for(let i=0;i<G.drones.length;i++) DL.push({ y:G.drones[i].y, k:5, o:G.drones[i] });
  if(G.boss) DL.push({ y:G.boss.y, k:7, o:G.boss });
  const portal = CampaignStory.visiblePortal();
  if(portal) DL.push({ y:portal.y, k:6, o:portal });
  if(G.p) DL.push({ y:G.p.y, k:8, o:G.p });
  DL.sort(function(a,b){ return a.y - b.y; });

  for(let i=0;i<DL.length;i++){
    const it = DL[i];
    if(it.k === 0) drawProp(it.o);
    else if(it.k === 1) drawEnemy(it.o);
    else if(it.k === 2) drawOrb(it.o);
    else if(it.k === 3) drawMine(it.o);
    else if(it.k === 4) drawTurret(it.o);
    else if(it.k === 5) drawDrone(it.o);
    else if(it.k === 6) drawPortal(it.o);
    else if(it.k === 7) drawBoss(it.o);
    else if(it.k === 9) drawCrate(it.o);
    else if(it.k === 10) drawPick(it.o);
    else if(it.k === 11) drawLandmark(it.o);
    else drawPlayer();
  }

  drawBullets();
  drawMechSwings();
  drawRings();
  drawBeams();
  drawLights(1);
  drawEncounterWarnings(ctx);
  EnemyTactics.draw(ctx);
  EnemyEffects.drawBursts(ctx);
  SectorClimate.drawWarning(ctx);
  drawParts();
  drawTexts();

  /* ── 后处理 → 主画布 ── */
  composite();
  gradeFrame();

  /* 场景切换淡入 */
  if(G.sceneFx > 0 && G.mode === 'play'){
    const a = G.sceneFx / .8;
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mctx.fillStyle = 'rgba(4,6,12,' + (a * .85).toFixed(3) + ')';
    mctx.fillRect(0, 0, SW, SH);
  }

  drawHUD();
}

/* ══════════════════════════════════════════
   HUD
   ══════════════════════════════════════════ */
function rr(x, y, w, h, r){
  w = Math.max(0, w); h = Math.max(0, h);
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buttonRect(button){
  const r = button.getBoundingClientRect();
  return { x:r.x, y:r.y, w:r.width, h:r.height };
}
function bagRect(i){ return buttonRect(document.querySelector('[data-bag="' + i + '"]')); }
function wbtnRect(){ return buttonRect(byId('weaponAction')); }
function cbtnRect(){ return buttonRect(byId('charAction')); }
function buttonHit(button, x, y){
  if(G.mode !== 'play' || button.disabled || !button.contains(document.elementFromPoint(x,y))) return false;
  button.click();
  return true;
}
function bagHit(x,y){ return Array.from(document.querySelectorAll('[data-bag]')).some(b => buttonHit(b,x,y)); }
function wbtnHit(x,y){ return buttonHit(byId('weaponAction'),x,y); }
function cbtnHit(x,y){ return buttonHit(byId('charAction'),x,y); }
function syncBag(){ hudPaintAt = -Infinity; }

function drawHUD(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const W = SW, H = SH;
  const topY = 12;

  // 受伤 / 低血 边框
  let edgeCol = null, edgeA = 0;
  if(G.hurt > 0){ edgeCol = '255,60,50'; edgeA = G.hurt * .55; }
  else if(G.p && G.p.hp / G.p.maxHp < .3 && G.mode === 'play'){
    edgeCol = '255,60,50'; edgeA = .12 + Math.sin(G.t * 6) * .07;
  }
  if(G.mechT > 0 && G.mechT < 8){
    edgeCol = '255,170,80';
    edgeA = Math.max(edgeA, .10 + Math.abs(Math.sin(G.t * 5)) * .12);
  }
  if(edgeCol && edgeA > 0){
    if(reducedEffects) edgeA = Math.min(edgeA, .10);
    const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*.34, W/2, H/2, Math.max(W,H)*.72);
    g.addColorStop(0, 'rgba(' + edgeCol + ',0)');
    g.addColorStop(1, 'rgba(' + edgeCol + ',' + edgeA.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if(G.mode === 'title') return;

  vignette();
  paintInstruments(false);
}

const { rollCards, renderCards, openLevel, openReward, chooseCard } = TALENTS;
const elLevel = document.getElementById('ovLevel');
const elPause = document.getElementById('ovPause');
const elOver = document.getElementById('ovOver');
const elTitle = document.getElementById('ovTitle');

function showOver(win){ showReport(win,false); }

/* 按进度结算积分（每局只结一次） */
function settle(win){
  if(G.settled) return 0;
  G.settled = true;
  const depth = G.stage + (G.phase === 'clear' ? 1 : 0);
  const pts = Math.round(
    G.kills * 1.1 +
    G.score * .05 +
    depth * 70 +
    (G.phase === 'clear' ? 50 : 0) +
    G.lv * 8 +
    (win ? 350 : 0)
  );
  PROF.pts += pts;
  PROF.total += pts;
  PROF.runs++;
  if(G.score > PROF.best) PROF.best = G.score;
  saveProf();
  return pts;
}

/* 主动结束本局：走和阵亡同一条结算链路 */
function quitRun(){
  if(G.mode !== 'play' && G.mode !== 'pause') return;
  endMech();
  elLevel.classList.add('hide');
  elPause.classList.add('hide');
  G.mode = 'over';
  showReport(false,true);
}

function togglePause(){
  if(G.mode === 'play'){
    G.mode = 'pause';
    keys.up = keys.down = keys.left = keys.right = false;
    joyEnd();
    clearBanner();
    SFX.stopAmbience();
    byId('pauseProgress').textContent = SCENES[G.stage].name + ' · 第 ' + G.wave + ' 波 · 得分 ' + numberFormat.format(G.score);
    elPause.classList.remove('hide');
    byId('btnResume').focus({preventScroll:true});
  } else if(G.mode === 'pause'){
    G.mode = 'play';
    elPause.classList.add('hide');
    SFX.ambience(G.stage);
    wakeGame();
  }
}

let stageInitialized = false;
function startGame(){
  if(!['title','over','win'].includes(G.mode) || byId('btnStart').disabled) return;
  SFX.unlock();
  document.activeElement?.blur();
  for(const el of [elTitle,elOver,elLevel,elPause,elEvent]) el.classList.add('hide');
  resize();
  if(!stageInitialized){
    stageInitialized = true;
    if(STAGE3D.init()) STAGE3D.setStageSize(Math.max(1,Math.round(VW/2)),Math.max(1,Math.round(VH/2)));
  }
  newRun();
  updateLoadout();
  paintInstruments(true);
  if(openReward()) render();
  else wakeGame();
}

/* ══════════════════════════════════════════
   主循环
   ══════════════════════════════════════════ */
function step(dt){
  // 命中定格（hit-stop）：土豆兄弟式打击感核心，命中瞬间冻结一小段帧
  if(G.hitStop > 0){
    G.hitStop -= dt;
    // 定格期间仍衰减屏幕反馈，但暂停世界逻辑
    if(G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    if(G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.2);
    if(G.hurt > 0) G.hurt = Math.max(0, G.hurt - dt * 2);
    return;
  }
  if(G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if(G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.2);
  if(G.hurt > 0) G.hurt = Math.max(0, G.hurt - dt * 2);
  if(G.mode !== 'play'){
    updateParts(dt * .6);
    return;
  }

  G.t += dt;
  G.time += dt;
  if(StageEvents.tick()) return;

  G.encounterPlayerFrom = { x:G.p.x, y:G.p.y };
  updatePlayer(dt);
  updateWeapon(dt);
  updateChar(dt);
  const projectileMotion = G.bullets.length ? snapshotProjectileMotion() : null;
  updateWaves(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt, projectileMotion);
  updateHazards(dt);
  updateOrbs(dt);
  updatePicks(dt);
  SectorClimate.tick(dt);
  updateCrates(dt);
  updateJobs(dt);
  if(G.mode !== 'play') return;
  tickBuff(dt);
  syncCompanions(dt);
  updateParts(dt);
  updateEnv(dt);
  FARFX.update(dt);
  BACKDROP.update(dt);
  FOREFX.update(dt, SW, SH);
  updateScars(dt);
  if(G.sceneFx > 0) G.sceneFx = Math.max(0, G.sceneFx - dt);
  if(!openReward()){
    updatePortal(dt);
    openReward();
  }

  if(G.comboT > 0){
    G.comboT -= dt;
    if(G.comboT <= 0) G.combo = 0;
  }
  if(G.boss && G.boss.dead && G.boss.deadT > 2.5) G.boss = null;
}

let last = 0, frameRequest = 0;
function wakeGame(){
  if(G.mode !== 'play') return;
  last = 0;
  if(!frameRequest) frameRequest = requestAnimationFrame(loop);
}
function loop(now){
  frameRequest = 0;
  if(G.mode !== 'play') return;
  const dt = last ? clamp((now-last)/1000,0,.08) : 0;
  last = now;
  step(dt);
  if(G.mode === 'play') watchPerf(dt);
  render();
  if(G.mode === 'play' && !frameRequest) frameRequest = requestAnimationFrame(loop);
}

/* ══════════════════════════════════════════
   输入
   ══════════════════════════════════════════ */
function keyMap(k){
  const s = k.toLowerCase();
  if(s === 'arrowleft' || s === 'a') return 'left';
  if(s === 'arrowright' || s === 'd') return 'right';
  if(s === 'arrowup' || s === 'w') return 'up';
  if(s === 'arrowdown' || s === 's') return 'down';
  return null;
}

window.addEventListener('keydown', function(e){
  if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if(G.mode === 'shop'){
    if(k === 'escape'){ e.preventDefault(); closeShop(); }
    return;
  }
  // Keep normal Enter/Space behavior for every focused menu button.
  if((k === 'enter' || k === ' ') && e.target.closest?.('button')) return;
  const move = keyMap(k);
  if(move && G.mode === 'play'){ keys[move] = true; e.preventDefault(); return; }
  if(e.repeat) return;
  if(TALENTS.handleKey(k)){ e.preventDefault(); return; }
  if(k === 'p' || k === 'escape'){
    if(G.mode === 'play' || G.mode === 'pause'){ togglePause(); e.preventDefault(); }
  } else if(G.mode === 'play'){
    if(k === 'f') useMechAction();
    else if(k === 'q') weaponSkill();
    else if(k === 'e') charSkill();
    else if(k === '1' || k === '2') useItem(Number(k)-1);
  } else if(G.mode === 'event' && (k === 'enter' || k === ' ')){
    closeEvent(); e.preventDefault();
  } else if(G.mode === 'title' && (k === 'enter' || k === ' ')){
    startGame(); e.preventDefault();
  } else if((G.mode === 'over' || G.mode === 'win') && (k === 'r' || k === 'enter')){
    startGame(); e.preventDefault();
  }
});
window.addEventListener('keyup', function(e){
  const move = keyMap(e.key);
  if(move) keys[move] = false;
});

window.addEventListener('blur', function(){
  keys.up = keys.down = keys.left = keys.right = false;
  joyEnd();
  if(G.mode === 'play') togglePause();
});

document.addEventListener('visibilitychange', function(){
  if(document.hidden && G.mode === 'play') togglePause();
});

// An actual page exit settles once; a cached page can resume the same run.
window.addEventListener('pagehide', function(e){
  if(!e.persisted && G.p && !G.settled && ['play','map','pause','level','event'].includes(G.mode)) settle(false);
});

/* 触屏摇杆 */
const joyBase = document.getElementById('joyBase');
const joyKnob = document.getElementById('joyKnob');
function joyStart(x, y, id){
  joy.active = true; joy.id = id; joy.bx = x; joy.by = y;
  joyBase.classList.add('on');
  joyBase.style.left = x + 'px';
  joyBase.style.top = y + 'px';
  joyKnob.style.transform = 'translate(-50%,-50%)';
  joy.nx = 0; joy.ny = 0;
}
function joyMove(x, y){
  const dx = x - joy.bx, dy = y - joy.by;
  const max = 44;
  const d = Math.hypot(dx, dy);
  let kx = dx, ky = dy;
  if(d > max){ kx = dx / d * max; ky = dy / d * max; }
  joyKnob.style.transform = 'translate(calc(-50% + ' + kx + 'px), calc(-50% + ' + ky + 'px))';
  joy.nx = kx / max;
  joy.ny = ky / max;
}
function joyEnd(){
  joy.active = false; joy.id = -1; joy.nx = 0; joy.ny = 0;
  joyBase.classList.remove('on');
  joyKnob.style.transform = 'translate(-50%,-50%)';
}

cv.addEventListener('pointerdown', function(e){
  if(G.mode !== 'play' || joy.active || e.button !== 0) return;
  if(e.pointerType !== 'mouse' && e.clientX > SW * .62) return;
  e.preventDefault();
  joyStart(e.clientX,e.clientY,e.pointerId);
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', function(e){
  if(joy.active && e.pointerId === joy.id) joyMove(e.clientX,e.clientY);
});
function endPointer(e){ if(e.pointerId === joy.id) joyEnd(); }
cv.addEventListener('pointerup',endPointer);
cv.addEventListener('pointercancel',endPointer);
cv.addEventListener('lostpointercapture',endPointer);

function skinPreviewURL(i){
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const f = SPRM.frames['h' + pad2(i) + '_2_0'];
  if(f){
    g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, 32, 32);
    return c.toDataURL();
  }
  const sp = SPR.skins[i] || SPR.skins[0];
  const bh = sp.h || SKIN_BODY_H;
  g.drawImage(sp.legs.stand.r, 0, bh);
  g.drawImage(sp.body.r, 0, 0);
  return c.toDataURL();
}

function pickSkin(i){
  const sk = SKINS[i];
  if(ownSkin(i)){
    G.skin = i; PROF.skin = i; saveProf(); SFX.pick();
  } else if(PROF.pts >= sk.price){
    PROF.pts -= sk.price;
    PROF.ownSkins.push(i);
    G.skin = i; PROF.skin = i;
    saveProf(); SFX.lvl();
    banner('解锁角色 · ' + sk.name, '必杀「' + sk.act.n + '」' + sk.act.t, 1.35);
  } else {
    SFX.hurt();
    buildShop();
    return;
  }
  /* 换人立刻生效：必杀冷却 + 被动重算 */
  G.ccdMax = abilityCooldown(sk.act?.cd ?? 1);
  if(G.ccd > G.ccdMax) G.ccd = 0;
  if(G.st) recalc();
  if(G.p) G.p.hp = Math.min(G.p.hp, G.p.maxHp);
  buildShop(); updateLoadout();
}

function pickWep(id){
  if(ownWep(id)){
    G.weapon = id; PROF.weapon = id; recalcGun(); saveProf(); SFX.pick();
  } else if(PROF.pts >= WP[id].price){
    PROF.pts -= WP[id].price;
    PROF.ownWeapons.push(id);
    G.weapon = id; PROF.weapon = id;
    recalcGun(); saveProf(); SFX.lvl();
    banner('解锁武器 · ' + WP[id].n, WP[id].sk.n + ' · ' + WP[id].sk.t, 1.25);
  } else {
    SFX.hurt();
  }
  buildShop(); updateLoadout();
}

function recalcGun(){
  G.wcd = 0;
  G.wcdMax = abilityCooldown(WEP().sk.cd);
  if(G.st) recalc();
}

function boot(){
  loadProf();
  G.skin = ownSkin(PROF.skin) ? PROF.skin : 0;
  G.weapon = ownWep(PROF.weapon) ? PROF.weapon : 'rifle';
  G.mechId = PROF.mech;
  G.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const quality = storeGet(QKEY);
  QLEVEL = ['0','1','2'].includes(quality) ? Number(quality) : G.touch ? 1 : 2;
  if(storeGet(SKEY) === '0') SFX.setOn(false);
  const motion = storeGet('echoReducedEffects');
  reducedEffects = motion === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : motion === '1';
  PROF.giftFx = 0;
  saveProf();
  wireTerminal();
  window.addEventListener('resize', function(){
    if(!G.p || G.mode === 'title' || G.mode === 'shop') return;
    resize();
    if(G.mode !== 'play') render();
  });
}
/* 先拉图集，再起游戏；图集失败也不阻塞（绘制层会自动退回程序化） */
Promise.all([SPRM.load(),FieldMaps.load()]).then(function([ok]){
  if(!ok) console.warn('[sprite] atlas unavailable, fallback to procedural art');
  boot();
});

/* 调试挂载 */
window.__dbg = {
  G:G, SK:SK, SKILLS:SKILLS, SCENES:SCENES, EK:EK, BOSSES:BOSSES,
  newRun:newRun, startWave:startWave, endWave:endWave, startBoss:startBoss,
  spawnBoss:spawnBoss, spawnEnemy:spawnEnemy, applyDamage:applyDamage,
  damageBoss:damageBoss, killEnemy:killEnemy, summonMech:summonMech,
  canSummon:canSummon, hurtPlayer:hurtPlayer, gainXp:gainXp,
  MECHS:MECHS, useMechAction:useMechAction, updateMech:updateMech, mechFire:mechFire,
  chooseCard:chooseCard, openLevel:openLevel, nextStage:nextStage,
  bossDown:bossDown, fire:fire, update:step, render:render,
  recalc:recalc, keys:keys, ARENA:ARENA, setScene:setScene,
  banner:banner, resurrect:playerDown, ACT_FN:ACT_FN, BOSS_ACT:BOSS_ACT,
  SPR:SPR, SPRM:SPRM, drawHero:drawHero, drawPlayer:drawPlayer,
  MON_THEME:MON_THEME, MON_H:MON_H, MUZ:MUZ, GUN_ORDER:GUN_ORDER,
  hitFX:hitFX, addDissolve:addDissolve, addBurn:addBurn, drawBoss:drawBoss,
  ITEMS:ITEMS, IT:IT, dropItem:dropItem, dropLoot:dropLoot, takeItem:takeItem,
  useItem:useItem, applyItem:applyItem, spawnCrate:spawnCrate, hitCrate:hitCrate,
  updatePicks:updatePicks, updateCrates:updateCrates, bagRect:bagRect, bagHit:bagHit,
  applyDamageFn:applyDamage,
  WEAPONS:WEAPONS, WP:WP, WEP:WEP, PROF:PROF, SKINS:SKINS, SKIN:SKIN,
  weaponSkill:weaponSkill, updateWeapon:updateWeapon,
  charSkill:charSkill, updateChar:updateChar, CSK:CSK,
  cbtnRect:cbtnRect, cbtnHit:cbtnHit,
  buildShop:buildShop, pickSkin:pickSkin, pickWep:pickWep, settle:settle,
  grantPoints:grantPoints, showEvent:function(i){ triggerEvent(EVENTS[i % EVENTS.length]); },
  openShop:openShop, closeShop:closeShop, wbtnRect:wbtnRect, wbtnHit:wbtnHit,
  ownSkin:ownSkin, ownWep:ownWep, loadProf:loadProf, saveProf:saveProf,
  showOver:showOver, updateLoadout:updateLoadout,
  setQuality:setQuality, QLEVEL:function(){ return QLEVEL; },
  GUNART:GUNART, weaponIconURL:weaponIconURL, storeSet:storeSet, storeGet:storeGet,
  GIFT_PTS:GIFT_PTS,
  EVENTS:EVENTS, triggerEvent:triggerEvent, closeEvent:closeEvent, maybeEvent:maybeEvent,
  rollCards:rollCards, renderCards:renderCards, talents:TALENTS, hexes:HEXES, playerRadius:playerRadius,
  openReward:openReward, unlockCrate:unlockCrate,
  GROUND:GROUND, buildGround:buildGround, buildProps:buildProps, STAGE3D:STAGE3D,
  FARFX:FARFX, FOREFX:FOREFX, BREATH_LIGHTS:BREATH_LIGHTS, addScar:addScar,
  spawnPointNear:spawnPointNear, collectLights:collectLights, LIGHTS:LIGHTS,
  LANDMARKS:LANDMARKS, drawLandmark:drawLandmark, LM_PAL:LM_PAL,
  RESONANCE:RESONANCE, BOSS_PHASES:BOSS_PHASES, calcDamage:calcDamage,
  addZone:addZone, cullOldestEnemy:cullOldestEnemy, ENEMY_CAP:ENEMY_CAP,
  CampaignBalance:CampaignBalance, totalWave:campaignWaveIndex
};
