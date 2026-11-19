/* 补给站永久模块与军械调校。每次出击只读取一份配置快照。 */
const BASE_SKILL_CAPACITY = 6;
const CAPACITY_PER_LEVEL = 2;
const MODULE_COSTS = [260, 520, 900, 1200, 1550, 1950, 2400, 2900, 3450, 4050];
const WEAPON_GRADE_COSTS = [300, 650, 1100];
const MAX_WEAPON_GRADE = 1 + WEAPON_GRADE_COSTS.length;
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
  capacity:{ name:'技能扩容', icon:'▦', label:'局内技能上限', step:CAPACITY_PER_LEVEL, unit:' 种',
    base:BASE_SKILL_CAPACITY, costs:[1200, 3000],
    desc:'每级多持有两种局内技能，下次出击时生效。各技能的等级上限维持原值。' }
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
  return { levels:{...levels}, weaponLevels:{...weaponLevels} };
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

function weaponGrade(id, growth = PROF.growth){ return growth.weaponLevels[id] ?? 1; }
function weaponBaseDamage(w, grade = weaponGrade(w.id, G.growth)){ return w.dmg * (1 + .05 * (grade - 1)); }

function buyModule(id){
  if(!Object.hasOwn(GROWTH_MODULES, id)) return false;
  const costs = GROWTH_MODULES[id].costs ?? MODULE_COSTS;
  const level = PROF.growth.levels[id] ?? 0, cost = costs[level];
  if(cost === undefined || PROF.pts < cost) return false;
  PROF.pts -= cost;
  PROF.growth.levels[id] = level + 1;
  saveProf();
  return true;
}

function buyWeaponGrade(id){
  if(!ownWep(id)) return false;
  const level = weaponGrade(id), cost = WEAPON_GRADE_COSTS[level - 1];
  if(cost === undefined || PROF.pts < cost) return false;
  PROF.pts -= cost;
  PROF.growth.weaponLevels[id] = level + 1;
  saveProf();
  return true;
}

function growthValue(spec, level, unit = spec.unit){
  const amount = level * spec.step;
  if(spec.base !== undefined) return (spec.base + amount) + unit;
  return (amount > 0 ? '+' + amount : amount || '0') + unit;
}

function growthRows(){
  return Object.entries(GROWTH_MODULES).map(([id,spec]) => {
    const level = PROF.growth.levels[id] ?? 0;
    return { id, name:spec.name, icon:spec.icon, effects:growthValue(spec,level,spec.compactUnit), level };
  });
}

function growthComparison(label, current, next){
  const comparison = node('div','growth-comparison');
  const makeValue = (caption, value) => {
    const el = node('span');
    el.append(node('small','',caption),node('strong','',value));
    return el;
  };
  comparison.append(node('span','growth-stat-name',label),makeValue('当前',current));
  if(next !== null) comparison.append(makeValue('升级后',next));
  return comparison;
}

function growthBuyButton(id, cost, buy){
  const button = node('button','primary wide');
  button.id = id;
  const shortfall = cost - PROF.pts;
  button.textContent = cost === undefined ? '已满级' : shortfall > 0 ?
    '还差 ' + numberFormat.format(shortfall) + ' 积分' : '升级 · ' + numberFormat.format(cost) + ' 积分';
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

function showModuleDetail(row){
  const spec = GROWTH_MODULES[row.id], costs = spec.costs ?? MODULE_COSTS, max = costs.length;
  const comparison = growthComparison(spec.label, growthValue(spec,row.level), row.level < max ? growthValue(spec,row.level + 1) : null);
  const buy = growthBuyButton('buyModule',costs[row.level],() => buyModule(row.id));
  byId('shopDetail').append(node('div','detail-tag','模块等级 ' + row.level + ' / ' + max + (row.level ? ' · 已生效' : '')),
    node('h3','',row.name),node('p','',spec.desc),comparison,buy);
}

const growthNumber = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3});
function weaponGradePanel(row){
  const w = WP[row.id], grade = weaponGrade(row.id);
  const block = node('div','weapon-grade');
  const formatDamage = rank => growthNumber.format(weaponBaseDamage(w,rank));
  const next = row.owned && grade < MAX_WEAPON_GRADE ? formatDamage(grade + 1) : null;
  block.append(node('h4','','武器调校 · Lv.' + grade + ' / ' + MAX_WEAPON_GRADE),
    growthComparison('单发基础伤害',formatDamage(grade),next));
  if(row.owned) block.append(growthBuyButton('buyWeaponGrade',WEAPON_GRADE_COSTS[grade - 1],() => buyWeaponGrade(row.id)));
  else block.append(node('small','','解锁后可调校'));
  return block;
}
