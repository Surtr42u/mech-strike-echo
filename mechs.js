/* 机甲使用同一能量槽。大厅装配只影响下一次出击。 */
const DEFAULT_MECH = 'heavy';
const MECHS = {
  heavy:{
    id:'heavy', name:'铁砧', role:'重机枪', color:'#ffae66', icon:'◆',
    time:22, speed:.74, size:.85, reach:480, interval:.085,
    attack:'双管交替连射，穿透 2 个目标；移动速度 −26%。',
    skill:{name:'压制齐射', cooldown:7, desc:'沿瞄准方向扫出一条宽火力带，贯穿沿线目标。'}
  },
  blade:{
    id:'blade', name:'疾刃', role:'敏捷格斗', color:'#76ebdb', icon:'⟫',
    time:19, speed:1.30, size:.64, reach:88, interval:.30,
    attack:'近身扇形斩击；移动速度 +30%。',
    skill:{name:'破阵冲刺', cooldown:5, desc:'沿移动方向冲刺并横斩；静止时自动瞄准。'}
  },
  barrage:{
    id:'barrage', name:'星幕', role:'弹幕', color:'#c6a4ff', icon:'≋',
    time:20, speed:1, size:.76, reach:420, interval:.43,
    attack:'每隔 0.43 秒发射五枚扇形散射弹，交错覆盖。',
    skill:{name:'星环阵列', cooldown:8, desc:'连续向四周发射两圈相位交错的弹雨。'}
  }
};

function equippedMech(id){
  return typeof id === 'string' && Object.hasOwn(MECHS,id) ? id : DEFAULT_MECH;
}

function currentMech(){ return MECHS[G.mechId]; }
function mechAttackPower(){ return (G.buff.weak > 0 ? .65 : 1) * G.st.mechPower; }
function mechBarragePower(){ return G.st.barragePower ?? 1; }

function resetMech(){
  G.mechT = 0;
  G.mechCd = 0;
  G.mechEchoT = 0;
  G.mechSide = 0;
  G.mechArcs.length = 0;
}

function canSummon(){
  return G.mode === 'play' && !G.st?.mechLocked && G.mechT <= 0 && G.energy >= 100 && G.p?.hp > 0;
}

function canUseMechSkill(){
  return G.mode === 'play' && !G.st?.mechLocked && G.mechT > 0 && G.mechCd <= 0 && G.p?.hp > 0;
}

function useMechAction(){
  return G.mechT > 0 ? useMechSkill() : summonMech();
}

function summonMech(){
  if(!canSummon()) return false;
  resetMech();
  const mech = currentMech(), p = G.p;
  G.energy = 0;
  G.mechT = mech.time + G.st.mechDuration;
  HEXES.onMechStart();
  G.shake = 10;
  p.fireT = 0;
  addFlash(p.x,p.y,175,mech.color,.75);
  G.rings.push({x:p.x,y:p.y,r:8,max:115,life:.55,maxLife:.55,col:mech.color,w:4});
  spark(p.x,p.y,24,mech.color,200);
  SFX.mech();
  banner(mech.name + ' · 启动',G.mechT + ' 秒作战 · 再按 F 释放' + mech.skill.name,1.2);
  return true;
}

function endMech(){
  if(G.mechT <= 0) return;
  resetMech();
  G.p.fireT = 0;
}

function updateMech(dt){
  if(G.mechT <= 0) return;
  const before = Math.ceil(G.mechT);
  if(G.st.mechLocked || G.mechT <= dt){
    const locked = G.st.mechLocked, p = G.p;
    endMech();
    const refunded = locked ? 0 : HEXES.onMechExpiry();
    G.eb.length = 0;
    G.rings.push({x:p.x,y:p.y,r:6,max:90,life:.5,maxLife:.5,col:currentMech().color,w:3});
    p.inv = Math.max(p.inv,1.2);
    banner(locked ? '机甲已锁定' : '能量耗尽','驾驶员形态恢复' + (refunded ? ' · 返还能量 ' + refunded : ''),1.1);
    return;
  }
  G.mechT -= dt;
  G.mechCd = Math.max(0,G.mechCd-dt);
  const after = Math.ceil(G.mechT);
  if(after !== before && after <= 5) SFX.shoot();
  if(G.mechEchoT > 0){
    G.mechEchoT = Math.max(0,G.mechEchoT-dt);
    if(G.mechEchoT === 0) mechPulse(true);
  }
  for(let i=G.mechArcs.length-1;i>=0;i--){
    const arc = G.mechArcs[i];
    arc.life -= dt;
    if(arc.life <= 0) G.mechArcs.splice(i,1);
  }
}

function mechTarget(range){
  const t = nearestEnemy(G.p.x,G.p.y,range);
  return t?.hp > 0 ? t : null;
}

function mechAim(range){
  const p = G.p, t = mechTarget(range);
  return t ? Math.atan2(t.y-p.y,t.x-p.x) : p.faceAngle;
}

function fireMechBullet(angle,damage,spd,radius,pierce,life,offset = 0){
  const p = G.p, ca = Math.cos(angle), sa = Math.sin(angle);
  G.bullets.push({
    x:p.x + ca*17 - sa*offset, y:p.y + sa*17 + ca*offset,
    fromX:p.x, fromY:p.y,
    vx:ca*spd, vy:sa*spd, dmg:damage, pierce, hits:[], life, r:radius,
    crit:Math.random() < G.st.crit, mech:true, mechId:G.mechId
  });
}

function mechHitTargets(inArea,damage,crit = false){
  for(const e of projectileTargets()){
    if(!projectileTargetActive(e) || !inArea(e)) continue;
    if(e === G.boss) damageBoss(e,damage,crit,e.x,e.y);
    else applyDamage(e,damage,crit,e.x,e.y-6);
  }
}

const MECH_SWEEP = .85;
function mechSector(x,y,angle,radius){
  return target => {
    const dx = target.x-x, dy = target.y-y;
    const dist = Math.hypot(dx,dy);
    if(dist <= target.r) return true;
    const d = Math.atan2(dy,dx)-angle;
    return dist <= radius+target.r && Math.cos(d) >= Math.cos(MECH_SWEEP);
  };
}

function mechSlashFX(x,y,angle,radius){
  G.mechArcs.push({x,y,angle,radius,life:.24});
}

function mechFire(target){
  if(G.st.mechLocked) return;
  const mech = currentMech(), p = G.p, s = G.st;
  const t = target || mechTarget(mech.reach);
  if(!t) return;
  const angle = Math.atan2(t.y-p.y,t.x-p.x), power = mechAttackPower();
  p.fireT = mech.interval;
  p.atkT = .15;
  p.flashT = .06;
  p.shotAngle = angle;
  if(mech.id === 'heavy'){
    G.mechSide ^= 1;
    fireMechBullet(angle,(s.dmg*1.65+8)*power,625,4,2,.82,G.mechSide ? 8 : -8);
    spark(p.x+Math.cos(angle)*20,p.y+Math.sin(angle)*20,2,mech.color,120);
    SFX.heavy();
  } else if(mech.id === 'blade'){
    mechHitTargets(mechSector(p.x,p.y,angle,mech.reach),(s.dmg*2.8+22)*power,Math.random() < s.crit);
    mechSlashFX(p.x,p.y,angle,mech.reach);
    SFX.shoot();
  } else {
    G.mechSide ^= 1;
    const center = angle + (G.mechSide ? .06 : -.06);
    const damage = (s.dmg*.95+7)*power*mechBarragePower();
    for(let i=-2;i<=2;i++) fireMechBullet(center+i*.17,damage,490-34*Math.abs(i),4,1,1.07);
    SFX.shoot();
  }
}

function mechDash(){
  const p = G.p, moveX = Number(keys.right)-Number(keys.left)+(joy.active ? joy.nx : 0);
  const moveY = Number(keys.down)-Number(keys.up)+(joy.active ? joy.ny : 0);
  const angle = Math.hypot(moveX,moveY) > .15 ? Math.atan2(moveY,moveX) : mechAim(350);
  const x = p.x, y = p.y, ca = Math.cos(angle), sa = Math.sin(angle);
  const minX = 30, maxX = ARENA.w-30, minY = 34, maxY = ARENA.h-26;
  const bodyRadius = playerRadius(9);
  const obstacles = G.props.filter(prop => prop.solid);
  for(let d=10;d<=150;d+=10){
    const nx = x+ca*d, ny = y+sa*d;
    if(nx < minX || nx > maxX || ny < minY || ny > maxY) break;
    if(FieldMaps.blocksMovement(nx,ny,bodyRadius) || obstacles.some(pr => d2(nx,ny,pr.x,pr.y) < (pr.r+bodyRadius)**2)) break;
    p.x = nx;
    p.y = ny;
  }
  p.vx = p.vy = 0;
  p.faceAngle = p.aimAngle = angle;
  const distance = Math.hypot(p.x-x,p.y-y), radius = 98;
  const lane = target => projectileContact(x-target.x,y-target.y,p.x-target.x,p.y-target.y,24+target.r) !== null;
  const finish = mechSector(p.x,p.y,angle,radius);
  mechHitTargets(t => (distance > 0 && lane(t)) || finish(t),scaleSkill((G.st.dmg*4+42)*mechAttackPower()));
  if(distance > 0) beamFX(x,y,angle,distance,currentMech().color,11,.30);
  mechSlashFX(p.x,p.y,angle,radius);
}

function mechPulse(echo){
  const p = G.p, count = 14, mech = currentMech();
  const damage = scaleSkill((G.st.dmg*1.1+10)*mechAttackPower()*mechBarragePower());
  for(let i=0;i<count;i++) fireMechBullet((i+(echo ? .5 : 0))*TAU/count,damage,echo ? 555 : 360,4,1,1.1);
  G.rings.push({x:p.x,y:p.y,r:10,max:echo ? 104 : 82,life:.36,maxLife:.36,col:mech.color,w:3});
  SFX.shoot();
}

function useMechSkill(){
  if(!canUseMechSkill()) return false;
  const mech = currentMech(), p = G.p;
  G.mechCd = mech.skill.cooldown * (G.st.mechSkillCooldown ?? 1);
  HEXES.onMechSkill();
  p.atkT = .2;
  if(mech.id === 'heavy'){
    const angle = mechAim(570), length = 495, width = 24;
    rayHit(p.x,p.y,angle,length,width,scaleSkill((G.st.dmg*4.5+56)*mechAttackPower()),false);
    beamFX(p.x,p.y,angle,length,mech.color,10,.28,width);
    SFX.heavy();
  } else if(mech.id === 'blade'){
    mechDash();
    SFX.heavy();
  } else {
    mechPulse(false);
    G.mechEchoT = .24;
  }
  G.shake = Math.max(G.shake,mech.id === 'blade' ? 4 : 6);
  return true;
}

function drawMechSwings(){
  if(!G.mechArcs.length) return;
  ctx.save();
  for(const {x,y,angle,radius,life} of G.mechArcs){
    ctx.save();
    ctx.translate(SX(x),SY(y));
    ctx.scale(1,KZ);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,radius,angle-MECH_SWEEP,angle+MECH_SWEEP);
    ctx.closePath();
    ctx.fillStyle = hexA(MECHS.blade.color,life*.75);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0,0,radius,angle-MECH_SWEEP,angle+MECH_SWEEP);
    ctx.strokeStyle = hexA(MECHS.blade.color,Math.min(1,life*4.2));
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawMechGear(x,y,angle,mech,attacking){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(Math.cos(angle)<0 ? -1 : 1,1);
  ctx.fillStyle = '#202b3c';
  if(mech.id === 'heavy'){
    for(const side of [-1,1]){
      const gunX = side === 1 ? 15 : -22;
      ctx.fillStyle = '#252932';
      ctx.fillRect(gunX,-38,9,27);
      ctx.fillStyle = mech.color;
      ctx.fillRect(gunX+2,-35,5,3);
      if(attacking && !reducedEffects) ctx.fillRect(gunX+2,-11,5,4);
    }
  } else if(mech.id === 'blade'){
    ctx.beginPath();
    ctx.moveTo(11,-30); ctx.lineTo(31,-21); ctx.lineTo(22,-11); ctx.lineTo(8,-21); ctx.fill();
    ctx.strokeStyle = mech.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(13,-24); ctx.lineTo(30,-20); ctx.lineTo(22,-13); ctx.stroke();
  } else {
    for(const side of [-1,1]){
      ctx.beginPath(); ctx.arc(22*side,-35,7,0,TAU); ctx.fill();
      ctx.strokeStyle = mech.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(22*side,-35,5,0,TAU); ctx.stroke();
    }
  }
  ctx.restore();
}

/* 大厅装配 */
function updateMechLoadout(){
  const mech = MECHS[PROF.mech];
  byId('mechName').textContent = mech.name;
  byId('mechRole').textContent = mech.role + ' · ' + mech.skill.name;
  byId('mechThumb').style.setProperty('--mech-color',mech.color);
  byId('mechThumb').textContent = mech.icon;
}

function wireMechSelect(){
  const dialog = byId('mechDialog'), options = byId('mechChoices');
  for(const mech of Object.values(MECHS)){
    const card = node('button','mech-choice');
    card.dataset.mech = mech.id;
    card.style.setProperty('--mech-color',mech.color);
    const art = node('span','mech-choice-art',mech.icon);
    art.setAttribute('aria-hidden','true');
    const body = node('span','mech-choice-body');
    body.append(node('small','mech-choice-meta',mech.role + ' · ' + mech.time + ' 秒'),
      node('strong','',mech.name),node('span','',mech.attack),
      node('b','',mech.skill.name + ' · 冷却 ' + mech.skill.cooldown + ' 秒'),
      node('span','',mech.skill.desc));
    card.append(art,body);
    card.onclick = () => {
      if(PROF.mech !== mech.id){
        PROF.mech = mech.id;
        saveProf();
        updateMechLoadout();
        SFX.pick();
      }
      syncMechSelection();
    };
    options.append(card);
  }
  byId('selectMech').onclick = () => {
    syncMechSelection();
    dialog.showModal();
    options.querySelector('[aria-pressed="true"]').focus();
  };
}

function syncMechSelection(){
  for(const option of byId('mechChoices').children){
    const mech = MECHS[option.dataset.mech], selected = mech.id === PROF.mech;
    option.setAttribute('aria-pressed',String(selected));
    option.querySelector('.mech-choice-meta').textContent = mech.role + ' · ' + mech.time + ' 秒' + (selected ? ' · 已装配' : '');
  }
}

function paintMechAbility(live){
  const mech = currentMech(), locked = !!G.st.mechLocked;
  const ready = live ? canUseMechSkill() : canSummon(), cooling = live && G.mechCd > 0;
  const label = live ? mech.skill.name : mech.name;
  const value = locked ? '已锁定' : live ? cooling ? 'CD ' + Math.ceil(G.mechCd) + 's' : '释放' :
    ready ? '变身' : Math.floor(G.energy) + '%';
  const description = locked ? '当前天赋锁定机甲' : live ? mech.skill.name + ' · ' + mech.skill.desc +
    ' · 形态剩余 ' + Math.ceil(G.mechT) + ' 秒' + (cooling ? ' · 冷却 ' + Math.ceil(G.mechCd) + ' 秒' : '') :
    mech.name + ' · 能量 ' + Math.floor(G.energy) + '%' + (ready ? ' · 可变身' : '');
  paintAbility('btnMech',label,value,description,ready,mech.color);
  instrument('btnMech').classList.toggle('ready',ready);
  instrument('btnMech').classList.toggle('mech-live',live);
  putText(instrument('hudMechTime'),live ? Math.ceil(G.mechT) + 's' : '');
}
