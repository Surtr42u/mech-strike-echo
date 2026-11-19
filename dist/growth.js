/* 补给站永久模块与军械调校。每次出击只读取一份配置快照。 */
const GROWTH_SLOTS = 2;
const MODULE_COSTS = [260, 520, 900];
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
    desc:'提高武器主动与驾驶员必杀的伤害、治疗或主要辅助效果的持续时间。', apply:(s,n) => { s.skillPower += n / 100; } },
  barrage:{ name:'弹幕增幅', icon:'≋', label:'散射弹伤害', step:10, unit:'%',
    desc:'射击时额外发射 1 枚散射弹，并提高所有散射弹的伤害，可与局内「弹幕风暴」叠加。',
    apply:(s,n) => { s.barragePower += n / 100; s.barrageExtra = 1; } },
  haste:{ name:'急速模块', icon:'»', label:'技能冷却', step:-4, unit:'%',
    desc:'缩短武器主动与驾驶员必杀的冷却时间。', apply:(s,n) => { s.skillCooldown += n / 100; } }
};

function readGrowth(raw){
  const levels = {}, weaponLevels = {};
  for(const id of Object.keys(GROWTH_MODULES)){
    const level = raw?.levels?.[id];
    if(Number.isInteger(level) && level > 0) levels[id] = Math.min(level, MODULE_COSTS.length);
  }
  for(const id of PROF.ownWeapons){
    const level = raw?.weaponLevels?.[id];
    if(Number.isInteger(level) && level > 1) weaponLevels[id] = Math.min(level, MAX_WEAPON_GRADE);
  }
  const slots = Array.isArray(raw?.slots) ? [...new Set(raw.slots)] : [];
  return { levels, slots:slots.filter(id => typeof id === 'string' && Object.hasOwn(levels, id)).slice(0, GROWTH_SLOTS), weaponLevels };
}

function growthSnapshot(){
  const { levels, slots, weaponLevels } = PROF.growth;
  return { levels:{...levels}, slots:slots.slice(), weaponLevels:{...weaponLevels} };
}

function applyGrowth(s){
  for(const id of G.growth.slots){
    const spec = GROWTH_MODULES[id];
    spec.apply(s, spec.step * G.growth.levels[id]);
  }
}

function weaponGrade(id, growth = PROF.growth){ return growth.weaponLevels[id] ?? 1; }
function weaponBaseDamage(w, grade = weaponGrade(w.id, G.growth)){ return w.dmg * (1 + .05 * (grade - 1)); }

function buyModule(id){
  if(!Object.hasOwn(GROWTH_MODULES, id)) return false;
  const level = PROF.growth.levels[id] ?? 0, cost = MODULE_COSTS[level];
  if(cost === undefined || PROF.pts < cost) return false;
  PROF.pts -= cost;
  PROF.growth.levels[id] = level + 1;
  saveProf();
  return true;
}

function toggleModule(id){
  if(!Object.hasOwn(GROWTH_MODULES, id) || !PROF.growth.levels[id]) return false;
  const slots = PROF.growth.slots, index = slots.indexOf(id);
  if(index >= 0) slots.splice(index, 1);
  else if(slots.length < GROWTH_SLOTS) slots.push(id);
  else return false;
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
  return (amount > 0 ? '+' + amount : amount || '0') + unit;
}

function growthRows(){
  return Object.entries(GROWTH_MODULES).map(([id,spec]) => {
    const level = PROF.growth.levels[id] ?? 0;
    return { id, name:spec.name, icon:spec.icon, effects:growthValue(spec,level,spec.compactUnit), level,
      equipped:PROF.growth.slots.includes(id) };
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
  const button = byId(action), equip = byId('equipModule');
  const nextFocus = button && !button.disabled ? button : equip && !equip.disabled ? equip :
    byId('shopGrid').querySelector('[aria-pressed="true"]');
  nextFocus?.focus({preventScroll:true});
}

function showModuleDetail(row){
  const spec = GROWTH_MODULES[row.id], max = MODULE_COSTS.length;
  const comparison = growthComparison(spec.label, growthValue(spec,row.level), row.level < max ? growthValue(spec,row.level + 1) : null);
  const buy = growthBuyButton('buyModule',MODULE_COSTS[row.level],() => buyModule(row.id));
  const equip = node('button','secondary wide');
  equip.id = 'equipModule';
  const full = PROF.growth.slots.length >= GROWTH_SLOTS;
  equip.textContent = row.equipped ? '卸下模块' : !row.level ? '升级后可装配' : full ? '槽位已满 · 先卸下一项' : '装配模块';
  equip.disabled = !row.equipped && (!row.level || full);
  equip.onclick = () => { if(toggleModule(row.id)) refreshGrowthShop('equipModule'); };
  const actions = node('div','growth-actions');
  actions.append(buy,equip);
  byId('shopDetail').append(node('div','detail-tag','模块等级 ' + row.level + ' / ' + max),
    node('h3','',row.name),node('p','',spec.desc),comparison,actions);
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
