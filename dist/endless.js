/* 无尽塔的场景、刷怪、记录和局内奖励节奏。 */
const TOWER = (function(){
  const waves = 3, hexLimit = 8, particleLimit = 640;
  const rules = [
    { name:'追猎', hint:'突进单位较多，敌人移速提高。', speed:1.16, hp:1, cadence:.85,
      lead:['runner','burrower','bomber','drone'] },
    { name:'重装', hint:'护盾、装甲和支援较多，敌人生命提高。', speed:1, hp:1.24, cadence:1.06,
      lead:['tank','shellback','shieldguard','bastion','anchor'] },
    { name:'落区', hint:'远程单位较多，每隔数秒锁定地面进行炮击。', speed:1, hp:1, cadence:1,
      lead:['gunner','caster','sniper','lobber','conjurer'] }
  ];
  const early = ['runner','gunner','drone','burrower','tank','bomber'];
  const mixed = [...early,'caster','sniper','brute','shellback','lancer','shieldguard','bastion','conjurer','lobber','anchor'];
  const areaAttackers = ['lobber','anchor'];
  const paces = {
    steady:{name:'标准',interval:1,extra:1},
    easing:{name:'舒缓',interval:1.12,extra:.88},
    surge:{name:'紧凑',interval:.84,extra:1.18}
  };

  function active(){ return G.runMode === 'tower'; }
  function read(value){
    const unlocked = value?.unlocked === true;
    return {unlocked,best:unlocked && Number.isSafeInteger(value.best) ? Math.max(0,value.best) : 0};
  }
  function unlock(){
    if(!PROF.tower.unlocked) PROF.tower.unlocked = true;
  }
  function fresh(){
    return {floor:1,cleared:0,spawned:0,artilleryT:0,pace:'steady',nextPace:'steady',startedAt:0,loss:0,down:false};
  }
  function isBossFloor(floor=G.tower.floor){ return floor % 3 === 0; }
  function rule(floor=G.tower.floor){ return rules[((floor-1)%3+Math.floor((floor-1)/3)%3)%rules.length]; }
  function label(){ return '无尽塔 第 ' + G.tower.floor + ' 层'; }
  function paceLabel(){ return '节奏 · ' + paces[G.tower.pace].name; }
  function skillLimit(base,floor){
    return Math.min(12,base + 2 + (floor >= 5 ? 1 : 0) + (floor >= 10 ? 1 : 0));
  }
  function difficulty(floor){
    const progress = 1 - 1 / (1 + (floor-1) / 17);
    const depth = Math.max(0,Math.log2(floor/24));
    return {
      interval:1.22-.70*progress, hp:1+6*progress+.18*depth,
      damage:1+1.3*progress+Math.min(.27,.025*depth),
      speed:1+.23*progress, extra:.08+.6*progress, cap:Math.min(ENEMY_CAP,22+Math.floor((floor-1)*2)),
      bossHp:.80+4.1*progress+.16*depth, bossSpeed:1+.17*progress, progress
    };
  }
  function waveDuration(floor,wave){ return 14 + (wave-1)*3 + Math.min(7,Math.floor((floor-1)/3)); }
  function noteDamage(amount){
    if(G.phase !== 'clear') G.tower.loss += Math.min(G.p.hp,amount) / G.p.maxHp;
  }
  function noteDown(){
    if(G.phase !== 'clear') G.tower.down = true;
  }
  function paceAfterClear(){
    const {floor,startedAt,loss,down} = G.tower;
    const fights = waves*waveDuration(floor,2);
    const expected = fights + (isBossFloor(floor) ? 28 : 14);
    const elapsed = G.t - startedAt;
    if(down || loss >= .45 || elapsed > expected + 15) return 'easing';
    if(loss <= .20 && elapsed <= expected - 5) return 'surge';
    return 'steady';
  }
  function startWave(spawnDelay,announce){
    const {floor} = G.tower;
    G.phase = 'wave';
    G.waveT = G.waveDur = waveDuration(floor,G.wave);
    G.spawnT = spawnDelay;
    G.tower.artilleryT = 5;
    if(G.wave === 1 && (floor-1)%3 === 0) HEXES.queueTower(floor);
    if(announce) banner(label() + ' · ' + G.wave + '/' + waves,rule().name + ' · ' + rule().hint,1.44);
    if(G.wave === 2 && !G.crates.length) spawnCrate();
  }
  function nextKind(){
    const {floor} = G.tower;
    const cadence = ++G.tower.spawned;
    const roster = floor < 4 ? early : mixed;
    const areaCount = G.enemies.filter(e => !e.dead && areaAttackers.includes(e.kind)).length;
    const areaCap = floor < 4 ? 0 : floor < 10 ? 2 : 3;
    const allowed = id => !areaAttackers.includes(id) || areaCount < areaCap;
    // Introduce the two area attackers at separate points in each floor's incoming formation.
    const incomingArea = cadence%14 === 5 ? 'lobber' : cadence%14 === 12 ? 'anchor' : null;
    if(incomingArea && allowed(incomingArea) && !G.enemies.some(e => !e.dead && e.kind === incomingArea)) return incomingArea;
    // While either introduction is still pending, leave room for both types.
    const randomArea = cadence >= 12;
    const eligible = id => !areaAttackers.includes(id) || randomArea && allowed(id);
    const favored = rule().lead.filter(id => eligible(id) && (floor > 2 || CampaignEnemies.rank(id) < 3));
    const options = (floor < 7 ? cadence%3 !== 0 : cadence%3 === 0) ? favored : roster.filter(eligible);
    return pick(options);
  }
  function scaleEnemy(enemy){
    const curve = difficulty(G.tower.floor), towerRule = rule();
    enemy.hp *= curve.hp * towerRule.hp;
    enemy.maxHp = enemy.hp;
    enemy.plate = Math.round(enemy.plate * curve.hp * towerRule.hp);
    enemy.maxPlate = enemy.plate;
    enemy.spd *= curve.speed * towerRule.speed;
    enemy.dmg *= curve.damage;
  }
  function scaleBoss(boss){
    const curve = difficulty(G.tower.floor);
    boss.hp *= curve.bossHp;
    boss.maxHp = boss.hp;
    boss.spd *= curve.bossSpeed;
    boss.dmg *= curve.damage;
  }
  function update(dt){
    if(G.phase !== 'wave') return;
    G.waveT = Math.max(0,G.waveT-dt);
    const {floor} = G.tower, curve = difficulty(floor), towerRule = rule();
    if(towerRule.name === '落区' && G.waveT > 0){
      G.tower.artilleryT -= dt;
      if(G.tower.artilleryT <= 0){
        G.tower.artilleryT = 8.5 - 3.2 * curve.progress;
        addZone(G.p.x,G.p.y,42 + Math.floor(12*curve.progress),14 * curve.damage,1.35);
      }
    }
    if(G.waveT > 0 && G.enemies.length < curve.cap){
      G.spawnT -= dt;
      if(G.spawnT <= 0){
        const pace = paces[G.tower.pace];
        G.spawnT = curve.interval * towerRule.cadence * pace.interval * rnd(.87,1.12);
        const count = Math.min(curve.cap-G.enemies.length,Math.random()<curve.extra*pace.extra ? 2 : 1);
        for(let i=0;i<count;i++){
          const pt = spawnPointNear(), kind = nextKind();
          spawnEnemy(kind,pt.x,pt.y,{noElite:true,elite:floor>=6 && CampaignEnemies.rank(kind)<3 && Math.random()<curve.progress*.24});
          if(pt.deco) spawnPuff(pt.x,pt.y);
        }
      }
    }
    if(G.waveT <= 0) endWave();
  }
  function endWave(){
    if(G.phase !== 'wave') return;
    if(G.wave < waves){ G.wave++; startWave(.7,true); }
    else if(isBossFloor()) startBoss();
    else if(!G.enemies.some(enemy => !enemy.dead)){
      const x = G.p.x + (G.p.x > ARENA.w/2 ? -86 : 86);
      complete({x,y:G.p.y});
    }
  }
  function complete(from){
    const {floor} = G.tower;
    G.phase = 'clear';
    G.tower.cleared = floor;
    G.tower.nextPace = paceAfterClear();
    G.eb.length = G.haz.length = 0;
    if(floor > PROF.tower.best){
      PROF.tower.best = floor;
      saveProf();
    }
    const point = FieldMaps.safePoint(from.x,from.y,26);
    const mustExit = Math.hypot(point.x-G.p.x,point.y-G.p.y) < 34;
    G.portal = {...point,t:0,name:'下一层跃点',color:'#c9aaff',mustExit};
    banner('第 ' + floor + ' 层已通关',mustExit ? '离开光环，再进入跃点前往下一层' : '进入跃点前往下一层',2);
    SFX.portal();
  }
  function advance(){
    if(G.phase !== 'clear' || !G.portal) return;
    if(G.tower.floor < Number.MAX_SAFE_INTEGER) G.tower.floor++;
    const {floor} = G.tower;
    G.boss = G.portal = G.bossEncounter = null;
    G.bullets.length = G.orbs.length = G.parts.length = G.rings.length = G.texts.length = 0;
    G.mines.length = G.booms.length = G.turrets.length = 0;
    G.p.hp = Math.min(G.p.maxHp,G.p.hp + G.p.maxHp * .15);
    G.p.inv = Math.max(1.2,G.p.inv);
    G.p.vx = G.p.vy = 0;
    G.wave = 1;
    G.tower.spawned = 0;
    G.tower.pace = G.tower.nextPace;
    G.tower.startedAt = G.t;
    G.tower.loss = 0;
    G.tower.down = false;
    G.skillLimit = skillLimit(skillCapacity(G.growth),floor);
    setScene((floor-1)%SCENES.length);
    startWave(1.25,true);
  }
  function limitParticles(){
    if(G.parts.length > particleLimit) G.parts.splice(0,G.parts.length-particleLimit);
  }
  function settle(){
    const points = Math.min(1000,G.tower.cleared*50);
    PROF.pts += points;
    PROF.total += points;
    saveProf();
    return points;
  }
  return { active, read, unlock, fresh, isBossFloor, rule, label, paceLabel, skillLimit, difficulty, startWave, endWave,
    update, scaleEnemy, scaleBoss, noteDamage, noteDown, complete, advance, limitParticles, settle, waves, hexLimit };
})();
