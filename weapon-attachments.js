/* 武器配件：永久收藏与逐武器装配。
   配件分三个槽位（枪管 / 弹匣 / 战术模块），全部通用，可与任意武器组合。
   基础配件永远拥有并默认装配；精英与首领掉落其它配件，拾取后带出局外。
   本文件只定义数据与纯逻辑，不访问 IT / G / PROF 的加载时状态。 */
const WeaponAttachments = (function(){
  const SLOTS = [
    { id:'barrel', name:'枪管' },
    { id:'magazine', name:'弹匣' },
    { id:'module', name:'战术模块' }
  ];
  const SLOT_IDS = SLOTS.map(function(s){ return s.id; });
  const BASIC = { barrel:'basic_barrel', magazine:'basic_magazine', module:'basic_module' };
  const RARITY = { basic:'标准', common:'常规', rare:'稀有', special:'特殊' };
  const PREFIX = 'att:';
  const DROP_WEIGHT = { common:10, rare:5, special:2 };
  const DUPLICATE_REFUND = 80;
  const PICK_LIFE = 45;

  const DEFS = [];
  function add(def){ DEFS.push(def); }

  /* ── 基础配件：永远拥有，默认装配 ── */
  add({
    id:'basic_barrel', slot:'barrel', rarity:'basic', name:'标准枪管', icon:'▬', color:'#b9c7b1',
    desc:'主武器伤害 +4%。',
    apply:function(s){ s.dmgPct += .04; }
  });
  add({
    id:'basic_magazine', slot:'magazine', rarity:'basic', name:'标准弹匣', icon:'▤', color:'#b9c7b1',
    desc:'射速 +4%，弹速 +4%。',
    apply:function(s){ s.rateMul *= 1.04; s.bspdMul *= 1.04; }
  });
  add({
    id:'basic_module', slot:'module', rarity:'basic', name:'标准握把', icon:'◈', color:'#b9c7b1',
    desc:'散布 -10%，弹体寿命 +0.05 秒。',
    apply:function(s){ s.spreadMul *= .90; s.lifeAdd += .05; }
  });

  /* ── 枪管 ── */
  add({
    id:'long_barrel', slot:'barrel', rarity:'rare', name:'加长枪管', icon:'═', color:'#8fd8ff',
    desc:'射程 +12%，伤害 +7%，弹速 +6%。',
    apply:function(s){ s.gunRangeMul *= 1.12; s.dmgPct += .07; s.bspdMul *= 1.06; }
  });
  add({
    id:'short_barrel', slot:'barrel', rarity:'common', name:'短管', icon:'▭', color:'#ffb45c',
    desc:'射速 +12%，射程 -8%，散布 +8%。',
    apply:function(s){ s.rateMul *= 1.12; s.gunRangeMul *= .92; s.spreadMul *= 1.08; }
  });
  add({
    id:'heavy_barrel', slot:'barrel', rarity:'rare', name:'重型枪管', icon:'━', color:'#ff9a6a',
    desc:'伤害 +14%，射速 -6%，穿透 +1。',
    apply:function(s){ s.dmgPct += .14; s.rateMul *= .94; s.pierce += 1; }
  });
  add({
    id:'rifled_barrel', slot:'barrel', rarity:'special', name:'膛线枪管', icon:'⟋', color:'#ffe08a',
    desc:'暴击 +5 个百分点，弹速 +10%。',
    apply:function(s){ s.crit += .05; s.bspdMul *= 1.10; }
  });
  add({
    id:'energy_conduit', slot:'barrel', rarity:'special', name:'能量导管', icon:'⌁', color:'#c8a0ff',
    desc:'技能强度 +12%，技能冷却 -8%。',
    apply:function(s){ s.skillPower *= 1.12; s.skillCooldown *= .92; }
  });

  /* ── 弹匣 ── */
  add({
    id:'quickdraw_mag', slot:'magazine', rarity:'common', name:'快拔弹匣', icon:'⇊', color:'#ffd08a',
    desc:'射速 +14%，伤害 -4%。',
    apply:function(s){ s.rateMul *= 1.14; s.dmgPct -= .04; }
  });
  add({
    id:'extended_mag', slot:'magazine', rarity:'rare', name:'扩容弹匣', icon:'▥', color:'#8fe3ff',
    desc:'每次多发射 1 枚弹丸，伤害 -6%。',
    apply:function(s){ s.extra += 1; s.dmgPct -= .06; }
  });
  add({
    id:'drum_mag', slot:'magazine', rarity:'common', name:'弹鼓', icon:'◉', color:'#ffb45c',
    desc:'射速 +8%，弹体体积 +12%，散布 +6%。',
    apply:function(s){ s.rateMul *= 1.08; s.bigMul *= 1.12; s.spreadMul *= 1.06; }
  });
  add({
    id:'hp_mag', slot:'magazine', rarity:'rare', name:'高压弹匣', icon:'⚡', color:'#ff8a6a',
    desc:'伤害 +12%，暴击 +4 个百分点，射速 -5%。',
    apply:function(s){ s.dmgPct += .12; s.crit += .04; s.rateMul *= .95; }
  });
  add({
    id:'cryo_mag', slot:'magazine', rarity:'special', name:'冷冻弹匣', icon:'❄', color:'#9fe8ff',
    desc:'命中附加冻结 +1，伤害 -4%。',
    apply:function(s){ s.freeze += 1; s.dmgPct -= .04; }
  });
  add({
    id:'burn_mag', slot:'magazine', rarity:'special', name:'燃烧弹匣', icon:'✷', color:'#ff7a3c',
    desc:'命中附加燃烧 +1，伤害 -4%。',
    apply:function(s){ s.burn += 1; s.dmgPct -= .04; }
  });
  add({
    id:'chain_mag', slot:'magazine', rarity:'special', name:'连锁弹匣', icon:'⌇', color:'#b9f2ff',
    desc:'命中附加连锁 +1，伤害 -5%。',
    apply:function(s){ s.chain += 1; s.dmgPct -= .05; }
  });

  /* ── 战术模块 ── */
  add({
    id:'weapon_core', slot:'module', rarity:'special', name:'武器技能核心', icon:'⁂', color:'#ffd76a',
    desc:'武器主动技（Q）冷却 -15%，技能强度 +8%。',
    apply:function(s){ s.weaponSkillCooldown *= .85; s.skillPower *= 1.08; }
  });
  add({
    id:'muzzle_brake', slot:'module', rarity:'common', name:'制退器', icon:'⊣', color:'#c0c9c1',
    desc:'散布 -18%，射速 +4%。',
    apply:function(s){ s.spreadMul *= .82; s.rateMul *= 1.04; }
  });
  add({
    id:'ballistic_computer', slot:'module', rarity:'rare', name:'弹道计算机', icon:'⌖', color:'#a8d8ff',
    desc:'暴击 +7 个百分点，射程 +10%，弹速 +8%。',
    apply:function(s){ s.crit += .07; s.gunRangeMul *= 1.10; s.bspdMul *= 1.08; }
  });
  add({
    id:'ap_module', slot:'module', rarity:'rare', name:'穿甲模块', icon:'⟂', color:'#d9b382',
    desc:'穿透 +1，伤害 -3%。',
    apply:function(s){ s.pierce += 1; s.dmgPct -= .03; }
  });
  add({
    id:'blast_module', slot:'module', rarity:'rare', name:'爆裂模块', icon:'✹', color:'#ff9a5c',
    desc:'爆炸 +1，射速 -5%。',
    apply:function(s){ s.blast += 1; s.rateMul *= .95; }
  });
  add({
    id:'drone_mount', slot:'module', rarity:'special', name:'无人机挂架', icon:'⌬', color:'#8ef0c0',
    desc:'无人机 +1，伤害 -6%。',
    apply:function(s){ s.drone += 1; s.dmgPct -= .06; }
  });
  add({
    id:'leech_module', slot:'module', rarity:'special', name:'吸能模块', icon:'⊹', color:'#7dffb0',
    desc:'吸血 +0.5，生命上限 -6%。',
    apply:function(s){ s.leech += .5; s.maxHp *= .94; }
  });

  const BY_ID = {};
  for(const def of DEFS) BY_ID[def.id] = def;
  const pickCache = Object.create(null);
  const run = [];

  function normalize(id){
    return typeof id === 'string' && id.slice(0, 4) === PREFIX ? id.slice(4) : id;
  }
  function validId(id){ return typeof id === 'string' && Object.hasOwn(BY_ID, id); }
  function weaponList(){
    if(typeof WEAPONS !== 'undefined' && Array.isArray(WEAPONS)) return WEAPONS.map(function(w){ return w.id; });
    return ['rifle'];
  }
  function currentWeapon(){
    if(typeof G !== 'undefined' && G && typeof G.weapon === 'string') return G.weapon;
    if(typeof PROF !== 'undefined' && PROF && typeof PROF.weapon === 'string') return PROF.weapon;
    return 'rifle';
  }

  /* 只增补、不改写已保存的收藏；用于运行时兜底与旧档迁移。 */
  function ensureState(){
    if(typeof PROF === 'undefined' || !PROF) return null;
    if(!PROF.attachments || typeof PROF.attachments !== 'object' || Array.isArray(PROF.attachments))
      PROF.attachments = read(null);
    const st = PROF.attachments;
    if(!Array.isArray(st.owned)) st.owned = [];
    for(const slot of SLOT_IDS){
      const basic = BASIC[slot];
      if(st.owned.indexOf(basic) < 0) st.owned.push(basic);
    }
    if(!st.equipped || typeof st.equipped !== 'object' || Array.isArray(st.equipped)) st.equipped = {};
    return st;
  }

  function loadout(weaponId){
    const st = ensureState();
    if(!st) return { barrel:BASIC.barrel, magazine:BASIC.magazine, module:BASIC.module };
    const id = (typeof weaponId === 'string' && weaponId) ? weaponId : currentWeapon();
    let eq = st.equipped[id];
    if(!eq || typeof eq !== 'object' || Array.isArray(eq)) eq = st.equipped[id] = {};
    for(const slot of SLOT_IDS){
      const cur = normalize(eq[slot]);
      if(validId(cur) && BY_ID[cur].slot === slot) eq[slot] = cur;
      else eq[slot] = BASIC[slot];
    }
    return eq;
  }

  /* 存档归一化：补齐基础配件与每把武器的默认装配。 */
  function read(raw){
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const owned = [];
    const push = function(id){
      id = normalize(id);
      if(validId(id) && owned.indexOf(id) < 0) owned.push(id);
    };
    if(Array.isArray(src.owned)) for(const id of src.owned) push(id);
    for(const slot of SLOT_IDS) push(BASIC[slot]);
    const rawEquipped = src.equipped && typeof src.equipped === 'object' && !Array.isArray(src.equipped) ? src.equipped : {};
    const equipped = {};
    for(const wid of weaponList()){
      const from = rawEquipped[wid] && typeof rawEquipped[wid] === 'object' && !Array.isArray(rawEquipped[wid]) ? rawEquipped[wid] : {};
      const out = {};
      for(const slot of SLOT_IDS){
        const id = normalize(from[slot]);
        out[slot] = validId(id) && BY_ID[id].slot === slot && owned.indexOf(id) >= 0 ? id : BASIC[slot];
      }
      equipped[wid] = out;
    }
    return { ver:1, owned:owned, equipped:equipped };
  }

  function owned(){
    const st = ensureState();
    if(!st) return DEFS.filter(function(d){ return d.rarity === 'basic'; });
    const out = [];
    for(const id of st.owned){ if(validId(id)) out.push(BY_ID[id]); }
    return out;
  }
  function isOwned(id){
    id = normalize(id);
    if(!validId(id)) return false;
    if(BY_ID[id].rarity === 'basic') return true;
    const st = ensureState();
    return !!st && st.owned.indexOf(id) >= 0;
  }
  function equipped(weaponId){ return loadout(weaponId); }
  function definition(id){ const key = normalize(id); return validId(key) ? BY_ID[key] : null; }
  function list(){ return DEFS.slice(); }
  function slots(){ return SLOTS.slice(); }
  function slotName(slotId){
    for(const slot of SLOTS) if(slot.id === slotId) return slot.name;
    return slotId;
  }
  function rarityName(rarity){ return RARITY[rarity] || rarity; }

  function equip(weaponId, slotId, id){
    const def = definition(id);
    if(!def || def.slot !== slotId || SLOT_IDS.indexOf(slotId) < 0 || !isOwned(def.id)) return null;
    loadout(weaponId)[slotId] = def.id;
    if(typeof saveProf === 'function') saveProf();
    return def;
  }

  function slotOptions(slotId){
    return owned().filter(function(d){ return d.slot === slotId; });
  }

  function cycle(weaponId, slotId){
    const options = slotOptions(slotId);
    if(!options.length) return null;
    const current = loadout(weaponId)[slotId];
    let index = -1;
    for(let i=0;i<options.length;i++) if(options[i].id === current){ index = i; break; }
    const next = options[(index + 1) % options.length];
    loadout(weaponId)[slotId] = next.id;
    if(typeof saveProf === 'function') saveProf();
    return next;
  }

  function applyStats(s){
    if(!s || typeof G === 'undefined' || !G || !G.weapon) return;
    const eq = loadout(G.weapon);
    for(const slot of SLOT_IDS){
      const def = BY_ID[eq[slot]];
      if(def && typeof def.apply === 'function') def.apply(s, G.weapon);
    }
  }

  function weaponSkillCooldown(seconds){
    const mul = (typeof G !== 'undefined' && G && G.st && typeof G.st.weaponSkillCooldown === 'number') ?
      G.st.weaponSkillCooldown : 1;
    return seconds * mul;
  }

  function randomDropDef(){
    const st = ensureState();
    const held = st ? st.owned : [];
    let total = 0;
    const pool = [];
    for(const def of DEFS){
      if(def.rarity === 'basic') continue;
      const weight = (DROP_WEIGHT[def.rarity] || 1) * (held.indexOf(def.id) >= 0 ? 1 : 3);
      pool.push([def, weight]);
      total += weight;
    }
    if(!pool.length) return null;
    let roll = Math.random() * total;
    for(const [def, weight] of pool){
      roll -= weight;
      if(roll <= 0) return def;
    }
    return pool[pool.length - 1][0];
  }

  function drop(x, y, opt){
    if(typeof G === 'undefined' || !G || !Array.isArray(G.picks)) return null;
    const forced = opt && typeof opt.id === 'string' ? definition(opt.id) : null;
    const def = forced && forced.rarity !== 'basic' ? forced : randomDropDef();
    if(!def) return null;
    if(!Number.isFinite(x)) x = G.p ? G.p.x : 0;
    if(!Number.isFinite(y)) y = G.p ? G.p.y : 0;
    const a = Math.random() * Math.PI * 2, v = 36 + Math.random() * 64;
    G.picks.push({
      id:PREFIX + def.id, x:x, y:y,
      vx:Math.cos(a) * v, vy:Math.sin(a) * v * .7,
      t:0, life:PICK_LIFE, pull:false, born:.3, attach:true
    });
    return def;
  }

  function collect(id){
    const key = normalize(id);
    const def = validId(key) ? BY_ID[key] : null;
    if(!def || typeof PROF === 'undefined' || !PROF) return null;
    const st = ensureState();
    if(!st) return null;
    const duplicate = st.owned.indexOf(key) >= 0;
    let refund = 0, autoEquipped = false;
    if(duplicate){
      if(def.rarity !== 'basic'){
        refund = DUPLICATE_REFUND;
        PROF.pts += refund;
        PROF.total += refund;
        if(typeof saveProf === 'function') saveProf();
      }
    } else {
      st.owned.push(key);
      const eq = loadout(currentWeapon());
      if(!validId(eq[def.slot]) || BY_ID[eq[def.slot]].rarity === 'basic'){
        eq[def.slot] = key;
        autoEquipped = true;
      }
      run.push(def.name);
      if(typeof saveProf === 'function') saveProf();
      /* 自动装配后立即刷新本局数值，避免 Q 冷却等要等到下次升级才更新。
         需要 game.js 已加载；加载顺序或测试桩不满足时静默跳过。 */
      if(autoEquipped && typeof recalc === 'function' && typeof G !== 'undefined' && G && G.st){
        recalc();
        if(typeof WEP === 'function' && typeof abilityCooldown === 'function'){
          G.wcdMax = weaponSkillCooldown(abilityCooldown(WEP().sk.cd));
          if(G.wcd > G.wcdMax) G.wcd = G.wcdMax;
        }
      }
    }
    return { id:key, def:def, duplicate:duplicate, refund:refund, equipped:autoEquipped };
  }

  function isPick(id){ return typeof id === 'string' && id.startsWith(PREFIX); }

  function pickDef(id){
    if(typeof id !== 'string') return null;
    if(Object.hasOwn(pickCache, id)) return pickCache[id];
    const key = normalize(id);
    if(!validId(key)) return null;
    const def = BY_ID[key];
    const item = {
      id:key, n:def.name, ic:def.icon, c:def.color,
      mode:'auto', w:0, t:def.desc, attach:true
    };
    pickCache[id] = item;
    return item;
  }

  function runLoot(){ return run.slice(); }
  function resetRun(){ run.length = 0; }

  return {
    read, owned, equipped, equip, cycle, isOwned, applyStats, weaponSkillCooldown,
    drop, collect, isPick, pickDef, runLoot, resetRun, slotName, definition, list,
    slots, slotOptions, rarityName
  };
})();
