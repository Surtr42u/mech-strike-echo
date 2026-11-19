/* 常规强化与战区大强化。效果只保存在本局，军费走既有积分记账。 */
const TALENTS = (function(){
  const groups = {
    fire: { n:'火力', ids:['rapid','power','pierce','barrage'] },
    control: { n:'控场', ids:['blast','chain','drone','turret','mine'] },
    defense: { n:'生存', ids:['hp','armor','speed','magnet'] }
  };
  const pool = Object.entries(groups).flatMap(([tag, group]) =>
    group.ids.map(id => ({ id, tag }))
  );
  const weaponTags = {
    rifle:'fire', shotgun:'fire', heavy:'control', precise:'fire', elemental:'control', tech:'control'
  };
  const { cards:majors, queueMilestone, roll:rollMilestone, applyStats, onKill, status } = HEXES;
  const bayonetReach = 38;

  function reset(){
    G.enhancements = HEXES.createRun();
    G._cards = [];
    G._swap = null;
  }

  function regularOptions(){
    const full = G.slots.length >= G.skillLimit;
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
    return { available, focus };
  }

  function rollCards(previous = []){
    const { available, focus } = regularOptions();

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
    let flex = draw(card => card.kind === 'up') || draw(() => true);
    if(previous.length){
      const prior = new Set(previous.map(card => card.id));
      if([main,flex,pivot].every(card => prior.has(card.id))){
        flex = draw(card => !prior.has(card.id)) || flex;
      }
    }
    return [main, flex, pivot];
  }

  function tryBayonet(){
    if(!HEXES.has('bayonet')) return false;
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
    const blade = HEXES.bayonet;
    const dmg = (s.dmg * blade.damage + blade.flat) * weak;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const crit = Math.random() < s.crit;
    const before = target.hp;
    p.fireT = blade.interval;
    p.atkT = .2;
    hitFX(target.x, target.y - 4, angle, majors.bayonet.c, true);
    if(target === boss) damageBoss(target, dmg, crit, target.x, target.y);
    else applyDamage(target, dmg, crit, target.x, target.y);
    const dealt = Math.max(0,before - Math.max(0,target.hp));
    if(dealt > 0 && G.mode === 'play' && p.hp > 0) heal(Math.min(blade.drainLimit,dealt * blade.drain / 100));
    return true;
  }

  function cardButton(card, i, choose){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    const key = (i + 1) % 10;
    button.setAttribute('aria-keyshortcuts',String(key));
    button.innerHTML =
      '<span class="bar" style="background:' + card.c + '"></span>' +
      '<span class="key">' + key + '</span>' +
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
    const tier = major ? HEXES.currentTier() : null;
    byId('lvKicker').textContent = major ? '海克斯 · ' + HEXES.tierNames[tier] : '等级提升';
    byId('lvKicker').style.color = major ? HEXES.tierColors[tier] : '';
    byId('levelTitle').textContent = major ? '选择海克斯' : '选择强化';
    byId('lvNum').textContent = major ? '战区 ' + (G.stage + 1) : 'LV ' + (G.lv - G.pending + 1);
    byId('lvNote').textContent = major ? HEXES.planLabel() : '重复选择同一天赋可以提升等级。';
    byId('lvSlots').textContent = major ? status().join(' · ') :
      '已持有 ' + G.slots.length + ' / ' + G.skillLimit + (G.slots.length >= G.skillLimit ? ' · 可替换，也可保留原技能' : '');
    byId('lvCancel').hidden = true;
    byId('lvSkip').hidden = !canSkip();
    byId('lvAscend').hidden = !major || !HEXES.canAscend();
    renderRefresh();
    const cards = byId('cards');
    cards.classList.remove('swap-options');
    cards.classList.toggle('hex-options',major);
    cards.replaceChildren(...options.map((o, i) => {
      if(major) return cardButton({ ...majors[o.id], label:HEXES.tierNames[tier] + '海克斯' }, i, () => chooseCard(o));
      const skill = SK[o.id], level = o.lv + 1;
      const action = o.kind === 'swap' ? '替换 · Lv1' : o.kind === 'new' ? '新天赋' : 'Lv' + o.lv + ' → Lv' + level;
      const card = { ...skill, label:groups[o.tag].n + ' · ' + action, d:skill.d(level), risk:skill.risk?.(level) };
      return cardButton(card, i, () => chooseCard(o));
    }));
    const focusIndex = options.findIndex(o => o.id === focusId);
    cards.children[Math.max(0, focusIndex)]?.focus({ preventScroll:true });
  }

  function hasAlternative(cards){
    if(!cards.length) return false;
    const eligible = cards[0].kind === 'major' ? HEXES.offerIds() : regularOptions().available.map(card => card.id);
    return eligible.some(id => !cards.some(card => card.id === id));
  }

  function renderRefresh(){
    const button = byId('lvRefresh'), note = byId('lvRefreshNote');
    const { refreshLeft, refreshMax } = G.preparations;
    button.hidden = !refreshMax || !!G._swap;
    note.textContent = '';
    if(button.hidden) return;
    const alternative = hasAlternative(G._cards);
    button.disabled = !refreshLeft || !alternative;
    byId('lvRefreshLabel').textContent = '刷新选项 ' + refreshLeft + ' / ' + refreshMax;
    if(!refreshLeft) note.textContent = '本局刷新次数已用完';
    else if(!alternative) note.textContent = '没有其他可选牌';
  }

  function refreshCards(){
    if(G.mode !== 'level' || G._swap || !G.preparations.refreshLeft || !hasAlternative(G._cards)) return false;
    const previous = G._cards;
    const cards = previous[0].kind === 'major' ? rollMilestone(previous) : rollCards(previous);
    if(!cards.some(card => !previous.some(old => old.id === card.id))) return false;
    G.preparations.refreshLeft--;
    renderCards(cards);
    SFX.pick();
    return true;
  }

  function ascendCards(){
    if(G.mode !== 'level' || G._swap || G._cards[0]?.kind !== 'major' || !HEXES.ascend()) return false;
    renderCards(rollMilestone());
    SFX.lvl();
    return true;
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
    renderRefresh();
    byId('levelTitle').textContent = '选择替换槽位';
    byId('lvNote').textContent = '选择一项卸下，换成「' + SK[option.id].n + '」Lv1。';
    byId('lvSlots').textContent = '被替换的天赋及等级会移除。';
    byId('lvCancel').hidden = false;
    const cards = byId('cards');
    cards.classList.add('swap-options');
    cards.replaceChildren(...G.slots.map((id, i) => {
      const skill = SK[id], level = G.skills[id];
      return cardButton({ ...skill, label:'槽位 ' + (i + 1) + ' · Lv' + level, d:skill.d(level), risk:skill.risk?.(level) },
        i, () => chooseReplacement(id));
    }));
    cards.scrollTop = 0;
    cards.firstElementChild?.focus({ preventScroll:true });
  }

  function cancelSwap(){
    if(G.mode !== 'level' || !G._swap) return false;
    const focusId = G._swap.id;
    G._swap = null;
    renderCards(G._cards, focusId);
    return true;
  }

  function canSkip(){
    return G.mode === 'level' && G.pending > 0 && G.slots.length >= G.skillLimit &&
      G._cards.length > 0 && G._cards[0].kind !== 'major';
  }

  function skipReward(){
    if(!canSkip()) return false;
    G.pending--;
    finishChoice();
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
      if(!HEXES.choose(o.id)) return;
    } else {
      if(o.kind === 'swap'){ startSwap(o); return; }
      G.skills[o.id] = o.lv + 1;
      if(o.kind === 'new') G.slots.push(o.id);
      recalc({ fillNewCapacity:false });
      G.pending--;
    }
    finishChoice();
    if(o.kind === 'major' && G.mode === 'play') banner(G.enhancements.result,HEXES.planLabel(),1.8);
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
    if(key === 'x') return skipReward();
    if(key === 'r') return refreshCards();
    if(!/^[0-9]$/.test(key)) return false;
    const button = byId('cards').children[(Number(key) || 10) - 1];
    if(!button) return false;
    button.click();
    return true;
  }

  return { groups, pool, majors, reset, rollCards, queueMilestone, rollMilestone, applyStats, onKill, status, tryBayonet,
    renderCards, openLevel, openReward, chooseCard, chooseReplacement, cancelSwap, skipReward, refreshCards, ascendCards, handleKey };
})();
