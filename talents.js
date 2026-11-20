/* 常规强化与战区大强化。效果只保存在本局，军费走既有积分记账。 */
const TALENTS = (function(){
  const groups = {
    fire: { n:'火力', ids:['rapid','power','pierce','barrage','crit','multi'] },
    control: { n:'控场', ids:['blast','chain','drone','turret','mine','burn','freeze','boom'] },
    defense: { n:'生存', ids:['hp','armor','speed','magnet'] }
  };
  const tags = {
    rapid:['fire'], power:['fire'], pierce:['pierce'], barrage:['fire','control'],
    crit:['crit'], multi:['fire','crit'], blast:['control','fire'], chain:['control','pierce'],
    drone:['summon','fire'], turret:['summon','control'], mine:['summon','control'],
    burn:['burn','fire'], freeze:['control'], boom:['summon','pierce'],
    hp:['guard'], armor:['guard'], speed:['mobility'], magnet:['supplies','mobility']
  };
  const pool = Object.entries(groups).flatMap(([tag, group]) =>
    group.ids.map(id => ({ id, tag, tags:tags[id] }))
  );
  const towerPool = pool.concat([
    {id:'thorns',tag:'defense',tags:['guard']},
    {id:'gigantism',tag:'fire',tags:['fire'],max:3}
  ]);
  const runPool = () => TOWER.active() ? towerPool : pool;
  const choiceKeys = ['1','2','3','4','5','6','7','8','9','0','-','='];
  const { cards:majors, queueMilestone, roll:rollMilestone, applyStats, onKill, status } = HEXES;
  const bayonetReach = 38;
  let picking = false; // 选中动效锁：约 160ms 内屏蔽再次点击/按键，防止重复结算
  let renderSeq = 0;   // 面板重建序号，用于判断选择逻辑是否已被新一局渲染接管

  function reset(){
    picking = false;
    renderSeq++;
    G.enhancements = HEXES.createRun();
    G._cards = [];
    G._swap = null;
  }

  function regularOptions(){
    const full = G.slots.length >= G.skillLimit;
    return runPool().flatMap(card => {
      const lv = G.skills[card.id] || 0;
      if(lv >= (card.max ?? SK[card.id].max)) return [];
      if(card.id === 'crit' && G.st?.crit >= .95 ||
        card.id === 'freeze' && G.st?.freeze * PROJECTILE_EFFECTS.slowPerLevel >= PROJECTILE_EFFECTS.slowLimit) return [];
      return [{ ...card, lv, kind:lv ? 'up' : full ? 'swap' : 'new' }];
    });
  }

  function buildProfile(){
    const talents = runPool().filter(card => G.skills[card.id] > 0).map(card => ({...card,lv:G.skills[card.id]}));
    return BUILD_DRAFT.profile(WEP(),talents,G.enhancements.chosen.map(id => majors[id]));
  }

  function rollCards(previous = []){
    return BUILD_DRAFT.choose(regularOptions(),buildProfile(),previous);
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
    if(card.equipped) button.classList.add('equipped');
    button.style.setProperty('--i',String(Math.min(i, 4))); // 入场错峰，最多第 5 张
    const key = choiceKeys[i];
    button.setAttribute('aria-keyshortcuts',String(key));
    const refresh = refreshState();
    const canReroll = !G._swap && refresh.left > 0;
    button.innerHTML =
      '<span class="bar" style="background:' + card.c + '"></span>' +
      '<span class="key">' + key + '</span>' +
      (canReroll ? '<span class="card-reroll" role="button" tabindex="0" aria-label="独立重掷这张牌" title="独立重掷 · 剩余 ' + refresh.left + ' 次">↻</span>' : '') +
      '<span class="ico" style="color:' + card.c + '">' + card.ic + '</span>' +
      '<span class="nm">' + card.n + '</span>' +
      '<span class="lv">' + card.label + '</span>' +
      '<span class="ds">' + card.d + '</span>' +
      (card.risk ? '<span class="rk">' + card.risk + '</span>' : '');
    const reroll = button.querySelector('.card-reroll');
    if(reroll){
      const rerollThis = event => {
        event.preventDefault();
        event.stopPropagation();
        rerollCardAt(i);
      };
      reroll.addEventListener('click', rerollThis);
      reroll.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' ') rerollThis(event);
      });
    }
    button.addEventListener('click', () => pickCard(button, choose));
    return button;
  }

  // 先亮出选中态，约 160ms 后再走原有选择逻辑；键盘的 button.click() 也走这里
  function pickCard(button, choose){
    if(picking || button.classList.contains('picked') || G.mode !== 'level') return;
    picking = true;
    const seq = renderSeq;
    const cards = byId('cards');
    cards.classList.add('picking');
    button.classList.add('picked');
    button.setAttribute('aria-pressed','true');
    setTimeout(() => {
      // 面板已关闭或已重建（刷新/换槽位/新局）则不再结算，避免用旧选项覆盖新面板
      if(!button.isConnected || G.mode !== 'level' || renderSeq !== seq){ picking = false; return; }
      choose();
      // 前置校验未通过时面板仍在，撤销选中态并解锁
      if(G.mode === 'level' && renderSeq === seq && button.isConnected){
        button.classList.remove('picked');
        button.removeAttribute('aria-pressed');
        cards.classList.remove('picking');
      }
      picking = false;
    }, 160);
  }

  function renderCards(options = rollCards(), focusId){
    renderSeq++;
    G._cards = options;
    const major = options[0].kind === 'major';
    const tier = major ? HEXES.currentTier() : null;
    byId('lvKicker').textContent = major ? '海克斯 · ' + HEXES.tierNames[tier] : '等级提升';
    byId('lvKicker').style.color = major ? HEXES.tierColors[tier] : '';
    byId('levelTitle').textContent = major ? '选择海克斯' : '选择强化';
    byId('lvNum').textContent = major ? (TOWER.active() ? '第 ' + G.tower.floor + ' 层' : '战区 ' + (G.stage + 1)) : 'LV ' + (G.lv - G.pending + 1);
    byId('lvNote').textContent = major ? HEXES.planLabel() : '重复选择同一天赋可以提升等级。';
    byId('lvSlots').textContent = major ? status().join(' · ') :
      '已持有 ' + G.slots.length + ' / ' + G.skillLimit + (G.slots.length >= G.skillLimit ? ' · 可替换，也可保留原技能' : '');
    byId('lvCancel').hidden = true;
    byId('lvSkip').hidden = !canSkip();
    byId('lvAscend').hidden = !major || !HEXES.canAscend();
    renderRefresh();
    const cards = byId('cards');
    cards.classList.remove('picking');
    cards.classList.remove('swap-options');
    cards.classList.toggle('hex-options',major);
    cards.replaceChildren(...options.map((o, i) => {
      if(major) return cardButton({ ...majors[o.id], label:HEXES.tierNames[tier] + ' · ' + BUILD_DRAFT.label(o.tags) }, i, () => chooseCard(o));
      const skill = SK[o.id], level = o.lv + 1;
      const action = o.kind === 'swap' ? '替换 · Lv1' : o.kind === 'new' ? '新天赋' : 'Lv' + o.lv + ' → Lv' + level;
      const card = { ...skill, label:BUILD_DRAFT.label(o.tags) + ' · ' + action, d:skill.d(level), risk:skill.risk?.(level) };
      return cardButton(card, i, () => chooseCard(o));
    }));
    const focusIndex = options.findIndex(o => o.id === focusId);
    cards.children[Math.max(0, focusIndex)]?.focus({ preventScroll:true });
  }

  function hasAlternative(cards){
    if(!cards.length) return false;
    const eligible = cards[0].kind === 'major' ? HEXES.offerIds() : regularOptions().map(card => card.id);
    return eligible.some(id => !cards.some(card => card.id === id));
  }

  function refreshState(){
    const major = G._cards && G._cards[0] && G._cards[0].kind === 'major';
    const hexLeft = major ? (G.enhancements?.hexRefreshLeft ?? 0) : 0;
    const hexMax = major ? (G.enhancements?.hexRefreshMax ?? 0) : 0;
    const refreshLeft = G.preparations?.refreshLeft ?? 0;
    const refreshMax = G.preparations?.refreshMax ?? 0;
    return { major, hexLeft, hexMax, refreshLeft, refreshMax,
      left:hexLeft + refreshLeft, max:hexMax + refreshMax };
  }

  /* 类似 LoL 的独立重掷：每张牌右上角一个 ↻，只换这一张，其余牌不动。 */
  function renderRefresh(){
    const button = byId('lvRefresh'), note = byId('lvRefreshNote');
    button.hidden = true;
    if(G._swap){ note.textContent = ''; return; }
    const state = refreshState();
    note.textContent = state.left ? '独立重掷 ' + state.left + ' / ' + state.max + ' · 点卡牌右上角 ↻' :
      (state.max ? '独立重掷已用完' : '');
  }

  function payReroll(major){
    if(major && (G.enhancements?.hexRefreshLeft ?? 0) > 0){
      G.enhancements.hexRefreshLeft--;
      return true;
    }
    if((G.preparations?.refreshLeft ?? 0) > 0){
      G.preparations.refreshLeft--;
      return true;
    }
    return false;
  }

  function rerollCardAt(index){
    if(G.mode !== 'level' || G._swap || picking) return false;
    const hand = G._cards;
    if(!Array.isArray(hand) || !hand[index]) return false;
    const major = hand[index].kind === 'major';
    const state = refreshState();
    if(!state.left) return false;
    let next = null;
    if(major){
      next = HEXES.rerollCard(hand,index);
    } else {
      const exclude = new Set(hand.map(card => card.id));
      const options = regularOptions().filter(card => !exclude.has(card.id));
      if(options.length){
        const picked = BUILD_DRAFT.choose(options,buildProfile(),hand)[0];
        if(picked){
          next = hand.slice();
          next[index] = picked;
        }
      }
    }
    if(!next) return false;
    if(!payReroll(major)) return false;
    renderCards(next,next[index].id);
    SFX.pick();
    return true;
  }

  function focusedCardIndex(){
    const cards = byId('cards').children;
    const active = document.activeElement;
    for(let i=0;i<cards.length;i++){
      if(cards[i] === active || cards[i].contains(active)) return i;
    }
    return 0;
  }

  function refreshCards(){
    return rerollCardAt(focusedCardIndex());
  }

  function ascendCards(){
    if(G.mode !== 'level' || G._swap || picking || G._cards[0]?.kind !== 'major' || !HEXES.ascend()) return false;
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
    renderSeq++;
    G._swap = option;
    renderRefresh();
    byId('levelTitle').textContent = '选择替换槽位';
    byId('lvNote').textContent = '选择一项卸下，换成「' + SK[option.id].n + '」Lv1。';
    byId('lvSlots').textContent = '被替换的天赋及等级会移除。';
    byId('lvCancel').hidden = false;
    const cards = byId('cards');
    cards.classList.remove('picking');
    cards.classList.add('swap-options');
    cards.replaceChildren(...G.slots.map((id, i) => {
      const skill = SK[id], level = G.skills[id];
      return cardButton({ ...skill, label:'槽位 ' + (i + 1) + ' · Lv' + level, d:skill.d(level), risk:skill.risk?.(level), equipped:true },
        i, () => chooseReplacement(id));
    }));
    cards.scrollTop = 0;
    cards.firstElementChild?.focus({ preventScroll:true });
  }

  function startMajorSwap(option){
    renderSeq++;
    G._swap = option;
    renderRefresh();
    byId('levelTitle').textContent = '选择替换海克斯';
    byId('lvNote').textContent = '海克斯已满。选择一项卸下，再结算「' + majors[option.id].n + '」。';
    byId('lvSlots').textContent = '被替换的效果与累积层数会移除。';
    byId('lvAscend').hidden = true;
    byId('lvCancel').hidden = false;
    const cards = byId('cards');
    cards.classList.remove('picking');
    cards.classList.add('swap-options');
    cards.replaceChildren(...G.enhancements.chosen.map((id,i) => {
      const card = majors[id];
      return cardButton({...card,label:HEXES.tierNames[card.tier],equipped:true},i,() => chooseReplacement(id));
    }));
    cards.scrollTop = 0;
    cards.firstElementChild?.focus({preventScroll:true});
  }

  function cancelSwap(){
    if(G.mode !== 'level' || !G._swap || picking) return false;
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
    if(picking || !canSkip()) return false;
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
      if(HEXES.needsReplacement()){ startMajorSwap(o); return; }
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
    if(G._swap.kind === 'major'){
      if(!HEXES.choose(G._swap.id,id)) return;
      finishChoice();
      if(G.mode === 'play') banner(G.enhancements.result,HEXES.planLabel(),1.8);
      return;
    }
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
    if(picking) return true; // 选中动效收尾中，吞掉按键避免二次选择
    if(key === 'escape') return cancelSwap();
    if(key === 'x') return skipReward();
    if(key === 'r') return refreshCards();
    const index = choiceKeys.indexOf(key);
    if(index < 0) return false;
    const button = byId('cards').children[index];
    if(!button) return false;
    button.click();
    return true;
  }

  return { groups, pool, majors, reset, rollCards, queueMilestone, rollMilestone, applyStats, onKill, status, tryBayonet, buildProfile,
    renderCards, openLevel, openReward, chooseCard, chooseReplacement, cancelSwap, skipReward, refreshCards, rerollCardAt, ascendCards, handleKey, regularOptions };
})();
