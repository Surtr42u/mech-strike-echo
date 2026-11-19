/* 六槽常规强化与战区大强化。效果只保存在本局，军费走既有积分记账。 */
const TALENTS = (function(){
  const groups = {
    fire: { n:'火力', ids:['rapid','power','pierce','barrage'] },
    control: { n:'控场', ids:['blast','chain','drone','turret'] },
    defense: { n:'生存', ids:['hp','armor','speed','magnet'] }
  };
  const pool = Object.entries(groups).flatMap(([tag, group]) =>
    group.ids.map(id => ({ id, tag }))
  );
  const weaponTags = {
    rifle:'fire', shotgun:'fire', heavy:'control', precise:'fire', elemental:'control', tech:'control'
  };
  const majors = {
    stipend: { n:'军费补助', ic:'▤', c:'#ffd08a', d:'立即获得 600 补给站积分，记入账户。', risk:'消耗本次大强化选择。' },
    bayonet: { n:'亮剑', ic:'⚔', c:'#ff9979', d:'贴近敌人时用刺刀重击，每次有效刺击回复 3 点生命。', risk:'常规射击射程 -35%。' },
    tank: { n:'坦克引擎', ic:'▣', c:'#a9c4e1', d:'每击破 8 个普通或精英敌人，生命上限 +3，最多 +60。', risk:'移动速度 -8%。' },
    basics: { n:'回归基本功', ic:'✧', c:'#b9f2ff', d:'武器技能与角色必杀强度 +25%，冷却时间 -30%。', risk:'本局余下战斗无法充能或变身机甲。' }
  };
  const milestones = ['0:4', '2:1'];
  const bayonetReach = 38;
  const tankStep = 8;
  const tankLimit = 20;
  const cooldownMul = .7;

  function reset(){
    G.enhancements = { chosen:[], offered:[], pending:null, tankKills:0 };
    G._cards = [];
    G._swap = null;
  }

  function has(id){
    return G.enhancements.chosen.includes(id);
  }

  function rollCards(){
    const full = G.slots.length >= MAX_SLOTS;
    const current = { fire:0, control:0, defense:0 };
    for(const { id, tag } of pool){
      if(G.skills[id] > 0) current[tag]++;
    }
    const weaponTag = weaponTags[WEP().class];
    const focus = Object.keys(groups).reduce((top, tag) => current[tag] > current[top] ? tag : top, weaponTag);
    const available = pool.flatMap(({ id, tag }) => {
      const lv = G.skills[id] || 0;
      if(lv >= SK[id].max) return [];
      const w = (lv ? 2.4 : 1) * (1 + current[tag] * .65 + (tag === weaponTag ? .35 : 0));
      return [{ id, tag, lv, kind:lv ? 'up' : full ? 'swap' : 'new', w }];
    });

    function draw(filter){
      const candidates = available.filter(filter);
      if(!candidates.length) return null;
      let roll = Math.random() * candidates.reduce((sum, card) => sum + card.w, 0);
      const card = candidates.find(card => (roll -= card.w) < 0) || candidates[candidates.length - 1];
      available.splice(available.indexOf(card), 1);
      return card;
    }

    // 始终留一个未装配选项。优先给当前流派之外的选择。
    const pivot = draw(card => card.lv === 0 && card.tag !== focus) || draw(card => card.lv === 0);
    const main = draw(card => card.kind !== 'swap' && card.tag === focus) ||
      draw(card => card.kind !== 'swap') || draw(() => true);
    const flex = draw(card => card.kind === 'up') || draw(() => true);
    return [main, flex, pivot];
  }

  function queueMilestone(){
    const key = G.stage + ':' + G.wave;
    if(milestones.includes(key) && !G.enhancements.offered.includes(key)) G.enhancements.pending = key;
  }

  function rollMilestone(){
    if(!G.enhancements.pending) return [];
    const cards = Object.keys(majors).filter(id => !has(id));
    while(cards.length > 3) cards.splice(Math.floor(Math.random() * cards.length), 1);
    return cards.map(id => ({ id, kind:'major' }));
  }

  function chooseMajor(id){
    G.enhancements.offered.push(G.enhancements.pending);
    G.enhancements.pending = null;
    G.enhancements.chosen.push(id);
    if(id === 'stipend') grantPoints(600, '军费补助');
    if(id === 'basics'){
      G.energy = 0;
      endMech();
      G.wcd *= cooldownMul;
      G.ccd *= cooldownMul;
      G.wcdMax *= cooldownMul;
      G.ccdMax *= cooldownMul;
    }
    recalc();
  }

  function applyStats(s){
    s.gunRangeMul = has('bayonet') ? .65 : 1;
    s.mechLocked = has('basics');
    if(s.mechLocked){
      s.skillCooldown *= cooldownMul;
      s.skillPower *= 1.25;
    }
    if(has('tank')){
      s.spdMul *= .92;
      s.maxHp += Math.floor(G.enhancements.tankKills / tankStep) * 3;
    }
  }

  function onKill(){
    if(!has('tank') || G.enhancements.tankKills >= tankStep * tankLimit) return;
    G.enhancements.tankKills++;
    if(G.enhancements.tankKills % tankStep !== 0) return;
    recalc({ fillNewCapacity:false });
    floatText(G.p.x, G.p.y, '生命上限 +3', majors.tank.c, true);
  }

  function status(){
    return G.enhancements.chosen.map(id => {
      if(id === 'tank'){
        const kills = G.enhancements.tankKills;
        const stacks = Math.floor(kills / tankStep);
        return majors.tank.n + ' +' + (stacks * 3) + (stacks < tankLimit ? '（' + kills % tankStep + '/' + tankStep + '）' : '（满）');
      }
      return majors[id].n + (id === 'stipend' ? '已到账' : '');
    });
  }

  function tryBayonet(){
    if(!has('bayonet')) return false;
    const p = G.p, s = G.st;
    const distance = enemy => Math.hypot(p.x - enemy.x, p.y - enemy.y) - enemy.r;
    let target = null, reach = bayonetReach;
    for(const enemy of G.enemies){
      if(enemy.dead || enemy.spawnT > 0) continue;
      const d = distance(enemy);
      if(d < reach){ target = enemy; reach = d; }
    }
    const boss = G.boss;
    if(boss && !boss.dead && distance(boss) < reach) target = boss;
    if(!target) return false;

    const weak = G.buff.weak > 0 ? .65 : 1;
    const dmg = (s.dmg * 2.6 + 12) * weak;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const crit = Math.random() < s.crit;
    p.fireT = .55;
    p.atkT = .2;
    hitFX(target.x, target.y - 4, angle, majors.bayonet.c, true);
    if(target === boss) damageBoss(target, dmg, crit, target.x, target.y);
    else applyDamage(target, dmg, crit, target.x, target.y);
    if(G.mode === 'play' && p.hp > 0) heal(3);
    return true;
  }

  function cardButton(card, i, choose){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    button.innerHTML =
      '<span class="bar" style="background:' + card.c + '"></span>' +
      '<span class="key">' + (i + 1) + '</span>' +
      '<span class="ico" style="color:' + card.c + '">' + card.ic + '</span>' +
      '<span class="nm">' + card.n + '</span>' +
      '<span class="lv">' + card.label + '</span>' +
      '<span class="ds">' + card.d + '</span>' +
      (card.risk ? '<span class="rk">' + card.risk + '</span>' : '');
    button.addEventListener('click', choose);
    return button;
  }

  function renderCards(options = rollCards(), focusId){
    G._cards = options;
    const major = options[0].kind === 'major';
    byId('lvKicker').textContent = major ? '战区里程碑' : '等级提升';
    byId('levelTitle').textContent = major ? '选择大强化' : '选择强化';
    byId('lvNum').textContent = major ? '战区 ' + (G.stage + 1) : 'LV ' + (G.lv - G.pending + 1);
    byId('lvNote').textContent = major ? '本里程碑可选择一项。' : '重复选择同一天赋可以提升等级。';
    byId('lvSlots').textContent = major ? status().join(' · ') :
      '已装配 ' + G.slots.length + ' / ' + MAX_SLOTS + (G.slots.length >= MAX_SLOTS ? ' · 满槽可替换' : '');
    byId('lvCancel').hidden = true;
    const cards = byId('cards');
    cards.replaceChildren(...options.map((o, i) => {
      if(major) return cardButton({ ...majors[o.id], label:'大强化' }, i, () => chooseCard(o));
      const skill = SK[o.id], level = o.lv + 1;
      const action = o.kind === 'swap' ? '替换 · Lv1' : o.kind === 'new' ? '新天赋' : 'Lv' + o.lv + ' → Lv' + level;
      const card = { ...skill, label:groups[o.tag].n + ' · ' + action, d:skill.d(level), risk:skill.risk?.(level) };
      return cardButton(card, i, () => chooseCard(o));
    }));
    const focusIndex = options.findIndex(o => o.id === focusId);
    cards.children[Math.max(0, focusIndex)]?.focus({ preventScroll:true });
  }

  function showCards(options){
    G.mode = 'level';
    clearBanner();
    joyEnd();
    byId('ovLevel').classList.remove('hide');
    renderCards(options);
    SFX.lvl();
    return true;
  }

  function openLevel(){
    return G.mode === 'play' && G.pending > 0 && showCards(rollCards());
  }

  function openReward(){
    if(G.mode !== 'play') return false;
    if(G.pending > 0) return openLevel();
    const options = rollMilestone();
    return options.length > 0 && showCards(options);
  }

  function startSwap(option){
    G._swap = option;
    byId('levelTitle').textContent = '选择替换槽位';
    byId('lvNote').textContent = '选择一项卸下，换成「' + SK[option.id].n + '」Lv1。';
    byId('lvSlots').textContent = '被替换的天赋及等级会移除。';
    byId('lvCancel').hidden = false;
    const cards = byId('cards');
    cards.replaceChildren(...G.slots.map((id, i) => {
      const skill = SK[id], level = G.skills[id];
      return cardButton({ ...skill, label:'槽位 ' + (i + 1) + ' · Lv' + level, d:skill.d(level), risk:skill.risk?.(level) },
        i, () => chooseReplacement(id));
    }));
    cards.firstElementChild?.focus({ preventScroll:true });
  }

  function cancelSwap(){
    if(G.mode !== 'level' || !G._swap) return false;
    const focusId = G._swap.id;
    G._swap = null;
    renderCards(G._cards, focusId);
    return true;
  }

  function finishChoice(){
    G._cards = [];
    G._swap = null;
    G.mode = 'play';
    SFX.pick();
    if(openReward()) return;
    byId('ovLevel').classList.add('hide');
    wakeGame();
  }

  function chooseCard(o){
    if(G.mode !== 'level' || G._swap || !G._cards.includes(o)) return;
    if(o.kind === 'major'){
      chooseMajor(o.id);
    } else {
      if(o.kind === 'swap'){ startSwap(o); return; }
      G.skills[o.id] = o.lv + 1;
      if(o.kind === 'new') G.slots.push(o.id);
      recalc({ fillNewCapacity:false });
      G.pending--;
    }
    finishChoice();
  }

  function chooseReplacement(id){
    if(G.mode !== 'level' || !G._swap) return;
    const slot = G.slots.indexOf(id);
    if(slot < 0) return;
    const replacement = G._swap.id;
    delete G.skills[id];
    G.slots[slot] = replacement;
    G.skills[replacement] = 1;
    recalc({ fillNewCapacity:false });
    G.pending--;
    finishChoice();
  }

  function handleKey(key){
    if(G.mode !== 'level') return false;
    if(key === 'escape') return cancelSwap();
    if(!/^[1-6]$/.test(key)) return false;
    const button = byId('cards').children[Number(key) - 1];
    if(!button) return false;
    button.click();
    return true;
  }

  return { groups, pool, majors, reset, rollCards, queueMilestone, rollMilestone, applyStats, onKill, status, tryBayonet,
    renderCards, openLevel, openReward, chooseCard, chooseReplacement, cancelSwap, handleKey };
})();
