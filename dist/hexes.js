/* 海克斯按本局预掷档位，每个战役里程碑只结算一次。数值为《回响》规则。 */
const HEXES = (function(){
  const tierNames = { silver:'白银', gold:'黄金', prism:'棱彩' };
  const tierColors = { silver:'#b6c5d2', gold:'#ffd172', prism:'#d7aaff' };
  const milestones = ['0:1','0:4','2:1','4:1'];
  const tank = { kills:8, limit:16, hp:24, stackHp:4, stackSize:1.5, armor:8, slow:5 };
  const bayonet = { speed:22, rangeLoss:22, damage:3.6, flat:20, interval:.40, drain:16, drainLimit:9 };
  const punch = { interval:.28, refund:.65 };
  const capacitor = { energy:2, interval:.8, refund:.4 };
  const aegis = { layers:2, interval:8 };
  const reactor = { power:38, seconds:8, refund:40, lockedDamage:32 };
  const link = { power:34, percent:45, interval:2.6 };
  const guard = { hp:30, layers:3, interval:7 };
  const thermal = { levels:2, multiplier:1.35 };
  const freezeLevels = 2, armorBonus = .22;
  const goldRetention = 80, prismRetention = 90;
  const cards = {
    relay: { tier:'silver', n:'速射中继', ic:'»', d:'主武器射速 +14%。', apply:s => { s.rateMul *= 1.14; } },
    plating: { tier:'silver', n:'加固护板', ic:'▣', d:'生命上限 +16。', apply:s => { s.maxHp += 16; } },
    pathfinder: { tier:'silver', n:'轻型履带', ic:'↝', d:'移动速度 +13%。', apply:s => { s.spdMul *= 1.13; } },
    collector: { tier:'silver', n:'回收探针', ic:'⊹', d:'拾取范围 +60%。', apply:s => { s.magnet += .6; } },
    sights: { tier:'silver', n:'校准瞄镜', ic:'✧', d:'暴击率 +8 个百分点。', apply:s => { s.crit += .08; } },
    alloy: { tier:'silver', n:'穿甲弹芯', ic:'➤', d:'主武器弹丸穿透 +1。', apply:s => { s.pierce++; } },
    quick: { tier:'silver', n:'快速回路', ic:'↻', d:'武器技能与角色必杀冷却时间 -12%。', apply:s => { s.skillCooldown *= .88; } },
    transmuteGold: { tier:'silver', n:'质变·黄金', ic:'⇈', d:'本次直接获得 1 项随机黄金海克斯。结果会在选择后揭晓。', to:'gold' },

    stipend: { tier:'gold', n:'军费补助', ic:'▤', d:'立即获得 600 补给站积分，每局至多领取一次。', enter:() => grantPoints(600,'军费补助') },
    tank: { tier:'gold', n:'坦克引擎', ic:'▣',
      d:`生命上限 +${tank.hp}，减伤 +${tank.armor} 个百分点。每击破 ${tank.kills} 名普通或精英敌人，上限再 +${tank.stackHp}、体型 +${tank.stackSize}%。叠满 ${tank.limit} 层共 +${tank.hp+tank.limit*tank.stackHp} 上限、+${tank.limit*tank.stackSize}% 体型。`,
      risk:`移动速度 -${tank.slow}%，体型越大越难躲开攻击。`,
      apply:(s,state) => {
        const stacks = tankStacks(state);
        s.maxHp += tank.hp + stacks * tank.stackHp;
        s.armor += tank.armor / 100;
        s.bodyScale += stacks * tank.stackSize / 100;
        s.spdMul *= 1 - tank.slow / 100;
      } },
    scatter: { tier:'gold', n:'散射扩编', ic:'≋', d:'每次发射额外 +2 枚散射弹，散射弹伤害 +18%。', apply:s => { s.barrageExtra += 2; s.barragePower *= 1.18; } },
    thermal: { tier:'gold', n:'热蚀涂层', ic:'☄',
      get d(){
        const { burnPerLevel, burnSeconds } = PROJECTILE_EFFECTS;
        const dps = (burnPerLevel * thermal.levels * thermal.multiplier).toFixed(2);
        return `弹丸附加灼烧，单独生效每秒 ${dps} 伤害、持续 ${burnSeconds} 秒。弹丸与主动技能的灼烧伤害 +${Math.round((thermal.multiplier-1)*100)}%。`;
      },
      apply:s => { s.burn += thermal.levels; s.burnMul *= thermal.multiplier; } },
    fieldArmor: { tier:'gold', n:'偏转装甲', ic:'⛨',
      get d(){ return `减伤 +${Math.round(armorBonus*100)} 个百分点，常规减伤上限 ${Math.round(ARMOR_LIMIT*100)}%。`; },
      apply:s => { s.armor += armorBonus; } },
    freeze: { tier:'gold', n:'冷凝弹', ic:'❄',
      get d(){
        const { slowSeconds, slowPerLevel, slowLimit } = PROJECTILE_EFFECTS;
        const percent = 100 * slowPerLevel * freezeLevels;
        return `弹丸命中减速 ${Math.round(percent)}%，持续 ${slowSeconds} 秒。元素共鸣强化命中为 ${Math.round(percent*ELEMENTAL_HIT_BOOST)}%，叠加上限 ${Math.round(slowLimit*100)}%。`;
      },
      apply:s => { s.freeze += freezeLevels; } },
    overdrive: { tier:'gold', n:'战术超频', ic:'⟫', d:'技能强度 +20%，武器技能与角色必杀冷却时间 -14%。', apply:s => { s.skillPower *= 1.20; s.skillCooldown *= .86; } },
    breach: { tier:'gold', n:'破阵信标', ic:'➤', d:`主武器穿透 +2。每穿过一名敌人后，至少保留上一击的 ${goldRetention}% 伤害。`,
      apply:s => { s.pierce += 2; s.pierceRetention = Math.max(s.pierceRetention,goldRetention / 100); } },
    capacitor: { tier:'gold', n:'战地电容', ic:'ϟ',
      d:`未变身时，每次击破计分敌人额外获得 ${capacitor.energy} 点机甲能量。机甲锁定时改为各返 ${capacitor.refund} 秒武器技能和必杀冷却，间隔 ${capacitor.interval} 秒。` },
    aegis: { tier:'gold', n:'出手成盾', ic:'⛊',
      d:`施放武器技能或角色必杀时获得 1 层护盾，通过此牌最多补至 ${aegis.layers} 层。两技能共用 ${aegis.interval} 秒触发间隔。` },
    transmutePrism: { tier:'gold', n:'质变·棱彩', ic:'⇈', d:'本次直接获得 1 项随机棱彩海克斯。结果会在选择后揭晓。', to:'prism' },

    bayonet: { tier:'prism', n:'亮剑', ic:'⚔',
      d:`移动速度 +${bayonet.speed}%。靠近目标改用刺刀，每 ${bayonet.interval} 秒重击，基础伤害为主武器伤害 ×${bayonet.damage} +${bayonet.flat}。按实际伤害回复 ${bayonet.drain}%，单击最多 ${bayonet.drainLimit} 点。`,
      risk:`常规射击射程 -${bayonet.rangeLoss}%。`,
      apply:s => { s.spdMul *= 1 + bayonet.speed / 100; s.gunRangeMul *= 1 - bayonet.rangeLoss / 100; } },
    basics: { tier:'prism', n:'回归基本功', ic:'✦', d:'武器技能与角色必杀强度 +50%，冷却时间 -40%。', risk:'持有期间无法充能或变身机甲。',
      apply:s => { s.mechLocked = true; s.skillPower *= 1.50; s.skillCooldown *= .60; } },
    goliath: { tier:'prism', n:'歌莉娅', ic:'⬡', d:'体型和受击半径 +30%，伤害 +36%，生命上限 +35。', risk:'体型变大后更难挤过狭窄处，也更容易被弹幕击中。',
      apply:s => { s.bodyScale += .30; s.dmgPct += .36; s.maxHp += 35; } },
    mystic: { tier:'prism', n:'秘术冲拳', ic:'✷',
      d:`攻击或技能造成有效伤害时，武器技能与角色必杀各返还 ${punch.refund} 秒冷却，最多每 ${punch.interval} 秒触发一次。` },
    shock: { tier:'prism', n:'风暴电容', ic:'⌁',
      get d(){
        const { blastBaseRadius, blastRadiusPerLevel, blastShare } = PROJECTILE_EFFECTS;
        return `弹丸命中多传导 2 次链电，附加爆裂。初始半径 ${blastBaseRadius+blastRadiusPerLevel}，对附近敌人造成 ${Math.round(blastShare*100)}% 弹丸基础伤害。`;
      },
      apply:s => { s.chain += 2; s.blast++; } },
    arsenal: { tier:'prism', n:'自主武库', ic:'◉', d:'新增 2 台环绕机炮，每 7 秒部署额外 1 座哨戒炮。', apply:s => { s.drone += 2; s.turret++; } },
    unstable: { tier:'prism', n:'不稳定火控', ic:'◆', d:'伤害 +48%。', risk:'受到伤害 +20%。', apply:s => { s.dmgPct += .48; s.dmgTaken += .20; } },
    overclock: { tier:'prism', n:'洪流协议', ic:'≋', d:'主武器射速 +42%，弹丸体积 +30%。', apply:s => { s.rateMul *= 1.42; s.bigMul *= 1.30; } },
    lance: { tier:'prism', n:'深空贯穿', ic:'➤',
      d:`主武器穿透 +3，射程与弹体寿命 +20%。每穿过一名敌人后，至少保留上一击的 ${prismRetention}% 伤害。`,
      apply:s => { s.pierce += 3; s.gunRangeMul *= 1.20; s.pierceRetention = Math.max(s.pierceRetention,prismRetention / 100); } },
    reactor: { tier:'prism', n:'永续反应炉', ic:'ϟ',
      d:`机甲伤害 +${reactor.power}%，变身延长 ${reactor.seconds} 秒，自然退场返还 ${reactor.refund} 点能量。机甲锁定时，改为伤害 +${reactor.lockedDamage}%。`,
      apply:s => { s.mechPower *= 1 + reactor.power / 100; s.mechDuration += reactor.seconds; } },
    apex: { tier:'prism', n:'临界观测', ic:'✧', d:'暴击率 +18 个百分点，暴击伤害倍率提高 25%。', apply:s => { s.crit += .18; s.critMul *= 1.25; } },
    link: { tier:'prism', n:'双核联动', ic:'⟷',
      d:`技能强度 +${link.power}%。施放武器技能或角色必杀时，返还另一项剩余冷却的 ${link.percent}%，两技能共用 ${link.interval} 秒触发间隔。`,
      apply:s => { s.skillPower *= 1 + link.power / 100; } },
    guard: { tier:'prism', n:'棱镜护幕', ic:'⬢',
      d:`生命上限 +${guard.hp}。造成有效伤害时获得 1 层护盾，通过此牌最多补至 ${guard.layers} 层，每 ${guard.interval} 秒最多触发一次。`,
      apply:s => { s.maxHp += guard.hp; } },
    pandora: { tier:'prism', n:'潘多拉的盒子', ic:'◇',
      d:'将已持有的白银、黄金海克斯逐一换成随机棱彩，本轮再获得 1 项随机棱彩。原有棱彩保留，结果互不重复。',
      risk:'需要持有白银或黄金才会出现。被替换效果与层数移除，已到账军费保留，每局至多选一次。' }
  };
  for(const card of Object.values(cards)) card.c = tierColors[card.tier];

  function weighted(entries, rng){
    let roll = rng() * entries.reduce((sum, entry) => sum + entry[1], 0);
    return (entries.find(entry => (roll -= entry[1]) < 0) || entries[entries.length-1])[0];
  }

  function makePlan(fortune = 0, goldChance = 0, rng = Math.random){
    const mode = weighted([['silver',20],['gold',20],['prism',15],['mixed',45]],rng);
    const bonus = Math.max(0,Math.min(.50,fortune));
    const goldBonus = bonus * HEX_FORTUNE_GOLD_SHARE;
    const weights = [['silver',.50-bonus],['gold',.35+goldBonus],['prism',.15+bonus-goldBonus]].filter(entry => entry[1] > 0);
    const tiers = milestones.map(() => mode === 'mixed' ? weighted(weights,rng) : mode);
    if(mode === 'mixed' && tiers.every(tier => tier === tiers[0])){
      tiers[tiers.length-1] = weighted(weights.filter(entry => entry[0] !== tiers[0]),rng);
    }
    const upgrades = tiers.map(tier => tier === 'gold' && goldChance > 0 && rng() < goldChance);
    return { mode, tiers, upgrades };
  }

  function createRun(){
    return { plan:makePlan(hexFortuneBonus(),goldPrismChance()), chosen:[], used:new Set(), offered:[], pending:null, hand:null,
      ascended:new Set(), tankKills:0, activations:{}, result:'' };
  }

  function queueMilestone(){
    const state = G.enhancements, key = G.stage + ':' + G.wave;
    if(!state.pending && milestones.includes(key) && !state.offered.includes(key)) state.pending = key;
  }

  function tankStacks(state){
    return Math.floor(state.tankKills / tank.kills);
  }

  function currentTier(state = G.enhancements){
    return state.ascended.has(state.pending) ? 'prism' : state.plan.tiers[milestones.indexOf(state.pending)];
  }

  function actualPool(tier,state){
    return Object.keys(cards).filter(id => cards[id].tier === tier && !cards[id].to &&
      id !== 'pandora' && !state.used.has(id));
  }

  function offerIds(state = G.enhancements){
    if(!state.pending) return [];
    const tier = currentTier(state);
    const regular = actualPool(tier,state);
    if(!state.used.has('transmuteGold') && tier === 'silver' && actualPool('gold',state).length) regular.push('transmuteGold');
    if(!state.used.has('transmutePrism') && tier === 'gold' && actualPool('prism',state).length) regular.push('transmutePrism');
    if(tier === 'prism' && !state.used.has('pandora')){
      const lower = state.chosen.filter(id => cards[id].tier !== 'prism').length;
      if(lower > 0 && regular.length > lower) regular.push('pandora');
    }
    return regular;
  }

  function draw(ids,n){
    const choice = [];
    for(let i=0;i<n && ids.length;i++) choice.push(ids.splice(Math.floor(Math.random()*ids.length),1)[0]);
    return choice;
  }

  function roll(previous = []){
    const state = G.enhancements;
    if(!previous.length && state.hand) return state.hand;
    const ids = offerIds();
    const prior = new Set(previous.map(o => o.id));
    const options = draw(ids,3);
    if(previous.length && options.every(id => prior.has(id))){
      const fresh = ids.filter(id => !prior.has(id));
      if(fresh.length) options[options.length-1] = draw(fresh,1)[0];
    }
    const hand = options.map(id => ({id,kind:'major'}));
    if(state.pending) state.hand = hand;
    return hand;
  }

  function canAscend(state = G.enhancements){
    return state.pending && currentTier(state) === 'gold' && state.plan.upgrades[milestones.indexOf(state.pending)] && actualPool('prism',state).length >= 3;
  }

  function ascend(){
    if(!canAscend()) return false;
    G.enhancements.ascended.add(G.enhancements.pending);
    G.enhancements.hand = null;
    return true;
  }

  function choose(id){
    const state = G.enhancements;
    if(!offerIds(state).includes(id)) return false;
    const previousCooldown = G.st.skillCooldown;
    const previousLock = G.st.mechLocked;
    state.offered.push(state.pending);
    state.pending = null;
    state.hand = null;
    state.used.add(id);
    const card = cards[id];
    if(id === 'pandora'){
      const retained = state.chosen.filter(picked => cards[picked].tier === 'prism');
      const converted = state.chosen.length - retained.length;
      state.chosen = retained.concat(draw(actualPool('prism',state),converted+1));
      state.tankKills = 0;
      state.result = '潘多拉转化 ' + converted + ' 项并新增 1 项棱彩';
    } else {
      const picked = card.to ? draw(actualPool(card.to,state),1)[0] : id;
      state.chosen.push(picked);
      state.result = card.to ? '质变获得「' + cards[picked].n + '」' : '已获得「' + card.n + '」';
      cards[picked].enter?.();
    }
    for(const picked of state.chosen) state.used.add(picked);
    recalc({ fillNewCapacity:false });
    const ratio = G.st.skillCooldown / previousCooldown;
    G.wcd *= ratio; G.wcdMax *= ratio;
    G.ccd *= ratio; G.ccdMax *= ratio;
    if(!previousLock && G.st.mechLocked){
      G.energy = 0;
      endMech();
    }
    return true;
  }

  function has(id){
    return G.enhancements.chosen.includes(id);
  }

  function applyStats(s){
    for(const id of G.enhancements.chosen) cards[id].apply?.(s,G.enhancements);
    if(s.mechLocked && has('reactor')) s.dmgPct += reactor.lockedDamage / 100;
  }

  function onKill(){
    const state = G.enhancements;
    if(has('capacitor')){
      if(!G.st.mechLocked) addEnergy(capacitor.energy);
      else if((G.wcd > 0 || G.ccd > 0) && ready('capacitor',capacitor.interval)) refundSkills(capacitor.refund);
    }
    if(!has('tank') || state.tankKills >= tank.kills * tank.limit) return;
    if(++state.tankKills % tank.kills !== 0) return;
    recalc({fillNewCapacity:false});
    floatText(G.p.x,G.p.y,'坦克引擎 · 生命上限 +' + tank.stackHp,'#ffd172',true);
  }

  function ready(id, interval){
    const activations = G.enhancements.activations;
    if(G.t < (activations[id] ?? -Infinity) + interval) return false;
    activations[id] = G.t;
    return true;
  }

  function refundSkills(seconds){
    G.wcd = Math.max(0,G.wcd - seconds);
    G.ccd = Math.max(0,G.ccd - seconds);
  }

  function awardShield(id,rule){
    if(!has(id) || G.shield >= rule.layers || !ready(id,rule.interval)) return;
    G.shield++;
    G.shieldFx = .5;
  }

  function onAttackDamage(actual){
    if(actual <= 0 || G.mode !== 'play') return;
    if((G.wcd > 0 || G.ccd > 0) && has('mystic') && ready('mystic',punch.interval)) refundSkills(punch.refund);
    awardShield('guard',guard);
  }

  function onSkillCast(other){
    if(has('link') && G[other] > 0 && ready('link',link.interval)) G[other] *= 1 - link.percent / 100;
    awardShield('aegis',aegis);
  }

  function onMechExpiry(){
    if(!has('reactor')) return 0;
    const before = G.energy;
    addEnergy(reactor.refund);
    return G.energy - before;
  }

  function planLabel(state = G.enhancements){
    return '海克斯 ' + state.offered.length + '/' + milestones.length;
  }

  function status(state = G.enhancements){
    return state.chosen.map(id => id === 'tank' ? '坦克引擎 ' + tankStacks(state) + '/' + tank.limit :
      cards[id].n + (id === 'stipend' ? '已到账' : ''));
  }

  return { makePlan, createRun, queueMilestone, offerIds, roll, canAscend, ascend, choose, has,
    currentTier, applyStats, onKill, onAttackDamage, onSkillCast, onMechExpiry, planLabel, status, tierNames, tierColors, cards, bayonet };
})();
