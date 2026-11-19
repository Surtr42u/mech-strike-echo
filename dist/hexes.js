/* 海克斯按本局预掷档位，每个战役里程碑只结算一次。数值为《回响》规则。 */
const HEXES = (function(){
  const tierNames = { silver:'白银', gold:'黄金', prism:'棱彩' };
  const tierColors = { silver:'#b6c5d2', gold:'#ffd172', prism:'#d7aaff' };
  const modes = { silver:'全银局', gold:'全金局', prism:'全彩局', mixed:'混合局' };
  const milestones = ['0:1','0:4','2:1','4:1'];
  const tankStep = 8, tankLimit = 16, punchInterval = .28;
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
    tank: { tier:'gold', n:'坦克引擎', ic:'▣', d:'每击破 8 名普通或精英敌人，生命上限 +4、体型 +1.5%，最多 16 层。', risk:'移动速度 -8%，体型越大越难躲开攻击。',
      apply:(s,state) => { const n = tankStacks(state); s.maxHp += n * 4; s.bodyScale += n * .015; s.spdMul *= .92; } },
    scatter: { tier:'gold', n:'散射扩编', ic:'≋', d:'每次发射额外 +2 枚散射弹，散射弹伤害 +18%。', apply:s => { s.barrageExtra += 2; s.barragePower *= 1.18; } },
    thermal: { tier:'gold', n:'热蚀涂层', ic:'☄', d:'弹丸命中附加灼烧，全部灼烧伤害 +35%。', apply:s => { s.burn += 2; s.burnMul *= 1.35; } },
    fieldArmor: { tier:'gold', n:'偏转装甲', ic:'⛨', d:'受到伤害 -22%。', apply:s => { s.armor += .22; } },
    freeze: { tier:'gold', n:'冷凝弹', ic:'❄', d:'弹丸命中减速，叠加两级冻结效果。', apply:s => { s.freeze += 2; } },
    overdrive: { tier:'gold', n:'战术超频', ic:'⟫', d:'技能强度 +20%，武器技能与角色必杀冷却时间 -14%。', apply:s => { s.skillPower *= 1.20; s.skillCooldown *= .86; } },
    transmutePrism: { tier:'gold', n:'质变·棱彩', ic:'⇈', d:'本次直接获得 1 项随机棱彩海克斯。结果会在选择后揭晓。', to:'prism' },

    bayonet: { tier:'prism', n:'亮剑', ic:'⚔', d:'移动速度 +18%。靠近目标改用刺刀，每次刺击回复实际伤害的 12%，最多 6 点。', risk:'常规射击射程 -35%。',
      apply:s => { s.spdMul *= 1.18; s.gunRangeMul *= .65; } },
    basics: { tier:'prism', n:'回归基本功', ic:'✦', d:'武器技能与角色必杀强度 +25%，冷却时间 -30%。', risk:'持有期间无法充能或变身机甲。',
      apply:s => { s.mechLocked = true; s.skillPower *= 1.25; s.skillCooldown *= .7; } },
    goliath: { tier:'prism', n:'歌莉娅', ic:'⬡', d:'体型和受击半径 +30%，伤害 +32%，生命上限 +25。', risk:'体型变大后更难挤过狭窄处，也更容易被弹幕击中。',
      apply:s => { s.bodyScale += .30; s.dmgPct += .32; s.maxHp += 25; } },
    mystic: { tier:'prism', n:'秘术冲拳', ic:'✷', d:'攻击或技能造成有效伤害时，武器技能与角色必杀各返还 0.65 秒冷却，最多每 0.28 秒触发一次。' },
    shock: { tier:'prism', n:'风暴电容', ic:'⌁', d:'弹丸命中多传导 2 次链电，并附加爆裂。', apply:s => { s.chain += 2; s.blast++; } },
    arsenal: { tier:'prism', n:'自主武库', ic:'◉', d:'新增 2 台环绕机炮，每轮部署额外 1 座哨戒炮。', apply:s => { s.drone += 2; s.turret++; } },
    unstable: { tier:'prism', n:'不稳定火控', ic:'◆', d:'伤害 +48%。', risk:'受到伤害 +20%。', apply:s => { s.dmgPct += .48; s.dmgTaken += .20; } },
    overclock: { tier:'prism', n:'洪流协议', ic:'≋', d:'主武器射速 +42%，弹丸体积 +30%。', apply:s => { s.rateMul *= 1.42; s.bigMul *= 1.30; } },
    lance: { tier:'prism', n:'深空贯穿', ic:'➤', d:'主武器穿透 +3，射程与弹体寿命 +20%。', apply:s => { s.pierce += 3; s.gunRangeMul *= 1.20; } },
    pandora: { tier:'prism', n:'潘多拉的盒子', ic:'◇', d:'本轮及全部已持有海克斯一起重组为等数、互不重复的随机棱彩。', risk:'旧效果与累积层数移除，已到账的军费保留。每局至多重组一次。' }
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
      ascended:new Set(), tankKills:0, punchAt:-Infinity, result:'' };
  }

  function queueMilestone(){
    const state = G.enhancements, key = G.stage + ':' + G.wave;
    if(!state.pending && milestones.includes(key) && !state.offered.includes(key)) state.pending = key;
  }

  function tankStacks(state){
    return Math.floor(state.tankKills / tankStep);
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
    if(tier === 'prism' && state.chosen.length && !state.used.has('pandora') && regular.length > state.chosen.length) regular.push('pandora');
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
      state.chosen = draw(actualPool('prism',state),state.chosen.length+1);
      state.tankKills = 0;
      state.result = '潘多拉重组为 ' + state.chosen.length + ' 项棱彩';
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
  }

  function onKill(){
    const state = G.enhancements;
    if(!has('tank') || state.tankKills >= tankStep * tankLimit) return;
    if(++state.tankKills % tankStep !== 0) return;
    recalc({fillNewCapacity:false});
    floatText(G.p.x,G.p.y,'坦克引擎 · 生命 +4 上限','#ffd172',true);
  }

  function onAttackDamage(actual){
    const state = G.enhancements;
    if(actual <= 0 || G.mode !== 'play' || !has('mystic') ||
      G.t < state.punchAt + punchInterval || (G.wcd <= 0 && G.ccd <= 0)) return;
    state.punchAt = G.t;
    G.wcd = Math.max(0,G.wcd - .65);
    G.ccd = Math.max(0,G.ccd - .65);
  }

  function planLabel(state = G.enhancements){
    const schedule = milestones.map((key,i) => state.ascended.has(key) ? '金→彩' : tierNames[state.plan.tiers[i]][0]).join(' / ');
    return modes[state.plan.mode] + ' · ' + state.offered.length + '/4 · ' + schedule;
  }

  function status(state = G.enhancements){
    return state.chosen.map(id => id === 'tank' ? '坦克引擎 ' + tankStacks(state) + '/' + tankLimit :
      cards[id].n + (id === 'stipend' ? '已到账' : ''));
  }

  return { makePlan, createRun, queueMilestone, offerIds, roll, canAscend, ascend, choose, has,
    currentTier, applyStats, onKill, onAttackDamage, planLabel, status, tierNames, tierColors, cards };
})();
