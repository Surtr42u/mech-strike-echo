/* 补给站永久模块与军械调校。每次出击只读取一份配置快照。 */
const BASE_SKILL_CAPACITY = 6;
const CAPACITY_PER_LEVEL = 2;
const MODULE_COSTS = [260, 520, 900, 1200, 1550, 1950, 2400, 2900, 3450, 4050];
const WEAPON_GRADE_COSTS = [300, 650, 1100];
const MAX_WEAPON_GRADE = 1 + WEAPON_GRADE_COSTS.length;
const HEX_FORTUNE_GOLD_SHARE = .6;
const HEX_UPGRADES = {
  hexFortune:{ name:'高阶海克斯', icon:'✧', label:'高阶概率加成', step:3,
    unit:' 个百分点', compactUnit:'%', costs:[900,1650,2800,4200,6000],
    desc:'混合局的每轮海克斯会从银色移出这部分概率，按 ' + Math.round(HEX_FORTUNE_GOLD_SHARE*100) +
      '% 和 ' + Math.round((1-HEX_FORTUNE_GOLD_SHARE)*100) + '% 分给金色与棱彩。' },
  goldPrism:{ name:'金变彩', icon:'◇', label:'升彩机会出现概率', step:5, unit:'%', base:0, costs:[1500,3000,5000],
    desc:'每个金色轮次都有机会出现「本轮升彩」。按下后改为棱彩五选一，也可照常选择金色牌。' }
};
const GROWTH_MODULES = {
  attack:{ name:'火控模块', icon:'◆', label:'伤害加成', step:4, unit:'%',
    desc:'提高常规伤害计算中的伤害加成。', apply:(s,n) => { s.dmgPct += n / 100; } },
  health:{ name:'装甲模块', icon:'▣', label:'基础生命上限', step:6, unit:' 生命',
    desc:'提高开局基础生命上限，角色被动依然生效。', apply:(s,n) => { s.maxHp += n; } },
  critical:{ name:'瞄准模块', icon:'✧', label:'暴击率', step:2, unit:' 个百分点', compactUnit:'%',
    desc:'提高射击暴击率，最终暴击率最高为 95%。', apply:(s,n) => { s.crit += n / 100; } },
  skill:{ name:'技能增幅', icon:'✦', label:'技能强度', step:8, unit:'%',
    desc:'提高武器主动、驾驶员必杀与机甲技的伤害、治疗或主要辅助时长。', apply:(s,n) => { s.skillPower += n / 100; } },
  barrage:{ name:'弹幕增幅', icon:'≋', label:'散射弹伤害', step:10, unit:'%',
    desc:'主武器射击时额外发射 1 枚散射弹，并提高散射弹与星幕机甲弹幕的伤害，可与局内「弹幕风暴」叠加。',
    apply:(s,n) => { s.barragePower += n / 100; s.barrageExtra = 1; } },
  haste:{ name:'急速模块', icon:'»', label:'技能冷却', step:-4, unit:'%',
    desc:'缩短武器主动与驾驶员必杀的冷却时间。', apply:(s,n) => { s.skillCooldown += n / 100; } },
  mechPower:{ name:'机甲火力', icon:'⟡', label:'机甲伤害', step:5, unit:'%',
    desc:'提高铁砧、疾刃、星幕三种机甲的攻击伤害 5%。基础强化会写入下次出击的配置快照。',
    apply:(s,n) => { s.mechPower += n / 100; } },
  mechDuration:{ name:'机甲续航', icon:'◷', label:'变身时间', step:1.2, unit:' 秒',
    value:level => (level ? '+' + (level * 1.2).toFixed(1) + ' 秒' : '0 秒'),
    desc:'三种机甲每次变身的持续时间 +1.2 秒。下次出击时生效。',
    apply:(s,n) => { s.mechDuration = Math.round((s.mechDuration + n) * 10) / 10; } },
  mechEnergy:{ name:'能量回收', icon:'ϟ', label:'能量获取', step:8, unit:'%',
    desc:'击破敌人与拾取能量电池时，机甲能量获取 +8%，三种机甲通用。下次出击时生效。',
    apply:(s,n) => { s.energyGain += n / 100; } },
  mechSkillCd:{ name:'机甲技冷却', icon:'⌁', label:'机甲技冷却', step:-4, unit:'%',
    desc:'三种机甲的机甲技冷却时间 -4%。下次出击时生效。',
    apply:(s,n) => { s.mechSkillCooldown += n / 100; } },
  capacity:{ name:'技能扩容', icon:'▦', label:'局内技能上限', step:CAPACITY_PER_LEVEL, unit:' 种',
    base:BASE_SKILL_CAPACITY, costs:[1200, 3000],
    desc:'每级多持有两种局内技能，下次出击时生效。各技能的等级上限维持原值。' },
  ...HEX_UPGRADES
};

function readGrowth(raw){
  const levels = {}, weaponLevels = {};
  for(const [id,spec] of Object.entries(GROWTH_MODULES)){
    const level = raw?.levels?.[id];
    if(Number.isInteger(level) && level > 0) levels[id] = Math.min(level, (spec.costs ?? MODULE_COSTS).length);
  }
  for(const id of PROF.ownWeapons){
    const level = raw?.weaponLevels?.[id];
    if(Number.isInteger(level) && level > 1) weaponLevels[id] = Math.min(level, MAX_WEAPON_GRADE);
  }
  const fields = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { ...fields, levels, weaponLevels };
}

function growthSnapshot(){
  const { levels, weaponLevels } = PROF.growth;
  return { levels:{...levels}, weaponLevels:{...weaponLevels}, preparations:{...PROF.preparations} };
}

function applyGrowth(s){
  for(const [id,spec] of Object.entries(GROWTH_MODULES)){
    const level = G.growth.levels[id];
    if(level) spec.apply?.(s, spec.step * level);
  }
}

function skillCapacity(growth = PROF.growth){
  return BASE_SKILL_CAPACITY + CAPACITY_PER_LEVEL * (growth.levels.capacity ?? 0);
}

function activeModuleCount(growth = PROF.growth){
  return Object.keys(GROWTH_MODULES).filter(id => growth.levels[id] > 0).length;
}

function activeHangarCount(growth = PROF.growth){
  return activeModuleCount(growth) + Object.keys(growth.preparations ?? PROF.preparations).length;
}

function hexFortuneBonus(growth = G.growth){
  return (growth.levels.hexFortune ?? 0) * HEX_UPGRADES.hexFortune.step / 100;
}

function goldPrismChance(growth = G.growth){
  return (growth.levels.goldPrism ?? 0) * HEX_UPGRADES.goldPrism.step / 100;
}

function weaponGrade(id, growth = PROF.growth){ return growth.weaponLevels[id] ?? 1; }
function weaponBaseDamage(w, grade = weaponGrade(w.id, G.growth)){ return w.dmg * (1 + .05 * (grade - 1)); }

function buyUpgradeLevel(levels,id,costs,base = 0){
  const level = levels[id] ?? base, cost = costs[level - base];
  if(cost === undefined || PROF.pts < cost) return false;
  PROF.pts -= cost;
  levels[id] = level + 1;
  saveProf();
  return true;
}

function buyModule(id){
  return Object.hasOwn(GROWTH_MODULES,id) &&
    buyUpgradeLevel(PROF.growth.levels,id,GROWTH_MODULES[id].costs ?? MODULE_COSTS);
}

function buyWeaponGrade(id){
  return ownWep(id) && buyUpgradeLevel(PROF.growth.weaponLevels,id,WEAPON_GRADE_COSTS,1);
}

function growthValue(spec, level, unit = spec.unit){
  const amount = level * spec.step;
  if(spec.base !== undefined) return (spec.base + amount) + unit;
  return (amount > 0 ? '+' + amount : amount || '0') + unit;
}

function upgradeRow(id,spec,level,costs,buy,base = 0){
  const max = costs.length + base;
  const value = spec.value ?? (rank => growthValue(spec,rank));
  return { id, name:spec.name, icon:spec.icon, label:spec.label, desc:spec.desc, level, max,
    active:level > base, current:value(level), next:level < max ? value(level+1) : null,
    effects:spec.compactUnit ? growthValue(spec,level,spec.compactUnit) : value(level),
    cost:costs[level-base], buy };
}

function growthRows(hex){
  return Object.entries(GROWTH_MODULES).filter(([id]) => Object.hasOwn(HEX_UPGRADES,id) === hex).map(([id,spec]) => {
    const level = PROF.growth.levels[id] ?? 0;
    return upgradeRow(id,spec,level,spec.costs ?? MODULE_COSTS,() => buyModule(id));
  });
}

const growthNumber = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3});
function weaponUpgradeRows(){
  return WEAPONS.filter(w => ownWep(w.id)).map(w => {
    const spec = { name:w.n, label:'单发基础伤害', desc:'提升该武器的单发基础伤害。',
      value:grade => growthNumber.format(weaponBaseDamage(w,grade)) };
    return upgradeRow(w.id,spec,weaponGrade(w.id),WEAPON_GRADE_COSTS,() => buyWeaponGrade(w.id),1);
  });
}

function hangarRows(group){
  if(group === 'tactics') return PREPARATIONS.rows();
  if(group === 'tuning') return weaponUpgradeRows();
  return growthRows(group === 'hex');
}

function growthComparison(label, current, next){
  const comparison = node('div','growth-comparison' + (next === null ? ' final-value' : ''));
  const makeValue = (caption, value) => {
    const el = node('span');
    el.append(node('small','',caption),node('strong','',value));
    return el;
  };
  comparison.append(node('span','growth-stat-name',label),makeValue('当前',current));
  if(next !== null) comparison.append(makeValue('升级后',next));
  return comparison;
}

function growthBuyButton(id, cost, buy, firstPurchase = false){
  const button = node('button','primary wide');
  button.id = id;
  const shortfall = cost - PROF.pts;
  button.textContent = cost === undefined ? '已满级' : shortfall > 0 ?
    '还差 ' + numberFormat.format(shortfall) + ' 积分' : (firstPurchase ? '购买' : '升级') + ' · ' + numberFormat.format(cost) + ' 积分';
  button.disabled = cost === undefined || shortfall > 0;
  button.onclick = () => {
    if(buy()) refreshGrowthShop(id);
  };
  return button;
}

function refreshGrowthShop(action){
  buildShop();
  updateLoadout();
  SFX.pick();
  const button = byId(action);
  const nextFocus = button && !button.disabled ? button :
    byId('shopGrid').querySelector('[aria-pressed="true"]');
  nextFocus?.focus({preventScroll:true});
}

function showHangarDetail(row){
  byId('shopDetail').append(node('div','detail-tag','等级 ' + row.level + ' / ' + row.max + ' · ' + hangarStatus(row)),
    node('h3','',row.name),node('p','',row.desc),growthComparison(row.label,row.current,row.next),
    growthBuyButton('buyUpgrade',row.cost,row.buy,!row.active));
  if(typeof WeaponAttachments !== 'undefined' && typeof hangarGroup === 'string' && hangarGroup === 'tuning' &&
     typeof WP !== 'undefined' && Object.hasOwn(WP,row.id)){
    byId('shopDetail').append(attachmentPanel(row.id,row));
  }
}

/* 武器调校：三槽配件。点击槽位在已拥有的同槽配件之间循环，基础配件始终保底。 */
function attachmentPanel(weaponId,row){
  const panel = node('section','attachment-panel');
  const all = WeaponAttachments.list(), held = WeaponAttachments.owned();
  const head = node('div','attachment-head');
  head.append(node('strong','','武器配件'),
    node('small','attachment-count','配件库 ' + held.length + ' / ' + all.length));
  panel.append(head);
  const wrap = node('div','attachment-slots');
  const load = WeaponAttachments.equipped(weaponId);
  for(const slot of WeaponAttachments.slots()){
    const options = held.filter(def => def.slot === slot.id);
    const currentId = load[slot.id];
    const current = WeaponAttachments.definition(currentId) || options[0];
    const button = node('button','attachment-slot');
    button.type = 'button';
    if(current) button.style.setProperty('--att-color',current.color);
    button.setAttribute('aria-label',slot.name + '：' + (current ? current.name : '未装配') + '，点击切换');
    button.append(node('small','attachment-slot-label',
        slot.name + ' · ' + (current ? WeaponAttachments.rarityName(current.rarity) : '未装配')),
      node('strong','attachment-slot-name',current ? current.name : '未装配'),
      node('span','attachment-slot-desc',current ? current.desc : '该槽位暂无可用配件。'));
    if(options.length > 1){
      const index = Math.max(0,options.findIndex(def => def.id === currentId));
      button.append(node('small','attachment-slot-hint','点击切换 · ' + (index + 1) + ' / ' + options.length));
      button.onclick = () => {
        const next = WeaponAttachments.cycle(weaponId,slot.id);
        if(!next) return;
        SFX.pick();
        refreshTuningDetail(row);
      };
    } else {
      button.disabled = true;
      button.append(node('small','attachment-slot-hint','击败精英或首领可获得更多配件'));
    }
    wrap.append(button);
  }
  panel.append(wrap,
    node('p','attachment-hint','配件拾取后立即带出局外，按武器单独保存；装配在下次出击时生效。'));
  return panel;
}

function refreshTuningDetail(row){
  const detail = byId('shopDetail');
  const top = detail.scrollTop;
  detail.replaceChildren();
  showHangarDetail(row);
  detail.scrollTop = top;
}

function hangarStatus(row){
  return row.level === row.max ? '已满级' : row.active ? '已生效' : '未升级';
}
