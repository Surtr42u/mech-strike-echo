/* Menu presentation and screen-resolution instruments. The simulation owns all balances and stats. */
const byId = id => document.getElementById(id);
const numberFormat = new Intl.NumberFormat('zh-CN');
const thumbCache = new Map();
let shopTab = 'skin';
let hangarGroup = 'modules';
let selectedStock = 0;
let shopOpener = null;
let manualOpener = null;
let reducedEffects = false;
let hudPaintAt = -Infinity;
let rackSignature = '';
let bannerTimer = 0;

const pictograms = {
  sound:'M3 9h4l5-4v14l-5-4H3z M15.5 8c2 2 2 6 0 8 M18.5 5c4 4 4 10 0 14',
  muted:'M3 9h4l5-4v14l-5-4H3z M16 9l6 6 M22 9l-6 6',
  settings:'M3 7h6m5 0h7 M3 17h11m5 0h2 M9 4h5v6H9z M14 14h5v6h-5z',
  credit:'M12 2.5l8.2 4.8v9.5L12 21.5l-8.2-4.7V7.3z M15 8.5H9v7h6 M9.5 12H14',
  play:'M6 3.5L20 12 6 20.5z',
  manual:'M3 4.5c3-.6 6-.2 9 1.6 3-1.8 6-2.2 9-1.6v14c-3-.5-6-.2-9 1.8-3-2-6-2.3-9-1.8z M12 6v14',
  supply:'M3 8h18v12H3z M6 8l2-4h8l2 4 M3.5 12h17 M10 12v2h4v-2',
  target:'M12 2v5m0 10v5M2 12h5m10 0h5 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  swap:'M4 7h14l-3-3 M20 17H6l3 3 M4 7v3 M20 17v-3',
  chart:'M3 20h18 M5 16v-4h3v4z M11 16V8h3v8z M17 16V4h3v12z',
  save:'M4 4h13l3 3v13H4z M8 4v6h8V4 M8 20v-6h8v6',
  pause:'M6 4h3v16H6z M15 4h3v16h-3z', close:'M5 5l14 14 M19 5L5 19',
  touch:'M7 12l2 2V6a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0l2 1v3l-3 5h-6l-5-7z'
};
function inkIcon(canvas, name) {
  canvas.dataset.icon = name;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  g.scale(64/24, 64/24);
  g.strokeStyle = g.fillStyle = getComputedStyle(canvas).color;
  g.lineWidth = 1.7;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = new Path2D(pictograms[name]);
  if(name === 'play' || name === 'pause') g.fill(path);
  else g.stroke(path);
}
function node(tag, cls, value) {
  const el = document.createElement(tag);
  if(cls) el.className = cls;
  if(value !== undefined) el.textContent = value;
  return el;
}
function thumbnail(kind, id) {
  const key = kind + '-' + id;
  if(!thumbCache.has(key)) thumbCache.set(key, kind === 'skin' ? skinPreviewURL(id) : weaponIconURL(WP[id]));
  return thumbCache.get(key);
}
function updateLoadout() {
  const pilot = SKINS[PROF.skin], weapon = WP[PROF.weapon];
  byId('pilotName').textContent = pilot.name;
  byId('pilotMove').textContent = '必杀 · ' + pilot.act.n;
  byId('weaponName').textContent = weapon.n;
  byId('weaponMove').textContent = 'Lv.' + weaponGrade(weapon.id) + ' · ' + weapon.sk.n;
  byId('moduleLoadout').textContent = activeHangarCount() + ' 项生效 · ' + skillCapacity() + ' 技能槽';
  byId('pilotImage').src = thumbnail('skin',PROF.skin);
  byId('hudPortrait').src = thumbnail('skin',G.skin);
  byId('weaponImage').src = thumbnail('weapon', weapon.id);
  byId('walletCount').textContent = numberFormat.format(PROF.pts);
  byId('recordBest').textContent = numberFormat.format(PROF.best);
  byId('recordRuns').textContent = numberFormat.format(PROF.runs);
  byId('hudPilot').textContent = SKIN().name;
  updateMechLoadout();
}
function currentStock() {
  if(shopTab === 'growth') return hangarGroup === 'tuning' ? PROF.weapon : hangarRows(hangarGroup)[0].id;
  return shopTab === 'skin' ? PROF.skin : PROF.weapon;
}
function stockRows() {
  if(shopTab === 'growth') return hangarRows(hangarGroup);
  if(shopTab === 'skin') return SKINS.map((pilot,i) => ({
    id:i, name:pilot.name, category:'驾驶员', desc:pilot.desc, price:pilot.price, owned:ownSkin(i),
    skill:pilot.act.n, effect:pilot.act.t, cooldown:pilot.act.cd, passive:pilot.pas.t, passiveLabel:'角色被动'
  }));
  return WEAPONS.map(w => {
    const resonance = RESONANCE[w.class];
    return {id:w.id, name:w.n, category:w.tag + '武器', desc:w.desc, price:w.price, owned:ownWep(w.id),
      skill:w.sk.n, effect:w.sk.t, cooldown:w.sk.cd, passive:resonance ? resonance.n + ' · ' + resonance.t : '', passiveLabel:'武器共鸣'};
  });
}
function showStockDetail(row) {
  const detail = byId('shopDetail');
  detail.replaceChildren();
  if(shopTab === 'growth') { showHangarDetail(row); return; }
  const art = node('div','detail-art' + (shopTab === 'weapon' ? ' gun' : ''));
  const img = node('img'); img.alt = ''; img.src = thumbnail(shopTab,row.id); art.append(img);
  detail.append(art,node('div','detail-tag',row.category),node('h3','',row.name),node('p','',row.desc));
  const dl = node('dl');
  const skill = node('div');
  skill.append(node('dt','',(shopTab === 'skin' ? '角色必杀' : '武器主动') + ' · ' + row.skill),
    node('dd','',row.effect + '　冷却 ' + row.cooldown + ' 秒'));
  dl.append(skill);
  if(row.passive) {
    const passive = node('div');
    passive.append(node('dt','',row.passiveLabel),node('dd','',row.passive));
    dl.append(passive);
  }
  const equip = node('button','primary wide');
  equip.id = 'equipItem';
  const equipped = currentStock() === row.id, shortfall = row.price - PROF.pts;
  equip.textContent = equipped ? '已装配' : row.owned ? '装备' + row.name : shortfall > 0 ?
    '还差 ' + numberFormat.format(shortfall) + ' 积分' : '解锁并装备 · ' + numberFormat.format(row.price) + ' 积分';
  equip.disabled = equipped || (!row.owned && shortfall > 0);
  equip.onclick = () => {
    if(shopTab === 'skin') pickSkin(row.id);
    else pickWep(row.id);
    byId('shopGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  };
  detail.append(dl,equip);
  if(shopTab === 'weapon' && row.owned){
    const tuning = node('button','secondary wide tuning-link','Lv.' + weaponGrade(row.id) + ' · 前往武器调校');
    tuning.onclick = () => {
      hangarGroup = 'tuning';
      setShopTab('growth',row.id);
      byId('shopGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    };
    detail.append(tuning);
  }
}
function buildShop() {
  byId('shopPts').textContent = numberFormat.format(PROF.pts);
  const grid = byId('shopGrid'), rows = stockRows();
  const detail = byId('shopDetail');
  const offset = grid.scrollTop, detailOffset = detail.scrollTop;
  const hangar = shopTab === 'growth', modules = hangar && hangarGroup !== 'tuning';
  const equipped = hangar ? null : currentStock();
  grid.classList.toggle('module-grid',modules);
  const filters = byId('hangarFilters');
  filters.hidden = !hangar;
  filters.querySelectorAll('[data-hangar-group]').forEach(button => {
    button.setAttribute('aria-pressed',String(button.dataset.hangarGroup === hangarGroup));
  });
  byId('catalogName').textContent = hangar ? '下次出击自动生效' : shopTab === 'skin' ? '驾驶员名册' : '武器库';
  byId('catalogCount').textContent = hangar ? '已升级 ' + rows.filter(r=>r.active).length + ' / ' + rows.length :
    '已解锁 ' + rows.filter(r=>r.owned).length + ' / ' + rows.length;
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.setAttribute('aria-pressed',String(b.dataset.tab === shopTab));
    b.classList.toggle('on',b.dataset.tab === shopTab);
  });
  const fragment = document.createDocumentFragment();
  for(const row of rows) {
    const item = node('button',modules ? 'shop-item module-item' : 'shop-item');
    const selected = row.id === selectedStock;
    item.setAttribute('aria-pressed',String(selected));
    if(modules){
      const symbol = node('span','module-symbol',row.icon);
      symbol.setAttribute('aria-hidden','true');
      item.append(symbol);
    } else {
      const kind = shopTab === 'skin' ? 'skin' : 'weapon';
      const art = node('span','catalog-image' + (kind === 'weapon' ? ' gun' : ''));
      const img = node('img'); img.alt = ''; img.src = thumbnail(kind,row.id); art.append(img);
      item.append(art);
    }
    item.append(node('strong','',row.name));
    if(hangar){
      item.append(node('small','','Lv.' + row.level + ' · ' + row.effects),
        node('small',row.active ? 'equipped' : '',hangarStatus(row)));
    } else {
      const owned = shopTab === 'weapon' ? 'Lv.' + weaponGrade(row.id) : '已解锁';
      const status = row.id === equipped ? (shopTab === 'weapon' ? owned + ' · 已装配' : '已装配') :
        row.owned ? owned : numberFormat.format(row.price) + ' 积分';
      item.append(node('small',row.id === equipped ? 'equipped' : '',status));
    }
    item.onclick = () => {
      grid.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
      selectedStock = row.id;
      item.setAttribute('aria-pressed','true');
      showStockDetail(row);
      detail.scrollTop = 0;
    };
    if(selected) showStockDetail(row);
    fragment.append(item);
  }
  grid.replaceChildren(fragment);
  grid.scrollTop = offset;
  detail.scrollTop = detailOffset;
}
function setShopTab(tab, selection) {
  shopTab = tab;
  selectedStock = selection ?? currentStock();
  byId('shopGrid').scrollTop = 0;
  byId('shopDetail').scrollTop = 0;
  buildShop();
  byId('shopGrid').querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest'});
}
function openShop(tab) {
  if(!['title','pause','play','over','win'].includes(G.mode)) return;
  shopOpener = document.activeElement;
  if(G.mode === 'play') togglePause();
  G.shopFrom = G.mode;
  G.mode = 'shop';
  for(const id of ['ovTitle','ovPause','ovOver']) byId(id).classList.add('hide');
  byId('ovShop').classList.remove('hide');
  setShopTab(['weapon','growth'].includes(tab) ? tab : 'skin');
  byId('btnShopX').focus({preventScroll:true});
}
function closeShop() {
  if(G.mode !== 'shop') return;
  byId('ovShop').classList.add('hide');
  G.mode = G.shopFrom || 'title';
  const panel = G.mode === 'pause' ? 'ovPause' : ['win','over'].includes(G.mode) ? 'ovOver' : 'ovTitle';
  byId(panel).classList.remove('hide');
  clearBanner();
  updateLoadout();
  if(shopOpener && byId(panel).contains(shopOpener)) shopOpener.focus({preventScroll:true});
}
function returnToLobby() {
  G.mode = 'title';
  byId('ovOver').classList.add('hide');
  byId('ovTitle').classList.remove('hide');
  clearBanner();
  updateLoadout();
  byId('btnStart').focus({preventScroll:true});
}
function updateQLabel() {
  document.querySelectorAll('[data-quality]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.quality) === QLEVEL)));
  byId('qualityDesc').textContent = Q_DESC[QLEVEL];
}
function syncSwitch(el,on,label) {
  el.setAttribute('aria-checked',String(on));
  el.setAttribute('aria-label',label);
  el.textContent = on ? '开' : '关';
}
function syncSound() {
  const on = SFX.isOn();
  document.querySelectorAll('.sound-toggle').forEach(b => {
    const label = on ? '关闭音效' : '开启音效';
    b.title = label;
    b.setAttribute('aria-label',label);
    inkIcon(b.querySelector('canvas'),on ? 'sound' : 'muted');
  });
  syncSwitch(byId('settingSound'),on,'游戏音效');
}
function toggleSound() {
  const on = !SFX.isOn();
  SFX.setOn(on);
  storeSet(SKEY,on ? '1' : '0');
  if(on && G.mode === 'play') SFX.ambience(G.stage);
  syncSound();
}
function renderHexGuide(tier) {
  const cards = Object.entries(HEXES.cards);
  const shown = tier === 'all' ? cards : cards.filter(([,card]) => card.tier === tier);
  const list = byId('hexGuideList');
  byId('hexGuideFilters').querySelectorAll('[data-hex-tier]').forEach(button => {
    button.setAttribute('aria-pressed',String(button.dataset.hexTier === tier));
  });
  byId('hexGuideCount').textContent = '共 ' + shown.length + ' 项';
  list.replaceChildren(...shown.map(([id,card]) => {
    const entry = node('li','hex-guide-entry');
    entry.dataset.hexCard = id;
    entry.dataset.tier = card.tier;
    entry.style.setProperty('--hex-tier-color',HEXES.tierColors[card.tier]);
    const icon = node('span','hex-guide-icon',card.ic);
    icon.setAttribute('aria-hidden','true');
    const heading = node('div','hex-guide-heading');
    heading.append(icon,node('h3','',card.n),node('span','hex-guide-tier',HEXES.tierNames[card.tier]));
    entry.append(heading,node('p','hex-guide-effect',card.d));
    if(card.risk){
      const risk = node('p','hex-guide-risk');
      risk.append(node('strong','','代价'),document.createTextNode(card.risk));
      entry.append(risk);
    }
    return entry;
  }));
  list.scrollTop = 0;
}

function setHexGuideHash(show) {
  if(show && location.hash !== '#hexes') history.replaceState(history.state,'','#hexes');
  if(!show && location.hash === '#hexes') history.replaceState(history.state,'',location.href.split('#')[0]);
}

function showManual(section, opener) {
  const dialog = byId('manualDialog'), opening = !dialog.open;
  const hexes = section === 'hexes';
  if(hexes && byId('guideHexes').hidden) renderHexGuide('all');
  dialog.classList.toggle('hex-guide-open',hexes);
  const tabs = [...byId('manualTabs').querySelectorAll('[data-manual]')];
  const selected = tabs.find(tab => tab.dataset.manual === section);
  for(const tab of tabs){
    const active = tab === selected;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex = active ? 0 : -1;
    byId(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if(G.mode === 'title') setHexGuideHash(hexes);
  if(opening){
    manualOpener = opener ?? byId('openManual');
    dialog.showModal();
    selected.focus({preventScroll:true});
  }
  dialog.scrollTop = 0;
}

function syncHexGuideHash() {
  if(G.mode !== 'title') return;
  const dialog = byId('manualDialog');
  if(location.hash === '#hexes' && (!dialog.open || byId('guideHexes').hidden)) showManual('hexes');
  else if(location.hash !== '#hexes' && dialog.open && !byId('guideHexes').hidden) dialog.close();
}

function wireManual() {
  for(const id of ['openManual','pauseManual']) byId(id).onclick = event => showManual('controls',event.currentTarget);
  byId('openRoute').onclick = event => showManual('route',event.currentTarget);
  const group = byId('manualTabs');
  const tabs = [...group.querySelectorAll('[data-manual]')];
  for(const tab of tabs) tab.onclick = () => showManual(tab.dataset.manual);
  group.addEventListener('keydown',event => {
    const index = tabs.indexOf(event.target);
    if(index < 0) return;
    const next = {
      ArrowLeft:(index + tabs.length - 1) % tabs.length, ArrowRight:(index + 1) % tabs.length,
      Home:0, End:tabs.length - 1
    }[event.key];
    if(next === undefined) return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus({preventScroll:true});
  });
  byId('hexGuideFilters').querySelectorAll('[data-hex-tier]').forEach(button => {
    button.onclick = () => renderHexGuide(button.dataset.hexTier);
  });
  byId('manualDialog').addEventListener('close',() => {
    if(G.mode === 'title') setHexGuideHash(false);
    manualOpener?.focus({preventScroll:true});
    manualOpener = null;
  });
  window.addEventListener('hashchange',syncHexGuideHash);
}
function clearBanner() {
  clearTimeout(bannerTimer);
  byId('banner').classList.remove('on');
}
function banner(title,sub,seconds) {
  clearBanner();
  byId('banA').textContent = title;
  byId('banB').textContent = sub || '';
  byId('banner').classList.add('on');
  bannerTimer = setTimeout(clearBanner,(seconds || 1.4)*1000);
}
function showReport(win,withdrawn) {
  G.pending = 0;
  for(const id of ['ovLevel','ovPause','ovEvent']) byId(id).classList.add('hide');
  byId('ovOver').classList.remove('hide');
  clearBanner();
  SFX.stopAmbience();
  byId('overTag').textContent = win ? 'MISSION COMPLETE' : 'AFTER ACTION REPORT';
  byId('overTitle').textContent = win ? '五区突破' : withdrawn ? '已撤离战区' : '战斗结束';
  const points = settle(win);
  const values = [
    ['战区',SCENES[G.stage].name],['波次',G.wave + ' / ' + WAVES_PER_STAGE],
    ['击破',G.kills],['得分',numberFormat.format(G.score)],
    ['等级','LV ' + G.lv],['用时',Math.floor(G.time/60) + ':' + String(Math.floor(G.time%60)).padStart(2,'0')],
    ['局内技能',G.slots.length + ' / ' + G.skillLimit],['最高得分',numberFormat.format(PROF.best)],
    ['获得积分','+' + numberFormat.format(points)],['积分余额',numberFormat.format(PROF.pts)]
  ];
  const stats = byId('overStats');
  stats.replaceChildren();
  for(const [name,value] of values) {
    const line = node('div',name === '获得积分' ? 'earned' : '');
    line.append(node('span','',name),node('b','',value));
    stats.append(line);
  }
  updateLoadout();
  byId('btnRetry').focus({preventScroll:true});
}
function wireTerminal() {
  document.querySelectorAll('canvas[data-icon]').forEach(c => inkIcon(c,c.dataset.icon));
  byId('btnStart').onclick = byId('btnRetry').onclick = startGame;
  byId('btnShop').onclick = byId('btnShop2').onclick = byId('wallet').onclick = byId('selectPilot').onclick = () => openShop('skin');
  byId('selectWeapon').onclick = () => openShop('weapon');
  byId('selectModules').onclick = () => openShop('growth');
  byId('btnShopX').onclick = closeShop;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setShopTab(b.dataset.tab));
  byId('hangarFilters').querySelectorAll('[data-hangar-group]').forEach(button => {
    button.onclick = () => {
      hangarGroup = button.dataset.hangarGroup;
      setShopTab('growth');
    };
  });
  byId('btnPause').onclick = byId('btnResume').onclick = togglePause;
  byId('btnQuit').onclick = quitRun;
  byId('btnHome').onclick = returnToLobby;
  byId('btnEvt').onclick = closeEvent;
  byId('lvCancel').onclick = TALENTS.cancelSwap;
  byId('lvSkip').onclick = event => { if(event.detail < 2) TALENTS.skipReward(); };
  byId('lvRefresh').onclick = TALENTS.refreshCards;
  byId('lvAscend').onclick = TALENTS.ascendCards;
  byId('btnMech').onclick = useMechAction;
  wireMechSelect();
  byId('charAction').onclick = charSkill;
  byId('weaponAction').onclick = weaponSkill;
  document.querySelectorAll('[data-bag]').forEach(b => b.onclick = () => useItem(Number(b.dataset.bag)));
  for(const id of ['btnSound','btnMute','settingSound']) byId(id).onclick = toggleSound;
  for(const id of ['openSettings','pauseSettings']) byId(id).onclick = () => byId('settingsDialog').showModal();
  wireManual();
  document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
  document.querySelectorAll('[data-quality]').forEach(b => b.onclick = () => {
    perfDone = true;
    setQuality(Number(b.dataset.quality),true);
  });
  byId('settingMotion').onclick = () => {
    reducedEffects = !reducedEffects;
    storeSet('echoReducedEffects',reducedEffects ? '1' : '0');
    syncSwitch(byId('settingMotion'),!reducedEffects,'镜头震动与强闪光');
  };
  SCENES.forEach((sc,i) => {
    const line = node('li');
    const guard = MID_BOSSES[i];
    const names = '关底 · ' + BOSSES[sc.boss].n + (guard ? '\n第' + guard.wave + '波后 · ' + BOSSES[guard.kind].n : '');
    line.append(node('span','sector-number','S' + pad2(i+1)),node('b','',sc.name),
      node('small','',names + '\n' + SectorClimate.routeNotes[i]));
    byId('routeList').append(line);
  });
  if(G.touch) byId('titleHint').textContent = '左侧拖动移动 · 右侧点按技能';
  updateQLabel();
  syncSound();
  syncSwitch(byId('settingMotion'),!reducedEffects,'镜头震动与强闪光');
  updateLoadout();
  byId('btnStart').disabled = false;
  syncHexGuideHash();
}
/* Refresh text and meters at instrument speed. The world still animates every frame. */
const hudNodes = new Map();
function instrument(id) {
  if(!hudNodes.has(id)) hudNodes.set(id,byId(id));
  return hudNodes.get(id);
}
function putText(el,value) {
  const s = String(value);
  if(el.textContent !== s) el.textContent = s;
}
function meterFill(id,fraction) {
  const t = 'scaleX(' + clamp(fraction,0,1).toFixed(3) + ')';
  const meter = instrument(id);
  if(meter.style.transform !== t) meter.style.transform = t;
}
function paintAbility(id,name,value,description,ready,accent) {
  const el = instrument(id);
  putText(el.querySelector('.ability-name'),name);
  putText(el.querySelector('.ability-value'),value);
  el.disabled = !ready;
  if(el.title !== description) { el.title = description; el.setAttribute('aria-label',description); }
  if(el.style.getPropertyValue('--accent') !== accent) el.style.setProperty('--accent',accent);
}
function paintInstruments(force) {
  const now = performance.now();
  if(!force && now - hudPaintAt < 85) return;
  hudPaintAt = now;
  const pilot = SKIN(), weapon = WEP(), boss = G.boss && !G.boss.dead ? G.boss : null;
  const hp = G.p.hp / G.p.maxHp;
  putText(instrument('hudHP'),Math.max(0,Math.ceil(G.p.hp)) + ' / ' + G.p.maxHp);
  putText(instrument('hudLevel'),'LV ' + G.lv);
  putText(instrument('hudKills'),G.kills);
  putText(instrument('hudScore'),numberFormat.format(G.score));
  putText(instrument('hudLives'),(G.shield ? '护盾 ×' + G.shield + '　' : '') + '复活 ×' + G.revives);
  const growth = instrument('hudGrowth');
  const grade = weaponGrade(weapon.id,G.growth);
  if(force || growth.dataset.grade !== String(grade)) {
    growth.dataset.grade = grade;
    const count = activeHangarCount(G.growth), parts = [];
    if(count) parts.push('战前整备 ×' + count);
    if(grade > 1) parts.push('武器 Lv.' + grade);
    const label = parts.join(' · ');
    putText(growth,label);
    growth.hidden = !label;
  }
  instrument('hpFill').parentElement.classList.toggle('low',hp < .3);
  meterFill('hpFill',hp); meterFill('xpFill',G.xp/G.need);
  putText(instrument('hudSector'),'S' + pad2(G.stage+1) + ' / ' + SCENES[G.stage].name + SectorClimate.skyLabel());
  FieldMaps.paintHud();
  instrument('wavePanel').classList.toggle('boss',!!boss);
  const clear = G.phase === 'clear';
  putText(instrument('waveName'),boss ? boss.name : clear ? '前往传送门' : G.phase === 'boss' ? '首领接近' : '敌潮 ' + pad2(G.wave) + ' / ' + WAVES_PER_STAGE);
  putText(instrument('waveDetail'),boss ? '阶段 ' + boss.phase + ' / ' + BOSS_PHASES[boss.kind].phases.length : G.phase === 'wave' ? Math.max(0,Math.ceil(G.waveT)) + 's' : '');
  meterFill('waveFill',boss ? boss.hp/boss.maxHp : G.phase === 'wave' ? G.waveT/G.waveDur : 1);
  putText(instrument('comboText'),G.combo >= 5 ? G.combo + ' 连击' : '');
  const active = [['over','过载'],['magnet','磁吸'],['stasis','停滞'],['fleet','疾风'],['rad','辐射'],['luck','幸运'],['weak','虚弱']];
  putText(instrument('hudBuffs'),active.filter(([k])=>G.buff[k]>0).map(([k,n])=>n+' '+Math.ceil(G.buff[k])+'s').join(' · '));
  putText(instrument('hudEnhancements'),[...TALENTS.status(),PREPARATIONS.lockStatus()].filter(Boolean).join(' · '));
  putText(instrument('hudHexPlan'),HEXES.planLabel());
  const live = G.mechT > 0;
  const shapeLock = live ? '机甲形态期间暂停使用' : '';
  paintAbility('charAction',pilot.act.n,live ? '暂停' : G.ccd>0 ? Math.ceil(G.ccd)+'s' : pilot.act.ic,shapeLock || (pilot.act.n + ' · ' + pilot.act.t),!live && G.ccd<=0,pilot.flow);
  paintAbility('weaponAction',weapon.sk.n,live ? '暂停' : G.wcd>0 ? Math.ceil(G.wcd)+'s' : weapon.sk.ic,shapeLock || (weapon.sk.n + ' · ' + weapon.sk.t),!live && G.wcd<=0,weapon.c);
  paintMechAbility(live);
  const bagButtons = instrument('actionDock').querySelectorAll('[data-bag]');
  for(let i=0;i<MAX_BAG;i++){
    const item = G.bag[i] && IT[G.bag[i]];
    const label = item ? item.n : '空道具槽';
    const b = bagButtons[i];
    if(b.title !== label) {
      b.title = label; b.disabled = !item;
      b.setAttribute('aria-label',(i+1) + '号道具 · ' + label);
      b.replaceChildren(node('small','',i+1),node('b','',item ? item.ic : '·'));
    }
  }
  const signature = G.skillLimit + ':' + G.slots.map(key=>key+'='+G.skills[key]).join(',');
  if(force || signature !== rackSignature) {
    rackSignature = signature;
    const rack = instrument('skillRack');
    rack.replaceChildren();
    rack.dataset.count = '技能 ' + G.slots.length + ' / ' + G.skillLimit;
    rack.setAttribute('aria-label',rack.dataset.count);
    for(let i=0;i<G.skillLimit;i++){
      const id = G.slots[i], skill = SK[id];
      const chip = node('span','skill-chip' + (skill ? '' : ' empty'));
      if(skill) {
        chip.title = skill.n + ' · ' + G.skills[id] + ' 级';
        chip.style.setProperty('--chip',skill.c);
        chip.append(node('b','',skill.ic),node('small','','×'+G.skills[id]));
      } else chip.setAttribute('aria-label','空技能槽');
      rack.append(chip);
    }
  }
}
