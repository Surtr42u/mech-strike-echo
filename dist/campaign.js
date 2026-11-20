'use strict';

/* ══════════ 难度总开关 ══════════
   所有敌我强度倍率集中在这里，改数值不用再翻 spawnEnemy / spawnBoss。
   enemy* 作用于普通敌人与精英，boss* 只作用于关底首领。 */
const DIFFICULTY = Object.freeze({
  enemyCount: 3,     // 刷怪频率倍率（3 = 同时间怪物数量三倍）
  enemyCap: 2.2,     // 场上同时存在上限倍率
  enemyHp: 2,        // 敌人生命倍率
  enemyDamage: 1.5,  // 敌人伤害倍率
  bossHp: 4,         // 首领生命倍率
  bossDamage: 2,     // 首领伤害倍率
  adaptive: {        // 动态难度：玩家打得越好，压力越高
    interval: .26, hp: .30, damage: .16, cap: .12,
    rise: .62, decay: .72
  }
});

/* ══════════ 动态难度 · 自适应威胁 ══════════
   每波统计「掉血比例 / 击倒次数」，结算成 heat ∈ [-1, 1]：
   heat > 0 敌人更多更硬更疼；heat < 0 自动舒缓。
   敌人血量/伤害倍率对战役与无尽塔同时生效；刷怪频率只在战役里额外缩放，
   塔内保留自己的 surge/easing 节奏，避免两套节奏互相打架。 */
const AdaptiveDirector = (() => {
  const cfg = DIFFICULTY.adaptive;
  const names = [[-.35,'舒缓'],[.2,'常规'],[.55,'升温'],[.85,'高压'],[Infinity,'极限']];
  let heat = 0, loss = 0, downs = 0;

  function reset(){ heat = 0; loss = 0; downs = 0; }
  function beginWave(){ loss = 0; downs = 0; }
  function noteDamage(amount){
    if(G.mode !== 'play' || G.phase !== 'wave' || !G.p) return;
    loss += Math.max(0,amount) / Math.max(1,G.p.maxHp);
  }
  function noteDown(){ if(G.phase === 'wave') downs++; }
  function endWave(){
    if(G.mode !== 'play') return;
    const pressure = Math.min(1.4, loss * 1.15 + downs * .6);
    const ease = Math.max(0, .45 - loss) * .9;   // 几乎无伤 → 加码
    heat = clamp(heat * cfg.decay + (ease - pressure * .85) * cfg.rise, -1, 1);
  }
  function interval(){ return 1 - heat * cfg.interval; }
  function hp(){ return 1 + heat * cfg.hp; }
  function damage(){ return 1 + heat * cfg.damage; }
  function cap(){ return 1 + heat * cfg.cap; }
  function name(){ return names.find(([limit]) => heat < limit)[1]; }
  function hudText(){
    /* 综合压力 = 刷怪密度 × 血量 × 伤害，0% 为原始难度 */
    const pct = Math.round((1 / interval() * hp() * damage() - 1) * 100);
    return '威胁 · ' + name() + (pct > 0 ? ' +' + pct + '%' : pct < 0 ? ' ' + pct + '%' : '');
  }
  return { reset, beginWave, noteDamage, noteDown, endWave,
    interval, hp, damage, cap, name, hudText, snapshot:() => ({ heat, loss, downs }) };
})();

function campaignWaveIndex(stage = G.stage, wave = G.wave){
  return stage * WAVES_PER_STAGE + wave;
}

const CampaignBalance = (() => {
  // wave, seconds, hp growth, damage, xp, spawn interval, paired chance, active cap, elite chance
  const knots = [
    [1, 11, 0, 1, 2, 1.28, .10, 18, .04],
    [14, 12, 7, 1.23, 2.5, 1.10, .18, 22, .08],
    [28, 12.5, 15, 1.48, 3, 1.02, .28, 26, .10],
    [42, 13, 25, 1.72, 3.5, .93, .37, 30, .13],
    [56, 13.5, 38, 1.98, 4, .85, .46, 35, .16],
    [70, 14, 54, 2.2, 4.5, .77, .54, 40, .18]
  ];
  const table = [];
  for(let i=1;i<=70;i++){
    const right = knots.findIndex(k => k[0] >= i);
    const b = knots[right], a = knots[Math.max(0, right - 1)];
    const t = a === b ? 0 : (i - a[0]) / (b[0] - a[0]);
    const at = n => a[n] + (b[n] - a[n]) * t;
    const hpGrowth=at(2);
    const lightHpGrowth=hpGrowth+Math.max(0,hpGrowth-15)*.33;
    table[i] = Object.freeze({
      duration:at(1), hpGrowth, lightHpGrowth, damageMul:at(3), xpValue:at(4),
      interval:at(5), extraChance:at(6), cap:Math.round(at(7)), eliteChance:at(8)
    });
  }
  return { at:(stage=G.stage, wave=G.wave) => table[campaignWaveIndex(stage, wave)] };
})();

const CampaignEnemies = (() => {
  // Each row is [role, minimum sector wave, weight]. The tunnels use a different roster from the surface.
  const surface = [
    [['runner',1,5],['gunner',1,3],['tank',3,2]],
    [['drone',1,4],['gunner',1,3],['runner',1,3],['tank',2,2],['lancer',3,3],['shieldguard',4,2],['lobber',6,3]],
    [['runner',1,4],['tank',1,3],['shieldguard',2,2],['lancer',2,2],['bastion',4,2],['conjurer',7,2],['lobber',6,2],['anchor',8,2]],
    [['bomber',1,4],['gunner',1,3],['runner',1,2],['lancer',1,2],['shieldguard',2,3],['bastion',1,2],['conjurer',5,1],['lobber',4,2],['anchor',6,2]],
    [['drone',1,4],['runner',1,3],['sniper',1,3],['lancer',1,2],['shieldguard',4,2],['bastion',2,2],['conjurer',1,3],['lobber',1,2],['anchor',3,2]]
  ];
  const tunnel = [['burrower',1,6],['shellback',3,3]];
  const tunnelSkins = {burrower:'voidshard',shellback:'golem'};
  const iceMine = [['bomber',1,5],['shellback',1,4],['sniper',3,2]];
  const mineSkins = {bomber:'slime',shellback:'golem',sniper:'hackdrone'};
  const supports = ['golem','hackdrone','golem','fireelem','eyedemon'];
  const chanters = ['scav','assassin','snowbeast','fireelem','eyedemon'];
  const lancers = ['scav','assassin','snowbeast','fireelem','voidshard'];
  const heavies = ['golem','golem','golem','fireelem','eyedemon'];
  const ranks = {lancer:2,shieldguard:2,sniper:2,lobber:2,bastion:3,conjurer:3,anchor:3};
  const rank = kind => ranks[kind] || 1;
  const light = new Set(['runner','gunner','drone','bomber','burrower']);
  const healthGrowth = (kind,profile) => light.has(kind) ? profile.lightHpGrowth : profile.hpGrowth;

  function kind(stage, wave, floor, sample, maxRank=3){
    const entries = floor === 'ice-mine' ? iceMine : floor === 'underground' ? tunnel : surface[stage];
    const eligible = entries.filter(entry => wave >= entry[1] && rank(entry[0]) <= maxRank);
    let roll = sample * eligible.reduce((sum, entry) => sum + entry[2], 0);
    for(const entry of eligible){
      roll -= entry[2];
      if(roll < 0) return entry[0];
    }
    return eligible.at(-1)[0];
  }

  function sprite(enemy){
    if(FieldMaps.floorId()==='ice-mine' && mineSkins[enemy.kind]) return mineSkins[enemy.kind];
    if(FieldMaps.underground() && tunnelSkins[enemy.kind]) return tunnelSkins[enemy.kind];
    if(enemy.kind === 'shieldguard') return supports[G.stage];
    if(enemy.kind === 'conjurer') return chanters[G.stage];
    if(enemy.kind === 'lancer') return lancers[G.stage];
    if(enemy.kind === 'bastion') return heavies[G.stage];
    if(enemy.kind === 'lobber') return G.stage===4 ? 'voidshard' : 'hackdrone';
    if(enemy.kind === 'anchor') return G.stage===2 ? 'golem' : 'eyedemon';
    return MON_THEME[G.stage][enemy.kind] || 'scav';
  }

  return { kind, rank, healthGrowth, sprite };
})();

/* ══════════ 特殊波次 ══════════
   每个战区随机排出 3–4 个特殊波：怪潮 / 高危 / 突袭 / 炮火。
   种子每局重掷，意图固定：每区必有 1 波怪潮 + 1 波高危，再随机搭 1–2 波。
   同一局内暂停、切场景都不会改变已经排好的波次。 */
const WaveTypes = (() => {
  const types = {
    standard:{ id:'standard', name:'常规', hint:'', interval:1, count:0, cap:0, hp:1, damage:1, speed:1, elite:0, bias:null },
    horde:{ id:'horde', name:'怪潮', hint:'数量压制 · 单体更脆', interval:.70, count:1, cap:14, hp:.82, damage:.9, speed:1, elite:-.03,
      bias:['runner','burrower','drone','bomber'] },
    elite:{ id:'elite', name:'高危', hint:'精英集群 · 优先点杀', interval:1.12, count:-1, cap:-8, hp:1.35, damage:1.15, speed:.96, elite:.36, bias:null },
    rush:{ id:'rush', name:'突袭', hint:'高速单位 · 别被围住', interval:.86, count:0, cap:4, hp:.95, damage:1, speed:1.14, elite:.02,
      bias:['runner','drone','burrower','bomber','lancer'] },
    siege:{ id:'siege', name:'炮火', hint:'远程压制 · 注意落点', interval:1.04, count:0, cap:-2, hp:1.05, damage:1.08, speed:.94, elite:.04,
      bias:['gunner','sniper','caster','lobber','conjurer'] }
  };
  const candidates = [3,4,5,6,7,8,9,10,11,12];
  let seed = (Math.random() * 4294967296) >>> 0;
  const plans = new Map();

  function hash(stage, wave, salt){
    let h = (seed ^ Math.imul(stage + 1, 374761393) ^ Math.imul(wave + 1, 668265263) ^ Math.imul(salt + 1, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function shuffle(stage){
    /* 休整波不排特殊波，避免怪潮把喘息波吃掉；不足 4 个位置时退回全量 */
    let pool = candidates.filter(wave => !ThreatPacing.at(stage, wave).delay);
    if(pool.length < 4) pool = candidates.slice();
    for(let i = pool.length - 1; i > 0; i--){
      const j = Math.floor(hash(stage, i, 1) * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }
  function plan(stage){
    let map = plans.get(stage);
    if(map) return map;
    const pool = shuffle(stage);
    map = new Map();
    map.set(pool[0], 'horde');
    map.set(pool[1], 'elite');
    map.set(pool[2], hash(stage, 0, 3) < .5 ? 'rush' : 'siege');
    if(hash(stage, 0, 5) < .45) map.set(pool[3], hash(stage, 0, 6) < .5 ? 'rush' : 'siege');
    plans.set(stage, map);
    return map;
  }
  function at(stage = G.stage, wave = G.wave){
    return types[plan(stage).get(wave)] || types.standard;
  }
  /* 特殊波次按权重把刷怪表往对应兵种偏一点，不覆盖精英/守卫逻辑 */
  function biasKind(maxRank, sample, stage = G.stage, wave = G.wave){
    const type = at(stage, wave);
    if(!type.bias) return null;
    const pool = type.bias.filter(id => CampaignEnemies.rank(id) <= maxRank);
    if(!pool.length) return null;
    const index = Math.min(pool.length - 1, Math.floor((((sample % 1) + 1) % 1) * pool.length));
    return pool[index];
  }
  function reset(){
    seed = (Math.random() * 4294967296) >>> 0;
    plans.clear();
  }
  function label(stage, wave){ const type = at(stage, wave); return type.id === 'standard' ? '' : type.name + ' · ' + type.hint; }
  return { at, biasKind, reset, label, types, plan };
})();

const ThreatPacing = (() => {
  const patterns = [
    'ssppgrpprcpccc',
    'sspprporcprpcc',
    'sppcgrpcorcpcc',
    'sppcrpporcprcc',
    'spcporpcorcpcc'
  ];
  const entries = {
    s:{label:'侦察',interval:1.20,cap:-3}, p:{label:'受压',interval:1,cap:0},
    r:{label:'休整',interval:1.82,cap:-7,delay:3.6},
    c:{label:'波峰',interval:.83,cap:2},
    g:{label:'守卫前哨',interval:.96,cap:0},
    o:{label:'指挥精英',interval:1.14,cap:-2}
  };
  const commanders = [
    [],
    [{wave:7,kind:'lancer',name:'信号指挥兵',hint:'锁线会分叉 · 趁蓄力横移',col:'#ffb18b'}],
    [{wave:9,kind:'anchor',name:'冰锁指挥兵',hint:'击破蓄力核心，或撤出锁定区域',col:'#9feaff'}],
    [{wave:8,kind:'bastion',name:'炉线指挥兵',hint:'打碎外甲，再避开近身震击',col:'#ffd197'}],
    [
      {wave:5,kind:'lobber',name:'裂隙巡界兵',hint:'三处爆区依次落下，别沿排开的雷圈跑',col:'#ffc88e'},
      {wave:9,kind:'conjurer',name:'裂隙指挥兵',hint:'击中施法者，打断援军和裂隙',col:'#f0b9ff'}
    ]
  ];
  const rosterNotes = [
    '基础小怪与耐打小怪。地下是裂泥虫和壳卫。',
    '锁线枪手逼迫横移，震雷投手预锁地面，护盾支援兵保护同伴。',
    '地表重装外甲可破，锁区蓄力可打断。冻晶矿井有自爆虫、壳卫和坑道狙击手。',
    '护盾支援兵会修复同伴，重装震击需要拉开距离。',
    '错峰爆区与重装混编，优先打断封锁和召唤。'
  ];
  const escorts = [
    null,null,['runner','shieldguard','conjurer'],['bomber','shieldguard','bastion'],['drone','lancer','conjurer']
  ];
  const introductions={ '1:3':'lancer','1:6':'lobber','2:4':'bastion','2:8':'anchor' };
  let current=null;

  function at(stage=G.stage,wave=G.wave){
    const code=patterns[stage][wave-1];
    return entries[code];
  }

  function enemyCap(){
    const base = (CampaignBalance.at().cap + at().cap + WaveTypes.at().cap) *
      DIFFICULTY.enemyCap * AdaptiveDirector.cap();
    /* 触屏设备同屏数量收一档，保证三倍刷怪下仍能稳帧 */
    const limit = G.touch ? Math.round(ENEMY_CAP * .75) : ENEMY_CAP;
    return Math.min(limit, Math.max(6, Math.round(base)));
  }

  function routeNote(stage){
    const schedule=commanders[stage].map(c=>'第'+c.wave+'波 · '+c.name).join('、');
    return rosterNotes[stage]+(schedule ? ' '+schedule+'，分别在下一波休整。' : '');
  }

  function beginWave(){
    if(current?.stage===G.stage && current.wave===G.wave) return;
    const spec=commanders[G.stage].find(c=>c.wave===G.wave);
    current={stage:G.stage,wave:G.wave,spawned:0,body:null,down:false,spec};
  }

  function reset(){ current=null; }

  function nextKind(sample){
    beginWave();
    const heavies=G.enemies.filter(e=>!e.dead && CampaignEnemies.rank(e.kind)===3).length;
    const maxRank=at().delay?1:heavies>=(G.stage>=4?3:2)?2:3;
    const intro=current.spawned++===0 && !FieldMaps.underground() && introductions[G.stage+':'+G.wave];
    if(intro && CampaignEnemies.rank(intro)<=maxRank) return intro;
    /* 特殊波次：按兵种倾向加权，62% 的刷怪会落到该波的主题兵种上 */
    const bias=WaveTypes.biasKind(maxRank,(sample+.37)%1);
    if(bias && Math.random()<.62) return bias;
    return CampaignEnemies.kind(G.stage,G.wave,FieldMaps.floorId(),sample,maxRank);
  }

  function update(){
    beginWave();
    if(!current.spec || current.body || current.down || G.waveDur-G.waveT<3.4) return;
    const c=current.spec;
    if(G.enemies.length>=ENEMY_CAP && !cullOldestEnemy()) return;
    const origin=FieldMaps.safePoint(G.p.x+Math.cos(G.p.faceAngle)*177,G.p.y+Math.sin(G.p.faceAngle)*177,28);
    current.body=spawnEnemy(c.kind,origin.x,origin.y,{elite:true,hpMul:.92,commander:c});
    current.body.spawnT=.82;
    banner(c.name,c.hint,1.5);
    SFX.boss();
  }

  function onEnemyDown(e){
    if(current?.body!==e || current.down) return;
    current.down=true;
    if(G.phase==='wave') G.waveT=Math.min(Math.max(0,G.waveT),2.8);
    banner(e.commander.name+' 已击破','下一波休整',1.2);
  }

  function canFinish(){
    beginWave();
    return !current.spec || current.down;
  }

  function commander(){
    return G.phase==='wave' && current?.stage===G.stage && current.wave===G.wave ? current : null;
  }

  function addBossEscort(b){
    const pack=escorts[G.stage];
    if(!pack || b.kind!==SCENES[G.stage].boss || G.bossEncounter?.resumeWave) return;
    for(let i=0;i<pack.length && G.enemies.length<ENEMY_CAP;i++){
      const a=(i*.65+1.1)*Math.PI;
      const pt=FieldMaps.safePoint(b.x+Math.cos(a)*91,b.y+Math.sin(a)*91,26);
      const e=spawnEnemy(pack[i],pt.x,pt.y,{noElite:true,hpMul:.70});
      e.summoner=b;
    }
  }

  return { at, enemyCap, routeNote, beginWave, reset, nextKind, update, onEnemyDown, canFinish, commander, addBossEscort };
})();

const EnemyTactics = (() => {
  function detach(e){
    if(e.ward && e.ward.shieldSource === e) e.ward.shieldSource = null;
    if(e.shieldSource && e.shieldSource.ward === e) e.shieldSource.ward = null;
    e.ward = e.shieldSource = null;
    e.cast = e.press = e.repair = null;
  }

  function supported(e){
    const support = e.shieldSource;
    return support && !support.dead && support.stun <= 0 && support.ward === e &&
      d2(e.x,e.y,support.x,support.y) <= 130 ** 2;
  }

  function interrupt(e,damage){
    if(e.press?.breakLeft>0 && damage>0){
      e.press.breakLeft-=damage;
      if(e.press.breakLeft<=0){
        e.press=null;
        e.stun=Math.max(.9,e.stun);
        e.tacticsCd=3.3;
        spark(e.x,e.y,6,'#a7eeff',85);
        floatText(e.x,e.y,'蓄力打断','#a7eeff',true);
      }
    }
    if(e.repair){
      e.repair=null;
      e.repairCd=3.2;
    }
    if(e.cast){
      e.cast = null;
      e.tacticsCd = Math.max(e.tacticsCd, 2.2);
      spark(e.x,e.y,4,'#f6bfff',58);
    }
  }

  function absorb(e,damage){
    if(!(e.plate>0)) return damage;
    const blocked=Math.min(e.plate,damage);
    e.plate-=blocked;
    if(e.plate<=0){
      e.stun=Math.max(e.stun || 0,1.30);
      e.press=null;
      e.tacticsCd=Math.max(e.tacticsCd,1.8);
      floatText(e.x,e.y,'外甲破裂','#ffe09b',true);
      spark(e.x,e.y,7,'#ffe09b',80);
    }
    return damage-blocked;
  }

  function guardMotion(e, dt){
    if(e.stun > 0){ detach(e); return {stop:true}; }
    e.tacticsCd -= dt;
    const old = e.ward;
    if(old?.dead || (old && d2(e.x,e.y,old.x,old.y) > 145 ** 2)) detach(e);
    if(e.tacticsCd <= 0){
      e.tacticsCd = .42;
      let best = null, bd = 148 ** 2;
      for(const ally of G.enemies){
        if(ally === e || ally.dead || ally.spawnT > 0 || ally.kind === 'shieldguard' ||
          (ally.shieldSource && ally.shieldSource !== e)) continue;
        const dd = d2(e.x,e.y,ally.x,ally.y);
        if(dd < bd && FieldMaps.lineOpen(e.x,e.y,ally.x,ally.y)){
          best = ally;
          bd = dd;
        }
      }
      if(best !== e.ward) detach(e);
      if(best){
        e.ward = best;
        best.shieldSource = e;
      }
    }
    if(e.ward && G.stage>=2 && d2(e.x,e.y,e.ward.x,e.ward.y)<108**2){
      const ally=e.ward;
      e.repairCd=(e.repairCd || 0)-dt;
      if(e.repair){
        e.repair.left-=dt;
        if(e.repair.left<=0){
          if(e.repair.target===ally && !ally.dead){
            ally.hp=Math.min(ally.maxHp,ally.hp+Math.min(45,ally.maxHp*.17));
            ally.repaired=true;
            spark(ally.x,ally.y,5,'#aef5a8',72);
          }
          e.repair=null;
          e.repairCd=5.5;
        }
      } else if(e.repairCd<=0 && !ally.repaired && ally.hp<=ally.maxHp*.66){
        e.repair={target:ally,left:1};
      }
      if(e.repair) return {stop:true};
    } else if(e.repair) interrupt(e);
    if(e.ward) return {x:e.ward.x,y:e.ward.y,keep:48};
    return null;
  }

  function summonMotion(e, dt, distance){
    if(e.stun > 0){ interrupt(e); return {stop:true}; }
    e.tacticsCd -= dt;
    if(e.cast){
      e.cast.left -= dt;
      if(e.cast.left <= 0){
        const point = e.cast;
        e.cast = null;
        e.tacticsCd = 4.25;
        if(G.enemies.length < ThreatPacing.enemyCap()){
          spawnEnemy('runner',point.x,point.y,{noElite:true,noReward:true,waveOrigin:e.waveOrigin}).summoner = e;
          if(e.commander) addZone(point.x,point.y,44,e.dmg,.88);
        }
      }
      return {stop:true};
    }
    if(e.tacticsCd <= 0 && distance <= 260 && distance >= 62 &&
      FieldMaps.lineOpen(e.x,e.y,G.p.x,G.p.y) && G.enemies.length < ThreatPacing.enemyCap() &&
      !G.enemies.some(ally => ally.summoner === e && !ally.dead)){
      const direction = Math.atan2(G.p.y-e.y,G.p.x-e.x);
      const x = clamp(e.x + Math.cos(direction) * 46,45,ARENA.w-45);
      const y = clamp(e.y + Math.sin(direction) * 46,45,ARENA.h-45);
      if(!FieldMaps.blocksMovement(x,y,12)) e.cast = {x,y,left:1.12};
    }
    return e.cast ? {stop:true} : {x:G.p.x,y:G.p.y,keep:156};
  }

  function pressureMotion(e,dt,distance){
    const heavy=e.kind==='bastion';
    if(e.stun>0){ e.press=null; return {stop:true}; }
    e.tacticsCd-=dt;
    const a=e.press;
    if(a){
      a.left-=dt;
      if(a.left<=0){
        e.press=null;
        e.tacticsCd=e.commander?2.0:3.2;
        if(heavy){
          if(a.wave) addWave(a.x,a.y,a.radius,e.dmg,'#ffad69');
          else resolveGroundBlast(a.x,a.y,a.radius,e.dmg);
        } else {
          for(const ray of a.rays) addBeam(a.x,a.y,ray.angle,ray.reach,a.width,e.dmg,.36,0,'#ffa184');
          SFX.heavy();
        }
      }
      return {stop:true};
    }
    if(e.tacticsCd<=0 && (heavy ? distance<105 : distance>70 && distance<295)){
      const x=e.x,y=e.y;
      const angle=Math.atan2(G.p.y-y,G.p.x-x);
      const wind=heavy?1.04:.87;
      if(heavy){
        const wave=!!e.commander && e.plate<=0;
        e.press={x,y,wind,left:wind,radius:wave?144:e.commander?104:82,wave};
      } else if(FieldMaps.lineOpen(x,y,G.p.x,G.p.y)){
        const shots=e.commander&&e.hp<e.maxHp*.55?[-.22,0,.22]:[0];
        const rays=shots.map(off=>{
          const line=angle+off;
          const reach=FieldMaps.dashDistance(e,Math.cos(line),Math.sin(line),330,6);
          return {angle:line,reach};
        });
        e.press={x,y,wind,left:wind,rays,width:e.commander?12:8};
      }
    }
    if(e.press) return {stop:true};
    return heavy?null:{x:G.p.x,y:G.p.y,keep:162};
  }

  function motion(e, dt, distance){
    if(e.kind==='lobber' || e.kind==='anchor') return areaMotion(e,dt,distance);
    if(e.kind === 'shieldguard') return guardMotion(e,dt);
    if(e.kind === 'conjurer') return summonMotion(e,dt,distance);
    if(e.kind==='lancer' || e.kind==='bastion') return pressureMotion(e,dt,distance);
    return null;
  }

  function areaMotion(e,dt,distance){
    const heavy=e.kind==='anchor';
    if(e.stun>0){e.press=null;return {stop:true};}
    e.tacticsCd-=dt;
    const a=e.press;
    if(a){
      a.left-=dt;
      if(a.left<=0){
        e.press=null;
        e.tacticsCd=heavy?4.9:3.8;
        a.areas.forEach(({x,y,r},i)=>{
          if(heavy) addPool(x,y,r,e.dmg,.5+(e.commander?2.4:1.9),'rgba(65,180,215,.54)');
          else addZone(x,y,r,e.dmg,.52+i*.24);
        });
        spark(e.x,e.y,5,a.color,74);
        SFX.heavy();
      }
      return {stop:true};
    }
    if(e.tacticsCd<=0 && distance>=76 && distance<=325 && FieldMaps.lineOpen(e.x,e.y,G.p.x,G.p.y)){
      const p=G.p, angle=Math.atan2(p.y-e.y,p.x-e.x);
      const width=heavy?121:55, radius=heavy?(e.commander?66:60):39;
      const offsets=heavy?(e.commander?[0,1]:[0]):e.commander?[-1,0,1]:[-.60,.60];
      const areas=offsets.map(side=>({
        x:clamp(p.x-Math.sin(angle)*width*side,38,ARENA.w-38),
        y:clamp(p.y+Math.cos(angle)*width*side,44,ARENA.h-38),r:radius
      }));
      const wind=heavy?1.28:.68, required=heavy?(e.commander?64:43):0;
      e.press={areas,wind,left:wind,breakLeft:required,breakGoal:required,color:heavy?'#9be8ff':'#ffd28d'};
      return {stop:true};
    }
    return {x:G.p.x,y:G.p.y,keep:heavy?168:217};
  }

  function draw(g){
    for(const e of G.enemies){
      if(e.dead || e.spawnT > 0) continue;
      if(e.press){
        const a=e.press;
        if(a.rays){
          for(const ray of a.rays) drawEncounterLane(g,a.x,a.y,a.x+Math.cos(ray.angle)*ray.reach,
            a.y+Math.sin(ray.angle)*ray.reach,a.width,'#ff9b77',true,BULLET_H);
        } else if(a.areas){
          for(const pt of a.areas) drawHazardCircle(g,pt.x,pt.y,pt.r,a.color,1-a.left/a.wind);
        } else drawHazardCircle(g,a.x,a.y,a.radius,'#ffc377',1-a.left/a.wind);
      }
      if(e.kind==='anchor' || e.kind==='lobber'){
        const x=SX(e.x),y=SY(e.y)-e.h*.6;
        g.save();g.translate(x,y);
        g.strokeStyle='#182637';g.lineWidth=2.2;g.fillStyle=e.kind==='anchor'?'#9be8ff':'#ffd28d';
        g.beginPath();
        if(e.kind==='anchor'){
          g.moveTo(0,-8);g.lineTo(7,0);g.lineTo(0,7);g.lineTo(-7,0);
        } else {
          g.moveTo(-6,-4);g.lineTo(6,-4);g.lineTo(5,4);g.lineTo(-5,4);
        }
        g.closePath();g.fill();g.stroke();
        if(e.press?.breakGoal>0){
          g.fillStyle='#263642';g.fillRect(-12,-14,24,4);
          g.fillStyle='#c3f8ff';g.fillRect(-12,-14,24*e.press.breakLeft/e.press.breakGoal,3);
        }
        g.restore();
      }
      if(e.kind==='bastion' && e.plate>0){
        const x=SX(e.x), y=SY(e.y)-e.h*.52;
        g.save();
        g.translate(x,y);
        g.fillStyle='#45362b';
        g.strokeStyle='#ffcd86';
        g.lineWidth=1.6;
        g.beginPath();g.moveTo(-e.r*.84,-5);g.lineTo(0,-9);g.lineTo(e.r*.84,-5);
        g.lineTo(e.r*.62,6);g.lineTo(0,12);g.lineTo(-e.r*.62,6);g.closePath();g.fill();g.stroke();
        g.fillStyle='#ffdf9c';
        g.fillRect(-e.r*.55,0,e.r*1.1*e.plate/e.maxPlate,3);
        g.restore();
      }
      if(e.kind === 'shieldguard' || e.kind === 'conjurer' || e.kind==='lancer'){
        const x=SX(e.x), y=SY(e.y)-e.h;
        g.save();
        g.strokeStyle='#142028'; g.lineWidth=2.5;
        g.fillStyle=e.kind==='shieldguard'?'#85edd7':e.kind==='lancer'?'#ffc292':'#edb0ff';
        g.beginPath();
        if(e.kind === 'shieldguard'){
          g.moveTo(x-5,y-6);g.lineTo(x+5,y-6);g.lineTo(x+4,y);g.lineTo(x,y+3);g.lineTo(x-4,y);
        } else {
          g.moveTo(x,y-8);g.lineTo(x+5,y-3);g.lineTo(x,y+2);g.lineTo(x-5,y-3);
        }
        g.closePath();g.stroke();g.fill();g.restore();
      }
      if(e.ward && supported(e.ward)){
        const ally=e.ward, x=SX(ally.x),y=SY(ally.y);
        g.save();
        g.strokeStyle='#91e9d4';
        g.globalAlpha=.58;g.lineWidth=1.35;g.setLineDash([3,2]);
        g.beginPath();g.moveTo(SX(e.x),SY(e.y)-14);g.lineTo(x,y-14);g.stroke();
        g.setLineDash([]);g.globalAlpha=.92;g.lineWidth=1.8;
        g.beginPath();g.ellipse(x,y-9,ally.r+3,5,0,0,TAU);g.stroke();g.restore();
      }
      if(e.repair && !e.repair.target.dead){
        const ally=e.repair.target;
        drawHazardCircle(g,ally.x,ally.y,ally.r+8,'#aef5a8',1-e.repair.left);
        const x=SX(ally.x), y=SY(ally.y)-ally.h-7;
        g.save();
        g.fillStyle='#baf6aa';g.fillRect(x-5,y-1,10,2);g.fillRect(x-1,y-5,2,10);
        g.restore();
      }
      if(e.cast) drawHazardCircle(g,e.cast.x,e.cast.y,23,'#e9a4ff',1-e.cast.left/1.12);
      if(e.commander){
        const x=SX(e.x), y=SY(e.y)-e.h-14;
        g.save();
        g.strokeStyle='#211918';g.fillStyle=e.commander.col;g.lineWidth=2.5;
        g.beginPath();g.moveTo(x-7,y-4);g.lineTo(x,y+3);g.lineTo(x+7,y-4);
        g.lineTo(x+6,y+2);g.lineTo(x,y+7);g.lineTo(x-6,y+2);g.closePath();g.stroke();g.fill();
        g.restore();
      }
    }
  }

  return { detach, supported, interrupt, absorb, motion, draw };
})();
